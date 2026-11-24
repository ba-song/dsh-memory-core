/**
 * Pure, read-only assessment of write-evidence dimensions.
 *
 * This module performs no I/O and is deliberately not wired into memory writes.
 * A hostEventProof value must be supplied by a trusted adapter; caller claims alone
 * can never establish host-backed provenance.
 */

const SOURCE_AUTH = new Set(['host_event', 'caller_supplied', 'migrated_file', 'tool_output', 'unknown'])
const ROLES = new Set(['user', 'assistant', 'tool', 'system_context', 'unknown'])
const LOCATORS = new Set(['present_unverified', 'resolved', 'missing', 'inaccessible', 'expired', 'tombstoned'])
const QUOTES = new Set(['exact', 'derived', 'mismatch', 'absent', 'not_checked'])
const CONFIRMATIONS = new Set(['unconfirmed', 'user_confirmed', 'disputed', 'withdrawn', 'not_applicable'])
const LINEAGES = new Set(['single_lineage', 'copied_same_lineage', 'multiple_lineages_asserted', 'unknown'])
const ACCESS = new Set(['allowed', 'denied', 'revoked', 'expired', 'tombstoned', 'unknown'])
// Content certainty is independent from source authenticity and quote matching.
// This evaluator can preserve an explicit uncertainty marker, but cannot prove certainty.
const CONTENT_CERTAINTY = new Set(['uncertain', 'not_assessed', 'unknown'])

const enumValue = (value, allowed, fallback) => allowed.has(value) ? value : fallback
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0

/**
 * @param {object} input Untrusted evidence description plus adapter-supplied proof.
 * @returns {object} Independent dimensions, gaps, warnings and conflicts.
 */
export function assessWriteEvidence(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const origin = value.origin && typeof value.origin === 'object' ? value.origin : {}
  const proof = value.hostEventProof && typeof value.hostEventProof === 'object'
    ? value.hostEventProof : null

  const declaredOrigin = enumValue(origin.kind, SOURCE_AUTH, 'unknown')
  const sourceAuth = proof?.verified === true && proof.issuer === 'trusted_host_adapter'
    ? 'host_event_backed'
    : declaredOrigin === 'caller_supplied'
      ? 'caller_supplied'
      : declaredOrigin === 'migrated_file'
        ? 'migrated_unverified'
        : 'unknown'

  const sourceRole = enumValue(value.sourceRole, ROLES, 'unknown')
  const locatorInput = value.locator && typeof value.locator === 'object' ? value.locator : {}
  const locator = enumValue(locatorInput.state,
    new Set(LOCATORS),
    nonEmpty(locatorInput.ref) ? 'present_unverified' : 'missing')
  const quote = enumValue(value.quoteState, QUOTES, 'not_checked')
  const confirmation = enumValue(value.claimConfirmation, CONFIRMATIONS, 'unconfirmed')
  const lineage = enumValue(value.lineage, LINEAGES, 'unknown')
  const access = enumValue(value.access, ACCESS, 'unknown')
  const contentCertainty = enumValue(value.contentCertainty, CONTENT_CERTAINTY, 'unknown')

  const gaps = []
  const warnings = []
  const conflicts = []

  if (declaredOrigin === 'host_event' && sourceAuth !== 'host_event_backed') {
    warnings.push('self_asserted_host_origin')
  }
  if (sourceAuth === 'caller_supplied') warnings.push('caller_text_not_host_authenticated')
  if (declaredOrigin === 'tool_output' || sourceRole === 'tool') warnings.push('tool_output_not_user_statement')
  if (declaredOrigin === 'unknown') gaps.push('source_kind_unknown')
  if (locator === 'present_unverified') gaps.push('locator_not_resolved')
  if (locator === 'missing') gaps.push('source_locator_missing')
  if (quote === 'not_checked') gaps.push('quote_not_checked')
  if (quote === 'absent') gaps.push('verbatim_quote_absent')
  if (confirmation === 'unconfirmed') gaps.push('claim_unconfirmed')
  if (lineage === 'unknown') gaps.push('lineage_unknown')
  if (access === 'unknown') gaps.push('access_state_unknown')
  if (contentCertainty === 'unknown') gaps.push('content_certainty_unknown')
  if (contentCertainty === 'not_assessed') gaps.push('content_certainty_not_assessed')
  if (contentCertainty === 'uncertain') warnings.push('content_uncertainty_preserved')

  if (quote === 'exact' && confirmation === 'unconfirmed') warnings.push('exact_quote_does_not_confirm_claim')
  if (quote === 'derived' && confirmation === 'user_confirmed') warnings.push('confirm_derived_claim_not_source_quote')
  if (quote === 'mismatch') conflicts.push('quote_source_mismatch')
  if (confirmation === 'withdrawn') warnings.push('confirmation_withdrawn')
  if (confirmation === 'disputed') conflicts.push('claim_disputed')
  if (lineage === 'multiple_lineages_asserted') warnings.push('lineage_independence_not_authenticated')
  if (lineage === 'copied_same_lineage') warnings.push('copies_are_one_lineage')
  if (locator === 'tombstoned' || access === 'tombstoned') warnings.push('tombstoned_source_not_readable')
  if (access === 'denied' || access === 'revoked' || access === 'expired' || access === 'tombstoned' || locator === 'inaccessible' || locator === 'expired' || locator === 'tombstoned') {
    warnings.push('current_access_not_allowed')
  }
  if (sourceRole === 'assistant') warnings.push('assistant_statement_not_user_statement')
  if (sourceRole === 'system_context') warnings.push('system_context_not_user_experience_evidence')
  if (sourceRole === 'unknown') gaps.push('author_role_unknown')

  return {
    sourceKind: declaredOrigin,
    sourceAuth,
    sourceRole,
    locator,
    quote,
    claimConfirmation: confirmation,
    lineage,
    access,
    contentCertainty,
    gaps: [...new Set(gaps)],
    warnings: [...new Set(warnings)],
    conflicts: [...new Set(conflicts)],
  }
}
