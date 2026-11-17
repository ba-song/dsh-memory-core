/** 跨渠道摘要：家 + 渠道/qq 最近 12h 的对话，规则压成 ≤400 字（2026-11-06） */
import { normalizeRole, roleDisplay, ROLE } from '../roles.js'
import { cleanChannelEnvelope } from '../ingest/archive.js'
const PREFIX = /^\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：/
const ROOMS = [
  { key: 'home', label: '家', match: (c) => c === '/sdcard/DSHA/生活/数据/home' || c.startsWith('/sdcard/DSHA/生活/数据/home/') },
  { key: 'qq', label: 'QQ', match: (c) => c.startsWith('/sdcard/DSHA/渠道/qq') && !/群_/.test(c) && !c.startsWith('/sdcard/DSHA/渠道/qq-群') },
  { key: 'group', label: '群', match: (c) => c === '/sdcard/DSHA/渠道/qq-群' || c.startsWith('/sdcard/DSHA/渠道/qq-群/') },
  { key: 'email', label: '邮件', match: (c) => c === '/sdcard/DSHA/渠道/email' || c.startsWith('/sdcard/DSHA/渠道/email/') },
]
export function roomOf(cwd) { const c = String(cwd ?? ''); return ROOMS.find((r) => r.match(c)) ?? null }
export function buildDigest(db, { now = Date.now(), hours = 12, maxChars = 400 } = {}) {
  const since = Number(now) - hours * 3600 * 1000
  let rows = []
  try { rows = db.prepare(`SELECT cwd,role,raw_text,at FROM raw_meta WHERE at>=? AND tombstone=0 ORDER BY at DESC LIMIT 800`).all(since) } catch { return '' }
  const groups = new Map()
  const seen = new Set()
  for (const r of rows) {
    const room = roomOf(r.cwd); if (!room) continue
    const role = normalizeRole(r.role); if (role !== ROLE.USER && role !== ROLE.SELF) continue
    const text = cleanChannelEnvelope(String(r.raw_text ?? '').replace(PREFIX, '')).replace(/⏎/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    const list = groups.get(room.key) ?? []; if (list.length >= 3) continue
    list.push(`${roleDisplay(role)}：${text.slice(0, 60)}`); groups.set(room.key, list)
  }
  if (!groups.size) return ''
  const parts = []
  for (const room of ROOMS) {
    const list = groups.get(room.key); if (!list?.length) continue
    parts.push(`【${room.label}】${list.join(' / ')}`)
  }
  let body = `今天各处发生了什么：\n${parts.join('\n')}`
  if (body.length > maxChars) body = body.slice(0, maxChars - 1) + '…'
  return body
}
