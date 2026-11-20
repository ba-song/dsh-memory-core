import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRankedResults, explainRrf, compareRankStability } from '../lib/recall/eval-metrics.js'

test('human graded metrics distinguish unlabelled queries from zero-recall labels', () => {
  const unlabelled = evaluateRankedResults([1, 2, 3], [])
  assert.equal(unlabelled.labelled, false)
  assert.equal(unlabelled.recall, null)
  const labelledNone = evaluateRankedResults([1, 2], [{ memoryId: 3, grade: 0 }])
  assert.equal(labelledNone.labelled, true)
  assert.equal(labelledNone.recall, null)
  assert.equal(labelledNone.precision[3], 0)

  const labelled = evaluateRankedResults([9, 2, 8, 1], [
    { memoryId: 1, grade: 3, evidence: { sourceMsgId: 'raw:11' } },
    { memoryId: 2, grade: 1 },
  ])
  assert.equal(labelled.labelled, true)
  assert.equal(labelled.recall[1], 0)
  assert.equal(labelled.recall[3], 0.5)
  assert.equal(labelled.precision[3], 1 / 3)
  assert.equal(labelled.mrr, 1 / 2)
  assert.ok(labelled.ndcgAt5 > 0 && labelled.ndcgAt5 <= 1)
  assert.equal(labelled.evidenceCoverage, 0.5)

  const forbidden = evaluateRankedResults([7, 8], [{ memoryId: 7, grade: 1 }], { forbiddenMemoryIds: [7] })
  assert.deepEqual(forbidden.forbiddenReturnedIds, [7])
})

test('RRF explanation exposes per-arm rank and contribution without mutating inputs', () => {
  const arms = { keyword: [10, 20], semantic: [20, 10], graph: [10] }
  const before = JSON.stringify(arms)
  const rows = explainRrf(arms, [10, 20])
  assert.equal(rows[0].id, 10)
  assert.deepEqual(rows[0].ranks, { keyword: 1, semantic: 2, graph: 1 })
  assert.ok(rows[0].total > rows[1].total)
  assert.equal(JSON.stringify(arms), before)
})

test('rank stability reports overlap and exact ordering independently', () => {
  const result = compareRankStability([1, 2, 3], [2, 1, 4], { k: 3 })
  assert.equal(result.jaccard, 0.5)
  assert.equal(result.exactTopK, false)
})
