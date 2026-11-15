/**
 * 契约 v1.3 `dyMemory.saveDiary` —— 2026-11-05
 *
 * +8 组：成功写文件 / 命名与 seq / 权限拒绝 / 空文本 / 超长 / 子智能体拒 /
 *        plugin 写身份放行 / 不产生 memories、raw_meta 行。
 * 只在临时 DATA_DIR 测；线上 diary/ 的 50 篇历史不碰。
 */
import assert from 'node:assert'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = '/tmp/dy-diary-' + process.pid
process.env.DY_MEMORY_DIR = DATA_DIR
rmSync(DATA_DIR, { recursive: true, force: true })
mkdirSync(DATA_DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { createMemoryService } = await import('../lib/service.js')

const OWNER_DIR = '/root/qq-agent/QQ会话/私聊_1000000001'
const GROUP_DIR = '/root/qq-agent/QQ会话/群_707380948'
const { db } = openDb(DATA_DIR)
const log = { info() {}, warn() {} }

const make = (dataDir = DATA_DIR) => createMemoryService({
  db,
  cfg: { servicePluginWriteAllowlist: ['dsh-autonomy'] },
  log,
  dataDir,
  isOwnerHeader: (h) => String(h?.cwd ?? '') === OWNER_DIR,
  hasColumn: () => false,
  insertMemory,
  recallFn: async () => [],
  getVectors: () => new Map(),
  getMonitor: () => null,
  getPersona: () => null,
  lastUserMessageAt: () => null,
  now: () => Date.now(),
})
const svc = make()
const owner = { cwd: OWNER_DIR, id: 's1' }
const plugin = { origin: 'plugin', plugin: 'dsh-autonomy' }
const out = { ok: true, test: 'diary-service' }

// ── 1. 成功写文件：头字段 + 正文 + 返回值 ────────────────────────
const at = new Date(2026, 10, 5, 16, 30, 1).getTime()   // 2026-11-05 16:30:01 本地
const r1 = await svc.saveDiary({ text: '今天海边风很大', at, title: '海边', mood: '开心', tags: ['海', '夜'], header: owner })
assert.equal(r1.date, '2026-11-05')
assert.equal(r1.seq, 1)
assert.match(r1.path, /diary\/2026-11-05\/163001-01\.md$/)
const raw1 = readFileSync(r1.path, 'utf8')
assert.match(raw1, /^---\nid: 20261105-163001-01\ndate: 2026-11-05\n/)
assert.match(raw1, /\nauthor: self\n/)
assert.match(raw1, /\nmood: 开心\n/)
assert.match(raw1, /\ntags: 海,夜\n/)
assert.match(raw1, /\ntitle: 海边\n/)
assert.match(raw1, /\nschema: 1\n---\n\n今天海边风很大\n$/)
assert.equal(r1.bytes, Buffer.byteLength(raw1))
assert.equal(r1.id, '20261105-163001-01')
out.write = 'ok'

// ── 2. 同秒多篇 seq 递增；不同秒不同文件名 ──────────────────────
const r2 = await svc.saveDiary({ text: '同一秒第二篇', at, header: owner })
const r3 = await svc.saveDiary({ text: '下一分钟', at: at + 60000, header: owner })
assert.equal(r2.seq, 2)
assert.match(r2.path, /163001-02\.md$/)
assert.equal(r3.seq, 1)
assert.match(r3.path, /163101-01\.md$/)
assert.ok(existsSync(r1.path) && existsSync(r2.path) && existsSync(r3.path))
out.seq = 'ok'

// ── 3. 权限拒绝：无 header / 群 / 子智能体 / 其它插件 ────────────
const codeOf = async (fn) => { try { await fn(); return 'OK' } catch (e) { return e.code } }
assert.equal(await codeOf(() => svc.saveDiary({ text: 'x' })), 'E_PERMISSION', '无 header')
assert.equal(await codeOf(() => svc.saveDiary({ text: 'x', header: { cwd: GROUP_DIR, id: 'g' } })), 'E_PERMISSION', '群')
assert.equal(await codeOf(() => svc.saveDiary({ text: 'x', header: { ...owner, origin: 'subagent' } })), 'E_PERMISSION', '子智能体')
assert.equal(await codeOf(() => svc.saveDiary({ text: 'x', header: { ...owner, delegationDepth: 1 } })), 'E_PERMISSION', '委派深度')
assert.equal(await codeOf(() => svc.saveDiary({ text: 'x', header: { origin: 'plugin', plugin: 'dsh-evil' } })), 'E_PERMISSION', '非白名单插件')
out.permission = 'ok'

// ── 4. 空文本 ───────────────────────────────────────────────────
assert.equal(await codeOf(() => svc.saveDiary({ text: '   ', header: owner })), 'E_INVALID_ARG')
out.empty = 'ok'

// ── 5. 超长（>20000） ──────────────────────────────────────────
assert.equal(await codeOf(() => svc.saveDiary({ text: 'x'.repeat(20001), header: owner })), 'E_INVALID_ARG')
out.tooLong = 'ok'

// ── 6. 子智能体即使带 plugin 身份也拒 ───────────────────────────
assert.equal(await codeOf(() => svc.saveDiary({ text: 'x', header: { ...plugin, parentSession: 'p' } })), 'E_PERMISSION')
out.subagent = 'ok'

// ── 7. plugin 写身份放行 ───────────────────────────────────────
const r4 = await svc.saveDiary({ text: '她说今天想早点睡', at: at + 120000, header: plugin })
assert.match(r4.path, /163201-01\.md$/)
assert.ok(existsSync(r4.path))
out.plugin = 'ok'

// ── 8. 不写 memories / raw_meta；缺 dataDir 时报 E_INVALID_ARG ──
assert.equal(db.prepare('SELECT count(*) c FROM memories').get().c, 0, '不许写 memories')
const hasRaw = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='raw_meta'").get()
if (hasRaw) assert.equal(db.prepare('SELECT count(*) c FROM raw_meta').get().c, 0, '不许写 raw_meta')
const svcNoDir = make('')
assert.equal(await codeOf(() => svcNoDir.saveDiary({ text: 'x', header: owner })), 'E_INVALID_ARG', '缺 dataDir')
// 服务没有读取方法
for (const m of ['getDiary', 'listDiary', 'searchDiary', 'recentDiary']) assert.equal(typeof svc[m], 'undefined', `不应有 ${m}`)
out.noSideEffects = 'ok'

console.log(JSON.stringify(out))
