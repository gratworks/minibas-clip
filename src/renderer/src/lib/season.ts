/** 日本の学年度（4月〜翌3月）でシーズンを判定する。例: 2026-01-15 → "2025"（2025年度=2025/4〜2026/3） */
export function seasonForDate(dateStr: string): string {
  const [yearStr, monthStr] = dateStr.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  return String(month >= 4 ? year : year - 1)
}

export function seasonLabel(season: string): string {
  return `${season}年度`
}
