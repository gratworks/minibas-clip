import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import type { DatabaseSync } from 'node:sqlite'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { PlayerStatRow } from '@shared/types'
import { getDb } from '../db/connection'

const STAT_SUMS = `
  COALESCE(SUM(et.points), 0) AS pts,
  SUM(CASE WHEN et.code = 'fg_made' THEN 1 ELSE 0 END) AS fgm,
  SUM(CASE WHEN et.code IN ('fg_made','fg_miss') THEN 1 ELSE 0 END) AS fga,
  SUM(CASE WHEN et.code = 'ft_made' THEN 1 ELSE 0 END) AS ftm,
  SUM(CASE WHEN et.code IN ('ft_made','ft_miss') THEN 1 ELSE 0 END) AS fta,
  SUM(CASE WHEN et.code = 'oreb' THEN 1 ELSE 0 END) AS oreb,
  SUM(CASE WHEN et.code = 'dreb' THEN 1 ELSE 0 END) AS dreb,
  SUM(CASE WHEN et.code IN ('oreb','dreb') THEN 1 ELSE 0 END) AS reb,
  SUM(CASE WHEN et.code = 'ast' THEN 1 ELSE 0 END) AS ast,
  SUM(CASE WHEN et.code = 'stl' THEN 1 ELSE 0 END) AS stl,
  SUM(CASE WHEN et.code = 'blk' THEN 1 ELSE 0 END) AS blk,
  SUM(CASE WHEN et.code = 'tov' THEN 1 ELSE 0 END) AS tov,
  SUM(CASE WHEN et.code = 'pf' THEN 1 ELSE 0 END) AS pf
`

function toStatRow(row: any): PlayerStatRow {
  const fgPct = row.fga > 0 ? row.fgm / row.fga : 0
  const ftPct = row.fta > 0 ? row.ftm / row.fta : 0
  return {
    playerId: row.player_id,
    playerNumber: row.player_number,
    playerName: row.player_name,
    gp: row.gp,
    pts: row.pts,
    fgm: row.fgm,
    fga: row.fga,
    fgPct,
    ftm: row.ftm,
    fta: row.fta,
    ftPct,
    oreb: row.oreb,
    dreb: row.dreb,
    reb: row.reb,
    ast: row.ast,
    stl: row.stl,
    blk: row.blk,
    tov: row.tov,
    pf: row.pf
  }
}

/**
 * 出場記録（statイベント）が無い選手も0埋めで一覧に出す（「出てたのに記録0」を可視化するため）。
 * ただし現在「非表示」でも過去に記録がある選手は消えないよう、activeのORで対象を残す。
 * 背番号・出場フラグはシーズン依存のため player_seasons を優先し、無ければテンプレート(players)へフォールバックする。
 */
function computeGameStats(db: DatabaseSync, gameId: number): PlayerStatRow[] {
  const game = db.prepare('SELECT season FROM games WHERE id = ?').get(gameId) as { season: string } | undefined
  const season = game?.season ?? ''

  const rows = db
    .prepare(
      `SELECT p.id AS player_id, COALESCE(ps.number, p.number) AS player_number, p.name AS player_name,
              1 AS gp, ${STAT_SUMS}
       FROM players p
       LEFT JOIN player_seasons ps ON ps.player_id = p.id AND ps.season = @season
       LEFT JOIN events e ON e.player_id = p.id AND e.game_id = @gameId
       LEFT JOIN event_types et ON et.id = e.event_type_id AND et.category = 'stat'
       WHERE COALESCE(ps.active, p.active) = 1
          OR EXISTS (SELECT 1 FROM events e2 WHERE e2.player_id = p.id AND e2.game_id = @gameId)
       GROUP BY p.id
       ORDER BY player_number ASC`
    )
    .all({ gameId, season })
  return rows.map(toStatRow)
}

function computeSeasonStats(db: DatabaseSync, season: string, playerId?: number): PlayerStatRow[] {
  const params: Record<string, string | number> = { season }
  let sql = `
    SELECT p.id AS player_id, COALESCE(ps.number, p.number) AS player_number, p.name AS player_name,
           COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN g.id END) AS gp, ${STAT_SUMS}
    FROM players p
    LEFT JOIN player_seasons ps ON ps.player_id = p.id AND ps.season = @season
    JOIN games g ON g.season = @season
    LEFT JOIN events e ON e.player_id = p.id AND e.game_id = g.id
    LEFT JOIN event_types et ON et.id = e.event_type_id AND et.category = 'stat'
    WHERE (
      COALESCE(ps.active, p.active) = 1
      OR EXISTS (
        SELECT 1 FROM events e2 JOIN games g2 ON g2.id = e2.game_id
        WHERE e2.player_id = p.id AND g2.season = @season
      )
    )
  `
  if (playerId !== undefined) {
    sql += ' AND p.id = @playerId'
    params.playerId = playerId
  }
  sql += ' GROUP BY p.id ORDER BY player_number ASC'

  const rows = db.prepare(sql).all(params)
  return rows.map(toStatRow)
}

function csvEscape(value: string | number): string {
  const s = String(value)
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: PlayerStatRow[]): string {
  const header = [
    '背番号', '氏名', '試合数', '得点',
    'FG成功', 'FG試投', 'FG%',
    'FT成功', 'FT試投', 'FT%',
    'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'PF'
  ]
  const lines = [header.map(csvEscape).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.playerNumber, csvEscape(r.playerName), r.gp, r.pts,
        r.fgm, r.fga, (r.fgPct * 100).toFixed(1),
        r.ftm, r.fta, (r.ftPct * 100).toFixed(1),
        r.oreb, r.dreb, r.reb, r.ast, r.stl, r.blk, r.tov, r.pf
      ].join(',')
    )
  }
  return `﻿${lines.join('\r\n')}`
}

export function registerStatsIpc(): void {
  ipcMain.handle('stats:game', (_e, req: IpcRequest<'stats:game'>): IpcResponse<'stats:game'> => {
    return computeGameStats(getDb(), req.gameId)
  })

  ipcMain.handle('stats:season', (_e, req: IpcRequest<'stats:season'>): IpcResponse<'stats:season'> => {
    return computeSeasonStats(getDb(), req.season, req.playerId)
  })

  ipcMain.handle('stats:exportCsv', async (_e, req: IpcRequest<'stats:exportCsv'>): Promise<IpcResponse<'stats:exportCsv'>> => {
    const db = getDb()
    const rows = req.scope === 'game' ? computeGameStats(db, Number(req.id)) : computeSeasonStats(db, String(req.id))

    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const defaultName = req.scope === 'game' ? `game_${req.id}_stats.csv` : `season_${req.id}_stats.csv`
    const dialogOpts = {
      defaultPath: join(app.getPath('documents'), defaultName),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    }
    const result = win ? await dialog.showSaveDialog(win, dialogOpts) : await dialog.showSaveDialog(dialogOpts)
    if (result.canceled || !result.filePath) return null

    await writeFile(result.filePath, toCsv(rows), 'utf-8')

    db.prepare(
      `INSERT INTO exports (game_id, player_id, kind, output_path, event_ids, status)
       VALUES (@gameId, NULL, 'csv', @outputPath, '[]', 'done')`
    ).run({
      gameId: req.scope === 'game' ? Number(req.id) : null,
      outputPath: result.filePath
    })

    return { path: result.filePath }
  })
}
