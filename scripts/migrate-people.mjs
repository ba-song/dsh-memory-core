#!/usr/bin/env node
/**
 * 人物主体绑定迁移（2026-11-07）
 *
 * 给 contact_bindings 加 person_id 列 + 索引，并把 owner 的 QQ/邮箱 upsert 到 person:owner。
 * 写前 VACUUM INTO 备份；默认 dry-run，显式 --apply 才写。
 *
 * 用法：
 *   node scripts/migrate-people.mjs --db <memory.db> --owner-qq <qq> [--owner-emails a@x,b@y] [--apply] [--json]
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ensureContactsSchema, hasContactsSchema } from '../lib/store/contacts.js'
import { ensurePersonSchema, hasPersonColumn, seedOwnerPeople } from '../lib/store/people.js'

const argv = process.argv.slice(2)
const arg = (name, dflt = '') => { const i = argv.indexOf(`--${name}`); return i >= 0 ? String(argv[i + 1] ?? '') : dflt }
const has = (name) => argv.includes(`--${name}`)
const JSON_OUT = has('json')
const dbArg = arg('db').trim()
const dbPath = dbArg ? resolve(dbArg) : ''
const apply = has('apply')
const backupArg = arg('backup').trim()
const ownerQQ = arg('owner-qq').trim()
const emails = arg('owner-emails').split(',').map((s) => s.trim()).filter(Boolean)

function finish(code, payload) {
  if (JSON_OUT) console.log(JSON.stringify(payload))
  else if (payload.ok) {
    console.log(`[people-migrate] ${payload.dryRun ? 'dry-run' : 'applied'} db=${payload.db}`)
    if (payload.backup) console.log(`  backup=${payload.backup.path} (${payload.backup.bytes} bytes, integrity=${payload.backup.integrity})`)
    console.log(`  bindings=${JSON.stringify(payload.after?.bindings ?? [])}`)
  } else console.error(`[people-migrate] ERROR: ${payload.error}`)
  process.exit(code)
}
if (!dbPath) finish(2, { ok: false, error: 'need --db <memory.db>' })
if (!existsSync(dbPath)) finish(2, { ok: false, error: `db not found: ${dbPath}` })

const pad = (n) => String(n).padStart(2, '0')
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
const readState = (db) => {
  const out = { hasContacts: hasContactsSchema(db), hasPerson: hasPersonColumn(db), bindings: [] }
  if (out.hasContacts) {
    try {
      out.bindings = db.prepare(`SELECT b.id,b.channel,b.external_id,b.contact_id,${out.hasPerson ? 'b.person_id' : "'' AS person_id"}
        FROM contact_bindings b ORDER BY b.id`).all().map((r) => ({ ...r }))
    } catch {}
  }
  return out
}

let before
try {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try { db.exec('PRAGMA busy_timeout=10000'); before = readState(db) } finally { db.close() }
} catch (e) { finish(2, { ok: false, error: `read failed: ${e?.message ?? e}` }) }

const summary = { ok: true, dryRun: !apply, db: dbPath, ownerQQ, emails, before, after: null, backup: null }
if (!apply) finish(0, summary)

// 写前备份
const baseDir = backupArg ? dirname(resolve(backupArg)) : join(dirname(dbPath), '备份')
mkdirSync(baseDir, { recursive: true })
const base = backupArg ? resolve(backupArg) : join(baseDir, `people-migrate-${stamp()}.db`)
let backupPath = base
for (let i = 1; existsSync(backupPath); i++) backupPath = base.replace(/\.db$/i, `-${i}.db`)
try {
  const rdb = new DatabaseSync(dbPath, { readOnly: true })
  try { rdb.exec('PRAGMA busy_timeout=10000'); rdb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`) } finally { rdb.close() }
} catch (e) { finish(3, { ...summary, ok: false, error: `backup failed: ${e?.message ?? e}` }) }
if (!existsSync(backupPath) || statSync(backupPath).size === 0) finish(3, { ...summary, ok: false, error: 'backup empty' })
let integrity = 'unknown'
try {
  const b = new DatabaseSync(backupPath, { readOnly: true })
  try { integrity = String(b.prepare('PRAGMA integrity_check').get()?.integrity_check ?? 'unknown') } finally { b.close() }
} catch {}
summary.backup = { path: backupPath, bytes: statSync(backupPath).size, integrity }

try {
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA busy_timeout=10000')
    db.exec('BEGIN IMMEDIATE')
    ensureContactsSchema(db)
    ensurePersonSchema(db)
    if (ownerQQ) seedOwnerPeople(db, { ownerQQ, emails })
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    throw e
  } finally { db.close() }
} catch (e) {
  finish(3, { ...summary, ok: false, error: `migrate failed (backup kept at ${backupPath}): ${e?.message ?? e}` })
}

try {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try { db.exec('PRAGMA busy_timeout=5000'); summary.after = readState(db) } finally { db.close() }
} catch {}
finish(0, summary)
