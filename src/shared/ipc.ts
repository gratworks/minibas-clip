import type {
  EventRow,
  EventType,
  ExportKind,
  Game,
  GameAppearance,
  GameSummary,
  JobProgress,
  Player,
  PlayerStatRow,
  Video
} from './types'

/**
 * IPC契約の単一ソース。preload と main の ipcMain ハンドラは
 * この IpcMap で縛られる（呼び出し側・実装側の型ズレを防ぐ）。
 * Phase 0 では型定義のみ。各ハンドラの実装は Phase 1〜4 で追加する。
 */
export interface IpcMap {
  'app:info': { req: void; res: { version: string; platform: NodeJS.Platform } }
  'diagnostics:ffmpeg': { req: void; res: { ffmpegPath: string; hasDrawtext: boolean } }

  /**
   * number/grade/active はシーズン依存（学年・背番号は年度で変わりうる）。
   * `season` を渡すとそのシーズンの値（`player_seasons` に無ければテンプレートへフォールバック）を返す。
   * 省略時は `players` テーブルのテンプレート値をそのまま返す。
   */
  'players:list': { req: { season?: string } | void; res: Player[] }
  'players:create': { req: Omit<Player, 'id' | 'createdAt'> & { season: string }; res: Player }
  'players:update': {
    req: { id: number; season?: string; patch: Partial<Omit<Player, 'id' | 'createdAt'>> }
    res: Player
  }
  'players:delete': { req: { id: number }; res: void }
  /**
   * 別シーズンの名簿（player_seasons）をコピーする（前後どちらの方向にも対応）。
   * 学年は年度差分に応じて自動で加減算される。既にtoSeasonに行がある選手はスキップ
   */
  'players:copySeasonForward': {
    req: { fromSeason: string; toSeason: string }
    res: { copied: number }
  }

  'seasons:list': { req: void; res: string[] }

  'games:list': { req: { season?: string } | void; res: GameSummary[] }
  'games:get': { req: { id: number }; res: GameSummary }
  'games:create': { req: Omit<Game, 'id' | 'createdAt'>; res: Game }
  'games:update': { req: { id: number; patch: Partial<Omit<Game, 'id' | 'createdAt'>> }; res: Game }
  'games:delete': { req: { id: number }; res: void }

  'videos:import': { req: { gameId: number }; res: { videos: Video[]; jobIds: string[] } }
  'videos:listByGame': { req: { gameId: number }; res: Video[] }
  'videos:remove': { req: { id: number }; res: void }
  'videos:rebuildProxy': { req: { id: number }; res: { jobId: string } }

  'events:listByGame': {
    req: { gameId: number; filter?: { playerIds?: number[]; typeIds?: number[]; quarter?: number } }
    res: EventRow[]
  }
  'events:create': { req: Omit<EventRow, 'id' | 'createdAt' | 'eventTypeCode' | 'eventTypeLabel' | 'eventCategory' | 'playerNumber' | 'playerName'>; res: EventRow }
  'events:update': { req: { id: number; patch: Record<string, unknown> }; res: EventRow }
  'events:delete': { req: { id: number }; res: void }
  'events:bulkDelete': { req: { ids: number[] }; res: void }

  'eventTypes:list': { req: void; res: EventType[] }
  'eventTypes:upsert': { req: Partial<EventType> & { code: string }; res: EventType }
  'eventTypes:reorder': { req: { orderedIds: number[] }; res: void }

  'lineup:listByGame': { req: { gameId: number }; res: GameAppearance[] }
  'lineup:toggle': { req: { gameId: number; playerId: number; quarter: number }; res: { played: boolean } }

  'stats:game': { req: { gameId: number }; res: PlayerStatRow[] }
  'stats:season': { req: { season: string; playerId?: number }; res: PlayerStatRow[] }
  'stats:exportCsv': { req: { scope: 'game' | 'season'; id: string | number }; res: { path: string } | null }

  'export:clip': { req: { eventId: number }; res: { jobId: string } }
  'export:highlight': {
    req: {
      eventIds: number[]
      title: string
      outDir?: string
      withTitleCard: boolean
      withCaption: boolean
    }
    res: { jobId: string }
  }

  'jobs:cancel': { req: { jobId: string }; res: void }

  'dialog:pickFolder': { req: void; res: { path: string } | null }
  'shell:showInFolder': { req: { path: string }; res: void }
  'settings:get': { req: { key: string }; res: string | null }
  'settings:set': { req: { key: string; value: string }; res: void }
  'settings:getPaths': { req: void; res: { proxyDir: string; exportDir: string } }
  'settings:setPath': {
    req: { key: 'proxyDir' | 'exportDir'; path: string | null }
    res: { proxyDir: string; exportDir: string }
  }
}

export type IpcChannel = keyof IpcMap
export type IpcRequest<C extends IpcChannel> = IpcMap[C]['req']
export type IpcResponse<C extends IpcChannel> = IpcMap[C]['res']

/** main → renderer のジョブ進捗イベント名 */
export const JOB_PROGRESS_EVENT = 'jobs:progress'
export type JobProgressPayload = JobProgress
