import { ipcMain, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync, unlinkSync } from 'fs'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { Video } from '@shared/types'
import { getDb } from '../db/connection'
import { probeVideo } from '../ffmpeg/probe'
import { transcodeProxy } from '../ffmpeg/proxy'
import { enqueueJob } from '../jobs/queue'
import { getProxyDir } from '../util/paths'

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'avi', 'mkv']

function toVideo(row: any): Video {
  return {
    id: row.id,
    gameId: row.game_id,
    srcPath: row.src_path,
    proxyPath: row.proxy_path,
    durationSec: row.duration_sec,
    fps: row.fps,
    width: row.width,
    height: row.height,
    vcodec: row.vcodec,
    proxyStatus: row.proxy_status,
    sortOrder: row.sort_order,
    createdAt: row.created_at
  }
}

function proxyDir(): string {
  const dir = getProxyDir()
  mkdirSync(dir, { recursive: true })
  return dir
}

function enqueueProxyJob(videoId: number, srcPath: string, durationSec: number | null): string {
  const outPath = join(proxyDir(), `${videoId}.mp4`)

  getDb().prepare('UPDATE videos SET proxy_status = ? WHERE id = ?').run('running', videoId)

  return enqueueJob(
    'proxy',
    async ({ signal, onProgress }) => {
      try {
        await transcodeProxy(srcPath, outPath, durationSec, onProgress, signal)
        getDb()
          .prepare('UPDATE videos SET proxy_status = ?, proxy_path = ? WHERE id = ?')
          .run('done', outPath, videoId)
        return { outputPath: outPath }
      } catch (err) {
        // キャンセル・失敗のいずれでも「変換中」のまま止まらないようにする
        getDb().prepare('UPDATE videos SET proxy_status = ? WHERE id = ?').run('error', videoId)
        throw err
      }
    },
    { videoId }
  )
}

export function registerVideosIpc(): void {
  ipcMain.handle('videos:import', async (_e, req: IpcRequest<'videos:import'>): Promise<IpcResponse<'videos:import'>> => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = await (win
      ? dialog.showOpenDialog(win, {
          title: '試合動画を選択',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: '動画ファイル', extensions: VIDEO_EXTENSIONS }]
        })
      : dialog.showOpenDialog({
          title: '試合動画を選択',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: '動画ファイル', extensions: VIDEO_EXTENSIONS }]
        }))

    if (result.canceled || result.filePaths.length === 0) {
      return { videos: [], jobIds: [] }
    }

    const db = getDb()
    const maxOrderRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM videos WHERE game_id = ?')
      .get(req.gameId) as { m: number }
    let nextOrder = maxOrderRow.m + 1

    const videos: Video[] = []
    const jobIds: string[] = []

    for (const filePath of result.filePaths) {
      const probe = await probeVideo(filePath).catch(() => null)
      const info = db
        .prepare(
          `INSERT INTO videos (game_id, src_path, duration_sec, fps, width, height, vcodec, proxy_status, sort_order)
           VALUES (@gameId, @srcPath, @durationSec, @fps, @width, @height, @vcodec, 'none', @sortOrder)`
        )
        .run({
          gameId: req.gameId,
          srcPath: filePath,
          durationSec: probe?.durationSec ?? null,
          fps: probe?.fps ?? null,
          width: probe?.width ?? null,
          height: probe?.height ?? null,
          vcodec: probe?.vcodec ?? null,
          sortOrder: nextOrder++
        })

      const videoId = Number(info.lastInsertRowid)
      const row = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId)
      const video = toVideo(row)
      videos.push(video)

      jobIds.push(enqueueProxyJob(videoId, filePath, probe?.durationSec ?? null))
    }

    return { videos, jobIds }
  })

  ipcMain.handle('videos:listByGame', (_e, req: IpcRequest<'videos:listByGame'>): IpcResponse<'videos:listByGame'> => {
    const rows = getDb()
      .prepare('SELECT * FROM videos WHERE game_id = ? ORDER BY sort_order ASC')
      .all(req.gameId)
    return rows.map(toVideo)
  })

  ipcMain.handle('videos:remove', (_e, req: IpcRequest<'videos:remove'>): IpcResponse<'videos:remove'> => {
    const db = getDb()
    const row = db.prepare('SELECT proxy_path FROM videos WHERE id = ?').get(req.id) as
      | { proxy_path: string | null }
      | undefined
    // events も ON DELETE CASCADE で一緒に削除される（元動画ファイルはパス参照のみなので削除しない）
    db.prepare('DELETE FROM videos WHERE id = ?').run(req.id)
    if (row?.proxy_path) {
      try {
        unlinkSync(row.proxy_path)
      } catch {
        // 既に無い場合などは無視
      }
    }
  })

  ipcMain.handle('videos:rebuildProxy', (_e, req: IpcRequest<'videos:rebuildProxy'>): IpcResponse<'videos:rebuildProxy'> => {
    const row = getDb().prepare('SELECT * FROM videos WHERE id = ?').get(req.id) as any
    if (!row) throw new Error('video not found')
    const jobId = enqueueProxyJob(row.id, row.src_path, row.duration_sec)
    return { jobId }
  })
}
