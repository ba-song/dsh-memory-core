import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHitQuery } from '../lib/inject/hits.js'

const msg = (role, text, kind) => ({ role, content: [{ type: 'text', text }], source: kind ? { kind } : undefined })

test('命中 query：汇总最近真实用户消息 + 最近 assistant', () => {
  const messages = [
    msg('assistant', '更早的话', 'model'),
    msg('user', '主人上一句', 'user'),
    msg('assistant', '她最近一句（应该被带上）', 'model'),
    msg('user', '主人现在这句', 'user'),
  ]
  const r = buildHitQuery(messages)
  assert.equal(r.user, '主人上一句\n主人现在这句')
  assert.equal(r.self, '她最近一句（应该被带上）')
  assert.equal(r.query, '主人上一句\n主人现在这句\n她最近一句（应该被带上）')
})

test('命中 query：可关闭 assistant；汇总用户消息并跳过记忆注入块', () => {
  const messages = [
    msg('assistant', '很早的话', 'model'),
    msg('user', '主语', 'user'),
    msg('assistant', '【记忆·本轮相关】注入内容', 'model'),
    msg('user', '当前', 'user'),
  ]
  assert.equal(buildHitQuery(messages, { includeSelf: false }).query, '主语\n当前')
  const r = buildHitQuery(messages)
  assert.equal(r.self, '很早的话', '跳过记忆块后取最近一条真实 assistant')
})

test('命中 query：没有 user 时为空；兼容 source.kind=user', () => {
  assert.equal(buildHitQuery([msg('assistant', 'x', 'model')]).query, '')
  assert.equal(buildHitQuery([msg('assistant', 'x', 'model')]).self, '')
  const r = buildHitQuery([msg('user', '来自渠道', 'channel-inbound')])
  assert.equal(r.user, '来自渠道')
})

import { shouldInject, createHitState } from '../lib/inject/hits.js'

test('每一步都匹配：同一轮最多注入 maxPerTurn 次', () => {
  const st = createHitState()
  const hit = (score = 0.8) => [{ text: '记忆', kind: 'fact', scores: { keyword: score } }]
  const first = shouldInject(st, 's1', { hits: hit(), turn: 1, entities: ['a'], chars: 10, maxPerTurn: 2 })
  assert.equal(first.inject, true)
  const second = shouldInject(st, 's1', { hits: hit(0.9), turn: 1, entities: ['b'], chars: 10, maxPerTurn: 2 })
  assert.equal(second.inject, true)
  const third = shouldInject(st, 's1', { hits: hit(0.95), turn: 1, entities: ['c'], chars: 10, maxPerTurn: 2 })
  assert.equal(third.inject, false)
  assert.equal(third.reason, 'turn-cap')
  // 下一轮重置
  const nextTurn = shouldInject(st, 's1', { hits: hit(0.95), turn: 2, entities: ['c'], chars: 10, maxPerTurn: 2 })
  assert.equal(nextTurn.inject, true)
})
