import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { captureWakeEpisode, isWakeSourceKind, wakeSourceKey, shouldSkipWakeTurn } from '../lib/ingest/wake.js'

let n = 0
function fixture() {
  const dir = '/tmp/dy-wake-capture-' + process.pid + '-' + (++n)
  rmSync(dir, { recursive: true, force: true })
  const { db } = openDb(dir)
  return { db, close() { try { db.close() } catch {}; rmSync(dir, { recursive: true, force: true }) } }
}
const source = 'autonomy-home-wake'
const ts = 1795262400000
const longSelf = ['汐今天整理了长期记忆，并完成了自主唤醒后的状态检查。']

test('wake source allowlist and source key are strict', () => {
  assert.equal(isWakeSourceKind(source), true)
  assert.equal(isWakeSourceKind('autonomy-home-manual'), true)
  assert.equal(isWakeSourceKind('user'), false)
  assert.equal(isWakeSourceKind('autonomy-other'), false)
  assert.equal(wakeSourceKey('session-1', 42), 'wake:session-1:42')
  assert.equal(wakeSourceKey('', 42), '')
  assert.equal(shouldSkipWakeTurn(['确认一下就走']), true)
  assert.equal(shouldSkipWakeTurn(longSelf), false)
})

test('eligible wake turn writes one owner episode with provenance', async () => {
  const f = fixture()
  try {
    const result = await captureWakeEpisode(f.db, {
      sessionId: 'session-a', turnSeq: 7, sourceKind: source, sourceTs: ts,
      selfTexts: longSelf, thoughtTexts: ['这只是摘要辅助，不应单独写入。'],
      summarize: async ({ selfTexts, thoughtTexts }) => {
        assert.equal(selfTexts.length, 1)
        assert.equal(thoughtTexts.length, 1)
        return '汐完成长期记忆整理，并检查了自主唤醒后的运行状态。'
      },
      embed: async () => [new Float32Array([1, 0])],
      vectors: new Map(),
      log: { warn() {} },
    })
    assert.equal(result.action, 'insert')
    const row = f.db.prepare('SELECT * FROM memories WHERE id=?').get(result.id)
    assert.equal(row.kind, 'episode')
    assert.equal(row.subject, '汐')
    assert.equal(row.layer, 'auto')
    assert.equal(row.scope_type, 'owner')
    assert.equal(row.scope_id, '')
    assert.equal(row.source_msg_id, 'wake:session-a:7')
    const meta = JSON.parse(row.meta)
    assert.equal(meta.sourceKey, 'wake:session-a:7')
    assert.equal(meta.origin, 'autonomy-wake')
    assert.equal(meta.sourceKind, source)
    assert.equal(f.db.prepare('SELECT count(*) c FROM memories').get().c, 1)
  } finally { f.close() }
})

test('source key makes repeated turn-end delivery idempotent', async () => {
  const f = fixture()
  try {
    let summaries = 0
    const args = {
      sessionId: 'session-b', turnSeq: 8, sourceKind: source, sourceTs: ts,
      selfTexts: longSelf,
      summarize: async () => { summaries++; return '汐记录了今天完成的自主唤醒检查和记忆整理。' },
      embed: async () => [new Float32Array([1, 0])],
      vectors: new Map(), log: { warn() {} },
    }
    const first = await captureWakeEpisode(f.db, args)
    const second = await captureWakeEpisode(f.db, args)
    assert.equal(first.action, 'insert')
    assert.equal(second.reason, 'duplicate-source')
    assert.equal(summaries, 1)
    assert.equal(f.db.prepare('SELECT count(*) c FROM memories').get().c, 1)
  } finally { f.close() }
})

test('vector duplicate prevents near-identical episode insertion', async () => {
  const f = fixture()
  try {
    const vectors = new Map()
    const first = await captureWakeEpisode(f.db, {
      sessionId: 'session-c', turnSeq: 1, sourceKind: source, sourceTs: ts, selfTexts: longSelf,
      summarize: async () => '汐整理了长期记忆，并检查了自主唤醒运行状态。',
      embed: async () => [new Float32Array([1, 0])], vectors, log: { warn() {} },
    })
    const second = await captureWakeEpisode(f.db, {
      sessionId: 'session-c', turnSeq: 2, sourceKind: source, sourceTs: ts + 1000, selfTexts: longSelf,
      summarize: async () => '汐完成长期记忆整理，同时检查自主唤醒运行状态。',
      embed: async () => [new Float32Array([1, 0])], vectors, log: { warn() {} },
    })
    assert.equal(first.action, 'insert')
    assert.equal(second.reason, 'duplicate-vector')
    assert.equal(f.db.prepare('SELECT count(*) c FROM memories').get().c, 1)
  } finally { f.close() }
})

test('daily cap blocks additional wake episodes', async () => {
  const f = fixture()
  try {
    const first = await captureWakeEpisode(f.db, {
      sessionId: 'session-d', turnSeq: 1, sourceKind: source, sourceTs: ts, selfTexts: longSelf,
      summarize: async () => '汐整理了长期记忆并完成了一轮自主唤醒状态检查。',
      embed: async () => [new Float32Array([1, 0])], vectors: new Map(), dailyLimit: 1, log: { warn() {} },
    })
    const second = await captureWakeEpisode(f.db, {
      sessionId: 'session-d', turnSeq: 2, sourceKind: source, sourceTs: ts + 1000, selfTexts: longSelf,
      summarize: async () => '汐继续整理了另外一项长期记忆并完成状态核对。',
      embed: async () => [new Float32Array([0, 1])], vectors: new Map(), dailyLimit: 1, log: { warn() {} },
    })
    assert.equal(first.action, 'insert')
    assert.equal(second.reason, 'daily-cap')
    assert.equal(f.db.prepare('SELECT count(*) c FROM memories').get().c, 1)
  } finally { f.close() }
})

test('concurrent wake turns cannot exceed the daily cap', async () => {
  const f = fixture()
  try {
    const make = (turnSeq, vector) => captureWakeEpisode(f.db, {
      sessionId: 'session-concurrent', turnSeq, sourceKind: source, sourceTs: ts, selfTexts: longSelf,
      summarize: async () => '汐完成了本轮自主唤醒后的状态核对，并整理了记忆内容。',
      embed: async () => [new Float32Array(vector)], vectors: new Map(), dailyLimit: 1, log: { warn() {} },
    })
    const results = await Promise.all([make(1, [1, 0]), make(2, [0, 1])])
    assert.equal(results.filter((r) => r.action === 'insert').length, 1)
    assert.equal(results.filter((r) => r.reason === 'daily-cap').length, 1)
    assert.equal(f.db.prepare('SELECT count(*) c FROM memories').get().c, 1)
  } finally { f.close() }
})

test('unsupported source, short turn, and missing embedding fail closed', async () => {
  const f = fixture()
  try {
    const summarize = async () => '汐完成了本轮自主唤醒后的记忆整理和状态检查。'
    const base = { sessionId: 'session-e', turnSeq: 1, sourceTs: ts, selfTexts: longSelf, summarize, log: { warn() {} } }
    assert.equal((await captureWakeEpisode(f.db, { ...base, sourceKind: 'user' })).reason, 'source-not-eligible')
    assert.equal((await captureWakeEpisode(f.db, { ...base, turnSeq: 2, sourceKind: source, selfTexts: ['好的'] })).reason, 'too-short')
    assert.equal((await captureWakeEpisode(f.db, { ...base, turnSeq: 3, sourceKind: source, embed: async () => null })).reason, 'embedding-unavailable')
    assert.equal(f.db.prepare('SELECT count(*) c FROM memories').get().c, 0)
  } finally { f.close() }
})
