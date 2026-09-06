import type { DatabaseSync } from 'node:sqlite'

const SCHEMA_VERSION = 2

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  kana TEXT,
  grade INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- players.number/grade/active は「テンプレート（最新の既定値）」。
-- シーズンごとの実際の値はここで上書きし、無ければテンプレートにフォールバックする。
CREATE TABLE IF NOT EXISTS player_seasons (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  number INTEGER NOT NULL,
  grade INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, season)
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  opponent TEXT,
  venue TEXT,
  our_score INTEGER,
  opp_score INTEGER,
  season TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  src_path TEXT NOT NULL,
  proxy_path TEXT,
  duration_sec REAL,
  fps REAL,
  width INTEGER,
  height INTEGER,
  vcodec TEXT,
  proxy_status TEXT NOT NULL DEFAULT 'none',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('stat', 'highlight')),
  key_binding TEXT,
  pre_sec REAL NOT NULL DEFAULT 3,
  post_sec REAL NOT NULL DEFAULT 2,
  color TEXT NOT NULL DEFAULT '#FF7A1A',
  points INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  event_type_id INTEGER NOT NULL REFERENCES event_types(id),
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  t_sec REAL NOT NULL,
  quarter INTEGER,
  note TEXT,
  clip_in_sec REAL,
  clip_out_sec REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_game_t ON events(game_id, t_sec);
CREATE INDEX IF NOT EXISTS idx_events_player ON events(player_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type_id);

CREATE TABLE IF NOT EXISTS exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER REFERENCES games(id),
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('clip', 'highlight', 'csv')),
  output_path TEXT NOT NULL,
  event_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'done',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS game_appearances (
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quarter INTEGER NOT NULL,
  PRIMARY KEY (game_id, player_id, quarter)
);
`

/** ミニバス用の初期イベント種別（3Pなし）。stat 系はスタッツ集計対象、highlight 系は良いプレイのタグ */
const DEFAULT_EVENT_TYPES: Array<Omit<Parameters<typeof insertEventType>[1], 'id'>> = [
  { code: 'fg_made', label: '2P成功', category: 'stat', keyBinding: 'Q', preSec: 6, postSec: 2, color: '#22C55E', points: 2, sortOrder: 10 },
  { code: 'fg_miss', label: '2P失敗', category: 'stat', keyBinding: 'W', preSec: 6, postSec: 2, color: '#EF4444', points: 0, sortOrder: 20 },
  { code: 'ft_made', label: 'FT成功', category: 'stat', keyBinding: 'E', preSec: 4, postSec: 2, color: '#22C55E', points: 1, sortOrder: 30 },
  { code: 'ft_miss', label: 'FT失敗', category: 'stat', keyBinding: 'R', preSec: 4, postSec: 2, color: '#EF4444', points: 0, sortOrder: 40 },
  { code: 'oreb', label: 'オフェンスリバウンド', category: 'stat', keyBinding: 'A', preSec: 3, postSec: 2, color: '#3B82F6', points: 0, sortOrder: 50 },
  { code: 'dreb', label: 'ディフェンスリバウンド', category: 'stat', keyBinding: 'S', preSec: 3, postSec: 2, color: '#3B82F6', points: 0, sortOrder: 60 },
  { code: 'ast', label: 'アシスト', category: 'stat', keyBinding: 'D', preSec: 4, postSec: 2, color: '#A855F7', points: 0, sortOrder: 70 },
  { code: 'stl', label: 'スティール', category: 'stat', keyBinding: 'F', preSec: 3, postSec: 2, color: '#EAB308', points: 0, sortOrder: 80 },
  { code: 'blk', label: 'ブロック', category: 'stat', keyBinding: 'G', preSec: 3, postSec: 2, color: '#EAB308', points: 0, sortOrder: 90 },
  { code: 'tov', label: 'ターンオーバー', category: 'stat', keyBinding: 'T', preSec: 3, postSec: 2, color: '#EF4444', points: 0, sortOrder: 100 },
  { code: 'pf', label: 'ファウル', category: 'stat', keyBinding: 'V', preSec: 3, postSec: 2, color: '#EF4444', points: 0, sortOrder: 110 },
  { code: 'hl_defense', label: 'ナイスディフェンス', category: 'highlight', keyBinding: 'Z', preSec: 4, postSec: 2, color: '#06B6D4', points: 0, sortOrder: 120 },
  { code: 'hl_loose', label: 'ルーズボール', category: 'highlight', keyBinding: 'X', preSec: 4, postSec: 2, color: '#06B6D4', points: 0, sortOrder: 130 },
  { code: 'hl_pass', label: 'ナイスパス', category: 'highlight', keyBinding: 'C', preSec: 4, postSec: 2, color: '#06B6D4', points: 0, sortOrder: 140 },
  { code: 'hl_run', label: 'ナイスラン', category: 'highlight', keyBinding: 'B', preSec: 4, postSec: 2, color: '#06B6D4', points: 0, sortOrder: 150 }
]

function insertEventType(
  db: DatabaseSync,
  row: {
    code: string
    label: string
    category: 'stat' | 'highlight'
    keyBinding: string
    preSec: number
    postSec: number
    color: string
    points: number
    sortOrder: number
  }
): void {
  db.prepare(
    `INSERT OR IGNORE INTO event_types
      (code, label, category, key_binding, pre_sec, post_sec, color, points, sort_order, enabled)
     VALUES (@code, @label, @category, @keyBinding, @preSec, @postSec, @color, @points, @sortOrder, 1)`
  ).run(row)
}

/**
 * v1のDBでは events/exports の player_id にON DELETE句が無く、選手削除が
 * 「このイベントの選手割当を外す」ではなく外部キー制約違反で失敗していた。
 * SQLiteはCREATE TABLE後にON DELETE句だけを変更できないため、テーブルを作り直す。
 */
function migrateV1ToV2(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('BEGIN')
  try {
    db.exec(`
      CREATE TABLE events_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        event_type_id INTEGER NOT NULL REFERENCES event_types(id),
        player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        t_sec REAL NOT NULL,
        quarter INTEGER,
        note TEXT,
        clip_in_sec REAL,
        clip_out_sec REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.exec(`
      INSERT INTO events_v2
        (id, game_id, video_id, event_type_id, player_id, t_sec, quarter, note, clip_in_sec, clip_out_sec, created_at)
      SELECT id, game_id, video_id, event_type_id, player_id, t_sec, quarter, note, clip_in_sec, clip_out_sec, created_at
      FROM events
    `)
    db.exec('DROP TABLE events')
    db.exec('ALTER TABLE events_v2 RENAME TO events')
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_game_t ON events(game_id, t_sec)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_player ON events(player_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type_id)')

    db.exec(`
      CREATE TABLE exports_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER REFERENCES games(id),
        player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        kind TEXT NOT NULL CHECK (kind IN ('clip', 'highlight', 'csv')),
        output_path TEXT NOT NULL,
        event_ids TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'done',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.exec(`
      INSERT INTO exports_v2 (id, game_id, player_id, kind, output_path, event_ids, status, created_at)
      SELECT id, game_id, player_id, kind, output_path, event_ids, status, created_at
      FROM exports
    `)
    db.exec('DROP TABLE exports')
    db.exec('ALTER TABLE exports_v2 RENAME TO exports')

    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

export function runMigrations(db: DatabaseSync): void {
  db.exec(CREATE_TABLES)

  const versionRow = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined
  const currentVersion = versionRow?.version ?? 0

  if (currentVersion < 2) {
    migrateV1ToV2(db)
  }

  if (!versionRow) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION)
  } else if (versionRow.version !== SCHEMA_VERSION) {
    db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION)
  }

  const seedCount = (db.prepare('SELECT COUNT(*) AS c FROM event_types').get() as { c: number }).c
  if (seedCount === 0) {
    db.exec('BEGIN')
    try {
      for (const row of DEFAULT_EVENT_TYPES) insertEventType(db, row)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}
