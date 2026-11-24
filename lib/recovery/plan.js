/**
 * Evidence-first, read-only memory recovery planner (Q149).
 *
 * This module performs no I/O and has no store/host integration. Callers must obtain
 * evidence through existing authorization boundaries before passing it here.
 * It emits a proposal only; it never mutates memory, archive, diary, or persona state.
 *
 * IMPORTANT: independenceKey/copiedFrom are trusted-adapter assertions. This pure
 * planner cannot authenticate or independently verify provenance relationships.
 */

const OUTCOMES = new Set(['supported', 'contradicted', 'ambiguous', 'insufficient_evidence'])
const ACCESS = new Set(['allowed', 'denied', 'missing', 'expired'])

function clean(value) { return String(value ?? '').trim() }
function safeNumber(value) {
  try {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  } catch {
    return null
  }
}
function normalizeEvidence(item, index) {
  const access = ACCESS.has(item?.access) ? item.access : 'missing'
  const kind = clean(item?.kind) || 'unknown'
  const relation = ['supports', 'contradicts', 'context', 'unclear'].includes(item?.relation)
    ? item.relation : 'unclear'
  return {
    id: clean(item?.id) || `evidence-${index + 1}`,
    kind,
    locator: clean(item?.locator),
    at: safeNumber(item?.at),
    excerpt: clean(item?.excerpt),
    relation,
    access,
    // These are assertions from a trusted upstream adapter, not verified here.
    independenceKey: clean(item?.independenceKey),
    copiedFrom: clean(item?.copiedFrom),
  }
}

function classifyFailure(evidence, memory = {}) {
  if (evidence.some((x) => x.access === 'denied')) return 'source_access_denied'
  if (evidence.some((x) => x.access === 'expired' || x.access === 'missing')) {
    if (!evidence.some((x) => x.access === 'allowed')) return 'source_expired_or_missing'
  }
  if (memory.provenanceIncomplete) return 'provenance_incomplete'
  if (memory.retrievalMiss && memory.exists) return 'recall_miss'
  if (memory.notIngested && evidence.some((x) => x.access === 'allowed')) return 'not_ingested'
  if (memory.extractionLoss) return 'extraction_loss'
  if (memory.lifecycleHidden) return 'decay_or_visibility'
  if (memory.possibleOverwrite) return 'possible_overwrite'
  if (memory.conflict) return 'conflict_unresolved'
  return 'unknown'
}

/**
 * @param {object} input
 * @param {string} input.claim User-described or stored claim under review
 * @param {object[]} input.evidence Evidence already discovered by authorized adapters
 * @param {object} [input.memory] Non-sensitive diagnostic flags about the target memory
 * @param {boolean} [input.userConfirmed] Whether the user explicitly confirmed this exact claim
 */
export function planMemoryRecovery(input = {}) {
  const claim = clean(input.claim)
  const evidence = (Array.isArray(input.evidence) ? input.evidence : []).map(normalizeEvidence)
  const readable = evidence.filter((x) => x.access === 'allowed')
  const inaccessible = evidence.filter((x) => x.access !== 'allowed')
  const support = readable.filter((x) => x.relation === 'supports')
  const oppose = readable.filter((x) => x.relation === 'contradicts')
  const unclear = readable.filter((x) => x.relation === 'unclear' || x.relation === 'context')

  // Copied excerpts do not add a lineage. Lineage identity is trusted-adapter input;
  // this planner reports the assertion but cannot prove that the adapter is correct.
  const independentSupport = new Set(support.filter((x) => !x.copiedFrom)
    .map((x) => x.independenceKey || x.id).filter(Boolean))
  const independentOppose = new Set(oppose.filter((x) => !x.copiedFrom)
    .map((x) => x.independenceKey || x.id).filter(Boolean))

  let outcome = 'insufficient_evidence'
  if (support.length && oppose.length) outcome = 'ambiguous'
  else if (oppose.length) outcome = 'contradicted'
  else if (support.length && independentSupport.size >= 1) outcome = 'supported'
  else if (unclear.length) outcome = 'ambiguous'

  const failure = classifyFailure(evidence, input.memory ?? {})
  const questions = []
  if (outcome === 'ambiguous') questions.push('这些来源是否描述同一件事？是否有你愿意补充的背景？')
  if (outcome === 'insufficient_evidence' && !readable.length) {
    questions.push('你是否记得大致时间、场景或当时使用的渠道？不确定也可以。')
  }

  let proposedOperation = 'none'
  if (outcome === 'supported' && input.targetMemoryId) proposedOperation = 'review_add_or_restore_version'
  else if (outcome === 'contradicted') proposedOperation = 'review_mark_conflict'
  else if (outcome === 'ambiguous') proposedOperation = 'retain_ambiguity_and_request_context'
  else if (outcome === 'insufficient_evidence') proposedOperation = 'no_repair_insufficient_evidence'

  return {
    mode: 'dry-run',
    readOnly: true,
    claim,
    outcome: OUTCOMES.has(outcome) ? outcome : 'insufficient_evidence',
    // "supported" may mean one available lineage; it is not synonymous with corroborated.
    supportLevel: support.length === 0 ? 'none'
      : independentSupport.size >= 2 ? 'multiple_asserted_lineages'
        : 'single_asserted_lineage',
    independenceAssessment: 'asserted_by_upstream_not_verified_by_planner',
    failure,
    evidence: readable,
    inaccessibleEvidence: inaccessible.map(({ id, kind, locator, access }) => ({ id, kind, locator, access })),
    evidenceCounts: {
      readable: readable.length,
      supporting: support.length,
      contradicting: oppose.length,
      contextual: unclear.length,
      independentSupportingLineages: independentSupport.size,
      independentContradictingLineages: independentOppose.size,
    },
    questions,
    proposedOperation,
    requiresUserConfirmation: proposedOperation !== 'none',
    writesPerformed: false,
    warnings: [
      '仅分析调用方已获准读取的证据；来源定位符不构成读取授权。',
      'independenceKey/copiedFrom 由上游可信适配器提供；本规划器不认证来源，也不验证独立性。',
      'supported 可能仅代表单一证据谱系支持，不代表多源交叉印证或绝对真实。',
      'dry-run 不执行新增、恢复、合并、删除或索引重建。',
    ],
  }
}
