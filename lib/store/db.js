import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { DDL, SCHEMA_VERSION } from './schema.js'

const BUSY = /locked|busy/i
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, 'memory.db')
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA synchronous=NORMAL')
  db.exec('PRAGMA busy_timeout=5000')
  db.exec('PRAGMA foreign_keys=ON')
  for (const sql of DDL) db.exec(sql)
  // 轻量迁移：老库补列（P4-pre）
  for (const [col, def] of [['confidence', 'REAL NOT NULL DEFAULT 1.0'], ['layer', "TEXT NOT NULL DEFAULT 'manual'"], ['source_channel', "TEXT NOT NULL DEFAULT ''"], ['source_ref', "TEXT NOT NULL DEFAULT ''"], ['superseded_by', 'INTEGER DEFAULT 0']]) {
    try { db.exec(`ALTER TABLE memories ADD COLUMN ${col} ${def}`) } catch {}
  }
  // 2026-11-06 P0 scope：两列 + 索引；已有行由 DEFAULT 'owner' 回填。
  // ALTER 后再补一次 UPDATE，兼容「列已存在但值为空」的半迁移库。
  for (const [col, def] of [['scope_type', "TEXT NOT NULL DEFAULT 'owner'"], ['scope_id', "TEXT NOT NULL DEFAULT ''"]]) {
    try { db.exec(`ALTER TABLE memories ADD COLUMN ${col} ${def}`) } catch {}
  }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_mem_scope_key ON memories(scope_type, scope_id)') } catch {}
  try { db.exec("UPDATE memories SET scope_type='owner' WHERE scope_type IS NULL OR scope_type=''") } catch {}
  db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run('schema_version', String(SCHEMA_VERSION))
  return { db, file }
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
