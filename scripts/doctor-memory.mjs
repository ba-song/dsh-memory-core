#!/usr/bin/env node
/**
 * doctor-memory：只读体检（2026-11-05 重建版）
 *
 * 用法：
 *   node scripts/doctor-memory.mjs [--db <memory.db>] [--json]
 *
 * 只读保证：默认 `DatabaseSync{readOnly:true}` + `PRAGMA query_only=1`；`--fix-speaker` 会写（幂等回填，经批准）。
 * 参数：--json（单行 JSON）/ --fix-speaker / --verify-import [--batch id] / --db <path>
 * 退出码：0 = PASS；1 = WARN；2 = FAIL；3 = 打不开/无法体检（ERROR）。
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cleanChannelEnvelope } from '../lib/ingest/archive.js'
import { dayOf as bjDayOf, clockOf as bjClockOf } from '../lib/adapter/timefmt.js'

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const DB = arg('db', join(process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据', 'memory.db'))
const JSON_OUT = argv.includes('--json')
const FIX_SPEAKER = argv.includes('--fix-speaker')
const VERIFY_IMPORT = argv.includes('--verify-import')
const STRIP_ENVELOPE = argv.includes('--strip-channel-envelope')
const STRIP_APPLY = argv.includes('--apply')
const FIX_TZ = argv.includes('--fix-archive-tz')
const SELF_ID = arg('self-id', 'self:1d21547c-9973-4060-aca8-11bb891ea4e7')
const BATCH = arg('batch', '')
const DATA_DIR = dirname(DB)

const checks = []
const add = (name, status, why, data) => checks.push({ name, status, why, ...(data ? { data } : {}) })

function open() {
  if (!existsSync(DB)) throw new Error(`库不存在：${DB}`)
  const db = new DatabaseSync(DB, { readOnly: true })
  db.exec('PRAGMA query_only=1')
  const one = (sql, ...p) => { try { return db.prepare(sql).get(...p) } catch { return undefined } }
  const all = (sql, ...p) => { try { return db.prepare(sql).all(...p) } catch { return [] } }
  return { db, one, all }
}

function fileLineCount(dir) {
  let total = 0
  try {
    for (const day of readdirSync(dir)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
      const dd = join(dir, day)
      if (!statSync(dd).isDirectory()) continue
      for (const f of readdirSync(dd)) {
        if (!f.endsWith('.md') || f.includes('(1)') || f.includes('.tmp-')) continue
        total += readFileSync(join(dd, f), 'utf8').split('\n').filter(Boolean).length
      }
    }
  } catch {}
  return total
}

if (FIX_SPEAKER) {
  if (!existsSync(DB)) { console.log(JSON.stringify({ mode: 'fix-speaker', ok: false, error: '库不存在' })); process.exit(3) }
  const w = new DatabaseSync(DB)
  w.exec('PRAGMA busy_timeout=10000')
  let a = 0; let b = 0
  try {
    w.exec('BEGIN IMMEDIATE')
    a = Number(w.prepare("UPDATE raw_meta SET speaker_id=speaker, speaker='self' WHERE speaker LIKE 'self:%'").run().changes)
    b = Number(w.prepare("UPDATE raw_meta SET speaker_id=?, speaker='self' WHERE role IN ('self','self-thought') AND speaker=''").run(SELF_ID).changes)
    w.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('speaker_backfill_at',?)").run(String(Date.now()))
    w.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('speaker_backfill_rows',?)").run(String(a + b))
    w.exec('COMMIT')
  } catch (e) {
    try { w.exec('ROLLBACK') } catch {}
    console.log(JSON.stringify({ mode: 'fix-speaker', ok: false, error: String(e?.message ?? e) }))
    process.exit(2)
  }
  w.close()
  console.log(JSON.stringify({ mode: 'fix-speaker', ok: true, updated: { ruleA: a, ruleB: b, total: a + b } }))
  process.exit(0)
}

if (FIX_TZ) {
  if (!existsSync(DB)) { console.log(JSON.stringify({ mode: 'fix-archive-tz', ok: false, error: '库不存在' })); process.exit(3) }
  const ro = new DatabaseSync(DB, { readOnly: true })
  const rows = ro.prepare('SELECT id,day,file,raw_text,at,extra FROM raw_meta').all()
  const fixed = []
  const byDay = {}
  let unresolved = 0
  const utcClock = (at) => new Date(Number(at)).toISOString().slice(11, 19)
  for (const r of rows) {
    const dayKey = String(r.day ?? '')
    byDay[dayKey] ??= { matched: 0, skip: 0 }
    // 导入批次一律不动：它们的 at 是导入时按 UTC 解析的错误值，但前缀本来就是北京原时间
    if (String(r.extra ?? '').includes('importBatch')) { unresolved += 1; byDay[dayKey].skip += 1; continue }
    const m = String(r.raw_text ?? '').match(/^(\d{2}:\d{2}:\d{2})(.*)$/s)
    if (!m) { unresolved += 1; byDay[dayKey].skip += 1; continue }
    // 只处理「旧前缀==该 at 的 UTC 时刻」的行：说明前缀确实由这个 at 按 UTC 生成；否则（历史 backfill 行 at 被补成日界）跳过，避免把真实时间改坏
    if (m[1] !== utcClock(r.at)) { unresolved += 1; byDay[dayKey].skip += 1; continue }
    const day = bjDayOf(r.at)
    const clock = bjClockOf(r.at)
    const text = `${clock}${m[2]}`
    if (day !== r.day || text !== r.raw_text) { byDay[dayKey].matched += 1; fixed.push({ id: r.id, beforeDay: r.day, afterDay: day, before: String(r.raw_text ?? '').slice(0, 40), after: text.slice(0, 40), file: r.file }) }
  }
  ro.close()
  const files = [...new Set(fixed.map((f) => f.file))]
  if (!STRIP_APPLY) { console.log(JSON.stringify({ mode: 'fix-archive-tz', dryRun: true, total: rows.length, matched: fixed.length, unresolved, files: files.length, samples: fixed.slice(0, 5), byDay }, null, 2)); process.exit(0) }
  const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const BK = arg('backup-dir', join(DATA_DIR, '..', '备份'))
  try { mkdirSync(BK, { recursive: true }) } catch {}
  const bpath = join(BK, `fix-archive-tz-${TS}.db`)
  try { const rdb = new DatabaseSync(DB, { readOnly: true }); rdb.exec(`VACUUM INTO '${bpath}'`); rdb.close() } catch (e) { console.log(JSON.stringify({ ok: false, error: '备份失败 ' + e.message })); process.exit(2) }
  const w = new DatabaseSync(DB); w.exec('PRAGMA busy_timeout=10000')
  try {
    w.exec('BEGIN IMMEDIATE')
    for (const f of fixed) {
      const m = String(f.before).match(/^(\d{2}:\d{2}:\d{2})/)
      const full = w.prepare('SELECT day,raw_text,at FROM raw_meta WHERE id=?').get(f.id)
      const clock = bjClockOf(full.at)
      const mm = String(full.raw_text ?? '').match(/^(\d{2}:\d{2}:\d{2})(.*)$/s)
      w.prepare('UPDATE raw_meta SET day=?, raw_text=? WHERE id=?').run(bjDayOf(full.at), mm ? `${clock}${mm[2]}` : full.raw_text, f.id)
    }
    w.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('fix_archive_tz_at',?)").run(String(Date.now()))
    w.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('fix_archive_tz_rows',?)").run(String(fixed.length))
    w.exec('COMMIT')
  } catch (e) { try { w.exec('ROLLBACK') } catch {}; w.close(); console.log(JSON.stringify({ ok: false, error: e.message })); process.exit(2) }
  w.close()
  console.log(JSON.stringify({ mode: 'fix-archive-tz', ok: true, updated: fixed.length, files: files.length, backup: bpath }))
  process.exit(0)
}

if (STRIP_ENVELOPE) {
  if (!existsSync(DB)) { console.log(JSON.stringify({ mode: 'strip-channel-envelope', ok: false, error: '库不存在' })); process.exit(3) }
  const ro = new DatabaseSync(DB, { readOnly: true })
  const where = "cwd LIKE '/sdcard/DSHA/渠道%' AND role='user' AND (raw_text LIKE '%【这个房间的规矩】%' OR raw_text LIKE '%[QQ·%' OR raw_text LIKE '[%] %')"
  const rows = ro.prepare(`SELECT id,raw_text FROM raw_meta WHERE ${where}`).all()
  const clean = (x) => cleanChannelEnvelope(x)
  const plan = rows.map((r) => ({ id: r.id, before: r.raw_text, after: clean(r.raw_text) }))
  ro.close()
  const changed = plan.filter((p) => p.after !== p.before && p.after)
  const emptied = plan.filter((p) => !p.after || p.after === p.before.replace(/^(\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：)\s*$/, '$1'))
  if (!STRIP_APPLY) { console.log(JSON.stringify({ mode: 'strip-channel-envelope', dryRun: true, matched: rows.length, wouldUpdate: changed.length, wouldDelete: emptied.length, sample: changed.slice(0, 2) }, null, 2)); process.exit(0) }
  const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const BK = arg('backup-dir', join(DATA_DIR, '..', '备份'))
  try { mkdirSync(BK, { recursive: true }) } catch {}
  const bpath = join(BK, `strip-envelope-${TS}.db`)
  try { const rdb = new DatabaseSync(DB, { readOnly: true }); rdb.exec(`VACUUM INTO '${bpath}'`); rdb.close() } catch (e) { console.log(JSON.stringify({ ok: false, error: '备份失败 ' + e.message })); process.exit(2) }
  const w = new DatabaseSync(DB); w.exec('PRAGMA busy_timeout=10000')
  let upd = 0; let del = 0
  try {
    w.exec('BEGIN IMMEDIATE')
    for (const p of plan) {
      if (!p.after) { w.prepare('DELETE FROM raw_fts WHERE rowid=?').run(p.id); w.prepare('DELETE FROM raw_meta WHERE id=?').run(p.id); del += 1 }
      else if (p.after !== p.before) { w.prepare('UPDATE raw_meta SET raw_text=?, chars=? WHERE id=?').run(p.after, p.after.length, p.id); upd += 1 }
    }
    w.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('strip_channel_envelope_at',?)").run(String(Date.now()))
    w.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('strip_channel_envelope_rows',?)").run(String(upd + del))
    w.exec('COMMIT')
  } catch (e) { try { w.exec('ROLLBACK') } catch {}; w.close(); console.log(JSON.stringify({ ok: false, error: e.message })); process.exit(2) }
  w.close()
  console.log(JSON.stringify({ mode: 'strip-channel-envelope', ok: true, updated: upd, deleted: del, backup: bpath }))
  process.exit(0)
}

let db
try {
  db = open()
} catch (e) {
  console.log(JSON.stringify({ verdict: 'ERROR', error: String(e?.message ?? e), db: DB }, null, 2))
  process.exit(3)
}

const { one, all } = db

// 1) 完整性
const integ = one('PRAGMA integrity_check')
const integOk = String(integ?.integrity_check ?? '') === 'ok'
add('integrity', integOk ? 'PASS' : 'FAIL', integOk ? 'integrity_check=ok' : `integrity_check=${integ?.integrity_check}`)

// 2) 核心表
const CORE = ['memories', 'meta', 'raw_meta', 'raw_fts', 'vectors', 'entities', 'memory_entities', 'conflict_queue', 'fts_bigram', 'fts_trigram']
const tables = new Set(all("SELECT name FROM sqlite_master WHERE type='table'").map((r) => String(r.name)))
const missing = CORE.filter((t) => !tables.has(t))
add('tables', missing.length ? 'FAIL' : 'PASS', missing.length ? `缺表：${missing.join(',')}` : `核心表 ${CORE.length} 张齐全`)

// 3) 计数
const counts = {
  memories: Number(one('SELECT count(*) c FROM memories')?.c ?? 0),
  autoLayer: Number(one("SELECT count(*) c FROM memories WHERE layer='auto'")?.c ?? 0),
  rawMeta: Number(one('SELECT count(*) c FROM raw_meta')?.c ?? 0),
  rawFts: Number(one('SELECT count(*) c FROM raw_fts')?.c ?? 0),
  vectors: Number(one('SELECT count(*) c FROM vectors')?.c ?? 0),
  entities: Number(one('SELECT count(*) c FROM entities')?.c ?? 0),
  memoryEntities: Number(one('SELECT count(*) c FROM memory_entities')?.c ?? 0),
  conflictPending: Number(one("SELECT count(*) c FROM conflict_queue WHERE status='pending'")?.c ?? 0),
}
add('counts', 'PASS', `memories=${counts.memories} auto=${counts.autoLayer} raw=${counts.rawMeta} vec=${counts.vectors}`)

// 4) memories FTS 一致
const ftsB = Number(one('SELECT count(*) c FROM fts_bigram')?.c ?? 0)
const ftsT = Number(one('SELECT count(*) c FROM fts_trigram')?.c ?? 0)
const ftsMemOk = ftsB === counts.memories && ftsT === counts.memories
add('fts-memories', ftsMemOk ? 'PASS' : 'WARN', ftsMemOk ? 'fts_bigram/trigram 与 memories 行数一致' : `memories=${counts.memories} bigram=${ftsB} trigram=${ftsT}`)

// 5) raw FTS 一致
add('fts-raw', counts.rawFts === counts.rawMeta ? 'PASS' : 'WARN', `raw_meta=${counts.rawMeta} raw_fts=${counts.rawFts}`)

// 6) 向量 vs 记忆
const orphanVec = Number(one('SELECT count(*) c FROM vectors v LEFT JOIN memories m ON m.id=v.memory_id WHERE m.id IS NULL')?.c ?? 0)
const vecOk = counts.vectors <= counts.memories && orphanVec === 0
add('vectors', vecOk ? 'PASS' : 'WARN', vecOk ? `vectors=${counts.vectors}（≤ memories，无孤儿）` : `vectors=${counts.vectors} memories=${counts.memories} 孤儿=${orphanVec}`)

// 7) 原始档案文件行 vs raw_meta
const fileLines = fileLineCount(join(DATA_DIR, 'raw'))
const rawDiff = fileLines - counts.rawMeta
add('raw-files', rawDiff === 0 ? 'PASS' : 'WARN', rawDiff === 0 ? `文件 ${fileLines} 行 = raw_meta` : `文件 ${fileLines} 行，raw_meta=${counts.rawMeta}，差 ${rawDiff}`)

// 8) embedding 可用性（只探测，不装）
let embedWhy = 'onnxruntime-node 不可用'
let embedOk = false
try {
  await import('onnxruntime-node')
  embedOk = true
  embedWhy = 'onnxruntime-node 可加载'
} catch (e) { embedWhy = `onnxruntime-node 不可用：${String(e?.message ?? e).slice(0, 80)}` }
const modelDir = process.env.DY_EMBED_MODEL || '/opt/qqai/models/bge-small-zh'
const modelOk = existsSync(modelDir)
add('embedding', embedOk && modelOk ? 'PASS' : 'WARN', `${embedWhy}；模型目录 ${modelDir} ${modelOk ? '存在' : '不存在'}`)

// 9) 重复 source_msg_id / 重复正文
const dupSource = all("SELECT source_msg_id, count(*) c FROM memories WHERE source_msg_id<>'' GROUP BY source_msg_id HAVING c>1").length
add('duplicates', dupSource ? 'WARN' : 'PASS', dupSource ? `${dupSource} 个 source_msg_id 重复` : '无重复 source_msg_id')

// 10) 孤儿行
const orphanME = Number(one('SELECT count(*) c FROM memory_entities me LEFT JOIN memories m ON m.id=me.memory_id WHERE m.id IS NULL')?.c ?? 0)
const orphanFts = Number(one('SELECT count(*) c FROM raw_fts f LEFT JOIN raw_meta m ON m.id=f.rowid WHERE m.id IS NULL')?.c ?? 0)
const orphanOk = orphanME === 0 && orphanFts === 0
add('orphans', orphanOk ? 'PASS' : 'WARN', orphanOk ? '无孤儿（memory_entities / raw_fts）' : `memory_entities 孤儿 ${orphanME}；raw_fts 孤儿 ${orphanFts}`)

// 11) 冲突队列
add('conflict-queue', counts.conflictPending ? 'WARN' : 'PASS', counts.conflictPending ? `${counts.conflictPending} 条 pending（无解冲突入口）` : '无 pending')

// 12b) 导入批次校验（--verify-import）
if (VERIFY_IMPORT) {
  const batch = BATCH || String(one("SELECT v FROM meta WHERE k='import_1027_1029_batch'")?.v ?? '')
  const metaRows = Number(one("SELECT v FROM meta WHERE k='import_1027_1029_rows'")?.v ?? -1)
  const frozen = String(one("SELECT v FROM meta WHERE k='import_1027_1029_frozen'")?.v ?? '')
  const rows = batch ? Number(one("SELECT count(*) c FROM raw_meta WHERE json_extract(extra,'$.importBatch')=?", batch)?.c ?? 0) : 0
  const okImport = Boolean(batch) && rows > 0 && rows === metaRows && frozen === '1'
  add('verify-import', okImport ? 'PASS' : 'FAIL', okImport ? `batch=${batch} rows=${rows} frozen=1` : `batch=${batch || '(空)'} rows=${rows} meta_rows=${metaRows} frozen=${frozen || '(缺)'}`)
}

// 13) 时间线/身份列（只统计，不阻塞）
const emptySelfSpeakerId = Number(one("SELECT count(*) c FROM raw_meta WHERE speaker_id='' AND role IN ('self','self-thought')")?.c ?? 0)
add('speaker-id', emptySelfSpeakerId === 0 ? 'PASS' : 'WARN', `self 行的 speaker_id 为空 ${emptySelfSpeakerId} 条（历史行；新行应为 0）`)

const cnt = { PASS: 0, WARN: 0, FAIL: 0 }
for (const c of checks) cnt[c.status] = (cnt[c.status] ?? 0) + 1
const verdict = cnt.FAIL ? 'FAIL' : cnt.WARN ? 'WARN' : 'PASS'
const exitCode = cnt.FAIL ? 2 : cnt.WARN ? 1 : 0

const result = { verdict, exit: exitCode, counts: cnt, db: DB, dataDir: DATA_DIR, checks }
console.log(JSON_OUT ? JSON.stringify(result) : JSON.stringify(result, null, 2))
db.db.close()
process.exit(exitCode)
