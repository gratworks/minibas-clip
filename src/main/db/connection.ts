import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'

/**
 * better-sqlite3 は Windows でネイティブビルド(node-gyp + Python + VC++)が必要になり、
 * このマシンに構築済みの環境がなかったため不採用。Electron 33+ が同梱する Node には
 * node:sqlite (DatabaseSync) が標準搭載されており、ビルドチェーン不要で完結する。
 * API は better-sqlite3 とほぼ同じ（prepare().run()/get()/all()、@name 名前付きパラメータ）。
 */
let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db

  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'data.db')

  db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
