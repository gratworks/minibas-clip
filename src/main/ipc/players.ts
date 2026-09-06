import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { Player } from '@shared/types'
import { getDb } from '../db/connection'

const SEASON_JOIN_SELECT = `
  SELECT p.id, p.name, p.kana, p.created_at,
         p.number AS p_number, p.grade AS p_grade, p.active AS p_active,
         ps.number AS ps_number, ps.grade AS ps_grade, ps.active AS ps_active,
         ps.player_id AS has_season
  FROM players p
  LEFT JOIN player_seasons ps ON ps.player_id = p.id AND ps.season = @season
`

/** players テーブルのテンプレート値をそのまま返す（season未指定時） */
function toPlayerTemplate(row: any): Player {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    kana: row.kana,
    grade: row.grade,
    active: row.active,
    createdAt: row.created_at
  }
}

/** player_seasons があればその値、無ければテンプレートへフォールバック */
function toPlayerResolved(row: any): Player {
  const hasSeason = row.has_season !== null && row.has_season !== undefined
  return {
    id: row.id,
    number: hasSeason ? row.ps_number : row.p_number,
    name: row.name,
    kana: row.kana,
    grade: hasSeason ? row.ps_grade : row.p_grade,
    active: hasSeason ? row.ps_active : row.p_active,
    createdAt: row.created_at
  }
}

function getPlayerForSeason(db: DatabaseSync, id: number, season: string): Player {
  const row = db.prepare(`${SEASON_JOIN_SELECT} WHERE p.id = @id`).get({ season, id })
  return toPlayerResolved(row)
}

export function registerPlayersIpc(): void {
  ipcMain.handle('players:list', (_e, req: IpcRequest<'players:list'>): IpcResponse<'players:list'> => {
    const season = req?.season
    const db = getDb()
    if (!season) {
      const rows = db.prepare('SELECT * FROM players ORDER BY number ASC').all()
      return rows.map(toPlayerTemplate)
    }
    const rows = db
      .prepare(`${SEASON_JOIN_SELECT} ORDER BY COALESCE(ps.number, p.number) ASC`)
      .all({ season })
    return rows.map(toPlayerResolved)
  })

  ipcMain.handle('players:create', (_e, req: IpcRequest<'players:create'>): IpcResponse<'players:create'> => {
    const db = getDb()
    const { season, ...rest } = req
    const info = db
      .prepare(
        'INSERT INTO players (number, name, kana, grade, active) VALUES (@number, @name, @kana, @grade, @active)'
      )
      .run(rest)
    const playerId = Number(info.lastInsertRowid)
    db.prepare(
      `INSERT INTO player_seasons (player_id, season, number, grade, active)
       VALUES (@playerId, @season, @number, @grade, @active)`
    ).run({ playerId, season, number: rest.number, grade: rest.grade, active: rest.active })
    return getPlayerForSeason(db, playerId, season)
  })

  ipcMain.handle('players:update', (_e, req: IpcRequest<'players:update'>): IpcResponse<'players:update'> => {
    const db = getDb()
    const { id, season, patch } = req

    const identityFields: Record<string, unknown> = {}
    const seasonFields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'name' || key === 'kana') identityFields[key] = value
      else seasonFields[key] = value
    }

    if (Object.keys(identityFields).length > 0) {
      const setClause = Object.keys(identityFields)
        .map((f) => `${toSnake(f)} = @${f}`)
        .join(', ')
      db.prepare(`UPDATE players SET ${setClause} WHERE id = @id`).run({ id, ...identityFields })
    }

    if (Object.keys(seasonFields).length > 0) {
      if (season) {
        const existing = db
          .prepare('SELECT number, grade, active FROM player_seasons WHERE player_id = ? AND season = ?')
          .get(id, season) as { number: number; grade: number | null; active: 0 | 1 } | undefined
        const template = db.prepare('SELECT number, grade, active FROM players WHERE id = ?').get(id) as {
          number: number
          grade: number | null
          active: 0 | 1
        }
        const merged = { ...(existing ?? template), ...seasonFields }
        db.prepare(
          `INSERT INTO player_seasons (player_id, season, number, grade, active)
           VALUES (@id, @season, @number, @grade, @active)
           ON CONFLICT(player_id, season) DO UPDATE SET number = @number, grade = @grade, active = @active`
        ).run({ id, season, number: merged.number, grade: merged.grade, active: merged.active })
      } else {
        const setClause = Object.keys(seasonFields)
          .map((f) => `${toSnake(f)} = @${f}`)
          .join(', ')
        db.prepare(`UPDATE players SET ${setClause} WHERE id = @id`).run({ id, ...seasonFields })
      }
    }

    if (season) return getPlayerForSeason(db, id, season)
    return toPlayerTemplate(db.prepare('SELECT * FROM players WHERE id = ?').get(id))
  })

  ipcMain.handle('players:delete', (_e, req: IpcRequest<'players:delete'>): IpcResponse<'players:delete'> => {
    getDb().prepare('DELETE FROM players WHERE id = ?').run(req.id)
  })

  ipcMain.handle(
    'players:copySeasonForward',
    (_e, req: IpcRequest<'players:copySeasonForward'>): IpcResponse<'players:copySeasonForward'> => {
      const db = getDb()
      const { fromSeason, toSeason } = req
      // 過去シーズンへコピーする場合もあるため、年度差分から学年の増減を自動算出する
      // （例: 2026年度→2025年度なら-1、2026年度→2027年度なら+1）
      const gradeDelta = Number(toSeason) - Number(fromSeason)
      // fromSeason 側に player_seasons が無い選手（テンプレートのまま使われている選手）もコピーできるよう、
      // players:list と同じ「無ければテンプレートへフォールバック」で実効値を解決する。
      // 非表示（active=0）の選手は毎年コピーで復活すると管理が煩雑になるため対象外にする。
      const rows = db
        .prepare(
          `SELECT p.id AS player_id, COALESCE(ps.number, p.number) AS number,
                  CASE WHEN ps.player_id IS NOT NULL THEN ps.grade ELSE p.grade END AS grade,
                  COALESCE(ps.active, p.active) AS active
           FROM players p
           LEFT JOIN player_seasons ps ON ps.player_id = p.id AND ps.season = @fromSeason
           WHERE COALESCE(ps.active, p.active) = 1`
        )
        .all({ fromSeason }) as any[]

      let copied = 0
      db.exec('BEGIN')
      try {
        for (const r of rows) {
          const exists = db
            .prepare('SELECT 1 FROM player_seasons WHERE player_id = ? AND season = ?')
            .get(r.player_id, toSeason)
          if (exists) continue
          const grade = r.grade !== null ? r.grade + gradeDelta : null
          db.prepare(
            `INSERT INTO player_seasons (player_id, season, number, grade, active)
             VALUES (@playerId, @season, @number, @grade, @active)`
          ).run({ playerId: r.player_id, season: toSeason, number: r.number, grade, active: r.active })
          copied++
        }
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
      return { copied }
    }
  )
}

function toSnake(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
