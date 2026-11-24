import assert from 'node:assert/strict'
import { summarizeMemoryProvenance } from '../lib/ingest/provenance-report.js'

const rows = [
  {
    quote: '我喜欢吃辣',
    source_msg_id: 'msg:1',
    source_ts: 1700000000000,
    source_file: 'fixture-session.md',
    status: 'active',
    meta: JSON.stringify({ provenance: 'verified' }),
  },
  {
    quote: '',
    source_msg_id: 'msg:2',
    source_ts: 1700000000000,
    status: 'active',
    meta: JSON.stringify({ provenance: 'no-overlap' }),
  },
  {
    quote: '旧记录中的原句',
    status: 'active',
    meta: '{}',
  },
  {
    quote: '迁移记录',
    status: 'archived',
    meta: JSON.stringify({ provenance: 'degraded' }),
  },
]

const before = JSON.stringify(rows)
const report = summarizeMemoryProvenance(rows)

assert.equal(report.mode, 'read-only-aggregate')
assert.equal(report.readOnly, true)
assert.equal(report.textExposed, false)
assert.equal(report.total, 4)
assert.deepEqual(report.byProvenance, {
  verified: 1,
  'no-overlap': 1,
  'legacy-unknown': 1,
  degraded: 1,
})
assert.deepEqual(report.byStatus, { active: 3, archived: 1 })
assert.equal(report.byQuoteEvidence['exact-quote-checked'], 1)
assert.equal(report.byQuoteEvidence['no-quote-evidence'], 1)
assert.equal(report.byQuoteEvidence['quote-present-unverified'], 2)
assert.equal(report.gaps['no-verbatim-overlap'], 1)
assert.equal(report.gaps['missing-or-unknown-provenance-label'], 1)
assert.equal(report.gaps['not-active'], 1)
assert.equal(JSON.stringify(rows), before, 'diagnostic must not mutate source rows')
assert.equal(JSON.stringify(report).includes('我喜欢吃辣'), false, 'report must not expose memory text')
assert.equal(JSON.stringify(report).includes('fixture-session.md'), false, 'report must not expose source locators')

console.log(JSON.stringify({ ok: true, test: 'provenance-report', total: report.total }))
