/**
 * P4 自动抽取的候选质量闸（2026-11-05）
 *
 * 背景：`extractAll()` 用三条正则从整句里截子串，`p4.gate()` 只挡「<4 字 / 问候语」，
 * 于是「叫我哦」「下次还有」「喜欢就留着」这类没主语的半句也能入库（生产已积累 8 条碎片 + 1 条错误 relation）。
 *
 * 本文件只做**判断**，不写库、不调模型：
 * - 句子级：疑问句 / 问候语气 / 太短（minChars）
 * - 候选级：必须有主语、必须有谓词、长度 ≥5、结尾不许是裸语气词
 *
 * 判定顺序（有讲究，见 §4 报告）：
 *   question → greeting → fragment（候选级）→ too-short（句子级兜底）
 * 把 fragment 放在 too-short 之前：像「下次还有」这种句子既短又是碎片，
 * 报 fragment 才能指向「抽取器产出了半句」，报 too-short 会掩盖真问题。
 */

export const DEFAULT_AUTO_EXTRACT = Object.freeze({
  enabled: true,
  minChars: 8,
  requireSubject: true,
  maxPerTurn: 1,
})

/** 主语/称呼（句子或候选里出现即算） */
export const SUBJECT_RE = /(我|你|她|他|主人|饲养员|汐|大傻鱼)/
/** 谓词/判断词（任一即可） */
export const PREDICATE_RE = /(是|叫|喜欢|讨厌|爱|怕|恨|嫌|要|不|别|会|能|该|得|住|在|去|给|想)/

/** 纯问候/应答（整句只有这些） */
const GREETING = /^(在吗|在不在|早|早安|晚安|你好|嗨|哈喽|拜拜|睡了|吃饭了吗|好的|好|嗯|哦|啊|呀|哈|诶|唉)[。！？!?~～…\s呀啊哦嘛呢吧]*$/
const QUESTION_TAIL = /[？?]\s*$/
const QUESTION_WORD = /(吗|呢|是不是|怎么|为什么|要不要)/
const MODAL_TAIL = /[哦呀吧呢嘛啊]$/
const PUNCT_TAIL = /[。！？!?，,、；;：:…]$/

const stripSpace = (s) => String(s ?? '').replace(/\s+/g, '')

/** 合并配置（容错：只给部分键也能用） */
export function autoExtractCfg(cfg = {}) {
  return { ...DEFAULT_AUTO_EXTRACT, ...(cfg && typeof cfg === 'object' ? cfg : {}) }
}

/**
 * 句子级判断。
 * @returns {{ok:true, chars:number} | {ok:false, reason:'question'|'greeting'|'too-short'}}
 */
export function judgeSentence(text, cfg = {}) {
  const c = autoExtractCfg(cfg)
  const s = String(text ?? '').trim()
  const compact = stripSpace(s)
  if (!compact) return { ok: false, reason: 'too-short' }
  // 疑问句：问句不是「她在陈述自己」，抽出来必然走样
  if (QUESTION_TAIL.test(s) || QUESTION_WORD.test(compact)) return { ok: false, reason: 'question' }
  if (GREETING.test(compact)) return { ok: false, reason: 'greeting' }
  return { ok: true, chars: compact.length }
}

export function hasSubject(s) { return SUBJECT_RE.test(String(s ?? '')) }
export function hasPredicate(s) { return PREDICATE_RE.test(String(s ?? '')) }

/**
 * 「判定用」候选文本：preference 的抽取器把主语丢掉了（正则里 `我/她/他` 是可选的），
 * 这里把句子里紧邻它前面的称呼补回来，只用于判断长度/主语，**不改变写库文本**。
 * 例：句子「我在温州，喜欢吃辣」→ 候选「喜欢吃辣」→ 判定文本「我喜欢吃辣」。
 */
export function judgeTextOf(cand, sentence) {
  const text = String(cand?.text ?? '').trim()
  if (!text) return ''
  if (hasSubject(text)) return text
  if (cand?.kind !== 'preference') return text
  const idx = String(sentence ?? '').indexOf(text)
  const head = idx > 0 ? String(sentence).slice(0, idx) : ''
  const hits = [...head.matchAll(/(我|你|她|他|主人|饲养员|汐|大傻鱼)/g)]
  const subj = hits.length ? hits[hits.length - 1][1] : ''
  return subj ? `${subj}${text}` : text
}

/**
 * 候选级判断。
 * @returns {{ok:true, kind:string, text:string} | {ok:false, reason:'fragment'}}
 */
export function judgeCandidate(cand, sentence, cfg = {}) {
  const c = autoExtractCfg(cfg)
  const raw = String(cand?.text ?? '').trim()
  const judged = judgeTextOf(cand, sentence)
  if (!raw || !judged) return { ok: false, reason: 'fragment' }
  // 结尾是裸语气词（「叫我哦」）——先于长度判断，语义更准
  if (MODAL_TAIL.test(stripSpace(raw)) && !PUNCT_TAIL.test(raw)) return { ok: false, reason: 'fragment' }
  if (stripSpace(judged).length < 5) return { ok: false, reason: 'fragment' }
  if (c.requireSubject && !hasSubject(judged) && !hasSubject(sentence)) return { ok: false, reason: 'fragment' }
  if (!hasPredicate(judged)) return { ok: false, reason: 'fragment' }
  return { ok: true, kind: String(cand.kind ?? ''), text: raw }
}
