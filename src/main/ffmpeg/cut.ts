import { spawn } from 'child_process'
import { getFfmpegPath } from './bin'
import { parseFfmpegTime } from './time'

/** drawtextフィルタのオプション値（'...'で囲む前提）用にエスケープする */
function escapeDrawtextValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

/** フォントファイルのパスを drawtext の fontfile= 値として使える形式にする（Windowsの `C:` 等を考慮） */
function toFilterPath(path: string): string {
  return escapeDrawtextValue(path.replace(/\\/g, '/'))
}

export interface CutOptions {
  srcPath: string
  outPath: string
  startSec: number
  endSec: number
  /** 指定すると動画下部にテキストを焼き込む（fontPathとセットで指定） */
  captionText?: string
  fontPath?: string
}

export function cutClip(
  opts: CutOptions,
  onProgress: (percent: number, message: string) => void,
  signal: AbortSignal
): Promise<void> {
  const duration = Math.max(0.1, opts.endSec - opts.startSec)

  return new Promise((resolve, reject) => {
    const args = ['-y', '-ss', String(Math.max(0, opts.startSec)), '-i', opts.srcPath, '-t', String(duration)]

    if (opts.captionText && opts.fontPath) {
      const text = escapeDrawtextValue(opts.captionText)
      const fontfile = toFilterPath(opts.fontPath)
      args.push(
        '-vf',
        `drawtext=fontfile='${fontfile}':text='${text}':expansion=none:fontsize=36:fontcolor=white:` +
          `shadowcolor=black@0.3:shadowx=2:shadowy=2:x=24:y=h-th-24`
      )
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      opts.outPath
    )

    const child = spawn(getFfmpegPath(), args, { windowsHide: true })
    let stderrTail = ''

    const onAbort = (): void => {
      child.kill()
    }
    signal.addEventListener('abort', onAbort, { once: true })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrTail = (stderrTail + text).slice(-4000)
      const m = /time=(\d+:\d+:\d+(?:\.\d+)?)/.exec(text)
      if (m) {
        const t = parseFfmpegTime(m[1])
        const percent = Math.min(99, Math.round((t / duration) * 100))
        onProgress(percent, `切り出し中... ${percent}%`)
      }
    })

    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) {
        reject(new Error('canceled'))
      } else if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg がコード${code}で終了しました: ${stderrTail.slice(-500)}`))
      }
    })
  })
}
