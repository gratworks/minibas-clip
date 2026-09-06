import { ipcMain } from 'electron'
import { unlinkSync } from 'fs'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { GameSummary } from '@shared/types'
import { getDb } from '../db/connection'
import { cancelJobsForVideo } from '../jobs/queue'
import { proxyPathFor } from '../util/paths'

const SUMMARY_SQL = `
  SELECT
    g.*,
    (SELECT COUNT(*) FROM videos v WHERE v.game_id = g.id) AS video_count,
    (SELECT COUNT(*) FROM events e WHERE e.game_id = g.id) AS event_count
  FROM games g
`

function toGameSummary(row: any): GameSummary {
  return {
    id: row.id,
    date: row.date,
    opponent: row.opponent,
    venue: row.venue,
    ourScore: row.our_score,
    oppScore: row.opp_score,
    season: row.season,
    note: row.note,
    createdAt: row.created_at,
    videoCount: row.video_count,
    eventCount: row.event_count
  }
}

export function registerGamesIpc(): void {
  ipcMain.handle('games:list', (_e, req: IpcRequest<'games:list'>): IpcResponse<'games:list'> => {
    const season = req?.season
    const rows = season
      ? getDb().prepare(`${SUMMARY_SQL} WHERE g.season = ? ORDER BY g.date DESC`).all(season)
      : getDb().prepare(`${SUMMARY_SQL} ORDER BY g.date DESC`).all()
    return rows.map(toGameSummary)
  })

  ipcMain.handle('games:get', (_e, req: IpcRequest<'games:get'>): IpcResponse<'games:get'> => {
    const row = getDb().prepare(`${SUMMARY_SQL} WHERE g.id = ?`).get(req.id)
    return toGameSummary(row)
  })

  ipcMain.handle('games:create', (_e, req: IpcRequest<'games:create'>): IpcResponse<'games:create'> => {
    const info = getDb()
      .prepare(
        `INSERT INTO games (date, opponent, venue, our_score, opp_score, season, note)
         VALUES (@date, @opponent, @venue, @ourScore, @oppScore, @season, @note)`
      )
      .run({
        date: req.date,
        opponent: req.opponent,
        venue: req.venue,
        ourScore: req.ourScore,
        oppScore: req.oppScore,
        season: req.season,
        note: req.note
      })
    const row = getDb().prepare(`${SUMMARY_SQL} WHERE g.id = ?`).get(info.lastInsertRowid)
    return toGameSummary(row)
  })

  ipcMain.handle('games:update', (_e, req: IpcRequest<'games:update'>): IpcResponse<'games:update'> => {
    const fields = Object.keys(req.patch)
    if (fields.length > 0) {
      const setClause = fields.map((f) => `${toSnake(f)} = @${f}`).join(', ')
      getDb()
        .prepare(`UPDATE games SET ${setClause} WHERE id = @id`)
        .run({ id: req.id, ...req.patch })
    }
    const row = getDb().prepare(`${SUMMARY_SQL} WHERE g.id = ?`).get(req.id)
    return toGameSummary(row)
  })

  ipcMain.handle('games:delete', (_e, req: IpcRequest<'games:delete'>): IpcResponse<'games:delete'> => {
    const db = getDb()
    const game = db.prepare('SELECT date FROM games WHERE id = ?').get(req.id) as { date: string } | undefined
    const videos = db.prepare('SELECT id, proxy_path FROM videos WHERE game_id = ?').all(req.id) as Array<{
      id: number
      proxy_path: string | null
    }>

    for (const v of videos) cancelJobsForVideo(v.id)

    // videos は ON DELETE CASCADE でDB行は消えるが、変換済みのプロキシ動画ファイルは
    // 別途消さないとディスク上に残り続けてしまう
    db.prepare('DELETE FROM games WHERE id = ?').run(req.id)

    for (const v of videos) {
      // 変換完了済みならDB記録のパス、変換中だった場合は生成されるはずだったパスを推測して、
      // どちらのケースでも掃除する
      const proxyPath = v.proxy_path ?? (game ? proxyPathFor(game.date, v.id) : null)
      if (!proxyPath) continue
      try {
        unlinkSync(proxyPath)
      } catch {
        // 既に無い場合などは無視
      }
    }
  })
}

function toSnake(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
