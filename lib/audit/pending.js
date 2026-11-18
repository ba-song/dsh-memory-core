/**
 * M2-1B：pending 悬置审计（严格只读）。
 *
 * pending 的主要语义：未解冲突、长期偏好待合并、人工隔离。
 * 同时识别队列已关闭但记忆仍 pending、以及无队列来源的悬置。
 * 本模块只做 SELECT；输出不含正文、来源消息 ID、speaker ID 或账号字段。
 */
export const PENDING_REASONS = Object.freeze([
  'quarantined',
  'conflict-open',
  'orphan-closed-queue',
  'preference-awaiting-merge',
  'orphan-no-queue',
])

function parseMeta(raw) {
  try {
    if (typeof raw === 'string') return JSON.parse(raw || '{}') || {}
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export function redactSummary(value, maxChars = 40) {
  let s = String(value ?? '').replace(/\s+/g, ' ').trim()
  s = s.replace(/https?:\/\/\S+/gi, '***')
  s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '***@***')
  s = s.replace(/\d{5,}/g, '***')
  const chars = [...s]
  if (chars.length > maxChars) return `${chars.slice(0, maxChars).join('')}…`
  return s
}

function firstOpenQueue(db, id) {
  try {
    const row = db.prepare(
      "SELECT id FROM conflict_queue WHERE status='pending' AND (memory_a=? OR memory_b=?) ORDER BY id LIMIT 1",
    ).get(id, id)
    return row ? Number(row.id) : null
  } catch {
    return null
  }
}

function lastClosedQueue(db, id) {
  try {
    const row = db.prepare(
      "SELECT id FROM conflict_queue WHERE status IN ('resolved','stale') AND (memory_a=? OR memory_b=?) ORDER BY id DESC LIMIT 1",
    ).get(id, id)
    return row ? Number(row.id) : null
  } catch {
    return null
  }
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{limit?: number, now?: number}} [opts]
 */
export function buildPendingAudit(db, { limit = 20, now = Date.now() } = {}) {
  const n = Math.max(1, Math.min(Number(limit) || 20, 100))
  const at = Number(now) || Date.now()
  const rows = db.prepare(`
    SELECT id, kind, layer, extractor_version, source_channel, created_at_epoch, text, meta
    FROM memories
    WHERE status='pending' AND scope_type='owner'
    ORDER BY id
    LIMIT ?
  `).all(n)

  const items = rows.map((row) => {
    const meta = parseMeta(row.meta)
    const quarantined = meta.quarantined === true
    const openQueueId = firstOpenQueue(db, Number(row.id))
    const closedQueueId = openQueueId ? null : lastClosedQueue(db, Number(row.id))
    const persist = meta.persist === true && meta.persistence === 'long_term'
    let reason
    if (quarantined) reason = 'quarantined'
    else if (openQueueId) reason = 'conflict-open'
    else if (closedQueueId) reason = 'orphan-closed-queue'
    else if (persist) reason = 'preference-awaiting-merge'
    else reason = 'orphan-no-queue'

    const created = Number(row.created_at_epoch) || 0
    const ageDays = created > 0 ? Math.max(0, Math.floor((at - created) / 86400000)) : null
    const rawText = String(row.text ?? '')
    return {
      id: Number(row.id),
      kind: String(row.kind ?? ''),
      status: 'pending',
      ageDays,
      source: {
        layer: String(row.layer ?? ''),
        extractor: String(row.extractor_version ?? ''),
        channel: String(row.source_channel ?? ''),
      },
      reason,
      relatedConflictId: openQueueId ?? closedQueueId ?? null,
      summary: redactSummary(rawText, 40),
      textLength: [...rawText].length,
      persist,
      quarantined,
    }
  })

  const byReason = {}
  for (const key of PENDING_REASONS) byReason[key] = 0
  for (const item of items) byReason[item.reason] += 1
  let total = items.length
  try {
    total = Number(db.prepare("SELECT count(*) AS c FROM memories WHERE status='pending' AND scope_type='owner'").get()?.c ?? items.length)
  } catch {}

  return { ok: true, total, count: items.length, truncated: total > items.length, byReason, items }
}
