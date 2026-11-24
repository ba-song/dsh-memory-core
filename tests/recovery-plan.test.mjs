import assert from 'node:assert/strict'
import { planMemoryRecovery } from '../lib/recovery/plan.js'

const supported = planMemoryRecovery({
  claim: '我们一起去看海',
  targetMemoryId: 12,
  evidence: [
    { id: 'a', kind: 'raw', locator: 'raw:1', access: 'allowed', relation: 'supports', independenceKey: 'session-a', excerpt: '那天我们去看海' },
    { id: 'b', kind: 'diary', locator: 'diary:1', access: 'allowed', relation: 'supports', independenceKey: 'diary-b', excerpt: '今天和主人去了海边' },
  ],
})
assert.equal(supported.outcome, 'supported')
assert.equal(supported.supportLevel, 'multiple_asserted_lineages')
assert.equal(supported.independenceAssessment, 'asserted_by_upstream_not_verified_by_planner')
assert.equal(supported.proposedOperation, 'review_add_or_restore_version')
assert.equal(supported.writesPerformed, false)

const singleLineage = planMemoryRecovery({
  claim: '单条证据',
  evidence: [{ id: 'one', access: 'allowed', relation: 'supports' }],
})
assert.equal(singleLineage.outcome, 'supported')
assert.equal(singleLineage.supportLevel, 'single_asserted_lineage')
assert.equal(singleLineage.evidenceCounts.independentSupportingLineages, 1)

const conflict = planMemoryRecovery({
  claim: '当时是周五',
  evidence: [
    { id: 'a', access: 'allowed', relation: 'supports', independenceKey: 's1' },
    { id: 'b', access: 'allowed', relation: 'contradicts', independenceKey: 's2' },
  ],
})
assert.equal(conflict.outcome, 'ambiguous')
assert.equal(conflict.proposedOperation, 'retain_ambiguity_and_request_context')

const denied = planMemoryRecovery({
  claim: '私密经历',
  evidence: [{ id: 'secret', kind: 'raw', locator: 'known-path', access: 'denied', relation: 'supports' }],
})
assert.equal(denied.failure, 'source_access_denied')
assert.equal(denied.evidence.length, 0)
assert.equal(denied.inaccessibleEvidence.length, 1)

const expired = planMemoryRecovery({
  claim: '旧经历',
  evidence: [{ id: 'old', access: 'expired', relation: 'supports' }],
})
assert.equal(expired.failure, 'source_expired_or_missing')
assert.equal(expired.outcome, 'insufficient_evidence')

const copied = planMemoryRecovery({
  claim: '复制摘要重复出现',
  evidence: [
    { id: 'a', access: 'allowed', relation: 'supports', independenceKey: 'origin' },
    { id: 'b', access: 'allowed', relation: 'supports', independenceKey: 'origin', copiedFrom: 'a' },
  ],
})
assert.equal(copied.evidenceCounts.independentSupportingLineages, 1)
assert.equal(copied.outcome, 'supported')
assert.equal(copied.supportLevel, 'single_asserted_lineage')

const copiedOnly = planMemoryRecovery({
  claim: '只有转述摘要',
  evidence: [
    { id: 'copy', access: 'allowed', relation: 'supports', independenceKey: 'origin', copiedFrom: 'source' },
  ],
})
assert.equal(copiedOnly.evidenceCounts.independentSupportingLineages, 0)
assert.equal(copiedOnly.outcome, 'insufficient_evidence')

const vague = planMemoryRecovery({
  claim: '那次经历',
  evidence: [{ id: 'v', access: 'allowed', relation: 'unclear', excerpt: '好像是夏天' }],
})
assert.equal(vague.outcome, 'ambiguous')
assert.ok(vague.questions.length)

const empty = planMemoryRecovery({ claim: '无证据', evidence: [] })
assert.equal(empty.outcome, 'insufficient_evidence')
assert.equal(empty.proposedOperation, 'no_repair_insufficient_evidence')
assert.equal(empty.writesPerformed, false)

const recalled = planMemoryRecovery({
  claim: '记忆没被召回',
  memory: { exists: true, retrievalMiss: true },
  evidence: [],
})
assert.equal(recalled.failure, 'recall_miss')

const input = Object.freeze({
  claim: '只读保证',
  evidence: Object.freeze([
    Object.freeze({ id: 'immutable', access: 'allowed', relation: 'supports', excerpt: '原始证据' }),
  ]),
})
const before = JSON.stringify(input)
const dryRun = planMemoryRecovery(input)
assert.equal(JSON.stringify(input), before)
assert.equal(dryRun.readOnly, true)
assert.equal(dryRun.writesPerformed, false)

console.log('recovery-plan: 10 scenarios passed')
