import assert from 'node:assert'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'
import { searchArchive } from '../lib/archive/tools.js'
import { dayOf } from '../lib/adapter/timefmt.js'
import { bigrams } from '../lib/store/fts.js'

const dir = '/tmp/dy-aw-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
new RawArchive({ db, dir: dir + '/raw', log: { info() {}, warn() {} } })
const day = dayOf(Date.now())
const file = 'x.md', cwd = '/sdcard/DSHA/生活/数据/home'
const ins = (line, role, text, at) => {
  db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd)
    VALUES(?,?,?,?,?,?,?,0,?,?,?, '{}',?)`).run(day, file, line, line, role, '', 'qq', text.length, `${String(line).padStart(2,'0')}:00:00 [${line}] ${role}：${text}`, at, cwd)
  const id = Number(db.prepare('SELECT last_insert_rowid() id').get().id)
  if (role !== '汐·想') db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text))
  return id
}
const t = Date.now()
ins(1, '主人', '今天想去看海', t - 5000)
ins(2, '汐·想', '他喜欢海，我要记住', t - 4000)
const anchor = ins(3, '汐', '好，那我陪你看海', t - 3000)
ins(4, '主人', '那就周末去', t - 2000)
ins(5, '汐', '周末我提醒你', t - 1000)
db.prepare('INSERT OR REPLACE INTO raw_emotion_archive(raw_id,at,label,valence,arousal,certainty,intensity,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(anchor, t - 3000, '开心', 0.6, 0.5, 0.8, 0.7, 'live', Date.now())
const persona = { emotionAt: () => ({ label: '平静', intensity: 0.2, confidence: 0.8 }) }
const r = searchArchive(db, { question: '看海', withContext: true, persona })
assert.equal(r.ok, true)
assert.equal(r.withContext, true)
assert.ok(r.text.includes('【命中 1】'), '有命中窗口')
assert.ok(r.text.includes('今天想去看海'), '带前一条原话')
assert.ok(r.text.includes('周末我提醒你'), '带后一条原话')
assert.ok(r.text.includes('想：他喜欢海'), '带思考')
assert.ok(r.text.includes('心情：开心'), '带情绪')
console.log(JSON.stringify({ ok: true, test: 'archive-window', count: r.count }))
