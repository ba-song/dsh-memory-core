/**
 * 引文门禁（2026-11-16 P0-1）——记忆与原文之间的第一道可信度闸
 *
 * 两档（**关键**：不是 Anima 的「只认本轮」，否则 autonomy 自主写全部写不进来）：
 *
 * A) 能定位到原文（会话抽取路径：`text` 就是本轮 user 原话）
 *    - 调用方显式给了 quote → 必须是原文的**逐字子串**（只归一化空白）；
 *      对不上 → 硬拒（`E_QUOTE_MISMATCH`），整条不入库，绝不"改一改再写"。
 *    - 没给 quote → 从「候选文本 ∩ 原文」里取最长公共子串当 quote（≥4 字）；
 *      取不到（模型改写、同义转述）→ quote 留空、provenance='no-overlap'，**不拒**。
 *
 * B) 定不到原文（autonomy/service 自主写、手工补录、导入）
 *    - 降级：quote = 记忆正文前 60 字，confidence *= 0.8，meta.provenance='degraded'。
 *
 * 只做判断与取值，不碰数据库、不打印正文（日志里最多 20 字）。
 */

export const QUOTE_ERR = 'E_QUOTE_MISMATCH'
export const DEGRADE_FACTOR = 0.8
export const QUOTE_MAX = 60
export const QUOTE_MIN = 4
const MAX_DERIVE_CHARS = 60

const norm = (s) => String(s ?? '').replace(/\s+/g, '')
/** 压平空白后按「字」截断（中文安全，不切代理对） */
export const clipQuote = (s, n = QUOTE_MAX) => [...String(s ?? '').replace(/\s+/g, ' ').trim()].slice(0, n).join('')

/** 逐字判定：只归一化空白，不做同义词/编辑距离放宽（放宽就等于没门禁） */
export function containsQuote(sourceText, quote) {
  const src = norm(sourceText)
  const q = norm(quote)
  if (!src || !q) return false
  return src.includes(q)
}

/**
 * 从候选文本里找出在原文中出现的最长片段（滑动窗口，从长到短，命中即返回）。
 * 候选 ≤ 200 字、原文 ≤ 8000 字 → 最坏 200*200 次 includes，纯 CPU 可接受。
 */
export function deriveQuote(text, sourceText, { minChars = QUOTE_MIN, maxChars = QUOTE_MAX } = {}) {
  const t = norm(text)
  const s = norm(sourceText)
  if (!t || !s || t.length < minChars) return ''
  const cap = Math.min(t.length, MAX_DERIVE_CHARS, maxChars)
  for (let len = cap; len >= minChars; len--) {
    for (let i = 0; i + len <= t.length; i++) {
      const piece = t.slice(i, i + len)
      if (s.includes(piece)) return clipQuote(piece, maxChars)
    }
  }
  return ''
}


/**
 * 解析一条写入的引文与降级系数。
 *
 * @param {object} opts
 * @param {string} [opts.quote] 调用方显式提供的引文（工具入参 / 模型输出 / 抽取器命中片段）
 * @param {string|null} [opts.sourceText] 能定位到的原文；`null`/`''` 表示定不到
 * @param {string} [opts.text] 记忆正文（无 quote 时用来反推）
 * @param {'session'|'manual'|'degraded'} [opts.mode] 定不到原文时的语义：
 *        `session` = 本该有原文却没有（不降级，交给调用方判定）；
 *        `manual`/`degraded` = 本来就没有原文（降级打标）。
 * @returns {{ok:true,quote:string,provenance:string,confidenceFactor:number,reason?:string}
 *          |{ok:false,code:string,reason:string,quote?:string}}
 */
export function resolveQuote({ quote = '', sourceText = null, text = '', mode = 'session' } = {}) {
  const hasSource = sourceText !== null && sourceText !== undefined && norm(sourceText).length > 0
  const proposed = String(quote ?? '').trim()

  if (proposed) {
    // 有原文：必须是逐字子串，否则硬拒
    if (hasSource) {
      if (containsQuote(sourceText, proposed)) {
        return { ok: true, quote: clipQuote(proposed, 200), provenance: 'verified', confidenceFactor: 1 }
      }
      return { ok: false, code: QUOTE_ERR, reason: 'quote-not-in-source', quote: clipQuote(proposed, 200) }
    }
    // 没原文但调用方给了 quote：原样记录，标 manual-unverified（不改 confidence）
    return { ok: true, quote: clipQuote(proposed, 200), provenance: 'manual-unverified', confidenceFactor: 1, reason: 'no-source' }
  }

  if (hasSource) {
    const derived = deriveQuote(text, sourceText)
    if (derived) return { ok: true, quote: derived, provenance: 'derived', confidenceFactor: 1 }
    return { ok: true, quote: '', provenance: 'no-overlap', confidenceFactor: 1 }
  }

  if (mode === 'session') return { ok: true, quote: '', provenance: 'no-source', confidenceFactor: 1 }
  return { ok: true, quote: clipQuote(text, QUOTE_MAX), provenance: 'degraded', confidenceFactor: DEGRADE_FACTOR, reason: 'no-source' }
}

export class QuoteMismatchError extends Error {
  constructor(message = '引文与原文不符，整条不入库', detail = {}) {
    super(message)
    this.name = 'QuoteMismatchError'
    this.code = QUOTE_ERR
    this.reason = detail.reason ?? 'quote-not-in-source'
    if (detail.quote) this.quote = detail.quote
    if (detail.text) this.text = String(detail.text).slice(0, 40)
  }
}
