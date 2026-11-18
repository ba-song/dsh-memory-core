import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { recall } from '../lib/recall/recall.js'
import { filterInjectionHits, keywordOverlapRatio } from '../lib/inject/hits.js'

const dir = '/tmp/dy-m3-noise-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
try {
  await insertMemory(db, { kind: 'episode', text: '之前我和你聊过天气变化，后来决定周末散步。', createdAt: 1000 })
  await insertMemory(db, { kind: 'episode', text: '我们约定一起去看海，等天气合适就出发。', createdAt: 2000 })

  const generic = '之前上次事情'
  const rawGeneric = await recall(db, generic, { vectors: null, gate: { semantic: 0.55, keyword: 0.35 }, limit: 5, trackAccess: false })
  assert.ok(rawGeneric.length > 0, '底层 recall 仍能返回关键词结果，工具路径不被修改')
  assert.ok(keywordOverlapRatio(generic, rawGeneric[0].text) < 0.35)
  assert.equal(filterInjectionHits(rawGeneric, generic, { minSemantic: 0.55, minKeywordOverlap: 0.35 }).length, 0)

  const explicit = '去看海'
  const rawExplicit = await recall(db, explicit, { vectors: null, gate: { semantic: 0.55, keyword: 0.35 }, limit: 5, trackAccess: false })
  const filteredExplicit = filterInjectionHits(rawExplicit, explicit, { minSemantic: 0.55, minKeywordOverlap: 0.35 })
  assert.ok(filteredExplicit.some((x) => x.text.includes('去看海')), '明确话题仍能通过注入门槛')
  assert.ok(rawExplicit.length > 0, 'dy_memory_recall 使用的底层 recall 仍保留原行为')
  console.log(JSON.stringify({ ok: true, test: 'hits-noise', genericRaw: rawGeneric.length, genericInjected: 0, explicitInjected: filteredExplicit.length }))
} finally {
  db.close()
  rmSync(dir, { recursive: true, force: true })
}
