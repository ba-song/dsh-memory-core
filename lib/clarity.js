/**
 * 记忆卡清晰度/遗忘（2026-11-13，参考 SurfCore memory-card）：
 * vivid → clear → fuzzy → trace → archived（不删正文，先写全量归档）。
 * 每天最多降一档；主人高重要度、pinned、「最初」保护。
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const CLARITY_LEVELS = ['vivid', 'clear', 'fuzzy', 'trace']

/** 容量告警：80/90/100%，只给 UI/日志用。 */
export function capacityStatus(chars, limit = 200000) {
  const total = Math.max(0, Number(chars) || 0)
  const cap = Math.max(1000, Number(limit) || 200000)
  const percent = Math.min(999, (total / cap) * 100)
  return { total, limit: cap, percent: Number(percent.toFixed(1)), level: percent >= 100 ? 'full' : percent >= 90 ? 'critical' : percent >= 80 ? 'warn' : 'ok' }
}
const RANK = { vivid: 0, clear: 1, fuzzy: 2, trace: 3, forgotten: 4 }
const NEXT = { vivid: 'clear', clear: 'fuzzy', fuzzy: 'trace', trace: 'forgotten' }

export function clarityRank(c) { return RANK[String(c ?? '').toLowerCase()] ?? 1 }

/** 目标清晰度：只按年龄/重要度/保护规则算，不做“删除”。 */
export function targetClarity(row, { now = Date.now(), ownerImportanceMin = 0.65, forgetAfterDays = 60 } = {}) {
  const importance = Number(row?.importance) || 0
  const pinned = Number(row?.pinned) === 1 || row?.pinned === true
  const meta = (() => { try { return typeof row?.meta === 'string' ? JSON.parse(row.meta) : (row?.meta ?? {}) } catch { return {} } })()
  // M1：只有显式确认的长期偏好受生命周期保护；不影响其他 kind/普通 preference。
  if (row?.kind === 'preference' && meta?.persist === true && meta?.persistence === 'long_term') return 'vivid'
  if (pinned || meta?.firstMet || importance >= 0.9) return 'vivid'
  if (meta?.ownerProtected === true || (row?.scope_type === 'owner' && importance >= ownerImportanceMin)) return 'clear'
  const at = Number(row?.created_at_epoch) || now
  const ageDays = Math.max(0, (now - at) / 86400000)
  if (ageDays > Number(forgetAfterDays) && importance < 0.5) return 'forgotten'
  if (ageDays <= 7) return 'vivid'
  if (ageDays <= 30) return 'clear'
  if (ageDays <= forgetAfterDays) return 'fuzzy'
  return 'trace'
}

/** 规划：每天最多降一档；返回 {id,from,to,archive}。 */
export function planClarity(rows, { now = Date.now(), days = 1, ownerImportanceMin = 0.65, forgetAfterDays = 60 } = {}) {
  const plan = []
  const steps = Math.max(1, Math.min(Number(days) || 1, 30))
  for (const row of rows) {
    const from = String(row.clarity || 'clear').toLowerCase()
    const target = targetClarity(row, { now, ownerImportanceMin, forgetAfterDays })
    const curRank = clarityRank(from)
    const targetRank = RANK[target] ?? curRank
    if (targetRank <= curRank) continue
    let to = from
    for (let i = 0; i < steps; i++) to = NEXT[to] ?? 'forgotten'
    // 只降一档（或补跑 steps 档），不跳档；到 forgotten 即可
    plan.push({ id: Number(row.id), from, to, target, importance: Number(row.importance) || 0, text: String(row.text ?? '').slice(0, 120) })
  }
  return plan
}

function appendArchive(file, rows, now) {
  if (!file) return 0
  try {
    mkdirSync(dirname(file), { recursive: true })
    const lines = rows.map((r) => JSON.stringify({ ...r, archivedAt: new Date(now).toISOString() })).join('\n') + '\n'
    appendFileSync(file, lines, 'utf8')
    return rows.length
  } catch { return 0 }
}

/** 应用规划：遗忘前先写全量归档；只改 clarity/status，不删正文。 */
export function applyClarityPlan(db, plan, { now = Date.now(), archiveFile = '' } = {}) {
  let changed = 0, archived = 0
  for (const p of plan) {
    if (p.to === 'forgotten') {
      try {
        const row = db.prepare('SELECT * FROM memories WHERE id=?').get(p.id)
        if (row) { appendArchive(archiveFile, [row], now); archived++ }
      } catch {}
      db.prepare("UPDATE memories SET clarity='trace', status='archived' WHERE id=?").run(p.id)
    } else {
      db.prepare('UPDATE memories SET clarity=? WHERE id=?').run(p.to, p.id)
    }
    changed++
  }
  return { changed, archived }
}
