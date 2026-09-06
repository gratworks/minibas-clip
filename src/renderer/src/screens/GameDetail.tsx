import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventRow, EventType, GameSummary, Player, Video } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { VideoPlayer, type VideoPlayerHandle } from '../components/VideoPlayer'
import { Timeline } from '../components/Timeline'
import { EventList } from '../components/EventList'
import { ExportDialog } from '../components/ExportDialog'
import { LineupGrid } from '../components/LineupGrid'
import { useJobProgress } from '../hooks/useJobProgress'
import { seasonForDate } from '../lib/season'

const PROXY_STATUS_LABEL: Record<Video['proxyStatus'], string> = {
  none: '未変換',
  running: '変換中',
  done: '準備完了',
  error: 'エラー'
}

const QUARTERS = [1, 2, 3, 4]

export function GameDetail({ gameId }: { gameId: number }): JSX.Element {
  const backToGames = useAppStore((s) => s.backToGames)
  const openStats = useAppStore((s) => s.openStats)
  const selectedVideoId = useAppStore((s) => s.selectedVideoId)
  const selectVideo = useAppStore((s) => s.selectVideo)

  const [game, setGame] = useState<GameSummary | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [importing, setImporting] = useState(false)
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [quarter, setQuarter] = useState(1)
  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)
  const [lastCreatedId, setLastCreatedId] = useState<number | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [appearances, setAppearances] = useState<Set<string>>(new Set())
  const [editingGame, setEditingGame] = useState(false)
  const [gameDraft, setGameDraft] = useState({ date: '', opponent: '', venue: '' })
  const jobs = useJobProgress()

  const playerRef = useRef<VideoPlayerHandle>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const quarterInitRef = useRef(false)

  const reload = (): void => {
    window.api.invoke('games:get', { id: gameId }).then(setGame)
    window.api.invoke('videos:listByGame', { gameId }).then((list) => {
      setVideos(list)
      if (!selectedVideoId && list.length > 0) selectVideo(list[0].id)
    })
    window.api.invoke('events:listByGame', { gameId }).then((list) => {
      setEvents(list)
      // 中断して後で再開した時にQ1へ黙って戻ってしまわないよう、開いた時だけ
      // 最後にタグ付けしたイベントのクォーターを引き継ぐ（以降のタグ付けでは上書きしない）
      if (!quarterInitRef.current) {
        quarterInitRef.current = true
        const lastEvent = list.reduce<EventRow | null>(
          (max, ev) => (max === null || ev.id > max.id ? ev : max),
          null
        )
        if (lastEvent?.quarter) setQuarter(lastEvent.quarter)
      }
    })
    window.api
      .invoke('lineup:listByGame', { gameId })
      .then((list) => setAppearances(new Set(list.map((a) => `${a.playerId}-${a.quarter}`))))
  }

  useEffect(reload, [gameId])

  useEffect(() => {
    window.api.invoke('eventTypes:list', undefined).then(setEventTypes)
  }, [])

  // 背番号・学年はシーズン依存のため、試合の season が分かってから取得する
  useEffect(() => {
    if (!game) return
    window.api.invoke('players:list', { season: game.season }).then(setPlayers)
  }, [game?.season])

  // proxy変換ジョブが完了/失敗したら動画一覧を再取得してステータスを反映する
  useEffect(() => {
    const proxyDone = Object.values(jobs).some(
      (j) => j.kind === 'proxy' && (j.status === 'done' || j.status === 'error')
    )
    if (proxyDone) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs])

  const handleImport = async (): Promise<void> => {
    setImporting(true)
    try {
      await window.api.invoke('videos:import', { gameId })
      reload()
    } finally {
      setImporting(false)
    }
  }

  const startEditGame = (): void => {
    if (!game) return
    setGameDraft({ date: game.date, opponent: game.opponent ?? '', venue: game.venue ?? '' })
    setEditingGame(true)
  }

  const saveGame = async (): Promise<void> => {
    if (!gameDraft.date) return
    await window.api.invoke('games:update', {
      id: gameId,
      patch: {
        date: gameDraft.date,
        opponent: gameDraft.opponent || null,
        venue: gameDraft.venue || null,
        season: seasonForDate(gameDraft.date)
      }
    })
    setEditingGame(false)
    reload()
  }

  const handleRebuildProxy = async (videoId: number): Promise<void> => {
    await window.api.invoke('videos:rebuildProxy', { id: videoId })
    reload()
  }

  const handleRemoveVideo = async (videoId: number): Promise<void> => {
    if (!window.confirm('この動画を削除しますか？（この動画に打ったタグ・イベントも一緒に削除されます）')) return
    await window.api.invoke('videos:remove', { id: videoId })
    if (selectedVideoId === videoId) {
      const remaining = videos.filter((v) => v.id !== videoId)
      selectVideo(remaining[0]?.id ?? null)
    }
    reload()
  }

  const selectedVideo = videos.find((v) => v.id === selectedVideoId) ?? null
  const activePlayers = useMemo(() => players.filter((p) => p.active), [players])
  const eventTypesById = useMemo(() => {
    const map = new Map<number, EventType>()
    eventTypes.forEach((et) => map.set(et.id, et))
    return map
  }, [eventTypes])
  const colorFor = (eventTypeId: number): string => eventTypesById.get(eventTypeId)?.color ?? '#666666'

  const videoEvents = useMemo(
    () => events.filter((ev) => ev.videoId === selectedVideoId),
    [events, selectedVideoId]
  )

  const handleTag = async (et: EventType): Promise<void> => {
    if (!selectedVideo || selectedVideo.proxyStatus !== 'done') return
    const tSec = playerRef.current?.getCurrentTime() ?? 0
    const clipInSec = Math.max(0, tSec - et.preSec)
    const clipOutSec = durationSec > 0 ? Math.min(durationSec, tSec + et.postSec) : tSec + et.postSec

    const created = await window.api.invoke('events:create', {
      gameId,
      videoId: selectedVideo.id,
      eventTypeId: et.id,
      playerId: null,
      tSec,
      quarter,
      note: null,
      clipInSec,
      clipOutSec
    })
    setEvents((prev) => [...prev, created].sort((a, b) => a.tSec - b.tSec))
    setLastCreatedId(created.id)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.repeat) return
      if (!selectedVideo || selectedVideo.proxyStatus !== 'done') return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      const et = eventTypes.find((t) => t.enabled && t.keyBinding?.toUpperCase() === e.key.toUpperCase())
      if (et) {
        e.preventDefault()
        void handleTag(et)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideo, eventTypes, quarter, durationSec, gameId])

  const handleAssignPlayer = async (eventId: number, playerId: number | null): Promise<void> => {
    const updated = await window.api.invoke('events:update', { id: eventId, patch: { playerId } })
    setEvents((prev) => prev.map((ev) => (ev.id === eventId ? updated : ev)))
  }

  const handleAdjustClip = async (ev: EventRow, deltaInSec: number, deltaOutSec: number): Promise<void> => {
    const clipInSec = Math.max(0, (ev.clipInSec ?? ev.tSec) + deltaInSec)
    const clipOutSec = Math.max(clipInSec, (ev.clipOutSec ?? ev.tSec) + deltaOutSec)
    const updated = await window.api.invoke('events:update', { id: ev.id, patch: { clipInSec, clipOutSec } })
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? updated : e)))
  }

  const handleToggleLineup = async (playerId: number, quarter: number): Promise<void> => {
    const key = `${playerId}-${quarter}`
    const result = await window.api.invoke('lineup:toggle', { gameId, playerId, quarter })
    setAppearances((prev) => {
      const next = new Set(prev)
      if (result.played) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const handleExportClip = async (eventId: number): Promise<void> => {
    await window.api.invoke('export:clip', { eventId })
  }

  const handleDeleteEvent = async (eventId: number): Promise<void> => {
    await window.api.invoke('events:delete', { id: eventId })
    setEvents((prev) => prev.filter((ev) => ev.id !== eventId))
  }

  const handleSeekEvent = (ev: EventRow): void => {
    if (ev.videoId === selectedVideoId) {
      playerRef.current?.seekTo(ev.tSec)
    } else {
      pendingSeekRef.current = ev.tSec
      selectVideo(ev.videoId)
    }
  }

  const handleDurationChange = (d: number): void => {
    setDurationSec(d)
    if (pendingSeekRef.current !== null) {
      playerRef.current?.seekTo(pendingSeekRef.current)
      pendingSeekRef.current = null
    }
  }

  const statTypes = eventTypes.filter((t) => t.category === 'stat' && t.enabled)
  const highlightTypes = eventTypes.filter((t) => t.category === 'highlight' && t.enabled)
  const isVideoReady = selectedVideo?.proxyStatus === 'done'

  return (
    <div className="max-w-[1600px] mx-auto p-8">
      <div className="flex items-center justify-between mb-4">
        <button onClick={backToGames} className="text-sm text-slate-400 hover:text-slate-200">
          ← 試合一覧へ戻る
        </button>
        <button onClick={openStats} className="text-sm text-slate-400 hover:text-slate-200">
          スタッツを見る →
        </button>
      </div>

      {game && !editingGame && (
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-xl font-bold">
            {game.date} vs {game.opponent ?? '(未設定)'}
          </h1>
          <button onClick={startEditGame} className="text-xs px-2 py-1 rounded bg-court-border hover:bg-slate-600">
            編集
          </button>
        </div>
      )}

      {game && editingGame && (
        <div className="bg-court-panel border border-court-accent rounded-lg p-4 mb-6 flex flex-wrap gap-3 items-end">
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            日付
            <input
              type="date"
              value={gameDraft.date}
              onChange={(e) => setGameDraft((d) => ({ ...d, date: e.target.value }))}
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            対戦相手
            <input
              value={gameDraft.opponent}
              onChange={(e) => setGameDraft((d) => ({ ...d, opponent: e.target.value }))}
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            会場
            <input
              value={gameDraft.venue}
              onChange={(e) => setGameDraft((d) => ({ ...d, venue: e.target.value }))}
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <button onClick={saveGame} className="px-3 py-1.5 rounded bg-court-accent text-sm font-medium">
            保存
          </button>
          <button
            onClick={() => setEditingGame(false)}
            className="px-3 py-1.5 rounded bg-court-border hover:bg-slate-600 text-sm"
          >
            キャンセル
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_320px] gap-6">
        <div className="flex flex-col gap-4">
          <div className="bg-court-panel border border-court-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">動画</h2>
              <button
                onClick={handleImport}
                disabled={importing}
                className="text-xs px-2 py-1 rounded bg-court-accent disabled:opacity-50"
              >
                {importing ? '取込中...' : '+ 動画を追加'}
              </button>
            </div>
            {videos.length === 0 && <p className="text-slate-500 text-xs">動画がありません</p>}
            <ul className="space-y-1">
              {videos.map((v) => (
                <li
                  key={v.id}
                  className={`text-xs px-2 py-2 rounded border ${
                    v.id === selectedVideoId
                      ? 'border-court-accent bg-court-border'
                      : 'border-transparent hover:bg-court-border'
                  }`}
                >
                  <button onClick={() => selectVideo(v.id)} className="w-full text-left">
                    <div className="truncate">{v.srcPath.split(/[\\/]/).pop()}</div>
                  </button>
                  <div className="text-slate-500 mt-0.5 flex items-center gap-2">
                    {PROXY_STATUS_LABEL[v.proxyStatus]}
                    {v.proxyStatus === 'error' && (
                      <button onClick={() => handleRebuildProxy(v.id)} className="text-court-accent hover:underline">
                        再変換
                      </button>
                    )}
                    <button onClick={() => handleRemoveVideo(v.id)} className="ml-auto text-red-400 hover:underline">
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <LineupGrid players={activePlayers} appearances={appearances} onToggle={handleToggleLineup} />
        </div>

        <div>
          {selectedVideo ? (
            <>
              <VideoPlayer
                key={selectedVideo.id}
                ref={playerRef}
                video={selectedVideo}
                onTimeUpdate={setCurrentTimeSec}
                onDurationChange={handleDurationChange}
              />
              <Timeline
                durationSec={durationSec}
                currentTimeSec={currentTimeSec}
                events={videoEvents}
                colorFor={colorFor}
                onSeek={(sec) => playerRef.current?.seekTo(sec)}
              />
            </>
          ) : (
            <div className="aspect-video bg-court-panel border border-court-border rounded-lg flex items-center justify-center text-slate-500 text-sm">
              動画を追加してください
            </div>
          )}

          <div className="bg-court-panel border border-court-border rounded-lg p-3 mt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-400">クォーター</span>
              {QUARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuarter(q)}
                  className={`text-xs w-7 h-7 rounded ${
                    quarter === q ? 'bg-court-accent text-black' : 'bg-court-border hover:bg-slate-600'
                  }`}
                >
                  Q{q}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {statTypes.map((et) => (
                <button
                  key={et.id}
                  onClick={() => handleTag(et)}
                  disabled={!isVideoReady}
                  className="text-xs px-2 py-1 rounded font-medium text-black disabled:opacity-40"
                  style={{ backgroundColor: et.color }}
                  title={`キー: ${et.keyBinding}`}
                >
                  {et.keyBinding} {et.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {highlightTypes.map((et) => (
                <button
                  key={et.id}
                  onClick={() => handleTag(et)}
                  disabled={!isVideoReady}
                  className="text-xs px-2 py-1 rounded font-medium text-black disabled:opacity-40"
                  style={{ backgroundColor: et.color }}
                  title={`キー: ${et.keyBinding}`}
                >
                  {et.keyBinding} {et.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-court-panel border border-court-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">イベント一覧（{events.length}）</h2>
            <button
              onClick={() => setShowExportDialog(true)}
              disabled={events.length === 0}
              className="text-xs px-2 py-1 rounded bg-court-accent disabled:opacity-40"
            >
              ハイライトを作る
            </button>
          </div>
          <EventList
            events={events}
            players={activePlayers}
            activeVideoId={selectedVideoId}
            colorFor={colorFor}
            focusEventId={lastCreatedId}
            onSeek={handleSeekEvent}
            onAssignPlayer={handleAssignPlayer}
            onAdjustClip={handleAdjustClip}
            onExportClip={handleExportClip}
            onDelete={handleDeleteEvent}
          />
        </div>
      </div>

      {showExportDialog && (
        <ExportDialog
          events={events}
          players={activePlayers}
          colorFor={colorFor}
          onClose={() => setShowExportDialog(false)}
        />
      )}
    </div>
  )
}
