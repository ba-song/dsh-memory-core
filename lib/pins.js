/** 话头（2026-11-14）：她给自己钉的、还没接上的小纸条；轮换时带上，平时不塞。 */
const MAX_SHOWN = 5
const MAX_LEN = 60

export function listPins(db, selfId = 'self', { status = 'open', limit = 40 } = {}) {
  try {
    return db.prepare('SELECT id,text,status,created_at,done_at FROM memory_pins WHERE self_id=? AND status=? ORDER BY created_at DESC LIMIT ?')
      .all(String(selfId), String(status), Math.max(1, limit))
  } catch { return [] }
}

export function addPin(db, selfId, text, now = Date.now()) {
  const t = String(text ?? '').trim()
  if (!t) throw new Error('话头不能为空')
  db.prepare('INSERT INTO memory_pins(self_id,text,status,created_at) VALUES(?,?,?,?)').run(String(selfId), t.slice(0, 200), 'open', now)
  return listPins(db, selfId)
}

export function donePin(db, selfId, idOrIndex, now = Date.now()) {
  const row = resolvePin(db, selfId, idOrIndex)
  if (!row) return false
  db.prepare("UPDATE memory_pins SET status='done', done_at=? WHERE id=?").run(now, row.id)
  return true
}

export function dropPin(db, selfId, idOrIndex) {
  const row = resolvePin(db, selfId, idOrIndex)
  if (!row) return false
  db.prepare('DELETE FROM memory_pins WHERE id=?').run(row.id)
  return true
}

function resolvePin(db, selfId, idOrIndex) {
  const rows = listPins(db, selfId)
  const n = Number(idOrIndex)
  if (Number.isInteger(n) && n > 0 && n <= rows.length) return rows[n - 1]
  return rows.find((r) => Number(r.id) === n) ?? null
}

/** 交接用：最多 5 条，空则空串（不占上下文）。 */
export function renderPins(db, selfId = 'self') {
  const rows = listPins(db, selfId)
  if (!rows.length) return ''
  const lines = rows.slice(0, MAX_SHOWN).map((r) => `· ${String(r.text).slice(0, MAX_LEN)}`)
  const more = rows.length > MAX_SHOWN ? [`（还有 ${rows.length - MAX_SHOWN} 条没列）`] : []
  return ['【话头】她给自己钉的、还没接上的（不是主人刚说的）：', ...lines, ...more].join('\n')
}
