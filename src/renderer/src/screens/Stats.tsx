import { useEffect, useState } from 'react'
import type { GameSummary, PlayerStatRow } from '@shared/types'
import { useAppStore } from '../store/useAppStore'

const COLUMNS: Array<{ key: keyof PlayerStatRow; label: string; pct?: boolean }> = [
  { key: 'gp', label: '試合数' },
  { key: 'pts', label: '得点' },
  { key: 'fgm', label: 'FG成功' },
  { key: 'fga', label: 'FG試投' },
  { key: 'fgPct', label: 'FG%', pct: true },
  { key: 'ftm', label: 'FT成功' },
  { key: 'fta', label: 'FT試投' },
  { key: 'ftPct', label: 'FT%', pct: true },
  { key: 'oreb', label: 'OREB' },
  { key: 'dreb', label: 'DREB' },
  { key: 'reb', label: 'REB' },
  { key: 'ast', label: 'AST' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'tov', label: 'TOV' },
  { key: 'pf', label: 'PF' }
]

export function Stats({ gameId }: { gameId: number }): JSX.Element {
  const backToGame = useAppStore((s) => s.backToGame)
  const [game, setGame] = useState<GameSummary | null>(null)
  const [scope, setScope] = useState<'game' | 'season'>('game')
  const [rows, setRows] = useState<PlayerStatRow[]>([])

  useEffect(() => {
    window.api.invoke('games:get', { id: gameId }).then(setGame)
  }, [gameId])

  useEffect(() => {
    if (!game) return
    if (scope === 'game') {
      window.api.invoke('stats:game', { gameId }).then(setRows)
    } else {
      window.api.invoke('stats:season', { season: game.season }).then(setRows)
    }
  }, [gameId, game, scope])

  const handleExportCsv = async (): Promise<void> => {
    const result = await window.api.invoke('stats:exportCsv', {
      scope,
      id: scope === 'game' ? gameId : (game?.season ?? '')
    })
    if (result) {
      await window.api.invoke('shell:showInFolder', { path: result.path })
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <button onClick={backToGame} className="text-sm text-slate-400 hover:text-slate-200 mb-4">
        ← 試合画面へ戻る
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold">スタッツ{game && ` - ${game.date} vs ${game.opponent ?? '(未設定)'}`}</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded overflow-hidden border border-court-border text-xs">
            <button
              onClick={() => setScope('game')}
              className={`px-3 py-1.5 ${scope === 'game' ? 'bg-court-accent text-black' : 'bg-court-panel hover:bg-court-border'}`}
            >
              この試合
            </button>
            <button
              onClick={() => setScope('season')}
              className={`px-3 py-1.5 ${scope === 'season' ? 'bg-court-accent text-black' : 'bg-court-panel hover:bg-court-border'}`}
            >
              シーズン通算
            </button>
          </div>
          <button onClick={handleExportCsv} className="text-xs px-3 py-1.5 rounded bg-court-accent font-medium">
            CSV書き出し
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-slate-400 text-sm">スタッツ対象のイベントがまだありません。</p>
      ) : (
        <div className="overflow-x-auto bg-court-panel border border-court-border rounded-lg">
          <table className="w-full text-xs text-right">
            <thead>
              <tr className="border-b border-court-border text-slate-400">
                <th className="text-left px-3 py-2">選手</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-3 py-2 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.playerId}
                  className={`border-b border-court-border/50 last:border-0 ${i % 2 === 1 ? 'bg-white/[0.04]' : ''}`}
                >
                  <td className="text-left px-3 py-2 whitespace-nowrap">
                    #{r.playerNumber} {r.playerName}
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-3 py-2 font-mono">
                      {c.pct ? `${(Number(r[c.key]) * 100).toFixed(1)}%` : String(r[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
