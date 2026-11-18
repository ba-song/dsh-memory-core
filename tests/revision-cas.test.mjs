/**
 * 修订 + 乐观锁 CAS（2026-11-16 P0-3）
 *
 * 覆盖：
 *  1) 正常更新：revision+1、memory_revisions 留「改之前」快照、history 可回读
 *  2) 同一条被两个写者用同一个旧 revision 写 → 第二个 E_REVISION_CONFLICT（跨连接真并发）
 *  3) 未知列名 → E_BAD_PATCH（不拼出畸形 SQL）
 *  4) conflict drop → 状态迁移（行数不减、status=corrected、revision+1、revisions+1）
 *  5) 「彻底忘记」不再由 drop 提供（走 dy_memory_forget），本文件不覆盖
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const DIR = '/tmp/dy-revision-cas-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory, updateMemory, listRevisions, getRevision } = await import('../lib/store/memories.js')
const { resolveConflictRow } = await import('../lib/conflict/resolve.js')

const { db } = openDb(DIR)
const out = { ok: true, test: 'revision-cas' }
const rowOf = (id) => db.prepare('SELECT * FROM memories WHERE id=?').get(id)
const revCount = (id) => Number(db.prepare('SELECT count(*) c FROM memory_revisions WHERE memory_id=?').get(id).c)

// ── 1. 正常更新 + 快照 ───────────────────────────────────────────
const id = await insertMemory(db, { kind: 'fact', text: '主人怕辣', confidence: 0.6, importance: 0.5 })
{
  const r = await updateMemory(db, id, { text: '主人以前怕辣，现在能吃一点', importance: 0.7 }, 1)
  assert.equal(r.ok, true)
  assert.equal(r.revision, 2)
  assert.equal(r.previousRevision, 1)
  const row = rowOf(id)
  assert.equal(row.revision, 2)
  assert.equal(row.importance, 0.7)
  assert.ok(Number(row.updated_at) > 0)
  assert.equal(revCount(id), 1, '一次更新一条快照')
  const prev = getRevision(db, id, 1)
  assert.equal(prev.text, '主人怕辣', '快照存的是改之前那版')
  assert.equal(prev.revision, 1)
  const hist = listRevisions(db, id)
  assert.equal(hist.length, 1)
  assert.equal(hist[0].revision, 1)
  out.update = 'ok'
}

// ── 2. 陈旧 revision → 冲突（跨连接真并发：只允许一个赢）────────
{
  const a = await insertMemory(db, { kind: 'fact', text: '并发测试基准', importance: 0.5 })
  const db2 = openDb(DIR).db   // 第二条连接，模拟另一个写者
  const [r1, r2] = await Promise.all([
    updateMemory(db, a, { importance: 0.61 }, 1),
    updateMemory(db2, a, { importance: 0.62 }, 1),
  ])
  const oks = [r1, r2].filter((x) => x.ok === true).length
  const conflicts = [r1, r2].filter((x) => x.ok === false && x.code === 'E_REVISION_CONFLICT').length
  assert.equal(oks, 1, '只允许一个写者成功')
  assert.equal(conflicts, 1, '另一个必须拿到 E_REVISION_CONFLICT')
  assert.equal(rowOf(a).revision, 2)
  try { db2.close?.() } catch {}
  // 再拿旧 revision 写一次（顺序路径）也必须冲突
  const stale = await updateMemory(db, id, { importance: 0.9 }, 1)
  assert.equal(stale.ok, false)
  assert.equal(stale.code, 'E_REVISION_CONFLICT')
  assert.equal(stale.currentRevision, 2)
  out.cas = 'ok'
}

// ── 3. 未知列 → E_BAD_PATCH，且不写 ──────────────────────────────
{
  const before = revCount(id)
  const r = await updateMemory(db, id, { not_a_column: 1 }, 2)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'E_BAD_PATCH')
  assert.equal(revCount(id), before)
  assert.equal(rowOf(id).revision, 2)
  out.badPatch = 'ok'
}

// ── 4. conflict drop → 状态迁移，不物理删 ────────────────────────
{
  const victim = await insertMemory(db, { kind: 'fact', text: '喜欢辣的旧说法', importance: 0.5 })
  const before = Number(db.prepare('SELECT count(*) c FROM memories').get().c)
const other = await insertMemory(db, { kind: 'fact', text: '另一种说法', importance: 0.5 })
  const qid = Number(db.prepare("INSERT INTO conflict_queue(memory_a,memory_b,reason,created_at,status) VALUES(?,?,?,?,?)")
    .run(victim, other, 'opposition', Date.now(), 'pending').lastInsertRowid)
  const r = resolveConflictRow(db, { id: qid, action: 'drop', side: 'old' })
  assert.equal(r.ok, true)
  assert.equal(Number(db.prepare('SELECT count(*) c FROM memories').get().c), before, 'drop 后行数不减')
  const row = rowOf(victim)
  assert.equal(row.status, 'corrected')
  assert.equal(row.revision, 2)
  assert.equal(revCount(victim), 1, 'revisions+1')
  assert.equal(JSON.parse(row.meta).invalidatedBy, `conflict:${qid}`)
  assert.equal(db.prepare('SELECT status FROM conflict_queue WHERE id=?').get(qid).status, 'resolved')
  out.dropTransition = 'ok'
}

console.log(JSON.stringify(out))
