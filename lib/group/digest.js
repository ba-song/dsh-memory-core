/** 群聊摘要 → 家（2026-11-07）：确定性摘要 + 去重 + 归档 */
export const GROUP_CWD = '/sdcard/DSHA/渠道/qq-群'
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const placeholder = (s) => String(s ?? '').trim().length <= 2 || /^\[(图片|表情|语音|视频|文件)\]$/.test(String(s ?? '').trim())
export function buildGroupDigest({ groupName = '', groupId = '', messages = [] }) {
  const list = (Array.isArray(messages) ? messages : []).filter((m) => m && !placeholder(m.text)).slice(0, 10)
  if (!list.length) return { ok: false, reason: 'empty' }
  const head = `[群聊摘要] ${clip(groupName || '群', 30)}(${clip(groupId, 20)}) 最近 ${list.length} 条：`
  const lines = list.map((m) => `${clip(m.speaker || '群友', 20)}：${clip(m.text, 80)}`)
  let text = [head, ...lines].join('\n')
  if (text.length > 800) text = text.slice(0, 799) + '…'
  return { ok: true, text, count: list.length }
}
export function digestMsgId(groupId, at) { return `group:${String(groupId).trim()}:${Number(at) || 0}` }
