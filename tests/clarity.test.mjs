import test from 'node:test'
import assert from 'node:assert/strict'
import { targetClarity, planClarity } from '../lib/clarity.js'

const now = Date.UTC(2026, 10, 13)
const daysAgo = (n) => now - n * 86400000

test('保护：pinned/最初/高重要度主人记忆不被遗忘', () => {
  assert.equal(targetClarity({ importance: 0.3, pinned: 1, created_at_epoch: daysAgo(500) }, { now }), 'vivid')
  assert.equal(targetClarity({ importance: 0.7, scope_type: 'owner', created_at_epoch: daysAgo(500), meta: '{}' }, { now }), 'clear')
  assert.equal(targetClarity({ importance: 0.95, created_at_epoch: daysAgo(500) }, { now }), 'vivid')
})

test('普通记忆：按年龄目标降档；每天最多一档；到遗忘', () => {
  const old = { id: 1, importance: 0.3, clarity: 'clear', scope_type: 'owner', created_at_epoch: daysAgo(100), meta: '{}' }
  const plan = planClarity([old], { now })
  assert.equal(plan[0].to, 'fuzzy', '只降一档')
  const trace = { ...old, clarity: 'trace' }
  assert.equal(planClarity([trace], { now })[0].to, 'forgotten')
  assert.equal(planClarity([old], { now, days: 3 })[0].to, 'forgotten', '补跑最多 3 档')
})

import { capacityStatus } from '../lib/clarity.js'
test('容量告警 80/90/100', () => {
  assert.equal(capacityStatus(100, 1000).level, 'ok')
  assert.equal(capacityStatus(800, 1000).level, 'warn')
  assert.equal(capacityStatus(900, 1000).level, 'critical')
  assert.equal(capacityStatus(1000, 1000).level, 'full')
})
