import assert from 'node:assert/strict'
import { buildHitQuery } from '../lib/inject/hits.js'

const messages = [
  { role: 'user', content: '最早的真实消息，包含一些背景信息。' },
  { role: 'assistant', content: '先前回复。' },
  { role: 'user', content: '第二条真实消息。' },
  { role: 'user', source: { kind: 'runtime-context' }, content: 'Current runtime context 不应进入查询' },
  { role: 'assistant', content: '【记忆·本轮相关】注入块不应进入查询' },
  { role: 'user', source: { kind: 'plugin:dy-memory' }, content: '工具 notice 不应进入查询' },
  { role: 'user', content: '第三条真实消息，' + '甲'.repeat(220) },
  { role: 'assistant', content: '【相关原话】不应作为 assistant query' },
  { role: 'assistant', content: '最近的 assistant 观点。' + '乙'.repeat(200) },
  { role: 'user', source: { kind: 'user' }, content: '最后一条真实消息。' },
]

const built = buildHitQuery(messages)
assert.equal(built.user.includes('最早的真实消息'), false, '最多只取最近 3 条真实用户消息')
assert.ok(built.user.includes('第二条真实消息'))
assert.ok(built.user.includes('第三条真实消息'))
assert.ok(built.user.includes('最后一条真实消息'))
assert.ok(!built.query.includes('runtime context'))
assert.ok(!built.query.includes('工具 notice'))
assert.ok(!built.query.includes('注入块'))
assert.ok(built.self.startsWith('最近的 assistant 观点。'))
assert.ok(built.self.length <= 150)
assert.ok(built.query.length <= 600)
assert.deepEqual(Object.keys(built).sort(), ['query', 'self', 'user'])
assert.equal(buildHitQuery([], {} ).query, '')
console.log(JSON.stringify({ ok: true, test: 'hits-query', userChars: built.user.length, selfChars: built.self.length, queryChars: built.query.length }))
