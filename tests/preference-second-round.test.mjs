import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { pickRemembered } from '../lib/inject/remembered.js'
import { extractPreference } from '../lib/ingest/classes.js'
import { mergePersistentPreference } from '../lib/pref/merge.js'
import { classifyPreference } from '../lib/pref/classify.js'

const dir = '/tmp/dy-pref-round2-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)

// Classification: topic words alone are not duration evidence.
for (const phrase of ['我偏好这个方案', '我习惯这样点', '默认用这个选项']) {
  assert.equal(classifyPreference(phrase, phrase).persist, false, phrase)
}
assert.equal(classifyPreference('以后每次都按这个方案', '按这个方案').persist, true)
assert.equal(classifyPreference('这次暂时按这个方案', '按这个方案').persistence, 'temporary')

// Extraction must preserve ASCII n and stop at a real newline.
assert.equal(extractPreference('我喜欢newjeans')?.text, '喜欢newjeans')
assert.equal(extractPreference('我喜欢奶茶\n还有别的东西')?.text, '喜欢奶茶')

// Preferences (long-term, temporary, unspecified) must never leak into remembered.
// The dedicated preference block is the sole persistent-preference injector.
const add = (kind, text, meta = {}) => insertMemory(db, {
  kind, text, importance: 0.8, clarity: 'clear', scopeType: 'owner', scopeId: '',
  meta,
})
await add('preference', '长期偏好文本', { persist: true, persistence: 'long_term' })
await add('preference', '临时偏好文本', { persist: false, persistence: 'temporary' })
await add('preference', '未确认偏好文本', { persist: false, persistence: 'unspecified' })
await add('relation', '关系记忆文本')
const remembered = pickRemembered(db, { scope: { level: 'owner' } })
assert.ok(remembered.block.includes('关系记忆文本'))
assert.ok(!remembered.block.includes('长期偏好文本'))
assert.ok(!remembered.block.includes('临时偏好文本'))
assert.ok(!remembered.block.includes('未确认偏好文本'))

// Atomicity: force candidate status transition to fail after the prior row
// has been revised. The transaction must roll back both updates and keep
// the incoming candidate pending rather than leaving two active records.
const priorId = await add('preference', '喜欢咖啡', { persist: true, persistence: 'long_term', evidenceCount: 1 })
const candidateId = await insertMemory(db, {
  kind: 'preference', text: '喜欢咖啡', status: 'pending', importance: 0.6,
  scopeType: 'owner', scopeId: '',
  meta: { persist: true, persistence: 'long_term', evidenceCount: 1 },
})
db.exec(`CREATE TRIGGER fail_candidate_merge BEFORE UPDATE OF status ON memories
  WHEN OLD.id = ${Number(candidateId)} AND NEW.status = 'merged'
  BEGIN SELECT RAISE(ABORT, 'injected candidate update failure'); END`)
await assert.rejects(() => mergePersistentPreference(db, { id: candidateId, text: '喜欢咖啡', now: 5000 }))
const prior = db.prepare('SELECT * FROM memories WHERE id=?').get(priorId)
const candidate = db.prepare('SELECT * FROM memories WHERE id=?').get(candidateId)
assert.equal(prior.revision, 1)
assert.equal(JSON.parse(prior.meta).evidenceCount, 1)
assert.equal(candidate.status, 'pending')
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memories WHERE kind='preference' AND status='active' AND text='喜欢咖啡'").get().n, 1)

console.log(JSON.stringify({ ok: true, test: 'preference-second-round' }))
