/**
 * P4 抽取编排（2026-11-06）：规则优先，规则 `no-candidate` 时模型兜底一次。
 *
 * 触发条件（全满足才调模型）：
 *   1. `ingestClassified` 返回 `{action:'none', reason:'no-candidate'}`
 *      —— 问句/问候/太短/碎片/关闭都不兜底（那些是「明确不该记」，不是「规则没认出」）
 *   2. `extract.llm.enabled !== false`
 *   3. 清洗后正文 ≥ `extract.llm.minChars`（默认 8 字）
 *   4. 本轮未抽过（`turn.llmTried < maxPerTurn`）
 *   5. 当日调用次数 < `extract.llm.dailyCap`（默认 200）
 *
 * 模型给的候选仍走 `ingestCandidate`（同一质量闸/查重/冲突），绝不直达数据库。
 */
import { ingestClassified, ingestCandidate } from '../ingest/p4.js'
import { extractByLlm, llmExtractCfg, checkLlmCandidate } from './llm.js'
import { noteLlmAttempt, noteLlmResult, takeLlmQuota } from '../ingest/p4-stats.js'

const compactLen = (s) => [...String(s ?? '').replace(/\s+/g, '')].length

/**
 * @param {object} db
 * @param {object} opts 与 ingestClassified 相同的入参，外加：
 * @param {object} [opts.ctx] 宿主 ctx（llm / agentDefaultModel 服务）
 * @param {object} [opts.llmConfig] `cfg.extract.llm`
 * @param {object} [opts.log] 插件 log
 * @param {{llmTried?:number}} [opts.turn] 本轮状态（同一用户消息传同一个对象）
 * @param {number} [opts.now] 测试注入时间（配额按日重置）
 * @returns {Promise<object>} 写入结果；`via:'llm'` 表示模型兜底产出，`via:'rule'` 表示规则路径
 */
export async function ingestWithLlmFallback(db, opts = {}) {
  const {
    ctx, text, sessionId = '', sourceKey, sourceTs = Date.now(), speaker = '',
    embed, vectors, autoExtract, llmConfig, log, turn, now = Date.now, writeScope = null,
  } = opts
  const base = {
    text, sourceKey, sourceTs, speaker, embed, vectors, autoExtract,
    scopeType: writeScope?.scopeType ?? 'owner',
    scopeId: writeScope?.scopeId ?? '',
  }

  const rule = await ingestClassified(db, base)
  if (rule?.action !== 'none' || rule?.reason !== 'no-candidate') return { ...rule, via: 'rule' }

  const LC = llmExtractCfg(llmConfig)
  if (!LC.enabled) return { ...rule, via: 'rule' }
  if (compactLen(text) < LC.minChars) return { ...rule, via: 'rule' }

  const tried = Math.max(0, Number(turn?.llmTried) || 0)
  if (tried >= LC.maxPerTurn) return { ...rule, via: 'rule' }

  const quota = takeLlmQuota(LC.dailyCap, now)
  if (!quota.ok) {
    try { log?.info?.(`LLM 抽取跳过：当日配额已满 ${quota.used}/${quota.cap}`) } catch {}
    return { ...rule, via: 'rule', llmSkipped: 'quota' }
  }
  if (turn && typeof turn === 'object') turn.llmTried = tried + 1

  noteLlmAttempt(now)
  const got = await extractByLlm({ ctx, text, sessionId, config: LC, log })
  if (!got?.ok) {
    const reason = String(got?.reason ?? 'unknown')
    if (reason === 'none') noteLlmResult({ none: true, reason, now })
    else noteLlmResult({ failed: true, reason, now })
    return { ...rule, via: 'rule', llmTried: true, llmReason: reason }
  }

  // 后置过滤（2026-11-06）：代词/角色错乱或 relation 无实体 → 丢弃，计 rejected
  const verdict = checkLlmCandidate(got.candidate)
  if (!verdict.ok) {
    noteLlmResult({ rejected: true, reason: verdict.reason, now })
    try { log?.warn?.(`LLM 候选被拒：reason=${verdict.reason} text=${String(got.candidate?.text ?? '').slice(0, 24)}`) } catch {}
    return { ...rule, via: 'rule', llmTried: true, llmRejected: verdict.reason }
  }

  const written = await ingestCandidate(db, {
    cand: got.candidate,
    ...base,
    extractorVersion: 'p4-llm-v1',
  })
  const wrote = written?.action === 'insert' || written?.action === 'queue'
  noteLlmResult({
    ok: true,
    inserted: wrote,
    reason: wrote ? written.action : String(written?.reason ?? written?.action ?? 'rejected'),
    now,
  })
  return { ...written, via: 'llm', llm: true }
}
