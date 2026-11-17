import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory, getMemory } from '../lib/store/memories.js'
import { mergePersistentPreference } from '../lib/pref/merge.js'

const dir = '/tmp/dy-pref-merge-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const add = (text) => insertMemory(db, {
  kind: 'preference', text, clarity: 'clear', importance: 0.6, confidence: 0.7,
  meta: { persist: true, persistence: 'long_term', category: 'user_preference', evidenceCount: 1 },
})
const oldId = await add('喜欢茶')
const sameId = await add('喜欢茶')
const same = await mergePersistentPreference(db, { id: sameId, text: '喜欢茶', now: 1000 })
assert.equal(same.action, 'merged')
assert.equal(getMemory(db, oldId).revision, 2)
assert.equal(getMemory(db, sameId).status, 'merged')
assert.equal(JSON.parse(getMemory(db, oldId).meta).evidenceCount, 2)

const priorId = await add('不喜欢咖啡')
const nextId = await add('喜欢咖啡')
const changed = await mergePersistentPreference(db, { id: nextId, text: '喜欢咖啡', now: 2000 })
assert.equal(changed.action, 'superseded')
assert.equal(getMemory(db, priorId).valid_to, 2000)
assert.equal(getMemory(db, priorId).superseded_by, nextId)
assert.equal(getMemory(db, priorId).revision, 2)
assert.equal(getMemory(db, nextId).status, 'active')

console.log(JSON.stringify({ ok: true, test: 'preference-merge' }))
