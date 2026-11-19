/** 统一展示/归档时间：固定 Asia/Shanghai，不依赖进程 TZ（容器是 UTC） */
const F = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
export function partsOf(at = Date.now()) {
  const o = {}
  for (const p of F.formatToParts(new Date(Number(at) || 0))) if (p.type !== 'literal') o[p.type] = p.value
  return o
}
export function dayOf(at = Date.now()) { const p = partsOf(at); return `${p.year}-${p.month}-${p.day}` }
export function clockOf(at = Date.now(), { seconds = true } = {}) { const p = partsOf(at); return seconds ? `${p.hour}:${p.minute}:${p.second}` : `${p.hour}:${p.minute}` }
/** 展示用时间戳：今天 → HH:MM；今年 → MM-DD HH:MM；更早 → YYYY-MM-DD HH:MM */
export function stampOf(at = Date.now(), { now = Date.now(), seconds = false } = {}) {
  const p = partsOf(at)
  const n = partsOf(now)
  const clock = seconds ? `${p.hour}:${p.minute}:${p.second}` : `${p.hour}:${p.minute}`
  if (dayOf(at) === dayOf(now)) return clock
  const date = p.year === n.year ? `${p.month}-${p.day}` : `${p.year}-${p.month}-${p.day}`
  return `${date} ${clock}`
}
