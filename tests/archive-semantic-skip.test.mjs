/**
 * 2026-11-17 优化实测：语义档案检索的短路。
 *
 * 生产库 raw_vectors = 51,072 行 / 99.8MB；`SELECT raw_id,dim,vec FROM raw_vectors` 实测
 * **2.66 秒、RSS 冲到 208MB**。而语义结果要经过同一句预算判断
 * `if (used + item.length + 1 > limit) break` —— 关键词结果一旦把预算占满，
 * 那 2.66 秒算出来的东西 100% 被丢掉。
 *
 * 用「记录 prepare 过哪些 SQL」的代理 db 证明：预算满时**根本不准备那条 SQL**。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { searchArchive } from '../lib/archive/tools.js'
import { bigrams } from '../lib/store/fts.js'

const SHORT = [
  '五花肉今天放多了酱油，咸。', '五花肉第二次少放了盐，还行。', '五花肉第三次用了冰糖，好一些。',
  '五花肉第四次先焯水，不腥了。', '五花肉第五次加了土豆，更香。', '五花肉第六次火大了，有点焦。',
  '五花肉第七次收汁成功。', '五花肉第八次翻炒更快。',
]

function build() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE VIRTUAL TABLE raw_fts USING fts5(text, tokenize='unicode61')`)
  db.exec(`CREATE TABLE raw_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, file TEXT, line_no INTEGER,
    seq INTEGER, role TEXT, speaker TEXT, channel TEXT, tombstone INTEGER DEFAULT 0,
    chars INTEGER DEFAULT 0, raw_text TEXT DEFAULT '', at INTEGER, extra TEXT DEFAULT '{}', cwd TEXT DEFAULT '')`)
  db.exec(`CREATE TABLE raw_vectors (raw_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL, model TEXT, updated_at INTEGER NOT NULL)`)
  const ins = db.prepare("INSERT INTO raw_meta(day,at,role,raw_text,cwd,tombstone) VALUES('2026-11-16',?,'user',?,'',0)")
  for (const t of SHORT) {
    const info = ins.run(Date.now(), t)
    // 生产里 raw_fts 存的是 bigrams(text)（见 ingest/archive.js:460），必须同样喂
    db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(Number(info.lastInsertRowid), bigrams(t))
  }
  db.prepare('INSERT INTO raw_vectors(raw_id,dim,vec,model,updated_at) VALUES(1,4,?,?,?)')
    .run(new Uint8Array(new Float32Array([1, 0, 0, 0]).buffer), 'test', Date.now())
  return db
}

function spy(db) {
  const seen = []
  const wrapped = {
    prepare(sql) { seen.push(String(sql)); return db.prepare(sql) },
    exec(sql) { return db.exec(sql) },
  }
  return { wrapped, seen }
}

const touchedVectors = (seen) => seen.filter((s) => s.includes('raw_vectors')).length

test('A1 关键词把预算占满 → 不读 raw_vectors（省掉 2.66s / 100MB）', () => {
  const db = build()
  const { wrapped, seen } = spy(db)
  const r = searchArchive(wrapped, { question: '五花肉', limit: 100, queryEmbed: [1, 0, 0, 0] })
  assert.equal(r.ok, true)
  assert.ok(r.count > 0, `关键词应有命中，实际 count=${r.count}`)
  assert.equal(touchedVectors(seen), 0, '预算满时不该准备 raw_vectors 那条 SQL')
})

test('A2 预算充足 → 语义段照常执行（功能不能被削）', () => {
  const db = build()
  const { wrapped, seen } = spy(db)
  const r = searchArchive(wrapped, { question: '五花肉', limit: 100000, queryEmbed: [1, 0, 0, 0] })
  assert.equal(r.ok, true)
  assert.ok(touchedVectors(seen) >= 1, '预算充足时必须走语义通路')
})

test('A3 没有 queryEmbed → 永不读 raw_vectors', () => {
  const db = build()
  const { wrapped, seen } = spy(db)
  searchArchive(wrapped, { question: '五花肉', limit: 100000, queryEmbed: null })
  assert.equal(touchedVectors(seen), 0)
})
