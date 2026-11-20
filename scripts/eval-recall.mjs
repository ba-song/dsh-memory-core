#!/usr/bin/env node
/**
 * 检索评估（2026-11-12 P0）：recall@1 / recall@3 / MRR
 * 用法：
 *   node scripts/eval-recall.mjs [--data-dir ...] [--questions questions.json] [--limit 30] [--json]
 * questions.json: [{ "query": "...", "expected": [记忆id...] }]
 * 不给 questions 时自动构造自检索集：取 active 记忆正文前 12 字当 query，期望命中自己。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { loadVectors } from '../lib/store/memories.js'
import { recall } from '../lib/recall/recall.js'
import { loadEmbed, embedAvailable } from '../lib/embed/onnx.mjs'

const args = process.argv.slice(2)
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const dataDir = getArg('--data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const limit = Math.max(1, Number(getArg('--limit', 30)) || 30)
const asJson = args.includes('--json')
const db = new DatabaseSync(join(dataDir, 'memory.db'), { readOnly: true })
db.exec('PRAGMA query_only=ON')
await loadEmbed('/opt/qqai/models/bge-small-zh')
const vectors = loadVectors(db)

let questions = []
const qPath = getArg('--questions', '')
if (qPath) {
  questions = JSON.parse(readFileSync(qPath, 'utf8'))
} else {
  const rows = db.prepare("SELECT id,text FROM memories WHERE status='active' AND kind IN ('fact','preference','relation','skill','lesson','reflection') ORDER BY id DESC LIMIT ?").all(limit)
  // 自动集：去掉高频主语后取一段更独特的文字，避免所有 query 都撞“主人/汐”这类泛词
  const clean = (t) => String(t).replace(/[\s，。！？；：、“”‘’（）()]/g, '').replace(/主人|希望|可以|自己|觉得|时候|一个|不用/g, '')
  questions = rows.map((r) => {
    const c = clean(r.text)
    const mid = c.length > 16 ? c.slice(4, 18) : c.slice(0, 12)
    return { query: mid || c.slice(0, 12), expected: [Number(r.id)] }
  })
}

let hit1 = 0, hit3 = 0, rr = 0, evaluated = 0
const details = []
for (const q of questions) {
  if (!q?.query || !Array.isArray(q.expected) || !q.expected.length) continue
  let hits = []
  try { hits = await recall(db, q.query, { vectors, limit: 8, trackAccess: false }) } catch {}
  const ids = hits.map((h) => Number(h.id))
  const rank = ids.findIndex((id) => q.expected.map(Number).includes(id))
  evaluated++
  if (rank === 0) hit1++
  if (rank >= 0 && rank < 3) hit3++
  if (rank >= 0) rr += 1 / (rank + 1)
  details.push({ query: q.query, expected: q.expected, got: ids.slice(0, 5), rank })
}
const out = { dataDir, semantic: embedAvailable(), evaluated, recall1: evaluated ? hit1 / evaluated : 0, recall3: evaluated ? hit3 / evaluated : 0, mrr: evaluated ? rr / evaluated : 0, details }
if (asJson) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`evaluated=${out.evaluated} recall@1=${out.recall1.toFixed(3)} recall@3=${out.recall3.toFixed(3)} MRR=${out.mrr.toFixed(3)}`)
  for (const d of details.filter((x) => x.rank < 0).slice(0, 10)) console.log(`  MISS ${d.query}  expected=${d.expected}  got=${d.got}`)
}


db.close()
