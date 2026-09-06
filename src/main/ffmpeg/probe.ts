import { execFile } from 'child_process'
import { promisify } from 'util'
import { getFfmpegPath, getFfprobePath } from './bin'

const execFileAsync = promisify(execFile)

/** Phase 0 の動作確認用: 同梱 ffmpeg に drawtext フィルタが含まれるか調べる */
export async function hasDrawtextFilter(): Promise<boolean> {
  const { stdout } = await execFileAsync(getFfmpegPath(), ['-hide_banner', '-filters'])
  return /\bdrawtext\b/.test(stdout)
}

export interface ProbeResult {
  durationSec: number | null
  fps: number | null
  width: number | null
  height: number | null
  vcodec: string | null
}

export async function probeVideo(srcPath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(getFfprobePath(), [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    srcPath
  ])
  const data = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string }>
  }
  const vStream = data.streams?.find((s) => s.codec_type === 'video')
  let fps: number | null = null
  if (vStream?.r_frame_rate) {
    const [num, den] = vStream.r_frame_rate.split('/').map(Number)
    if (den) fps = num / den
  }
  return {
    durationSec: data.format?.duration ? Number(data.format.duration) : null,
    fps,
    width: vStream?.width ?? null,
    height: vStream?.height ?? null,
    vcodec: vStream?.codec_name ?? null
  }
}
