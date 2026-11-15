/** 文本相似度：中文按字符 bigram Jaccard（去空白/标点），用于日结去重与周结聚类。 */
export function normalizeText(text) {
  return String(text ?? '')
    .replace(/[\s，。！？；：、“”‘’（）()\[\]【】《》…—\-]/g, '')
    .toLowerCase()
}

export function bigrams(text) {
  const s = normalizeText(text)
  const set = new Set()
  if (s.length === 0) return set
  if (s.length === 1) { set.add(s); return set }
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

/** Jaccard 相似度 0..1。 */
export function similarity(a, b) {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

/** 在候选里找最相似的一条；低于阈值返回 null。 */
export function bestMatch(text, candidates, { threshold = 0.75, textOf = (x) => x?.text } = {}) {
  let best = null
  for (const c of candidates) {
    const s = similarity(text, textOf(c))
    if (s >= threshold && (!best || s > best.score)) best = { item: c, score: s }
  }
  return best
}
