import { bigrams } from '../store/fts.js'
import { embedTexts, embedAvailable } from '../embed/onnx.mjs'
import { graphCandidates } from '../store/graph.js'
import { rrfContribution } from './score.js'
import { scopeWhere, scopeAllows } from '../scope.js'

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

/* ── 2026-11-16 P0-4：as-of 时间有效性 ────────────────────────────────────────
 * 约定（双时间）：
 *   valid_from / valid_to  这条事实「在现实世界里」有效的时间窗（epoch ms，半开区间 [from, to)）
 *   temporal_kind          'current' | 'historical' | 'unknown'（默认 unknown＝没判定过）
 * 判定：
 *   有效     → valid_from <= asOf 且 (valid_to IS NULL 或 valid_to > asOf)
 *   无效     → 明确落在窗外（asOf 早于 valid_from，或 valid_to <= asOf）→ 不进结果
 *   无法判定 → temporal_kind='unknown' 且 valid_from IS NULL → 进 uncertain，**不猜**
 * 当前视图（未传 asOf）只纳入当前有效行；历史版本必须显式传 asOf。
 */
export const TEMPORAL_VALID_SQL = 'valid_from IS NOT NULL AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)'
export const TEMPORAL_UNKNOWN_SQL = "COALESCE(temporal_kind,'unknown')='unknown' AND valid_from IS NULL"

/** 接受 epoch ms / Date / 'YYYY-MM-DD'（按当天 23:59:59.999 本地时区）/ ISO；非法返回 null */
export function normalizeAsOf(asOf) {
  if (asOf === null || asOf === undefined || asOf === '') return null
  if (typeof asOf === 'number') return Number.isFinite(asOf) ? asOf : null
  if (asOf instanceof Date) return Number.isFinite(asOf.getTime()) ? asOf.getTime() : null
  const s = String(asOf).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = new Date(`${s}T23:59:59.999`).getTime()
    return Number.isFinite(t) ? t : null
  }
  if (/^\d{10,}$/.test(s)) return Number(s)
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

const combineFilters = (a, b) => {
  if (!a) return b || null
  if (!b) return a
  return { sql: `(${a.sql}) AND (${b.sql})`, params: [...a.params, ...b.params] }
}
const temporalFilter = (at) => ({ sql: TEMPORAL_VALID_SQL, params: [at, at] })

/** as-of 视图下「有效」的 id 集合（owner 也要过滤，所以不再返回 null） */
function validIdsAsOf(db, scope, at) {
  const w = scopeWhere(scope)
  try {
    const rows = db.prepare(`SELECT id FROM memories WHERE status='active' AND ${w.sql} AND ${TEMPORAL_VALID_SQL}`)
      .all(...w.params, at, at)
    return new Set(rows.map((r) => Number(r.id)))
  } catch { return new Set() }
}

/** 无法判定有效性的行（只回 id/kind/文本前 60 字，不回正文） */
function uncertainRows(db, scope, ids, { limit = 10 } = {}) {
  const list = [...ids].slice(0, 200)
  if (!list.length) return []
  const w = scopeWhere(scope)
  try {
    const ph = list.map(() => '?').join(',')
    return db.prepare(`SELECT id,kind,text FROM memories WHERE id IN (${ph}) AND status='active' AND ${w.sql} AND ${TEMPORAL_UNKNOWN_SQL} LIMIT ?`)
      .all(...list, ...w.params, Math.max(1, Number(limit) || 10))
      .map((r) => ({ id: Number(r.id), kind: String(r.kind ?? ''), text: String(r.text ?? '').slice(0, 60), reason: 'unknown-validity' }))
  } catch { return [] }
}

/** scope 过滤下的允许 id 集合；owner/未传 scope 返回 null = 不过滤（老行为） */
function scopedIds(db, scope, at = Date.now()) {
  const w = scopeWhere(scope)
  try {
    return new Set(db.prepare(`SELECT id FROM memories WHERE status='active' AND ${w.sql} AND (valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>?)`).all(...w.params, Number(at), Number(at)).map((r) => Number(r.id)))
  } catch { return new Set() }
}

/**
 * FTS 关键词臂：**先在 SQL 里按 scope 过滤**，再算分数。
 * 不把 scope 外的 rowid 带进来，避免「先全库排序再过滤」。
 */
function keywordScores(db, query, scope, timeFilter = null) {
  const scopeFilter = scope && scope.level !== 'owner' ? scopeWhere(scope) : null
  return keywordScoresViaSearch(db, query, combineFilters(scopeFilter, timeFilter))
}

function keywordScoresViaSearch(db, query, filter) {
  const bag = []
  try {
    const bs = searchBigramExpr(db, query, filter)
    const ts = searchTrigramExpr(db, query, filter)
    bag.push(...bs, ...ts)
  } catch { return [] }
  const uniq = [...new Set(bag.map((r) => Number(r.id)))]
  if (!uniq.length) return []
  const n = uniq.length
  return uniq.map((id, i) => ({ id, score: 1 - i / Math.max(n, 2) }))
}

function searchBigramExpr(db, query, filter) {
  const grams = bigramExpr(query)
  if (!grams.length) return []
  const expr = grams.map((g) => '"' + g.replaceAll('"', '""') + '"').join(' OR ')
  const sql = filter
    ? `SELECT rowid AS id FROM fts_bigram WHERE fts_bigram MATCH ? AND rowid IN (SELECT id FROM memories WHERE status='active' AND ${filter.sql}) LIMIT ?`
    : 'SELECT rowid AS id FROM fts_bigram WHERE fts_bigram MATCH ? LIMIT ?'
  try { return db.prepare(sql).all(...(filter ? [expr, ...filter.params, 50] : [expr, 50])) } catch { return [] }
}
function searchTrigramExpr(db, query, filter) {
  const grams = trigramExpr(query)
  if (!grams.length) return []
  const expr = [...new Set(grams)].map((g) => '"' + g.replaceAll('"', '""') + '"').join(' OR ')
  const sql = filter
    ? `SELECT rowid AS id FROM fts_trigram WHERE fts_trigram MATCH ? AND rowid IN (SELECT id FROM memories WHERE status='active' AND ${filter.sql}) LIMIT ?`
    : 'SELECT rowid AS id FROM fts_trigram WHERE fts_trigram MATCH ? LIMIT ?'
  try { return db.prepare(sql).all(...(filter ? [expr, ...filter.params, 50] : [expr, 50])) } catch { return [] }
}

const PUNCT = /[\p{P}\p{S}\s]/u
function bigramExpr(q) { return bigrams(q).split(' ').filter(Boolean) }
function trigramExpr(q) {
  const chars = [...String(q ?? '')].filter((c) => !PUNCT.test(c))
  if (chars.length < 3) return []
  const grams = []
  for (let i = 0; i + 3 <= chars.length; i++) grams.push(chars.slice(i, i + 3).join(''))
  return grams
}

export async function recall(db, query, { vectors = null, gate = { semantic: 0.55, keyword: 0.35 }, limit = 8, monitor = null, scope = null, asOf = null, trackAccess = true } = {}) {
  const asOfAt = normalizeAsOf(asOf)
  const safeScope = scope && typeof scope === 'object' ? scope : null
  const allowed = asOfAt !== null ? validIdsAsOf(db, safeScope, asOfAt) : scopedIds(db, safeScope)
  const timeFilter = asOfAt !== null ? temporalFilter(asOfAt) : null
  const kw = keywordScores(db, query, safeScope, timeFilter).filter((x) => !allowed || allowed.has(Number(x.id)))
  let sem = []
  if (vectors && vectors.size && embedAvailable()) {
    try {
      const [qv] = await embedTexts([query], { query: true }) || []
      if (qv) {
        const arr = []
        // 关键：只对 scope 内的 id 算 cosine（allowed=null 表示 owner/未传 scope）
        for (const [id, v] of vectors) {
          if (allowed && !allowed.has(Number(id))) continue
          if (v.length === qv.length) arr.push({ id: Number(id), score: dot(qv, v) })
        }
        arr.sort((a, b) => b.score - a.score)
        sem = arr.slice(0, 50)
      }
    } catch { sem = [] }
  }
  const graphListCandidates = graphCandidates(db, query, {
    scope: safeScope,
    asOf: asOfAt ?? Date.now(),
    strictAsOf: asOfAt !== null,
    includeUnknownHops: asOfAt !== null,
  })
  const g = graphListCandidates

  const graphList = [...g.direct.map((id) => ({ id, score: 1 })),
                     ...[...g.hop.entries()].map(([id, score]) => ({ id, score }))]
    .filter((x) => !allowed || allowed.has(Number(x.id)))

  const raw = new Map()
  const touch = (id) => raw.get(id) ?? raw.set(id, { kw: 0, sem: 0, graph: 0 }).get(id)
  for (const x of kw) touch(x.id).kw = x.score
  for (const x of sem) touch(x.id).sem = x.score
  for (const x of graphList) touch(x.id).graph = Math.max(touch(x.id).graph, x.score)

  const ranked = []
  for (const [id, s] of raw) {
    const directGraph = g.direct.includes(id)
    if (s.kw < gate.keyword && s.sem < gate.semantic && !directGraph) continue
    ranked.push({ id, ...s })
  }
  const rrf = rrfContribution([
    kw.map((x) => x.id), sem.map((x) => x.id), graphList.map((x) => x.id),
  ])
  const rows = ranked.map((r) => {
    const m = db.prepare('SELECT importance, created_at_epoch, last_access_epoch FROM memories WHERE id=? AND status=?').get(r.id, 'active')
    const imp = Number(m?.importance ?? 0.5)
    const ageDays = Math.max(0, (Date.now() - Number(m?.created_at_epoch ?? Date.now())) / 86400000)
    const fresh = Math.exp(-ageDays / 14)
    return { ...r, rrf: rrf.get(r.id) ?? 0, rankBoost: imp * 0.0015 + fresh * 0.001 }
  })
  rows.sort((a, b) => (b.rrf + b.rankBoost) - (a.rrf + a.rankBoost))
  const top = rows.slice(0, limit)
  const out = []
  for (const r of top) {
    const w = safeScope && safeScope.level !== 'owner' ? scopeWhere(safeScope) : null
    const timeSql = asOfAt !== null ? ` AND ${TEMPORAL_VALID_SQL}` : ''
    const timeParams = asOfAt !== null ? [asOfAt, asOfAt] : []
    const m = db.prepare(`SELECT * FROM memories WHERE id=? AND status=?${w ? ` AND ${w.sql}` : ''}${timeSql}`).get(r.id, 'active', ...(w ? w.params : []), ...timeParams)
    if (m) out.push({ ...m, scores: { keyword: r.kw, semantic: r.sem, graph: r.graph, rrf: r.rrf } })
  }
  // P0-4：as-of 视图下「查到了但判不了」的行单独回，不猜、也不混进结果。
  // 注意候选集要**不带时间窗**重查一次关键词臂（带窗的话，判不了的行根本进不来）。
  if (asOfAt !== null) {
    const rawKw = keywordScores(db, query, safeScope)
    const candidateIds = new Set([...rawKw.map((x) => x.id), ...graphList.map((x) => x.id), ...g.unknownHop.keys()])
    for (const row of out) candidateIds.delete(row.id)
    out.uncertain = uncertainRows(db, safeScope, candidateIds, { limit })
    out.asOf = asOfAt
  }
  // 2026-11-16 P0-6：命中回写（access_count / last_access_epoch 过去全库零 UPDATE，factors/decay/remembered 三处逻辑因此失效）
  if (trackAccess !== false && out.length) {
    try {
      const at = Date.now()
      const stmt = db.prepare('UPDATE memories SET access_count=access_count+1, last_access_epoch=? WHERE id=?')
      for (const r of out) stmt.run(at, r.id)
    } catch {}
  }
  if (monitor) monitor.record({
    arms: { keyword: kw.map((x) => x.id), semantic: sem.map((x) => x.id), graph: graphList.map((x) => x.id) },
    resultIds: out.map((r) => r.id),
  })
  return out
}

/**
 * 越权探测：只做 FTS 关键词命中（**不算相似度**），统计有多少命中行落在 scope 外。
 * 用于工具层「越权请求返回空 + 审计」，不破坏「先过滤再算相似度」。
 */
export function countBlockedMatches(db, query, scope) {
  if (!scope || scope.level === 'owner') return 0
  const exprB = bigramExpr(query)
  const exprT = trigramExpr(query)
  const ids = new Set()
  try {
    if (exprB.length) {
      const expr = exprB.map((g) => '"' + g.replaceAll('"', '""') + '"').join(' OR ')
      for (const r of db.prepare('SELECT rowid AS id FROM fts_bigram WHERE fts_bigram MATCH ? LIMIT 100').all(expr)) ids.add(Number(r.id))
    }
    if (exprT.length) {
      const expr = [...new Set(exprT)].map((g) => '"' + g.replaceAll('"', '""') + '"').join(' OR ')
      for (const r of db.prepare('SELECT rowid AS id FROM fts_trigram WHERE fts_trigram MATCH ? LIMIT 100').all(expr)) ids.add(Number(r.id))
    }
  } catch { return 0 }
  if (!ids.size) return 0
  try {
    const list = [...ids]
    const ph = list.map(() => '?').join(',')
    const rows = db.prepare(`SELECT id,scope_type,scope_id,status FROM memories WHERE id IN (${ph}) AND status='active'`).all(...list)
    return rows.filter((r) => !scopeAllows(scope, r)).length
  } catch { return 0 }
}

