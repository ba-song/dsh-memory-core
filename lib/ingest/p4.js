/** P4：四类抽取的写入管线（句子门控 → 候选质量闸 → 查重/冲突 → 落库） */
import { extractAll } from './classes.js'
import { judgeSentence, judgeCandidate, autoExtractCfg } from './quality.js'
import { bestMatch, decideConflict, isVaguePreference } from './conflict.js'
import { insertMemory } from '../store/memories.js'
import { linkMemory } from '../store/graph.js'
import { saveVector } from '../store/memories.js'
import { resolveQuote } from './provenance.js'
import { classifyPreference } from '../pref/classify.js'
import { mergePersistentPreference } from '../pref/merge.js'

export const MERGE_LINE = 0.78   // 22 条实测：中位 0.592、max 0.882，0.92 永远不会触发
export const QUEUE_LINE = 0.45

/**
 * 旧接口保留（外部若调用）：只做句子级初筛。
 * 2026-11-05 起真正的质量闸在 `./quality.js`（候选级 + 句子级），这里只是薄包装。
 */
export function gate(text, cfg = {}) {
  const j = judgeSentence(text, cfg)
  return j.ok ? { pass: true } : { pass: false, reason: j.reason }
}

/**
 * 候选 → 质量闸 → 查重/冲突 → 写入（2026-11-06 从 ingestClassified 抽出）。
 *
 * 规则抽取（`extractAll`）和模型兜底（`lib/extract/llm.js`）共用这一条写入路径，
 * 避免「模型抽的就绕过质量闸/查重」。
 *
 * @param {object} db better-sqlite3 句柄
 * @param {object} opts
 * @param {{kind:string,text:string,confidence?:number}} opts.cand 候选（kind/text 必填）
 * @param {string} opts.text 整句（候选质量闸/补主语用）
 * @param {string} [opts.sourceKey] 来源消息键
 * @param {number} [opts.sourceTs]
 * @param {string} [opts.speaker]
 * @param {(texts:string[])=>Promise<any[]>} [opts.embed]
 * @param {Map} [opts.vectors]
 * @param {object} [opts.autoExtract] 质量闸配置
 * @param {string} [opts.extractorVersion] 落库标记（规则 p4-v1 / 模型 p4-llm-v1）
 * @param {Array} [opts.priorDrops] 本轮更早候选的丢弃记录（保持原 stats 口径）
 * @param {string} [opts.quote] 显式引文（抽取器/模型给的原文片段）；给了就必须是 sourceText 的逐字子串
 * @param {string|null} [opts.sourceText] 本轮原文；`undefined` = 用 `text`（会话抽取路径就是这样）
 * @returns {Promise<{action:'none'|'merge'|'queue'|'insert',kind?,id?,targetId?,score?,reason?,code?,drops?}>}
 */
export async function ingestCandidate(db, {
  cand,
  text,
  sourceKey,
  sourceTs = Date.now(),
  speaker = '',
  embed,
  vectors,
  autoExtract,
  extractorVersion = 'p4-v1',
  scopeType = 'owner',
  scopeId = '',
  priorDrops = [],
  quote = '',
  sourceText = undefined,
} = {}) {
  const AE = autoExtractCfg(autoExtract)
  const drops = Array.isArray(priorDrops) ? [...priorDrops] : []
  const t20 = String(text ?? '').trim().slice(0, 20)
  if (AE.enabled === false) return { action: 'none', reason: 'disabled', drops }

  // ① 候选级：主语 / 谓词 / 长度 / 裸语气词
  const j = judgeCandidate(cand, text, AE)
  if (!j.ok) {
    drops.push({ reason: j.reason, kind: String(cand?.kind ?? ''), text20: String(cand?.text ?? '').slice(0, 20) })
    return { action: 'none', reason: j.reason, drops }
  }

  // ② 句子级兜底：候选看起来合格，但整句太短（阈值配置化）
  if (String(text ?? '').replace(/\s+/g, '').length < Number(AE.minChars ?? 8)) {
    drops.push({ reason: 'too-short', text20: t20 })
    return { action: 'none', reason: 'too-short', drops }
  }

  const candidate = { kind: j.kind || String(cand?.kind ?? ''), text: j.text, confidence: cand?.confidence }
  const preferenceClass = candidate.kind === 'preference' ? classifyPreference(text, candidate.text) : null
  const persistPreference = preferenceClass?.persist === true
  // ③ 引文门禁（2026-11-16 P0-1）：显式引文必须是本轮原文的逐字子串，不符 → 整条拒（不 embed、不入库）
  const srcText = sourceText === undefined ? text : sourceText
  const pre = resolveQuote({ quote, sourceText: srcText, text: candidate.text, mode: 'session' })
  if (pre.ok === false) {
    drops.push({ reason: pre.reason, kind: candidate.kind, text20: String(candidate.text).slice(0, 20) })
    return { action: 'none', reason: pre.reason, code: pre.code, drops }
  }
  let vec = null
  try { const [v] = await embed([candidate.text]); vec = v } catch {}
  let best = null
  if (vec && vectors?.size) best = bestMatch(vectors, vec)
  let decision = { action: 'insert', reason: 'no-neighbor' }
  let neighbor = null
  if (best) {
    neighbor = db.prepare('SELECT id,text,kind FROM memories WHERE id=?').get(best.id)
    if (neighbor) {
      // 跨 kind（todo vs preference）和「喜欢这个」这类无对象短语，不做矛盾判定
      if (String(neighbor.kind ?? '') !== String(candidate.kind ?? '') || isVaguePreference(candidate.text)) decision = { action: 'keep', reason: 'not-comparable' }
      else decision = decideConflict(candidate.text, neighbor.text, best.score, { mergeLine: MERGE_LINE, queueLine: QUEUE_LINE })
    }
  }
  if (persistPreference) decision = { action: 'keep', reason: 'explicit-long-term-preference' }
  if (decision.action === 'merge') {
    // 2026-11-16 P0-6：不再静默 return —— 被合并的候选落成一条 status='merged' 的行，带 mergedInto，
    // 供「同一件事被说了很多次」的回溯与人工核对；recall 只取 status='active'，所以检索行为不变。
    const mergedId = await insertMemory(db, {
      kind: candidate.kind, text: candidate.text, clarity: 'fuzzy', importance: 0.2, confidence: candidate.confidence,
      layer: 'auto', speakerId: speaker, ownerScope: speaker || '', privacy: 'owner',
      scopeType, scopeId, sourceMsgId: sourceKey, sourceTs,
      extractorVersion: `${extractorVersion}:merged`, status: 'merged',
      quote, sourceText: srcText, provenanceMode: 'session',
      meta: { sourceKey, auto: true, mergedInto: neighbor?.id ?? null, mergeScore: best?.score ?? null },
    })
    return { action: 'merge', kind: candidate.kind, targetId: neighbor?.id, id: mergedId, score: best?.score, drops }
  }
  const pending = decision.action === 'queue'
  const id = await insertMemory(db, {
    kind: candidate.kind, text: candidate.text, clarity: 'fuzzy', importance: 0.4, confidence: candidate.confidence,
    layer: 'auto', speakerId: speaker, ownerScope: speaker || '', privacy: 'owner',
    scopeType, scopeId,
    sourceMsgId: sourceKey, sourceTs, extractorVersion, status: (pending || persistPreference) ? 'pending' : 'active',
    quote, sourceText: srcText, provenanceMode: 'session',
    meta: { sourceKey, auto: true, conflictWith: neighbor?.id ?? null, ...(persistPreference ? { persist: true, persistence: 'long_term', category: 'user_preference', evidenceCount: 1, preferenceReason: preferenceClass.reason } : {}) },
  })
  let preferenceMergeDeferred = false
  if (persistPreference && !pending) {
    try {
      const merged = await mergePersistentPreference(db, { id, text: candidate.text, now: Date.now() })
      if (merged?.action === 'merged') return { action: 'merge', kind: candidate.kind, id, targetId: merged.targetId, reason: 'preference-evidence-merge', vec, drops }
      if (merged?.ok === false) preferenceMergeDeferred = true
    } catch { preferenceMergeDeferred = true }
  }
  linkMemory(db, id, candidate.text, sourceTs)
  if (vec) { try { await saveVector(db, id, vec) } catch {} }
  if (pending) {
    db.prepare('INSERT INTO conflict_queue(memory_a,memory_b,reason,created_at,status,stale_at) VALUES(?,?,?,?,?,?)')
      .run(neighbor.id, id, `sim=${best.score.toFixed(3)} opposition`, Date.now(), 'pending', Date.now() + 14 * 86400000)
  }
  return { action: pending ? 'queue' : 'insert', kind: candidate.kind, id, targetId: neighbor?.id, score: best?.score, ...(preferenceMergeDeferred ? { reason: 'preference-merge-deferred' } : {}), vec, drops }
}

/**
 * 规则路径（行为与 2026-11-05 版本一致）：句子门控 → 规则候选 → 第一条过闸的候选写入。
 * 模型兜底只在返回 `{action:'none', reason:'no-candidate'}` 时由 `lib/extract/pipeline.js` 触发。
 *
 * @returns {action:'none'|'merge'|'queue'|'insert', kind?, id?, targetId?, score?, reason?, drops?}
 */
export async function ingestClassified(db, { text, sourceKey, sourceTs = Date.now(), speaker = '', embed, vectors, autoExtract, scopeType = 'owner', scopeId = '', quote = '', sourceText = undefined } = {}) {
  const AE = autoExtractCfg(autoExtract)
  if (AE.enabled === false) return { action: 'none', reason: 'disabled', drops: [] }

  // ① 句子级：疑问 / 问候 / （空）
  const t20 = String(text ?? '').trim().slice(0, 20)
  const sent = judgeSentence(text, AE)
  if (!sent.ok) return { action: 'none', reason: sent.reason, drops: [{ reason: sent.reason, text20: t20 }] }

  const cands = extractAll(text)
  if (!cands.length) return { action: 'none', reason: 'no-candidate', drops: [] }

  // ② 候选级：主语 / 谓词 / 长度 / 裸语气词；写第一条过闸的候选
  const drops = []
  for (const cand of cands) {
    const j = judgeCandidate(cand, text, AE)
    if (!j.ok) {
      drops.push({ reason: j.reason, kind: String(cand?.kind ?? ''), text20: String(cand?.text ?? '').slice(0, 20) })
      continue
    }
    return ingestCandidate(db, { cand, text, sourceKey, sourceTs, speaker, embed, vectors, autoExtract, scopeType, scopeId, priorDrops: drops, quote, sourceText })
  }
  return { action: 'none', reason: drops[0]?.reason ?? 'fragment', drops }
}
