import { ipcMain } from 'electron'
import type { IpcResponse } from '@shared/ipc'
import { getDb } from '../db/connection'

export function registerSeasonsIpc(): void {
  ipcMain.handle('seasons:list', (): IpcResponse<'seasons:list'> => {
    const rows = getDb()
      .prepare(
        `SELECT season FROM games
         UNION
         SELECT season FROM player_seasons
         ORDER BY season DESC`
      )
      .all() as { season: string }[]
    return rows.map((r) => r.season)
  })
}
