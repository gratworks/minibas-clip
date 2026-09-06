import { useEffect, useState } from 'react'
import type { JobProgress } from '@shared/types'

/** 実行中/直近完了のジョブ進捗を jobId をキーに保持する（トースト表示用） */
export function useJobProgress(): Record<string, JobProgress> {
  const [jobsById, setJobsById] = useState<Record<string, JobProgress>>({})

  useEffect(() => {
    return window.api.onJobProgress((payload) => {
      setJobsById((prev) => ({ ...prev, [payload.jobId]: payload }))

      if (payload.status === 'done' || payload.status === 'error' || payload.status === 'canceled') {
        setTimeout(() => {
          setJobsById((prev) => {
            const next = { ...prev }
            delete next[payload.jobId]
            return next
          })
        }, 4000)
      }
    })
  }, [])

  return jobsById
}
