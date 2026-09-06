import { useEffect, useRef } from 'react'
import type { EventRow, Player } from '@shared/types'
import { formatTime } from '../lib/format'

export function EventList({
  events,
  players,
  activeVideoId,
  colorFor,
  focusEventId,
  onSeek,
  onAssignPlayer,
  onAdjustClip,
  onExportClip,
  onDelete
}: {
  events: EventRow[]
  players: Player[]
  activeVideoId: number | null
  colorFor: (eventTypeId: number) => string
  focusEventId: number | null
  onSeek: (ev: EventRow) => void
  onAssignPlayer: (eventId: number, playerId: number | null) => void
  onAdjustClip: (ev: EventRow, deltaInSec: number, deltaOutSec: number) => void
  onExportClip: (eventId: number) => void
  onDelete: (eventId: number) => void
}): JSX.Element {
  const rowRefs = useRef(new Map<number, HTMLLIElement>())

  // 最後にタグ付けしたイベントが一覧の下に隠れて「ちゃんと押せたか」見えなくなるのを防ぐため自動スクロール
  useEffect(() => {
    if (focusEventId === null) return
    rowRefs.current.get(focusEventId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusEventId])

  if (events.length === 0) {
    return (
      <p className="text-slate-500 text-xs">
        まだタグ付けされたイベントがありません。動画を再生しながらキーを押してタグ付けしてください。
      </p>
    )
  }

  return (
    <ul className="space-y-1 max-h-[480px] overflow-y-auto overflow-x-hidden pr-1">
      {events.map((ev) => (
        <li
          key={ev.id}
          ref={(el) => {
            if (el) rowRefs.current.set(ev.id, el)
            else rowRefs.current.delete(ev.id)
          }}
          className={`flex flex-col gap-1 text-xs px-2 py-1.5 rounded border ${
            ev.id === focusEventId
              ? 'border-court-accent bg-court-accent/10'
              : ev.videoId === activeVideoId
                ? 'border-court-border'
                : 'border-transparent opacity-60'
          } hover:bg-court-border/50`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => onSeek(ev)}
              className="font-mono text-slate-400 hover:text-court-accent shrink-0"
            >
              {formatTime(ev.tSec)}
            </button>
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-black whitespace-nowrap truncate"
              style={{ backgroundColor: colorFor(ev.eventTypeId) }}
            >
              {ev.eventTypeLabel}
            </span>
            <button
              onClick={() => onExportClip(ev.id)}
              className="ml-auto text-slate-400 hover:text-court-accent px-1 shrink-0"
              title="このクリップだけ書き出す"
            >
              書出
            </button>
            <button onClick={() => onDelete(ev.id)} className="text-red-400 hover:text-red-300 px-1 shrink-0">
              削除
            </button>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <select
              value={ev.playerId ?? ''}
              onChange={(e) => onAssignPlayer(ev.id, e.target.value ? Number(e.target.value) : null)}
              className="bg-court-bg border border-court-border rounded px-1 py-0.5 text-slate-200 flex-1 min-w-0"
            >
              <option value="">未割当</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
            <span className="text-slate-500 font-mono flex items-center gap-1 shrink-0">
              <button
                onClick={() => onAdjustClip(ev, -0.5, 0)}
                className="px-1 rounded hover:bg-court-border"
                title="開始位置を0.5秒早める"
              >
                «
              </button>
              {ev.clipInSec?.toFixed(1)}〜{ev.clipOutSec?.toFixed(1)}s
              <button
                onClick={() => onAdjustClip(ev, 0, 0.5)}
                className="px-1 rounded hover:bg-court-border"
                title="終了位置を0.5秒延ばす"
              >
                »
              </button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
