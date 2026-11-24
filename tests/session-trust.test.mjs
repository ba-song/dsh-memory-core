import test from 'node:test'
import assert from 'node:assert/strict'
import { createLiveSessionRegistry } from '../lib/session-trust.js'

test('only host-observed session identities are trusted', () => {
  const registry = createLiveSessionRegistry()
  assert.equal(registry.matches({ id: 's1', cwd: '/owner' }), false)
  assert.equal(registry.observe({ header: { id: 's1', cwd: '/owner' } }), true)
  assert.equal(registry.matches({ id: 's1', cwd: '/owner' }), true)
  assert.equal(registry.matches({ id: 's1', cwd: '/other' }), false)
  assert.equal(registry.matches({ cwd: '/owner' }), false)
  assert.equal(registry.observe({ header: { id: '', cwd: '/owner' } }), false)
})

test('registry is bounded and evicts least-recently-used sessions', () => {
  const registry = createLiveSessionRegistry({ maxEntries: 2 })
  registry.observe({ id: 's1', cwd: '/one' })
  registry.observe({ id: 's2', cwd: '/two' })
  assert.equal(registry.matches({ id: 's1', cwd: '/one' }), true) // refresh s1
  registry.observe({ id: 's3', cwd: '/three' })
  assert.equal(registry.size, 2)
  assert.equal(registry.matches({ id: 's1', cwd: '/one' }), true)
  assert.equal(registry.matches({ id: 's2', cwd: '/two' }), false)
  assert.equal(registry.matches({ id: 's3', cwd: '/three' }), true)
})

test('observing an existing ID replaces its cwd instead of retaining stale trust', () => {
  const registry = createLiveSessionRegistry()
  registry.observe({ id: 'same', cwd: '/old' })
  registry.observe({ id: 'same', cwd: '/new' })
  assert.equal(registry.matches({ id: 'same', cwd: '/old' }), false)
  assert.equal(registry.matches({ id: 'same', cwd: '/new' }), true)
})
