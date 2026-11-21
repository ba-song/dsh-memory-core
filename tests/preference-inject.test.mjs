import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { buildPreferenceBlock, PREFERENCE_BUDGET, PREFERENCE_MAX_ITEMS } from '../lib/inject/preference.js'
import { scopeForSession } from '../lib/scope.js'

const dir = '/tmp/dy-pref-inject-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const owner = scopeForSession({ cwd: '/owner', isOwner: true })
const external = scopeForSession({ cwd: '/external', isOwner: false })
const add = (text, meta, validTo = null, scopeType = 'owner', scopeId = '') => insertMemory(db, {
  kind: 'preference', text, importance: 0.8, meta, validTo, scopeType, scopeId,
})
assert.equal(buildPreferenceBlock(db, { scope: owner }), '')
await add('未确认的记录', { persist: false, persistence: 'unspecified' })
await add('已过期记录', { persist: true, persistence: 'long_term' }, Date.now() - 1)
await add('联系人私有记录', { persist: true, persistence: 'long_term' }, null, 'contact', 'qq:12345')
await add('长期记录 A', { persist: true, persistence: 'long_term' })
await add('长期记录 B', { persist: true, persistence: 'long_term' })
const block = buildPreferenceBlock(db, { scope: owner })
assert.ok(block.includes('长期记录 A'))
assert.ok(block.includes('长期记录 B'))
assert.ok(!block.includes('未确认'))
assert.ok(!block.includes('已过期'))
assert.ok(!block.includes('联系人私有'))
assert.ok(block.length <= PREFERENCE_BUDGET)
assert.equal(buildPreferenceBlock(db, { scope: external }), '')
assert.ok(PREFERENCE_MAX_ITEMS <= 3)

console.log(JSON.stringify({ ok: true, test: 'preference-inject', length: block.length }))
