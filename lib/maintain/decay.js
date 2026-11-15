/** P4：按类型衰减 + 统一 stale 阈值 0.25 */
export const RATE = { fact: 0.995, preference: 0.99, relation: 0.99, skill: 0, episode: 0.97, todo: 0.995 }
export const STALE = 0.25

export function effectiveImportance(m, now = Date.now()) {
  const meta = (() => { try { return JSON.parse(m?.meta || '{}') } catch { return {} } })()
  if (Number(m?.pinned) === 1 || Number(m?.access_count ?? 0) >= 3 || meta.confirmed === true) return Number(m?.importance ?? 0.5)
  const rate = RATE[m?.kind] ?? 0.995
  if (!rate) return Number(m?.importance ?? 0.5)
  const days = Math.max(0, (now - Number(m?.created_at_epoch ?? now)) / 86400000)
  return Number(m?.importance ?? 0.5) * Math.pow(rate, days)
}

export function isStale(m, now = Date.now()) {
  return effectiveImportance(m, now) < STALE
}
