import type { Player } from '@shared/types'

const QUARTERS = [1, 2, 3, 4]

export function LineupGrid({
  players,
  appearances,
  onToggle
}: {
  players: Player[]
  appearances: Set<string>
  onToggle: (playerId: number, quarter: number) => void
}): JSX.Element {
  return (
    <div className="bg-court-panel border border-court-border rounded-lg p-3">
      <h2 className="font-semibold text-sm mb-2">出場記録</h2>
      {players.length === 0 ? (
        <p className="text-slate-500 text-xs">選手が登録されていません。</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400">
              <th className="text-left font-normal pb-1">選手</th>
              {QUARTERS.map((q) => (
                <th key={q} className="font-normal pb-1 w-7">
                  Q{q}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td className="py-0.5 truncate max-w-[9rem]">
                  #{p.number} {p.name}
                </td>
                {QUARTERS.map((q) => (
                  <td key={q} className="text-center">
                    <input
                      type="checkbox"
                      checked={appearances.has(`${p.id}-${q}`)}
                      onChange={() => onToggle(p.id, q)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
