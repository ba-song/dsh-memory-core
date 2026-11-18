/**
 * 冲突解决（2026-11-08）：HUD/服务共用；幂等，写审计
 *
 * 2026-11-16 P0-3：`drop` **不再物理删**，改成状态迁移
 *   victim: status='corrected'、revision+1、写一条 memory_revisions 快照、meta.invalidatedBy='conflict:<id>'
 * 理由：可审计、可撤回、与 Anima 的 corrected/superseded 语义对齐。
 * 真要抹掉（主人明确说「彻底忘记」）→ 传 `purge:true`，走旧的物理删除路径。
 */
import { deleteRowsInTx } from '../store/memories.js'

export function resolveConflictRow(db, { id, action, side = 'old', deleteMemory = null, vectors = null, actor = 'owner', purge = false, now = Date.now() } = {}) {
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
  const at = Number(now)
  const audit = (removed, extra = {}) => {
    try {
      db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run(`conflict_audit_${cid}`,
        JSON.stringify({ at, action, side, removed: removed ?? null, actor, ...extra }))
    } catch {}
  }
  try {
    db.exec('BEGIN IMMEDIATE')
    db.prepare("UPDATE conflict_queue SET status='resolved' WHERE id=?").run(cid)
    let revision = null
    if (victim && (purge || action === 'keep')) {
      // `keep` 语义 = 保留一侧、清掉另一侧（旧行为不变）；
      // `drop` 才走状态迁移；`purge:true` 是主人的显式「彻底忘记」强动作。
      // 参数 deleteMemory 仅为旧 service 调用兼容保留；忽略它，避免嵌套 writeTx。
      deleteRowsInTx(db, Number(victim))
      try { vectors?.delete?.(Number(victim)) } catch {}
    } else if (victim) {
      // 默认：状态迁移 + 修订快照（不删行、不改正文）
      const row = db.prepare('SELECT * FROM memories WHERE id=?').get(Number(victim))
      if (row) {
        const cur = Number(row.revision ?? 1)
        let prevMeta = {}
        try { prevMeta = JSON.parse(row.meta || '{}') || {} } catch { prevMeta = {} }
        const meta = { ...prevMeta, invalidatedBy: `conflict:${cid}`, invalidation: 'corrected', invalidatedAt: at }
        db.prepare('INSERT OR REPLACE INTO memory_revisions(memory_id,revision,previous_json,changed_at,invalidation) VALUES(?,?,?,?,?)')
          .run(Number(victim), cur, JSON.stringify(row), at, `conflict:${cid}`)
        db.prepare("UPDATE memories SET status='corrected', revision=?, updated_at=?, meta=? WHERE id=?")
          .run(cur + 1, at, JSON.stringify(meta), Number(victim))
        revision = cur + 1
      }
    }
    db.exec('COMMIT')
    audit(victim, { purged: Boolean(victim && purge), revision })
    return { ok: true, id: cid, action, side, removed: victim ?? null, purged: Boolean(victim && purge), revision }
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    return { ok: false, error: String(e?.message ?? e) }
  }
}
