import { validitySql } from '../store/validity.js'
/** 交接简报（2026-11-08）：换会话/换渠道时用；纯确定，不调模型，不写库 */
import { resolveProject } from '../project/index.js'
import { cleanChannelEnvelope } from '../ingest/archive.js'
import { renderPins } from '../pins.js'

const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const clean = (s) => cleanChannelEnvelope(String(s ?? '').replace(/⏎/g, ' ')).replace(/^\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：/, '').trim()

export function handoffBrief(db, { cwd = '', recent = [], kind = '', contactId = '', maxChars = 1200, isOwner = false } = {}) {
  try {
    if (!isOwner) {
      // 群/陌生人：只给「最后没回 + 最近话题」，不碰项目/决策/todo
      const conv = conversationSection(recent)
      if (!conv) return { ok: true, text: '', sections: { project: '', decisions: [], todos: [], lastUnanswered: '', topics: [] } }
      const text = clipBlock(conv, maxChars)
      return { ok: true, text, sections: { project: '', decisions: [], todos: [], lastUnanswered: conv.lastUnanswered, topics: conv.topics } }
    }
    const pj = resolveProject(cwd)
    let project = ''
    let decisions = []
    let todos = []
    if (pj) {
      project = `项目：${pj.name}（${pj.root}）`
      try {
        decisions = db.prepare("SELECT title,choice,reason FROM decisions WHERE project_id=? AND status='decided' ORDER BY decided_at DESC LIMIT 3").all(pj.id)
      } catch {}
      try {
        const validity = validitySql({ preset: 'currentTodoLegacy', at: Date.now() })
        todos = db.prepare(`SELECT text FROM memories WHERE kind='todo' AND project_id=? AND ${validity.sql} ORDER BY id DESC LIMIT 3`).all(pj.id, ...validity.params)
      } catch {}
    }
    const parts = []
    // 2026-11-14：她自己的「话头」随轮换带走；没有就空着，不占上下文
    const pins = renderPins(db)
    if (pins) parts.push(pins)
    // 标签：最近记忆的类型摘要（只给种类和数量，不泄露原文）
    try {
      const cn = { episode: '经历', fact: '事实', preference: '偏好', relation: '关系', todo: '待办', skill: '技能', reflection: '反思', lesson: '教训' }
      const validity = validitySql({ preset: 'current', at: Date.now() })
      const rows = db.prepare(`SELECT kind, COUNT(*) AS n FROM memories WHERE ${validity.sql} AND scope_type='owner' GROUP BY kind ORDER BY n DESC LIMIT 6`).all(...validity.params)
      const tagText = rows.map((r) => `${cn[r.kind] ?? '其他'} ${r.n}`).join(' / ')
      if (tagText) parts.push(`标签：${tagText}`)
    } catch {}
    if (project) parts.push(project)
    if (decisions.length) parts.push('决策：\n' + decisions.map((d) => `- ${clip(d.title, 40)} → ${clip(d.choice, 50)}${d.reason ? `（${clip(d.reason, 30)}）` : ''}`).join('\n'))
    if (todos.length) parts.push('待办：\n' + todos.map((t) => `- ${clip(t.text, 60)}`).join('\n'))
    const conv = conversationSection(recent)
    if (conv) parts.push(conv.text)
    if (!parts.length) return { ok: true, text: '', sections: { project: '', decisions, todos, lastUnanswered: '', topics: [] } }
    const body = ['【交接简报】', ...parts, '【交接简报结束】'].join('\n')
    const text = body.length > maxChars ? body.slice(0, Math.max(0, maxChars - 1)) + '…' : body
    return { ok: true, text, sections: { project, decisions, todos, lastUnanswered: conv?.lastUnanswered ?? '', topics: conv?.topics ?? [] } }
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
