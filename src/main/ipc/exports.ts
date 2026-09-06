import { app, ipcMain } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { rm } from 'fs/promises'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import { getDb } from '../db/connection'
import { getFontPath } from '../ffmpeg/bin'
import { cutClip } from '../ffmpeg/cut'
import { concatClips, createTitleCard } from '../ffmpeg/concat'
import { probeVideo } from '../ffmpeg/probe'
import { enqueueJob } from '../jobs/queue'
import { getExportDir } from '../util/paths'

const TITLE_CARD_SEC = 2.5

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'export'
}

function defaultExportDir(): string {
  return getExportDir()
}

function resolvePlaybackPath(video: { proxy_status: string; proxy_path: string | null; src_path: string }): string {
  return video.proxy_status === 'done' && video.proxy_path ? video.proxy_path : video.src_path
}

function recordExport(kind: 'clip' | 'highlight', gameId: number | null, playerId: number | null, outputPath: string, eventIds: number[]): void {
  getDb()
    .prepare(
      `INSERT INTO exports (game_id, player_id, kind, output_path, event_ids, status)
       VALUES (@gameId, @playerId, @kind, @outputPath, @eventIds, 'done')`
    )
    .run({ gameId, playerId, kind, outputPath, eventIds: JSON.stringify(eventIds) })
}

export function registerExportsIpc(): void {
  ipcMain.handle('export:clip', (_e, req: IpcRequest<'export:clip'>): IpcResponse<'export:clip'> => {
    const db = getDb()
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.eventId) as any
    if (!ev) throw new Error('イベントが見つかりません')
    const et = db.prepare('SELECT * FROM event_types WHERE id = ?').get(ev.event_type_id) as any
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(ev.video_id) as any
    if (!video) throw new Error('動画が見つかりません')

    const srcPath = resolvePlaybackPath(video)
    const startSec = ev.clip_in_sec ?? Math.max(0, ev.t_sec - (et?.pre_sec ?? 3))
    const endSec = ev.clip_out_sec ?? ev.t_sec + (et?.post_sec ?? 2)

    const outDir = defaultExportDir()
    mkdirSync(outDir, { recursive: true })
    const outPath = join(outDir, `${sanitizeFileName(et?.label ?? 'clip')}_${Date.now()}.mp4`)

    const jobId = enqueueJob('clip', async ({ signal, onProgress }) => {
      await cutClip({ srcPath, outPath, startSec, endSec }, onProgress, signal)
      recordExport('clip', ev.game_id, ev.player_id, outPath, [ev.id])
      return { outputPath: outPath }
    })

    return { jobId }
  })

  ipcMain.handle('export:highlight', (_e, req: IpcRequest<'export:highlight'>): IpcResponse<'export:highlight'> => {
    if (req.eventIds.length === 0) throw new Error('イベントが選択されていません')

    const db = getDb()
    const placeholders = req.eventIds.map((_, i) => `@id${i}`).join(', ')
    const params: Record<string, number> = {}
    req.eventIds.forEach((id, i) => {
      params[`id${i}`] = id
    })

    const rows = db
      .prepare(
        `SELECT e.*, et.label AS et_label, et.pre_sec AS et_pre_sec, et.post_sec AS et_post_sec,
                COALESCE(ps.number, p.number) AS p_number, p.name AS p_name
         FROM events e
         JOIN event_types et ON et.id = e.event_type_id
         JOIN games g ON g.id = e.game_id
         LEFT JOIN players p ON p.id = e.player_id
         LEFT JOIN player_seasons ps ON ps.player_id = p.id AND ps.season = g.season
         WHERE e.id IN (${placeholders})
         ORDER BY e.t_sec ASC`
      )
      .all(params) as any[]
    if (rows.length === 0) throw new Error('イベントが見つかりません')

    const videoIds = [...new Set(rows.map((r) => r.video_id as number))]
    const videos = new Map<number, any>()
    for (const vid of videoIds) {
      videos.set(vid, db.prepare('SELECT * FROM videos WHERE id = ?').get(vid))
    }

    const outDir = req.outDir && req.outDir.length > 0 ? req.outDir : defaultExportDir()
    mkdirSync(outDir, { recursive: true })
    const outPath = join(outDir, `${sanitizeFileName(req.title)}_${Date.now()}.mp4`)

    const jobId = enqueueJob('highlight', async ({ signal, onProgress }) => {
      const workDir = join(app.getPath('temp'), `minibasclip-highlight-${Date.now()}`)
      mkdirSync(workDir, { recursive: true })

      try {
        const fontPath = req.withCaption || req.withTitleCard ? getFontPath('NotoSansJP-Bold.ttf') : null
        const clipPaths: string[] = []

        for (let i = 0; i < rows.length; i++) {
          if (signal.aborted) throw new Error('canceled')
          const r = rows[i]
          const video = videos.get(r.video_id)
          const srcPath = resolvePlaybackPath(video)
          const clipPath = join(workDir, `clip_${i}.mp4`)
          const caption = req.withCaption
            ? [r.p_number ? `#${r.p_number} ${r.p_name}` : null, r.et_label].filter(Boolean).join(' ')
            : undefined

          await cutClip(
            {
              srcPath,
              outPath: clipPath,
              startSec: r.clip_in_sec ?? Math.max(0, r.t_sec - r.et_pre_sec),
              endSec: r.clip_out_sec ?? r.t_sec + r.et_post_sec,
              captionText: caption,
              fontPath: caption ? (fontPath ?? undefined) : undefined
            },
            (percent) =>
              onProgress(
                Math.round(((i + percent / 100) / rows.length) * 85),
                `クリップ切り出し中 (${i + 1}/${rows.length})`
              ),
            signal
          )
          clipPaths.push(clipPath)
        }

        if (req.withTitleCard && fontPath) {
          onProgress(87, 'タイトルカードを作成中...')
          const probe = await probeVideo(clipPaths[0])
          const size = `${probe.width ?? 1280}x${probe.height ?? 720}`
          const titleCardPath = join(workDir, 'title.mp4')
          const teamNameRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('teamName') as
            | { value: string }
            | undefined
          await createTitleCard(
            req.title,
            titleCardPath,
            fontPath,
            TITLE_CARD_SEC,
            size,
            signal,
            teamNameRow?.value || undefined
          )
          clipPaths.unshift(titleCardPath)
        }

        onProgress(92, '結合中...')
        await concatClips(clipPaths, outPath, signal)

        const primaryPlayerId = rows.find((r) => r.player_id !== null)?.player_id ?? null
        recordExport('highlight', rows[0].game_id, primaryPlayerId, outPath, rows.map((r) => r.id))

        return { outputPath: outPath }
      } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {})
      }
    })

    return { jobId }
  })
}
