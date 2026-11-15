/** 无感切换：给「同一个房间」的新会话一段【上次聊到】（规则抽取，不调模型，≤400 字） */
const DIALOG = "('user','self','self-thought','主人','汐','汐·想')"
const PREFIX = /^\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：/
import { shortSid } from '../ingest/archive.js'

export function carryoverFor(db, cwd, { limit = 12, maxChars = 400, sid = '' } = {}) {
  const path = String(cwd ?? '')
  if (!db || !path) return ''
  let rows = []
  try {
    const n = Math.max(8, Math.min(Number(limit) || 12, 12))
    // 排除「当前会话」自己的行：只看上一个会话
    const ex = sid ? `%s-${shortSid(sid)}.md` : ''
    rows = ex
      ? db.prepare(`SELECT raw_text FROM raw_meta WHERE cwd=? AND tombstone=0 AND role IN ${DIALOG} AND file NOT LIKE ? ORDER BY id DESC LIMIT ?`).all(path, ex, n)
      : db.prepare(`SELECT raw_text FROM raw_meta WHERE cwd=? AND tombstone=0 AND role IN ${DIALOG} ORDER BY id DESC LIMIT ?`).all(path, n)
  } catch { return '' }
  if (!rows.length) return ''
  const lines = rows.reverse()
    .map((r) => String(r.raw_text ?? '').replace(PREFIX, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (!lines.length) return ''
  const head = lines.slice(0, Math.max(1, lines.length - 3)).join(' / ').slice(0, 160)
  const tail = lines.slice(-3).join(' / ').slice(0, 190)
  const body = `【上次聊到】\n- 之前：${head}\n- 最后：${tail}\n【上次聊到结束】`
  return body.length > maxChars + 40 ? body.slice(0, maxChars + 40) : body
}
