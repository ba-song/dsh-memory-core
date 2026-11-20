import { RRF_K } from './score.js'

const idOf = (value) => Number(typeof value === 'object' && value !== null ? value.id : value)
const gradeOf = (value) => Math.max(0, Math.min(3, Math.trunc(Number(value?.grade) || 0)))

/**
 * Human-judged retrieval metrics.
 * relevant: [{ memoryId, grade: 0..3, evidence?: { sourceMsgId?, sourceTs?, rawId? } }]
 * Grade 0 is explicitly non-relevant; an empty relevant array means unlabelled.
 */
export function evaluateRankedResults(ranked, relevant, { ks = [1, 3, 5], forbiddenMemoryIds = [] } = {}) {
  const rankedIds = [...new Set((Array.isArray(ranked) ? ranked : []).map(idOf).filter((id) => Number.isSafeInteger(id) && id > 0))]
  const labels = new Map()
  for (const item of Array.isArray(relevant) ? relevant : []) {
    const id = Number(item?.memoryId ?? item?.id)
    if (!Number.isSafeInteger(id) || id <= 0) continue
    labels.set(id, Math.max(labels.get(id) ?? 0, gradeOf(item)))
  }
  const positives = [...labels].filter(([, grade]) => grade > 0)
  if (!positives.length) {
    return { labelled: false, relevantCount: 0, retrievedRelevant: 0, recall: null, precision: null, mrr: null, ndcgAt5: null, evidenceCoverage: null }
  }

  const forbidden = new Set((Array.isArray(forbiddenMemoryIds) ? forbiddenMemoryIds : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))\n  const forbiddenReturned = rankedIds.filter((id) => forbidden.has(id))\n  const ranks = new Map(rankedIds.map((id, index) => [id, index + 1]))
  const relevantIds = new Set(positives.map(([id]) => id))
  const retrieved = positives.filter(([id]) => ranks.has(id))
  const firstRank = retrieved.length ? Math.min(...retrieved.map(([id]) => ranks.get(id))) : 0
  const recall = {}
  const precision = {}
  for (const rawK of ks) {
    const k = Math.max(1, Math.trunc(Number(rawK) || 1))
    const found = rankedIds.slice(0, k).filter((id) => relevantIds.has(id)).length
    recall[k] = found / relevantIds.size
    precision[k] = found / k
  }

  const dcg = (items) => items.reduce((sum, item, index) => {
    const grade = labels.get(idOf(item)) ?? 0
    return sum + (Math.pow(2, grade) - 1) / Math.log2(index + 2)
  }, 0)
  const actual = rankedIds.slice(0, 5)
  const ideal = positives.slice().sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id)
  const idealDcg = dcg(ideal)
  const ndcgAt5 = idealDcg > 0 ? dcg(actual) / idealDcg : 0
  const evidenceN = retrieved.filter(([id]) => {
    const item = (Array.isArray(relevant) ? relevant : []).find((x) => Number(x?.memoryId ?? x?.id) === id)
    const evidence = item?.evidence ?? {}
    return Boolean(evidence.sourceMsgId || Number(evidence.sourceTs) > 0 || Number(evidence.rawId) > 0)
  }).length

  return {
    labelled: true,
    relevantCount: relevantIds.size,
    retrievedRelevant: retrieved.length,
    recall,
    precision,
    mrr: firstRank ? 1 / firstRank : 0,
    ndcgAt5,
    evidenceCoverage: retrieved.length ? evidenceN / retrieved.length : 0,\n    forbiddenReturnedCount: forbiddenReturned.length,\n    forbiddenReturnedIds: forbiddenReturned,
  }
}

/** Explain RRF by arm without changing retrieval ordering or scores. Ranks are 1-based. */
export function explainRrf(arms, candidateIds, { k = RRF_K } = {}) {
  const ranks = new Map()
  for (const [arm, values] of Object.entries(arms ?? {})) {
    const seen = new Set()
    ;(Array.isArray(values) ? values : []).forEach((value, index) => {
      const id = idOf(value)
      if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return
      seen.add(id)
      if (!ranks.has(id)) ranks.set(id, {})
      ranks.get(id)[arm] = index + 1
    })
  }
  return [...new Set((candidateIds ?? []).map(idOf))]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .map((id) => {
      const armRanks = ranks.get(id) ?? {}
      const contributions = Object.fromEntries(Object.entries(armRanks).map(([arm, rank]) => [arm, 1 / (Number(k) + rank)]))
      return { id, ranks: armRanks, contributions, total: Object.values(contributions).reduce((sum, value) => sum + value, 0) }
    })
    .sort((a, b) => b.total - a.total || a.id - b.id)
}

/** Compare two independent ranked runs; returns null stability for empty unions. */
export function compareRankStability(first, second, { k = 5 } = {}) {
  const limit = Math.max(1, Math.trunc(Number(k) || 5))
  const a = [...new Set((first ?? []).map(idOf).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, limit)
  const b = [...new Set((second ?? []).map(idOf).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, limit)
  const A = new Set(a), B = new Set(b)
  const union = new Set([...A, ...B])
  const intersection = [...A].filter((id) => B.has(id)).length
  return {
    k: limit,
    jaccard: union.size ? intersection / union.size : null,
    exactTopK: a.length === b.length && a.every((id, index) => id === b[index]),
    first: a,
    second: b,
  }
}
