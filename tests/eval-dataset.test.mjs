import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sha256File, validateAnnotationDataset, verifySnapshotFingerprint } from '../lib/recall/eval-dataset.js'

const sourceQueries = [{ id: 'q1', query: '记得我们约定的事情吗' }]
const base = {
  datasetVersion: 'v1',
  annotationPolicyVersion: '1',
  codeCommit: null,
  databaseSnapshotSha256: null,
  embeddingModel: null,
  runParameters: {
    recallGateSemantic: 0.55, recallGateKeyword: 0.35, recallLimit: 5,
    injectionMinSemantic: 0.55, injectionMinKeywordOverlap: 0.35,
    injectionMaxItems: 3, injectionMaxChars: 200,
  },
  queries: [{
    id: 'q1', query: '记得我们约定的事情吗',
    scope: { level: 'owner', cwd: '/sdcard/DSHA/生活/数据/home' },
    asOf: null, relevant: [], forbiddenMemoryIds: [], annotator: '',
  }],
}

test('unlabelled annotation template is valid but reports no ground truth', () => {
  assert.deepEqual(validateAnnotationDataset(base, sourceQueries), {
    valid: true, queryAnnotations: 1, labelledQueries: 0, positiveLabels: 0,
  })
})

test('positive relevance labels require pinned code, snapshot, model and provenance', () => {
  const invalid = structuredClone(base)
  invalid.queries[0].relevant = [{ memoryId: 12, grade: 3, evidence: {} }]
  invalid.queries[0].annotator = 'owner'
  assert.throws(() => validateAnnotationDataset(invalid, sourceQueries), /codeCommit.*databaseSnapshotSha256.*embeddingModel/s)

  const valid = structuredClone(invalid)
  valid.codeCommit = 'a'.repeat(40)
  valid.databaseSnapshotSha256 = 'b'.repeat(64)
  valid.embeddingModel = 'bge-small-zh sha256:example'
  valid.queries[0].relevant[0].evidence = { rawId: 123 }
  assert.deepEqual(validateAnnotationDataset(valid, sourceQueries), {
    valid: true, queryAnnotations: 1, labelledQueries: 1, positiveLabels: 1,
  })
})

test('duplicate labels, conflicting forbidden IDs and query text drift are rejected', () => {
  const invalid = structuredClone(base)
  invalid.queries[0].query = '不同问题'
  invalid.queries[0].relevant = [
    { memoryId: 12, grade: 0, evidence: {} },
    { memoryId: 12, grade: 2, evidence: { rawId: 123 } },
  ]
  invalid.queries[0].forbiddenMemoryIds = [12]
  assert.throws(() => validateAnnotationDataset(invalid, sourceQueries), /query text mismatch.*duplicate relevant.*both relevant and forbidden/s)
})

test('external and group annotations require exact derived identity labels', () => {
  const invalid = structuredClone(base)
  invalid.queries[0].scope = { level: 'external', cwd: '/sdcard/DSHA/渠道/qq/100000001' }
  assert.throws(() => validateAnnotationDataset(invalid, sourceQueries), /external scope requires contactId/)
})

test('checked-in annotation template matches the evaluator query set', () => {
  const dataset = JSON.parse(readFileSync(new URL('../scripts/m3-eval-annotations.template.json', import.meta.url), 'utf8'))
  const queries = JSON.parse(readFileSync(new URL('../scripts/m3-eval-queries.json', import.meta.url), 'utf8'))
  assert.deepEqual(validateAnnotationDataset(dataset, queries), {
    valid: true, queryAnnotations: queries.length, labelledQueries: 0, positiveLabels: 0,
  })
})

test('forbidden-only safety labels do not count as relevance-labelled queries', () => {
  const dataset = structuredClone(base)
  dataset.queries[0].forbiddenMemoryIds = [77]
  assert.deepEqual(validateAnnotationDataset(dataset, sourceQueries), {
    valid: true, queryAnnotations: 1, labelledQueries: 0, positiveLabels: 0,
  })
})

test('database snapshot fingerprint is verified against actual file bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-eval-snapshot-'))
  const file = join(dir, 'memory.snapshot.db')
  try {
    writeFileSync(file, 'immutable-snapshot')
    const actual = await sha256File(file)
    assert.deepEqual(verifySnapshotFingerprint(actual, actual), {
      pinned: true, expected: actual, actual, matches: true,
    })
    assert.throws(() => verifySnapshotFingerprint('a'.repeat(64), actual), /SHA-256 mismatch/)
    assert.equal(verifySnapshotFingerprint(null, actual).pinned, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
