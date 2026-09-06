import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join, dirname } from 'path'
import { getFfmpegPath } from './bin'

function runFfmpeg(args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegPath(), args, { windowsHide: true })
    let stderrTail = ''

    const onAbort = (): void => {
      child.kill()
    }
    signal.addEventListener('abort', onAbort, { once: true })

    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000)
    })

    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) reject(new Error('canceled'))
      else if (code === 0) resolve()
      else reject(new Error(`ffmpeg がコード${code}で終了しました: ${stderrTail.slice(-500)}`))
    })
  })
}

/**
 * 同一エンコード設定（proxy由来）のmp4群を、再エンコードなしで結合する。
 * concat demuxer はコーデック・解像度が揃っている前提。
 */
export async function concatClips(clipPaths: string[], outPath: string, signal: AbortSignal): Promise<void> {
  const listPath = join(dirname(outPath), `concat_${Date.now()}.txt`)
  const listContent = clipPaths.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n')
  await writeFile(listPath, listContent, 'utf-8')

  try {
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outPath], signal)
  } finally {
    await unlink(listPath).catch(() => {})
  }
}

function escapeDrawtextValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

function toFilterPath(path: string): string {
  return escapeDrawtextValue(path.replace(/\\/g, '/'))
}

/**
 * ハイライトの冒頭に付けるタイトルカード（無音）を、対象クリップと同じ解像度で生成する。
 * subtitle（チーム名）を渡すとタイトル下に小さく表示する。
 */
export async function createTitleCard(
  text: string,
  outPath: string,
  fontPath: string,
  durationSec: number,
  size: string,
  signal: AbortSignal,
  subtitle?: string
): Promise<void> {
  const fontfile = toFilterPath(fontPath)
  const escapedText = escapeDrawtextValue(text)

  const filters = [
    `drawtext=fontfile='${fontfile}':text='${escapedText}':expansion=none:fontsize=56:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`
  ]
  if (subtitle) {
    const escapedSubtitle = escapeDrawtextValue(subtitle)
    filters.push(
      `drawtext=fontfile='${fontfile}':text='${escapedSubtitle}':expansion=none:fontsize=28:fontcolor=0xAAAAAA:x=(w-text_w)/2:y=(h/2)+56`
    )
  }

  await runFfmpeg(
    [
      '-y',
      '-f', 'lavfi', '-i', `color=c=0x15171c:s=${size}:d=${durationSec}:r=30`,
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
      '-vf', filters.join(','),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outPath
    ],
    signal
  )
}
