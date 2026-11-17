process.env.TZ = "Asia/Shanghai"   // 展示/归档固定北京时间，测试同日历
import assert from 'node:assert'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'

const dir = '/tmp/dy-p53-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const raw = new RawArchive({ db, dir: join(dir, 'raw'), log: { info() {}, warn() {} } })
const session = { header: { id: 'aaaaaaaa-bbbb', cwd: '/root/qq-agent/QQ会话/私聊_test' } }
let seq = 0
const emit = (type, data) => raw.onEvent(session, { type, seq: ++seq, time: Date.now(), data })

emit('user/message', { content: [{ type: 'text', text: '[饲养员] 帮我看下 13800138000 这个号' }, { type: 'image', name: 'a.png', size: 12 }] })
emit('assistant/message', { content: [
  { type: 'reasoning', text: '先查一下她的号码，再决定' },
  { type: 'text', text: '我看看' },
], usage: { inputTokens: 1200, outputTokens: 30, cacheReadTokens: 800 } })
emit('tool/call', { name: 'dy_memory_add', arguments: { text: '号码 13800138000', token: 'abc123', nested: { password: 'p@ss' } } })
emit('tool/result', { content: [{ type: 'text', text: '身份证 110101199001011234 已记录' }], isError: false })
emit('agent/error', { error: { message: 'boom' } })
emit('step/start', { step: 1 })
emit('request/context', { model: 'deepseek-flash', contextWindow: 1000000 })
emit('compaction/summary', { summary: '之前聊了看海' })
emit('session/title', { title: '看海的事' })
emit('todo/write', { items: [{ text: '买猫粮' }] })
emit('system/message', { content: [{ type: 'text', text: 'x'.repeat(5000) }] })

const _d = new Date(); const _p = (n) => String(n).padStart(2, '0'); const _day = `${_d.getFullYear()}-${_p(_d.getMonth()+1)}-${_p(_d.getDate())}`
const file = join(dir, 'raw', _day, 's-aaaaaaaa.md')
const md = readFileSync(file, 'utf8')
for (const role of ['主人', '图', '汐', '汐·想', '具', '果', '错', '步', '境', '压', '题', '待', '系']) {
  assert.ok(new RegExp(role + '：').test(md), '缺角色 ' + role)
}
assert.ok(!md.includes('13800138000'), '手机号应打码')
assert.ok(!md.includes('110101199001011234'), '身份证应打码')
assert.ok(!md.includes('abc123'), 'token 值应打码')
assert.ok(!md.includes('p@ss'), 'password 值应打码')
assert.ok(md.includes('***'))
assert.ok(md.includes('len=5000'), 'system 只记长度')
assert.ok(!md.includes('x'.repeat(100)), 'system 正文不应落盘')
assert.ok(md.includes('in=1200'), 'usage 要记录')

const extras = db.prepare("select role, extra from raw_meta where extra<>'{}'").all()
assert.ok(extras.length >= 3, 'extra 应有记录')
assert.ok(extras.some((r) => r.role === '量' && r.extra.includes('"in":1200')))

// 图片结果不能记成空
emit('tool/result', { content: [{ type: 'image', name: 'pic.jpg', size: 2048 }], isError: false })
const md3 = readFileSync(file, 'utf8')
assert.ok(md3.includes('[图片] pic.jpg 2048 bytes'), '图片结果要有标记')
assert.ok(!md3.includes('果：(空结果)'), '图片结果不能记成空')

// 长结果不截断
const long = '很长的工具结果'.repeat(1000)
emit('tool/result', { content: [{ type: 'text', text: long }], isError: false })
const md2 = readFileSync(file, 'utf8')
assert.ok(md2.includes('很长的工具结果'.repeat(1000)), '10KB 级结果不截断')

console.log(JSON.stringify({ ok: true, test: 'archive-p53', roles: 13, extras: extras.length }))
