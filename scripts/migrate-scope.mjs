#!/usr/bin/env node
/**
 * P0 scope 迁移（2026-11-06）
 *
 * 给 memories 加 `scope_type` / `scope_id` 两列 + 索引；已有行全部回填 `owner`。
 * 写前 VACUUM INTO 备份整库；默认 dry-run，显式 `--apply` 才写。
 *
 * 用法：
 *   node scripts/migrate-scope.mjs --db /path/memory.db [--backup /path/x.db] [--apply] [--json]
 * 退出码：0 成功/演练；2 参数或库错误；3 备份或写入失败。
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const argv = process.argv.slice(2)
const arg = (name, dflt = '') => { const i = argv.indexOf(`--${name}`); return i >= 0 ? String(argv[i + 1] ?? '') : dflt }
const has = (name) => argv.includes(`--${name}`)
const JSON_OUT = has('json')
const dbArg = arg('db').trim()
const dbPath = dbArg ? resolve(dbArg) : ''
const apply = has('apply')
const backupArg = arg('backup').trim()

function finish(code, payload) {
  if (JSON_OUT) console.log(JSON.stringify(payload))
  else if (payload.ok) {
    console.log(`[scope-migrate] ${payload.dryRun ? 'dry-run' : 'applied'} db=${payload.db}`)
    console.log(`  before=${JSON.stringify(payload.before)} after=${JSON.stringify(payload.after)}`)
    if (payload.backup) console.log(`  backup=${payload.backup.path} (${payload.backup.bytes} bytes, integrity=${payload.backup.integrity})`)
  } else console.error(`[scope-migrate] ERROR: ${payload.error}`)
  process.exit(code)
}

if (!dbPath) finish(2, { ok: false, error: 'need --db <memory.db>' })
if (!existsSync(dbPath)) finish(2, { ok: false, error: `db not found: ${dbPath}` })

const pad = (n) => String(n).padStart(2, '0')
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
const colsOf = (db) => { try { return new Set(db.prepare('PRAGMA table_info(memories)').all().map((c) => String(c.name))) } catch { return new Set() } }
const countRows = (db) => { try { return Number(db.prepare('SELECT count(*) c FROM memories').get()?.c ?? 0) } catch { return 0 } }
const scopeCounts = (db, cols) => {
  if (!cols.has('scope_type')) return {}
  try {
    const out = {}
    for (const r of db.prepare("SELECT scope_type, count(*) c FROM memories GROUP BY scope_type").all()) out[String(r.scope_type)] = Number(r.c)
    return out
  } catch { return {} }
}

// 1) 读现状
let before = { total: 0, columns: [], needMigrate: false, scope: {} }
try {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    db.exec('PRAGMA busy_timeout=10000')
    const cols = colsOf(db)
    before.total = countRows(db)
    before.columns = [...cols].filter((c) => c === 'scope_type' || c === 'scope_id')
    before.needMigrate = !cols.has('scope_type') || !cols.has('scope_id')
    before.scope = scopeCounts(db, cols)
    if (cols.has('scope_type')) before.emptyScope = Number(db.prepare("SELECT count(*) c FROM memories WHERE scope_type IS NULL OR scope_type=''").get()?.c ?? 0)
    else before.emptyScope = before.total
  } finally { db.close() }
} catch (e) {
  finish(2, { ok: false, error: `read failed: ${e?.message ?? e}` })
}

const summary = { ok: true, dryRun: !apply, db: dbPath, before, after: null, backup: null, altered: [], updated: 0 }
if (!apply) finish(0, summary)
if (!before.needMigrate && before.emptyScope === 0) finish(0, { ...summary, note: 'already migrated; nothing to do' })

// 2) 写前备份
const baseDir = backupArg ? dirname(resolve(backupArg)) : join(dirname(dbPath), '备份')
mkdirSync(baseDir, { recursive: true })
const base = backupArg ? resolve(backupArg) : join(baseDir, `scope-migrate-${stamp()}.db`)
let backupPath = base
for (let i = 1; existsSync(backupPath); i++) backupPath = base.replace(/\.db$/i, `-${i}.db`)
try {
  const rdb = new DatabaseSync(dbPath, { readOnly: true })
  try { rdb.exec('PRAGMA busy_timeout=10000'); rdb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`) } finally { rdb.close() }
} catch (e) {
  finish(3, { ...summary, ok: false, error: `backup failed: ${e?.message ?? e}` })
}
if (!existsSync(backupPath) || statSync(backupPath).size === 0) finish(3, { ...summary, ok: false, error: 'backup empty' })
let integrity = 'unknown'
try {
  const bdb = new DatabaseSync(backupPath, { readOnly: true })
  try { integrity = String(bdb.prepare('PRAGMA integrity_check').get()?.integrity_check ?? 'unknown') } finally { bdb.close() }
} catch {}
summary.backup = { path: backupPath, bytes: statSync(backupPath).size, integrity }

// 3) 事务迁移
try {
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA busy_timeout=10000')
    db.exec('BEGIN IMMEDIATE')
    const cols = colsOf(db)
    if (!cols.has('scope_type')) { db.exec("ALTER TABLE memories ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'owner'"); summary.altered.push('scope_type') }
    if (!cols.has('scope_id')) { db.exec("ALTER TABLE memories ADD COLUMN scope_id TEXT NOT NULL DEFAULT ''"); summary.altered.push('scope_id') }
    db.exec('CREATE INDEX IF NOT EXISTS idx_mem_scope_key ON memories(scope_type, scope_id)')
    summary.updated = Number(db.prepare("UPDATE memories SET scope_type='owner' WHERE scope_type IS NULL OR scope_type=''").run().changes ?? 0)
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    throw e
  } finally { db.close() }
} catch (e) {
  finish(3, { ...summary, ok: false, error: `migrate failed (backup kept at ${backupPath}): ${e?.message ?? e}` })
}

// 4) 回读
try {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    db.exec('PRAGMA busy_timeout=5000')
    const cols = colsOf(db)
    summary.after = { total: countRows(db), scope: scopeCounts(db, cols), columns: [...cols].filter((c) => c === 'scope_type' || c === 'scope_id') }
  } finally { db.close() }
} catch {}
finish(0, summary)
