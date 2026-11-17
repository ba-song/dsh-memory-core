import assert from 'node:assert'
import { buildHitsBlock, shouldInject, createHitState, overlaps, relevanceOf } from '../lib/inject/hits.js'

const hits = [
  { kind: 'fact', text: '主人喜欢看海', scores: { keyword: 1, semantic: 0.6 } },
  { kind: 'preference', text: '爱吃海鲜', scores: { keyword: 0.5, semantic: 0.4 } },
  { kind: 'episode', text: '聊到猫', scores: { keyword: 0.2, semantic: 0.2 } },
]

// 格式与预算
const block = buildHitsBlock(hits)
assert.ok(block.startsWith('【记忆·本轮相关】'))
assert.ok(block.endsWith('【本轮相关结束】'))
assert.ok(block.length <= 200)
assert.ok(!block.includes('聊到猫'), '低于 0.45 的不要')

// 去重
const deduped = buildHitsBlock(hits, { stableText: '【记忆·事实卡】\n- 主人喜欢看海' })
assert.ok(!deduped.includes('主人喜欢看海'), '与常驻块重复的条目要跳过')
assert.ok(deduped.includes('爱吃海鲜'), '不重复的条目保留')
assert.equal(buildHitsBlock([{ kind: 'fact', text: '爱吃海鲜', scores: { keyword: 0.9 } }], { stableText: '主人喜欢看海' }).includes('爱吃海鲜'), true)
assert.equal(buildHitsBlock([], {}), '')

// overlaps
assert.equal(overlaps('主人喜欢看海', '- 主人喜欢看海'), true)
assert.equal(overlaps('主人喜欢看海', '今天天气不错'), false)

// 刷新条件
const st = createHitState()
const k = 'sess'
let r = shouldInject(st, k, { hits, turn: 1, entities: ['主人'] })
assert.deepEqual(r, { inject: true, reason: 'first' })
r = shouldInject(st, k, { hits, turn: 2, entities: ['主人'] })
assert.equal(r.inject, false)
r = shouldInject(st, k, { hits, turn: 3, entities: ['主人', '看海'] })
assert.equal(r.inject, true)
assert.equal(r.reason, 'new-entity')
r = shouldInject(st, k, { hits, turn: 4, entities: ['主人', '看海'] })
assert.equal(r.inject, false)
// 每 5 轮兜底
r = shouldInject(st, k, { hits, turn: 9, entities: ['主人', '看海'] })
assert.equal(r.inject, true)
assert.equal(r.reason, 'fallback')
// 换会话 → first
r = shouldInject(st, 'sess2', { hits, turn: 1, entities: [] })
assert.equal(r.reason, 'first')

// 会话上限：10 次后兜底不再生效
const st2 = createHitState()
const k2 = 'cap'
let injected = 0
for (let turn = 1; turn <= 10; turn++) {
  const rr = shouldInject(st2, k2, { hits, turn, entities: ['e' + turn], chars: 50 })
  if (rr.inject) injected++
}
assert.equal(injected, 10)
const over = shouldInject(st2, k2, { hits, turn: 15, entities: ['e10'], chars: 50 })
assert.equal(over.inject, false)
assert.equal(over.reason, 'exhausted')

console.log(JSON.stringify({ ok: true, test: 'hits', block: block.length, injected }))
