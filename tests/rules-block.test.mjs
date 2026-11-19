import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { buildStable } from '../lib/inject/stable.js'

test('rules block is owner-only, precedes facts, and excludes ordinary memory types', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-block-'))
  const { db } = openDb(dir)
  try {
    const now = Date.now()
    db.prepare('INSERT INTO rules(text,priority,created_at,updated_at,valid_from) VALUES(?,?,?,?,?)').run('必须先确认再执行', 10, now, now, now)
    db.prepare("INSERT INTO memories(kind,text,pinned,status,created_at_epoch,scope_type,scope_id) VALUES('fact','普通 pinned fact',1,'active',?,'owner','')").run(now)
    db.prepare("INSERT INTO memories(kind,text,status,created_at_epoch,scope_type,scope_id) VALUES('relation','普通关系记忆','active',?,'owner','')").run(now)
    db.prepare("INSERT INTO memories(kind,text,status,created_at_epoch,scope_type,scope_id) VALUES('skill','普通技能记忆','active',?,'owner','')").run(now)
    db.prepare("INSERT INTO memories(kind,text,status,created_at_epoch,scope_type,scope_id) VALUES('preference','普通偏好记忆','active',?,'owner','')").run(now)
    const cwd = join(dir, 'cwd')
    mkdirSync(cwd, { recursive: true })
    writeFileSync(join(cwd, '事实卡.md'), '- 事实卡条目\n')
    const ownerBlock = buildStable(cwd, { db, scope: { level: 'owner' }, rulesEnabled: true })
    assert.ok(ownerBlock.includes('【必须遵守的规则】'))
    assert.ok(ownerBlock.includes('必须先确认再执行'))
    assert.ok(ownerBlock.indexOf('【必须遵守的规则】') < ownerBlock.indexOf('【记忆·事实卡'))
    assert.ok(ownerBlock.includes('普通关系记忆'))
    assert.ok(!ownerBlock.includes('普通 pinned fact') || !ownerBlock.includes('【必须遵守的规则】\n- [0] 普通 pinned fact'))
    assert.ok(!ownerBlock.includes('普通技能记忆') || !ownerBlock.includes('【必须遵守的规则】\n- [0] 普通技能记忆'))
    const groupBlock = buildStable(cwd, { db, scope: { level: 'group', groupId: 'g1' } })
    assert.ok(!groupBlock.includes('必须先确认再执行'))
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
