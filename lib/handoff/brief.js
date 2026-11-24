/** 交接简报（2026-11-08）：换会话/换渠道时用；纯确定，不调模型，不写库 */
import { cleanChannelEnvelope } from '../ingest/archive.js'

const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const clean = (s) => cleanChannelEnvelope(String(s ?? '').replace(/⏎/g, ' ')).replace(/^\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：/, '').trim()

export function handoffBrief(_db, { recent = [], maxChars = 1200 } = {}) {
  try {
    // P0-1: a handoff may carry only the current conversation's supplied recent turns.
    // Owner-wide pins, projects, decisions and todos require explicit cross-Conversation authorization.
    const conv = conversationSection(recent)
    if (!conv) return { ok: true, text: '', sections: { project: '', decisions: [], todos: [], lastUnanswered: '', topics: [] } }
    const text = clipBlock(conv, maxChars)
    return { ok: true, text, sections: { project: '', decisions: [], todos: [], lastUnanswered: conv.lastUnanswered, topics: conv.topics } }
  } catch (e) {
    return { ok: false, text: '', error: String(e?.message ?? e), sections: { project: '', decisions: [], todos: [], lastUnanswered: '', topics: [] } }
  }
}

function conversationSection(recent) {
  const msgs = (Array.isArray(recent) ? recent : []).slice(-50).map((m) => ({ role: String(m?.role ?? '').toLowerCase(), text: clean(m?.text), at: Number(m?.at ?? 0) })).filter((m) => m.text)
  if (!msgs.length) return null
  const users = msgs.filter((m) => m.role === 'user')
  const lastUserIdx = msgs.map((m) => m.role).lastIndexOf('user')
  const answered = lastUserIdx >= 0 && msgs.slice(lastUserIdx + 1).some((m) => m.role !== 'user' && m.role !== 'self-thought')
  const lastUnanswered = lastUserIdx >= 0 && !answered ? clip(users[users.length - 1]?.text ?? '', 80) : ''
  const topics = users.slice(-3).map((m) => clip(m.text, 60))
  const lines = []
  if (lastUnanswered) lines.push(`最后没回：${lastUnanswered}`)
  if (topics.length) lines.push('最近话题：\n' + topics.map((t) => `- ${t}`).join('\n'))
  if (!lines.length) return null
  return { text: lines.join('\n'), lastUnanswered, topics }
}

function clipBlock(s, maxChars) {
  const body = ['【交接简报】', s.text, '【交接简报结束】'].join('\n')
  return body.length > maxChars ? body.slice(0, Math.max(0, maxChars - 1)) + '…' : body
}
