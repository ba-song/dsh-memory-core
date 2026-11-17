/** P4：偏好 / 关系 / 技能 三类保守抽取（显式陈述沿用 explicit-v1，不在这里） */
const GREET = /^(在吗|在不在|早|早安|晚安|你好|嗨|哈喽|拜拜|睡了|吃饭了吗)[。！？!?~～\s]*$/

export function isTooShortOrGreeting(text) {
  const s = String(text ?? '').trim()
  return s.length < 4 || GREET.test(s)
}

export function extractPreference(text) {
  const s = String(text ?? '')
  // 把修饰/否定词与偏好谓词一起保留，避免「不喜欢」被抽成「喜欢」。
  const m = s.match(/(?:我|她|他)?((?:很|超|特别|最|不太|不)?(?:喜欢|讨厌|爱吃|不爱吃|最爱|最怕|受不了|习惯))([^\\n，。！？!?]{1,20})/)
  if (!m) return null
  const body = `${m[1]}${m[2]}`.trim()
  return body.length >= 3 ? { kind: 'preference', text: body, confidence: 0.6 } : null
}

export function extractRelation(text) {
  const s = String(text ?? '')
  const m = s.match(/(?:以后)?(?:就)?(?:叫我|称呼我|管我叫)([^\n，。！？!?]{1,12})/) ||
            s.match(/(?:我是|你是)([^\n，。！？!?]{1,12})(?:的|吧|呀|哦|$)/)
  if (!m) return null
  const body = m[0].trim()
  return body.length >= 3 ? { kind: 'relation', text: body, confidence: 0.55 } : null
}

export function extractSkill(text) {
  const s = String(text ?? '')
  const m = s.match(/(以后|下次|往后)(?:就|都)?([^\n。！？!?]{2,30})/) ||
            s.match(/(按这个来|记住这个流程|照这个做)([^\n。！？!?]{0,20})/)
  if (!m) return null
  const body = m[0].trim()
  return body.length >= 4 ? { kind: 'skill', text: body, confidence: 0.55 } : null
}

export function extractAll(text) {
  return [extractPreference(text), extractRelation(text), extractSkill(text)].filter(Boolean)
}
