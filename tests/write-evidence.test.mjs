import assert from 'node:assert/strict'
import { assessWriteEvidence } from '../lib/ingest/write-evidence.js'

const assess = (input) => assessWriteEvidence(input)

// T-01 caller cannot self-assert Host origin.
{
  const r = assess({ origin: { kind: 'host_event' }, sourceRole: 'user', quoteState: 'exact' })
  assert.equal(r.sourceAuth, 'unknown')
  assert.ok(r.warnings.includes('self_asserted_host_origin'))
}

// T-02 exact quote does not establish claim truth/confirmation.
{
  const r = assess({ origin: { kind: 'host_event' }, hostEventProof: { verified: true, issuer: 'trusted_host_adapter' }, sourceRole: 'user', quoteState: 'exact' })
  assert.equal(r.sourceAuth, 'host_event_backed')
  assert.equal(r.claimConfirmation, 'unconfirmed')
  assert.ok(r.warnings.includes('exact_quote_does_not_confirm_claim'))
  assert.equal('objectivelyVerified' in r, false)
}

// T-03 assistant-authored statement stays assistant-authored.
{
  const r = assess({ origin: { kind: 'host_event' }, hostEventProof: { verified: true, issuer: 'trusted_host_adapter' }, sourceRole: 'assistant', quoteState: 'exact' })
  assert.equal(r.sourceRole, 'assistant')
  assert.ok(r.warnings.includes('assistant_statement_not_user_statement'))
}

// T-04 tool output is not a user statement.
{
  const r = assess({ origin: { kind: 'tool_output' }, sourceRole: 'tool', quoteState: 'exact' })
  assert.equal(r.sourceAuth, 'unknown')
  assert.ok(r.warnings.includes('tool_output_not_user_statement'))
}

// T-05 locator string is not resolution evidence.
{
  const r = assess({ locator: { ref: 'archive/2026/11/24.md' } })
  assert.equal(r.locator, 'present_unverified')
  assert.ok(r.gaps.includes('locator_not_resolved'))
}

// T-06 correction/dispute does not confirm the opposite proposition.
{
  const r = assess({ claimConfirmation: 'disputed' })
  assert.equal(r.claimConfirmation, 'disputed')
  assert.ok(r.conflicts.includes('claim_disputed'))
  assert.notEqual(r.claimConfirmation, 'user_confirmed')
}

// T-07 copies with shared lineage are not independent witnesses.
{
  const r = assess({ lineage: 'copied_same_lineage' })
  assert.equal(r.lineage, 'copied_same_lineage')
  assert.ok(r.warnings.includes('copies_are_one_lineage'))
}

// T-08 observed Host session does not imply owner auth or consent.
{
  const r = assess({ sessionObserved: true, origin: { kind: 'host_event' } })
  assert.equal(r.sourceAuth, 'unknown')
  assert.equal(r.access, 'unknown')
  assert.ok(r.gaps.includes('access_state_unknown'))
}

// T-09 authentic source with revoked access remains inaccessible.
{
  const r = assess({ origin: { kind: 'host_event' }, hostEventProof: { verified: true, issuer: 'trusted_host_adapter' }, access: 'revoked', quoteState: 'exact' })
  assert.equal(r.sourceAuth, 'host_event_backed')
  assert.equal(r.access, 'revoked')
  assert.ok(r.warnings.includes('current_access_not_allowed'))
}

// T-10 withdrawn confirmation is not active confirmation.
{
  const r = assess({ claimConfirmation: 'withdrawn', quoteState: 'exact' })
  assert.equal(r.claimConfirmation, 'withdrawn')
  assert.ok(r.warnings.includes('confirmation_withdrawn'))
}

// T-11 uncertainty in the content is not erased by source authenticity.
{
  const r = assess({ origin: { kind: 'host_event' }, hostEventProof: { verified: true, issuer: 'trusted_host_adapter' }, sourceRole: 'user', quoteState: 'exact', contentCertainty: 'uncertain' })
  assert.equal(r.sourceAuth, 'host_event_backed')
  assert.equal(r.claimConfirmation, 'unconfirmed')
}

// T-12 contradictory sources remain a conflict; no automatic winner.
{
  const r = assess({ claimConfirmation: 'disputed', lineage: 'multiple_lineages_asserted' })
  assert.ok(r.conflicts.includes('claim_disputed'))
  assert.ok(r.warnings.includes('lineage_independence_not_authenticated'))
}

// Fail-closed defaults and orthogonality properties.
{
  const empty = assess(null)
  assert.equal(empty.sourceAuth, 'unknown')
  assert.equal(empty.sourceRole, 'unknown')
  assert.equal(empty.locator, 'missing')
  assert.equal(empty.quote, 'not_checked')
  assert.equal(empty.access, 'unknown')

  const withExact = assess({ quoteState: 'exact', claimConfirmation: 'unconfirmed' })
  const withoutExact = assess({ quoteState: 'mismatch', claimConfirmation: 'unconfirmed' })
  assert.equal(withExact.claimConfirmation, withoutExact.claimConfirmation)

  const withoutProof = assess({ origin: { kind: 'host_event' } })
  const withProof = assess({ origin: { kind: 'host_event' }, hostEventProof: { verified: true, issuer: 'trusted_host_adapter' } })
  assert.equal(withoutProof.sourceAuth, 'unknown')
  assert.equal(withProof.sourceAuth, 'host_event_backed')
}

console.log(JSON.stringify({ ok: true, test: 'write-evidence', cases: 12 }))
