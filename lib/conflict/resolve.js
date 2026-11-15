/** 冲突解决（2026-11-08）：HUD/服务共用；幂等，写审计 */
export function resolveConflictRow(db, { id, action, side = 'old', deleteMemory = null, vectors = null, actor = 'owner' } = {}) {
  const cid = Number(id)
  if (!Number.isFinite(cid) || cid <= 0) return { ok: false, error: 'id 不合法' }
  if (!['keep', 'drop'].includes(action)) return { ok: false, error: 'action 只能是 keep/drop' }
  if (!['old', 'new'].includes(side)) return { ok: false, error: 'side 只能是 old/new' }
  const q = db.prepare('SELECT * FROM conflict_queue WHERE id=?').get(cid)
  if (!q) return { ok: false, error: '没有这条冲突' }
  if (String(q.status) === 'resolved') return { ok: true, id: cid, alreadyResolved: true }
  const victim = action === 'drop'
    ? (side === 'old' ? q.memory_a : q.memory_b)
    : (side === 'old' ? q.memory_b : q.memory_a)
  const audit = (removed) => {
    try {
      db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run(`conflict_audit_${cid}`,
        JSON.stringify({ at: Date.now(), action, side, removed: removed ?? null, actor }))
    } catch {}
  }
  try {
    db.exec('BEGIN IMMEDIATE')
    db.prepare("UPDATE conflict_queue SET status='resolved' WHERE id=?").run(cid)
    if (victim) {
      if (typeof deleteMemory === 'function') deleteMemory(db, Number(victim))
      else {
        for (const t of ['memories', 'memory_fts', 'memory_entities', 'vectors', 'relations', 'conflicts']) {
          try { db.prepare(`DELETE FROM ${t} WHERE ${t === 'memories' ? 'id' : t === 'memory_fts' ? 'rowid' : t.includes('relations') ? 'memory_id' : t.includes('conflicts') ? 'memory_id' : 'memory_id'}=?`).run(victim) } catch {}
        }
      }
      try { vectors?.delete?.(Number(victim)) } catch {}
    }
    db.exec('COMMIT')
    audit(victim)
    return { ok: true, id: cid, action, side, removed: victim ?? null }
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    return { ok: false, error: String(e?.message ?? e) }
  }
}
