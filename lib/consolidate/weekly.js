/**
 * 周结（2026-11-12）：把一周内 auto 层的事实/偏好/关系做相似聚类，
 * 默认 dryRun：只出报告；正式模式才把重复条目标 superseded（保留信息最强的 keeper）。
 * 不删除任何正文；日记不在这里写（她有日记工具）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { similarity } from './similarity.js'

export const WEEKLY_DEFAULTS = Object.freeze({
  enabled: false,
  dryRun: true,
  weekday: 0, // 0=周日
  hour: 3,
  minute: 30,
  lookbackDays: 7,
  threshold: 0.6,
  maxClusters: 20,
})

const clampNum = (v, d, min, max) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}

export function normalizeWeeklyConfig(raw = {}) {
  return {
    ...WEEKLY_DEFAULTS,
    ...raw,
    enabled: raw.enabled === true,
    dryRun: raw.dryRun !== false,
    weekday: Math.floor(clampNum(raw.weekday, 0, 0, 6)),
    hour: Math.floor(clampNum(raw.hour, 3, 0, 23)),
    minute: Math.floor(clampNum(raw.minute, 30, 0, 59)),
    lookbackDays: Math.floor(clampNum(raw.lookbackDays, 7, 1, 60)),
    threshold: clampNum(raw.threshold, 0.6, 0.3, 0.95),
    maxClusters: Math.floor(clampNum(raw.maxClusters, 20, 1, 200)),
  }
}

/** 贪心聚类：任何成员与候选文本相似度 ≥ 阈值就并入同一簇。 */
export function clusterMemories(rows, threshold = 0.6) {
  const clusters = []
  for (const row of Array.isArray(rows) ? rows : []) {
    let target = null
    for (const c of clusters) {
      if (c.members.some((m) => similarity(m.text, row.text) >= threshold)) { target = c; break }
    }
    if (target) target.members.push(row)
    else clusters.push({ members: [row] })
  }
  return clusters
    .filter((c) => c.members.length >= 2)
    .map((c) => {
      const keeper = [...c.members].sort((a, b) => {
        const byImp = (Number(b.importance) || 0) - (Number(a.importance) || 0)
        return byImp !== 0 ? byImp : Number(a.id) - Number(b.id)
      })[0]
      return { keeper, members: c.members }
    })
}

const dayKey = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })

/** 跑一次周结（默认 dry-run）。 */
export function weeklyConsolidate({ db, cfg: rawCfg, now = Date.now(), dataDir = '' } = {}) {
  const cfg = normalizeWeeklyConfig(rawCfg)
  const since = Number(now) - cfg.lookbackDays * 86400000
  const rows = db.prepare(`
    SELECT id, kind, text, importance, created_at_epoch, status
    FROM memories
    WHERE status='active' AND layer='auto' AND created_at_epoch >= ?
      AND kind IN ('fact','preference','relation')
    ORDER BY id ASC
  `).all(since)
  const clusters = clusterMemories(rows, cfg.threshold).slice(0, cfg.maxClusters)
  const result = {
    ok: true,
    at: Number(now),
    day: dayKey(now),
    dryRun: cfg.dryRun,
    scanned: rows.length,
    clusters: clusters.map((c) => ({
      keeper: { id: c.keeper.id, kind: c.keeper.kind, text: c.keeper.text, importance: c.keeper.importance },
      members: c.members.map((m) => ({ id: m.id, kind: m.kind, text: m.text, importance: m.importance })),
    })),
    applied: { superseded: 0 },
  }

  if (cfg.dryRun) {
    if (dataDir) {
      const dir = join(dataDir, 'consolidate')
      mkdirSync(dir, { recursive: true })
      const p = join(dir, `weekly-${result.day}.json`)
      writeFileSync(p, JSON.stringify(result, null, 2), 'utf8')
      result.reportPath = p
    }
    return result
  }

  let superseded = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const c of clusters) {
      for (const m of c.members) {
        if (m.id === c.keeper.id) continue
        db.prepare("UPDATE memories SET status='superseded', superseded_by=? WHERE id=? AND status='active'").run(c.keeper.id, m.id)
        superseded++
      }
      db.prepare('UPDATE memories SET importance=MIN(0.95, importance+0.03) WHERE id=?').run(c.keeper.id)
    }
    db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('consolidate.weeklyLastAt',?)").run(String(now))
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    return { ...result, ok: false, error: String(e?.message ?? e).slice(0, 200) }
  }
  result.applied = { superseded }
  return result
}
