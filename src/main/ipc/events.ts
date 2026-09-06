import { ipcMain } from 'electron'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { EventRow } from '@shared/types'
import { getDb } from '../db/connection'

/**
 * playerNumber はシーズン依存（学年度で背番号が変わりうる）ため、
 * そのイベントが属する試合（games.season）を基準に player_seasons を引く。
 */
const BASE_SELECT = `
  SELECT
    e.*,
    et.code AS event_type_code,
    et.label AS event_type_label,
    et.category AS event_category,
    COALESCE(ps.number, p.number) AS player_number,
    p.name AS player_name
  FROM events e
  JOIN event_types et ON et.id = e.event_type_id
  JOIN games g ON g.id = e.game_id
  LEFT JOIN players p ON p.id = e.player_id
  LEFT JOIN player_seasons ps ON ps.player_id = p.id AND ps.season = g.season
`

function toEventRow(row: any): EventRow {
  return {
    id: row.id,
    gameId: row.game_id,
    videoId: row.video_id,
    eventTypeId: row.event_type_id,
    playerId: row.player_id,
    tSec: row.t_sec,
    quarter: row.quarter,
    note: row.note,
    clipInSec: row.clip_in_sec,
    clipOutSec: row.clip_out_sec,
    createdAt: row.created_at,
    eventTypeCode: row.event_type_code,
    eventTypeLabel: row.event_type_label,
    eventCategory: row.event_category,
    playerNumber: row.player_number,
    playerName: row.player_name
  }
}

export function registerEventsIpc(): void {
  ipcMain.handle('events:listByGame', (_e, req: IpcRequest<'events:listByGame'>): IpcResponse<'events:listByGame'> => {
    const params: Record<string, number> = { gameId: req.gameId }
    let sql = `${BASE_SELECT} WHERE e.game_id = @gameId`

    const filter = req.filter
    if (filter?.playerIds && filter.playerIds.length > 0) {
      sql += ` AND e.player_id IN (${filter.playerIds.map((_, i) => `@p${i}`).join(', ')})`
      filter.playerIds.forEach((id, i) => {
        params[`p${i}`] = id
      })
    }
    if (filter?.typeIds && filter.typeIds.length > 0) {
      sql += ` AND e.event_type_id IN (${filter.typeIds.map((_, i) => `@t${i}`).join(', ')})`
      filter.typeIds.forEach((id, i) => {
        params[`t${i}`] = id
      })
    }
    if (filter?.quarter !== undefined) {
      sql += ' AND e.quarter = @quarter'
      params.quarter = filter.quarter
    }
    sql += ' ORDER BY e.t_sec ASC'

    const rows = getDb().prepare(sql).all(params)
    return rows.map(toEventRow)
  })

  ipcMain.handle('events:create', (_e, req: IpcRequest<'events:create'>): IpcResponse<'events:create'> => {
    const db = getDb()
    const info = db
      .prepare(
        `INSERT INTO events (game_id, video_id, event_type_id, player_id, t_sec, quarter, note, clip_in_sec, clip_out_sec)
         VALUES (@gameId, @videoId, @eventTypeId, @playerId, @tSec, @quarter, @note, @clipInSec, @clipOutSec)`
      )
      .run({
        gameId: req.gameId,
        videoId: req.videoId,
        eventTypeId: req.eventTypeId,
        playerId: req.playerId,
        tSec: req.tSec,
        quarter: req.quarter,
        note: req.note,
        clipInSec: req.clipInSec,
        clipOutSec: req.clipOutSec
      })
    const row = db.prepare(`${BASE_SELECT} WHERE e.id = ?`).get(info.lastInsertRowid)
    return toEventRow(row)
  })

  ipcMain.handle('events:update', (_e, req: IpcRequest<'events:update'>): IpcResponse<'events:update'> => {
    const db = getDb()
    const fields = Object.keys(req.patch)
    if (fields.length > 0) {
      const setClause = fields.map((f) => `${toSnake(f)} = @${f}`).join(', ')
      db.prepare(`UPDATE events SET ${setClause} WHERE id = @id`).run({ id: req.id, ...req.patch })
    }
    const row = db.prepare(`${BASE_SELECT} WHERE e.id = ?`).get(req.id)
    return toEventRow(row)
  })

  ipcMain.handle('events:delete', (_e, req: IpcRequest<'events:delete'>): IpcResponse<'events:delete'> => {
    getDb().prepare('DELETE FROM events WHERE id = ?').run(req.id)
  })

  ipcMain.handle('events:bulkDelete', (_e, req: IpcRequest<'events:bulkDelete'>): IpcResponse<'events:bulkDelete'> => {
    if (req.ids.length === 0) return
    const placeholders = req.ids.map((_, i) => `@id${i}`).join(', ')
    const params: Record<string, number> = {}
    req.ids.forEach((id, i) => {
      params[`id${i}`] = id
    })
    getDb().prepare(`DELETE FROM events WHERE id IN (${placeholders})`).run(params)
  })
}

function toSnake(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
