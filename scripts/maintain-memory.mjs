#!/usr/bin/env node
/**
 * 多因子记忆权重 dry-run（2026-11-12）
 * 只读：列出当前 active 记忆的综合权重与因子明细，供决定是否开启维护。
 * 用法：node scripts/maintain-memory.mjs [--data-dir ...] [--limit 20] [--json]
 */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { memoryScore, STALE } from '../lib/maintain/factors.js'

const args = process.argv.slice(2)
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const dataDir = getArg('--data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const limit = Math.max(1, Number(getArg('--limit', 20)) || 20)
const asJson = args.includes('--json')
const now = Date.now()

const db = new DatabaseSync(join(dataDir, 'memory.db'), { readOnly: true })
const rows = db.prepare(`
  SELECT id, kind, text, importance, created_at_epoch, last_access_epoch, access_count, pinned, meta, status
  FROM memories WHERE status='active' OR status IS NULL
`).all()
db.close()

const scored = rows.map((m) => {
  const { score, factors } = memoryScore(m, { now })
  return { id: m.id, kind: m.kind, text: String(m.text ?? '').slice(0, 50), score: Number(score.toFixed(4)), stale: score < STALE, factors }
})
scored.sort((a, b) => a.score - b.score)
const stale = scored.filter((s) => s.stale)

if (asJson) {
  console.log(JSON.stringify({ dataDir, total: scored.length, stale: stale.length, threshold: STALE, bottom: scored.slice(0, limit), top: scored.slice(-limit).reverse() }, null, 2))
} else {
  console.log(`dataDir=${dataDir} total=${scored.length} stale(<${STALE})=${stale.length}`)
  console.log(`\n最低 ${limit} 条（最该被遗忘）：`)
  for (const s of scored.slice(0, limit)) console.log(`  ${s.score}  ${s.kind}  ${s.text}  [t=${s.factors.time.toFixed(2)} a=${s.factors.access.toFixed(2)} e=${s.factors.emotion.toFixed(2)}]`)
  console.log(`\n最高 ${Math.min(limit, 5)} 条（最耐久）：`)
  for (const s of scored.slice(-Math.min(limit, 5)).reverse()) console.log(`  ${s.score}  ${s.kind}  ${s.text}`)
}
