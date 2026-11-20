import { findAnchorRow, parseSourceRef, sessionIdOfRow } from '../inject/anchors.js'

const MAX_SPAN_MS = 30 * 60 * 1000
// Generic persona/room entities are too broad to establish an event-topic edge alone.
const GENERIC_SHARED_ENTITIES = new Set(['主人', '汐', '家里', '公司', '学校', '医院', '餐厅'])

function validAt(row, at, strictAsOf) {
  const from = row?.valid_from == null ? null : Number(row.valid_from)
  const to = row?.valid_to == null ? null : Number(row.valid_to)
  if (strictAsOf && from == null) return false
  return (from == null || from <= at) && (to == null || to > at)
}

/**
 * Read-only, evidence-gated same-session event expansion.
 * This is a selector only: it does not alter recall ranking or automatic injection.
 * Legacy raw rows without a full sessionId in extra are deliberately not expanded.
 */
export function eventChainCandidates(db, seed, {
  cwd = '',
  asOf = null,
  maxSpanMs = MAX_SPAN_MS,
  limit = 5,
} = {}) {
  if (!db || !cwd || !seed || String(seed.status ?? 'active') !== 'active') return []
  const source = parseSourceRef(seed)
  if (source.kind !== 'session-seq' || !source.sid || !(source.seq > 0)) return []
  const sourceKind = String(source.raw).split(':', 1)[0]
  if (!['p4', 'explicit'].includes(sourceKind)) return []
  const scopeType = String(seed.scope_type ?? '')
  const scopeId = String(seed.scope_id ?? '')
  // First prototype is intentionally owner/core only; group/contact need their own anchor policy.
  if (!['owner', 'core'].includes(scopeType)) return []
  const seedAt = Number(seed.source_ts ?? source.ts ?? 0)
  if (!(seedAt > 0)) return []
  const at = asOf == null ? Date.now() : Number(asOf)
  if (!Number.isFinite(at) || !validAt(seed, at, asOf != null)) return []
  const seedAnchor = findAnchorRow(db, seed, { cwd })
  if (!seedAnchor || sessionIdOfRow(seedAnchor.row) !== source.sid) return []

  const span = Math.max(1000, Math.min(Number(maxSpanMs) || MAX_SPAN_MS, 24 * 60 * 60 * 1000))
  const cap = Math.max(1, Math.min(Math.trunc(Number(limit) || 5), 20))
  const prefix = `${sourceKind}:${source.sid}:`
  const temporalSql = asOf == null
    ? '(m.valid_from IS NULL OR m.valid_from<=?) AND (m.valid_to IS NULL OR m.valid_to>?)'
    : '(m.valid_from IS NOT NULL AND m.valid_from<=?) AND (m.valid_to IS NULL OR m.valid_to>?)'
  let rows = []
  try {
    rows = db.prepare(`SELECT m.*, COUNT(DISTINCT me2.entity_id) AS shared_entity_count, GROUP_CONCAT(DISTINCT e.name) AS shared_entity_names, COUNT(DISTINCT CASE WHEN e.name NOT IN ('主人','汐','家里','公司','学校','医院','餐厅') THEN me2.entity_id END) AS topic_entity_count
      FROM memories m
      JOIN memory_entities me1 ON me1.memory_id=?
      JOIN memory_entities me2 ON me2.entity_id=me1.entity_id AND me2.memory_id=m.id
      JOIN entities e ON e.id=me2.entity_id
      WHERE m.id<>? AND m.status='active'
        AND m.scope_type=? AND COALESCE(m.scope_id,'')=?
        AND m.source_ts BETWEEN ? AND ?
        AND substr(m.source_msg_id,1,?)=?
        AND ${temporalSql}
      GROUP BY m.id
      HAVING COUNT(DISTINCT CASE WHEN e.name NOT IN ('主人','汐','家里','公司','学校','医院','餐厅') THEN me2.entity_id END) > 0
      ORDER BY m.source_ts ASC, m.id ASC
      LIMIT ?`).all(
      Number(seed.id), Number(seed.id), scopeType, scopeId,
      seedAt - span, seedAt + span, prefix.length, prefix,
      at, at, cap * 4,
    )
  } catch { return [] }

  const out = []
  for (const candidate of rows) {
    if (out.length >= cap) break
    const candidateSource = parseSourceRef(candidate)
    if (candidateSource.kind !== 'session-seq' || candidateSource.sid !== source.sid) continue
    if (candidateSource.seq === source.seq) continue
    if (!validAt(candidate, at, asOf != null)) continue
    const anchor = findAnchorRow(db, candidate, { cwd })
    if (!anchor || sessionIdOfRow(anchor.row) !== source.sid) continue
    out.push({
      id: Number(candidate.id),
      scopeType: String(candidate.scope_type ?? ''),
      scopeId: String(candidate.scope_id ?? ''),
      kind: String(candidate.kind ?? ''),
      text: String(candidate.text ?? ''),
      sourceMsgId: String(candidate.source_msg_id ?? ''),
      sourceTs: Number(candidate.source_ts ?? 0),
      anchorRawId: Number(anchor.row.id),
      anchorFile: String(anchor.row.file ?? ''),
      anchorLineNo: Number(anchor.row.line_no ?? 0),
      anchorVia: anchor.via,
      sharedEntityCount: Number(candidate.shared_entity_count ?? 0),
      topicEntityCount: Number(candidate.topic_entity_count ?? 0),
      sharedEntities: String(candidate.shared_entity_names ?? '').split(',').filter(Boolean),
      relation: 'same-session+shared-entity',
    })
  }
  return out
}
