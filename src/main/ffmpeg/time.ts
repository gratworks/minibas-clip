/** ffmpeg の stderr に出る `time=00:01:23.45` を秒数に変換する */
export function parseFfmpegTime(hhmmss: string): number {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(hhmmss)
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}
