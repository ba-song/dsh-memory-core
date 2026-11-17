import { bigrams, phrase } from '../lib/store/fts.js'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import assert from 'node:assert'

// 1) 切分规则
assert.equal(bigrams('主人说想去看海'), '主人 人说 说想 想去 去看 看海')
assert.equal(bigrams('真的吗？'), '真的 的吗')          // 标点处断开
assert.equal(bigrams('A，B'), 'A B')                     // 标点处断开，不产生跨标点 bigram
assert.equal(bigrams('吗？'), '吗')                       // 单段单字
assert.equal(phrase('吗？'), '"吗"')
assert.equal(phrase(''), null)                            // 空查询必须短路

// 2) 入库 → 查询逐 token 对齐
const dir = '/tmp/dy-memory-test-' + process.pid
const { db } = openDb(dir)
const id = await insertMemory(db, { text: '主人昨天说想去看海，顺便买点吃的回来', kind: 'episode' })
const stored = db.prepare('SELECT text FROM fts_bigram WHERE rowid=?').get(id).text
assert.deepEqual(stored.split(' '), bigrams('主人昨天说想去看海，顺便买点吃的回来').split(' '))

for (const q of ['看海', '想去看海', '主人', '吃的']) {
  const p = phrase(q)
  const hit = db.prepare('SELECT rowid FROM fts_bigram WHERE fts_bigram MATCH ?').all(p).map(r => r.rowid)
  assert.ok(hit.includes(id), `查询「${q}」应命中文档`)
}
// 纯标点不抛错
assert.doesNotThrow(() => db.prepare('SELECT rowid FROM fts_bigram WHERE fts_bigram MATCH ?').all(phrase('？') ?? '""'))
console.log(JSON.stringify({ ok: true, test: 'bigram', id }))
