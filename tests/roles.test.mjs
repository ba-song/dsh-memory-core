/**
 * 语义角色（阶段 3）
 * - 旧标签（主人/汐/汐·想、更早的 你/她/想）读取归一
 * - 新写入只写 user / self / self-thought；md 前缀保持稳定显示名
 * - 改名只影响显示，不影响任何 id 与存储
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

process.env.DY_MEMORY_DIR = '/tmp/dy-roles-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { normalizeRole, roleDisplay, archiveLabel, ROLE } = await import('../lib/roles.js')
const { buildThoughtsBlock } = await import('../lib/inject/context-blocks.js')
const { buildQuotesBlock } = await import('../lib/inject/quotes.js')

// ── 1. 归一 ─────────────────────────────────────────────────────
assert.equal(normalizeRole('主人'), ROLE.USER)
assert.equal(normalizeRole('你'), ROLE.USER)
assert.equal(normalizeRole('汐'), ROLE.SELF)
assert.equal(normalizeRole('她'), ROLE.SELF)
assert.equal(normalizeRole('汐·想'), ROLE.SELF_THOUGHT)
assert.equal(normalizeRole('想'), ROLE.SELF_THOUGHT)
assert.equal(normalizeRole('user'), ROLE.USER, '语义值应原样返回')
assert.equal(normalizeRole('具'), '具', '非对话角色原样返回')
assert.equal(normalizeRole(''), '')
assert.equal(normalizeRole(undefined), '')

// ── 2. 显示与改名 ───────────────────────────────────────────────
assert.equal(roleDisplay('user', { ownerName: '主人' }), '主人')
assert.equal(roleDisplay('self', { displayName: '汐' }), '汐')
assert.equal(roleDisplay('self-thought', { displayName: '汐' }), '汐·想')
assert.equal(roleDisplay('self', { displayName: '小八' }), '小八', '改名后显示新名')
assert.equal(roleDisplay('self-thought', { displayName: '小八' }), '小八·想')
assert.equal(roleDisplay('主人', {}), '主人', '旧值没有显式名字时用兜底')
assert.equal(roleDisplay('具', {}), '具')
assert.equal(archiveLabel('user'), '主人', 'md 前缀用稳定显示标签')
assert.equal(archiveLabel('self-thought'), '汐·想')

// ── 3. 写入：DB 语义角色，md 显示名 ─────────────────────────────
const dir = process.env.DY_MEMORY_DIR
const { db } = openDb(dir)
const cwd = '/root/qq-agent/QQ会话/私聊_1000000001'
const archive = new RawArchive({ db, dir: dir + '/raw', cwdPrefix: '/root/qq-agent/QQ会话', log: { info() {}, warn() {} } })
const session = { header: { id: 'sess-roles-1', cwd } }
const t = Date.now()
archive.onEvent(session, { type: 'user/message', seq: 1, time: t, data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '今天想去看海' }] } })
archive.onEvent(session, { type: 'assistant/message', seq: 2, time: t + 1000, data: { content: [{ type: 'reasoning', text: '她想去，那我记下来' }, { type: 'text', text: '那就周末去' }] } })

const roles = db.prepare('SELECT role FROM raw_meta ORDER BY id').all().map((r) => r.role)
assert.deepEqual(roles, ['user', 'self-thought', 'self'], '写入必须是语义角色（顺序：用户 → 思考 → 回复）')

const md = (await import('node:fs')).readFileSync(dir + '/raw/' + db.prepare('SELECT file FROM raw_meta LIMIT 1').get().file, 'utf8')
assert.match(md, /主人：今天想去看海/, 'md 前缀保持「主人」')
assert.match(md, /汐·想：她想去/, 'md 前缀保持「汐·想」')
assert.match(md, /汐：那就周末去/, 'md 前缀保持「汐」')

// ── 4. 旧角色行仍能读（混合库）────────────────────────────────
const oldAt = Date.now() - 86400000
db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd)
  VALUES('2026-10-31','2026-10-31/s-old.md',1,10,'主人','','qq',0,10,'10:00:00 [10] 主人：旧的看海记录',?, '{}', ?)`)
  .run(oldAt, cwd)
const oldId = Number(db.prepare('SELECT last_insert_rowid() id').get().id)
db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(oldId, '旧的 的看 看海 海记 记录')

// now 往后挪 3 分钟，避开「当前用户消息回声」过滤（buildQuotesBlock 会跳过 now-2min 内且含查询词的行）
const mixed = buildQuotesBlock(db, { cwd, hits: [], query: '看海', now: Date.now() + 180000 })
assert.ok(mixed.block.includes('[主人]'), '旧角色行仍按「主人」显示')

const thoughtBlock = buildThoughtsBlock(db, { cwd, hits: [{ source_ts: Date.now() }] })
assert.ok(thoughtBlock.block.includes('[汐·想]'), '语义角色思考行按「汐·想」显示（【相关思考】块）')

// ── 5. 改名不影响 id/存储 ──────────────────────────────────────
const before = db.prepare('SELECT count(*) c FROM raw_meta').get().c
const idsBefore = db.prepare('SELECT id FROM raw_meta ORDER BY id').all().map((r) => r.id)
// 改名 = 只改显示参数（阶段 3 里来自 persona.display_name / contacts.display_name）
const renamed = roleDisplay('self', { displayName: '小八' })
assert.equal(renamed, '小八')
const idsAfter = db.prepare('SELECT id FROM raw_meta ORDER BY id').all().map((r) => r.id)
assert.deepEqual(idsAfter, idsBefore, '改名不得改变任何 id')
assert.equal(db.prepare('SELECT count(*) c FROM raw_meta').get().c, before, '改名不得增删行')
assert.equal(db.prepare("SELECT count(*) c FROM raw_meta WHERE role='self'").get().c, 1, '存储角色不变')

console.log(JSON.stringify({
  ok: true, test: 'roles',
  written: roles,
  mixedOldRowShown: mixed.block.includes('[主人]'),
  thoughtShown: thoughtBlock.block.includes('[汐·想]'),
  renamed,
  rows: before,
}))
process.exit(0)
