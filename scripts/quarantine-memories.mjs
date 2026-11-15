#!/usr/bin/env node
/**
 * 存量记忆隔离（2026-11-06）
 *
 * 把指定 id 标成 `status='pending'`：不删正文、不再活跃、保留可审计；写前先 VACUUM INTO 整库备份。
 * 默认 dry-run，显式 `--apply` 才写。
 *
 * 用法：
 *   node scripts/quarantine-memories.mjs --db /path/memory.db --ids 61,62 [--reason llm-role-pronoun] [--backup /path/x.db] [--apply] [--json]
 *
 * 退出码：0 成功/演练；2 参数或库错误；3 备份或写入失败。
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const argv = process.argv.slice(2)
const arg = (name, dflt = '') => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? String(argv[i + 1] ?? '') : dflt
}
const has = (name) => argv.includes(`--${name}`)
const JSON_OUT = has('json')

const dbArg = arg('db').trim()
const dbPath = dbArg ? resolve(dbArg) : ''
const ids = arg('ids').split(',').map((s) => Number(s.trim())).filter((n) => Number.isSafeInteger(n) && n > 0)
const apply = has('apply')
const reason = (arg('reason', 'llm-role-pronoun').trim() || 'llm-role-pronoun').slice(0, 120)
const backupArg = arg('backup').trim()

function finish(code, payload) {
  if (JSON_OUT) console.log(JSON.stringify(payload))
  else if (payload.ok) {
    console.log(`[quarantine] ${payload.dryRun ? 'dry-run' : 'applied'} db=${payload.db}`)
    console.log(`  ids=${payload.requested.join(',')} active=${payload.activeIds.join(',') || '-'} updated=${payload.updated}`)
    if (payload.backup) console.log(`  backup=${payload.backup.path} (${payload.backup.bytes} bytes, integrity=${payload.backup.integrity})`)
  } else console.error(`[quarantine] ERROR: ${payload.error}`)
  process.exit(code)
}

if (!dbPath) finish(2, { ok: false, error: 'need --db <memory.db>' })
if (!existsSync(dbPath)) finish(2, { ok: false, error: `db not found: ${dbPath}` })
if (!ids.length) finish(2, { ok: false, error: 'need --ids 61,62' })

const pad = (n) => String(n).padStart(2, '0')
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

// 1) 先读，确认要动哪些行（dry-run 也走这里）
let rows = []
try {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    db.exec('PRAGMA busy_timeout=10000')
    rows = ids.map((id) => db.prepare('SELECT id,kind,text,status,extractor_version FROM memories WHERE id=?').get(id)).filter(Boolean)
  } finally { db.close() }
} catch (e) {
  finish(2, { ok: false, error: `read failed: ${e?.message ?? e}` })
}

const active = rows.filter((r) => r.status === 'active')
const summary = {
  ok: true,
  dryRun: !apply,
  db: dbPath,
  reason,
  requested: ids,
  found: rows.map((r) => ({ id: Number(r.id), status: r.status, kind: r.kind, text: String(r.text ?? '').slice(0, 60) })),
  activeIds: active.map((r) => Number(r.id)),
  updated: 0,
  backup: null,
}
if (!apply) finish(0, summary)
if (!active.length) finish(0, { ...summary, note: 'no active rows; nothing to do' })

// 2) 写前备份：VACUUM INTO（与插件 30 分钟快照同一手法，一致快照）
const baseDir = backupArg ? dirname(resolve(backupArg)) : join(dirname(dbPath), '备份')
mkdirSync(baseDir, { recursive: true })
const base = backupArg ? resolve(backupArg) : join(baseDir, `quarantine-${stamp()}.db`)
let backupPath = base
for (let i = 1; existsSync(backupPath); i++) backupPath = base.replace(/\.db$/i, `-${i}.db`)
try {
  const rdb = new DatabaseSync(dbPath, { readOnly: true })
  try {
    rdb.exec('PRAGMA busy_timeout=10000')
    rdb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`)
  } finally { rdb.close() }
} catch (e) {
  finish(3, { ...summary, ok: false, error: `backup failed: ${e?.message ?? e}` })
}
if (!existsSync(backupPath) || statSync(backupPath).size === 0) finish(3, { ...summary, ok: false, error: 'backup empty' })

let backupCheck = { integrity: 'unknown', activeIds: [] }
try {
  const bdb = new DatabaseSync(backupPath, { readOnly: true })
  try {
    backupCheck.integrity = String(bdb.prepare('PRAGMA integrity_check').get()?.integrity_check ?? 'unknown')
    backupCheck.activeIds = active
      .map((r) => Number(r.id))
      .filter((id) => String(bdb.prepare('SELECT status FROM memories WHERE id=?').get(id)?.status ?? '') === 'active')
  } finally { bdb.close() }
} catch {}
summary.backup = { path: backupPath, bytes: statSync(backupPath).size, ...backupCheck }

// 3) 事务内标 pending + meta 审计；只动读到的 active 行
try {
  const wdb = new DatabaseSync(dbPath)
  try {
    wdb.exec('PRAGMA busy_timeout=10000')
    wdb.exec('BEGIN IMMEDIATE')
    const upd = wdb.prepare(`UPDATE memories
      SET status='pending',
          meta=json_set(COALESCE(NULLIF(meta,''),'{}'),'$.quarantined',json('true'),'$.quarantineReason',?,'$.quarantinedAt',?)
      WHERE id=? AND status='active'`)
    const now = Date.now()
    for (const r of active) summary.updated += Number(upd.run(reason, now, Number(r.id)).changes ?? 0)
    wdb.exec('COMMIT')
  } catch (e) {
    try { wdb.exec('ROLLBACK') } catch {}
    throw e
  } finally { wdb.close() }
} catch (e) {
  finish(3, { ...summary, ok: false, error: `update failed (backup kept at ${backupPath}): ${e?.message ?? e}` })
}

// 4) 回读确认
try {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    summary.after = ids.map((id) => {
      const r = db.prepare('SELECT id,status FROM memories WHERE id=?').get(id)
      return r ? { id: Number(r.id), status: r.status } : { id, status: 'missing' }
    })
  } finally { db.close() }
} catch {}
finish(0, summary)
