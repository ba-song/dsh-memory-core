/**
 * Isolated cross-context disclosure gate contract.
 *
 * Not wired into runtime. Identity, consent authenticity, session revalidation,
 * one-use atomic consumption and revocation MUST be enforced by the injected
 * trusted Host adapter. This module only enforces orchestration order and
 * fail-closed result handling around that adapter.
 */

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0

function validRequest(request) {
  return isRecord(request)
    && nonEmpty(request.ownerId)
    && nonEmpty(request.sourceSessionId)
    && nonEmpty(request.sourceCwd)
    && nonEmpty(request.targetSessionId)
    && nonEmpty(request.targetCwd)
    && request.sourceSessionId !== request.targetSessionId
    && request.sourceCwd === request.targetCwd
    && request.purpose === 'handoff'
    && Array.isArray(request.fields)
    && request.fields.length > 0
    && request.fields.every(nonEmpty)
    && new Set(request.fields).size === request.fields.length
}

const empty = (reason) => ({ ok: false, items: [], reason })

/**
 * @param {object} options
 * @param {object} options.request Exact source/target/purpose/field request.
 * @param {Function} options.authorizeAndConsume Trusted Host adapter operation.
 *   Must authenticate owner and both live sessions/cwds, verify consent scope,
 *   expiry/revocation, then atomically consume the one-use grant before resolving.
 * @param {Function} options.read Scoped reader; called only after authorization.
 * @param {Function} options.audit Metadata-only durable audit writer.
 */
export async function runAuthorizedDisclosure({ request, authorizeAndConsume, read, audit } = {}) {
  if (!validRequest(request)) return empty('invalid_request')
  if (typeof authorizeAndConsume !== 'function' || typeof read !== 'function' || typeof audit !== 'function') {
    return empty('missing_trusted_dependency')
  }

  let grant
  try {
    grant = await authorizeAndConsume(Object.freeze({
      ownerId: request.ownerId,
      sourceSessionId: request.sourceSessionId,
      sourceCwd: request.sourceCwd,
      targetSessionId: request.targetSessionId,
      targetCwd: request.targetCwd,
      purpose: request.purpose,
      fields: Object.freeze([...request.fields]),
    }))
  } catch {
    return empty('authorization_error')
  }

  if (!isRecord(grant) || grant.allowed !== true || !nonEmpty(grant.authorizationId)
      || !Array.isArray(grant.fields)
      || grant.fields.length !== request.fields.length
      || request.fields.some((field) => !grant.fields.includes(field))
      || grant.fields.some((field) => !request.fields.includes(field))) {
    try {
      await audit({ event: 'authorization_denied', reason: 'grant_missing_or_scope_mismatch' })
    } catch {
      return empty('audit_failed')
    }
    return empty('authorization_denied')
  }

  let items
  try {
    items = await read(Object.freeze({
      request,
      authorizationId: grant.authorizationId,
      fields: Object.freeze([...grant.fields]),
    }))
    if (!Array.isArray(items)) throw new TypeError('reader_must_return_array')
  } catch {
    try {
      await audit({ event: 'authorization_denied', authorizationId: grant.authorizationId, reason: 'read_failed' })
    } catch {
      return empty('audit_failed')
    }
    return empty('read_failed')
  }

  try {
    await audit({
      event: 'handoff_completed',
      authorizationId: grant.authorizationId,
      sourceSessionId: request.sourceSessionId,
      targetSessionId: request.targetSessionId,
      purpose: request.purpose,
      fields: [...grant.fields],
      itemCount: items.length,
    })
  } catch {
    return empty('audit_failed')
  }

  return { ok: true, items, authorizationId: grant.authorizationId }
}
