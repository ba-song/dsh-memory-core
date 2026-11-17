/**
 * 段级索引（2026-11-12 P1，参考 dsh-workspace-recollection 的分层检索思路，MIT）
 * 只做纯 CPU 的切段 + BM25 定位；不落盘、不联网，正文由 dy_memory_detail 按需取。
 */
export const SEGMENT_TARGET_CHARS = 600
export const SEGMENT_SPLIT_CHARS = 900
export const SEGMENT_MERGE_BELOW_CHARS = 40
export const SEGMENT_MAX_COUNT = 96
const PREVIEW_CHARS = 80

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const ASCII_RE = /[A-Za-z0-9_][A-Za-z0-9_\-./\\:]*/g
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]+/g
const CJK_STOP = new Set('的了是在和与或及也都很就才把被让给对从到于为以要能会可该将等这那我你他她它们之其若则而但并只还没不无有一二三四五六七八九十上下前后里外时候个些么呢吧啊呀哦嘛行做去了来说道地方可当'.split(''))

const normalize = (t) => String(t ?? '').replace(/\r\n?/g, '\n').replace(/[\u200b-\u200f\ufeff]/g, '')

function splitLong(src, maxCount) {
  const out = []
  let cur = 0
  while (cur < src.length && out.length < maxCount) {
    let end = Math.min(src.length, cur + SEGMENT_TARGET_CHARS)
    if (end < src.length) {
      const w = src.slice(cur, end)
      const at = Math.max(w.lastIndexOf('\n\n'), w.lastIndexOf('\n'), w.lastIndexOf('。'), w.lastIndexOf('；'), w.lastIndexOf('！'))
      if (at > Math.floor(SEGMENT_TARGET_CHARS * 0.5)) end = cur + at + 1
    }
    const piece = src.slice(cur, end).trim()
    if (piece) out.push(piece)
    cur = end
  }
  if (cur < src.length && out.length) out[out.length - 1] = src.slice(Math.max(0, src.length - SEGMENT_TARGET_CHARS)).trim()
  return out.length ? out : [src]
}

function previewOf(body) {
  const flat = String(body).replace(/\s+/g, ' ').replace(/^[#>*-]+\s*/, '').replace(/\*\*/g, '').trim()
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat
}

/** 把一条长记忆切成可读段：优先按 ## 标题，节太长再按 600 字断开。 */
export function segmentText(raw) {
  const text = normalize(raw)
  if (!text.trim()) return []
  const lines = text.split('\n')
  const sections = []
  let cur = { heading: '', label: '', lines: [] }
  for (const line of lines) {
    const m = line.match(HEADING_RE)
    if (m) {
      if (cur.lines.join('\n').trim()) sections.push(cur)
      cur = { heading: m[2].trim(), label: m[2].trim(), lines: [line] }
    } else if (RULE_RE.test(line)) {
      // 分隔线丢弃
    } else {
      cur.lines.push(line)
    }
  }
  if (cur.lines.join('\n').trim()) sections.push(cur)

  const segments = []
  for (const sec of sections) {
    const body = sec.lines.join('\n').trim()
    if (!body) continue
    if (body.length <= SEGMENT_SPLIT_CHARS) {
      if (body.length < SEGMENT_MERGE_BELOW_CHARS && segments.length) {
        segments[segments.length - 1].text += `\n\n${body}`
        segments[segments.length - 1].chars = segments[segments.length - 1].text.length
        segments[segments.length - 1].preview = previewOf(segments[segments.length - 1].text)
        continue
      }
      segments.push({ heading: sec.label, label: sec.label || '(开头)', text: body, chars: body.length, preview: previewOf(body) })
      continue
    }
    const parts = splitLong(body, SEGMENT_MAX_COUNT)
    parts.forEach((p, i) => {
      segments.push({ heading: sec.label, label: `${sec.label || '(开头)'} (${i + 1}/${parts.length})`, text: p, chars: p.length, preview: previewOf(p) })
    })
    if (segments.length >= SEGMENT_MAX_COUNT) break
  }
  if (segments.length > SEGMENT_MAX_COUNT) {
    const tail = segments.splice(SEGMENT_MAX_COUNT - 1)
    segments.push({ ...tail[0], id: undefined, label: `${tail[0].label} +尾`, text: tail.map((x) => x.text).join('\n\n'), chars: tail.reduce((n, x) => n + x.chars, 0) })
  }
  return segments.map((s, i) => ({ idx: i + 1, heading: s.heading, label: s.label, text: s.text, chars: s.chars, preview: s.preview }))
}

/** 中文 bigram + ASCII 词元；过滤纯停用字 bigram。 */
export function tokenize(text) {
  const s = normalize(text)
  const out = []
  for (const m of s.matchAll(ASCII_RE)) out.push(m[0].toLowerCase())
  for (const m of s.matchAll(CJK_RE)) {
    const run = m[0]
    for (let i = 0; i + 2 <= run.length; i++) {
      const g = run.slice(i, i + 2)
      if (!(CJK_STOP.has(g[0]) && CJK_STOP.has(g[1]))) out.push(g)
    }
  }
  return out
}

function around(text, terms, n = 80) {
  const s = String(text)
  for (const t of terms) {
    const i = s.indexOf(t)
    if (i >= 0) {
      const a = Math.max(0, i - 36)
      const b = Math.min(s.length, i + 76)
      return `${a > 0 ? '…' : ''}${s.slice(a, b).replace(/\s+/g, ' ')}${b < s.length ? '…' : ''}`
    }
  }
  return previewOf(s).slice(0, n)
}

/** 段级 BM25 定位；只回段号/标签/字数/命中词/片段，不回正文。 */
export function locateSegments(raw, query, { limit = 5 } = {}) {
  const segments = segmentText(raw)
  if (!segments.length) return []
  const qTerms = [...new Set(tokenize(query))]
  if (!qTerms.length) return segments.slice(0, limit).map((s) => ({ idx: s.idx, label: s.label, chars: s.chars, terms: [], preview: s.preview }))
  const docs = segments.map((s) => tokenize(s.text))
  const df = new Map()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1)
  const N = docs.length
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, N)
  const k1 = 1.2, b = 0.75
  const scored = segments.map((seg, i) => {
    const d = docs[i]
    const tf = new Map()
    for (const t of d) tf.set(t, (tf.get(t) || 0) + 1)
    let score = 0
    const hit = []
    for (const t of qTerms) {
      const f = tf.get(t) || 0
      if (!f) continue
      hit.push(t)
      const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5))
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / Math.max(1, avg)))
      if (/[_\-.:/\\]/.test(t)) score *= 2.2
    }
    return { seg, score, hit: [...new Set(hit)] }
  }).filter((x) => x.score > 0).sort((a, b2) => b2.score - a.score).slice(0, limit)
  return scored.map((x) => ({ idx: x.seg.idx, label: x.seg.label, chars: x.seg.chars, terms: x.hit.slice(0, 8), preview: around(x.seg.text, x.hit) }))
}

/** 取指定段正文（含越界保护）。 */
export function takeSegments(raw, idxs = []) {
  const segments = segmentText(raw)
  const set = new Set((Array.isArray(idxs) ? idxs : []).map(Number))
  const picked = segments.filter((s) => set.has(s.idx))
  return { segments: picked.map((s) => ({ idx: s.idx, label: s.label, text: s.text })), total: segments.length }
}
