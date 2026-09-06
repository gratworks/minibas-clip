import { ipcMain } from 'electron'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { GameAppearance } from '@shared/types'
import { getDb } from '../db/connection'

function toAppearance(row: any): GameAppearance {
  return { gameId: row.game_id, playerId: row.player_id, quarter: row.quarter }
}

export function registerLineupIpc(): void {
  ipcMain.handle('lineup:listByGame', (_e, req: IpcRequest<'lineup:listByGame'>): IpcResponse<'lineup:listByGame'> => {
    const rows = getDb().prepare('SELECT * FROM game_appearances WHERE game_id = ?').all(req.gameId)
    return rows.map(toAppearance)
  })

  ipcMain.handle('lineup:toggle', (_e, req: IpcRequest<'lineup:toggle'>): IpcResponse<'lineup:toggle'> => {
    const db = getDb()
    const existing = db
      .prepare('SELECT 1 FROM game_appearances WHERE game_id = ? AND player_id = ? AND quarter = ?')
      .get(req.gameId, req.playerId, req.quarter)

    if (existing) {
      db.prepare('DELETE FROM game_appearances WHERE game_id = ? AND player_id = ? AND quarter = ?').run(
        req.gameId,
        req.playerId,
        req.quarter
      )
      return { played: false }
    }

    db.prepare('INSERT INTO game_appearances (game_id, player_id, quarter) VALUES (?, ?, ?)').run(
      req.gameId,
      req.playerId,
      req.quarter
    )
    return { played: true }
  })
}
