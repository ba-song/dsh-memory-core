/**
 * P0 scope：原话/档案不跨房间（2026-11-06）
 * external 只读自己 cwd 的 raw；group 不给 raw；owner 全量。
 */
import assert from 'node:assert'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '/tmp/dy-scope-raw-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { readArchive, searchArchive } = await import('../lib/archive/tools.js')
const { bigrams } = await import('../lib/store/fts.js')
const { dayOf } = await import('../lib/adapter/timefmt.js')

const { db } = openDb(DIR)
const log = { info() {}, warn() {} }
const raw = new RawArchive({ db, dir: join(DIR, 'raw'), cwdPrefixes: ['/sdcard/DSHA/渠道/douyin', '/root/qq-agent/QQ会话'], log })

const OWNER_QQ = '1000000001'
const ownerDir = `/root/qq-agent/QQ会话/私聊_${OWNER_QQ}`
const cwdA = '/sdcard/DSHA/渠道/douyin/123'
const cwdB = '/sdcard/DSHA/渠道/douyin/456'
const groupDir = '/root/qq-agent/QQ会话/群_123456'
const day = dayOf(Date.now())
const at = Date.now()
let line = 0
const ins = (cwd, text) => {
  line += 1
  const id = Number(db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,channel,raw_text,at,tombstone,cwd)
    VALUES(?,?,?,?,?,?,?,?,0,?)`).run(day, 'x.md', line, line, 'user', 'douyin', text, at, cwd).lastInsertRowid)
  db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text))
  return id
}
const rowA = ins(cwdA, '本房间原话：今天看海')
const rowB = ins(cwdB, '别的房间原话：昨天看海')

// 1) 函数层 cwd 过滤
{
  const r = readArchive(db, { days: 1, limit: 40, cwd: cwdA })
  assert.ok(r.text.includes('本房间原话')); assert.ok(!r.text.includes('别的房间原话'))
  const s = searchArchive(db, { question: '看海', cwd: cwdA })
  assert.ok(s.text.includes('本房间原话')); assert.ok(!s.text.includes('别的房间原话'))
  const q = raw.search('看海', { cwd: cwdA, channel: 'douyin', limit: 5 })
  assert.equal(q.length, 1); assert.equal(q[0].id, rowA)
  const qb = raw.search('看海', { cwd: cwdB, channel: 'douyin', limit: 5 })
  assert.equal(qb.length, 1); assert.equal(qb[0].id, rowB)
}

// 2) 工具层：external 只读自己房间；group 空 + 审计；owner 全量
const registered = {}
const services = new Map()
const ctx = {
  get(n) {
    if (n === 'tools') return { register: (d) => { registered[d.name] = d } }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    return services.get(n)
  },
  provide(n, v) { services.set(n, v); return () => services.delete(n) },
  on() {},
  logger: { info() {}, warn() {} },
}
const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: OWNER_QQ })
const call = (name, args, { cwd, id }) => registered[name].execute(args, { agent: { session: { header: { cwd, id } } } }).then((r) => JSON.parse(r.detail))

{
  const extRead = await call('dy_archive_read', { limit: 40 }, { cwd: cwdA, id: 's-ext' })
  assert.ok(extRead.text.includes('本房间原话')); assert.ok(!extRead.text.includes('别的房间原话'), 'external 不许跨房间')
  const extQuote = await call('dy_memory_quote_search', { query: '看海', limit: 5 }, { cwd: cwdA, id: 's-ext' })
  assert.equal(extQuote.count, 1)
  assert.ok(extQuote.items[0].snippet.includes('本房间原话'))

  const grpRead = await call('dy_archive_read', { limit: 40 }, { cwd: groupDir, id: 's-grp' })
  assert.equal(grpRead.count, 0); assert.equal(grpRead.scopeBlocked, true)
  const grpQuote = await call('dy_memory_quote_search', { query: '看海' }, { cwd: groupDir, id: 's-grp' })
  assert.equal(grpQuote.count, 0); assert.equal(grpQuote.scopeBlocked, true)

  const ownerRead = await call('dy_archive_read', { limit: 40 }, { cwd: ownerDir, id: 's-owner' })
  assert.ok(ownerRead.text.includes('本房间原话')); assert.ok(ownerRead.text.includes('别的房间原话'), 'owner 可全量')

  const audit = join(DIR, 'logs', 'scope-audit.log')
  assert.equal(existsSync(audit), true)
  assert.match(readFileSync(audit, 'utf8'), /dy_archive_read/)
}

console.log(JSON.stringify({ ok: true, test: 'scope-raw', rowA, rowB }))
process.exit(0)
