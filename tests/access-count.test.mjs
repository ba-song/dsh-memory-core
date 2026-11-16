/**
 * 命中回写 access_count / last_access_epoch（2026-11-16 P0-6）
 *
 * 背景：这两个列以前**全库零 UPDATE**，导致
 *   - maintain/factors.js 的 accessFactorOf 恒为 1
 *   - maintain/decay.js 的「access_count>=3 免衰减」永不触发
 *   - inject/remembered.js 的 last_access 排序恒等于创建时间
 *
 * 覆盖：召回一次 +1 / 再召回 +1 / trackAccess:false 不写 / 因子与衰减真的被影响
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const DIR = '/tmp/dy-access-count-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { recall } = await import('../lib/recall/recall.js')
const { accessFactorOf, memoryScore } = await import('../lib/maintain/factors.js')
const { effectiveImportance } = await import('../lib/maintain/decay.js')

const { db } = openDb(DIR)
const out = { ok: true, test: 'access-count' }
const rowOf = (id) => db.prepare('SELECT * FROM memories WHERE id=?').get(id)

const a = await insertMemory(db, { kind: 'fact', text: '主人喜欢看海', importance: 0.5 })
const b = await insertMemory(db, { kind: 'fact', text: '主人喜欢鲸鱼', importance: 0.5 })
const c = await insertMemory(db, { kind: 'fact', text: '主人常喝咖啡', importance: 0.5 })

// ── 1. 召回一次 → 命中的 +1（未命中的不动）─────────────────────
// 注意：关键词臂分数是名次归一化 1-i/n，三条全命中时最后一条会被 0.35 闸门挡掉，
// 所以这里用只命中两条的 query，避免把「闸门」误当成「回写」问题。
{
  const rows = await recall(db, '喜欢')
  const hit = rows.map((r) => r.id).sort((x, y) => x - y)
  assert.deepEqual(hit, [a, b].sort((x, y) => x - y), '两条都应命中')
  for (const id of hit) {
    const row = rowOf(id)
    assert.equal(row.access_count, 1)
    assert.ok(Number(row.last_access_epoch) > 0)
  }
  assert.equal(rowOf(c).access_count, 0, '没命中的不写')
  out.first = 'ok'
}

// ── 2. 再召回 → +1；不同 query 也累加 ──────────────────────────
{
  await recall(db, '喜欢')
  assert.equal(rowOf(a).access_count, 2)
  await recall(db, '看海')
  assert.equal(rowOf(a).access_count, 3, '换 query 命中同一条也累加')
  out.accumulate = 'ok'
}

// ── 3. trackAccess:false 不写（只读探针用）──────────────────────
{
  const before = rowOf(c).access_count
  await recall(db, '咖啡', { trackAccess: false })
  assert.equal(rowOf(c).access_count, before)
  await recall(db, '咖啡')
  assert.equal(rowOf(c).access_count, before + 1, '恢复回写后 +1')
  out.optOut = 'ok'
}

// ── 4. 因子与衰减真的被点亮 ────────────────────────────────────
{
  const row = rowOf(a)   // access_count 已经是 3
  assert.ok(accessFactorOf(row) > 1.05, 'accessFactorOf 应 >1（旧实现恒为 1）')
  assert.ok(memoryScore(row, { now: Date.now() }).score > Number(row.importance), '综合权重应高于基准 importance')
  // decay 的「access_count>=3 免衰减」：一条老 fact 不再掉 importance
  const old = { kind: 'fact', importance: 0.8, created_at_epoch: Date.now() - 365 * 86400e3, pinned: 0, access_count: 3, meta: '{}' }
  assert.equal(effectiveImportance(old), 0.8, 'access>=3 应免衰减')
  const untouched = { ...old, access_count: 0 }
  assert.ok(effectiveImportance(untouched) < 0.2, '对照：没访问过的老 fact 会衰减')
  out.factors = 'ok'
}

// ── 5. archived / merged 行不该被召回（回写只针对真实命中）───────
{
  const merged = await insertMemory(db, { kind: 'fact', text: '主人喜欢看海（重复说法）', status: 'merged' })
  await recall(db, '看海')
  assert.equal(rowOf(merged).access_count, 0, 'merged 行不进召回，也不该被回写')
  out.statusFilter = 'ok'
}

console.log(JSON.stringify(out))
