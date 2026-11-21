import assert from 'node:assert/strict'
import { targetClarity } from '../lib/clarity.js'

const now = Date.now()
const durable = targetClarity({
  id: 1, kind: 'preference', text: 'synthetic preference',
  clarity: 'vivid', importance: 0.2, created_at_epoch: now - 365 * 86400000,
  meta: JSON.stringify({ persist: true, persistence: 'long_term' }),
}, { now, forgetAfterDays: 30 })
assert.equal(durable, 'vivid')

const ordinary = targetClarity({
  id: 2, kind: 'preference', text: 'ordinary preference',
  clarity: 'vivid', importance: 0.2, created_at_epoch: now - 365 * 86400000,
  meta: JSON.stringify({ persist: false }),
}, { now, forgetAfterDays: 30 })
assert.equal(ordinary, 'forgotten')

console.log(JSON.stringify({ ok: true, test: 'preference-lifecycle' }))
