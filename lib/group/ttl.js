/**
 * 群记忆 TTL 软删（2026-11-09）
 *
 * `saveGroupTurn` 每写一条 group 记忆，就在 meta 里记 `group_ttl_<id>` = ttlDays（默认 90，
 * 见 lib/config.js `groupMemory.ttlDays`）。本函数把到期的 group 行 `status` 改成
 * `'expired'`：
 *   - **软删**：不物理删、不动正文/原话档案，随时可回滚（UPDATE status 即可）
 *   - 检索/注入按 `status='active'` 过滤，过期行自然不可见
 *   - 只处理 `scope_type='group'`，owner/contact/public 行一律不碰
 *
 * 没写 meta 的 group 行（别的路径写入）用 defaultTtlDays 兜底，避免永久留存。
 * 失败由调用方捕获；本函数返回 {expired:n}。
 */

/** 一天毫秒数（与 memories.created_at_epoch 单位一致：epoch ms） */
const DAY_MS = 86400000

/**
 * @param {object} opts
 * @param {object} opts.db             node:sqlite 连接
 * @param {number} [opts.now]          当前 epoch ms（默认 Date.now()，便于测试注入）
 * @param {number} [opts.defaultTtlDays] 没有 meta 的 group 行的兜底 TTL（默认 90）
 * @returns {{expired:number}}
 */
export function pruneGroupMemories({ db, now = Date.now(), defaultTtlDays = 90 } = {}) {
  const at = Number(now) > 0 ? Number(now) : Date.now()
  const fallback = Number(defaultTtlDays) > 0 ? Number(defaultTtlDays) : 90
  const rows = db
    .prepare("SELECT id, created_at_epoch FROM memories WHERE scope_type='group' AND status='active'")
    .all()
  if (!rows.length) return { expired: 0 }

  const getTtl = db.prepare('SELECT v FROM meta WHERE k=?')
  const expire = db.prepare("UPDATE memories SET status='expired' WHERE id=? AND status='active'")
  let expired = 0
  for (const r of rows) {
    const created = Number(r.created_at_epoch) || 0
    if (!created) continue
    let ttl = fallback
    const n = Number(getTtl.get(`group_ttl_${r.id}`)?.v)
    if (Number.isFinite(n) && n > 0) ttl = n
    if (created + ttl * DAY_MS <= at) {
      const info = expire.run(r.id)
      if (Number(info?.changes) > 0) expired += 1
    }
  }
  return { expired }
}
