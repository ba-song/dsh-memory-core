import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory, getMemory } from '../lib/store/memories.js'
import { mergePersistentPreference, normalizePreferenceText, parsePreference } from '../lib/pref/merge.js'

let seq = 0
async function setup() {
  const dir = `/tmp/dy-pref-evolution-${process.pid}-${++seq}`
  rmSync(dir, { recursive: true, force: true })
  const { db } = openDb(dir)
  const add = (text, { createdAt = 100, status = 'pending', scopeType = 'owner', scopeId = '', validTo = null, meta = {} } = {}) =>
    insertMemory(db, {
      kind: 'preference', text, createdAt, status, scopeType, scopeId, validTo,
      clarity: 'clear', importance: 0.6, confidence: 0.7,
      meta: { persist: true, persistence: 'long_term', category: 'user_preference', evidenceCount: 1, ...meta },
    })
  return { db, add }
}

test('繁简映射：喜歡咖啡与喜欢咖啡得到同一主题极性', () => {
  assert.equal(normalizePreferenceText('喜歡咖啡'), '喜欢咖啡')
  assert.deepEqual(parsePreference('喜歡咖啡'), { topic: '咖啡', polarity: 1 })
  assert.deepEqual(parsePreference('喜欢咖啡'), { topic: '咖啡', polarity: 1 })
  assert.deepEqual(parsePreference('我最怕咖啡'), { topic: '咖啡', polarity: -1 })
})

test('尾式极性：咖啡不太喜欢识别为明确负极性', () => {
  assert.deepEqual(parsePreference('咖啡不太喜欢'), { topic: '咖啡', polarity: -1 })
})

test('同极性同主题只做既有证据合并，不做 supersede', async () => {
  const { db, add } = await setup()
  const oldId = await add('喜欢咖啡', { createdAt: 100, status: 'active' })
  const newId = await add('我很喜欢咖啡', { createdAt: 200 })
  const r = await mergePersistentPreference(db, { id: newId, now: 1000 })
  assert.equal(r.action, 'merged')
  assert.equal(getMemory(db, oldId).revision, 2)
  assert.equal(getMemory(db, newId).status, 'merged')
  assert.equal(getMemory(db, oldId).status, 'active')
})

test('明确反极性且证据更晚时 supersede', async () => {
  const { db, add } = await setup()
  const oldId = await add('不喜欢咖啡', { createdAt: 100, status: 'active' })
  const newId = await add('喜欢咖啡', { createdAt: 200 })
  const r = await mergePersistentPreference(db, { id: newId, now: 1000 })
  const old = getMemory(db, oldId)
  assert.equal(r.action, 'superseded')
  assert.equal(old.valid_to, 1000)
  assert.equal(old.superseded_by, newId)
  assert.equal(old.revision, 2)
  assert.equal(JSON.parse(old.meta).supersedeReason, 'explicit-opposite-preference')
  assert.equal(getMemory(db, newId).status, 'active')
})

test('不同主题保留两条，不互相 supersede', async () => {
  const { db, add } = await setup()
  const oldId = await add('不喜欢咖啡', { createdAt: 100, status: 'active' })
  const newId = await add('喜欢茶', { createdAt: 200 })
  const r = await mergePersistentPreference(db, { id: newId, now: 1000 })
  assert.equal(r.action, 'inserted')
  assert.equal(getMemory(db, oldId).valid_to, null)
  assert.equal(getMemory(db, newId).status, 'active')
})

test('多分句否定范围不清时不动作', async () => {
  assert.deepEqual(parsePreference('咖啡很好喝，但是我不喜欢'), { topic: '', polarity: 0 })
  const { db, add } = await setup()
  const oldId = await add('喜欢咖啡', { createdAt: 100, status: 'active' })
  const newId = await add('咖啡好喝但是我不喜欢', { createdAt: 200 })
  const r = await mergePersistentPreference(db, { id: newId, now: 1000 })
  assert.equal(r.action, 'unchanged')
  assert.equal(getMemory(db, oldId).valid_to, null)
  assert.equal(getMemory(db, newId).status, 'pending')
})

test('近似主题不同键不合并、不 supersede', async () => {
  const { db, add } = await setup()
  const oldId = await add('喜欢咖啡', { createdAt: 100, status: 'active' })
  const newId = await add('喜欢喝咖啡', { createdAt: 200 })
  const r = await mergePersistentPreference(db, { id: newId, now: 1000 })
  assert.equal(r.action, 'inserted')
  assert.equal(getMemory(db, oldId).valid_to, null)
  assert.equal(getMemory(db, newId).status, 'active')
})

test('不同 scope 不匹配', async () => {
  const { db, add } = await setup()
  const oldId = await add('不喜欢咖啡', { createdAt: 100, status: 'active', scopeType: 'owner', scopeId: '' })
  const newId = await add('喜欢咖啡', { createdAt: 200, scopeType: 'group', scopeId: 'g1' })
  const r = await mergePersistentPreference(db, { id: newId, now: 1000 })
  assert.equal(r.action, 'inserted')
  assert.equal(getMemory(db, oldId).valid_to, null)
})

test('创建时间相等不 supersede', async () => {
  const { db, add } = await setup()
  const oldId = await add('不喜欢咖啡', { createdAt: 100, status: 'active' })
  const newId = await add('喜欢咖啡', { createdAt: 100 })
  const r = await mergePersistentPreference(db, { id: newId, now: 1000 })
  assert.equal(r.action, 'inserted')
  assert.equal(getMemory(db, oldId).valid_to, null)
})

test('supersede 重复调用不重复 revision', async () => {
  const { db, add } = await setup()
  const oldId = await add('不喜欢咖啡', { createdAt: 100, status: 'active' })
  const newId = await add('喜欢咖啡', { createdAt: 200 })
  await mergePersistentPreference(db, { id: newId, now: 1000 })
  const before = Number(db.prepare('SELECT count(*) c FROM memory_revisions').get().c)
  await mergePersistentPreference(db, { id: newId, now: 1000 })
  assert.equal(Number(db.prepare('SELECT count(*) c FROM memory_revisions').get().c), before)
  assert.equal(getMemory(db, oldId).revision, 2)
  assert.equal(getMemory(db, newId).revision, 2)
})

test('quarantined 长期偏好候选不参与合并或激活', async () => {
  const { db, add } = await setup()
  const id = await add('喜欢咖啡', { meta: { quarantined: true } })
  const r = await mergePersistentPreference(db, { id, now: 1000 })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'candidate-quarantined')
  assert.equal(getMemory(db, id).status, 'pending')
  assert.equal(getMemory(db, id).revision, 1)
})

test('supersede 不修改任何一侧正文', async () => {
  const { db, add } = await setup()
  const oldId = await add('不喜欢咖啡', { createdAt: 100, status: 'active' })
  const newId = await add('喜欢咖啡', { createdAt: 200 })
  await mergePersistentPreference(db, { id: newId, now: 1000 })
  assert.equal(getMemory(db, oldId).text, '不喜欢咖啡')
  assert.equal(getMemory(db, newId).text, '喜欢咖啡')
})
