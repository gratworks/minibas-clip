import { useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { Games } from './screens/Games'
import { GameDetail } from './screens/GameDetail'
import { Roster } from './screens/Roster'
import { Stats } from './screens/Stats'
import { Settings } from './screens/Settings'
import { JobToast } from './components/JobToast'
import { useJobProgress } from './hooks/useJobProgress'

function DiagnosticsBar(): JSX.Element {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const openRoster = useAppStore((s) => s.openRoster)
  const openSettings = useAppStore((s) => s.openSettings)

  useEffect(() => {
    window.api
      .invoke('diagnostics:ffmpeg', undefined)
      .then((r) => setStatus(r.hasDrawtext ? 'ok' : 'error'))
      .catch(() => setStatus('error'))
  }, [])

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-slate-500 border-b border-court-border">
      <span>MiniBas Clip</span>
      <span className="text-slate-700">|</span>
      <span>
        ffmpeg: {status === 'checking' ? '確認中...' : status === 'ok' ? '正常 ✅' : '異常 ❌'}
      </span>
      <button onClick={openRoster} className="ml-auto hover:text-slate-200">
        選手管理
      </button>
      <button onClick={openSettings} className="hover:text-slate-200">
        環境設定
      </button>
    </div>
  )
}

function App(): JSX.Element {
  const screen = useAppStore((s) => s.screen)
  const selectedGameId = useAppStore((s) => s.selectedGameId)
  const jobs = useJobProgress()

  return (
    <div className="min-h-screen bg-court-bg text-slate-100">
      <DiagnosticsBar />
      {screen === 'games' && <Games />}
      {screen === 'gameDetail' && selectedGameId !== null && <GameDetail gameId={selectedGameId} />}
      {screen === 'roster' && <Roster />}
      {screen === 'stats' && selectedGameId !== null && <Stats gameId={selectedGameId} />}
      {screen === 'settings' && <Settings />}
      <JobToast jobs={jobs} />
    </div>
  )
}

export default App
