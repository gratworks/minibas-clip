import type { MouseEvent } from 'react'
import type { EventRow } from '@shared/types'
import { formatTime } from '../lib/format'

export function Timeline({
  durationSec,
  currentTimeSec,
  events,
  colorFor,
  onSeek
}: {
  durationSec: number
  currentTimeSec: number
  events: EventRow[]
  colorFor: (eventTypeId: number) => string
  onSeek: (sec: number) => void
}): JSX.Element {
  const handleClick = (e: MouseEvent<HTMLDivElement>): void => {
    if (durationSec <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    onSeek(ratio * durationSec)
  }

  const playheadPct = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0

  return (
    <div
      onClick={handleClick}
      className="relative h-6 bg-court-bg border border-court-border rounded cursor-pointer mt-2"
    >
      {durationSec > 0 &&
        events.map((ev) => (
          <div
            key={ev.id}
            title={`${ev.eventTypeLabel} ${formatTime(ev.tSec)}`}
            className="absolute top-0 w-0.5 h-full pointer-events-none"
            style={{ left: `${(ev.tSec / durationSec) * 100}%`, backgroundColor: colorFor(ev.eventTypeId) }}
          />
        ))}
      <div
        className="absolute top-0 w-px h-full bg-white pointer-events-none"
        style={{ left: `${playheadPct}%` }}
      />
    </div>
  )
}
