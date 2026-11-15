process.env.TZ = "Asia/Shanghai"   // 展示/归档固定北京时间，测试同日历
import assert from 'node:assert'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'
import { readArchive, toolsOverview, searchArchive } from '../lib/archive/tools.js'

const dir = '/tmp/dy-at-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
new RawArchive({ db, dir: dir + '/raw', log: { info() {}, warn() {} } })
const { dayOf } = await import('../lib/adapter/timefmt.js')
const day = dayOf(Date.now())
assert.equal(day, (() => { const F=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}); const o={}; for(const p of F.formatToParts(new Date())) if(p.type!=='literal') o[p.type]=p.value; return `${o.year}-${o.month}-${o.day}` })(), '今天的 day 必须是北京时间当天')
const now = Date.now()
const ins = (role, text, at = now) => {
  db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra)
    VALUES(?,?,?,?,?,?,?,0,?,?,?, '{}')`).run(day, 'x.md', 1, 1, role, '', 'qq', text.length, `10:00:00 [1] ${role}：${text}`, at)
  const id = Number(db.prepare('SELECT last_insert_rowid() id').get().id)
  db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, text)
}
ins('主人', '主人喜欢看海', now - 5000)
ins('汐', '我记得你喜欢看海', now - 4000)
ins('汐·想', '她说过喜欢看海，我该接住', now - 3000)
ins('具', 'dy_memory_recall {"query":"看海"}', now - 2000)
ins('果', '查到 1 条：主人喜欢看海'.repeat(20), now - 1000)
ins('错', 'tool error: 超时', now - 500)

const read = readArchive(db, { limit: 10 })
assert.equal(read.ok, true)
assert.ok(read.text.includes('[主人]'))
assert.ok(read.text.includes('[汐]'))
assert.ok(!read.text.includes('[汐·想]'), '思考不进 dialog')
assert.ok(readArchive(db, { kind: 'reasoning' }).text.includes('[汐·想]'), 'reasoning 只出思考')
assert.ok(!read.text.includes('[具]'), 'read 不应带工具')
assert.equal(readArchive(db, { days: 7 }).ok, false, 'days 只接受 1')

const ov = toolsOverview(db)
assert.equal(ov.ok, true)
assert.ok(ov.text.includes('调了'), '概述应提到工具次数')
assert.ok(ov.text.length <= 300, '概述 ≤300 字')

const res = searchArchive(db, { question: '看海', limit: 400 })
assert.equal(res.ok, true)
assert.ok(res.text.includes('看海'))
assert.ok(res.text.length <= 400, '研究片段 ≤400 字')

console.log(JSON.stringify({ ok: true, test: 'archive-tools', read: read.count, overview: ov.text.length, research: res.text.length }))
