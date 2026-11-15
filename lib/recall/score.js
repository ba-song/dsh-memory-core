/** RRF 融合 + 死臂滑窗监控（P3b） */
export const RRF_K = 60

export function rrfContribution(ranks) {
  const out = new Map()
  const add = (id, r) => out.set(id, (out.get(id) ?? 0) + 1 / (RRF_K + r + 1))
  for (const list of ranks) list.forEach((id, i) => add(Number(id), i))
  return out
}

export function createArmMonitor({ window = 20, warnWindows = 3, warnRate = 0.05 } = {}) {
  const stats = { calls: 0, arms: { keyword: 0, semantic: 0, graph: 0 }, windows: [], warnings: [], lastCooccur: 0 }
  const cur = { docs: new Map() }
  return {
    stats,
    record({ arms, resultIds }) {
      stats.calls += 1
      const armNames = Object.keys(arms)
      for (const a of armNames) if ((arms[a] ?? []).length) stats.arms[a] = (stats.arms[a] ?? 0) + 1
      // 共现：每个结果文档被几条路命中
      for (const id of resultIds) {
        const n = armNames.filter((a) => (arms[a] ?? []).includes(id)).length
        cur.docs.set(id, n)
      }
      if (stats.calls % window === 0) {
        const vals = [...cur.docs.values()]
        const rate = vals.length ? vals.filter((n) => n >= 2).length / vals.length : 0
        stats.lastCooccur = +rate.toFixed(3)
        stats.windows.push(stats.lastCooccur)
        if (stats.windows.length > 10) stats.windows.shift()
        const tail = stats.windows.slice(-warnWindows)
        if (tail.length === warnWindows && tail.every((r) => r <= warnRate)) {
          stats.warnings.push({ at: stats.calls, rate: stats.lastCooccur })
        }
        cur.docs.clear()
      }
    },
  }
}
