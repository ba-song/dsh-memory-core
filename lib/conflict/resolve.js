/**
 * 冲突解决：HUD 工具与 dyMemory service 共用同一实现。
 * keep = 保留指定侧并物理删除另一侧；drop = 将指定侧迁移为 corrected，
 * 同事务写入 valid_to / superseded_by / revision 与审计。drop 不提供物理删除旁路。
 * purge 参数仅为旧调用兼容保留，不改变 keep/drop 的既定语义。
 */
import { deleteRowsInTx } from '../store/memories.js'

/**
 * 冲突解决：队列、记忆状态与 revision 在同一 BEGIN IMMEDIATE 事务内闭环。
 * keep = 保留指定侧，物理删除另一侧；drop = 将指定侧迁移为 corrected。
 * deleteMemory 参数仅保留旧 service 调用兼容；purge 不再改变 drop 的软迁移语义。
 */
export function resolveConflictRow(db, {
  id, action, side = 'old', deleteMemory = null, vectors = null,
  actor = 'owner', purge = false, now = Date.now(),
} = {}) {
  const cid = Number(id)
  if (!Number.isFinite(cid) || cid <= 0) return { ok: false, error: 'id 不合法', code: 'E_BAD_ID' }
  if (!['keep', 'drop'].includes(action)) return { ok: false, error: 'action 只能是 keep/drop', code: 'E_BAD_ACTION' }
  if (!['old', 'new'].includes(side)) return { ok: false, error: 'side 只能是 old/new', code: 'E_BAD_SIDE' }
  const at = Number(now)
  const auditKey = `conflict_audit_${cid}`
  const parseMeta = (raw) => { try { return JSON.parse(String(raw ?? '{}')) || {} } catch { return {} } }

  try {
    db.exec('BEGIN IMMEDIATE')
    const q = db.prepare('SELECT * FROM conflict_queue WHERE id=?').get(cid)
    if (!q) { db.exec('ROLLBACK'); return { ok: false, error: '没有这条冲突', code: 'E_NOT_FOUND' } }

    if (String(q.status) === 'resolved') {
      const prior = parseMeta(db.prepare('SELECT v FROM meta WHERE k=?').get(auditKey)?.v)
      db.exec('ROLLBACK')
      if (prior.action && prior.side && (prior.action !== action || prior.side !== side)) {
        return { ok: false, id: cid, code: 'E_CONFLICT_DECISION_MISMATCH', error: '该冲突已按不同决策解决，不允许覆盖' }
      }
      return { ok: true, id: cid, alreadyResolved: true, ...(prior.action ? { action: prior.action, side: prior.side } : { decisionUnknown: true }) }
    }
    if (String(q.status) !== 'pending') {
      db.exec('ROLLBACK')
      return { ok: false, id: cid, code: 'E_CONFLICT_NOT_PENDING', error: `冲突当前状态为 ${String(q.status)}，不能解决` }
    }

    const oldId = Number(q.memory_a)
    const newId = Number(q.memory_b)
    const survivorId = action === 'keep'
      ? (side === 'old' ? oldId : newId)
      : (side === 'old' ? newId : oldId)
    const victimId = action === 'keep'
      ? (side === 'old' ? newId : oldId)
      : (side === 'old' ? oldId : newId)
    if (!Number.isSafeInteger(survivorId) || survivorId <= 0 || !Number.isSafeInteger(victimId) || victimId <= 0 || survivorId === victimId) {
      db.exec('ROLLBACK')
      return { ok: false, id: cid, code: 'E_BAD_CONFLICT_PAIR', error: '冲突两侧记忆 ID 无效或相同' }
    }

    const victim = db.prepare('SELECT * FROM memories WHERE id=?').get(victimId)
    if (!victim) {
      db.exec('ROLLBACK')
      return { ok: false, id: cid, code: 'victim-missing', error: '受害者记忆不存在' }
    }
    const survivor = db.prepare('SELECT * FROM memories WHERE id=?').get(survivorId)
    if (!survivor) {
      db.exec('ROLLBACK')
      return { ok: false, id: cid, code: 'survivor-missing', error: '幸存者记忆不存在' }
    }

    let revision = null
    let removedVectorId = null
    if (action === 'keep') {
      // deleteRowsInTx 同事务清理 memories / FTS bigram+trigram / entities / vectors。
      // 它会把其它仍 pending 的引用队列标 stale；当前队列在下面恢复为 resolved。
      deleteRowsInTx(db, victimId)
      removedVectorId = victimId
    } else {
      if (!['active', 'pending'].includes(String(victim.status)) || victim.valid_to != null) {
        db.exec('ROLLBACK')
        return { ok: false, id: cid, code: 'victim-state-changed', error: '受害者记忆状态已变化，拒绝覆盖' }
      }
      const cur = Number(victim.revision ?? 1)
      const prevMeta = parseMeta(victim.meta)
      const meta = {
        ...prevMeta,
        invalidatedBy: `conflict:${cid}`,
        invalidation: 'corrected',
        invalidatedAt: at,
        supersededBy: survivorId,
        supersedeReason: 'conflict-resolution',
      }
      db.prepare('INSERT INTO memory_revisions(memory_id,revision,previous_json,changed_at,invalidation) VALUES(?,?,?,?,?)')
        .run(victimId, cur, JSON.stringify(victim), at, `conflict:${cid}`)
      const updated = db.prepare("UPDATE memories SET status='corrected', valid_to=?, superseded_by=?, revision=?, updated_at=?, meta=? WHERE id=? AND revision=? AND status=?")
        .run(at, survivorId, cur + 1, at, JSON.stringify(meta), victimId, cur, String(victim.status))
      if (Number(updated.changes) !== 1) throw new Error('E_REVISION_CONFLICT')
      revision = cur + 1
    }

    // 放在删除之后，避免 deleteRowsInTx 把当前冲突也标为 stale。
    const queueUpdate = db.prepare("UPDATE conflict_queue SET status='resolved' WHERE id=? AND status IN ('pending','stale')").run(cid)
    if (Number(queueUpdate.changes) !== 1) throw new Error('E_CONFLICT_QUEUE_CAS')

    let survivorActivated = false
    const latestSurvivor = db.prepare('SELECT * FROM memories WHERE id=?').get(survivorId)
    if (latestSurvivor && String(latestSurvivor.status) === 'pending' && latestSurvivor.valid_to == null) {
      const sMeta = parseMeta(latestSurvivor.meta)
      const openOther = db.prepare("SELECT 1 FROM conflict_queue WHERE status='pending' AND id<>? AND (memory_a=? OR memory_b=?) LIMIT 1")
        .get(cid, survivorId, survivorId)
      if (sMeta.quarantined !== true && !openOther) {
        const cur = Number(latestSurvivor.revision ?? 1)
        const nextMeta = { ...sMeta, activatedBy: `conflict:${cid}`, activationReason: 'survivor-after-conflict', activatedAt: at }
        db.prepare('INSERT INTO memory_revisions(memory_id,revision,previous_json,changed_at,invalidation) VALUES(?,?,?,?,?)')
          .run(survivorId, cur, JSON.stringify(latestSurvivor), at, `conflict:${cid}:survivor-activate`)
        const activated = db.prepare("UPDATE memories SET status='active', revision=?, updated_at=?, meta=? WHERE id=? AND revision=? AND status='pending' AND valid_to IS NULL")
          .run(cur + 1, at, JSON.stringify(nextMeta), survivorId, cur)
        if (Number(activated.changes) !== 1) throw new Error('E_SURVIVOR_REVISION_CONFLICT')
        survivorActivated = true
      }
    }

    const audit = {
      at, action, side, actor: String(actor ?? 'owner'),
      victimId, survivorId, purged: false, survivorActivated, revision,
    }
    db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run(auditKey, JSON.stringify(audit))
    db.exec('COMMIT')
    if (removedVectorId !== null) { try { vectors?.delete?.(removedVectorId) } catch {} }
    return {
      ok: true, id: cid, action, side, removed: action === 'keep' ? victimId : null,
      purged: false, revision, survivorId, survivorActivated,
    }
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    return { ok: false, code: String(e?.message ?? '').includes('REVISION') ? 'E_REVISION_CONFLICT' : 'E_RESOLVE_FAILED', error: String(e?.message ?? e) }
  }
}
