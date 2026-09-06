import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

type PathKey = 'exportDir' | 'proxyDir'

const LABELS: Record<PathKey, { title: string; desc: string }> = {
  exportDir: {
    title: 'クリップ・ハイライトの書き出し先',
    desc: '「クリップを書き出す」「ハイライトを作る」で生成したmp4の保存先です。'
  },
  proxyDir: {
    title: '動画変換（プロキシ）の保存先',
    desc: '取り込んだ試合動画を再生・タグ付け用に変換したファイルの保存先です。'
  }
}

export function Settings(): JSX.Element {
  const backToGames = useAppStore((s) => s.backToGames)
  const [paths, setPaths] = useState<{ proxyDir: string; exportDir: string } | null>(null)
  const [teamName, setTeamName] = useState('')
  const [teamNameSaved, setTeamNameSaved] = useState(false)

  const reload = (): void => {
    window.api.invoke('settings:getPaths', undefined).then(setPaths)
    window.api.invoke('settings:get', { key: 'teamName' }).then((v) => setTeamName(v ?? ''))
  }

  useEffect(reload, [])

  const handleSaveTeamName = async (): Promise<void> => {
    await window.api.invoke('settings:set', { key: 'teamName', value: teamName.trim() })
    setTeamNameSaved(true)
    setTimeout(() => setTeamNameSaved(false), 2000)
  }

  const handleChange = async (key: PathKey): Promise<void> => {
    const picked = await window.api.invoke('dialog:pickFolder', undefined)
    if (!picked) return
    const updated = await window.api.invoke('settings:setPath', { key, path: picked.path })
    setPaths(updated)
  }

  const handleReset = async (key: PathKey): Promise<void> => {
    const updated = await window.api.invoke('settings:setPath', { key, path: null })
    setPaths(updated)
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <button onClick={backToGames} className="text-sm text-slate-400 hover:text-slate-200 mb-4">
        ← 試合一覧へ戻る
      </button>
      <h1 className="text-xl font-bold mb-6">環境設定</h1>

      <div className="bg-court-panel border border-court-border rounded-lg p-4 mb-4">
        <div className="text-sm font-medium mb-1">マイチーム情報</div>
        <p className="text-xs text-slate-500 mb-2">
          ハイライトのタイトルカードにチーム名を小さく表示します。
        </p>
        <div className="flex gap-2">
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="例: ○○ミニバスケットボールクラブ"
            className="flex-1 bg-court-bg border border-court-border rounded px-2 py-1 text-slate-100 text-sm"
          />
          <button
            onClick={handleSaveTeamName}
            className="text-xs px-3 py-1 rounded bg-court-accent font-medium whitespace-nowrap"
          >
            {teamNameSaved ? '保存しました' : '保存'}
          </button>
        </div>
      </div>

      {(['exportDir', 'proxyDir'] as const).map((key) => (
        <div key={key} className="bg-court-panel border border-court-border rounded-lg p-4 mb-4">
          <div className="text-sm font-medium mb-1">{LABELS[key].title}</div>
          <p className="text-xs text-slate-500 mb-2">{LABELS[key].desc}</p>
          <div className="text-xs text-slate-400 font-mono break-all mb-3">{paths?.[key] ?? '読み込み中...'}</div>
          <div className="flex gap-2">
            <button
              onClick={() => handleChange(key)}
              className="text-xs px-2 py-1 rounded bg-court-accent font-medium"
            >
              フォルダを変更
            </button>
            <button
              onClick={() => handleReset(key)}
              className="text-xs px-2 py-1 rounded bg-court-border hover:bg-slate-600"
            >
              既定に戻す
            </button>
          </div>
        </div>
      ))}

      <p className="text-xs text-slate-500 mt-4">
        ※ 保存先を変更しても、既存のファイルは移動されません。変更後に新しく取り込む／書き出すものから反映されます。
      </p>
    </div>
  )
}
