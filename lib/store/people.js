/**
 * 人物主体（person）绑定（2026-11-07）
 *
 * 目标：同一人跨渠道（QQ / 邮箱 / 抖音…）绑定到同一 personId；记忆按人聚合。
 * 存储：复用 contact_bindings，新增 person_id 列；contact_id 保持指向 contacts 行
 *      （老数据 contact:owner 不动，只补 person_id='person:owner'）。
 *
 * 约定：
 *   owner 三地址（QQ + 两个邮箱）统一 person:owner；
 *   陌生联系人可用 bindPerson({personId:'person:xxx'}) 建主体。
 */
import { now } from '../adapter/time.js'
import { hasContactsSchema, ensureContactsSchema, seedOwner } from './contacts.js'

export const OWNER_PERSON_ID = 'person:owner'

/** 给 contact_bindings 补 person_id 与索引；幂等 */
export function ensurePersonSchema(db) {
  try { ensureContactsSchema(db) } catch {}
  try { db.exec("ALTER TABLE contact_bindings ADD COLUMN person_id TEXT NOT NULL DEFAULT ''") } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_binding_person ON contact_bindings(person_id)') } catch {}
  return true
}

export function hasPersonColumn(db) {
  try { return db.prepare('PRAGMA table_info(contact_bindings)').all().some((c) => String(c.name) === 'person_id') } catch { return false }
}

function ensurePersonRow(db, { personId, name = '', kind = 'friend' } = {}) {
  const t = now()
  const display = String(name ?? '').trim() || String(personId)
  db.prepare(`INSERT INTO contacts(id,kind,display_name,relationship,note,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      display_name=CASE WHEN excluded.display_name<>'' THEN excluded.display_name ELSE contacts.display_name END,
      kind=CASE WHEN excluded.kind<>'' THEN excluded.kind ELSE contacts.kind END,
      updated_at=excluded.updated_at`)
    .run(String(personId), String(kind || 'friend'), display, '', '', t, t)
  return String(personId)
}

/**
 * 绑定「渠道 + 外部地址」到 personId。
 * 已存在同一 channel+external_id → 更新 person_id/alias（幂等，不新建）。
 * @returns {{ok:true,bindingId:number,created:boolean,personId:string}}
 */
export function bindPerson(db, { channel, contactId, personId, name = '' } = {}) {
  const ch = String(channel ?? '').trim()
  const ext = String(contactId ?? '').trim()
  const pid = String(personId ?? '').trim()
  if (!ch || !ext || !pid) {
    const e = new Error('bindPerson 需要 channel/contactId/personId')
    e.code = 'E_INVALID_ARG'
    throw e
  }
  ensurePersonSchema(db)
  ensurePersonRow(db, { personId: pid, name, kind: pid === OWNER_PERSON_ID ? 'owner' : 'friend' })
  const exist = db.prepare('SELECT * FROM contact_bindings WHERE channel=? AND external_id=?').get(ch, ext)
  if (exist) {
    db.prepare('UPDATE contact_bindings SET person_id=?, alias=?, account_id=? WHERE id=?')
      .run(pid, String(name || exist.alias || ''), String(exist.account_id ?? ''), exist.id)
    return { ok: true, bindingId: Number(exist.id), created: false, personId: pid }
  }
  const info = db.prepare(`INSERT INTO contact_bindings(contact_id,channel,account_id,external_id,alias,is_primary,created_at,person_id)
    VALUES(?,?,?,?,?,?,?,?)`).run(pid, ch, '', ext, String(name ?? ''), 0, now(), pid)
  return { ok: true, bindingId: Number(info.lastInsertRowid), created: true, personId: pid }
}

/**
 * 按渠道 + 外部地址查主体；无绑定/无表 → null。
 * @returns {{personId:string,contactId:string,channel:string,name:string,contactRowId:string}|null}
 */
export function resolvePerson(db, { channel, contactId } = {}) {
  const ch = String(channel ?? '').trim()
  const ext = String(contactId ?? '').trim()
  if (!ch || !ext) return null
  if (!hasContactsSchema(db)) return null
  const personCol = hasPersonColumn(db)
  try {
    const row = db.prepare(`SELECT b.id,b.contact_id,b.channel,b.external_id,b.alias,
        ${personCol ? 'b.person_id' : "'' AS person_id"}, c.display_name,c.relationship,c.kind
      FROM contact_bindings b LEFT JOIN contacts c ON c.id=b.contact_id
      WHERE b.channel=? AND b.external_id=? LIMIT 1`).get(ch, ext)
    if (!row) return null
    return {
      personId: String(row.person_id || row.contact_id || ''),
      contactId: String(row.external_id ?? ''),
      channel: String(row.channel ?? ''),
      name: String(row.alias || row.display_name || ''),
      contactRowId: String(row.contact_id ?? ''),
      relationship: String(row.relationship ?? ''),
      kind: String(row.kind ?? ''),
    }
  } catch { return null }
}

/**
 * 初始化 owner 三地址 → person:owner：QQ + 配置邮箱 + `${ownerQQ}@qq.com`（自动去重）。
 * 幂等；无 ownerQQ 时跳过。
 */
export function seedOwnerPeople(db, { ownerQQ = '', emails = [] } = {}) {
  const qq = String(ownerQQ ?? '').trim()
  if (!qq) return { ok: false, reason: 'no-owner-qq', personId: OWNER_PERSON_ID, bindings: [] }
  ensurePersonSchema(db)
  ensurePersonRow(db, { personId: OWNER_PERSON_ID, name: '主人', kind: 'owner' })
  // QQ 先走旧 seedOwner：保留 contact_id='contact:owner'，classifyOwner 的 owner 判定不变；
  // 再 bindPerson 只补 person_id='person:owner'。
  try { seedOwner(db, { ownerQQ: qq, displayName: '主人' }) } catch {}
  const list = []
  const add = (channel, contactId, name) => {
    const r = bindPerson(db, { channel, contactId, personId: OWNER_PERSON_ID, name })
    list.push({ channel, contactId, ...r })
  }
  add('qq', qq, '主人')
  const mail = new Set()
  for (const e of Array.isArray(emails) ? emails : []) { const v = String(e ?? '').trim(); if (v) mail.add(v) }
  mail.add(`${qq}@qq.com`)
  for (const e of mail) add('email', e, '主人')
  // 邮箱 bindPerson 不会把 person:owner 的 display_name 改成邮箱别名
  ensurePersonRow(db, { personId: OWNER_PERSON_ID, name: '主人', kind: 'owner' })
  return { ok: true, personId: OWNER_PERSON_ID, bindings: list }
}
