export function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '00:00.00'
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}
