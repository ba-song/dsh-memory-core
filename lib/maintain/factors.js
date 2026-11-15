/**
 * 多因子记忆权重（2026-11-12）
 *
 * 背景：原 `decay.js` 只按 kind 的时间衰减（单因子）。视频《大肥鱼的大脑》提到
 * "遗忘用多个变量、不同公式"；我们不做玄学六公式，先落一个可解释的三因子：
 *   时间（kind 衰减率）+ 访问（次数与最近访问）+ 情绪强度（episode 的 meta）
 * 关系/置顶/确认作为乘数。全部可解释，dry-run 与正式判定共用同一函数。
 */
import { RATE, STALE, effectiveImportance } from './decay.js'

const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0))
const daysSince = (at, now) => Math.max(0, (now - Number(at ?? now)) / 86400000)

function metaOf(m) {
  try { return JSON.parse(m?.meta || '{}') || {} } catch { return {} }
}

/** 情绪强度因子：episode 的 meta.emotionIntensity / 事件 appraise 强度。 */
export function emotionFactorOf(m) {
  const meta = metaOf(m)
  const raw = Number(meta.emotionIntensity ?? meta.emotion_intensity ?? 0)
  return 1 + 0.15 * clamp01(raw)
}

/** 访问因子：次数 + 最近访问；pinned/confirmed 的豁免仍由 decay 的 effectiveImportance 负责。 */
export function accessFactorOf(m, now = Date.now()) {
  const count = Math.max(0, Number(m?.access_count ?? 0))
  const byCount = Math.min(count, 6) * 0.05
  const last = Number(m?.last_access_epoch ?? 0)
  let byRecency = 0
  if (last > 0) {
    const days = daysSince(last, now)
    if (days <= 7) byRecency = 0.08
    else if (days <= 30) byRecency = 0.04
  }
  return 1 + byCount + byRecency
}

/** 关系因子：关系/偏好类 + 已确认/置顶 → 更耐久。 */
export function relationFactorOf(m) {
  const meta = metaOf(m)
  const durable = Number(m?.pinned) === 1 || meta.confirmed === true
  const relational = m?.kind === 'relation' || m?.kind === 'preference'
  return relational && durable ? 1.1 : 1
}

/**
 * 计算一条记忆的综合权重与因子明细。
 * @returns {{score:number, factors:{base:number,time:number,access:number,emotion:number,relation:number,kindRate:number}}}
 */
export function memoryScore(m, { now = Date.now() } = {}) {
  const base = Number(m?.importance ?? 0.5)
  const key = String(m?.kind ?? '')
  const rate = RATE[key] ?? 0.995
  const pinnedOrConfirmed = Number(m?.pinned) === 1 || metaOf(m).confirmed === true
  const time = pinnedOrConfirmed || !rate ? 1 : Math.pow(rate, daysSince(m?.created_at_epoch, now))
  const access = accessFactorOf(m, now)
  const emotion = emotionFactorOf(m)
  const relation = relationFactorOf(m)
  const score = base * time * access * emotion * relation
  return {
    score,
    factors: { base, time, access, emotion, relation, kindRate: rate },
  }
}

/** 新的 stale 判定：综合权重 < 阈值。 */
export function isStaleByScore(m, { now = Date.now(), threshold = STALE } = {}) {
  return memoryScore(m, { now }).score < threshold
}

export { STALE, effectiveImportance }
