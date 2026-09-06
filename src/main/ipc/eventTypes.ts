import { ipcMain } from 'electron'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { EventType } from '@shared/types'
import { getDb } from '../db/connection'

function toEventType(row: any): EventType {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    category: row.category,
    keyBinding: row.key_binding,
    preSec: row.pre_sec,
    postSec: row.post_sec,
    color: row.color,
    points: row.points,
    sortOrder: row.sort_order,
    enabled: row.enabled
  }
}

export function registerEventTypesIpc(): void {
  ipcMain.handle('eventTypes:list', (): IpcResponse<'eventTypes:list'> => {
    const rows = getDb().prepare('SELECT * FROM event_types ORDER BY sort_order ASC').all()
    return rows.map(toEventType)
  })

  ipcMain.handle('eventTypes:upsert', (_e, req: IpcRequest<'eventTypes:upsert'>): IpcResponse<'eventTypes:upsert'> => {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM event_types WHERE code = ?').get(req.code) as
      | { id: number }
      | undefined

    if (existing) {
      const { code: _code, ...patch } = req
      const fields = Object.keys(patch)
      if (fields.length > 0) {
        const setClause = fields.map((f) => `${toSnake(f)} = @${f}`).join(', ')
        db.prepare(`UPDATE event_types SET ${setClause} WHERE id = @id`).run({ id: existing.id, ...patch })
      }
      return toEventType(db.prepare('SELECT * FROM event_types WHERE id = ?').get(existing.id))
    }

    const info = db
      .prepare(
        `INSERT INTO event_types (code, label, category, key_binding, pre_sec, post_sec, color, points, sort_order, enabled)
         VALUES (@code, @label, @category, @keyBinding, @preSec, @postSec, @color, @points, @sortOrder, @enabled)`
      )
      .run({
        code: req.code,
        label: req.label ?? req.code,
        category: req.category ?? 'highlight',
        keyBinding: req.keyBinding ?? null,
        preSec: req.preSec ?? 3,
        postSec: req.postSec ?? 2,
        color: req.color ?? '#FF7A1A',
        points: req.points ?? 0,
        sortOrder: req.sortOrder ?? 0,
        enabled: req.enabled ?? 1
      })
    return toEventType(db.prepare('SELECT * FROM event_types WHERE id = ?').get(info.lastInsertRowid))
  })

  ipcMain.handle('eventTypes:reorder', (_e, req: IpcRequest<'eventTypes:reorder'>): IpcResponse<'eventTypes:reorder'> => {
    const db = getDb()
    db.exec('BEGIN')
    try {
      req.orderedIds.forEach((id, idx) => {
        db.prepare('UPDATE event_types SET sort_order = ? WHERE id = ?').run(idx, id)
      })
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  })
}

function toSnake(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
