import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from './util/env'
import { getDb, closeDb } from './db/connection'
import { runMigrations } from './db/migrations'
import { registerAppIpc } from './ipc/app'
import { registerPlayersIpc } from './ipc/players'
import { registerSeasonsIpc } from './ipc/seasons'
import { registerGamesIpc } from './ipc/games'
import { registerVideosIpc } from './ipc/videos'
import { registerEventTypesIpc } from './ipc/eventTypes'
import { registerEventsIpc } from './ipc/events'
import { registerLineupIpc } from './ipc/lineup'
import { registerStatsIpc } from './ipc/stats'
import { registerExportsIpc } from './ipc/exports'
import { registerJobsIpc } from './ipc/jobs'
import { registerMediaProtocolPrivileges, registerMediaProtocolHandler } from './media/protocol'
import { setJobsMainWindow } from './jobs/queue'

registerMediaProtocolPrivileges()

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  runMigrations(getDb())
  registerMediaProtocolHandler()

  registerAppIpc()
  registerPlayersIpc()
  registerSeasonsIpc()
  registerGamesIpc()
  registerVideosIpc()
  registerEventTypesIpc()
  registerEventsIpc()
  registerLineupIpc()
  registerStatsIpc()
  registerExportsIpc()
  registerJobsIpc()

  setJobsMainWindow(createWindow())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) setJobsMainWindow(createWindow())
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
