import assert from 'node:assert'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'
import { buildQuotesBlock } from '../lib/inject/quotes.js'
import { bigrams } from '../lib/store/fts.js'
import { stampOf } from '../lib/adapter/timefmt.js'

const dir = '/tmp/dy-q-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
new RawArchive({ db, dir: dir + '/raw', log: { info() {}, warn() {} } })
const cwd = '/root/qq-agent/QQ会话/私聊_1000000001'
const now = Date.now()
const day = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}` }
let line = 0
const ins = (role, text, at, file = 'f1') => {
  line += 1
  const full = `10:00:00 [${line}] ${role}：${text}`
  db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd)
    VALUES(?,?,?,?,?,?,?,0,?,?,?,'{}',?)`).run(day(at), file, line, line, role, '', 'qq', full.length, full, at, cwd)
  const id = Number(db.prepare('SELECT last_insert_rowid() id').get().id)
  db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text) || text)
}
ins('汐', '看海这件事估计还要等好久', now - 7190000) // seq=1
ins('汐·想', '她真的想去看海', now - 7180000)
ins('汐', '去年看海，人很多', now - 86400000, 'f2')
ins('汐', '刚说完那件事', now - 300000)
ins('汐', '看海', now - 10000) // 当前消息回声，应排除

const r = buildQuotesBlock(db, { cwd, hits: [{ source_msg_id: 'p4:x:1', source_ts: now - 7190000 }], query: '看海', now })
assert.ok(r.block.startsWith('【相关原话】'))
assert.ok(r.block.includes('看海这件事估计还要等好久'), '应带出处原文')
assert.ok(!r.block.includes('她真的想去看海'), '思考已移到【相关思考】，不再进原话块')
assert.ok(r.block.includes('去年看海'), '应带查询命中的旧原话')
assert.ok(r.block.includes(`- ${stampOf(now - 86400000, { now })} [汐] 去年看海`), '跨天原话应显示日期')
assert.ok(r.block.includes(`- ${stampOf(now - 300000, { now })} [汐] 刚说完那件事`), '当天原话仍显示时分')
assert.ok(r.block.includes('刚说完那件事'), '应带最近 30 分钟')
assert.ok(!r.block.split('\n').some((l) => l.endsWith('[汐] 看海')), '不应回声当前消息')
assert.ok(r.block.length <= 300, '≤300 字')
assert.ok(r.block.endsWith('【相关原话结束】'))

// 没有出处也不报错
const r2 = buildQuotesBlock(db, { cwd, hits: [], query: '看海', now })
assert.ok(r2.block.length <= 300)

console.log(JSON.stringify({ ok: true, test: 'quotes', len: r.block.length, tags: r.sources.tags }))
