/** P4：矛盾判定 = 相似度 + 反义/否定信号（不是相似度区间） */
const ANTONYMS = [
  ['喜欢', '讨厌'], ['喜欢', '不爱'], ['喜欢', '受不了'],
  ['爱', '恨'], ['爱吃', '过敏'], ['能吃', '过敏'],
  ['会', '不会'], ['是', '不是'], ['要', '不要'], ['可以', '不行'],
]
const NEG = /不|没|别/
const POS_WORDS = ['喜欢', '爱吃', '能吃', '爱', '会', '是', '可以', '要']
const NEG_WORDS = ['不喜欢', '讨厌', '不爱', '受不了', '过敏', '不会', '不是', '不要', '不行']

function polarity(s) {
  const clauses = String(s).split(/[，,。；;！？!?\n]/).map((x) => x.trim()).filter(Boolean)
  const signs = []
  for (const clause of clauses) {
    // 同一分句里否定优先，避免「不喜欢」先被「喜欢」抢走
    if (NEG_WORDS.some((w) => clause.includes(w))) signs.push(-1)
    else if (POS_WORDS.some((w) => clause.includes(w))) signs.push(1)
  }
  const hasNeg = signs.includes(-1), hasPos = signs.includes(1)
  // 不同分句一正一负（如「喜欢的就看，不喜欢的就换」）→ 不当作明确极性
  if (hasNeg && hasPos) return 0
  if (hasNeg) return -1
  if (hasPos) return 1
  return 0
}

const STOP_TOPIC = new Set('的了是在有和就不没别很太都会能可要吃喝玩看说喜欢爱讨厌过敏我你他她主人'.split(''))
/** 去掉极性词/虚词后的共同主题字；没有共同主题就不能只凭反义词判冲突。 */
function topicShare(a, b) {
  const x = String(a ?? ''), y = String(b ?? '')
  return [...new Set(x)].filter((c) => /[\u4e00-\u9fff]/.test(c) && !STOP_TOPIC.has(c) && y.includes(c)).length
}

export function hasOpposition(a, b) {
  const clausesA = String(a ?? '').split(/[，,。；;！？!?\n]/).map((x) => x.trim()).filter(Boolean)
  const clausesB = String(b ?? '').split(/[，,。；;！？!?\n]/).map((x) => x.trim()).filter(Boolean)

  // 只在一对具体分句之间判断极性和主题；禁止把整段中的否定词
  // 与另一处无关的肯定词拼接成“矛盾”。
  for (const left of clausesA) {
    const pa = polarity(left)
    if (pa === 0) continue
    for (const right of clausesB) {
      const pb = polarity(right)
      if (pb === 0 || pa === pb) continue
      if (topicShare(left, right) < 1) continue

      // 明确反义词也必须在同一组有共同主题的分句中出现。
      for (const [p, q] of ANTONYMS) {
        if ((left.includes(p) && right.includes(q)) || (left.includes(q) && right.includes(p))) {
          return true
        }
      }

      // 一正一负仅在同一主题上成立；例如“喜欢海”与“讨厌海”。
      return true
    }
  }
  return false
}

/** 返回 { action: 'merge'|'queue'|'keep', reason } */
export function decideConflict(a, b, similarity, { mergeLine = 0.85, queueLine = 0.45 } = {}) {
  const sim = Number(similarity) || 0
  if (sim >= mergeLine && !hasOpposition(a, b)) return { action: 'merge', reason: 'high-sim' }
  if (sim >= queueLine && hasOpposition(a, b)) return { action: 'queue', reason: 'opposition' }
  return { action: 'keep', reason: 'unrelated' }
}

/** 在已有向量里找最相似的一条 */
export function bestMatch(vectors, vec, excludeId = null) {
  let best = null
  for (const [id, v] of vectors) {
    if (excludeId != null && Number(id) === Number(excludeId)) continue
    if (!v?.length || v.length !== vec.length) continue
    let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * vec[i]
    if (!best || s > best.score) best = { id: Number(id), score: s }
  }
  return best
}


/** 候选是否太模糊：只有情绪词+代词，没有具体对象；用于不入冲突队列（仍可正常入库） */
export function isVaguePreference(text) {
  const t = String(text ?? '').replace(/\s+/g, '')
  if (t.length > 12) return false
  if (!/(喜欢|讨厌|爱|想要|不想|要)/.test(t)) return false
  return /(这个|那个|这样|那样|它|这些|那些)/.test(t)
}
