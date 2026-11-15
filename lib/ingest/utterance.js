/**
 * 从 onebot 拼好的 user/message 里只取"用户真正说的话"。
 * 关键：消息里可能先塞一大段规矩/上下文，再出现 [饲养员] 原话；也可能反过来。
 * 规则：只要出现了 [饲养员]/[主人] 前缀，就**只**取这些前缀开头的段落；
 *       没有前缀但明显是 onebot 上下文 → 返回空；否则按普通消息处理（如断线补发）。
 */
const PREFIX = /^\s*\[(?:饲养员|主人|用户)\]\s*/
const ONE_BOT = /【(?:私聊|群聊)】|你正在用 QQ|怎么说话|\[话头\]|先判断对方这句话|【这条消息该怎么回】/
const STOP = /^\s*(?:【|\[(?:话头|现在是|记忆|系统)[^\]]*\]|你正在用|怎么说话|先判断对方这句话|【这条消息|【时间】|【脾气】|【便签|【谁是谁】|【AI|【表情包|【发出去之前|作业|我是DeepSeek|对饲养员的主观印象|对自己的印象|- )/

export function cleanUserUtterance(text) {
  const raw = String(text ?? '')
  const lines = raw.split('\n')
  const hasPrefix = lines.some((l) => PREFIX.test(l))
  if (!hasPrefix) {
    if (ONE_BOT.test(raw)) return ''
    return raw.replace(/\[CQ:[^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ').trim()
  }
  const out = []
  let collecting = false
  for (const line of lines) {
    if (PREFIX.test(line)) {
      collecting = true
      out.push(line.replace(PREFIX, '').trim())
      continue
    }
    if (!collecting) continue
    if (STOP.test(line) || /^\s*\[CQ:/.test(line)) { collecting = false; continue }
    if (/^\s*$/.test(line)) { collecting = false; continue }
    out.push(line.trim())
  }
  return out.join('\n').replace(/\[CQ:[^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ').trim()
}


/** 档案行前缀：`19:36:10 [2194] 主人：` */
const ARCHIVE_PREFIX = /^\d{1,2}:\d{2}(?::\d{2})?\s+\[\d*\]\s*[^：]+：\s*/
export function stripArchivePrefix(text) { return String(text ?? '').replace(ARCHIVE_PREFIX, '') }

/**
 * 空内容，或正文等于/以 `[SILENT]` 开头：她不说话的决定，不是原话记忆。
 * 兼容档案行前缀与渠道信封清洗后的文本。
 */
export function isSilentUtterance(text) {
  const s = stripArchivePrefix(text).trim()
  if (!s) return true
  return /^\[SILENT\]/i.test(s)
}
