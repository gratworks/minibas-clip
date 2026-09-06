import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import { getDb } from '../db/connection'
import { getFfmpegPath } from '../ffmpeg/bin'
import { hasDrawtextFilter } from '../ffmpeg/probe'
import { getProxyDir, getExportDir, setPathOverride } from '../util/paths'

export function registerAppIpc(): void {
  ipcMain.handle('app:info', (): IpcResponse<'app:info'> => {
    return { version: process.env.npm_package_version ?? '0.1.0', platform: process.platform }
  })

  ipcMain.handle('diagnostics:ffmpeg', async (): Promise<IpcResponse<'diagnostics:ffmpeg'>> => {
    const ffmpegPath = getFfmpegPath()
    const hasDrawtext = await hasDrawtextFilter()
    return { ffmpegPath, hasDrawtext }
  })

  ipcMain.handle('dialog:pickFolder', async (): Promise<IpcResponse<'dialog:pickFolder'>> => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return { path: result.filePaths[0] }
  })

  ipcMain.handle('shell:showInFolder', (_e, req: IpcRequest<'shell:showInFolder'>): IpcResponse<'shell:showInFolder'> => {
    shell.showItemInFolder(req.path)
  })

  ipcMain.handle('settings:get', (_e, req: IpcRequest<'settings:get'>): IpcResponse<'settings:get'> => {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(req.key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  })

  ipcMain.handle('settings:set', (_e, req: IpcRequest<'settings:set'>): IpcResponse<'settings:set'> => {
    getDb()
      .prepare(
        'INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value'
      )
      .run(req)
  })

  ipcMain.handle('settings:getPaths', (): IpcResponse<'settings:getPaths'> => {
    return { proxyDir: getProxyDir(), exportDir: getExportDir() }
  })

  ipcMain.handle('settings:setPath', (_e, req: IpcRequest<'settings:setPath'>): IpcResponse<'settings:setPath'> => {
    setPathOverride(req.key, req.path)
    return { proxyDir: getProxyDir(), exportDir: getExportDir() }
  })
}
