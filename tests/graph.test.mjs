import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { linkMemory, graphCandidates, extractEntities } from '../lib/store/graph.js'
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const dir = '/tmp/dy-graph-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const a = await insertMemory(db, { text: '主人喜欢看海，也爱吃海鲜', kind: 'preference' })
const b = await insertMemory(db, { text: '主人今天去了海边', kind: 'episode' })
const c = await insertMemory(db, { text: '抖音改资料要走 App', kind: 'fact' })
for (const [id, t] of [[b, '主人今天去了海边'], [a, '主人喜欢看海，也爱吃海鲜'], [c, '抖音改资料要走 App']]) linkMemory(db, id, t)

assert.ok(extractEntities('主人喜欢看海').some((e) => e.name === '主人'))
const g1 = graphCandidates(db, '主人')
assert.ok(g1.direct.includes(a) && g1.direct.includes(b), '主人应直接命中两条')
assert.deepEqual(g1.direct, [...g1.direct].sort((x, y) => x - y), 'direct graph candidates must be deterministic by memory id even when links were inserted in reverse order')
const g2 = graphCandidates(db, '看海')
assert.ok(g2.direct.includes(a))
assert.ok(g2.hop.has(b) || g2.direct.includes(b), '看海应能带到海边那条')
console.log(JSON.stringify({ ok: true, test: 'graph', entities: db.prepare('SELECT count(*) c FROM entities').get().c, links: db.prepare('SELECT count(*) c FROM memory_entities').get().c }))
