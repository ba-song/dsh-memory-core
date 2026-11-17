process.env.TZ = "Asia/Shanghai"   // 展示/归档固定北京时间，测试同日历
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'
import assert from 'node:assert'
import { rmSync, readFileSync, existsSync } from 'node:fs'

const dir = '/tmp/dy-raw-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const raw = new RawArchive({ db, dir: dir + '/raw', log: console })

const sid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const session = { header: { id: sid, cwd: '/root/qq-agent/QQ会话/私聊_1' } }
let seq = 0
const ev = (type, data, t) => ({ type, data, seq: ++seq, time: t })

raw.onEvent(session, ev('user/message', { content: [{ type: 'text', text: '主人：我喜欢看海' }] }, Date.now() - 60000))
raw.onEvent(session, ev('assistant/message', { content: [{ type: 'reasoning', text: '她说过喜欢看海，我该接住' }, { type: 'text', text: '我记得你喜欢看海，也爱吃海鲜' }] }, Date.now() - 59000))
// 撤回第二条
const recallSeq = 2
raw.onEvent(session, ev('message/recall', { seq: recallSeq }, Date.now() - 5000))

// 1) 文件写了、格式对
const _d = new Date(); const day = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`
const file = `${dir}/raw/${day}/s-${sid.slice(0, 8)}.md`
assert.ok(existsSync(file), '档案文件应存在')
const text = readFileSync(file, 'utf8')
assert.match(text, /主人：主人：我喜欢看海/)
assert.match(text, /汐·想：她说过喜欢看海/)

// 2) 检索能命中，且撤回行被跳过
const hit = raw.search('喜欢看海', { limit: 5, minScore: 0 })
assert.ok(hit.length >= 1, '应能搜到')
assert.ok(!hit.some((r) => /也爱吃海鲜/.test(r.snippet)), '撤回的那条不应被召回')

// 3) 最低分门生效
const strict = raw.search('喜欢看海', { limit: 5, minScore: 0.99 })
assert.ok(strict.length <= 1, '高分门下最多 1 条')

// 4) verify 返回哈希
const v = raw.verify(day)
assert.ok(v.ok && v.files.length === 1 && v.files[0].hash.length === 16)

console.log(JSON.stringify({ ok: true, test: 'archive', lines: text.split('\n').filter(Boolean).length, hits: hit.length }))
