import assert from 'node:assert/strict'
import { runAuthorizedDisclosure } from '../lib/ingest/cross-context-read-gate.js'

const request = {
  ownerId: 'owner-1',
  sourceSessionId: 'source-1',
  sourceCwd: '/owner/project',
  targetSessionId: 'target-1',
  targetCwd: '/owner/project',
  purpose: 'handoff',
  fields: ['stable_facts'],
}
const grant = { allowed: true, authorizationId: 'auth-1', fields: ['stable_facts'] }

// G-01 valid flow authorizes/consumes before read and audits before return.
{
  const order = []
  const result = await runAuthorizedDisclosure({
    request,
    authorizeAndConsume: async () => { order.push('authorize-consume'); return grant },
    read: async () => { order.push('read'); return [{ id: 'm1' }] },
    audit: async (event) => { order.push(event.event) },
  })
  assert.deepEqual(order, ['authorize-consume', 'read', 'handoff_completed'])
  assert.deepEqual(result.items, [{ id: 'm1' }])
  assert.equal(result.ok, true)
}

// G-02 authorization denial means zero reads.
{
  let reads = 0
  const result = await runAuthorizedDisclosure({
    request,
    authorizeAndConsume: async () => ({ allowed: false }),
    read: async () => { reads++; return [{ secret: true }] },
    audit: async () => {},
  })
  assert.equal(reads, 0)
  assert.deepEqual(result.items, [])
  assert.equal(result.reason, 'authorization_denied')
}

// G-03 malformed request is rejected before any Host callback.
{
  let calls = 0
  const result = await runAuthorizedDisclosure({
    request: { ...request, targetSessionId: request.sourceSessionId },
    authorizeAndConsume: async () => { calls++; return grant },
    read: async () => { calls++; return [] },
    audit: async () => { calls++ },
  })
  assert.equal(calls, 0)
  assert.equal(result.reason, 'invalid_request')
}

// G-04 grant cannot silently broaden or narrow the requested field scope.
{
  let reads = 0
  const result = await runAuthorizedDisclosure({
    request,
    authorizeAndConsume: async () => ({ ...grant, fields: ['stable_facts', 'private_diary'] }),
    read: async () => { reads++; return [] },
    audit: async () => {},
  })
  assert.equal(reads, 0)
  assert.equal(result.reason, 'authorization_denied')
}

// G-05 Host adapter error fails closed.
{
  let reads = 0
  const result = await runAuthorizedDisclosure({
    request,
    authorizeAndConsume: async () => { throw new Error('host unavailable') },
    read: async () => { reads++; return [] },
    audit: async () => {},
  })
  assert.equal(reads, 0)
  assert.equal(result.reason, 'authorization_error')
}

// G-06 audit failure prevents disclosure to caller, even after scoped read.
{
  const result = await runAuthorizedDisclosure({
    request,
    authorizeAndConsume: async () => grant,
    read: async () => [{ secret: 'must not escape' }],
    audit: async () => { throw new Error('audit unavailable') },
  })
  assert.deepEqual(result.items, [])
  assert.equal(result.reason, 'audit_failed')
}

// G-07 reader failure returns no partial items and is audited.
{
  const events = []
  const result = await runAuthorizedDisclosure({
    request,
    authorizeAndConsume: async () => grant,
    read: async () => { throw new Error('read failure') },
    audit: async (event) => events.push(event),
  })
  assert.deepEqual(result.items, [])
  assert.equal(result.reason, 'read_failed')
  assert.equal(events[0].event, 'authorization_denied')
}

// G-08 missing dependencies fail closed.
{
  const result = await runAuthorizedDisclosure({ request })
  assert.deepEqual(result.items, [])
  assert.equal(result.reason, 'missing_trusted_dependency')
}

// G-09 empty, duplicate, wildcard, or unknown-purpose requests fail before authorization.
{
  for (const patch of [
    { fields: [] },
    { fields: ['stable_facts', 'stable_facts'] },
    { fields: ['*'] },
    { purpose: 'anything' },
    { targetCwd: '/different/path' },
  ]) {
    let called = false
    const result = await runAuthorizedDisclosure({
      request: { ...request, ...patch },
      authorizeAndConsume: async () => { called = true; return grant },
      read: async () => [],
      audit: async () => {},
    })
    assert.equal(called, false)
    assert.equal(result.ok, false)
  }
}

console.log(JSON.stringify({ ok: true, test: 'cross-context-read-gate', cases: 9 }))
