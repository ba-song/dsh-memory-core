import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { buildRulesBlock } from '../lib/inject/rules.js'

test('pinned manual facts are never promoted into the rules block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-no-promote-'))
  const { db } = openDb(dir)
  try {
    const now = Date.now()
    db.prepare("INSERT INTO memories(kind,text,pinned,layer,status,created_at_epoch) VALUES('fact','pinned manual fact',1,'manual','active',?)").run(now)
    assert.equal(buildRulesBlock(db, { scope: { level: 'owner' }, now }), '')
    assert.equal(db.prepare('SELECT count(*) c FROM rules').get().c, 0)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
