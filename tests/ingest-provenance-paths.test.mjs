import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { ingestExplicit } from '../lib/ingest/explicit.js'
import { ingestClassified } from '../lib/ingest/p4.js'
import { applyAll } from '../lib/ingest/migrate.js'
import { assessMemoryProvenance } from '../lib/ingest/provenance-audit.js'

const dir = `/tmp/dy-ingest-provenance-paths-${process.pid}`
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)

// Explicit "remember" path: quote is derived from the current source text;
// source message key remains a locator, not a separate authenticated session id.
const explicitId = await ingestExplicit(db, {
  sessionId: 'fixture-session',
  seq: 11,
  text: '记住：主人喜欢看海',
  at: 1763942400000,
  speaker: 'fixture-owner',
})
assert.ok(explicitId)
const explicit = db.prepare('SELECT * FROM memories WHERE id=?').get(explicitId)
assert.equal(JSON.parse(explicit.meta).provenance, 'derived')
assert.ok(explicit.quote)
assert.equal(explicit.source_msg_id, 'explicit:fixture-session:11')
assert.equal(Object.hasOwn(explicit, 'source_session_id'), false)
const explicitAssessment = assessMemoryProvenance(explicit)
assert.equal(explicitAssessment.provenance, 'derived')
assert.equal(explicitAssessment.sourceLocator, 'message-key-present-not-session-authentication')
assert.ok(explicitAssessment.gaps.includes('missing-explicit-source-session-id'))

// P4 rule path: candidate and source text share a verbatim segment;
// the common ingestCandidate path applies the provenance gate.
const p4 = await ingestClassified(db, {
  text: '主人喜欢吃海鲜大餐',
  sourceKey: 'session-fixture:12',
  sourceTs: 1763942401000,
  speaker: 'fixture-owner',
  embed: async () => [null],
  vectors: new Map(),
})
assert.equal(p4.action, 'insert')
const p4Row = db.prepare('SELECT * FROM memories WHERE id=?').get(p4.id)
assert.equal(JSON.parse(p4Row.meta).provenance, 'derived')
assert.ok(p4Row.quote)

// Offline migration: a synthetic source key and source file do not establish
// verbatim provenance. Missing provenance must remain legacy-unknown.
const previousOwnerQq = process.env.OWNER_QQ
process.env.OWNER_QQ = '1000000001'
const migrated = await applyAll(db, {
  facts: [{ kind: 'fact', text: '迁移测试事实', sourceKey: 'facts:fixture', sourceFile: '/fixture/事实卡.md' }],
  todos: [],
  episodes: [],
  handoffs: [],
}, () => {})
assert.equal(migrated.inserted, 1)
const migratedRow = db.prepare("SELECT * FROM memories WHERE json_extract(meta,'$.sourceKey')='facts:fixture'").get()
assert.ok(migratedRow)
assert.equal(JSON.parse(migratedRow.meta).provenance, undefined)
assert.equal(assessMemoryProvenance(migratedRow).provenance, 'legacy-unknown')
assert.ok(assessMemoryProvenance(migratedRow).gaps.includes('missing-or-unknown-provenance-label'))
if (previousOwnerQq === undefined) delete process.env.OWNER_QQ
else process.env.OWNER_QQ = previousOwnerQq

// Legacy/manual insert without provenanceMode must not be silently promoted.
const legacyId = await insertMemory(db, {
  kind: 'fact',
  text: '没有来源门禁的手工写入',
  sourceMsgId: 'manual:fixture',
  sourceTs: 1763942402000,
  sourceFile: '/fixture/manual.md',
  meta: { sourceKey: 'manual:fixture' },
})
const legacyRow = db.prepare('SELECT * FROM memories WHERE id=?').get(legacyId)
assert.equal(JSON.parse(legacyRow.meta).provenance, undefined)
assert.equal(assessMemoryProvenance(legacyRow).provenance, 'legacy-unknown')

// A correction marker or synthetic locator alone is not source evidence.
// No correction API is present in this fixture: this asserts the conservative
// diagnostic contract rather than pretending a correction path was exercised.
const correctionLike = assessMemoryProvenance({
  source_msg_id: 'correction:fixture',
  source_ts: 1763942403000,
  source_file: '',
  quote: '',
  confidence: 1,
  status: 'active',
  meta: JSON.stringify({ correction: true }),
})
assert.equal(correctionLike.provenance, 'legacy-unknown')
assert.equal(correctionLike.quoteEvidence, 'no-quote-evidence')
assert.ok(correctionLike.gaps.includes('missing-verbatim-quote'))

db.close()
rmSync(dir, { recursive: true, force: true })

console.log(JSON.stringify({
  ok: true,
  test: 'ingest-provenance-paths',
  explicit: explicitAssessment.provenance,
  p4: JSON.parse(p4Row.meta).provenance,
  migration: 'legacy-unknown',
  manualWithoutGate: 'legacy-unknown',
}))
