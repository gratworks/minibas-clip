import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse, JobProgressPayload } from '@shared/ipc'
import { JOB_PROGRESS_EVENT } from '@shared/ipc'

function invoke<C extends IpcChannel>(channel: C, req: IpcRequest<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, req)
}

const api = {
  invoke,
  onJobProgress(listener: (payload: JobProgressPayload) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: JobProgressPayload): void => listener(payload)
    ipcRenderer.on(JOB_PROGRESS_EVENT, handler)
    return () => ipcRenderer.removeListener(JOB_PROGRESS_EVENT, handler)
  }
}

export type MiniBasApi = typeof api

contextBridge.exposeInMainWorld('api', api)
