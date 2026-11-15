#!/usr/bin/env node
/**
 * 记忆体检（2026-11-12 P0，只读）：重复 / 孤儿 / 僵尸 / 冲突 / token 报表。
 * 用法：node scripts/memory-health.mjs [--data-dir ...] [--json]
 */
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { similarity } from '../lib/consolidate/similarity.js'

const args = process.argv.slice(2)
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const dataDir = getArg('--data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const asJson = args.includes('--json')
const { db } = openDb(dataDir)
const now = Date.now()
const rows = db.prepare('SELECT id,kind,text,importance,created_at_epoch,last_access_epoch,access_count,pinned,status,layer,source_msg_id,meta FROM memories').all()

const byKind = {}
let chars = 0
for (const r of rows) {
  const k = r.kind || '?'
  byKind[k] = byKind[k] || { count: 0, chars: 0, tokensApprox: 0 }
  byKind[k].count++
  const c = String(r.text ?? '').length
  byKind[k].chars += c
  chars += c
}
for (const k of Object.keys(byKind)) byKind[k].tokensApprox = Math.ceil(byKind[k].chars / 1.6)

// 重复：同文本，或相似度 ≥0.92（只比较 active 的前 800 条，避免 O(n^2) 太大）
const active = rows.filter((r) => r.status === 'active')
const duplicates = []
const seen = new Map()
for (const r of active) {
  const t = String(r.text ?? '').trim()
  if (!t) continue
  if (seen.has(t)) { duplicates.push({ a: seen.get(t), b: r.id, score: 1, text: t.slice(0, 40) }); continue }
  seen.set(t, r.id)
}
const sample = active.slice(-800)
for (let i = 0; i < sample.length; i++) {
  for (let j = i + 1; j < sample.length; j++) {
    if (sample[i].kind !== sample[j].kind) continue
    const sc = similarity(sample[i].text, sample[j].text)
    if (sc >= 0.92) duplicates.push({ a: sample[i].id, b: sample[j].id, score: Number(sc.toFixed(3)), text: String(sample[i].text).slice(0, 40) })
  }
}

// 孤儿：没有来源、没有 meta 关联、也没有实体
let orphans = []
try {
  const linked = new Set(db.prepare('SELECT DISTINCT memory_id FROM memory_entities').all().map((r) => Number(r.memory_id)))
  orphans = active.filter((r) => !Number(r.source_msg_id ? 1 : 0) && !linked.has(Number(r.id)) && String(r.layer) !== 'manual').map((r) => r.id)
} catch {}

// 僵尸：active 但 importance 很低、180 天没访问、没置顶
const zombies = active.filter((r) => Number(r.importance) < 0.12 && !Number(r.pinned) && (Number(r.last_access_epoch) || Number(r.created_at_epoch)) < now - 180 * 86400000).map((r) => r.id)

// 冲突
let conflicts = []
try { conflicts = db.prepare("SELECT id,memory_a,memory_b,reason FROM conflict_queue WHERE status='pending'").all() } catch {}
let shortterm = []
try { shortterm = db.prepare('SELECT id,kind,content,at,expires_at FROM shortterm ORDER BY at DESC LIMIT 20').all() } catch {}

const out = {
  dataDir, total: rows.length, active: active.length, chars, tokensApprox: Math.ceil(chars / 1.6),
  byKind, counts: { duplicates: duplicates.length, orphans: orphans.length, zombies: zombies.length, conflicts: conflicts.length, shortterm: shortterm.length },
  duplicates: duplicates.slice(0, 30), orphans: orphans.slice(0, 30), zombies: zombies.slice(0, 30), conflicts, shortterm,
}
if (asJson) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`total=${out.total} active=${out.active} chars=${chars} ~tokens=${out.tokensApprox}`)
  console.log('byKind', byKind)
  console.log(`duplicates=${out.counts.duplicates} orphans=${out.counts.orphans} zombies=${out.counts.zombies} conflicts=${out.counts.conflicts} shortterm=${out.counts.shortterm}`)
  for (const d of out.duplicates) console.log(`  DUP ${d.a}/${d.b} ${d.score} ${d.text}`)
  for (const z of out.zombies.slice(0, 10)) console.log(`  ZOMBIE ${z}`)
  for (const c of out.conflicts) console.log(`  CONFLICT #${c.id} ${c.memory_a}/${c.memory_b} ${c.reason}`)
  for (const s of out.shortterm.slice(0, 10)) console.log(`  SHORT ${s.kind} ${s.content} exp=${new Date(s.expires_at).toISOString().slice(0, 16)}`)
}
