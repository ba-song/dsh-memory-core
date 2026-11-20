const SCOPE_LEVELS = new Set(['owner', 'external', 'group', 'unknown'])
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0

export function validateAnnotationDataset(dataset, sourceQueries) {
  const errors = []
  if (!isObject(dataset)) throw new TypeError('annotation dataset must be an object')
  if (!String(dataset.datasetVersion ?? '').trim()) errors.push('datasetVersion is required')
  if (!String(dataset.annotationPolicyVersion ?? '').trim()) errors.push('annotationPolicyVersion is required')
  if (!Array.isArray(dataset.queries)) errors.push('queries must be an array')
  if (!isObject(dataset.runParameters)) errors.push('runParameters must be an object')
  const params = dataset.runParameters ?? {}
  for (const [key, min, max, integer] of [
    ['recallGateSemantic', 0, 1, false],
    ['recallGateKeyword', 0, 1, false],
    ['recallLimit', 1, 50, true],
    ['injectionMinSemantic', 0, 1, false],
    ['injectionMinKeywordOverlap', 0, 1, false],
    ['injectionMaxItems', 1, 10, true],
    ['injectionMaxChars', 1, 2000, true],
  ]) {
    const value = Number(params[key])
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      errors.push(`runParameters.${key} must be ${integer ? 'an integer' : 'a number'} in [${min}, ${max}]`)
    }
  }

  const queryMap = new Map((Array.isArray(sourceQueries) ? sourceQueries : []).map((q) => [String(q.id), q]))
  const seenQueryIds = new Set()
  let positiveLabels = 0
  let labelledQueries = 0
  for (const annotation of Array.isArray(dataset.queries) ? dataset.queries : []) {
    const id = String(annotation?.id ?? '')
    if (!id) { errors.push('annotation query id is required'); continue }
    if (seenQueryIds.has(id)) errors.push(`duplicate annotation query id: ${id}`)
    seenQueryIds.add(id)
    const source = queryMap.get(id)
    if (!source) errors.push(`unknown annotation query id: ${id}`)
    else if (String(annotation.query ?? '') !== String(source.query ?? '')) errors.push(`query text mismatch: ${id}`)
    const scope = annotation.scope
    if (!isObject(scope) || !SCOPE_LEVELS.has(String(scope.level ?? '')) || !String(scope.cwd ?? '').trim()) {
      errors.push(`invalid scope/cwd: ${id}`)
    }
    if (scope?.level === 'external' && !String(scope.contactId ?? '').trim()) errors.push(`external scope requires contactId: ${id}`)
    if (scope?.level === 'group' && !String(scope.groupId ?? '').trim()) errors.push(`group scope requires groupId: ${id}`)
    if (!Array.isArray(annotation.relevant)) errors.push(`relevant must be an array: ${id}`)
    if (!Array.isArray(annotation.forbiddenMemoryIds)) errors.push(`forbiddenMemoryIds must be an array: ${id}`)
    const relevantIds = new Set()
    let queryPositiveLabels = 0
    for (const item of Array.isArray(annotation.relevant) ? annotation.relevant : []) {
      if (!positiveId(item?.memoryId)) { errors.push(`invalid memoryId: ${id}`); continue }
      const memoryId = Number(item.memoryId)
      if (relevantIds.has(memoryId)) errors.push(`duplicate relevant memoryId ${memoryId}: ${id}`)
      relevantIds.add(memoryId)
      if (!Number.isInteger(item.grade) || item.grade < 0 || item.grade > 3) errors.push(`invalid relevance grade: ${id}/${memoryId}`)
      if (Number(item.grade) > 0) {
        positiveLabels++
        queryPositiveLabels++
        const evidence = item.evidence ?? {}
        if (!isObject(evidence) || !(String(evidence.sourceMsgId ?? '').trim() || Number(evidence.sourceTs) > 0 || positiveId(evidence.rawId))) {
          errors.push(`positive label requires a provenance anchor: ${id}/${memoryId}`)
        }
      }
    }
    const forbiddenIds = new Set()
    for (const rawId of Array.isArray(annotation.forbiddenMemoryIds) ? annotation.forbiddenMemoryIds : []) {
      if (!positiveId(rawId)) errors.push(`invalid forbiddenMemoryId: ${id}`)
      const memoryId = Number(rawId)
      if (forbiddenIds.has(memoryId)) errors.push(`duplicate forbiddenMemoryId ${memoryId}: ${id}`)
      forbiddenIds.add(memoryId)
      if (relevantIds.has(memoryId)) errors.push(`memoryId cannot be both relevant and forbidden: ${id}/${memoryId}`)
    }
    if (relevantIds.size || forbiddenIds.size) labelledQueries++
    if (queryPositiveLabels > 0 && !String(annotation.annotator ?? '').trim()) errors.push(`positive labels require annotator: ${id}`)
  }

  if (positiveLabels > 0) {
    if (!/^[a-f0-9]{40}$/i.test(String(dataset.codeCommit ?? ''))) errors.push('positive labels require a 40-character codeCommit')
    if (!/^[a-f0-9]{64}$/i.test(String(dataset.databaseSnapshotSha256 ?? ''))) errors.push('positive labels require databaseSnapshotSha256')
    if (!String(dataset.embeddingModel ?? '').trim()) errors.push('positive labels require embeddingModel')
  }
  if (errors.length) throw new Error('annotation dataset invalid:\n- ' + [...new Set(errors)].join('\n- '))
  return { valid: true, queryAnnotations: seenQueryIds.size, labelledQueries, positiveLabels }
}
