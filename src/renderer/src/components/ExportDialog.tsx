import { useEffect, useMemo, useState } from 'react'
import type { EventRow, Player } from '@shared/types'
import { formatTime } from '../lib/format'

type Mode = 'player' | 'team'

export function ExportDialog({
  events,
  players,
  colorFor,
  onClose
}: {
  events: EventRow[]
  players: Player[]
  colorFor: (eventTypeId: number) => string
  onClose: () => void
}): JSX.Element {
  const [mode, setMode] = useState<Mode>('player')
  const [playerId, setPlayerId] = useState<number | null>(players[0]?.id ?? null)
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [withTitleCard, setWithTitleCard] = useState(true)
  const [withCaption, setWithCaption] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const candidateEvents = useMemo(() => {
    const list = mode === 'player' ? events.filter((ev) => ev.playerId === playerId) : events
    return [...list].sort((a, b) => a.tSec - b.tSec)
  }, [events, mode, playerId])

  useEffect(() => {
    setChecked(new Set(candidateEvents.filter((ev) => !ev.eventTypeCode.endsWith('_miss')).map((ev) => ev.id)))

    if (titleTouched) return
    if (mode === 'player') {
      const player = players.find((p) => p.id === playerId)
      if (player) setTitle(`#${player.number} ${player.name} ハイライト`)
    } else {
      setTitle('チームハイライト')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, playerId])

  const typeGroups = useMemo(() => {
    const map = new Map<number, { label: string; ids: number[] }>()
    for (const ev of candidateEvents) {
      const g = map.get(ev.eventTypeId) ?? { label: ev.eventTypeLabel, ids: [] }
      g.ids.push(ev.id)
      map.set(ev.eventTypeId, g)
    }
    return [...map.entries()].map(([eventTypeId, g]) => ({ eventTypeId, ...g }))
  }, [candidateEvents])

  const toggle = (id: number): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroup = (ids: number[]): void => {
    setChecked((prev) => {
      const allChecked = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      ids.forEach((id) => (allChecked ? next.delete(id) : next.add(id)))
      return next
    })
  }

  const handleSubmit = async (): Promise<void> => {
    if (checked.size === 0 || !title.trim()) return
    setSubmitting(true)
    try {
      await window.api.invoke('export:highlight', {
        eventIds: [...checked],
        title: title.trim(),
        withTitleCard,
        withCaption
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-court-panel border border-court-border rounded-lg w-full max-w-lg p-5">
        <h2 className="font-semibold mb-4">ハイライトを作る</h2>

        <div className="flex rounded overflow-hidden border border-court-border text-xs mb-3 w-fit">
          <button
            onClick={() => setMode('player')}
            className={`px-3 py-1.5 ${mode === 'player' ? 'bg-court-accent text-black' : 'bg-court-bg hover:bg-court-border'}`}
          >
            選手を選ぶ
          </button>
          <button
            onClick={() => setMode('team')}
            className={`px-3 py-1.5 ${mode === 'team' ? 'bg-court-accent text-black' : 'bg-court-bg hover:bg-court-border'}`}
          >
            チーム全体
          </button>
        </div>

        {mode === 'player' && (
          <label className="flex flex-col text-xs text-slate-400 gap-1 mb-3">
            選手
            <select
              value={playerId ?? ''}
              onChange={(e) => setPlayerId(e.target.value ? Number(e.target.value) : null)}
              className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col text-xs text-slate-400 gap-1 mb-3">
          タイトル
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleTouched(true)
            }}
            className="bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100"
          />
        </label>

        <div className="flex gap-4 mb-3 text-xs text-slate-300">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={withTitleCard} onChange={(e) => setWithTitleCard(e.target.checked)} />
            タイトルカードを追加
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={withCaption} onChange={(e) => setWithCaption(e.target.checked)} />
            選手名・プレイ名を焼き込む
          </label>
        </div>

        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-400">
            含めるプレイ（{checked.size}/{candidateEvents.length}）
          </span>
          <div className="flex gap-2 text-[11px]">
            <button
              onClick={() => setChecked(new Set(candidateEvents.map((ev) => ev.id)))}
              className="underline text-slate-400 hover:text-slate-200"
            >
              すべて選択
            </button>
            <button onClick={() => setChecked(new Set())} className="underline text-slate-400 hover:text-slate-200">
              すべて解除
            </button>
          </div>
        </div>

        {typeGroups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {typeGroups.map((g) => {
              const allChecked = g.ids.every((id) => checked.has(id))
              return (
                <button
                  key={g.eventTypeId}
                  onClick={() => toggleGroup(g.ids)}
                  className="text-[11px] px-2 py-1 rounded font-medium text-black"
                  style={{ backgroundColor: colorFor(g.eventTypeId), opacity: allChecked ? 1 : 0.45 }}
                >
                  {g.label}（{g.ids.length}）
                </button>
              )
            })}
          </div>
        )}

        <ul className="max-h-56 overflow-y-auto overflow-x-hidden border border-court-border rounded mb-4">
          {candidateEvents.length === 0 && (
            <li className="text-xs text-slate-500 p-3">
              {mode === 'player' ? 'この選手に割り当てられたイベントがありません。' : 'イベントがありません。'}
            </li>
          )}
          {candidateEvents.map((ev) => (
            <li
              key={ev.id}
              className="flex items-center gap-2 text-xs px-2 py-1.5 border-b border-court-border/50 last:border-0"
            >
              <input type="checkbox" checked={checked.has(ev.id)} onChange={() => toggle(ev.id)} />
              <span className="font-mono text-slate-400 w-14">{formatTime(ev.tSec)}</span>
              <span>{ev.eventTypeLabel}</span>
              {mode === 'team' && (
                <span className="text-slate-500 ml-auto">
                  {ev.playerNumber ? `#${ev.playerNumber} ${ev.playerName}` : '未割当'}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-court-border hover:bg-slate-600">
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || checked.size === 0 || !title.trim()}
            className="text-xs px-3 py-1.5 rounded bg-court-accent font-medium disabled:opacity-50"
          >
            {submitting ? '書き出し中...' : '書き出す'}
          </button>
        </div>
      </div>
    </div>
  )
}
