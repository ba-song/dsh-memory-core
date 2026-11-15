import { bigrams } from '../store/fts.js'
import { embedTexts, embedAvailable } from '../embed/onnx.mjs'
import { graphCandidates } from '../store/graph.js'
import { rrfContribution } from './score.js'
import { scopeWhere, scopeAllows } from '../scope.js'

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

/** scope 过滤下的允许 id 集合；owner/未传 scope 返回 null = 不过滤（老行为） */
function scopedIds(db, scope) {
  if (!scope || scope.level === 'owner') return null
  const w = scopeWhere(scope)
  try {
    return new Set(db.prepare(`SELECT id FROM memories WHERE status='active' AND ${w.sql}`).all(...w.params).map((r) => Number(r.id)))
  } catch { return new Set() }
}

/**
 * FTS 关键词臂：**先在 SQL 里按 scope 过滤**，再算分数。
 * 不把 scope 外的 rowid 带进来，避免「先全库排序再过滤」。
 */
function keywordScores(db, query, scope) {
  const filter = scope && scope.level !== 'owner' ? scopeWhere(scope) : null
  return keywordScoresViaSearch(db, query, filter)
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

export async function recall(db, query, { vectors = null, gate = { semantic: 0.55, keyword: 0.35 }, limit = 8, monitor = null, scope = null } = {}) {
  const safeScope = scope && typeof scope === 'object' ? scope : null
  const allowed = scopedIds(db, safeScope)
  const kw = keywordScores(db, query, safeScope)
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
  const g = graphCandidates(db, query)
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
    const m = db.prepare(`SELECT * FROM memories WHERE id=? AND status=?${w ? ` AND ${w.sql}` : ''}`).get(r.id, 'active', ...(w ? w.params : []))
    if (m) out.push({ ...m, scores: { keyword: r.kw, semantic: r.sem, graph: r.graph, rrf: r.rrf } })
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

