/** P5：本轮相关记忆块（pre-step 注入） */
const HEAD = '【记忆·本轮相关】'
const TAIL = '【本轮相关结束】'
const MAX_CHARS = 200
const MAX_ITEMS = 3
const MIN_SCORE = 0.45
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

/**
 * 本轮命中用的 query（2026-11-12）：默认 = 主人当前这句 + 她上一句。
 * 只取当前 user 消息之前最近的一条 assistant 消息，且限制长度，避免她自己把话题越带越远。
 * @returns {{user:string,self:string,query:string}}
 */
export function buildHitQuery(messages, { includeSelf = true, maxSelfChars = 300 } = {}) {
  const list = Array.isArray(messages) ? messages : []
  let userIndex = -1
  for (let i = list.length - 1; i >= 0; i--) {
    const kind = String(list[i]?.source?.kind ?? '')
    if (list[i]?.role === 'user' || kind === 'user' || kind === 'channel-inbound') { userIndex = i; break }
  }
  const user = userIndex >= 0 ? messageText(list[userIndex]) : ''
  let self = ''
  if (includeSelf && userIndex > 0) {
    for (let i = userIndex - 1; i >= 0; i--) {
      if (list[i]?.role !== 'assistant') continue
      const text = messageText(list[i])
      if (!text) continue
      if (/^【记忆·|^【本轮相关/.test(text)) continue
      self = text.slice(0, maxSelfChars)
      break
    }
  }
  if (!user && !self) return { user: '', self: '', query: '' }
  return { user, self, query: [user, self].filter(Boolean).join('\n').trim() }
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
