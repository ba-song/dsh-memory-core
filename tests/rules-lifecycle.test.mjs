import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { addRule, revokeRule, buildRulesBlock, listRules } from '../lib/inject/rules.js'

test('rules lifecycle: idempotent add, supersede, expiry and revoke', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-life-'))
  const { db } = openDb(dir)
  const scope = { level: 'owner' }
  try {
    const now = Date.now()
    const first = addRule(db, { text: '先确认再执行', priority: 2, scope, now })
    assert.equal(first.ok, true)
    assert.equal(first.revision, 1)
    const duplicate = addRule(db, { text: ' 先确认 再执行 ', scope, now: now + 1 })
    assert.equal(duplicate.idempotent, true)
    assert.equal(duplicate.id, first.id)
    const second = addRule(db, { text: '先确认并取得主人批准再执行', priority: 3, supersedesId: first.id, scope, now: now + 2 })
    assert.equal(second.revision, 2)
    const rows = listRules(db, { all: true, scope }).items
    assert.equal(rows.find((r) => r.id === first.id).status, 'superseded')
    assert.equal(rows.find((r) => r.id === second.id).status, 'active')
    const block = buildRulesBlock(db, { scope, now: now + 3 })
    assert.ok(block.includes('取得主人批准'))
    assert.ok(!block.includes('先确认再执行'))
    db.prepare('UPDATE rules SET valid_to=? WHERE id=?').run(now + 4, second.id)
    assert.equal(buildRulesBlock(db, { scope, now: now + 5 }), '')
    const third = addRule(db, { text: '第三条有效规则', scope, now: now + 6 })
    assert.equal(revokeRule(db, { id: third.id, reason: '主人撤销', scope, now: now + 7 }).ok, true)
    assert.equal(revokeRule(db, { id: third.id, scope, now: now + 8 }).idempotent, true)
    assert.ok(!buildRulesBlock(db, { scope, now: now + 9 }).includes('第三条有效规则'))
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
