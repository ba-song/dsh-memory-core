/**
 * P4-L 接线测试：规则优先，`no-candidate` 才调模型；模型候选走同一写入管线。
 * 2026-11-06
 *
 * 覆盖：规则命中不调 LLM / 合法候选 insert（extractorVersion=p4-llm-v1）/
 *       NONE 不写且 none++ / 垃圾 failed++ / 质量闸照样拦 / 配额上限 / 超时降级 /
 *       本轮已抽过不重复 / diag 形状。
 * 全部写 /tmp 临时库，不碰生产。
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const DIR = '/tmp/dy-llm-fallback-' + process.pid
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { ingestWithLlmFallback } = await import('../lib/extract/pipeline.js')
const { llmDiag, resetLlmStats } = await import('../lib/ingest/p4-stats.js')

const { db } = openDb(DIR)
const out = { ok: true, test: 'llm-fallback' }
const log = { info() {}, warn() {} }
const route = { provider: 'deepseek-account', model: 'deepseek-flash' }

/** answers[i] 是第 i 次调用的模型输出；'__HANG__' 模拟超时；'__NO_CALL__' 不该被消费 */
function makeCtx(answers = []) {
  const state = { calls: 0 }
  const llm = {
    async prepareCall(config, _signal, configure) {
      const controls = configure ? configure({}, { reasoning: { efforts: [{ id: 'off' }] } }) : {}
      return {
        config: { ...config, ...controls },
        stream: async function* (opts) {
          const answer = answers[state.calls] ?? 'NONE'
          state.calls += 1
          if (answer === '__HANG__') {
            await new Promise((_, reject) => {
              const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
              if (opts.signal?.aborted) return fail()
              opts.signal?.addEventListener('abort', fail, { once: true })
            })
          }
          yield { type: 'text-delta', index: 0, text: String(answer) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  return {
    state,
    ctx: {
      get(name) {
        if (name === 'llm') return llm
        if (name === 'agentDefaultModel') return { currentSelection: () => route }
        return undefined
      },
    },
  }
}

const count = () => db.prepare('SELECT count(*) c FROM memories').get().c
const lastRow = () => db.prepare('SELECT * FROM memories ORDER BY id DESC LIMIT 1').get()
const run = (text, { ctx, llmConfig, turn } = {}) => ingestWithLlmFallback(db, {
  ctx,
  text,
  sessionId: 'sess-fb',
  sourceKey: 'fb:' + text,
  speaker: '1000000001',
  vectors: new Map(),
  autoExtract: { enabled: true, minChars: 8, requireSubject: true, maxPerTurn: 1 },
  llmConfig,
  log,
  turn,
})

// 1) 规则命中 → 不调 LLM（prepareCall 一次都不发）
{
  resetLlmStats()
  const fake = makeCtx(['__NO_CALL__'])
  const before = count()
  const r = await run('主人喜欢吃海鲜大餐', { ctx: fake.ctx })
  assert.equal(r.action, 'insert')
  assert.equal(r.via, 'rule')
  assert.equal(fake.state.calls, 0, '规则命中不应调 LLM')
  assert.equal(count(), before + 1)
  assert.equal(llmDiag().attempts, 0)
  out.ruleFirst = 'ok'
}

// 2) 规则 no-candidate + 模型合法 JSON → 同一写入管线落库
{
  resetLlmStats()
  const fake = makeCtx(['{"kind":"fact","text":"主人最近在学吉他","confidence":0.8}'])
  const r = await run('我最近在学吉他，已经练了三个月', { ctx: fake.ctx })
  assert.equal(r.action, 'insert')
  assert.equal(r.via, 'llm')
  assert.equal(r.llm, true)
  assert.equal(fake.state.calls, 1)
  const row = lastRow()
  assert.equal(row.text, '主人最近在学吉他')
  assert.equal(row.kind, 'fact')
  assert.equal(row.layer, 'auto')
  assert.equal(row.extractor_version, 'p4-llm-v1')
  assert.equal(row.status, 'active')
  const d = llmDiag()
  assert.equal(d.attempts, 1)
  assert.equal(d.ok, 1)
  assert.equal(d.inserted, 1)
  assert.equal(d.failed, 0)
  assert.equal(d.none, 0)
  out.validInsert = 'ok'
}

// 3) NONE → 不写、none++
{
  resetLlmStats()
  const fake = makeCtx(['NONE'])
  const before = count()
  const r = await run('今天的云挺好看的', { ctx: fake.ctx })
  assert.equal(r.action, 'none')
  assert.equal(r.reason, 'no-candidate')
  assert.equal(r.via, 'rule')
  assert.equal(r.llmReason, 'none')
  assert.equal(count(), before, 'NONE 不应落库')
  assert.equal(llmDiag().none, 1)
  assert.equal(llmDiag().inserted, 0)
  out.none = 'ok'
}

// 4) 垃圾文本 → 不写、failed++
{
  resetLlmStats()
  const fake = makeCtx(['我觉得这个可以记一下'])
  const before = count()
  const r = await run('明天可能会下雨吧', { ctx: fake.ctx })
  assert.equal(r.action, 'none')
  assert.equal(r.llmReason, 'parse')
  assert.equal(count(), before)
  assert.equal(llmDiag().failed, 1)
  assert.equal(llmDiag().lastReason, 'parse')
  out.garbage = 'ok'
}

// 5) 模型候选也过质量闸（无主语/太短 → fragment，不落库）
{
  resetLlmStats()
  const fake = makeCtx(['{"kind":"preference","text":"去海边","confidence":0.9}'])
  const before = count()
  const r = await run('我最近总想着去海边', { ctx: fake.ctx })
  assert.equal(r.action, 'none')
  assert.equal(r.reason, 'fragment')
  assert.equal(r.via, 'llm')
  assert.equal(count(), before, '模型候选不能绕过质量闸')
  assert.equal(llmDiag().ok, 1)
  assert.equal(llmDiag().inserted, 0)
  out.gate = 'ok'
}

// 6) 每日配额：dailyCap=1 时第二次不再调模型
{
  resetLlmStats()
  const fake = makeCtx([
    '{"kind":"fact","text":"主人昨天去电影院看了电影","confidence":0.8}',
    '{"kind":"fact","text":"主人下周去海边玩","confidence":0.8}',
  ])
  const cfg = { enabled: true, maxPerTurn: 1, dailyCap: 1, timeoutMs: 8000, minChars: 8 }
  const r1 = await run('我昨天去电影院看了电影', { ctx: fake.ctx, llmConfig: cfg })
  assert.equal(r1.action, 'insert')
  assert.equal(r1.via, 'llm')
  const r2 = await run('我下周打算去海边玩几天', { ctx: fake.ctx, llmConfig: cfg })
  assert.equal(r2.action, 'none')
  assert.equal(r2.via, 'rule')
  assert.equal(r2.llmSkipped, 'quota')
  assert.equal(fake.state.calls, 1, '超过 dailyCap 不应再调')
  assert.equal(llmDiag().attempts, 1)
  out.quota = 'ok'
}

// 7) 超时降级：不写、failed++、reason=timeout
{
  resetLlmStats()
  const fake = makeCtx(['__HANG__'])
  const before = count()
  const t0 = Date.now()
  const r = await run('我最近在考虑换一份工作', { ctx: fake.ctx, llmConfig: { enabled: true, timeoutMs: 30, dailyCap: 10 } })
  const ms = Date.now() - t0
  assert.equal(r.action, 'none')
  assert.equal(r.reason, 'no-candidate')
  assert.equal(r.llmReason, 'timeout')
  assert.equal(count(), before)
  assert.equal(llmDiag().failed, 1)
  assert.equal(llmDiag().lastReason, 'timeout')
  assert.ok(ms < 2000, `超时降级应立即返回，实际 ${ms}ms`)
  out.timeout = 'ok'
}

// 8) 本轮已抽过（turn.llmTried=1）→ 不再调
{
  resetLlmStats()
  const fake = makeCtx(['__NO_CALL__'])
  const r = await run('我最近在学做饭菜', { ctx: fake.ctx, turn: { llmTried: 1 } })
  assert.equal(r.action, 'none')
  assert.equal(r.via, 'rule')
  assert.equal(fake.state.calls, 0)
  assert.equal(llmDiag().attempts, 0)
  out.perTurn = 'ok'
}

// 9) extract.llm.enabled=false → 完全不调
{
  resetLlmStats()
  const fake = makeCtx(['__NO_CALL__'])
  const r = await run('我最近在学做饭菜', { ctx: fake.ctx, llmConfig: { enabled: false } })
  assert.equal(r.action, 'none')
  assert.equal(fake.state.calls, 0)
  out.disabled = 'ok'
}

// 10) diag 形状固定（dy_memory_stats 直接透出）
{
  const d = llmDiag()
  assert.deepEqual(Object.keys(d).sort(), ['attempts', 'failed', 'inserted', 'lastAt', 'lastReason', 'none', 'ok', 'rejected'])
  assert.ok(Number.isInteger(d.attempts))
  out.diagShape = 'ok'
}

console.log(JSON.stringify(out))
