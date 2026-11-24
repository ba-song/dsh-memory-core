/**
 * Read-only provenance assessment for memory rows.
 *
 * This module deliberately does not change recall, ranking, decay, writes, or deletion.
 * A verified quote proves only that the stored quote occurs in the supplied source text;
 * it does not prove that the derived memory statement is itself true.
 */
const KNOWN_PROVENANCE = new Set([
  'verified',
  'derived',
  'no-overlap',
  'no-source',
  'manual-unverified',
  'degraded',
])

function parseMeta(value) {
  if (value && typeof value === 'object') return value
  try {
    const parsed = JSON.parse(String(value ?? '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Produce a conservative diagnostic. Never upgrades a row to "verified fact".
 *
 * @param {object} row SQLite memory row or equivalent
 * @returns {{
 *  provenance:string,
 *  quoteEvidence:string,
 *  sourceLocator:string,
 *  sourceTimestamp:boolean,
 *  sourceFile:boolean,
 *  confidence:number|null,
 *  status:string,
 *  gaps:string[]
 * }}
 */
export function assessMemoryProvenance(row = {}) {
  const meta = parseMeta(row.meta)
  const rawProvenance = String(meta.provenance ?? '').trim()
  const provenance = KNOWN_PROVENANCE.has(rawProvenance) ? rawProvenance : 'legacy-unknown'
  const quote = String(row.quote ?? '').trim()
  const sourceMsgId = String(row.source_msg_id ?? row.sourceMsgId ?? '').trim()
  const sourceTs = Number(row.source_ts ?? row.sourceTs ?? 0)
  const sourceFile = String(row.source_file ?? row.sourceFile ?? '').trim()
  const confidenceValue = Number(row.confidence)
  const confidence = Number.isFinite(confidenceValue) ? confidenceValue : null
  const status = String(row.status ?? 'unknown')

  const gaps = []
  if (!sourceMsgId) gaps.push('missing-source-message-key')
  if (!(Number.isFinite(sourceTs) && sourceTs > 0)) gaps.push('missing-source-timestamp')
  if (!sourceFile) gaps.push('missing-source-file')
  if (!quote) gaps.push('missing-verbatim-quote')
  if (provenance === 'legacy-unknown') gaps.push('missing-or-unknown-provenance-label')
  if (provenance === 'no-overlap') gaps.push('no-verbatim-overlap')
  if (provenance === 'no-source' || provenance === 'degraded' || provenance === 'manual-unverified') {
    gaps.push('source-text-not-verified')
  }
  if (status !== 'active') gaps.push('not-active')
  if (row.source_session_id || row.sourceSessionId) {
    // This field is not currently part of the memories schema; preserve it only as a
    // diagnostic signal for future schemas, without asserting host authenticity.
  } else {
    gaps.push('missing-explicit-source-session-id')
  }

  const quoteEvidence = provenance === 'verified' && quote
    ? 'exact-quote-checked'
    : provenance === 'derived' && quote
      ? 'quote-derived-from-source'
      : quote
        ? 'quote-present-unverified'
        : 'no-quote-evidence'

  return {
    provenance,
    quoteEvidence,
    sourceLocator: sourceMsgId ? 'message-key-present-not-session-authentication' : 'none',
    sourceTimestamp: Number.isFinite(sourceTs) && sourceTs > 0,
    sourceFile: Boolean(sourceFile),
    confidence,
    status,
    gaps,
  }
}
