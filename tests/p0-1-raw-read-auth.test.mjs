import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '/tmp/dy-raw-auth-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true })

const HOME = '/sdcard/DSHA/生活/数据/home'
const CONTACT = '/root/qq-agent/QQ会话/私聊_1000000009'
const GROUP = '/sdcard/DSHA/渠道/qq-群/123456'

const { openDb } = await import('../lib/store/db.js')
const { RawArchive, shortSid } = await import('../lib/ingest/archive.js')
const { createMemoryService } = await import('../lib/service.js')
const { scopeForSession } = await import('../lib/scope.js')
const { classifyOwner } = await import('../lib/owner.js')
const { insertMemory } = await import('../lib/store/memories.js')

const { db } = openDb(DIR)
new RawArchive({ db, dir: join(DIR, 'raw'), cwdPrefixes: [HOME, CONTACT, GROUP], log: { info() {}, warn() {} } })

const put = (cwd, text, { person = '', file = 'd/a.md', at = Date.now() } = {}) => {
  const full = `10:00:00 [1] 主人：${text}`
  db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,person_id)
    VALUES('2026-11-22',?,1,1,'user','','qq',0,?,?,?,'{}',?,?)`).run(file, full.length, full, at, cwd, person)
}
put(HOME, 'HOME_RAW_SENTINEL', { person: 'person:1', file: 'd/home.md' })
put(CONTACT, 'CONTACT_RAW_SENTINEL', { person: 'person:1', file: 'd/contact.md' })
put(GROUP, 'GROUP_RAW_SENTINEL', { person: 'person:1', file: 'd/group.md' })
put(HOME, 'CURRENT_SESSION_RAW', { file: `d/s-${shortSid('owner-1')}.md`, at: Date.now() + 1 })
put(HOME, 'PREV_SESSION_RAW', { file: 'd/s-prev.md', at: Date.now() + 2 })

const isOwner = (cwd) => classifyOwner(String(cwd ?? ''), { db, owner: { ownerPrivateDir: HOME }, trustedDirs: [HOME] }).isOwner
const scopeForHeader = (h) => scopeForSession({ cwd: String(h?.cwd ?? ''), sessionId: String(h?.id ?? h?.sessionId ?? ''), isOwner: isOwner(h?.cwd) })
const trusted = new Map([['owner-1', HOME], ['contact-1', CONTACT], ['group-1', GROUP]])
const isTrustedHeader = (h) => trusted.get(String(h?.id ?? h?.sessionId ?? '')) === String(h?.cwd ?? '')

const quiet = { info() {}, warn() {}, debug() {}, error() {} }
const svc = createMemoryService({
  db,
  recallFn: async () => [],
  getVectors: () => new Map(),
  getMonitor: () => null,
  getPersona: () => null,
  isOwnerHeader: (h) => isOwner(h?.cwd),
  isTrustedHeader,
  scopeForHeader,
  lastUserMessageAt: () => null,
  now: () => Date.now(),
  hasColumn: () => false,
  insertMemory,
  cfg: {},
  log: quiet,
  dataDir: DIR,
})

const perm = (fn) => assert.rejects(fn, (e) => e?.code === 'E_PERMISSION')

test('carryover 服务：身份必须来自可信 opts.header，业务 cwd 不得充当身份', async () => {
  // 1) 无 header/session，仅 owner home cwd
  await perm(() => svc.carryover({ cwd: HOME, limit: 5 }))
  // 2) 伪造 {cwd,id} header：非注册会话
  await perm(() => svc.carryover({ cwd: HOME, limit: 5 }, { header: { cwd: HOME, id: 'fake' } }))
  // 3) 普通联系人 header 请求 owner home
  await perm(() => svc.carryover({ cwd: HOME, limit: 5 }, { header: { cwd: CONTACT, id: 'contact-1' } }))
  // 4) 群聊 header 请求 owner home
  await perm(() => svc.carryover({ cwd: HOME, limit: 5 }, { header: { cwd: GROUP, id: 'group-1' } }))
  // 5) owner input.cwd 与 header.cwd 不一致
  await perm(() => svc.carryover({ cwd: CONTACT, limit: 5 }, { header: { cwd: HOME, id: 'owner-1' } }))
  // 6) owner 一致 cwd：仅允许当前授权范围
  const ok = await svc.carryover({ cwd: HOME, limit: 5 }, { header: { cwd: HOME, id: 'owner-1' } })
  assert.ok(ok.includes('HOME_RAW_SENTINEL'))
  assert.ok(!ok.includes('CONTACT_RAW_SENTINEL'))
  assert.ok(!ok.includes('GROUP_RAW_SENTINEL'))
  // 7) 缺少 session id
  await perm(() => svc.carryover({ cwd: HOME, limit: 5 }, { header: { cwd: HOME } }))
  // 8) 子智能体 header
  await perm(() => svc.carryover({ cwd: HOME, limit: 5 }, { header: { cwd: HOME, id: 'owner-1', delegationDepth: 1 } }))
  // 10) 当前 session 排除仍有效
  const sidBlock = await svc.carryover({ cwd: HOME, limit: 12 }, { header: { cwd: HOME, id: 'owner-1' } })
  assert.ok(sidBlock.includes('PREV_SESSION_RAW'))
  assert.ok(!sidBlock.includes('CURRENT_SESSION_RAW'))
})

const handlers = {}
const registered = {}
const ctx = {
  get(n) {
    if (n === 'tools') return { register: (d) => { registered[d.name] = d } }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    return undefined
  },
  on(e, f) { handlers[e] = f },
  provide() { return () => {} },
  logger: { info() {}, warn() {} },
}
const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: '1000000001', ownerPrivateDir: HOME, trustedDirs: [HOME] })
const tool = registered['dy_memory_person_archive']
assert.ok(tool, 'person_archive 工具应已注册')

const parse = (r) => JSON.parse(r.detail)
const execFor = (cwd, id) => ({ agent: { session: { header: { cwd, id } } } })

test('person_archive：仅 owner 当前会话可读 raw，默认不跨房间', async () => {
  const ownerHome = execFor(HOME, 'owner-1')
  const r1 = parse(await tool.execute({ personId: 'person:1', limit: 10 }, ownerHome))
  assert.equal(r1.ok, true)
  assert.ok(r1.items.some((x) => String(x.text).includes('HOME_RAW_SENTINEL')))
  assert.ok(!r1.items.some((x) => String(x.text).includes('CONTACT_RAW_SENTINEL')))
  assert.ok(!r1.items.some((x) => String(x.text).includes('GROUP_RAW_SENTINEL')))

  // 群聊 / 普通联系人 / 无上下文 → 拒绝
  for (const [label, exec] of [
    ['group', execFor(GROUP, 'group-1')],
    ['contact', execFor(CONTACT, 'contact-1')],
    ['no-exec', undefined],
  ]) {
    const r = parse(await tool.execute({ personId: 'person:1', limit: 10 }, exec))
    assert.equal(r.ok, false, label)
    assert.equal(r.code, 'E_PERMISSION', label)
    assert.equal((r.items || []).length, 0, label)
  }

  // 无 personId / 空 personId：只列当前会话的人，不返回 raw
  for (const args of [{}, { personId: '' }]) {
    const r = parse(await tool.execute({ ...args, limit: 20 }, ownerHome))
    assert.equal(r.ok, true)
    const all = JSON.stringify(r)
    assert.ok(!all.includes('HOME_RAW_SENTINEL'))
    assert.ok(!all.includes('CONTACT_RAW_SENTINEL'))
    assert.ok(!all.includes('GROUP_RAW_SENTINEL'))
    assert.ok(!all.includes('CURRENT_SESSION_RAW'))
  }
})
