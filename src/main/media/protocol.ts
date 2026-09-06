import { protocol } from 'electron'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { extname } from 'path'
import { getDb } from '../db/connection'

/**
 * renderer は動画の実パスを一切知らず media://video/{id} だけを扱う。
 * 日本語パス・スペース混じりのパス対策も兼ねる。
 * app.whenReady() より前に呼ぶ必要がある（Electronの制約）。
 */
export function registerMediaProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'media',
      privileges: {
        standard: true,
        stream: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ])
}

function resolveVideoPath(id: number): string | null {
  const row = getDb()
    .prepare('SELECT src_path, proxy_path, proxy_status FROM videos WHERE id = ?')
    .get(id) as { src_path: string; proxy_path: string | null; proxy_status: string } | undefined
  if (!row) return null
  if (row.proxy_status === 'done' && row.proxy_path) return row.proxy_path
  return row.src_path
}

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo'
}

function guessMime(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * app.whenReady() 以降に呼ぶ。
 * net.fetch(file://...) への委譲は、後方（巻き戻し）シークで Chromium が
 * 位置を0にリセットしてしまう不具合があったため、Rangeヘッダーを自前で解釈して
 * 206 Partial Content を返す方式に切り替えた。
 */
export function registerMediaProtocolHandler(): void {
  protocol.handle('media', async (request) => {
    const url = new URL(request.url)
    // media://video/{id}
    const id = Number(url.pathname.replace(/^\/+/, ''))
    if (url.hostname !== 'video' || !Number.isFinite(id)) {
      return new Response('bad request', { status: 400 })
    }

    const filePath = resolveVideoPath(id)
    if (!filePath) {
      return new Response('not found', { status: 404 })
    }

    let fileSize: number
    try {
      fileSize = (await stat(filePath)).size
    } catch {
      return new Response('not found', { status: 404 })
    }

    const mime = guessMime(filePath)
    const rangeHeader = request.headers.get('range')

    let start = 0
    let end = fileSize - 1
    let status = 200

    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
      if (match) {
        const [, startStr, endStr] = match
        if (startStr) start = Number(startStr)
        if (endStr) end = Number(endStr)
        if (!startStr && endStr) {
          // "bytes=-500" のようなサフィックス指定（末尾からNバイト）
          start = Math.max(fileSize - Number(endStr), 0)
          end = fileSize - 1
        }
        start = Math.max(0, Math.min(start, fileSize - 1))
        end = Math.max(start, Math.min(end, fileSize - 1))
        status = 206
      }
    }

    const contentLength = end - start + 1
    const nodeStream = createReadStream(filePath, { start, end })
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    const headers: Record<string, string> = {
      'Content-Type': mime,
      'Content-Length': String(contentLength),
      'Accept-Ranges': 'bytes'
    }
    if (status === 206) {
      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`
    }

    return new Response(webStream, { status, headers })
  })
}
