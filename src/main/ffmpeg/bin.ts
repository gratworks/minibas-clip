import { app } from 'electron'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'

/**
 * ffmpeg-static / ffprobe-static はパッケージ後 app.asar 内を指すため、
 * asarUnpack した実体パス（app.asar.unpacked）へ書き換える。
 * dev 実行時（app.isPackaged === false）はそのまま使う。
 */
function resolveUnpacked(p: string): string {
  if (!app.isPackaged) return p
  return p.replace('app.asar', 'app.asar.unpacked')
}

export function getFfmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require('ffmpeg-static') as string
  const resolved = resolveUnpacked(raw)
  if (!existsSync(resolved)) {
    throw new Error(`ffmpeg バイナリが見つかりません: ${resolved}`)
  }
  return resolved
}

export function getFfprobePath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require('ffprobe-static').path as string
  const resolved = resolveUnpacked(raw)
  if (!existsSync(resolved)) {
    throw new Error(`ffprobe バイナリが見つかりません: ${resolved}`)
  }
  return resolved
}

/**
 * drawtext用フォントの実体パスを返す。
 * ffmpegのdrawtextフィルタはパスに日本語や特殊文字が含まれると解析に失敗しやすいため、
 * 同梱フォントをASCIIのみのuserData配下へ一度コピーし、そちらのパスを使う。
 */
export function getFontPath(filename: string): string {
  const bundledBase = app.isPackaged
    ? join(process.resourcesPath, 'fonts')
    : join(app.getAppPath(), 'resources', 'fonts')
  const bundled = join(bundledBase, filename)
  if (!existsSync(bundled)) {
    throw new Error(`フォントファイルが見つかりません: ${bundled}`)
  }

  const safeDir = join(app.getPath('userData'), 'fonts')
  mkdirSync(safeDir, { recursive: true })
  const safePath = join(safeDir, filename)
  if (!existsSync(safePath)) {
    copyFileSync(bundled, safePath)
  }
  return safePath
}
