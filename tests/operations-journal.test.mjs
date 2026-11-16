/**
 * operations 账本（2026-11-16 P0-2）
 *
 * 覆盖：
 *  1) 同 id 同 payload 两次 → 模型只调 1 次，第二次 replayed:true
 *  2) 同 id 不同 payload → E_OPERATION_CONFLICT（不许把旧结果当新结果用）
 *  3) provider 传输错误 → 结果记 failed_unknown（billing unknown），再调同 id → E_OPERATION_IN_DOUBT，**不自动重放**
 *  4) sweepStale：running 超时 → failed_unknown；之后同 id 仍不重放
 *  5) canonical digest：key 顺序不影响 digest
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const DIR = '/tmp/dy-ops-journal-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { extractByLlm } = await import('../lib/extract/llm.js')
const { withOperation, sweepStale, getOperation, payloadDigest, OPERATION_CODES, OP_RUNNING, OP_FAILED_UNKNOWN } = await import('../lib/store/receipts.js')

const { db } = openDb(DIR)
const out = { ok: true, test: 'operations-journal' }
const log = { info() {}, warn() {} }
const route = { provider: 'deepseek-account', model: 'deepseek-flash' }

/** 假宿主 llm：state.calls 统计真正发生的模型调用次数 */
function makeCtx({ parts = [], streamError = null } = {}) {
  const state = { calls: 0 }
  const llm = {
    async prepareCall(config, _signal, configure) {
      const controls = configure ? configure({}, { reasoning: { efforts: [{ id: 'off' }] } }) : {}
      return {
        config: { ...config, ...controls },
        stream: async function* () {
          state.calls += 1
          if (streamError) throw streamError
          for (const p of parts) yield { type: 'text-delta', index: 0, text: p }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  return { state, ctx: { get: (n) => (n === 'llm' ? llm : n === 'agentDefaultModel' ? { currentSelection: () => route } : undefined) } }
}

// ── 5. canonical digest ─────────────────────────────────────────
assert.equal(payloadDigest({ a: 1, b: [2, 3] }), payloadDigest({ b: [2, 3], a: 1 }))
assert.notEqual(payloadDigest({ a: 1 }), payloadDigest({ a: 2 }))
out.digest = 'ok'

// ── 1. 同 id 同 payload 两次 → 只调 1 次 ────────────────────────
const fake = makeCtx({ parts: ['{"kind":"fact","text":"主人喜欢看海","confidence":0.8}'] })
{
  const r1 = await extractByLlm({ ctx: fake.ctx, text: '我想去看海，周末就去', config: {}, log, db, requestId: 'msg:1' })
  assert.equal(r1.ok, true)
  assert.equal(r1.candidate.text, '主人喜欢看海')
  assert.equal(fake.state.calls, 1)
  const r2 = await extractByLlm({ ctx: fake.ctx, text: '我想去看海，周末就去', config: {}, log, db, requestId: 'msg:1' })
  assert.equal(r2.ok, true)
  assert.equal(r2.replayed, true, '第二次必须命中账本')
  assert.equal(r2.candidate.text, '主人喜欢看海')
  assert.equal(fake.state.calls, 1, 'provider 只调 1 次')
  const op = getOperation(db, 'memory-extract', 'msg:1')
  assert.equal(op.status, 'succeeded')
  assert.equal(op.request_id, 'msg:1')
  out.replay = 'ok'
}

// ── 2. 同 id 不同 payload → 冲突 ────────────────────────────────
{
  const r = await extractByLlm({ ctx: fake.ctx, text: '换了一句完全不同的原话内容', config: {}, log, db, requestId: 'msg:1' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, OPERATION_CODES.CONFLICT)
  assert.equal(fake.state.calls, 1, '冲突不触发模型调用')
  out.conflict = 'ok'
}

// ── 3. 传输错误 → failed_unknown，之后同 id 不重放 ──────────────
{
  const bad = makeCtx({ streamError: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) })
  const r1 = await extractByLlm({ ctx: bad.ctx, text: '这条会传输失败，但可能已经扣费了', config: {}, log, db, requestId: 'msg:err' })
  assert.equal(r1.ok, false)
  assert.equal(r1.reason, 'llm-error')
  assert.equal(bad.state.calls, 1)
  const op = getOperation(db, 'memory-extract', 'msg:err')
  assert.equal(op.status, OP_FAILED_UNKNOWN, '不可判定 → failed_unknown')
  assert.deepEqual(op.result, { billing: 'unknown', retried: false })
  const r2 = await extractByLlm({ ctx: bad.ctx, text: '这条会传输失败，但可能已经扣费了', config: {}, log, db, requestId: 'msg:err' })
  assert.equal(r2.ok, false)
  assert.equal(r2.reason, OPERATION_CODES.IN_DOUBT)
  assert.equal(r2.requireNewId, true)
  assert.equal(bad.state.calls, 1, '绝不自动重放（provider 不会再被调一次）')
  out.failedUnknown = 'ok'
}

// ── 4. sweepStale：running 超时 → failed_unknown，且不重放 ───────
{
  const now = Date.now()
  db.prepare(`INSERT INTO operations(id,kind,request_id,digest,status,result_json,usage_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run('memory-consolidate:stale-1', 'memory-consolidate', 'stale-1', payloadDigest({ x: 1 }), OP_RUNNING, null, null, now - 900000, now - 900000)
  const swept = sweepStale(db, { now, timeoutMs: 600000 })
  assert.equal(swept.swept, 1)
  assert.deepEqual(swept.ids, ['memory-consolidate:stale-1'])
  const op = getOperation(db, 'memory-consolidate', 'stale-1')
  assert.equal(op.status, OP_FAILED_UNKNOWN)
  assert.deepEqual(op.result, { billing: 'unknown', retried: false })
  // 再执行同一个 id：被拦下，不重放
  let ran = 0
  const r = await withOperation(db, {
    kind: 'memory-consolidate', requestId: 'stale-1', payload: { x: 1 },
    run: async () => { ran += 1; return { ok: true } },
  })
  assert.equal(r.ok, false)
  assert.equal(r.code, OPERATION_CODES.IN_DOUBT)
  assert.equal(ran, 0, '收尸后也不许自动重放')
  // 换新 id 才允许重新跑
  const r2 = await withOperation(db, {
    kind: 'memory-consolidate', requestId: 'stale-1-retry', payload: { x: 1 },
    run: async () => { ran += 1; return { ok: true } },
  })
  assert.equal(r2.ok, true)
  assert.equal(r2.replayed, false)
  assert.equal(ran, 1)
  out.sweep = 'ok'
}

// ── 4b. run 抛异常 → failed_unknown 后再抛 ──────────────────────
{
  let threw = null
  try {
    await withOperation(db, { kind: 'memory-extract', requestId: 'boom-1', payload: { t: 1 }, run: async () => { throw new Error('boom') } })
  } catch (e) { threw = e }
  assert.ok(threw && /boom/.test(threw.message), '异常必须继续抛给调用方')
  const op = getOperation(db, 'memory-extract', 'boom-1')
  assert.equal(op.status, OP_FAILED_UNKNOWN)
  assert.equal(op.result.billing, 'unknown')
  out.thrown = 'ok'
}

console.log(JSON.stringify(out))
