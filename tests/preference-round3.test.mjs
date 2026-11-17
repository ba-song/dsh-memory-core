import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { recall } from '../lib/recall/recall.js'
import { scopeForSession } from '../lib/scope.js'
import { buildPreferenceBlock } from '../lib/inject/preference.js'
import { pickRemembered } from '../lib/inject/remembered.js'
import { buildHitsBlock, filterPersistentPreferenceHits } from '../lib/inject/hits.js'
import { buildQuotesBlock } from '../lib/inject/quotes.js'
import { buildProvenanceBlock } from '../lib/inject/context-blocks.js'
import { classifyPreference } from '../lib/pref/classify.js'
import { retryPendingPreferences } from '../lib/pref/retry.js'
import { ingestCandidate } from '../lib/ingest/p4.js'

function makeDb(tag) {
  const dir = `/tmp/m1-round3-${tag}-${process.pid}`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return { dir, ...openDb(dir) }
}
const ownerScope = scopeForSession({ cwd: '/tmp/owner', sessionId: 'round3', isOwner: true })
const quietLog = { warn() {}, info() {} }

test('preference slots: one recent plus two stable importance slots; budget and deterministic order', async () => {
  const { db } = makeDb('slots')
  const now = Date.now()
  const add = (text, importance, createdAt, meta = {}, confidence = 0.9, pinned = false) =>
    insertMemory(db, { kind: 'preference', text, importance, confidence, createdAt, pinned, status: 'active', meta: { persist: true, persistence: 'long_term', ...meta } })
  const a = await add('长期偏好A', 0.90, now - 5000)
  const b = await add('长期偏好B', 0.86, now - 4000)
  await add('长期偏好C', 0.82, now - 3000)
  const recent = await add('长期偏好D', 0.20, now - 2000, { lastEvidenceAt: now + 1000 })
  const block = buildPreferenceBlock(db, { scope: ownerScope, now })
  assert.ok(block.includes('长期偏好D'), '近期证据槽应选择最新证据')
  assert.ok(block.includes('长期偏好A'), '重要性槽应选择最高 importance')
  assert.ok(block.includes('长期偏好B'), '重要性槽应选择第二高 importance')
  assert.ok(!block.includes('长期偏好C'), '三名额之外的候选不应进入')
  assert.equal((block.match(/^- /gm) || []).length, 3)
  assert.ok(block.length <= 180)
  assert.equal(buildPreferenceBlock(db, { scope: ownerScope, now }), block, '相同数据重复调用必须确定性一致')
  assert.ok(Number(a) > 0 && Number(b) > 0 && Number(recent) > 0)

  const { db: budgetDb } = makeDb('budget')
  await insertMemory(budgetDb, { kind: 'preference', text: '超长'.repeat(100), importance: 0.99, status: 'active', meta: { persist: true, persistence: 'long_term' } })
  await insertMemory(budgetDb, { kind: 'preference', text: '预算内偏好A', importance: 0.8, status: 'active', meta: { persist: true, persistence: 'long_term' } })
  const budgetBlock = buildPreferenceBlock(budgetDb, { scope: ownerScope })
  assert.ok(budgetBlock.includes('预算内偏好A'), '超预算候选应跳过并继续尝试后续候选')
  assert.ok(budgetBlock.length <= 180)
})

test('hits 注入过滤只排除持久偏好；普通 preference 与 recall 保持可用', async () => {
  const { db } = makeDb('hits')
  const longText = '长期偏好检索目标A'
  const longId = await insertMemory(db, { kind: 'preference', text: longText, status: 'active', meta: { persist: true, persistence: 'long_term' } })
  await insertMemory(db, { kind: 'preference', text: '普通偏好动态召回A', status: 'active', meta: {} })
  const hits = [
    { id: longId, kind: 'preference', text: longText, meta: JSON.stringify({ persist: true, persistence: 'long_term' }), scores: { keyword: 1 } },
    { id: 20, kind: 'fact', text: '事实命中A', meta: '{}', scores: { keyword: 1 } },
    { id: 21, kind: 'preference', text: '普通偏好命中A', meta: '{}', scores: { keyword: 1 } },
  ]
  const filtered = filterPersistentPreferenceHits(hits)
  assert.deepEqual(filtered.map((x) => x.id), [20, 21])
  const block = buildHitsBlock(filtered, { minScore: 0.1 })
  assert.ok(!block.includes(longText))
  assert.ok(block.includes('事实命中A'))
  assert.ok(block.includes('普通偏好命中A'))
  const quotes = buildQuotesBlock(db, { cwd: '/tmp/no-raw-archive', hits: filtered, query: '' })
  assert.ok(!quotes.block.includes(longText))
  const provenance = buildProvenanceBlock(db, { cwd: '/tmp/no-raw-archive', hits: filtered })
  assert.equal(provenance.stats.hits, 2, '出处块接收的 hits 应已过滤')
  const recalled = await recall(db, longText, { vectors: null, gate: { keyword: 0.1, semantic: 0.55 }, trackAccess: false })
  assert.ok(recalled.some((row) => row.id === longId), '主动 recall 仍可命中长期偏好')
  const remembered = pickRemembered(db)
  assert.ok(!remembered.block.includes(longText))
})

test('pending retry: merge failure remains pending with diagnostics; recovery activates; conflict pending excluded', async () => {
  const { db } = makeDb('retry')
  const id = await insertMemory(db, { kind: 'preference', text: '主人要保留测试偏好条目A', status: 'pending', layer: 'auto', meta: { persist: true, persistence: 'long_term' } })
  const conflictId = await insertMemory(db, { kind: 'fact', text: '普通冲突队列候选A', status: 'pending', layer: 'auto', meta: { conflictWith: 1 } })
  db.exec(`CREATE TRIGGER block_preference_activation BEFORE UPDATE OF status ON memories
    WHEN NEW.kind='preference' AND NEW.status='active'
    BEGIN SELECT RAISE(ABORT, 'blocked preference activation'); END`)
  await retryPendingPreferences({ db, log: quietLog })
  let row = db.prepare('SELECT * FROM memories WHERE id=?').get(id)
  let meta = JSON.parse(row.meta)
  assert.equal(row.status, 'pending')
  assert.equal(meta.retryCount, 1)
  assert.match(meta.lastError, /blocked preference activation/)
  assert.equal(db.prepare('SELECT status FROM memories WHERE id=?').get(conflictId).status, 'pending')
  db.exec('DROP TRIGGER block_preference_activation')
  await retryPendingPreferences({ db, log: quietLog })
  row = db.prepare('SELECT * FROM memories WHERE id=?').get(id)
  assert.equal(row.status, 'active')
  const overId = await insertMemory(db, { kind: 'preference', text: '主人要复核测试偏好条目B', status: 'pending', layer: 'auto', meta: { persist: true, persistence: 'long_term', retryCount: 3 } })
  await retryPendingPreferences({ db, log: quietLog })
  meta = JSON.parse(db.prepare('SELECT meta FROM memories WHERE id=?').get(overId).meta)
  assert.equal(meta.needsReview, true)
  assert.equal(meta.retryCount, 3)
})

test('mixed temporary and durable wording stays temporary', () => {
  const result = classifyPreference('以后每次都这样做，这次先这样。', '测试偏好A')
  assert.equal(result.persistence, 'temporary')
  assert.equal(result.persist, false)
})

test('P4 concurrent candidate ingestion is serialized on one DatabaseSync connection', async () => {
  const { db } = makeDb('concurrent')
  const run = (round, side) => ingestCandidate(db, {
    cand: { kind: 'fact', text: `主人要保存测试事实编号${round}-${side}` },
    text: `主人要保存测试事实编号${round}-${side}`,
    sourceKey: `round3:${round}:${side}`,
    embed: async () => [],
    vectors: new Map(),
    autoExtract: { enabled: true, minChars: 8, requireSubject: true, maxPerTurn: 1 },
  })
  for (let i = 0; i < 20; i++) {
    const results = await Promise.all([run(i, 'a'), run(i, 'b')])
    assert.deepEqual(results.map((x) => x.action), ['insert', 'insert'])
  }
  const rows = db.prepare("SELECT text,COUNT(*) AS n FROM memories WHERE source_msg_id LIKE 'round3:%' AND status='active' GROUP BY text").all()
  assert.equal(rows.length, 40)
  assert.ok(rows.every((row) => row.n === 1), '每个候选只应有一条 active 记录')
})

test('legacy preference remains recallable but is absent from persistent and remembered blocks', async () => {
  const { db } = makeDb('legacy')
  const id = await insertMemory(db, { kind: 'preference', text: '旧偏好检索目标B', status: 'active', meta: {} })
  const found = await recall(db, '旧偏好检索目标B', { vectors: null, gate: { keyword: 0.1, semantic: 0.55 }, trackAccess: false })
  assert.ok(found.some((row) => row.id === id))
  assert.equal(buildPreferenceBlock(db, { scope: ownerScope }), '')
  const remembered = pickRemembered(db)
  assert.ok(!remembered.block.includes('旧偏好检索目标B'))
  assert.ok(remembered.skipped.some((item) => item.reason === 'preference-managed-separately'))
})
