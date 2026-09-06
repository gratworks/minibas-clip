import { app } from 'electron'
import { join } from 'path'
import { getDb } from '../db/connection'

type PathKey = 'proxyDir' | 'exportDir'

function getOverride(key: PathKey): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

/** 動画変換（プロキシ）ファイルの保存先。設定で上書きされていなければ userData 配下 */
export function getProxyDir(): string {
  return getOverride('proxyDir') ?? join(app.getPath('userData'), 'proxies')
}

/** クリップ・ハイライト書き出し先。設定で上書きされていなければ 動画/MiniBas Clip 配下 */
export function getExportDir(): string {
  return getOverride('exportDir') ?? join(app.getPath('videos'), 'MiniBas Clip')
}

/**
 * 試合日・動画IDから、そのプロキシ変換ファイルが置かれる（はずの）パスを求める。
 * エクスプローラーでファイル名を見ただけでどの試合の動画か分かるよう試合日を先頭に入れる。
 * 変換中に削除された場合など、DBにまだ proxy_path が記録されていないケースの掃除にも使う。
 */
export function proxyPathFor(gameDate: string, videoId: number): string {
  return join(getProxyDir(), `${gameDate}_${videoId}.mp4`)
}

/** path に null を渡すと既定値に戻す（設定を削除する） */
export function setPathOverride(key: PathKey, path: string | null): void {
  const db = getDb()
  if (path === null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  } else {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value'
    ).run({ key, value: path })
  }
}
