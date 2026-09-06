import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { JobKind, JobProgress, JobStatus } from '@shared/types'
import { JOB_PROGRESS_EVENT } from '@shared/ipc'

let mainWindowRef: BrowserWindow | null = null

/** ジョブ進捗をrendererへ送るための対象ウィンドウ。createWindow後にindex.tsから設定する */
export function setJobsMainWindow(win: BrowserWindow): void {
  mainWindowRef = win
}

export type JobRunner = (ctx: {
  signal: AbortSignal
  onProgress: (percent: number, message: string) => void
}) => Promise<{ outputPath?: string }>

interface QueuedJob {
  jobId: string
  kind: JobKind
  videoId?: number
  run: JobRunner
  controller: AbortController
  status: JobStatus
}

const jobs = new Map<string, QueuedJob>()
const pending: string[] = []
let activeJobId: string | null = null

function emit(job: QueuedJob, percent: number, message: string, status: JobStatus, outputPath?: string): void {
  const payload: JobProgress = {
    jobId: job.jobId,
    kind: job.kind,
    percent,
    message,
    status,
    outputPath,
    videoId: job.videoId
  }
  mainWindowRef?.webContents.send(JOB_PROGRESS_EVENT, payload)
}

async function runNext(): Promise<void> {
  if (activeJobId) return
  const jobId = pending.shift()
  if (!jobId) return
  const job = jobs.get(jobId)
  if (!job) return

  activeJobId = jobId
  job.status = 'running'
  emit(job, 0, '開始しました', 'running')

  try {
    const result = await job.run({
      signal: job.controller.signal,
      onProgress: (percent, message) => emit(job, percent, message, 'running')
    })
    job.status = 'done'
    emit(job, 100, '完了しました', 'done', result.outputPath)
  } catch (err) {
    if (job.controller.signal.aborted) {
      job.status = 'canceled'
      emit(job, 0, 'キャンセルしました', 'canceled')
    } else {
      job.status = 'error'
      emit(job, 0, err instanceof Error ? err.message : String(err), 'error')
    }
  } finally {
    jobs.delete(jobId)
    activeJobId = null
    void runNext()
  }
}

export function enqueueJob(kind: JobKind, run: JobRunner, opts?: { videoId?: number }): string {
  const jobId = randomUUID()
  jobs.set(jobId, {
    jobId,
    kind,
    videoId: opts?.videoId,
    run,
    controller: new AbortController(),
    status: 'queued'
  })
  pending.push(jobId)
  void runNext()
  return jobId
}

export function cancelJob(jobId: string): void {
  const job = jobs.get(jobId)
  job?.controller.abort()
  const idx = pending.indexOf(jobId)
  if (idx >= 0) {
    pending.splice(idx, 1)
    jobs.delete(jobId)
  }
}
