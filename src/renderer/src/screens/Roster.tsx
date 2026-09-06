import { useEffect, useMemo, useState } from 'react'
import type { Player } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { seasonForDate, seasonLabel } from '../lib/season'

interface PlayerDraft {
  number: string
  name: string
  kana: string
  grade: string
}

const EMPTY_DRAFT: PlayerDraft = { number: '', name: '', kana: '', grade: '' }

export function Roster(): JSX.Element {
  const backToGames = useAppStore((s) => s.backToGames)
  const currentSeason = useMemo(() => seasonForDate(new Date().toISOString().slice(0, 10)), [])

  const [season, setSeason] = useState(currentSeason)
  const [knownSeasons, setKnownSeasons] = useState<string[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [kana, setKana] = useState('')
  const [grade, setGrade] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<PlayerDraft>(EMPTY_DRAFT)
  const [copyFromSeason, setCopyFromSeason] = useState('')
  const [copying, setCopying] = useState(false)
  const [copyResult, setCopyResult] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const visiblePlayers = useMemo(() => players.filter((p) => p.active), [players])
  const hiddenPlayers = useMemo(() => players.filter((p) => !p.active), [players])

  const seasonOptions = useMemo(() => {
    const set = new Set([currentSeason, ...knownSeasons])
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [currentSeason, knownSeasons])

  const otherSeasons = seasonOptions.filter((s) => s !== season)

  const reloadPlayers = (): void => {
    window.api.invoke('players:list', { season }).then(setPlayers)
  }

  useEffect(reloadPlayers, [season])

  useEffect(() => {
    window.api.invoke('seasons:list', undefined).then(setKnownSeasons)
  }, [])

  const addPlayer = async (): Promise<void> => {
    if (!number || !name) return
    await window.api.invoke('players:create', {
      number: Number(number),
      name,
      kana: kana || null,
      grade: grade ? Number(grade) : null,
      active: 1,
      season
    })
    setNumber('')
    setName('')
    setKana('')
    setGrade('')
    reloadPlayers()
  }

  const toggleActive = async (p: Player): Promise<void> => {
    await window.api.invoke('players:update', { id: p.id, season, patch: { active: p.active ? 0 : 1 } })
    reloadPlayers()
  }

  const removePlayer = async (id: number): Promise<void> => {
    if (!window.confirm('この選手を削除しますか？（全シーズンの記録が削除されます。過去のイベントの選手割当も外れます）')) return
    await window.api.invoke('players:delete', { id })
    reloadPlayers()
  }

  const startEdit = (p: Player): void => {
    setEditingId(p.id)
    setDraft({
      number: String(p.number),
      name: p.name,
      kana: p.kana ?? '',
      grade: p.grade !== null ? String(p.grade) : ''
    })
  }

  const cancelEdit = (): void => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

  const saveEdit = async (id: number): Promise<void> => {
    if (!draft.number || !draft.name) return
    await window.api.invoke('players:update', {
      id,
      season,
      patch: {
        number: Number(draft.number),
        name: draft.name,
        kana: draft.kana || null,
        grade: draft.grade ? Number(draft.grade) : null
      }
    })
    setEditingId(null)
    reloadPlayers()
  }

  const handleCopyForward = async (): Promise<void> => {
    const from = copyFromSeason || otherSeasons[0]
    if (!from) return
    setCopying(true)
    setCopyResult(null)
    try {
      const result = await window.api.invoke('players:copySeasonForward', {
        fromSeason: from,
        toSeason: season
      })
      setCopyResult(result.copied > 0 ? `${result.copied}人コピーしました` : '対象がありませんでした（既にコピー済みの可能性があります）')
      if (result.copied > 0) reloadPlayers()
    } finally {
      setCopying(false)
      setTimeout(() => setCopyResult(null), 4000)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <button onClick={backToGames} className="text-sm text-slate-400 hover:text-slate-200 mb-4">
        ← 試合一覧へ戻る
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold">選手管理</h1>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>シーズン</span>
          <button
            onClick={() => setSeason(String(Number(season) - 1))}
            className="px-2 py-1 rounded bg-court-border hover:bg-slate-600 text-slate-100"
          >
            ◀
          </button>
          <span className="text-slate-100 font-medium w-24 text-center">{seasonLabel(season)}</span>
          <button
            onClick={() => setSeason(String(Number(season) + 1))}
            className="px-2 py-1 rounded bg-court-border hover:bg-slate-600 text-slate-100"
          >
            ▶
          </button>
          {season !== currentSeason && (
            <button onClick={() => setSeason(currentSeason)} className="underline hover:text-slate-200">
              今シーズンに戻る
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 -mt-4 mb-4">
        背番号・学年はシーズン（4月〜翌3月）ごとに記録されます。氏名・ふりがなは共通です。
      </p>

      {otherSeasons.length > 0 && (
        <div className="bg-court-panel border border-court-border rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">名簿をコピー:</span>
          <select
            value={copyFromSeason || otherSeasons[0]}
            onChange={(e) => setCopyFromSeason(e.target.value)}
            className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
          >
            {otherSeasons.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>
          <span className="text-slate-400">
            → {seasonLabel(season)}（学年
            {(() => {
              const delta = Number(season) - Number(copyFromSeason || otherSeasons[0])
              return delta > 0 ? `+${delta}` : delta
            })()}
            で反映・既存選手/非表示の選手はスキップ）
          </span>
          {copyResult && <span className="text-slate-400">{copyResult}</span>}
          <button
            onClick={handleCopyForward}
            disabled={copying}
            className="ml-auto px-2 py-1 rounded bg-court-accent font-medium disabled:opacity-50"
          >
            {copying ? 'コピー中...' : 'コピーする'}
          </button>
        </div>
      )}

      <div className="bg-court-panel border border-court-border rounded-lg p-4 mb-6 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col text-xs text-slate-400 gap-1 w-20">
          背番号
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            type="number"
            className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400 gap-1">
          氏名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400 gap-1">
          ふりがな
          <input
            value={kana}
            onChange={(e) => setKana(e.target.value)}
            className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400 gap-1 w-16">
          学年
          <input
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            type="number"
            className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
          />
        </label>
        <button onClick={addPlayer} className="px-3 py-1.5 rounded bg-court-accent text-sm font-medium">
          追加
        </button>
      </div>

      {visiblePlayers.length === 0 ? (
        <p className="text-slate-400 text-sm">まだ選手が登録されていません。</p>
      ) : (
        <ul className="space-y-2">{visiblePlayers.map((p) => renderRow(p))}</ul>
      )}

      {hiddenPlayers.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowHidden((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            {showHidden ? '非表示の選手を隠す' : `非表示の選手を見る（${hiddenPlayers.length}）`}
          </button>
          {showHidden && <ul className="space-y-2 mt-3">{hiddenPlayers.map((p) => renderRow(p))}</ul>}
        </div>
      )}
    </div>
  )

  function renderRow(p: Player): JSX.Element {
    if (editingId === p.id) {
      return (
        <li
          key={p.id}
          className="bg-court-panel border border-court-accent rounded-lg p-3 flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col text-xs text-slate-400 gap-1 w-16">
            背番号
            <input
              value={draft.number}
              onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
              type="number"
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            氏名
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            ふりがな
            <input
              value={draft.kana}
              onChange={(e) => setDraft((d) => ({ ...d, kana: e.target.value }))}
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-400 gap-1 w-14">
            学年
            <input
              value={draft.grade}
              onChange={(e) => setDraft((d) => ({ ...d, grade: e.target.value }))}
              type="number"
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            />
          </label>
          <button onClick={() => saveEdit(p.id)} className="text-xs px-2 py-1.5 rounded bg-court-accent font-medium">
            保存
          </button>
          <button onClick={cancelEdit} className="text-xs px-2 py-1.5 rounded bg-court-border hover:bg-slate-600">
            キャンセル
          </button>
        </li>
      )
    }

    return (
      <li
        key={p.id}
        className={`bg-court-panel border border-court-border rounded-lg p-3 flex items-center gap-3 ${
          p.active ? '' : 'opacity-50'
        }`}
      >
        <span className="w-8 text-center font-mono text-court-accent">{p.number}</span>
        <span className="flex-1">
          {p.name}
          {p.kana && <span className="text-slate-500 text-xs ml-2">{p.kana}</span>}
        </span>
        {p.grade !== null && <span className="text-slate-500 text-xs">{p.grade}年</span>}
        <button
          onClick={() => toggleActive(p)}
          className="text-xs px-2 py-1 rounded bg-court-border hover:bg-slate-600"
        >
          {p.active ? '在籍中' : '非表示'}
        </button>
        <button onClick={() => startEdit(p)} className="text-xs px-2 py-1 rounded bg-court-border hover:bg-slate-600">
          編集
        </button>
        <button onClick={() => removePlayer(p.id)} className="text-xs text-red-400 hover:text-red-300">
          削除
        </button>
      </li>
    )
  }
}
