/** P5：本轮相关记忆块（pre-step 注入） */
import { NOTICE_SOURCE_KIND } from './notice.js'
const HEAD = '【记忆·本轮相关】'
const TAIL = '【本轮相关结束】'
const MAX_CHARS = 200
const MAX_ITEMS = 3
const MIN_SCORE = 0.55
const GAP_MS = 24 * 3600 * 1000
const FALLBACK_TURNS = 5

/** 只从本轮自动注入通道排除由 dy-preference 常驻管理的长期偏好。 */
export function filterPersistentPreferenceHits(hits) {
  return (Array.isArray(hits) ? hits : []).filter((hit) => {
    if (hit?.kind !== 'preference') return true;
    let meta = hit?.meta;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta || '{}'); } catch { return true; }
    }
    if (!meta || typeof meta !== 'object') return true;
    return !(meta.persist === true && meta.persistence === 'long_term');
  });
}

export function relevanceOf(hit) {
  const s = hit?.scores ?? {}
  return Math.max(Number(s.keyword ?? 0), Number(s.semantic ?? 0), Number(s.graph ?? 0))
}

function bigramsOf(s) {
  const out = new Set()
  const t = String(s ?? '').replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}

export function overlaps(a, b) {
  const x = String(a ?? ''), y = String(b ?? '')
  if (!x || !y) return false
  if (x.includes(y) || y.includes(x)) return true
  const A = bigramsOf(x), B = bigramsOf(y)
  if (!A.size || !B.size) return false
  let hit = 0
  for (const g of A) if (B.has(g)) hit++
  return hit / Math.max(A.size, B.size) >= 0.8
}

/** 命中 → 块；与常驻块去重，空则 '' */
export function buildHitsBlock(hits, { stableText = '', maxItems = MAX_ITEMS, maxChars = MAX_CHARS, minScore = MIN_SCORE } = {}) {
  const picked = []
  for (const h of (hits ?? [])) {
    if (picked.length >= maxItems) break
    if (relevanceOf(h) < minScore) continue
    const stableLines = String(stableText ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
    if (stableLines.some((line) => overlaps(h.text, line))) continue
    const line = `- [${h.kind}] ${String(h.text).slice(0, 60)}`
    if (picked.join('\n').length + line.length + HEAD.length + TAIL.length + 2 > maxChars) break
    picked.push(line)
  }
  if (!picked.length) return ''
  return [HEAD, ...picked, TAIL].join('\n')
}

/** 抽一条消息的纯文本（content 数组里的 text 块）。 */
export function messageText(message) {
  const c = message?.content
  if (Array.isArray(c)) return c.filter((x) => x && x.type === 'text' && x.text).map((x) => x.text).join(' ').trim()
  return String(c ?? '').trim()
}

const EXCLUDED_QUERY_SOURCES = new Set(['runtime-context', NOTICE_SOURCE_KIND, 'time-context', 'handoff-note'])
const EXCLUDED_QUERY_PREFIX = /^(?:Current runtime context|【记忆·|【本轮相关|【相关原话|【上次聊到)/u

/**
 * 本轮命中 query：最多汇总最近 3 条真实用户消息，再附最近一条 assistant 文本。
 * @returns {{user:string,self:string,query:string}}
 */
export function buildHitQuery(messages, {
  includeSelf = true, maxUsers = 3, userChars = 160,
  maxSelfChars = 150, maxChars = 600,
} = {}) {
  const list = Array.isArray(messages) ? messages : []
  const users = []
  for (let i = list.length - 1; i >= 0 && users.length < Math.max(0, Number(maxUsers) || 0); i--) {
    const msg = list[i] ?? {}
    const kind = String(msg?.source?.kind ?? '')
    if (EXCLUDED_QUERY_SOURCES.has(kind)) continue
    if (!(msg.role === 'user' || kind === 'user' || kind === 'channel-inbound')) continue
    const value = messageText(msg)
    if (!value || EXCLUDED_QUERY_PREFIX.test(value)) continue
    users.push(value.slice(0, Math.max(0, Number(userChars) || 0)))
  }
  let user = users.reverse().filter(Boolean).join('\n')
  let self = ''
  if (includeSelf && users.length) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.role !== 'assistant') continue
      const value = messageText(list[i])
      if (!value || EXCLUDED_QUERY_PREFIX.test(value)) continue
      self = value.slice(0, Math.max(0, Number(maxSelfChars) || 0))
      break
    }
  }
  const budget = Math.max(0, Number(maxChars) || 0)
  user = user.slice(0, budget)
  const remaining = Math.max(0, budget - user.length - (user && self ? 1 : 0))
  self = self.slice(0, remaining)
  return { user, self, query: [user, self].filter(Boolean).join('\n').trim() }
}

/** query CJK bigram 命中率；分母为 query 的去重 bigram 数。 */
export function keywordOverlapRatio(query, text) {
  const q = bigramsOf(query)
  if (!q.size) return 0
  const t = bigramsOf(text)
  let matched = 0
  for (const gram of q) if (t.has(gram)) matched++
  return matched / q.size
}

/** 仅供自动注入路径使用；工具 recall 不经过此过滤。 */
export function filterInjectionHits(hits, query, {
  minSemantic = 0.55, minKeywordOverlap = 0.35,
} = {}) {
  return (Array.isArray(hits) ? hits : []).filter((hit) => {
    const semantic = Number(hit?.scores?.semantic ?? 0)
    const overlap = keywordOverlapRatio(query, hit?.text)
    return semantic >= minSemantic || overlap >= minKeywordOverlap
  })
}

export function createHitState() { return new Map() }

/**
 * 刷新条件：首轮 / top1 提升 ≥0.15 / 新实体 / 每 5 轮兜底 / 集合变化
 * @returns {{inject:boolean, reason:string}}
 */
export function shouldInject(state, key, { hits, turn, entities = [], chars = 0, now = Date.now(), maxPerTurn = 0 }) {
  const st = state.get(key)
  const top1 = hits?.length ? relevanceOf(hits[0]) : 0
  const entityKey = [...new Set(entities)].sort().join(',')
  if (!st || now - st.at > GAP_MS || turn < st.turn) {
    if (!hits?.length) return { inject: false, reason: 'first-empty' }
    state.set(key, { turn, top1, entities: entityKey, at: now, injected: 1, turnInjected: 1, chars: Number(chars) || 0, exhausted: false })
    return { inject: true, reason: 'first' }
  }
  if (!hits?.length) return { inject: false, reason: 'no-hits' }
  const setChanged = entityKey !== st.entities
  const improved = top1 - st.top1 >= 0.15
  const newEntity = entityKey.split(',').some((e) => e && !st.entities.split(',').includes(e))
  const fallback = turn - st.turn >= FALLBACK_TURNS
  const exhausted = st.exhausted || st.injected >= 10 || st.chars >= 2000
  let reason = improved ? 'top1' : newEntity ? 'new-entity' : fallback ? 'fallback' : 'set-changed'
  if (!setChanged && !improved && !newEntity && !fallback) return { inject: false, reason: 'same' }
  // 每一步都匹配时：同一轮内限制注入次数，避免工具循环里越注越多
  const turnInjected = st.turn === turn ? Number(st.turnInjected ?? 0) : 0
  if (maxPerTurn > 0 && turnInjected >= maxPerTurn) return { inject: false, reason: 'turn-cap' }
  // 会话上限：10 次或 2,000 字后，只允许「首轮」和「新实体」，兜底不再生效
  if (exhausted && reason !== 'new-entity') return { inject: false, reason: 'exhausted' }
  if (fallback && exhausted) return { inject: false, reason: 'exhausted' }
  state.set(key, { turn, top1, entities: entityKey, at: now, injected: (st.injected ?? 0) + 1, turnInjected: turnInjected + 1, chars: (st.chars ?? 0) + (Number(chars) || 0), exhausted })
  return { inject: true, reason }
}
