import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { addRule, revokeRule, listRules, canManageRules } from '../lib/inject/rules.js'

test('rule operations enforce owner scope and lifecycle idempotence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-tools-'))
  const { db } = openDb(dir)
  try {
    assert.equal(canManageRules({ level: 'owner' }), true)
    assert.equal(canManageRules({ level: 'group' }), false)
    assert.equal(canManageRules({ level: 'external' }), false)
    assert.equal(addRule(db, { text: '群规则不得写入', scope: { level: 'group' } }).code, 'E_PERMISSION')
    const scope = { level: 'owner' }
    const added = addRule(db, { text: '主人规则', source: 'manual', scope })
    assert.equal(added.ok, true)
    assert.equal(addRule(db, { text: '主人规则', scope }).idempotent, true)
    assert.equal(listRules(db, { scope }).count, 1)
    assert.equal(listRules(db, { all: true, scope }).count, 1)
    assert.equal(listRules(db, { scope: { level: 'group' } }).code, 'E_PERMISSION')
    assert.equal(revokeRule(db, { id: added.id, scope: { level: 'group' } }).code, 'E_PERMISSION')
    assert.equal(revokeRule(db, { id: added.id, reason: 'done', scope }).ok, true)
    assert.equal(listRules(db, { scope }).count, 0)
    assert.equal(listRules(db, { all: true, scope }).items[0].status, 'revoked')
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
