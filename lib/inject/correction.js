/** 纠错反馈检测（2026-11-12 P0）：只认明确否定刚注入记忆的说法，避免普通“不是”误伤。 */
const CORRECTION_RE = /(不是这样|不是这个|不是这个意思|不对|记错|你搞错|哪有|我没说过|胡说|别乱记|没这回事)/

export function isCorrection(text) {
  const s = String(text ?? '').trim()
  if (!s || s.length > 120) return false
  return CORRECTION_RE.test(s)
}
