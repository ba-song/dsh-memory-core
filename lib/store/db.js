import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { DDL, SCHEMA_VERSION } from './schema.js'

const BUSY = /locked|busy/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MEMORY_COLUMNS = [
  ['confidence', 'REAL NOT NULL DEFAULT 1.0'],
  ['layer', "TEXT NOT NULL DEFAULT 'manual'"],
  ['source_channel', "TEXT NOT NULL DEFAULT ''"],
  ['source_ref', "TEXT NOT NULL DEFAULT ''"],
  ['superseded_by', 'INTEGER DEFAULT 0'],
  ['scope_type', "TEXT NOT NULL DEFAULT 'owner'"],
  ['scope_id', "TEXT NOT NULL DEFAULT ''"],
  ['quote', "TEXT NOT NULL DEFAULT ''"],
  ['revision', 'INTEGER NOT NULL DEFAULT 1'],
  ['updated_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['valid_from', 'INTEGER'],
  ['valid_to', 'INTEGER'],
  ['temporal_kind', "TEXT NOT NULL DEFAULT 'unknown'"],
]

function columnsOf(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)))
}

function indexColumnsOf(db, index) {
  return db.prepare(`PRAGMA index_info('${index}')`).all()
    .sort((a, b) => Number(a.seqno) - Number(b.seqno))
    .map((row) => String(row.name))
}

function assertIndexColumns(db, index, expected) {
  const actual = indexColumnsOf(db, index)
  if (actual.length !== expected.length || actual.some((column, i) => column !== expected[i])) {
    throw new Error(`E_SCHEMA_MIGRATION_INCOMPLETE: index ${index} expected [${expected.join(',')}], got [${actual.join(',')}]`)
  }
}

/**
 * Minimal, transactional schema migration for the unified validity layer.
 * It intentionally does not create P4-only rules or episode rewrite snapshot tables.
 * The schema marker is advanced only after required memory columns and indexes pass.
 */
function migrateSchema(db) {
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const sql of DDL) db.exec(sql)

    const meta = db.prepare("SELECT v FROM meta WHERE k='schema_version'").get()
    const currentVersion = Number(meta?.v ?? 0)
    if (meta && (!Number.isSafeInteger(currentVersion) || currentVersion < 0)) {
      throw new Error(`E_SCHEMA_VERSION_INVALID: ${String(meta.v)}`)
    }
    if (currentVersion > SCHEMA_VERSION) {
      throw new Error(`E_SCHEMA_NEWER_THAN_CODE: database=${currentVersion}, code=${SCHEMA_VERSION}`)
    }

    let memoryColumns = columnsOf(db, 'memories')
    if (!memoryColumns.size) throw new Error('E_SCHEMA_MISSING_MEMORIES_TABLE')
    for (const [column, definition] of MEMORY_COLUMNS) {
      if (!memoryColumns.has(column)) {
        db.exec(`ALTER TABLE memories ADD COLUMN ${column} ${definition}`)
        memoryColumns.add(column)
      }
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_mem_scope_key ON memories(scope_type, scope_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_mem_valid ON memories(valid_from, valid_to)')
    db.exec("UPDATE memories SET scope_type='owner' WHERE scope_type IS NULL OR scope_type=''")
    db.exec('UPDATE memories SET updated_at=created_at_epoch WHERE updated_at IS NULL OR updated_at=0')
    db.exec('UPDATE memories SET revision=1 WHERE revision IS NULL OR revision=0')

    const required = MEMORY_COLUMNS.map(([column]) => column)
    const finalColumns = columnsOf(db, 'memories')
    const missing = required.filter((column) => !finalColumns.has(column))
    if (missing.length) throw new Error(`E_SCHEMA_MIGRATION_INCOMPLETE: memories missing ${missing.join(',')}`)
    assertIndexColumns(db, 'idx_mem_scope_key', ['scope_type', 'scope_id'])
    assertIndexColumns(db, 'idx_mem_valid', ['valid_from', 'valid_to'])

    const revisions = columnsOf(db, 'memory_revisions')
    const requiredRevisions = ['memory_id', 'revision', 'previous_json', 'changed_at', 'invalidation']
    const missingRevisions = requiredRevisions.filter((column) => !revisions.has(column))
    if (missingRevisions.length) throw new Error(`E_SCHEMA_MIGRATION_INCOMPLETE: memory_revisions missing ${missingRevisions.join(',')}`)

    db.prepare(`INSERT INTO meta(k,v) VALUES(?,?)
      ON CONFLICT(k) DO UPDATE SET v=excluded.v`).run('schema_version', String(SCHEMA_VERSION))
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    throw error
  }
}

export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, 'memory.db')
  const db = new DatabaseSync(file)
  try {
    db.exec('PRAGMA journal_mode=WAL')
    db.exec('PRAGMA synchronous=NORMAL')
    db.exec('PRAGMA busy_timeout=5000')
    db.exec('PRAGMA foreign_keys=ON')
    migrateSchema(db)
    return { db, file }
  } catch (error) {
    try { db.close() } catch {}
    throw error
  }
}

/** 写事务：BEGIN IMMEDIATE + 失败重开事务重试（覆盖 BUSY_SNAPSHOT） */
export async function writeTx(db, fn, { attempts = 3, backoff = [200, 800, 2000] } = {}) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      db.exec('BEGIN IMMEDIATE')
      const out = await fn(db)
      db.exec('COMMIT')
      return out
    } catch (e) {
      lastErr = e
      try { db.exec('ROLLBACK') } catch {}
      const msg = String(e?.message ?? e)
      if (!BUSY.test(msg) || i === attempts - 1) throw e
      await sleep(backoff[i] ?? 2000)
    }
  }
  throw lastErr
}

/** 读操作：只读、不排队、不开写事务 */
export function readAll(db, sql, params = []) {
  try { return db.prepare(sql).all(...params) } catch (e) { return [] }
}
export function readOne(db, sql, params = []) {
  try { return db.prepare(sql).get(...params) } catch { return undefined }
}
