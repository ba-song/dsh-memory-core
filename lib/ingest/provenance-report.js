import { assessMemoryProvenance } from './provenance-audit.js'

/**
 * Aggregate-only, read-only provenance report.
 * Does not expose memory text, quote contents, source locators, or mutate rows.
 */
export function summarizeMemoryProvenance(rows = []) {
  const counts = {
    total: 0,
    byProvenance: {},
    byStatus: {},
    byQuoteEvidence: {},
    gaps: {},
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    const assessment = assessMemoryProvenance(row)
    counts.total += 1
    counts.byProvenance[assessment.provenance] = (counts.byProvenance[assessment.provenance] ?? 0) + 1
    counts.byStatus[assessment.status] = (counts.byStatus[assessment.status] ?? 0) + 1
    counts.byQuoteEvidence[assessment.quoteEvidence] = (counts.byQuoteEvidence[assessment.quoteEvidence] ?? 0) + 1
    for (const gap of assessment.gaps) counts.gaps[gap] = (counts.gaps[gap] ?? 0) + 1
  }

  return {
    mode: 'read-only-aggregate',
    readOnly: true,
    textExposed: false,
    total: counts.total,
    byProvenance: counts.byProvenance,
    byStatus: counts.byStatus,
    byQuoteEvidence: counts.byQuoteEvidence,
    gaps: counts.gaps,
  }
}
