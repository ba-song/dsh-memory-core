/**
 * P4-L 质量收紧（2026-11-06）：代词/角色错乱/瞬时状态后置过滤 + prompt 约束。
 *
 * 生产实测：id 61/62 角色错乱/指代不明；id 63「正在和朋友打电话，打算晚点再点外卖」瞬时状态。
 * 本测试钉住：prompt 必须禁止这些词；候选命中过滤后不落库并计 `llm.rejected`；
 * 合法候选照常走同一写入管线；relation 必须含明确实体。
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const DIR = '/tmp/dy-llm-quality-' + process.pid
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { ingestWithLlmFallback } = await import('../lib/extract/pipeline.js')
const { llmDiag, resetLlmStats } = await import('../lib/ingest/p4-stats.js')
const { LLM_SYSTEM_PROMPT, checkLlmCandidate } = await import('../lib/extract/llm.js')

const { db } = openDb(DIR)
const out = { ok: true, test: 'llm-quality' }
const log = { info() {}, warn() {} }
const route = { provider: 'deepseek-account', model: 'deepseek-flash' }

// ── 1. prompt：禁 episode / 禁代词 / 禁临时状态 / relation 要实体 ──
assert.ok(!LLM_SYSTEM_PROMPT.includes('episode'), 'prompt 必须去掉 episode')
assert.match(LLM_SYSTEM_PROMPT, /下次醒来/)
assert.match(LLM_SYSTEM_PROMPT, /临时状态/)
assert.match(LLM_SYSTEM_PROMPT, /正在\/现在\/等下|正在|现在/)
assert.match(LLM_SYSTEM_PROMPT, /禁止使用「说话人」「听者」「对方」「他」「她」/)
assert.match(LLM_SYSTEM_PROMPT, /指代不清/)
assert.match(LLM_SYSTEM_PROMPT, /relation 必须写出明确实体/)
assert.match(LLM_SYSTEM_PROMPT, /主人|汐/)
out.prompt = 'ok'

// ── 2. 纯函数后置过滤 ────────────────────────────────────────────
const bad = (cand, reason) => assert.deepEqual(checkLlmCandidate(cand), { ok: false, reason }, JSON.stringify(cand))
bad({ kind: 'relation', text: '说话人是听者的父亲，会供养听者' }, 'pronoun')
bad({ kind: 'preference', text: '主人不介意对方多唠叨一些' }, 'pronoun')
bad({ kind: 'fact', text: '他希望主人开心' }, 'pronoun')
bad({ kind: 'fact', text: '她说主人很好' }, 'pronoun')
bad({ kind: 'relation', text: '父亲会供养儿子' }, 'relation-entity')
bad({ kind: 'fact', text: '主人正在和朋友打电话' }, 'transient')
bad({ kind: 'preference', text: '主人现在想点外卖' }, 'transient')
bad({ kind: 'episode', text: '主人刚下班' }, 'transient')
assert.deepEqual(checkLlmCandidate({ kind: 'preference', text: '主人希望我保持开心' }), { ok: true })
assert.deepEqual(checkLlmCandidate({ kind: 'relation', text: '主人叫我大傻鱼' }), { ok: true })
assert.deepEqual(checkLlmCandidate({ kind: 'fact', text: '主人最近在学吉他' }), { ok: true })
assert.deepEqual(checkLlmCandidate({ kind: 'preference', text: '主人喜欢喝冰美式' }), { ok: true })
assert.deepEqual(checkLlmCandidate({ kind: 'fact', text: '主人的生日是12月2号' }), { ok: true })
assert.deepEqual(checkLlmCandidate({ kind: 'fact', text: '' }), { ok: false, reason: 'empty' })
out.filter = 'ok'

// ── 3. 接线：坏候选不落库、rejected++；好候选照常 insert ─────────
function makeCtx(answer) {
  const state = { calls: 0 }
  const llm = {
    async prepareCall(config, _signal, configure) {
      const controls = configure ? configure({}, { reasoning: { efforts: [{ id: 'off' }] } }) : {}
      return {
        config: { ...config, ...controls },
        stream: async function* () {
          state.calls += 1
          yield { type: 'text-delta', index: 0, text: answer }
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
const run = (text, answer) => {
  const fake = makeCtx(answer)
  return ingestWithLlmFallback(db, {
    ctx: fake.ctx,
    text,
    sessionId: 'sess-quality',
    sourceKey: 'q:' + text,
    speaker: '1000000001',
    vectors: new Map(),
    autoExtract: { enabled: true, minChars: 8, requireSubject: true, maxPerTurn: 1 },
    log,
  }).then((r) => ({ r, fake }))
}

// 3a. 角色错乱 → rejected=pronoun，不写
{
  resetLlmStats()
  const before = count()
  const { r } = await run('我爸会供养我，他是我的父亲', '{"kind":"relation","text":"说话人是听者的父亲，会供养听者","confidence":0.8}')
  assert.equal(r.action, 'none')
  assert.equal(r.via, 'rule')
  assert.equal(r.llmRejected, 'pronoun')
  assert.equal(count(), before, '被过滤的候选不许落库')
  const d = llmDiag()
  assert.equal(d.rejected, 1)
  assert.equal(d.ok, 0)
  assert.equal(d.inserted, 0)
  assert.equal(d.lastReason, 'pronoun')
  out.pronoun = 'ok'
}

// 3b. 指代不明 → rejected=pronoun，不写
{
  resetLlmStats()
  const before = count()
  const { r } = await run('我不介意对方多唠叨一些，真的', '{"kind":"preference","text":"主人不介意对方多唠叨一些","confidence":0.6}')
  assert.equal(r.action, 'none')
  assert.equal(r.llmRejected, 'pronoun')
  assert.equal(count(), before)
  assert.equal(llmDiag().rejected, 1)
  out.deixis = 'ok'
}

// 3c. relation 无实体 → rejected=relation-entity
{
  resetLlmStats()
  const before = count()
  const { r } = await run('父亲会一直供养儿子', '{"kind":"relation","text":"父亲会供养儿子","confidence":0.7}')
  assert.equal(r.action, 'none')
  assert.equal(r.llmRejected, 'relation-entity')
  assert.equal(count(), before)
  assert.equal(llmDiag().rejected, 1)
  out.relationEntity = 'ok'
}

// 3d. 合法候选 → 照常 insert（后置过滤不误伤）
{
  resetLlmStats()
  const before = count()
  const { r } = await run('我最近在学吉他，已经练了三个月', '{"kind":"fact","text":"主人最近在学吉他","confidence":0.8}')
  assert.equal(r.action, 'insert')
  assert.equal(r.via, 'llm')
  assert.equal(count(), before + 1)
  const d = llmDiag()
  assert.equal(d.rejected, 0)
  assert.equal(d.ok, 1)
  assert.equal(d.inserted, 1)
  out.valid = 'ok'
}

// 3e. 合法 relation（含实体）→ 照常 insert
{
  resetLlmStats()
  const before = count()
  const { r } = await run('大家都管你叫海王呀', '{"kind":"relation","text":"大家叫主人海王","confidence":0.9}')
  assert.equal(r.action, 'insert')
  assert.equal(r.via, 'llm')
  assert.equal(count(), before + 1)
  out.relationValid = 'ok'
}

// 3f. 瞬时状态 → rejected=transient，不写
{
  resetLlmStats()
  const before = count()
  const { r } = await run('我正和朋友打电话，打算晚点再点外卖', '{"kind":"preference","text":"主人正在和朋友打电话，打算晚点再点外卖","confidence":0.6}')
  assert.equal(r.action, 'none')
  assert.equal(r.via, 'rule')
  assert.equal(r.llmRejected, 'transient')
  assert.equal(count(), before, '临时状态不许落库')
  const d = llmDiag()
  assert.equal(d.rejected, 1)
  assert.equal(d.lastReason, 'transient')
  out.transient = 'ok'
}

// 3g. episode 已从允许 kind 移除 → bad-kind，不写
{
  resetLlmStats()
  const before = count()
  const { r } = await run('我正和朋友打电话，打算晚点再点外卖', '{"kind":"episode","text":"主人正在和朋友打电话","confidence":0.6}')
  assert.equal(r.action, 'none')
  assert.equal(r.llmReason, 'bad-kind')
  assert.equal(count(), before)
  assert.equal(llmDiag().failed, 1)
  out.episodeRejected = 'ok'
}

// 3h. 稳定偏好「主人喜欢喝冰美式」→ insert
{
  resetLlmStats()
  const before = count()
  const { r } = await run('每天早上都想来一杯冰的，不加糖', '{"kind":"preference","text":"主人喜欢喝冰美式","confidence":0.9}')
  assert.equal(r.action, 'insert')
  assert.equal(r.via, 'llm')
  assert.equal(count(), before + 1)
  out.preference = 'ok'
}

// 3i. 稳定事实「主人的生日是12月2号」→ insert
{
  resetLlmStats()
  const before = count()
  const { r } = await run('我的生日是12月2号', '{"kind":"fact","text":"主人的生日是12月2号","confidence":0.95}')
  assert.equal(r.action, 'insert')
  assert.equal(r.via, 'llm')
  assert.equal(count(), before + 1)
  out.birthday = 'ok'
}

console.log(JSON.stringify(out))
