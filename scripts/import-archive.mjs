#!/usr/bin/env node
/**
 * 旧档案导入（10-27～10-29）+ speaker_id 历史回填 —— 2026-11-05
 *
 * 默认 **dry-run**（只读）。写操作必须显式指定：
 *   node scripts/import-archive.mjs --apply-speaker     # 第三步：只回填 speaker_id（单独事务）
 *   node scripts/import-archive.mjs --apply-import      # 第四步：只导入（单事务分批 500）
 *
 * 其他参数：--db <path> --data-dir <dir> --src <档案目录> --batch <id> --self-id <id>
 *
 * 纪律：不碰 memories、不改已有行正文、不删源文件；所有写入都可按 batch 整批回滚（见报告）。
 */
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(`--${f}`)
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}

const DATA_DIR = arg('data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const SRC = arg('src', '/sdcard/DSHA/记忆/档案')
const DB = arg('db', join(DATA_DIR, 'memory.db'))
const DAYS = (arg('days', '2026-10-27,2026-10-28,2026-10-29')).split(',')
const BATCH = arg('batch', 'imp-1027-1029-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14))
const SELF_ID = arg('self-id', 'self:1d21547c-9973-4060-aca8-11bb891ea4e7')
const APPLY_SPEAKER = has('apply-speaker')
const APPLY_IMPORT = has('apply-import')

const cfg = (() => { try { return JSON.parse(readFileSync(join(DATA_DIR, 'config.json'), 'utf8')) } catch { return {} } })()
const OWNER_QQ = String(cfg.ownerQQ ?? '').trim()
let OWNER_DIR = String(cfg.ownerPrivateDir ?? '').trim()
if (!OWNER_DIR && OWNER_QQ) OWNER_DIR = `/root/qq-agent/QQ会话/私聊_${OWNER_QQ}`

const LINE = /^(\d{2}):(\d{2}):(\d{2}) \[(\d+)\] ([^：]+)：(.*)$/
const ROLE_MAP = { 主人: 'user', 汐: 'self', '汐·想': 'self-thought' }
const SPEAKER_OF = { user: 'user', self: 'self', 'self-thought': 'self' }
const sha = (s) => createHash('sha1').update(s).digest('hex')
const keyOf = (day, seq, role, body) => sha(`${day}|${seq}|${role}|${body}`)

/** 解析单个文件 → 行记录 */
function parseFile(day, file) {
  const abs = join(SRC, day, file)
  const text = readFileSync(abs, 'utf8')
  const out = []
  let lineNo = 0
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    lineNo += 1
    const m = LINE.exec(raw.replace(/\r$/, ''))
    if (!m) { out.push({ bad: true, raw, lineNo }); continue }
    const [, hh, mm, ss, seqS, roleRaw, body] = m
    const seq = Number(seqS)
    const role = ROLE_MAP[roleRaw] ?? roleRaw
    const at = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), Number(hh), Number(mm), Number(ss)).getTime()
    const selfLike = role === 'self' || role === 'self-thought'
    const cwdUnknown = !file.startsWith('s-9d1cfb9f')
    out.push({
      raw, lineNo, hh, mm, ss, seq, role, body, at,
      key: keyOf(day, seq, role, body),
      speaker: SPEAKER_OF[role] ?? '',
      speakerId: selfLike ? 'self:unknown' : '',
      pendingIdentity: selfLike,
      cwd: cwdUnknown ? '' : OWNER_DIR,
      thread: cwdUnknown ? '' : OWNER_QQ,
      cwdUnknown,
      file: `${day}/${file}`,
    })
  }
  return out
}

// ── 计划 ────────────────────────────────────────────────────────
const ro = new DatabaseSync(DB, { readOnly: true })
const dbKeys = new Set()
const seqRoleSeen = new Map()
try {
  for (const d of DAYS) {
    for (const r of ro.prepare('SELECT seq,role,raw_text FROM raw_meta WHERE day=?').all(d)) {
      const t = String(r.raw_text ?? '')
      const m = LINE.exec(t)
      const body = m ? m[6] : t
      dbKeys.add(keyOf(d, Number(r.seq), String(r.role), body))
    }
  }
} catch (e) { console.error('读库失败：', e?.message ?? e); process.exit(3) }

const filesUsed = new Map()
const plan = []
let conflicts = 0
let skipped = 0
let dupSameBatch = 0
const seenBatch = new Set()
for (const day of DAYS) {
  const files = readdirSync(join(SRC, day)).filter((f) => f.endsWith('.md') && !f.includes('(1)')).sort()
  for (const f of files) {
    const rows = parseFile(day, f)
    if (rows.some((r) => r.bad)) { console.error(`解析失败：${day}/${f}`); process.exit(2) }
    let used = 0
    for (const r of rows) {
      const sr = `${day}|${r.seq}|${r.role}`
      const prev = seqRoleSeen.get(sr)
      if (prev !== undefined && prev !== r.key) { conflicts += 1; continue }
      seqRoleSeen.set(sr, r.key)
      if (dbKeys.has(r.key)) { skipped += 1; continue }
      if (seenBatch.has(r.key)) { dupSameBatch += 1; continue }
      seenBatch.add(r.key)          // 同批内去重（plain vs backfill）
      plan.push(r); used += 1
    }
    if (used) filesUsed.set(`${day}/${f}`, { day, file: f, rows: used, src: join(SRC, day, f) })
  }
}
const speaker = {
  A_selfPrefix: Number(ro.prepare("SELECT count(*) c FROM raw_meta WHERE speaker LIKE 'self:%'").get()?.c ?? 0),
  B_selfEmpty: Number(ro.prepare("SELECT count(*) c FROM raw_meta WHERE role IN ('self','self-thought') AND speaker=''").get()?.c ?? 0),
}
const counts = {
  rawMeta: Number(ro.prepare('SELECT count(*) c FROM raw_meta').get()?.c ?? 0),
  rawFts: Number(ro.prepare('SELECT count(*) c FROM raw_fts').get()?.c ?? 0),
  memories: Number(ro.prepare('SELECT count(*) c FROM memories').get()?.c ?? 0),
}
ro.close()

const summary = {
  mode: APPLY_SPEAKER ? 'apply-speaker' : APPLY_IMPORT ? 'apply-import' : 'dry-run',
  db: DB, days: DAYS, batch: BATCH,
  insert: plan.length, skip: skipped, dupSameBatch, conflict: conflicts,
  files: [...filesUsed.values()].map((f) => ({ file: f.file, day: f.day, rows: f.rows })),
  speakerBackfill: { ruleA: speaker.A_selfPrefix, ruleB: speaker.B_selfEmpty, total: speaker.A_selfPrefix + speaker.B_selfEmpty },
  before: counts,
  expectAfter: { rawMeta: counts.rawMeta + plan.length, rawFts: counts.rawFts + plan.length },
}

if (!APPLY_SPEAKER && !APPLY_IMPORT) {
  console.log(JSON.stringify(summary, null, 2))
  process.exit(conflicts ? 1 : 0)
}

// ── 写操作 ──────────────────────────────────────────────────────
const db = new DatabaseSync(DB)
db.exec('PRAGMA busy_timeout=10000')
db.exec('PRAGMA journal_mode=WAL')
const startedAt = Date.now()

if (APPLY_SPEAKER) {
  const before = {
    a: Number(db.prepare("SELECT count(*) c FROM raw_meta WHERE speaker LIKE 'self:%'").get().c),
    b: Number(db.prepare("SELECT count(*) c FROM raw_meta WHERE role IN ('self','self-thought') AND speaker=''").get().c),
    emptySelfId: Number(db.prepare("SELECT count(*) c FROM raw_meta WHERE speaker_id='' AND role IN ('self','self-thought')").get().c),
  }
  db.exec('BEGIN IMMEDIATE')
  let a = 0; let b = 0
  try {
    a = Number(db.prepare("UPDATE raw_meta SET speaker_id=speaker, speaker='self' WHERE speaker LIKE 'self:%'").run().changes)
    b = Number(db.prepare("UPDATE raw_meta SET speaker_id=?, speaker='self' WHERE role IN ('self','self-thought') AND speaker=''").run(SELF_ID).changes)
    db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('speaker_backfill_at',?)").run(String(startedAt))
    db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('speaker_backfill_rows',?)").run(String(a + b))
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    console.error('回填失败：', e?.message ?? e)
    process.exit(2)
  }
  const after = {
    a: Number(db.prepare("SELECT count(*) c FROM raw_meta WHERE speaker LIKE 'self:%'").get().c),
    b: Number(db.prepare("SELECT count(*) c FROM raw_meta WHERE role IN ('self','self-thought') AND speaker=''").get().c),
    emptySelfId: Number(db.prepare("SELECT count(*) c FROM raw_meta WHERE speaker_id='' AND role IN ('self','self-thought')").get().c),
  }
  console.log(JSON.stringify({ mode: 'apply-speaker', selfId: SELF_ID, updated: { ruleA: a, ruleB: b, total: a + b }, before, after }, null, 2))
  db.close()
  process.exit(0)
}

// 导入：单事务、分批 500
const before = {
  rawMeta: Number(db.prepare('SELECT count(*) c FROM raw_meta').get().c),
  rawFts: Number(db.prepare('SELECT count(*) c FROM raw_fts').get().c),
}
db.exec('BEGIN IMMEDIATE')
let inserted = 0
let copied = 0
try {
  const ins = db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,speaker_id,channel,account_id,thread_id,external_id,url,tombstone,chars,raw_text,at,extra,cwd)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`)
  const insFts = db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)')
  for (let i = 0; i < plan.length; i += 500) {
    const chunk = plan.slice(i, i + 500)
    for (const r of chunk) {
      const extra = JSON.stringify({
        importedFrom: 'archive-backfill', importBatch: BATCH, srcFile: r.file, srcLine: r.lineNo,
        kind: 'backfill', ...(r.pendingIdentity ? { pendingIdentity: true } : {}), ...(r.cwdUnknown ? { cwdUnknown: true } : {}),
      })
      ins.run(r.file.split('/')[0], r.file, r.lineNo, r.seq, r.role, r.speaker, r.speakerId, 'qq', '', r.thread, '', '', r.raw.length, r.raw, r.at, extra, r.cwd)
      const id = Number(db.prepare('SELECT last_insert_rowid() id').get().id)
      const text = r.body.length > 600 ? r.body.slice(-400) : r.body
      try { insFts.run(id, bigrams(text) || text) } catch {}
      inserted += 1
    }
  }
  // 复制源 md（只复制真正用到的文件；不覆盖已存在）
  for (const f of filesUsed.values()) {
    const dstDir = join(DATA_DIR, 'raw', f.day)
    mkdirSync(dstDir, { recursive: true })
    const dst = join(dstDir, f.file)
    if (!existsSync(dst)) { copyFileSync(f.src, dst); copied += 1 }
  }
  db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('import_1027_1029_at',?)").run(String(startedAt))
  db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('import_1027_1029_batch',?)").run(BATCH)
  db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('import_1027_1029_rows',?)").run(String(inserted))
  db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('import_1027_1029_frozen','1')").run()
  db.exec('COMMIT')
} catch (e) {
  try { db.exec('ROLLBACK') } catch {}
  console.error('导入失败：', e?.message ?? e)
  process.exit(2)
}
const after = {
  rawMeta: Number(db.prepare('SELECT count(*) c FROM raw_meta').get().c),
  rawFts: Number(db.prepare('SELECT count(*) c FROM raw_fts').get().c),
}
console.log(JSON.stringify({ mode: 'apply-import', batch: BATCH, inserted, copiedFiles: copied, before, after }, null, 2))
db.close()

// bigrams 与 lib/store/fts.js 同款（避免跨目录 import）
function bigrams(text) {
  const PUNCT = /[\p{P}\p{S}\s]/u
  let out = ''
  for (const ch of String(text ?? '')) out += (PUNCT.test(ch) ? ' ' : ch)
  const grams = []
  for (const p of out.split(/\s+/).filter(Boolean)) {
    const chars = [...p]
    if (chars.length === 1) { grams.push(chars[0]); continue }
    for (let i = 0; i < chars.length - 1; i++) grams.push(chars[i] + chars[i + 1])
  }
  return grams.join(' ')
}
