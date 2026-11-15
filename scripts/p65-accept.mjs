#!/usr/bin/env node
/**
 * P6.5 线上验收（Q1–Q6）——**只读**，不写生产库、不发 QQ、不重启。
 *
 * 用法：
 *   node scripts/p65-accept.mjs [--db <path>] [--cwd <私聊目录>] [--keyword 看海]
 *
 * 默认读本地配置解析主人私聊目录，用只读连接打开生产 memory.db（PRAGMA query_only=1）。
 * 输出只含计数/长度/标签/时间，不回显任何原话正文。
 */
import { DatabaseSync } from 'node:sqlite'
import { loadConfig, resolveOwner, DATA_DIR } from '../lib/config.js'
import { join } from 'node:path'
import { buildQuotesBlock } from '../lib/inject/quotes.js'

const argv = process.argv.slice(2)
const arg = (name, def = '') => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}

const cfg = loadConfig()
const owner = resolveOwner(cfg)
const dbPath = arg('db', join(DATA_DIR, 'memory.db'))
const cwd = arg('cwd', owner.ownerPrivateDir)
const keyword = arg('keyword', '看海')
if (!cwd) {
  console.error(JSON.stringify({ ok: false, error: 'owner 未配置（ownerQQ / ownerPrivateDir）' }))
  process.exit(1)
}

const db = new DatabaseSync(dbPath, { readOnly: true })
db.exec('PRAGMA query_only=1')

const out = { ok: true, db: dbPath.replace(/.*\//, ''), cwdSet: Boolean(cwd), q: {} }
const fail = []
const check = (name, cond, detail = {}) => {
  out.q[name] = { ...(out.q[name] ?? {}), pass: Boolean(cond), ...detail }
  if (!cond) fail.push(name)
}

const row = (sql, ...p) => { try { return db.prepare(sql).get(...p) } catch { return undefined } }
const rows = (sql, ...p) => { try { return db.prepare(sql).all(...p) } catch { return [] } }

out.totals = {
  raw: row('SELECT count(*) c FROM raw_meta')?.c ?? 0,
  memories: row('SELECT count(*) c FROM memories')?.c ?? 0,
  withKeyword: row('SELECT count(*) c FROM raw_meta WHERE cwd=? AND raw_text LIKE ?', cwd, `%${keyword}%`)?.c ?? 0,
}

// 取一条「很久以前」的命中行作为基准（必须早于 30 分钟窗口，才证明得了 Q3）
const oldRow =
  row(`SELECT * FROM raw_meta WHERE cwd=? AND tombstone=0 AND role IN ('主人','汐','汐·想') AND raw_text LIKE ? ORDER BY at ASC LIMIT 1`, cwd, `%${keyword}%`) ??
  row(`SELECT * FROM raw_meta WHERE cwd=? AND tombstone=0 AND raw_text LIKE ? ORDER BY at ASC LIMIT 1`, cwd, `%${keyword}%`)
if (!oldRow) {
  console.log(JSON.stringify({ ...out, ok: false, error: '档案里没有该关键词，无法验收 Q3', keyword }, null, 2))
  db.close()
  process.exit(1)
}
const ageMin = Math.round((Date.now() - Number(oldRow.at)) / 60000)
const keywordRowsInWindow = row('SELECT count(*) c FROM raw_meta WHERE cwd=? AND tombstone=0 AND at>=? AND raw_text LIKE ?',
  cwd, Date.now() - 30 * 60000, `%${keyword}%`)?.c ?? 0
// 最近一条 raw 的时间；用它 +5 分钟作为「窗口内」模拟基准（真实 now 可能已经空闲很久）
const latestRow = row('SELECT * FROM raw_meta WHERE cwd=? AND tombstone=0 ORDER BY at DESC LIMIT 1', cwd)
const windowBaseAt = Number(latestRow?.at ?? Date.now())
const simNow = windowBaseAt + 5 * 60000
out.window = { realNow: Date.now(), windowBaseAt, simNow, rowsIn30m: row('SELECT count(*) c FROM raw_meta WHERE cwd=? AND tombstone=0 AND at>=?', cwd, Date.now() - 30 * 60000)?.c ?? 0 }
out.baseline = { ageMinutes: ageMin, day: oldRow.day, role: oldRow.role }


/** 判断块里是否真的带了某一行（按行首时间+角色+文本前缀匹配），只返回布尔 */
const stripPrefix = (t) => String(t ?? '').replace(/^\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：/, '')
const clockOf = (at) => { const d = new Date(Number(at)); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}` }
const blockHasRow = (block, r) => {
  const prefix = stripPrefix(r?.raw_text).replace(/\s+/g, ' ').trim().slice(0, 10)
  if (!prefix) return false
  return String(block ?? '').split('\n').some((line) => line.includes(clockOf(r.at)) && line.includes(prefix.slice(0, 6)))
}

const blockInfo = (r) => {
  const lines = String(r?.block ?? '').split('\n').filter((l) => l.startsWith('- '))
  const keys = lines.map((l) => l.replace(/^-\s*\d{2}:\d{2}\s*/, ''))
  return { len: String(r?.block ?? '').length, lines: lines.length, tags: r?.sources?.tags ?? [], dupKeys: keys.length - new Set(keys).size }
}

// ── Q1：本轮查询能带出原话（窗口内模拟 now = 最近一条 +5 分钟）──
{
  const r = buildQuotesBlock(db, { cwd, hits: [], query: keyword, now: simNow })
  const i = blockInfo(r)
  check('Q1', i.tags.includes('query') && String(r?.block ?? '').includes(keyword), {
    tags: i.tags, len: i.len, containsKeyword: String(r?.block ?? '').includes(keyword),
  })
}
// ── Q2：换一个无关查询，窗口内仍有「最近」来源 ──────────────────
{
  const r = buildQuotesBlock(db, { cwd, hits: [], query: '今天天气怎么样呀', now: simNow })
  const i = blockInfo(r)
  check('Q2', i.tags.includes('recent') && i.len > 0, { tags: i.tags, len: i.len })
}
// ── Q3：窗口外（真实 now）靠查询带出旧原话 ─────────────────────
// 前提：最近 30 分钟内没有任何该关键词行 → 块里出现关键词只可能来自 query 路
{
  const r = buildQuotesBlock(db, { cwd, hits: [], query: keyword, now: Date.now() })
  const i = blockInfo(r)
  check('Q3', ageMin > 30 && i.tags.includes('query') && String(r?.block ?? '').includes(keyword), {
    ageMinutes: ageMin, keywordRowsInWindow, tags: i.tags, len: i.len,
    containsKeyword: String(r?.block ?? '').includes(keyword),
    proof: keywordRowsInWindow === 0 ? 'strong（窗口内无该关键词行，只可能来自 query 路）' : 'weak（窗口内也有该关键词，无法区分来源）',
  })
}
// ── Q4：出处原文 + 思考（数值 seq → raw_meta.seq）────────────────
{
  const cands = rows("SELECT * FROM memories WHERE source_msg_id LIKE '%:%' ORDER BY id DESC LIMIT 80")
  let hit = null
  for (const m of cands) {
    const mm = String(m.source_msg_id ?? '').match(/:(\d+)$/)
    if (!mm) continue
    const r = row('SELECT * FROM raw_meta WHERE seq=? AND cwd=? ORDER BY at DESC LIMIT 1', Number(mm[1]), cwd)
    if (r) { hit = { m, r }; break }
  }
  if (hit) {
    const now = Number(hit.r.at) + 60 * 1000
    const r = buildQuotesBlock(db, { cwd, hits: [hit.m], query: '', now })
    const i = blockInfo(r)
    const thought = row(`SELECT count(*) c FROM raw_meta WHERE file=? AND line_no BETWEEN ? AND ? AND cwd=? AND role='汐·想'`,
      hit.r.file, hit.r.line_no - 2, hit.r.line_no + 2, cwd)?.c ?? 0
    check('Q4', i.tags.includes('prov') && i.lines > 0, { tags: i.tags, len: i.len, nearbyThoughts: thought })
  } else {
    check('Q4', false, { reason: '没有可映射到 raw_meta.seq 的记忆来源' })
  }
}
// ── Q5：预算与去重（用 Q3 的块）────────────────────────────────
{
  const r = buildQuotesBlock(db, { cwd, hits: [], query: keyword, now: Date.now() })
  const i = blockInfo(r)
  check('Q5', i.len <= 300 && i.lines <= 4 && i.dupKeys === 0, { len: i.len, lines: i.lines, dupKeys: i.dupKeys })
}
// ── Q6：无记忆命中时仍只注【相关原话】 ─────────────────────────
{
  const r = buildQuotesBlock(db, { cwd, hits: [], query: '', now: simNow })
  const i = blockInfo(r)
  check('Q6', i.len > 0 && i.tags.every((t) => t === 'recent' || t === 'query'), { tags: i.tags, len: i.len })
}

db.close()
out.failed = fail
out.ok = fail.length === 0
console.log(JSON.stringify(out, null, 2))
process.exit(out.ok ? 0 : 1)
