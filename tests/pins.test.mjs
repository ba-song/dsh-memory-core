import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { addPin, donePin, renderPins, listPins } from '../lib/pins.js'
import { handoffBrief } from '../lib/handoff/brief.js'

test('话头：add/done/去掉，最多 5 条进交接简报', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pins-'))
  const { db } = openDb(dir)
  try {
    for (let i = 0; i < 6; i++) addPin(db, 'self', `第 ${i} 条还没接上的话`, 1_800_000_000_000 + i)
    assert.equal(listPins(db, 'self').length, 6)
    const text = renderPins(db, 'self')
    assert.ok(text.includes('【话头】'))
    assert.ok(text.includes('还有 1 条没列'))
    assert.ok(donePin(db, 'self', 1))
    const brief = handoffBrief(db, { isOwner: true, cwd: '/tmp/no-project', recent: [] })
    assert.ok(brief.text.includes('【话头】'))
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('交接简报带标签：记忆类型摘要', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pins-tags-'))
  const { db } = openDb(dir)
  try {
    db.prepare("INSERT INTO memories(kind,text,status,scope_type,importance,created_at_epoch) VALUES('preference','喜欢猫','active','owner',0.5,?)").run(Date.now())
    const brief = handoffBrief(db, { isOwner: true, cwd: '/tmp/no-project', recent: [] })
    assert.ok(brief.text.includes('标签：'))
    assert.ok(brief.text.includes('偏好 1'))
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
