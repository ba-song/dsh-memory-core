/** P4 计数单例（2026-11-06）：ingest 钩子与 dy_memory_stats 必须共用同一对象 */
export const P4 = {
  counts: Object.create(null),
  lastDrop: null,
  attempts: 0,
  inserted: 0,
  lastAttemptAt: 0,
  lastInsertAt: 0,
  // P4-L 模型兜底计数（2026-11-06；进程内，重启清零）
  llm: { attempts: 0, ok: 0, inserted: 0, failed: 0, none: 0, rejected: 0, lastReason: '', lastAt: 0 },
}
export function noteAttempt() { P4.attempts += 1; P4.lastAttemptAt = Date.now() }
export function noteInsert() { P4.inserted += 1; P4.lastInsertAt = Date.now() }
export function noteDrop(drops = []) {
  for (const d of (Array.isArray(drops) ? drops : [])) {
    const reason = String(d?.reason ?? 'unknown')
    P4.counts[reason] = (P4.counts[reason] ?? 0) + 1
    P4.lastDrop = { reason, textPreview: String(d?.text20 ?? '').slice(0, 20), at: Date.now() }
  }
}

// ── P4-L 模型兜底：配额 + 计数（2026-11-06） ─────────────────────────
// 配额按本地自然日重置；只在进程内计数（重启清零），不写库、不改生产配置。
let llmDay = ''
let llmUsed = 0

/** 本地自然日 key（YYYY-MM-DD）；测试可传 now */
export function llmDayKey(now = Date.now()) {
  const d = new Date(Number(now) || Date.now())
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 取一次当日配额（先取后调；失败也占配额，防止坏路由无限重试烧钱）。
 * @returns {{ok:boolean, day:string, used:number, cap:number|null}}
 */
export function takeLlmQuota(cap, now = Date.now()) {
  const day = llmDayKey(now)
  if (day !== llmDay) { llmDay = day; llmUsed = 0 }
  const n = Number(cap)
  const limit = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  if (limit !== null && llmUsed >= limit) return { ok: false, day, used: llmUsed, cap: limit }
  llmUsed += 1
  return { ok: true, day, used: llmUsed, cap: limit }
}

export function noteLlmAttempt(now = Date.now()) {
  P4.llm.attempts += 1
  P4.llm.lastAt = Number(now) || Date.now()
}

/**
 * 记一次模型兜底结果。一个候选只调一次：
 * - 模型返回合法候选 → ok++；真正落库（insert/queue）→ inserted++
 * - 模型回 NONE → none++
 * - 无服务/无路由/超时/解析失败 → failed++
 * - 代词/角色错乱被后置过滤 → rejected++
 */
export function noteLlmResult({ ok = false, inserted = false, none = false, failed = false, rejected = false, reason = '', now = Date.now() } = {}) {
  const L = P4.llm
  if (ok) L.ok += 1
  if (inserted) L.inserted += 1
  if (none) L.none += 1
  if (failed) L.failed += 1
  if (rejected) L.rejected += 1
  L.lastReason = String(reason ?? '').slice(0, 80)
  L.lastAt = Number(now) || Date.now()
}

/** dy_memory_stats.autoExtract.diag.llm 的稳定形状（键集合固定） */
export function llmDiag() {
  const L = P4.llm
  return {
    attempts: L.attempts,
    ok: L.ok,
    inserted: L.inserted,
    failed: L.failed,
    none: L.none,
    rejected: L.rejected,
    lastReason: L.lastReason,
    lastAt: L.lastAt,
  }
}

/** 测试专用：清空 P4-L 计数与当日配额（不影响 P4 规则计数） */
export function resetLlmStats() {
  Object.assign(P4.llm, { attempts: 0, ok: 0, inserted: 0, failed: 0, none: 0, rejected: 0, lastReason: '', lastAt: 0 })
  llmDay = ''
  llmUsed = 0
}
