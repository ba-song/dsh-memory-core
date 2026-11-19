import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { buildRulesBlock, addRule } from '../lib/inject/rules.js'
import { buildHitsBlock } from '../lib/inject/hits.js'

test('rules dedupe normalized duplicate rules and suppress matching hits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-dedupe-'))
  const { db } = openDb(dir)
  try {
    const scope = { level: 'owner' }
    addRule(db, { text: '先确认再执行', scope })
    assert.equal(addRule(db, { text: '先确认 再执行', scope }).idempotent, true)
    const stable = buildRulesBlock(db, { scope })
    const hits = buildHitsBlock([{ kind: 'fact', text: '先确认再执行', scores: { semantic: 0.9 } }], { stableText: stable })
    assert.equal(hits, '')
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
