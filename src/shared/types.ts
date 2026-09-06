export interface Player {
  id: number
  number: number
  name: string
  kana: string | null
  grade: number | null
  active: 0 | 1
  createdAt: string
}

export interface Game {
  id: number
  date: string
  opponent: string | null
  venue: string | null
  ourScore: number | null
  oppScore: number | null
  season: string
  note: string | null
  createdAt: string
}

export interface GameSummary extends Game {
  videoCount: number
  eventCount: number
}

export type ProxyStatus = 'none' | 'running' | 'done' | 'error'

export interface Video {
  id: number
  gameId: number
  srcPath: string
  proxyPath: string | null
  durationSec: number | null
  fps: number | null
  width: number | null
  height: number | null
  vcodec: string | null
  proxyStatus: ProxyStatus
  sortOrder: number
  createdAt: string
}

export type EventCategory = 'stat' | 'highlight'

export interface EventType {
  id: number
  code: string
  label: string
  category: EventCategory
  keyBinding: string | null
  preSec: number
  postSec: number
  color: string
  points: number
  sortOrder: number
  enabled: 0 | 1
}

export interface GameEvent {
  id: number
  gameId: number
  videoId: number
  eventTypeId: number
  playerId: number | null
  tSec: number
  quarter: number | null
  note: string | null
  clipInSec: number | null
  clipOutSec: number | null
  createdAt: string
}

export interface EventRow extends GameEvent {
  eventTypeCode: string
  eventTypeLabel: string
  eventCategory: EventCategory
  playerNumber: number | null
  playerName: string | null
}

export interface GameAppearance {
  gameId: number
  playerId: number
  quarter: number
}

export interface PlayerStatRow {
  playerId: number
  playerNumber: number
  playerName: string
  gp: number
  pts: number
  fgm: number
  fga: number
  fgPct: number
  ftm: number
  fta: number
  ftPct: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  pf: number
}

export type JobKind = 'proxy' | 'clip' | 'highlight'
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface JobProgress {
  jobId: string
  kind: JobKind
  percent: number
  message: string
  status: JobStatus
  outputPath?: string
  videoId?: number
}

export type ExportKind = 'clip' | 'highlight' | 'csv'

export interface ExportRecord {
  id: number
  gameId: number | null
  playerId: number | null
  kind: ExportKind
  outputPath: string
  eventIds: number[]
  status: JobStatus
  createdAt: string
}
