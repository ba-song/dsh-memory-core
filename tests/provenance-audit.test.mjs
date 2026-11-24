import assert from 'node:assert/strict'
import { assessMemoryProvenance } from '../lib/ingest/provenance-audit.js'

// A checked quote is evidence of textual overlap, not proof that the memory claim is true.
{
  const result = assessMemoryProvenance({
    quote: '我喜欢吃辣',
    source_msg_id: 'p4:session-abc:42',
    source_ts: 1700000000000,
    source_file: '2023-11-14/s-session.md',
    confidence: 0.7,
    status: 'active',
    meta: JSON.stringify({ provenance: 'verified' }),
  })
  assert.equal(result.provenance, 'verified')
  assert.equal(result.quoteEvidence, 'exact-quote-checked')
  assert.equal(result.sourceLocator, 'message-key-present-not-session-authentication')
  assert.ok(result.gaps.includes('missing-explicit-source-session-id'))
}

// Legacy rows must remain explicitly unknown; a quote alone cannot upgrade them.
{
  const result = assessMemoryProvenance({
    quote: '主人喜欢看海',
    source_msg_id: 'explicit:s1:7',
    confidence: 0.6,
    status: 'active',
    meta: '{}',
  })
  assert.equal(result.provenance, 'legacy-unknown')
  assert.equal(result.quoteEvidence, 'quote-present-unverified')
  assert.ok(result.gaps.includes('missing-source-timestamp'))
  assert.ok(result.gaps.includes('missing-source-file'))
  assert.ok(result.gaps.includes('missing-or-unknown-provenance-label'))
}

// Model paraphrase with no overlap remains visible as a provenance gap.
{
  const result = assessMemoryProvenance({
    source_msg_id: 'q:paraphrase',
    source_ts: 1700000000000,
    meta: JSON.stringify({ provenance: 'no-overlap' }),
    status: 'active',
  })
  assert.equal(result.quoteEvidence, 'no-quote-evidence')
  assert.ok(result.gaps.includes('no-verbatim-overlap'))
}

// Non-active states are surfaced, never normalized into active.
{
  const result = assessMemoryProvenance({
    meta: JSON.stringify({ provenance: 'degraded' }),
    status: 'merged',
  })
  assert.equal(result.status, 'merged')
  assert.ok(result.gaps.includes('not-active'))
  assert.ok(result.gaps.includes('source-text-not-verified'))
}

// Malformed metadata is treated as unknown, not trusted.
{
  const result = assessMemoryProvenance({ meta: '{bad json', status: 'active' })
  assert.equal(result.provenance, 'legacy-unknown')
  assert.ok(result.gaps.includes('missing-or-unknown-provenance-label'))
}

console.log(JSON.stringify({ ok: true, test: 'provenance-audit' }))
