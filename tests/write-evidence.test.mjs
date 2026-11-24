import assert from 'node:assert/strict'
import { assessWriteEvidence } from '../lib/ingest/write-evidence.js'

const assess = (input) => assessWriteEvidence(input)

// T-01 caller cannot self-assert Host origin.
{
  const r = assess({ origin: { kind: 'host_event' }, sourceRole: 'user', quoteState: 'exact' })
  assert.equal(r.sourceKind, 'host_event')
  assert.equal(r.sourceAuth, 'unknown')
  assert.ok(r.warnings.includes('self_asserted_host_origin'))
}

// T-02 exact quote does not establish claim truth/confirmation.
{
  const r = assess({ origin: { kind: 'host_event' }, hostEventProof: { verified: true, issuer: 'trusted_host_adapter' }, sourceRole: 'user', quoteState: 'exact' })
  assert.equal(r.sourceAuth, 'host_event_proof_claimed')
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
  assert.equal(r.sourceKind, 'tool_output')
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
  assert.equal(r.sourceAuth, 'host_event_proof_claimed')
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
  assert.equal(r.sourceAuth, 'host_event_proof_claimed')
  assert.equal(r.claimConfirmation, 'unconfirmed')
  assert.equal(r.contentCertainty, 'uncertain')
  assert.ok(r.warnings.includes('content_uncertainty_preserved'))
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
  assert.equal(empty.sourceKind, 'unknown')
  assert.equal(empty.sourceAuth, 'unknown')
  assert.equal(empty.sourceRole, 'unknown')
  assert.equal(empty.locator, 'missing')
  assert.equal(empty.quote, 'not_checked')
  assert.equal(empty.access, 'unknown')
  assert.equal(empty.disclosureConsent, 'unknown')
  assert.ok(empty.gaps.includes('disclosure_consent_missing_or_unknown'))
  assert.equal(empty.contentCertainty, 'unknown')
  assert.ok(empty.gaps.includes('content_certainty_unknown'))

  const withExact = assess({ quoteState: 'exact', claimConfirmation: 'unconfirmed' })
  const withoutExact = assess({ quoteState: 'mismatch', claimConfirmation: 'unconfirmed' })
  assert.equal(withExact.claimConfirmation, withoutExact.claimConfirmation)

  const uncertainSource = assess({ origin: { kind: 'host_event' }, hostEventProof: { verified: true, issuer: 'trusted_host_adapter' }, contentCertainty: 'uncertain' })
  const unmarkedSource = assess({ origin: { kind: 'host_event' }, hostEventProof: { verified: true, issuer: 'trusted_host_adapter' } })
  assert.equal(uncertainSource.sourceAuth, unmarkedSource.sourceAuth)
  assert.equal(uncertainSource.sourceKind, unmarkedSource.sourceKind)
  assert.equal(uncertainSource.contentCertainty, 'uncertain')
  assert.equal(unmarkedSource.contentCertainty, 'unknown')

  const withoutProof = assess({ origin: { kind: 'host_event' } })
  const withProof = assess({ origin: { kind: 'host_event' }, hostEventProof: { verified: true, issuer: 'trusted_host_adapter' } })
  assert.equal(withoutProof.sourceAuth, 'unknown')
  assert.equal(withProof.sourceAuth, 'host_event_proof_claimed')
  assert.ok(withProof.warnings.includes('host_event_proof_shape_not_verified_by_pure_function'))
}

console.log(JSON.stringify({ ok: true, test: 'write-evidence', cases: 24 }))


// T-13 proof-shaped caller input cannot authenticate a non-Host origin.
{
  const r = assess({
    origin: { kind: 'caller_supplied' },
    hostEventProof: { verified: true, issuer: 'trusted_host_adapter' },
  })
  assert.equal(r.sourceKind, 'caller_supplied')
  assert.equal(r.sourceAuth, 'caller_supplied')
  assert.ok(r.warnings.includes('host_event_proof_ignored_for_non_host_origin'))
}

// T-14 the pure evaluator never claims to verify the adapter proof itself.
{
  const r = assess({
    origin: { kind: 'host_event' },
    hostEventProof: { verified: true, issuer: 'trusted_host_adapter' },
  })
  assert.equal(r.sourceAuth, 'host_event_proof_claimed')
  assert.ok(r.warnings.includes('host_event_proof_shape_not_verified_by_pure_function'))
}

// T-15 malformed proof and invalid enum values fail closed.
{
  const r = assess({
    origin: { kind: 'host_event' },
    hostEventProof: ['verified', 'trusted_host_adapter'],
    sourceRole: 'administrator',
    quoteState: 'perfect',
    access: 'granted',
    contentCertainty: 'certain',
  })
  assert.equal(r.sourceAuth, 'unknown')
  assert.equal(r.sourceRole, 'unknown')
  assert.equal(r.quote, 'not_checked')
  assert.equal(r.access, 'unknown')
  assert.equal(r.contentCertainty, 'unknown')
}


// T-16 owner/access allowance does not imply cross-context disclosure consent.
{
  const r = assess({ access: 'allowed' })
  assert.equal(r.access, 'allowed')
  assert.equal(r.disclosureConsent, 'unknown')
  assert.ok(r.gaps.includes('disclosure_consent_missing_or_unknown'))
  assert.ok(!r.warnings.includes('cross_context_disclosure_not_authorized'))
}

// T-17 explicit revoked disclosure consent remains revoked even if access is allowed.
{
  const r = assess({ access: 'allowed', disclosureConsent: 'revoked' })
  assert.equal(r.access, 'allowed')
  assert.equal(r.disclosureConsent, 'revoked')
  assert.ok(r.warnings.includes('cross_context_disclosure_not_authorized'))
}

// T-18 disclosure consent cannot override denied source access.
{
  const r = assess({ access: 'denied', disclosureConsent: 'granted' })
  assert.equal(r.access, 'denied')
  assert.equal(r.disclosureConsent, 'granted')
  assert.ok(r.warnings.includes('current_access_not_allowed'))
}


// T-19 invalid disclosure consent values fail closed.
{
  for (const value of ['approved', 'true', 1, {}, [], 'GRANTED']) {
    const r = assess({ access: 'allowed', disclosureConsent: value })
    assert.equal(r.disclosureConsent, 'unknown')
    assert.ok(r.gaps.includes('disclosure_consent_missing_or_unknown'))
  }
}

// T-20 null and empty disclosure consent do not become grants.
{
  for (const value of [null, '', '   ', false]) {
    const r = assess({ access: 'allowed', disclosureConsent: value })
    assert.notEqual(r.disclosureConsent, 'granted')
    assert.ok(r.gaps.includes('disclosure_consent_missing_or_unknown'))
  }
}

// T-21 every non-granted disclosure state remains distinct and non-authorizing.
{
  for (const value of ['denied', 'revoked', 'expired', 'missing', 'unknown']) {
    const r = assess({ access: 'allowed', disclosureConsent: value })
    assert.equal(r.disclosureConsent, value)
    assert.notEqual(r.disclosureConsent, 'granted')
  }
}

// T-22 explicit grant never repairs an unknown/denied source access state.
{
  for (const value of ['unknown', 'denied', 'revoked', 'expired', 'tombstoned']) {
    const r = assess({ access: value, disclosureConsent: 'granted' })
    assert.equal(r.access, value)
    assert.equal(r.disclosureConsent, 'granted')
    if (value !== 'unknown') assert.ok(r.warnings.includes('current_access_not_allowed'))
    else assert.ok(r.gaps.includes('access_state_unknown'))
  }
}

// T-23 consent changes cannot mutate source authenticity, quote, or claim confirmation.
{
  const base = { origin: { kind: 'caller_supplied' }, quoteState: 'exact', claimConfirmation: 'unconfirmed' }
  const withoutConsent = assess(base)
  const withConsent = assess({ ...base, disclosureConsent: 'granted' })
  assert.equal(withConsent.sourceAuth, withoutConsent.sourceAuth)
  assert.equal(withConsent.quote, withoutConsent.quote)
  assert.equal(withConsent.claimConfirmation, withoutConsent.claimConfirmation)
}

// T-24 access changes cannot manufacture disclosure consent.
{
  for (const access of ['allowed', 'denied', 'revoked', 'expired', 'tombstoned', 'unknown']) {
    const r = assess({ access })
    assert.equal(r.disclosureConsent, 'unknown')
  }
}
