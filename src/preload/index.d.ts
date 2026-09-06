import type { MiniBasApi } from './index'

declare global {
  interface Window {
    api: MiniBasApi
  }
}
