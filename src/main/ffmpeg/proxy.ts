import { spawn } from 'child_process'
import { getFfmpegPath } from './bin'
import { parseFfmpegTime } from './time'

/** proxy動画のフレームレート。フレーム精度シークのため GOP を短く固定する */
export const PROXY_FPS = 30
const PROXY_GOP = 15

/**
 * iPhone等のHEVC/VFR動画をChromiumで安定再生できるH.264 720p CFR proxyへ変換する。
 * 書き出し（クリップ切り出し・ハイライト結合）も原本ではなくこのproxyから行う方針。
 */
export function transcodeProxy(
  srcPath: string,
  outPath: string,
  durationSec: number | null,
  onProgress: (percent: number, message: string) => void,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', srcPath,
      '-vf', 'scale=-2:720',
      '-r', String(PROXY_FPS),
      '-fps_mode', 'cfr',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-g', String(PROXY_GOP),
      '-keyint_min', String(PROXY_GOP),
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '2',
      '-movflags', '+faststart',
      outPath
    ]

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
      if (m && durationSec && durationSec > 0) {
        const t = parseFfmpegTime(m[1])
        const percent = Math.min(99, Math.round((t / durationSec) * 100))
        onProgress(percent, `変換中... ${percent}%`)
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
