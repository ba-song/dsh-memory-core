import assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { extractPreference, extractRelation, extractSkill, isTooShortOrGreeting } from '../lib/ingest/classes.js'
import { decideConflict, hasOpposition } from '../lib/ingest/conflict.js'
import { effectiveImportance, isStale } from '../lib/maintain/decay.js'
import { aggregateDay } from '../lib/maintain/episode.js'
import { ingestCandidate, ingestClassified } from '../lib/ingest/p4.js'
import { loadEmbed, embedTexts } from '../lib/embed/onnx.mjs'
import { rmSync } from 'node:fs'

// 1) 门控
assert.equal(isTooShortOrGreeting('在吗'), true)
assert.equal(isTooShortOrGreeting('晚安'), true)
assert.equal(isTooShortOrGreeting('嗯'), true)
assert.equal(isTooShortOrGreeting('主人喜欢吃海鲜'), false)

// 2) 抽取
assert.deepEqual(extractPreference('主人喜欢吃海鲜')?.kind, 'preference')
assert.ok(extractRelation('主人叫我大肥鱼')?.text.includes('叫我'))
assert.ok(extractSkill('以后就按这个格式发')?.text.includes('以后'))

const modelAvailable = existsSync(join(process.env.DY_EMBED_MODEL || '/opt/qqai/models/bge-small-zh', 'tokenizer.json'))
let pairCount = 0
if (modelAvailable) {
  // 3) 20 对冲突语料（真实 bge 向量）
  const pairs = JSON.parse(readFileSync(new URL('./fixtures/conflict-pairs.json', import.meta.url), 'utf8'))
  pairCount = pairs.length
  await loadEmbed('/opt/qqai/models/bge-small-zh')
  const vecs = await embedTexts(pairs.flatMap(([a, b]) => [a, b]))
  let wrong = 0
  for (let i = 0; i < pairs.length; i++) {
    const [a, b, exp] = pairs[i]
    let s = 0
    for (let k = 0; k < vecs[i * 2].length; k++) s += vecs[i * 2][k] * vecs[i * 2 + 1][k]
    const d = decideConflict(a, b, s, { mergeLine: 0.78, queueLine: 0.45 })
    if (d.action !== exp) { wrong++; console.error('MISS', a, b, s.toFixed(3), d.action, exp) }
  }
  assert.equal(wrong, 0, '20 对语料应全部判对')
} else {
  console.log(JSON.stringify({ skipped: 'p4-vector-conflict-corpus', reason: 'DSHA BGE model is not installed' }))
}

// 4) 衰减：快进 365 天
const mk = (kind, days, extra = {}) => ({ kind, importance: 1, created_at_epoch: Date.now() - days * 86400e3, pinned: 0, access_count: 0, meta: '{}', ...extra })
assert.ok(Math.abs(effectiveImportance(mk('fact', 365)) - 0.16) < 0.02)
assert.equal(effectiveImportance(mk('skill', 365)), 1)
assert.ok(Math.abs(effectiveImportance(mk('preference', 365)) - 0.026) < 0.01)
assert.ok(Math.abs(effectiveImportance(mk('episode', 45)) - 0.25) < 0.02)
assert.equal(effectiveImportance(mk('fact', 365, { pinned: 1 })), 1)
assert.equal(isStale(mk('episode', 60)), true)

// 5) episode 话题聚合
const ep = aggregateDay(['今天好累啊，好累好累', '记忆和心情都很重要', '心情不好'], '2026-10-31')
assert.ok(ep && ep.text.includes('2026-10-31'))

if (modelAvailable) {
// 6) 管线：门控不再写，重复相似直接合并
const dir = '/tmp/dy-p4-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const embed = async (t) => embedTexts(t)
const vectors = new Map()
const r0 = await ingestClassified(db, { text: '在吗', sourceKey: 'x:1', speaker: '1000000001', embed, vectors })
assert.equal(r0.action, 'none')
const r1 = await ingestClassified(db, { text: '主人喜欢吃海鲜大餐', sourceKey: 'x:2', speaker: '1000000001', embed, vectors })
assert.equal(r1.action, 'insert')
const [v1] = await embedTexts(['喜欢吃海鲜大餐'])
vectors.set(r1.id, v1)
const r2 = await ingestClassified(db, { text: '主人爱吃海鲜大餐', sourceKey: 'x:3', speaker: '1000000001', embed, vectors })
assert.equal(r2.action, 'merge', '近义应合并')
const r3 = await ingestClassified(db, { text: '主人讨厌吃海鲜大餐', sourceKey: 'x:4', speaker: '1000000001', embed, vectors })
assert.equal(r3.action, 'queue', '矛盾应进 queue')
assert.equal(db.prepare("SELECT status FROM memories WHERE id=?").get(r3.id).status, 'pending')
assert.equal(db.prepare('SELECT count(*) c FROM conflict_queue').get().c, 1)

console.log(JSON.stringify({ ok: true, test: 'p4', pairs: pairCount, decayFact365: +effectiveImportance(mk('fact', 365)).toFixed(3), actions: [r0.action, r1.action, r2.action, r3.action] }))

} else {
  console.log(JSON.stringify({ skipped: 'p4-ingest-pipeline', reason: 'DSHA BGE model is not installed' }))
}
// 7) 反义不要跨话题：喜好老 vs 不吃生蚝 不是矛盾
assert.equal(hasOpposition('喜欢吃老的', '主人不爱吃生蚝'), false)
assert.equal(hasOpposition('喜欢看海', '讨厌海'), true)
assert.equal(hasOpposition('爱吃辣', '讨厌吃辣'), true)

// 8) 两条“允许…”规则不是矛盾
assert.equal(hasOpposition('主人允许汐自主修改，但要求先告知', '主人允许汐吐槽，条件是不要泄露隐私'), false)


// 9) 已 supersede 的旧记忆即使仍有向量，也不得成为 P4 邻居。
{
  const dir = '/tmp/dy-p4-active-neighbor-' + process.pid
  rmSync(dir, { recursive: true, force: true })
  const { db } = openDb(dir)
  try {
    const staleId = await insertMemory(db, {
      kind: 'preference', text: '主人喜欢带有语气词的句子',
      status: 'active', confidence: 0.9, layer: 'manual',
    })
    const currentId = await insertMemory(db, {
      kind: 'preference', text: '主人希望汐说话带语气词，活泼些，不要冷冰冰',
      status: 'active', confidence: 0.9, layer: 'manual',
    })
    db.prepare('UPDATE memories SET superseded_by=?, valid_to=? WHERE id=?')
      .run(currentId, Date.now(), staleId)
    const vectors = new Map([
      [staleId, new Float32Array([1, 0])],
      [currentId, new Float32Array([0.9, 0.1])],
    ])
    const result = await ingestCandidate(db, {
      cand: { kind: 'preference', text: '主人喜欢带有语气词的句子', confidence: 0.9 },
      text: '主人喜欢带有语气词的句子',
      sourceKey: 'regression:active-neighbor',
      speaker: 'owner',
      embed: async () => [new Float32Array([1, 0])],
      vectors,
    })
    assert.equal(result.action, 'merge')
    assert.equal(result.targetId, currentId)
    assert.notEqual(result.targetId, staleId)
    assert.equal(db.prepare('SELECT status FROM memories WHERE id=?').get(staleId).status, 'active',
      '测试只验证候选过滤，不在此处修复历史数据状态')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

// 10) 不同语义对象的否定不能拼接成 opposition。
assert.equal(hasOpposition(
  '主人喜欢带有语气词的句子',
  '主人希望汐说话带语气词，活泼些，不要冷冰冰',
), false)
assert.equal(decideConflict(
  '主人喜欢带有语气词的句子',
  '主人希望汐说话带语气词，活泼些，不要冷冰冰',
  0.95,
  { mergeLine: 0.78, queueLine: 0.45 },
).action, 'merge')
