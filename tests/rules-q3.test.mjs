import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { buildRulesBlock } from '../lib/inject/rules.js'
import { insertMemory } from '../lib/store/memories.js'
import { recall } from '../lib/recall/recall.js'

test('Q3 keeps the synthetic pronoun-only stress query separate from rule injection', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-rules-q3-'))
  const { db } = openDb(dir)
  try {
    const now = Date.now()
    await insertMemory(db, { kind: 'fact', text: '工作 agent 加插件三步流程', createdAt: now, scopeType: 'owner', scopeId: '' })
    const scope = { level: 'owner' }
    const q3 = '按照我们之前商量好的方案继续'
    const themed = '按照之前约定的三步流程继续处理插件添加事项'
    assert.ok(q3.length > 0 && themed.includes('插件'))
    assert.equal(buildRulesBlock(db, { scope, now }), '', '旧 fact 不自动转为规则，原 Q3 不注入规则块')
    const themedHits = await recall(db, themed, { vectors: new Map(), gate: { semantic: 0, keyword: 0 }, limit: 8, scope, trackAccess: false })
    assert.ok(themedHits.some((hit) => hit.kind === 'fact' && hit.text.includes('插件')), '带主题查询应仍能召回普通 fact')
    assert.equal(db.prepare('SELECT count(*) c FROM rules').get().c, 0)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
