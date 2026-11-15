/**
 * 原话/quote 的 tombstone + [SILENT] 过滤（2026-11-06）
 * 生产：测试对话已 tombstone，但【相关原话】仍出现 19:36 内容与 [SILENT]。
 * 本测试钉住：tombstone 行不被 quote 命中、raw_fts 同步删除、重建实例后仍不命中；
 * [SILENT]（等于/开头）与空白永不入 5 条原话，也不落新档案。
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '/tmp/dy-quote-tomb-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { buildQuotesBlock } = await import('../lib/inject/quotes.js')
const { readArchive, searchArchive } = await import('../lib/archive/tools.js')
const { dayOf } = await import('../lib/adapter/timefmt.js')
const { bigrams } = await import('../lib/store/fts.js')

const { db } = openDb(DIR)
const log = { info() {}, warn() {} }
const cwd = '/sdcard/DSHA/生活/数据/home'
const raw = new RawArchive({ db, dir: join(DIR, 'raw'), cwdPrefixes: [cwd], log })
const now = Date.now()
const day = dayOf(now)
const file = `${day}/s-abc.md`

const mk = (line, seq, role, text, at) => {
  const id = Number(db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,channel,raw_text,at,tombstone,cwd)
    VALUES(?,?,?,?,?,?,?,?,0,?)`).run(day, file, line, seq, role, 'qq', text, at, cwd).lastInsertRowid)
  db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text))
  return id
}
const idA = mk(1, 1, 'user', `19:36:10 [1] 主人：我正在打电话，等下再说`, now - 5 * 60000)
const idB = mk(2, 2, 'self', `19:36:14 [2] 汐：[SILENT]`, now - 2000)
const idD = mk(3, 3, 'self', `19:36:16 [3] 汐：[SILENT] 不想说话`, now - 3000)
const idC = mk(4, 4, 'self', `19:31:25 [4] 汐：嗯，去吧。`, now - 4000)

const out = { ok: true, test: 'quote-tombstone' }

// 1) 未 tombstone 前：[SILENT] 已被过滤，正常原话保留
{
  const b = buildQuotesBlock(db, { cwd, now })
  assert.ok(b.block.includes('我正在打电话'), '正常查询应命中')
  assert.ok(b.block.includes('嗯，去吧。'))
  assert.ok(!b.block.includes('[SILENT]'), '[SILENT] 不许进 5 条原话')
  assert.equal(b.sources.count <= 5, true)
  const q = buildQuotesBlock(db, { cwd, now, query: '打电话' })
  assert.ok(q.block.includes('我正在打电话'))
  assert.ok(!q.block.includes('[SILENT]'))
  out.pre = 'ok'
}

// 2) tombstone：raw_fts 同步删除 + raw_meta 置 1
{
  raw.tombstone('abc', 1)
  const row = db.prepare('SELECT tombstone FROM raw_meta WHERE id=?').get(idA)
  assert.equal(row.tombstone, 1)
  const fts = db.prepare('SELECT count(*) c FROM raw_fts WHERE rowid=?').get(idA)
  assert.equal(fts.c, 0, 'tombstone 必须清 raw_fts，不能留陈旧索引')
  out.tombstone = 'ok'
}

// 3) tombstone 后：query/recent 两条源都不再命中；raw.search 也不命中
{
  const q = buildQuotesBlock(db, { cwd, now, query: '打电话' })
  assert.ok(!q.block.includes('我正在打电话'), 'tombstone 行不许被 query 源命中')
  const recent = buildQuotesBlock(db, { cwd, now })
  assert.ok(!recent.block.includes('我正在打电话'), 'tombstone 行不许被 recent 源命中')
  assert.ok(recent.block.includes('嗯，去吧。'))
  const s = raw.search('打电话', { cwd, channel: 'qq', limit: 5 })
  assert.equal(s.length, 0, 'raw.search 必须 JOIN raw_meta 过滤 tombstone')
  out.afterTombstone = 'ok'
}

// 4) 模拟重启/重建索引：新实例、同一 DB，仍不命中
{
  const raw2 = new RawArchive({ db, dir: join(DIR, 'raw'), cwdPrefixes: [cwd], log })
  const s = raw2.search('打电话', { cwd, channel: 'qq', limit: 5 })
  assert.equal(s.length, 0, '重建实例后仍以 DB 为准，不命中 tombstone')
  const b = buildQuotesBlock(db, { cwd, now })
  assert.ok(!b.block.includes('我正在打电话'))
  out.rebuild = 'ok'
}

// 5) 档案读取也不出现 [SILENT] / tombstone
{
  const r = readArchive(db, { days: 1, limit: 40, cwd })
  assert.ok(!r.text.includes('[SILENT]'))
  assert.ok(!r.text.includes('我正在打电话'))
  assert.ok(r.text.includes('嗯，去吧。'))
  const s = searchArchive(db, { question: '打电话', cwd })
  assert.equal(s.count, 0)
  out.archive = 'ok'
}

// 6) 新的 [SILENT] 助手消息不落档案、不进 raw_fts
{
  raw.onEvent(
    { header: { id: 'sess-silent', cwd } },
    { type: 'assistant/message', seq: 99, time: now, data: { content: [{ type: 'text', text: '[SILENT]' }] } },
  )
  const n = db.prepare("SELECT count(*) c FROM raw_meta WHERE raw_text LIKE '%[SILENT]%' AND seq=99").get().c
  assert.equal(n, 0, '[SILENT] 不落档案')
  const f = db.prepare("SELECT count(*) c FROM raw_fts WHERE text LIKE '%[SILENT]%'").get().c
  assert.equal(f, 0, '[SILENT] 不进 raw_fts')
  out.noArchive = 'ok'
}

console.log(JSON.stringify(out))
process.exit(0)
