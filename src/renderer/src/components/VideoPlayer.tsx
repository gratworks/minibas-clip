import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Video } from '@shared/types'
import { formatTime } from '../lib/format'

const PROXY_FPS = 30
const SPEEDS = [1, 1.5, 2, 4, 8]
type Direction = 0 | 1 | -1

export interface VideoPlayerHandle {
  seekTo: (sec: number) => void
  getCurrentTime: () => number
}

interface VideoPlayerProps {
  video: Video
  onTimeUpdate?: (sec: number) => void
  onDurationChange?: (sec: number) => void
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { video, onTimeUpdate, onDurationChange },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [dir, setDir] = useState<Direction>(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const isReady = video.proxyStatus === 'done'
  const fps = PROXY_FPS

  // 逆再生用ループ（HTML5 videoはネイティブの負のplaybackRateに対応していないため、
  // requestAnimationFrameで少しずつcurrentTimeを巻き戻して疑似的に逆再生を実現する）
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  const stopReverseLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastTsRef.current = null
  }, [])

  const runReverseLoop = useCallback(
    (speed: number) => {
      const step = (ts: number): void => {
        const el = videoRef.current
        if (!el) return
        if (lastTsRef.current !== null) {
          const deltaSec = (ts - lastTsRef.current) / 1000
          const next = el.currentTime - deltaSec * speed
          if (next <= 0) {
            el.currentTime = 0
            setDir(0)
            stopReverseLoop()
            return
          }
          el.currentTime = next
        }
        lastTsRef.current = ts
        rafRef.current = requestAnimationFrame(step)
      }
      lastTsRef.current = null
      rafRef.current = requestAnimationFrame(step)
    },
    [stopReverseLoop]
  )

  // dir/speedIdxが変わるたびに実際の再生方法（ネイティブ再生 or 逆再生ループ）を切り替える
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    stopReverseLoop()

    if (dir === 1) {
      el.playbackRate = SPEEDS[speedIdx]
      void el.play()
    } else if (dir === -1) {
      el.pause()
      runReverseLoop(SPEEDS[speedIdx])
    } else {
      el.pause()
    }

    return () => stopReverseLoop()
  }, [dir, speedIdx, runReverseLoop, stopReverseLoop])

  const stepFrame = useCallback(
    (deltaFrames: number) => {
      const el = videoRef.current
      if (!el) return
      setDir(0)
      const target = Math.min(Math.max(el.currentTime + deltaFrames / fps, 0), el.duration || Infinity)
      el.currentTime = target
    },
    [fps]
  )

  const seekBy = useCallback((deltaSec: number) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = Math.min(Math.max(el.currentTime + deltaSec, 0), el.duration || Infinity)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      seekTo(sec: number) {
        const el = videoRef.current
        if (!el) return
        stopReverseLoop()
        setDir(0)
        el.currentTime = Math.min(Math.max(sec, 0), el.duration || Infinity)
      },
      getCurrentTime() {
        return videoRef.current?.currentTime ?? 0
      }
    }),
    [stopReverseLoop]
  )

  // L: より前向きに（停止/逆再生中→前進1x、前進中→加速）
  const pressL = useCallback(() => {
    if (dir === 1) {
      setSpeedIdx((idx) => Math.min(idx + 1, SPEEDS.length - 1))
    } else if (dir === -1) {
      if (speedIdx > 0) {
        setSpeedIdx((idx) => idx - 1)
      } else {
        setDir(1)
        setSpeedIdx(0)
      }
    } else {
      setDir(1)
      setSpeedIdx(0)
    }
  }, [dir, speedIdx])

  // J: より後ろ向きに（停止/前進中→逆再生1x、逆再生中→加速）
  const pressJ = useCallback(() => {
    if (dir === -1) {
      setSpeedIdx((idx) => Math.min(idx + 1, SPEEDS.length - 1))
    } else if (dir === 1) {
      if (speedIdx > 0) {
        setSpeedIdx((idx) => idx - 1)
      } else {
        setDir(-1)
        setSpeedIdx(0)
      }
    } else {
      setDir(-1)
      setSpeedIdx(0)
    }
  }, [dir, speedIdx])

  const pressK = useCallback(() => {
    setDir(0)
  }, [])

  const togglePlay = useCallback(() => {
    setDir((d) => (d === 0 ? 1 : 0))
    setSpeedIdx(0)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!isReady) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'j':
        case 'J':
          e.preventDefault()
          pressJ()
          break
        case 'k':
        case 'K':
          e.preventDefault()
          pressK()
          break
        case 'l':
        case 'L':
          e.preventDefault()
          pressL()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.ctrlKey) seekBy(-5)
          else if (e.shiftKey) seekBy(-1)
          else stepFrame(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.ctrlKey) seekBy(5)
          else if (e.shiftKey) seekBy(1)
          else stepFrame(1)
          break
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [isReady, togglePlay, pressJ, pressK, pressL, seekBy, stepFrame])

  if (!isReady) {
    return (
      <div className="aspect-video bg-black rounded-lg flex items-center justify-center text-slate-400 text-sm">
        {video.proxyStatus === 'error' ? '変換に失敗しました' : '動画を変換中です...しばらくお待ちください'}
      </div>
    )
  }

  const speedLabel = dir === 0 ? '停止中' : `${dir === -1 ? '◀' : '▶'} ${SPEEDS[speedIdx]}x`

  return (
    <div>
      <video
        ref={videoRef}
        src={`media://video/${video.id}`}
        className="w-full aspect-video bg-black rounded-lg"
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime
          setCurrentTime(t)
          onTimeUpdate?.(t)
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          setDuration(d)
          onDurationChange?.(d)
        }}
        onEnded={() => setDir(0)}
      />
      <div className="flex items-center gap-3 mt-2 text-sm">
        <button onClick={togglePlay} className="px-3 py-1 rounded bg-court-border hover:bg-slate-600">
          {dir !== 0 ? '一時停止 (Space)' : '再生 (Space)'}
        </button>
        <button onClick={() => stepFrame(-1)} className="px-2 py-1 rounded bg-court-border hover:bg-slate-600">
          -1F
        </button>
        <button onClick={() => stepFrame(1)} className="px-2 py-1 rounded bg-court-border hover:bg-slate-600">
          +1F
        </button>
        <span className="text-slate-400 font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <span className="text-court-accent w-16">{speedLabel}</span>
        <span className="text-slate-500 text-xs ml-auto">
          J: 逆再生・加速 / K: 停止 / L: 再生・加速 / ←→: 1フレーム / Shift+←→: 1秒 / Ctrl+←→: 5秒
        </span>
      </div>
    </div>
  )
})
