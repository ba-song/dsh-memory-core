#!/usr/bin/env node
/**
 * 原话向量回填（幂等、可重复）：
 *   node scripts/backfill-raw-vectors.mjs --data-dir /sdcard/DSHA/记忆/数据            # 预览（默认）
 *   node scripts/backfill-raw-vectors.mjs --data-dir ... --apply --batch 32           # 写入
 * 备份建议：先 cp memory.db 到 记忆/备份/rawvec-before-<ts>.db（WAL 库请连同 -wal/-shm 或用 VACUUM INTO）。
 */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { loadEmbed, embedTexts } from '../lib/embed/onnx.mjs'
const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const DATA_DIR = arg('data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const APPLY = argv.includes('--apply')
const BATCH = Math.max(16, Math.min(Number(arg('batch', 32)) || 32, 32))
const LIMIT = Math.max(0, Number(arg('limit', 0)) || 0)
const MODEL_DIR = arg('model-dir', process.env.DY_MEMORY_MODEL || '/opt/qqai/models/bge-small-zh')
const db = new DatabaseSync(join(DATA_DIR, 'memory.db'))
try { db.exec(`CREATE TABLE IF NOT EXISTS raw_vectors (raw_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL, model TEXT, updated_at INTEGER NOT NULL)`) } catch {}
let rows = db.prepare(`SELECT m.id, m.raw_text FROM raw_meta m LEFT JOIN raw_vectors v ON v.raw_id=m.id WHERE v.raw_id IS NULL AND m.tombstone=0 AND length(m.raw_text)>=8 ORDER BY m.id`).all()
if (LIMIT) rows = rows.slice(0, LIMIT)
console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', todo: rows.length, batch: BATCH }))
if (!APPLY) process.exit(0)
const loaded = await loadEmbed(MODEL_DIR)
if (!loaded.ok) { console.error(JSON.stringify({ ok: false, error: 'embed_unavailable: ' + loaded.error })); process.exit(2) }
let ok = 0, fail = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  let vs = null
  try { vs = await embedTexts(chunk.map((r) => String(r.raw_text).slice(0, 500))) } catch (e) { console.error(JSON.stringify({ embed_error: String(e?.message ?? e).slice(0, 200) })) }
  if (!vs) { fail += chunk.length; console.log(JSON.stringify({ done: Math.min(i + BATCH, rows.length), total: rows.length, ok, fail })); continue }
  for (let k = 0; k < chunk.length; k++) {
    const v = vs?.[k]
    if (!v || !v.length) { fail += 1; continue }
    try { db.prepare('INSERT OR REPLACE INTO raw_vectors(raw_id,dim,vec,model,updated_at) VALUES(?,?,?,?,?)').run(chunk[k].id, v.length, Buffer.from(v.buffer, v.byteOffset, v.byteLength), 'bge-small-zh', Date.now()); ok += 1 } catch { fail += 1 }
  }
  console.log(JSON.stringify({ done: Math.min(i + BATCH, rows.length), total: rows.length, ok, fail }))
}
db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('raw_vectors_backfill_at',?)").run(String(Date.now()))
db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('raw_vectors_backfill_rows',?)").run(String(ok))
console.log(JSON.stringify({ ok: true, indexed: ok, failed: fail }))
