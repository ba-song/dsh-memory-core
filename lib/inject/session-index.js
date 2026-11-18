/**
 * 新会话首步跨会话经历索引。
 * 仅执行 SELECT；不触碰 access_count、revision 或任何状态字段。
 */
const HEAD = '【跨会话经历】'
const TAIL = '【跨会话经历结束】'

const shortDate = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).formatToParts(new Date(n))
    const month = parts.find((x) => x.type === 'month')?.value ?? ''
    const day = parts.find((x) => x.type === 'day')?.value ?? ''
    return month && day ? `${month}-${day}` : ''
  } catch { return '' }
}

export function shouldInjectSessionIndex({ owner = false, enabled = true, turn, step, sid = '', injected = new Set() } = {}) {
  return Boolean(owner && enabled && sid && Number(turn) === 1 && Number(step) === 1 && !injected.has(sid))
}

const tableExists = (db, name) => {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)) } catch { return false }
}

/**
 * @param {object} db DatabaseSync
 * @param {{now?:number,episodes?:number,agreements?:number,maxChars?:number}} opts
 */
export function buildSessionIndex(db, {
  now = Date.now(), episodes = 3, agreements = 2, maxChars = 300,
} = {}) {
  const lines = []
  const episodeLimit = Math.max(0, Math.min(10, Number(episodes) || 0))
  const agreementLimit = Math.max(0, Math.min(10, Number(agreements) || 0))
  try {
    if (episodeLimit) {
      const rows = db.prepare(`SELECT text,created_at_epoch FROM memories
        WHERE kind='episode' AND status='active' AND scope_type='owner'
          AND (valid_to IS NULL OR valid_to>?)
        ORDER BY created_at_epoch DESC LIMIT ?`).all(Number(now), episodeLimit)
      for (const row of rows) {
        const date = shortDate(row.created_at_epoch)
        const body = String(row.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 36)
        if (body) lines.push(`- ${date ? date + ' ' : ''}${body}`)
      }
    }
  } catch {}
  if (agreementLimit) {
    const seen = new Set()
    if (tableExists(db, 'decisions')) {
      try {
        const rows = db.prepare(`SELECT title,choice FROM decisions
          WHERE status='decided' ORDER BY decided_at DESC LIMIT ?`).all(agreementLimit)
        for (const row of rows) {
          const title = String(row.title ?? '').trim()
          const choice = String(row.choice ?? '').trim()
          const body = [title, choice].filter(Boolean).join(' → ').slice(0, 40)
          if (body && !seen.has(body)) { seen.add(body); lines.push(`- 约定：${body}`) }
        }
      } catch {}
    }
    try {
      const rows = db.prepare(`SELECT text FROM memories
        WHERE kind='todo' AND status IN ('active','') AND scope_type='owner'
          AND (valid_to IS NULL OR valid_to>?)
        ORDER BY id DESC LIMIT ?`).all(Number(now), agreementLimit)
      for (const row of rows) {
        const body = String(row.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
        if (body && !seen.has(body)) { seen.add(body); lines.push(`- 约定：${body}`) }
      }
    } catch {}
  }
  if (!lines.length) return ''
  const budget = Math.max(0, Math.floor(Number(maxChars) || 0))
  if (budget < HEAD.length + TAIL.length + 1) return ''
  const out = [HEAD]
  let used = HEAD.length + TAIL.length + 1
  for (const line of lines) {
    const cost = line.length + 1
    const remaining = budget - used
    if (remaining <= 0) break
    if (cost <= remaining) {
      out.push(line)
      used += cost
      continue
    }
    const clipped = line.slice(0, Math.max(0, remaining - 1)).trimEnd()
    if (clipped) out.push(clipped)
    break
  }
  if (out.length === 1) return ''
  out.push(TAIL)
  return out.join('\n').slice(0, budget)
}
