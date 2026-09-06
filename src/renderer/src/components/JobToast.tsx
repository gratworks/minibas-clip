import type { JobProgress } from '@shared/types'

const KIND_LABEL: Record<JobProgress['kind'], string> = {
  proxy: '動画変換',
  clip: 'クリップ書き出し',
  highlight: 'ハイライト書き出し'
}

const STATUS_COLOR: Record<JobProgress['status'], string> = {
  queued: 'bg-slate-500',
  running: 'bg-court-accent',
  done: 'bg-green-500',
  error: 'bg-red-500',
  canceled: 'bg-slate-500'
}

export function JobToast({ jobs }: { jobs: Record<string, JobProgress> }): JSX.Element | null {
  const list = Object.values(jobs)
  if (list.length === 0) return null

  const handleCancel = (jobId: string): void => {
    void window.api.invoke('jobs:cancel', { jobId })
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {list.map((job) => (
        <div key={job.jobId} className="bg-court-panel border border-court-border rounded-lg p-3 shadow-lg text-sm">
          <div className="flex justify-between items-center mb-1 gap-2">
            <span className="font-medium">{KIND_LABEL[job.kind]}</span>
            <span className="text-slate-400 flex items-center gap-2">
              {job.status === 'running' ? `${job.percent}%` : job.message}
              {(job.status === 'running' || job.status === 'queued') && (
                <button
                  onClick={() => handleCancel(job.jobId)}
                  className="text-xs text-slate-400 hover:text-red-400 underline"
                >
                  中止
                </button>
              )}
            </span>
          </div>
          <div className="h-1.5 bg-court-border rounded-full overflow-hidden">
            <div
              className={`h-full ${STATUS_COLOR[job.status]} transition-all`}
              style={{ width: `${job.status === 'done' ? 100 : job.percent}%` }}
            />
          </div>
          {job.status === 'running' && <p className="text-xs text-slate-400 mt-1">{job.message}</p>}
        </div>
      ))}
    </div>
  )
}
