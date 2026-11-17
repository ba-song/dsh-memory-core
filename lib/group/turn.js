/**
 * 群聊一轮 → 记忆正文（2026-11-09）
 *
 * 背景：群桥每一轮只能给出「这轮群友说了什么 + 汐回了什么」，没有 agent header，
 * 也不该把整段群聊塞进记忆。这里做**纯规则拼装**（不调模型、不读库）：
 *
 *   [群·<群名>（<群号>）] A：…\nB：…\n我：…
 *
 * 截断口径（与 `groupMemory.maxChars` 配合）：
 *   - 群名 30 字、说话人 20 字、单条 200 字（超出以 … 收尾）
 *   - 正文总长 ≤ maxChars（默认 600，配置见 lib/config.js）
 *
 * 去重键由「群号 + 轮次时间」决定：同一次轮次重复调用只落一条。
 */

export const GROUP_TURN_VERSION = 'group-turn-v1'
export const GROUP_TURN_MSG_PREFIX = 'group-turn'

/** 正常收敛空白后按字数截断（非空才加省略号） */
const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  const max = Math.max(1, Math.floor(Number(n) || 1))
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** 群号：6–20 位纯数字（与桥/渠道目录的群号一致） */
export function isGroupId(v) {
  return /^\d{6,20}$/.test(String(v ?? '').trim())
}

/** 去重键：`group-turn:<群号>:<at>`；at 缺省由调用方补 Date.now() */
export function groupTurnMsgId(groupId, at) {
  return `${GROUP_TURN_MSG_PREFIX}:${String(groupId ?? '').trim()}:${Number(at) || 0}`
}

/**
 * 拼装一轮群聊记忆正文。
 *
 * @param {object} input
 * @param {string} input.groupId        群号（6–20 位数字）
 * @param {string} [input.groupName]    群名（展示用）
 * @param {Array<{speaker?:string,text?:string,at?:number}>} [input.incoming] 这轮群友消息
 * @param {Array<{text?:string,at?:number}>} [input.reply] 汐这轮的回复（多段合并成一行「我：」）
 * @param {number} [input.at]           轮次时间（epoch ms）
 * @param {number} [input.maxChars]     正文上限（默认 600）
 * @returns {{ok:true,text:string,at:number,sourceMsgId:string,chars:number}
 *          |{ok:false,reason:'bad-group'|'empty'}}
 */
export function buildGroupTurn({ groupId = '', groupName = '', incoming = [], reply = [], at, maxChars = 600 } = {}) {
  const gid = String(groupId ?? '').trim()
  if (!isGroupId(gid)) return { ok: false, reason: 'bad-group' }

  // 群友：每条一行；空文本/占位符丢弃，最多 20 条（再多也会被总长截断）
  const speakers = (Array.isArray(incoming) ? incoming : [])
    .map((m) => ({ speaker: clip(m?.speaker || '群友', 20), text: clip(m?.text, 200) }))
    .filter((m) => m.text)
    .slice(0, 20)

  // 汐的回复：多段（流式/分段）合并成一行，整体按单条 200 字算
  const mine = (Array.isArray(reply) ? reply : [])
    .map((m) => clip(m?.text, 200))
    .filter(Boolean)
    .slice(0, 5)

  if (!speakers.length && !mine.length) return { ok: false, reason: 'empty' }

  const head = `[群·${clip(groupName || '群', 30)}（${gid}）]`
  const lines = speakers.map((m) => `${m.speaker}：${m.text}`)
  if (mine.length) lines.push(`我：${clip(mine.join('；'), 200)}`)

  let text = `${head} ${lines.join('\n')}`
  const limit = Math.max(80, Math.floor(Number(maxChars) || 600))
  if (text.length > limit) text = `${text.slice(0, limit - 1)}…`

  const atMs = Number(at) > 0 ? Number(at) : Date.now()
  return { ok: true, text, at: atMs, sourceMsgId: groupTurnMsgId(gid, atMs), chars: text.length }
}
