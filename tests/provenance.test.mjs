import { openDb } from '../lib/store/db.js'
import { ingestExplicit, extractExplicit } from '../lib/ingest/explicit.js'
import { recall } from '../lib/recall/recall.js'
import { deleteMemory, loadVectors } from '../lib/store/memories.js'
import { loadEmbed } from '../lib/embed/onnx.mjs'
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const dir = '/tmp/dy-prov-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
await loadEmbed('/opt/qqai/models/bge-small-zh')

// 1) 只抽显式陈述
assert.equal(extractExplicit('今天天气不错'), null)
assert.equal(extractExplicit('记住：主人喜欢看海'), '主人喜欢看海')
assert.equal(extractExplicit('记住我们不是一个人'), '我们不是一个人')   // 没冒号也算
assert.equal(extractExplicit('记住：了哟'), null)                    // 语气词不算
assert.equal(extractExplicit('记住了哟'), null)                      // 回应不算
assert.equal(extractExplicit('我记住了'), null)
assert.equal(extractExplicit('帮我记一下 买猫粮'), '买猫粮')
assert.equal(extractExplicit('记一下：猫粮'), '猫粮')

// 2) 自动入库：低权重 + provenance 齐全
const id = await ingestExplicit(db, { sessionId: 's1', seq: 7, text: '记住：主人喜欢看海', at: Date.now(), speaker: '1000000001' })
assert.ok(id)
const row = db.prepare('SELECT * FROM memories WHERE id=?').get(id)
assert.equal(row.layer, 'auto')
assert.ok(row.importance <= 0.4)
assert.ok(row.confidence < 1)
assert.ok(String(row.source_msg_id).startsWith('explicit:s1:'))
assert.equal(row.extractor_version, 'explicit-v1')

// 2.1) 断线补发格式 + “记得+动作”祈使句
assert.equal(extractExplicit('02:06:20 明天记得叫我起床哦'), '明天记得叫我起床')
const id2 = await ingestExplicit(db, { sessionId: 's1', seq: 8, text: '02:06:20 明天记得叫我起床哦' })
assert.ok(id2)
assert.equal(db.prepare('SELECT kind FROM memories WHERE id=?').get(id2).kind, 'todo')

// 3) 同一来源幂等
const dup = await ingestExplicit(db, { sessionId: 's1', seq: 7, text: '记住：主人喜欢看海', at: Date.now() })
assert.equal(dup, null)

// 4) 撤回后检索不可见
const before = await recall(db, '看海', { vectors: loadVectors(db), limit: 5 })
assert.ok(before.some((r) => r.id === id))
await deleteMemory(db, id)
const after = await recall(db, '看海', { vectors: loadVectors(db), limit: 5 })
assert.ok(!after.some((r) => r.id === id))
console.log(JSON.stringify({ ok: true, test: 'provenance', id, layer: row.layer, importance: row.importance, confidence: row.confidence }))
