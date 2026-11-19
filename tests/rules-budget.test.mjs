import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { buildRulesBlock, RULES_BUDGET, RULES_MAX_ITEMS, RULE_ITEM_CHARS } from '../lib/inject/rules.js'

test('rules budget enforces 400 chars, five lines and 70 rendered chars per item', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-budget-'))
  const { db } = openDb(dir)
  try {
    const now = Date.now()
    const ins = db.prepare('INSERT INTO rules(text,priority,created_at,updated_at,valid_from) VALUES(?,?,?,?,?)')
    for (let i = 0; i < 8; i++) ins.run('规则内容'.repeat(30) + i, 8 - i, now + i, now + i, now)
    const block = buildRulesBlock(db, { scope: { level: 'owner' }, now, budget: { maxChars: 400, maxItems: 5, itemChars: 70 } })
    const lines = block.split('\n').filter((line) => line.startsWith('- ['))
    assert.ok(block.length <= RULES_BUDGET)
    assert.ok(lines.length <= RULES_MAX_ITEMS)
    assert.ok(lines.every((line) => Array.from(line).length <= RULE_ITEM_CHARS))
    assert.ok(lines[0].startsWith('- [8]'), '优先级高的规则应优先')
    assert.ok(block.includes('未注入') || lines.length === 5)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
