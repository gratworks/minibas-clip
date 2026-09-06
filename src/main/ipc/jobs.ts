import { ipcMain } from 'electron'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import { cancelJob } from '../jobs/queue'

export function registerJobsIpc(): void {
  ipcMain.handle('jobs:cancel', (_e, req: IpcRequest<'jobs:cancel'>): IpcResponse<'jobs:cancel'> => {
    cancelJob(req.jobId)
  })
}
