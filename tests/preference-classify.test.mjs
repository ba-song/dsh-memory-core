import assert from 'node:assert/strict'
import { classifyPreference } from '../lib/pref/classify.js'

const durable = classifyPreference('以后每次都按这个选项处理', '按这个选项处理')
assert.equal(durable.persist, true)
assert.equal(durable.persistence, 'long_term')
assert.equal(durable.category, 'user_preference')

const temporary = classifyPreference('这次暂时按这个选项处理', '按这个选项处理')
assert.equal(temporary.persist, false)
assert.equal(temporary.persistence, 'temporary')

const unclear = classifyPreference('我更喜欢某个选项', '喜欢某个选项')
assert.equal(unclear.persist, false)
assert.equal(unclear.persistence, 'unspecified')

console.log(JSON.stringify({ ok: true, test: 'preference-classify' }))
