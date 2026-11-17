/** M1：长期偏好 pending 的有限启动重试。 */
import { updateMemory } from '../store/memories.js'
import { mergePersistentPreference } from './merge.js'
import { withP4WriteQueue } from '../ingest/p4.js'

let running = false

export async function retryPendingPreferences({ db, log = console, limit = 3, maxRetries = 3 } = {}) {
  if (!db || running) return { processed: 0, skipped: 0 }
  running = true
  let processed = 0
  let skipped = 0
  try {
    const pending = db.prepare(`SELECT id FROM memories
      WHERE kind='preference' AND status='pending'
        AND json_extract(meta,'$.persist')=1
        AND json_extract(meta,'$.persistence')='long_term'
      ORDER BY id LIMIT ?`).all(Math.max(1, Math.min(3, Number(limit) || 3)))
    for (const item of pending) {
      await withP4WriteQueue(async () => {
        const row = db.prepare("SELECT * FROM memories WHERE id=? AND kind='preference' AND status='pending'").get(Number(item.id))
        if (!row) { skipped += 1; return }
        let meta = {}
        try { meta = JSON.parse(row.meta || '{}') } catch {}
        if (meta.persist !== true || meta.persistence !== 'long_term') { skipped += 1; return }
        const retryCount = Math.max(0, Number(meta.retryCount) || 0)
        if (retryCount >= maxRetries || meta.needsReview === true) {
          if (meta.needsReview !== true) {
            const marked = await updateMemory(db, row.id, { metaPatch: { needsReview: true } }, Number(row.revision ?? 1), { invalidation: 'preference-retry-limit' })
            if (!marked.ok) log.warn(`长期偏好 pending #${row.id} 达到重试上限，标记复核失败：${marked.code}`)
          }
          log.warn(`长期偏好 pending #${row.id} 已达到重试上限，需人工复核`)
          skipped += 1
          return
        }
        const now = Date.now()
        const begun = await updateMemory(db, row.id, {
          metaPatch: { retryCount: retryCount + 1, lastRetryAt: now, lastError: '' },
        }, Number(row.revision ?? 1), { now, invalidation: 'preference-merge-retry' })
        if (!begun.ok) {
          log.warn(`长期偏好 pending #${row.id} 重试状态写入失败：${begun.code}`)
          skipped += 1
          return
        }
        try {
          const merged = await mergePersistentPreference(db, { id: row.id, text: row.text, now })
          if (!merged?.ok) throw new Error(merged?.reason ?? 'preference-merge-not-ok')
          processed += 1
        } catch (error) {
          const latest = db.prepare("SELECT * FROM memories WHERE id=? AND kind='preference' AND status='pending'").get(Number(row.id))
          const message = String(error?.message ?? error).slice(0, 160)
          if (latest) {
            let latestMeta = {}
            try { latestMeta = JSON.parse(latest.meta || '{}') } catch {}
            const count = Math.max(0, Number(latestMeta.retryCount) || retryCount + 1)
            const failed = await updateMemory(db, latest.id, {
              metaPatch: { lastError: message, ...(count >= maxRetries ? { needsReview: true } : {}) },
            }, Number(latest.revision ?? 1), { now: Date.now(), invalidation: 'preference-merge-retry-failed' })
            if (!failed.ok) log.warn(`长期偏好 pending #${row.id} 失败信息写入失败：${failed.code}`)
            if (count >= maxRetries) log.warn(`长期偏好 pending #${row.id} 连续失败达到上限，需人工复核：${message}`)
            else log.warn(`长期偏好 pending #${row.id} 重试失败：${message}`)
          } else {
            log.warn(`长期偏好 pending #${row.id} 重试异常且记录状态已变化：${message}`)
          }
          skipped += 1
        }
      })
    }
  } catch (error) {
    log.warn(`长期偏好 pending 扫描失败：${error?.message ?? error}`)
  } finally {
    running = false
  }
  return { processed, skipped }
}
