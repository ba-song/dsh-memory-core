import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory, getMemory } from '../lib/store/memories.js'
import { mergePersistentPreference } from '../lib/pref/merge.js'

const dir = '/tmp/dy-pref-merge-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const add = (text, createdAt, extra = {}) => insertMemory(db, {
  kind: 'preference', text, clarity: 'clear', importance: 0.6, confidence: 0.7, ...(createdAt ? { createdAt } : {}),
  meta: { persist: true, persistence: 'long_term', category: 'user_preference', evidenceCount: 1 },
  ...extra,
})
const oldId = await add('喜欢茶')
const sameId = await add('喜欢茶')
const same = await mergePersistentPreference(db, { id: sameId, text: '喜欢茶', now: 1000 })
assert.equal(same.action, 'merged')
assert.equal(getMemory(db, oldId).revision, 2)
assert.equal(getMemory(db, sameId).status, 'merged')
assert.equal(JSON.parse(getMemory(db, oldId).meta).evidenceCount, 2)

const priorId = await add('不喜欢咖啡', 1000)
const nextId = await add('喜欢咖啡', 2000)
const changed = await mergePersistentPreference(db, { id: nextId, text: '喜欢咖啡', now: 2000 })
assert.equal(changed.action, 'superseded')
assert.equal(getMemory(db, priorId).valid_to, 2000)
assert.equal(getMemory(db, priorId).superseded_by, nextId)
assert.equal(getMemory(db, priorId).revision, 2)
assert.equal(getMemory(db, nextId).status, 'active')

console.log(JSON.stringify({ ok: true, test: 'preference-merge' }))


// Batch C：候选保留 active/pending 兼容，但必须当前未生效于未来且未被替代；
// 旧偏好比较集合统一使用 current validity helper。
for (const [label, topic, mutate] of [
  ['future valid_from', '柠檬', (id, at) => db.prepare('UPDATE memories SET valid_from=? WHERE id=?').run(at + 1, id)],
  ['expired valid_to', '椰子', (id, at) => db.prepare('UPDATE memories SET valid_to=? WHERE id=?').run(at, id)],
  ['superseded', '牛奶', (id) => db.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(999999, id)],
]) {
  const at = 5000
  const oldId = await add('喜欢' + topic, at - 10)
  mutate(oldId, at)
  const candidateId = await add('喜欢' + topic, at)
  const result = await mergePersistentPreference(db, { id: candidateId, text: '喜欢' + topic, now: at })
  assert.equal(result.action, 'unchanged', label + ' old preference must not be merged')
  assert.equal(getMemory(db, oldId).revision, 1, label + ' old preference must not be revised')
  assert.equal(getMemory(db, candidateId).status, 'active')
}

// Candidate-side validity: a future candidate or a superseded candidate cannot
// activate, merge, or mutate any other row.
{
  const at = 7000
  const futureId = await add('喜欢芒果', at, { validFrom: at + 1 })
  const futureResult = await mergePersistentPreference(db, { id: futureId, text: '喜欢芒果', now: at })
  assert.equal(futureResult.ok, false)
  assert.equal(futureResult.reason, 'candidate-invalidated')
  assert.equal(getMemory(db, futureId).revision, 1)

  const supersededId = await add('喜欢葡萄', at)
  db.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(999998, supersededId)
  const supersededResult = await mergePersistentPreference(db, { id: supersededId, text: '喜欢葡萄', now: at })
  assert.equal(supersededResult.ok, false)
  assert.equal(supersededResult.reason, 'candidate-invalidated')
  assert.equal(getMemory(db, supersededId).revision, 1)

  // Existing contract is intentionally stricter for candidate valid_to:
  // any non-null end blocks it, including an end in the future.
  const futureEndId = await add('喜欢草莓', at, { validTo: at + 100 })
  const futureEndResult = await mergePersistentPreference(db, { id: futureEndId, text: '喜欢草莓', now: at })
  assert.equal(futureEndResult.ok, false)
  assert.equal(futureEndResult.reason, 'candidate-invalidated')
  assert.equal(getMemory(db, futureEndId).revision, 1)
}

// Pending remains a valid candidate state. The helper must not accidentally
// collapse the candidate domain to strict current(active-only).
{
  const at = 9000
  const pendingId = await add('咖啡', at, { status: 'pending' })
  const result = await mergePersistentPreference(db, { id: pendingId, text: '咖啡', now: at })
  assert.equal(result.ok, true)
  assert.equal(result.action, 'inserted')
  assert.equal(getMemory(db, pendingId).status, 'active')
}
