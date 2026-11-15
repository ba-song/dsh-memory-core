process.env.TZ = "Asia/Shanghai"   // 展示/归档固定北京时间，测试同日历
/**
 * B-11 归档文件名修复 —— 2026-11-05
 *
 * 现状：宿主会话 id 形如 `session-b87bb63e-…`，旧实现取前 8 位正好是 `session-`，
 * 于是所有会话共用 `raw/<day>/s-session-.md`。本测试钉住新规则与旧行为兼容。
 */
import assert from 'node:assert'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = '/tmp/dy-afn-' + process.pid
process.env.DY_MEMORY_DIR = DATA_DIR
rmSync(DATA_DIR, { recursive: true, force: true })
mkdirSync(DATA_DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { RawArchive, shortSid } = await import('../lib/ingest/archive.js')

const out = { ok: true, test: 'archive-filename' }

// ── shortSid 单元 ────────────────────────────────────────────────
assert.equal(shortSid('session-b87bb63e-13c2-4bc1-b981-3c7c46e3e9ba'), 'b87bb63e', '去掉 session- 前缀')
assert.equal(shortSid('9d1cfb9f-ce10-f509-60d1-c6d8f379077d'), '9d1cfb9f', '无前缀 id 行为不变')
assert.notEqual(shortSid('session-aaaa1111-x'), shortSid('session-bbbb2222-x'), '两个 session 必须不同')
assert.equal(shortSid('session-').length, 8, '空 body → 用 hash 兜底，不能是空串')
assert.notEqual(shortSid('session-'), shortSid(''), '不同输入不同 hash')
assert.equal(shortSid(''), 'unknown')
assert.equal(shortSid('ab'), 'ab', '极短 id 保持旧行为（原样）')
out.shortSid = 'ok'

// ── 落盘：两个会话两个文件 ───────────────────────────────────────
const { db } = openDb(DATA_DIR)
const archive = new RawArchive({ db, dir: join(DATA_DIR, 'raw'), cwdPrefix: '/root/qq-agent/QQ会话', log: { info() {}, warn() {} } })
const cwd = '/root/qq-agent/QQ会话/私聊_1000000001'
const day = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()
const emit = (sid, seq, text) => archive.onEvent(
  { header: { id: sid, cwd } },
  { type: 'user/message', seq, time: Date.now(), data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text }] } },
)
emit('session-b87bb63e-13c2-4bc1-b981-3c7c46e3e9ba', 1, '今天天气不错')
emit('session-c1d2e3f4-0000-0000-0000-000000000000', 1, '另一个会话说的话')

const dir = join(DATA_DIR, 'raw', day)
assert.ok(existsSync(join(dir, 's-b87bb63e.md')), '会话一应落到 s-b87bb63e.md')
assert.ok(existsSync(join(dir, 's-c1d2e3f4.md')), '会话二应落到 s-c1d3e3f4.md（各自独立）')
assert.ok(!existsSync(join(dir, 's-session-.md')), '不许再出现共用的 s-session-.md')
out.split = 'ok'

// ── 内容不变 ────────────────────────────────────────────────────
const line1 = readFileSync(join(dir, 's-b87bb63e.md'), 'utf8').trim().split('\n').at(-1)
assert.match(line1, /^\d{2}:\d{2}:\d{2} \[\d+\] 主人：今天天气不错$/, '行格式不变')
assert.match(readFileSync(join(dir, 's-c1d2e3f4.md'), 'utf8'), /主人：另一个会话说的话/)
out.format = 'ok'

// ── 旧文件不动：预置 s-session-.md，再归档新会话，旧文件字节不变 ──
const legacyPath = join(dir, 's-session-.md')
writeFileSync(legacyPath, '00:00:00 [1] 主人：旧文件内容\n')
const before = readFileSync(legacyPath, 'utf8')
emit('session-ffffffff-1111-2222-3333-444444444444', 1, '再来一条')
assert.equal(readFileSync(legacyPath, 'utf8'), before, '已有旧文件不许被改写')
assert.ok(existsSync(join(dir, 's-ffffffff.md')), '新会话独立成文件')
out.legacyUntouched = 'ok'

// ── 无前缀 id 兼容（回归） ──────────────────────────────────────
emit('9d1cfb9f-ce10-f509-60d1-c6d8f379077d', 1, '老会话')
assert.ok(existsSync(join(dir, 's-9d1cfb9f.md')), '老 id 仍取前 8 位')
out.compat = 'ok'

console.log(JSON.stringify(out))
