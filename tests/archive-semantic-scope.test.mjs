import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { searchArchive } from '../lib/archive/tools.js'
import { bigrams } from '../lib/store/fts.js'

function build() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE VIRTUAL TABLE raw_fts USING fts5(text, tokenize='unicode61')`)
  db.exec(`CREATE TABLE raw_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, file TEXT, line_no INTEGER,
    seq INTEGER, role TEXT, speaker TEXT, channel TEXT, tombstone INTEGER DEFAULT 0,
    chars INTEGER DEFAULT 0, raw_text TEXT DEFAULT '', at INTEGER, extra TEXT DEFAULT '{}', cwd TEXT DEFAULT '')`)
  db.exec(`CREATE TABLE raw_vectors (
    raw_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL, model TEXT, updated_at INTEGER NOT NULL)`)
  const ins = db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd)
    VALUES('2026-11-24','shared.md',?,?,?,?,?,0,?,?,?,'{}',?)`)
  const add = (line, cwd, role, text) => {
    const info = ins.run(line, line, role, '', 'qq', text.length, `10:0${line}:00 [${line}] ${role}：${text}`, Date.now(), cwd)
    const id = Number(info.lastInsertRowid)
    db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text))
    return id
  }
  const foreign = add(1, '/room/A', '主人', 'A房间的私人内容')
  const semantic = add(2, '/room/B', '主人', 'B房间的海边散步经历')
  const neighbor = add(3, '/room/B', '汐', 'B房间的后续对话')
  db.prepare('INSERT INTO raw_vectors(raw_id,dim,vec,model,updated_at) VALUES(?,2,?,?,?)')
    .run(semantic, new Uint8Array(new Float32Array([1, 0]).buffer), 'test', Date.now())
  return { db, foreign, semantic, neighbor }
}

test('semantic archive lookup enforces requested cwd before returning vector hits', () => {
  const { db, foreign, semantic } = build()
  const r = searchArchive(db, {
    question: '看海', cwd: '/room/A', limit: 10000,
    queryEmbed: [1, 0], withContext: true,
  })
  assert.equal(r.count, 0, 'semantic hit from another cwd must not be returned')
  assert.ok(!r.text.includes('B房间'))
  assert.ok(!r.text.includes('A房间'))
})

test('semantic context window stays inside the authorized cwd', () => {
  const { db, semantic } = build()
  const r = searchArchive(db, {
    question: '看海', cwd: '/room/B', limit: 10000,
    queryEmbed: [1, 0], withContext: true,
  })
  assert.equal(r.count, 1)
  assert.ok(r.text.includes('B房间的海边散步经历'))
  assert.ok(r.text.includes('B房间的后续对话'))
  assert.ok(!r.text.includes('A房间的私人内容'), 'context expansion must not cross cwd')
})

test('context expansion excludes tombstoned rows', () => {
  const { db, semantic, neighbor } = build()
  db.prepare('UPDATE raw_meta SET tombstone=1 WHERE id=?').run(neighbor)
  const r = searchArchive(db, {
    question: '看海', cwd: '/room/B', limit: 10000,
    queryEmbed: [1, 0], withContext: true,
  })
  assert.ok(!r.text.includes('B房间的后续对话'))
})
