import { useEffect, useState } from 'react'
import type { GameSummary } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { seasonForDate, seasonLabel } from '../lib/season'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function Games(): JSX.Element {
  const [games, setGames] = useState<GameSummary[]>([])
  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(todayStr())
  const [opponent, setOpponent] = useState('')
  const [venue, setVenue] = useState('')
  const openGame = useAppStore((s) => s.openGame)

  const reload = (): void => {
    window.api.invoke('games:list', undefined).then(setGames)
  }

  useEffect(reload, [])

  const createGame = async (): Promise<void> => {
    await window.api.invoke('games:create', {
      date,
      opponent: opponent || null,
      venue: venue || null,
      ourScore: null,
      oppScore: null,
      season: seasonForDate(date),
      note: null
    })
    setOpponent('')
    setVenue('')
    setShowForm(false)
    reload()
  }

  const deleteGame = async (id: number): Promise<void> => {
    if (!window.confirm('この試合を削除しますか？（動画・タグ付けしたイベント・出場記録もすべて削除されます）')) return
    await window.api.invoke('games:delete', { id })
    reload()
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">試合一覧</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 rounded bg-court-accent text-sm font-medium hover:opacity-90"
        >
          + 新規試合
        </button>
      </div>

      {showForm && (
        <div className="bg-court-panel border border-court-border rounded-lg p-4 mb-6 flex flex-wrap gap-3 items-end">
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            日付
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            対戦相手
            <input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            会場
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <button onClick={createGame} className="px-3 py-1.5 rounded bg-court-accent text-sm font-medium">
            作成
          </button>
        </div>
      )}

      {games.length === 0 ? (
        <p className="text-slate-400 text-sm">まだ試合が登録されていません。「+ 新規試合」から追加してください。</p>
      ) : (
        <ul className="space-y-2">
          {games.map((g, i) => {
            const prevSeason = i > 0 ? games[i - 1].season : null
            const showDivider = g.season !== prevSeason
            return (
              <li key={g.id}>
                {showDivider && (
                  <div className="flex items-center gap-3 mt-6 mb-2 first:mt-0">
                    <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                      {seasonLabel(g.season)}
                    </span>
                    <div className="h-px bg-court-border flex-1" />
                  </div>
                )}
                <div className="relative">
                  <button
                    onClick={() => openGame(g.id)}
                    className="w-full text-left bg-court-panel border border-court-border rounded-lg p-4 hover:border-court-accent transition-colors"
                  >
                    <div className="flex justify-between pr-12">
                      <span className="font-medium">
                        {g.date} vs {g.opponent ?? '(未設定)'}
                      </span>
                      <span className="text-slate-400 text-sm">
                        動画{g.videoCount} / イベント{g.eventCount}
                      </span>
                    </div>
                    {g.venue && <p className="text-slate-500 text-sm mt-1">{g.venue}</p>}
                  </button>
                  <button
                    onClick={() => deleteGame(g.id)}
                    className="absolute top-4 right-4 text-xs text-red-400 hover:text-red-300"
                  >
                    削除
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
