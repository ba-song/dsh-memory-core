// 可注入时钟 + 回拨钳制
let injected = null
let last = 0
export function setClock(fn) { injected = typeof fn === 'function' ? fn : null }
export function now() {
  const t = injected ? Number(injected()) : Date.now()
  if (t < last) return last + 1
  last = t
  return t
}
export function clampDelta(ms) { const d = Number(ms) || 0; return d < 0 ? 0 : d }
