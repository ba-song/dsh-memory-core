/**
 * P4-L 模型兜底抽取 `lib/extract/llm.js` —— 2026-11-06
 *
 * 覆盖：合法 JSON / NONE / 垃圾文本 / 代码块 / 非法 kind / 超时 / 无服务 / 无 route /
 *       prepareCall 抛错。全部用 fake ctx+llm，不连真实模型、不写库。
 */
import assert from 'node:assert'
import { extractByLlm, parseLlmOutput, llmExtractCfg } from '../lib/extract/llm.js'

const out = { ok: true, test: 'llm-extract' }
const log = { info() {}, warn() {} }
const route = { provider: 'deepseek-account', model: 'deepseek-flash' }

function makeLlm({ parts = [], finish = { kind: 'stop' }, prepareError = null, streamError = null, hang = false } = {}) {
  const state = { prepare: 0, streams: 0, prepareConfig: null, controls: null, streamOptions: null }
  return {
    state,
    async prepareCall(config, signal, configure) {
      state.prepare += 1
      state.prepareConfig = config
      if (prepareError) throw prepareError
      const controls = configure ? configure({}, { reasoning: { efforts: [{ id: 'off' }] } }) : {}
      state.controls = controls
      return {
        config: { ...config, ...controls },
        stream: async function* (opts) {
          state.streams += 1
          state.streamOptions = opts
          if (streamError) throw streamError
          for (const p of parts) yield { type: 'text-delta', index: 0, text: p }
          if (hang) {
            await new Promise((_, reject) => {
              const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
              if (opts.signal?.aborted) return fail()
              opts.signal?.addEventListener('abort', fail, { once: true })
            })
          }
          if (finish) yield { type: 'finish', reason: finish }
        },
      }
    },
  }
}

const ctxOf = (llm, selected = route) => ({
  get(name) {
    if (name === 'llm') return llm
    if (name === 'agentDefaultModel') return selected === null ? undefined : { currentSelection: () => selected }
    return undefined
  },
})

// 1) 合法 JSON（分片流）→ 候选；同时钉住宿主要求的调用形态
{
  const llm = makeLlm({ parts: ['{"kind":"pref', 'erence","text":"主人喜欢吃辣",', '"confidence":0.82}'] })
  const r = await extractByLlm({ ctx: ctxOf(llm), text: '我特别喜欢吃辣', sessionId: 'sess-1', log })
  assert.equal(r.ok, true)
  assert.deepEqual(r.candidate, { kind: 'preference', text: '主人喜欢吃辣', confidence: 0.82 })
  assert.equal(llm.state.prepareConfig.maxTokens, 120, 'maxTokens=120')
  assert.equal(llm.state.controls.reasoningEffort, 'off', '取模型支持的最低推理档，避免思考吃光输出')
  const o = llm.state.streamOptions
  assert.equal(o.purpose, 'memory-extract')
  assert.equal(o.sessionId, 'sess-1')
  assert.equal(o.maxTokens, 120)
  assert.match(o.system, /严格 JSON/)
  assert.match(o.system, /NONE/)
  assert.equal(o.messages.length, 1)
  assert.equal(o.messages[0].role, 'user')
  assert.equal(o.messages[0].content[0].type, 'text')
  assert.equal(o.messages[0].content[0].text, '我特别喜欢吃辣')
  out.valid = 'ok'
}

// 2) NONE
{
  const r = await extractByLlm({ ctx: ctxOf(makeLlm({ parts: ['NONE'] })), text: '今天的云挺好看的', log })
  assert.deepEqual(r, { ok: false, reason: 'none' })
  out.none = 'ok'
}

// 3) 垃圾文本（不是 JSON）
{
  const r = await extractByLlm({ ctx: ctxOf(makeLlm({ parts: ['我觉得这个可以记一下'] })), text: '我记得有这么回事', log })
  assert.deepEqual(r, { ok: false, reason: 'parse' })
  out.garbage = 'ok'
}

// 4) 代码块包裹 + 非法 kind
{
  const fenced = await extractByLlm({ ctx: ctxOf(makeLlm({ parts: ['```json\n{"kind":"fact","text":"主人住在温州","confidence":0.9}\n```'] })), text: '我在温州', log })
  assert.equal(fenced.ok, true)
  assert.equal(fenced.candidate.kind, 'fact')
  const bad = await extractByLlm({ ctx: ctxOf(makeLlm({ parts: ['{"kind":"todo","text":"主人明天买菜","confidence":0.9}'] })), text: '明天记得买菜', log })
  assert.deepEqual(bad, { ok: false, reason: 'bad-kind' })
  const ep = await extractByLlm({ ctx: ctxOf(makeLlm({ parts: ['{"kind":"episode","text":"主人正在和朋友打电话","confidence":0.9}'] })), text: '我正和朋友打电话', log })
  assert.deepEqual(ep, { ok: false, reason: 'bad-kind' }, 'episode 已从允许 kind 移除')
  out.parse = 'ok'
}

// 5) 超时（AbortSignal）：hang 到 signal 中止
{
  const t0 = Date.now()
  const r = await extractByLlm({ ctx: ctxOf(makeLlm({ hang: true })), text: '我最近在考虑换一份工作', config: { timeoutMs: 30 }, log })
  const ms = Date.now() - t0
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'timeout')
  assert.ok(ms < 2000, `超时应在 ~30ms 返回，实际 ${ms}ms`)
  out.timeout = 'ok'
}

// 6) 无 llm 服务
{
  const r = await extractByLlm({ ctx: { get: () => undefined }, text: '我最近在学吉他', log })
  assert.deepEqual(r, { ok: false, reason: 'no-llm' })
  out.noLlm = 'ok'
}

// 7) 无默认模型 route
{
  const llm = makeLlm({ parts: ['NONE'] })
  const r = await extractByLlm({ ctx: ctxOf(llm, null), text: '我最近在学吉他', log })
  assert.deepEqual(r, { ok: false, reason: 'no-route' })
  assert.equal(llm.state.streams, 0, '拿不到 route 不应发请求')
  out.noRoute = 'ok'
}

// 8) prepareCall / stream 抛错 → 降级不抛
{
  const p = await extractByLlm({ ctx: ctxOf(makeLlm({ prepareError: new Error('provider down') })), text: '我最近在学吉他', log })
  assert.equal(p.ok, false)
  assert.equal(p.reason, 'llm-error')
  assert.match(p.detail, /provider down/)
  const s = await extractByLlm({ ctx: ctxOf(makeLlm({ streamError: new Error('boom') })), text: '我最近在学吉他', log })
  assert.equal(s.ok, false)
  assert.equal(s.reason, 'llm-error')
  out.error = 'ok'
}

// 9) 纯函数：配置收敛 + 输出解析
{
  const cfg = llmExtractCfg({ timeoutMs: 0, dailyCap: -3, maxPerTurn: 99, minChars: 0 })
  assert.equal(cfg.timeoutMs, 1)
  assert.equal(cfg.dailyCap, 0)
  assert.equal(cfg.maxPerTurn, 10)
  assert.equal(cfg.minChars, 1)
  assert.equal(llmExtractCfg({ enabled: false }).enabled, false)
  assert.deepEqual(parseLlmOutput('NONE'), { ok: false, reason: 'none' })
  assert.deepEqual(parseLlmOutput(''), { ok: false, reason: 'empty' })
  const long = parseLlmOutput(JSON.stringify({ kind: 'fact', text: '好'.repeat(80), confidence: 9 }))
  assert.equal(long.ok, true)
  assert.equal([...long.candidate.text].length, 60, 'text 硬上限 60 字')
  assert.equal(long.candidate.confidence, 1, 'confidence 收敛到 [0,1]')
  out.pure = 'ok'
}

console.log(JSON.stringify(out))
