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


test('same-text rule metadata changes require explicit supersedes and same-id supersedes creates a revision', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-same-text-'))
  const { db } = openDb(dir)
  const scope = { level: 'owner' }
  try {
    const now = Date.now()
    const first = addRule(db, { text: '先确认再执行', priority: 2, source: 'manual-v1', scope, now })
    assert.equal(first.ok, true)
    const beforeCount = db.prepare('SELECT count(*) c FROM rules').get().c

    const same = addRule(db, { text: ' 先确认 再执行 ', scope, now: now + 1 })
    assert.equal(same.ok, true)
    assert.equal(same.idempotent, true)
    assert.equal(same.id, first.id)
    assert.equal(db.prepare('SELECT count(*) c FROM rules').get().c, beforeCount)

    const metadataConflict = addRule(db, { text: '先确认再执行', priority: 9, scope, now: now + 2 })
    assert.equal(metadataConflict.ok, false)
    assert.equal(metadataConflict.code, 'E_RULE_METADATA_CONFLICT')
    assert.equal(metadataConflict.id, first.id)
    assert.match(metadataConflict.message, /supersedes_id/)
    assert.equal(db.prepare('SELECT count(*) c FROM rules').get().c, beforeCount)

    const replacement = addRule(db, { text: '先确认再执行', priority: 9, source: 'manual-v2', supersedesId: first.id, scope, now: now + 3 })
    assert.equal(replacement.ok, true)
    assert.equal(replacement.idempotent, false)
    assert.equal(replacement.revision, 2)
    const oldRow = db.prepare('SELECT status,valid_to,superseded_by FROM rules WHERE id=?').get(first.id)
    const newRow = db.prepare('SELECT status,priority,source,revision FROM rules WHERE id=?').get(replacement.id)
    assert.equal(oldRow.status, 'superseded')
    assert.equal(oldRow.valid_to, now + 3)
    assert.equal(oldRow.superseded_by, replacement.id)
    assert.equal(newRow.status, 'active')
    assert.equal(newRow.priority, 9)
    assert.equal(newRow.source, 'manual-v2')
    assert.equal(newRow.revision, 2)
    const block = buildRulesBlock(db, { scope, now: now + 4 })
    assert.equal((block.match(/先确认再执行/g) ?? []).length, 1)
    assert.ok(block.includes('- [9] 先确认再执行'))
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('same-text supersedes pointing to a different active rule is rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-mismatch-'))
  const { db } = openDb(dir)
  const scope = { level: 'owner' }
  try {
    const now = Date.now()
    const first = addRule(db, { text: '同一规则文本', scope, now })
    const other = addRule(db, { text: '另一条规则文本', scope, now: now + 1 })
    const beforeCount = db.prepare('SELECT count(*) c FROM rules').get().c
    const result = addRule(db, { text: '同一规则文本', supersedesId: other.id, scope, now: now + 2 })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'E_RULE_SUPERSEDES_MISMATCH')
    assert.equal(result.id, first.id)
    assert.equal(db.prepare('SELECT count(*) c FROM rules').get().c, beforeCount)
    assert.equal(db.prepare("SELECT count(*) c FROM rules WHERE status='active' AND text='同一规则文本'").get().c, 1)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('different-text supersedes continues to create a new revision', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-different-text-'))
  const { db } = openDb(dir)
  const scope = { level: 'owner' }
  try {
    const now = Date.now()
    const first = addRule(db, { text: '旧规则文本', priority: 4, source: 'source-old', scope, now })
    const second = addRule(db, { text: '新规则文本', supersedesId: first.id, scope, now: now + 1 })
    assert.equal(second.ok, true)
    assert.equal(second.revision, 2)
    const oldRow = db.prepare('SELECT status,superseded_by FROM rules WHERE id=?').get(first.id)
    const newRow = db.prepare('SELECT status,priority,source FROM rules WHERE id=?').get(second.id)
    assert.equal(oldRow.status, 'superseded')
    assert.equal(oldRow.superseded_by, second.id)
    assert.equal(newRow.status, 'active')
    assert.equal(newRow.priority, 4)
    assert.equal(newRow.source, 'source-old')
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
