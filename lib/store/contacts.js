/**
 * 联系人层（阶段 3）：contacts / contact_bindings / contact_notes
 *
 * 设计要点（见《记忆插件-实施方案》§4）：
 * - `contacts.id` 就是 `memories.subject_id` 的取值域；空串 = 关于她自己
 * - `UNIQUE(channel, external_id)`：一个通道 ID 只能属于一个联系人，冲突拒绝不覆盖
 * - 未绑定发言者用 `contact:unbound:<channel>:<external_id>`，**不落表**（避免陌生人撑爆）
 *
 * DDL 不在 schema.js 的启动 DDL 里：生产迁移由 scripts/migrate-stage3.mjs 显式执行（只写不跑）。
 */
import { now } from '../adapter/time.js'

export const CONTACTS_DDL = [
  `CREATE TABLE IF NOT EXISTS contacts (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL DEFAULT 'friend',
     display_name TEXT NOT NULL,
     relationship TEXT NOT NULL DEFAULT '',
     note TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS contact_bindings (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     contact_id TEXT NOT NULL,
     channel TEXT NOT NULL,
     account_id TEXT NOT NULL DEFAULT '',
     external_id TEXT NOT NULL,
     alias TEXT NOT NULL DEFAULT '',
     is_primary INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_binding_ext ON contact_bindings(channel, external_id)`,
  `CREATE INDEX IF NOT EXISTS idx_binding_contact ON contact_bindings(contact_id)`,
  `CREATE TABLE IF NOT EXISTS contact_notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     contact_id TEXT NOT NULL,
     kind TEXT NOT NULL DEFAULT 'fact',
     text TEXT NOT NULL,
     importance REAL NOT NULL DEFAULT 0.5,
     source_ref TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_note_contact ON contact_notes(contact_id, kind)`,
]

export class ContactError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'ContactError'
    this.code = code
    Object.assign(this, extra)
  }
}

export function hasContactsSchema(db) {
  try {
    return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_bindings'").get())
  } catch { return false }
}

/** 只建表，不写数据；迁移脚本与测试调用 */
export function ensureContactsSchema(db) {
  for (const sql of CONTACTS_DDL) db.exec(sql)
  return hasContactsSchema(db)
}

/** 主人绑定：ownerQQ 来自本地配置；可重复执行（幂等） */
export function seedOwner(db, { ownerQQ, channel = 'qq', displayName = '主人', relationship = '主人', accountId = '' } = {}) {
  const qq = String(ownerQQ ?? '').trim()
  if (!qq) throw new ContactError('E_INVALID_ARG', 'seedOwner 需要 ownerQQ')
  const t = now()
  db.prepare(`INSERT INTO contacts(id,kind,display_name,relationship,note,created_at,updated_at)
    VALUES('contact:owner','owner',?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, relationship=excluded.relationship, updated_at=excluded.updated_at`)
    .run(String(displayName), String(relationship), '', t, t)
  const exist = db.prepare('SELECT * FROM contact_bindings WHERE channel=? AND external_id=?').get(channel, qq)
  if (exist) {
    if (exist.contact_id !== 'contact:owner') {
      throw new ContactError('E_DUPLICATE', `该 ${channel} ID 已绑定到 ${exist.contact_id}`, { contactId: exist.contact_id })
    }
    db.prepare('UPDATE contact_bindings SET alias=?, is_primary=1, account_id=? WHERE id=?').run(String(displayName), String(accountId), exist.id)
    return { contactId: 'contact:owner', bindingId: exist.id, created: false }
  }
  const info = db.prepare(`INSERT INTO contact_bindings(contact_id,channel,account_id,external_id,alias,is_primary,created_at)
    VALUES('contact:owner',?,?,?,?,1,?)`).run(channel, String(accountId), qq, String(displayName), t)
  return { contactId: 'contact:owner', bindingId: Number(info.lastInsertRowid), created: true }
}

/** 按通道 + 外部 ID 查联系人；表不存在返回 null（阶段 2 行为） */
export function lookupContact(db, channel, externalId) {
  const ch = String(channel ?? '').trim()
  const ext = String(externalId ?? '').trim()
  if (!ch || !ext) return null
  if (!hasContactsSchema(db)) return null
  const row = db.prepare(`SELECT c.id,c.display_name,c.relationship,c.kind FROM contact_bindings b
      JOIN contacts c ON c.id=b.contact_id WHERE b.channel=? AND b.external_id=? LIMIT 1`).get(ch, ext)
  if (!row) return null
  return { id: String(row.id), displayName: String(row.display_name ?? ''), relationship: String(row.relationship ?? ''), kind: String(row.kind ?? '') }
}

/**
 * 绑定一个联系人。冲突（同一 channel+external_id 已属于别人）→ 抛 E_DUPLICATE，不覆盖。
 */
export function bindContact(db, { contactId, channel, externalId, alias = '', accountId = '', isPrimary = 0 } = {}) {
  const cid = String(contactId ?? '').trim()
  const ch = String(channel ?? '').trim()
  const ext = String(externalId ?? '').trim()
  if (!cid || !ch || !ext) throw new ContactError('E_INVALID_ARG', 'bindContact 需要 contactId/channel/externalId')
  if (!hasContactsSchema(db)) throw new ContactError('E_PERSONA_UNAVAILABLE', 'contacts 表不存在，请先执行阶段 3 迁移')
  const exist = db.prepare('SELECT * FROM contact_bindings WHERE channel=? AND external_id=?').get(ch, ext)
  if (exist && exist.contact_id !== cid) {
    throw new ContactError('E_DUPLICATE', `该 ${ch} ID 已绑定到 ${exist.contact_id}`, { contactId: exist.contact_id })
  }
  if (exist) {
    db.prepare('UPDATE contact_bindings SET alias=?, account_id=?, is_primary=? WHERE id=?').run(String(alias), String(accountId), existsPrimary(isPrimary), exist.id)
    return { bindingId: exist.id, created: false }
  }
  const info = db.prepare(`INSERT INTO contact_bindings(contact_id,channel,account_id,external_id,alias,is_primary,created_at)
    VALUES(?,?,?,?,?,?,?)`).run(cid, ch, String(accountId), ext, String(alias), existsPrimary(isPrimary), now())
  return { bindingId: Number(info.lastInsertRowid), created: true }
}

function existsPrimary(v) { return Number(v) ? 1 : 0 }

/** 新建联系人（不绑通道） */
export function addContact(db, { id, displayName, kind = 'friend', relationship = '', note = '' } = {}) {
  const cid = String(id ?? '').trim()
  const name = String(displayName ?? '').trim()
  if (!cid || !name) throw new ContactError('E_INVALID_ARG', 'addContact 需要 id/displayName')
  if (!hasContactsSchema(db)) throw new ContactError('E_PERSONA_UNAVAILABLE', 'contacts 表不存在，请先执行阶段 3 迁移')
  const t = now()
  db.prepare(`INSERT INTO contacts(id,kind,display_name,relationship,note,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, kind=excluded.kind, relationship=excluded.relationship, note=excluded.note, updated_at=excluded.updated_at`)
    .run(cid, String(kind), name, String(relationship), String(note), t, t)
  return { id: cid }
}

export function addContactNote(db, { contactId, kind = 'fact', text, importance = 0.5, sourceRef = '' } = {}) {
  const cid = String(contactId ?? '').trim()
  const body = String(text ?? '').trim()
  if (!cid || !body) throw new ContactError('E_INVALID_ARG', 'addContactNote 需要 contactId/text')
  if (!hasContactsSchema(db)) throw new ContactError('E_PERSONA_UNAVAILABLE', 'contacts 表不存在，请先执行阶段 3 迁移')
  const info = db.prepare(`INSERT INTO contact_notes(contact_id,kind,text,importance,source_ref,created_at) VALUES(?,?,?,?,?,?)`)
    .run(cid, String(kind), body, Number(importance) || 0.5, String(sourceRef), now())
  return { id: Number(info.lastInsertRowid) }
}

export function listContactNotes(db, { contactId, limit = 20 } = {}) {
  if (!hasContactsSchema(db)) return []
  const cid = String(contactId ?? '').trim()
  const n = Math.max(1, Math.min(Number(limit) || 20, 100))
  return db.prepare('SELECT id,contact_id,kind,text,importance,source_ref,created_at FROM contact_notes WHERE contact_id=? ORDER BY id DESC LIMIT ?').all(cid, n)
}
