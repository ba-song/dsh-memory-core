import { openDb } from '../lib/store/db.js'
import { insertMemory, deleteMemory, saveVector } from '../lib/store/memories.js'
import { phrase } from '../lib/store/fts.js'
import assert from 'node:assert'

const dir = '/tmp/dy-memory-del-' + process.pid
const { db } = openDb(dir)
const id = await insertMemory(db, { text: '主人喜欢看海', kind: 'preference' })
await saveVector(db, id, new Float32Array(512).fill(0.1))
assert.ok(db.prepare('SELECT count(*) c FROM vectors WHERE memory_id=?').get(id).c === 1)

await deleteMemory(db, id)
assert.equal(db.prepare('SELECT count(*) c FROM memories WHERE id=?').get(id).c, 0)
assert.equal(db.prepare('SELECT count(*) c FROM fts_bigram WHERE rowid=?').get(id).c, 0)
assert.equal(db.prepare('SELECT count(*) c FROM fts_trigram WHERE rowid=?').get(id).c, 0)
assert.equal(db.prepare('SELECT count(*) c FROM vectors WHERE memory_id=?').get(id).c, 0)
const hit = db.prepare('SELECT rowid FROM fts_bigram WHERE fts_bigram MATCH ?').all(phrase('看海')).map(r => r.rowid)
assert.ok(!hit.includes(id))
console.log(JSON.stringify({ ok: true, test: 'delete' }))
