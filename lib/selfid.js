/**
 * self:unknown 回填（阶段 4，P1 §6.1）
 *
 * 策略：
 * - persona 不可用时，raw 档案允许写 `speaker_id='self:unknown'` + `extra.pendingIdentity=true`（只丢不了消息）
 * - memories / 生活真实写入**拒绝**（service.addEpisode 抛 E_PERSONA_UNAVAILABLE）
 * - persona 恢复后：按批次回填成 `self:<uuid>`，清 pending 标记，写 meta 记录批次与时间
 */
import { now as nowFn } from './adapter/time.js'

export const UNKNOWN_SELF = 'self:unknown'

/** 还有多少行待回填 */
export function countUnknownSelf(db) {
  try {
    return Number(db.prepare('SELECT count(*) c FROM raw_meta WHERE speaker_id=?').get(UNKNOWN_SELF)?.c ?? 0)
  } catch { return 0 }
}

function normalizeSelfId(selfId) {
  const v = String(selfId ?? '').trim()
  if (!v) return ''
  return v.startsWith('self:') ? v : `self:${v}`
}

/**
 * 分批回填。
 *
 * @param {object} db
 * @param {object} opts
 * @param {string} opts.selfId      persona 的 selfId（`self:<uuid>`，不带前缀也可）
 * @param {number} [opts.limit=500] 本批最多处理多少行；<=0 表示全部
 * @param {boolean} [opts.dryRun=false]
 * @param {string} [opts.batch]     批次标记（默认时间戳）
 * @param {function} [opts.now]
 * @returns {{examined:number, updated:number, remaining:number, batch:string, dryRun:boolean}}
 */
export function backfillUnknownSelf(db, { selfId, limit = 500, dryRun = false, batch = '', now = nowFn } = {}) {
  const target = normalizeSelfId(selfId)
  if (!target || target === UNKNOWN_SELF) throw new Error('backfillUnknownSelf 需要有效的 selfId（self:<uuid>）')
  const ts = now()
  const batchId = batch || `selfid-${ts}`
  const n = Number(limit)
  const cap = Number.isFinite(n) && n > 0 ? Math.trunc(n) : -1
  const rows = (() => {
    try {
      const sql = `SELECT id, extra, at FROM raw_meta WHERE speaker_id=? ORDER BY id${cap > 0 ? ' LIMIT ' + cap : ''}`
      return db.prepare(sql).all(UNKNOWN_SELF)
    } catch { return [] }
  })()
  if (!rows.length) return { examined: 0, updated: 0, remaining: 0, batch: batchId, dryRun: Boolean(dryRun) }
  if (dryRun) {
    return { examined: rows.length, updated: 0, remaining: countUnknownSelf(db), batch: batchId, dryRun: true }
  }
  let updated = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    const upd = db.prepare('UPDATE raw_meta SET speaker_id=?, extra=? WHERE id=? AND speaker_id=?')
    for (const r of rows) {
      let extra = {}
      try { extra = JSON.parse(String(r.extra ?? '{}')) } catch { extra = {} }
      extra.pendingIdentity = false
      extra.selfId = target
      extra.selfBackfillBatch = batchId
      extra.selfBackfilledAt = ts
      upd.run(target, JSON.stringify(extra), r.id, UNKNOWN_SELF)
      updated += 1
    }
    db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('self_unknown_backfill_at',?)").run(String(ts))
    db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('self_unknown_backfill_batch',?)").run(batchId)
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    throw e
  }
  return { examined: rows.length, updated, remaining: countUnknownSelf(db), batch: batchId, dryRun: false }
}

/** 一直回填到没有 unknown 为止（每批 limit 行，最多 50 批兜底） */
export function backfillAll(db, { selfId, limit = 500, dryRun = false, now = nowFn, maxBatches = 50 } = {}) {
  let total = 0
  let batches = 0
  let last = { examined: 0, updated: 0, remaining: countUnknownSelf(db) }
  while (batches < maxBatches) {
    last = backfillUnknownSelf(db, { selfId, limit, dryRun, now })
    total += last.updated
    batches += 1
    if (last.examined === 0 || last.remaining === 0) break
  }
  return { updated: total, batches, remaining: countUnknownSelf(db), last }
}
