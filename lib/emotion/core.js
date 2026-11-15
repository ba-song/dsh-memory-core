import { LEXICON, IRONY, AROUSAL_BOOST } from './lexicon.js'

const clamp = (x) => Math.max(-1, Math.min(1, x))

export function scoreText(text) {
  const s = String(text ?? '')
  let v = 0, hits = 0
  for (const [w, d] of Object.entries(LEXICON)) if (s.includes(w)) { v += d; hits += 1 }
  let arousal = 0.2
  for (const w of AROUSAL_BOOST) if (s.includes(w)) arousal += 0.15
  if (/[！!]{2,}|[？?]{2,}/.test(s)) arousal += 0.1
  // 情绪词越多、越强，激动越高；强情绪本身也会抬高激动
  const rawV = hits ? Math.abs(v / (hits >= 2 ? 3 : 2)) : 0
  arousal = clamp(arousal + Math.min(0.5, hits * 0.12) + rawV * 0.15)
  const irony = IRONY.some((m) => s.includes(m))
  const hint = /累|困|疲惫|没力气|撑不住/.test(s) ? '疲惫' : null
  if (!hits) return { valence: 0, arousal: 0.2, confidence: 0.2, hits: 0, irony, hint, recheckWanted: false }
  const val = clamp(v / (hits >= 2 ? 3 : 2))
  const confidence = clamp(0.55 + hits * 0.08 - (irony ? 0.2 : 0))
  return { valence: val, arousal, confidence, hits, irony, hint, recheckWanted: irony || Math.abs(val) >= 0.5 }
}

export function labelOf(valence, arousal) {
  if (Math.abs(valence) < 0.15 && arousal < 0.45) return '平静'
  if (valence >= 0.15) return arousal >= 0.6 ? '兴奋' : '开心'
  if (valence <= -0.45) return arousal >= 0.6 ? '生气' : '难过'
  return arousal >= 0.55 ? '焦虑' : '低落'
}
export function intensityOf(valence, arousal) { return Math.max(Math.abs(valence), arousal) }

export function nextState(prev, score, now = Date.now()) {
  const k = 0.45
  const baseV = Number(prev?.valence ?? 0), baseA = Number(prev?.arousal ?? 0.2)
  const valence = clamp(baseV * (1 - k) + score.valence * k)
  const arousal = clamp(baseA * (1 - k) + score.arousal * k)
  return {
    valence, arousal, label: (score.hint && Math.abs(valence) < 0.35) ? score.hint : labelOf(valence, arousal),
    intensity: intensityOf(valence, arousal), confidence: score.confidence,
    source: 'rule', updatedAt: now,
  }
}

/** 惰性衰减：心情好坏半衰期 6h，激动半衰期 30min；只算不写库 */
export function decayState(state, now = Date.now()) {
  const hours = Math.max(0, (now - Number(state?.updatedAt ?? now)) / 3600000)
  const v = Number(state?.valence ?? 0) * Math.pow(0.5, hours / 6)
  const baseline = 0.2
  const a = baseline + (Number(state?.arousal ?? baseline) - baseline) * Math.pow(0.5, hours / 0.5)
  return { ...state, valence: v, arousal: a, label: labelOf(v, a), intensity: intensityOf(v, a) }
}

/** 记忆显著性：base 14 天，激动越高半衰期越长（arousal=1 → 21 天） */
export function effectiveHalfLifeDays(arousal, base = 14, coef = 0.5) {
  return base * (1 + coef * clamp(Number(arousal ?? 0)))
}
export function salience(importance, createdAt, arousal, now = Date.now()) {
  const ageDays = Math.max(0, (now - Number(createdAt)) / 86400000)
  const hl = effectiveHalfLifeDays(arousal)
  return Number(importance ?? 0.5) * Math.pow(0.5, ageDays / hl)
}
