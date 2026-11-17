/** P4：轻量 episode —— 当天话题词聚合，不调模型 */
const STOP = /[的了是我你他她它吗呢吧啊很就都也还要会能不这那有在说个么什怎]/

export function aggregateDay(texts, day) {
  const freq = new Map()
  for (const t of texts) {
    const s = String(t ?? '').replace(/[^\u4e00-\u9fff]/g, ' ')
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      if (STOP.test(g)) continue
      freq.set(g, (freq.get(g) ?? 0) + 1)
    }
  }
  const top = [...freq.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g)
  if (!top.length) return null
  return { kind: 'episode', text: `${day} 主要聊到：${top.join('、')}`, confidence: 0.5 }
}
