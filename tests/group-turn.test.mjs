/**
 * 群聊轮次写入记忆（2026-11-09）
 *
 * 覆盖：
 *   1) 配置解析：默认值 / 部分键 / 非法值回落 / 越界夹区间
 *   2) 群号校验 6–20 位数字
 *   3) saveGroupTurn 无 header 写入：scope_type/scope_id/source_* / importance / confidence / TTL meta
 *   4) 去重：同 at 二次调用 duplicate=true 且库不增
 *   5) 限额：maxPerHour=1 时第二次 rate-limited
 *   6) 空输入 / bad-groupId 返回 ok:false 且不写库
 *   7) 截断：说话人 20 / 单条 200 / 总长 maxChars（默认 600、可配 100）
 *   8) TTL 清理：过期 group 行软删、未过期 group 与 owner 行不受影响、幂等
 *
 * 用临时 DB（/tmp），不碰生产库 /sdcard/DSHA/记忆/数据/memory.db。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'

const DIR = '/tmp/dy-group-turn-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { createMemoryService } = await import('../lib/service.js')
const { buildGroupTurn, isGroupId, groupTurnMsgId } = await import('../lib/group/turn.js')
const { groupMemoryConfig, GROUP_MEMORY_DEFAULTS } = await import('../lib/config.js')
const { pruneGroupMemories } = await import('../lib/group/ttl.js')

const out = { ok: true, test: 'group-turn' }
const { db } = openDb(DIR)
const log = { info() {}, warn() {} }

const svcWith = (cfg = {}) => createMemoryService({
  db,
  cfg,
  log,
  recallFn: () => [],
  getVectors: () => new Map(),
  getMonitor: () => null,
  getPersona: () => null,
  isOwnerHeader: (h) => String(h?.cwd ?? '').includes('/生活/数据/home'),
  insertMemory,
})
const countGroup = (gid) => Number(db.prepare("SELECT count(*) c FROM memories WHERE scope_type='group' AND scope_id=?").get(`qq:${gid}`).c)
const rowOf = (id) => db.prepare('SELECT * FROM memories WHERE id=?').get(id)

// ── 1) 配置解析 ──────────────────────────────────────────────
assert.deepEqual(groupMemoryConfig({}), { ...GROUP_MEMORY_DEFAULTS }, '缺省=默认')
assert.deepEqual(
  groupMemoryConfig({ groupMemory: { maxPerHour: 3 } }),
  { ...GROUP_MEMORY_DEFAULTS, maxPerHour: 3 },
  '部分键只覆盖自己，其余回落默认',
)
assert.equal(groupMemoryConfig({ groupMemory: { maxPerHour: 'abc' } }).maxPerHour, 12, '非数字回落默认')
assert.equal(groupMemoryConfig({ groupMemory: { maxPerHour: 0 } }).maxPerHour, 1, '越界夹到下限')
assert.equal(groupMemoryConfig({ groupMemory: { ttlDays: -5 } }).ttlDays, 1)
assert.equal(groupMemoryConfig({ groupMemory: { maxChars: 99999 } }).maxChars, 2000)
assert.equal(groupMemoryConfig({ groupMemory: null }).maxPerHour, 12, 'groupMemory=null 也回落默认')
assert.equal(groupMemoryConfig({}).maxChars, 600)

// ── 2) 群号校验 ──────────────────────────────────────────────
assert.equal(isGroupId('707380948'), true)
assert.equal(isGroupId('123456'), true, '6 位下限')
assert.equal(isGroupId('12345'), false, '5 位非法')
assert.equal(isGroupId('1'.repeat(20)), true, '20 位上限')
assert.equal(isGroupId('1'.repeat(21)), false)
assert.equal(isGroupId('12ab34'), false)
assert.equal(groupTurnMsgId('707380948', 1760000000000), 'group-turn:707380948:1760000000000')

// ── 3) 正常写入（无 header）──────────────────────────────────
const AT = 1760000000000
const svc = svcWith()
const r = await svc.saveGroupTurn({
  groupId: '707380948',
  groupName: '测试群',
  incoming: [{ speaker: '阿岚', text: '今天去看了海' }, { speaker: '小周', text: '风超大' }],
  reply: [{ text: '我也想看' }],
  at: AT,
})
assert.equal(r.ok, true, '桥调用不要求 header')
assert.equal(r.duplicate, undefined)
assert.ok(r.id > 0)
const m = rowOf(r.id)
assert.equal(m.kind, 'episode')
assert.equal(m.layer, 'auto')
assert.equal(m.scope_type, 'group')
assert.equal(m.scope_id, 'qq:707380948')
assert.equal(m.source_channel, 'qq-group')
assert.equal(m.source_msg_id, `group-turn:707380948:${AT}`)
assert.equal(m.source_ts, AT)
assert.equal(m.extractor_version, 'group-turn-v1')
assert.equal(m.importance, 0.35)
assert.equal(m.confidence, 0.6)
assert.equal(m.status, 'active')
assert.equal(m.text, '[群·测试群（707380948）] 阿岚：今天去看了海\n小周：风超大\n我：我也想看')
assert.equal(r.chars, m.text.length)
assert.ok(m.text.length <= 600)
assert.equal(db.prepare('SELECT v FROM meta WHERE k=?').get(`group_ttl_${r.id}`).v, '90', 'TTL meta 写对')

// 群名为空时用「群」兜底，不出现空括号
const noName = await svc.saveGroupTurn({ groupId: '707380949', incoming: [{ speaker: '', text: 'hi' }], at: 1 })
assert.ok(rowOf(noName.id).text.startsWith('[群·群（707380949）] 群友：hi'), '群名/说话人兜底')

// ── 4) 去重：同 at 二次调用 ─────────────────────────────────
const r2 = await svc.saveGroupTurn({
  groupId: '707380948',
  groupName: '测试群',
  incoming: [{ speaker: '阿岚', text: '改过的内容' }],
  reply: [],
  at: AT,
})
assert.equal(r2.ok, true)
assert.equal(r2.duplicate, true, '同 at 判重')
assert.equal(r2.id, r.id)
assert.equal(r2.chars, m.text.length, 'duplicate 返回库内正文长度')
assert.equal(countGroup('707380948'), 1, '去重不增库')

// ── 5) 限额：maxPerHour=1 ───────────────────────────────────
const limited = svcWith({ groupMemory: { maxPerHour: 1 } })
const a = await limited.saveGroupTurn({ groupId: '111111', incoming: [{ speaker: 'A', text: '一' }], at: 2000 })
assert.equal(a.ok, true)
const b = await limited.saveGroupTurn({ groupId: '111111', incoming: [{ speaker: 'A', text: '二' }], at: 2001 })
assert.equal(b.ok, false)
assert.equal(b.reason, 'rate-limited')
assert.equal(countGroup('111111'), 1, '被限额的一轮不写库')

// 日限额同口径（maxPerDay=1）
const daily = svcWith({ groupMemory: { maxPerDay: 1 } })
assert.equal((await daily.saveGroupTurn({ groupId: '666666', incoming: [{ speaker: 'A', text: '一' }], at: 6000 })).ok, true)
const d2 = await daily.saveGroupTurn({ groupId: '666666', incoming: [{ speaker: 'A', text: '二' }], at: 6001 })
assert.equal(d2.ok, false)
assert.equal(d2.reason, 'rate-limited')
assert.equal(countGroup('666666'), 1)

// ── 6) 空输入 / bad-group 不写库 ────────────────────────────
assert.deepEqual(await svc.saveGroupTurn({ groupId: '222222', incoming: [], reply: [] }), { ok: false, reason: 'empty' })
assert.equal((await svc.saveGroupTurn({ groupId: '222222', incoming: [{ speaker: 'A', text: '   ' }], reply: [{ text: '' }] })).reason, 'empty')
assert.equal((await svc.saveGroupTurn({ groupId: '12345', incoming: [{ speaker: 'A', text: 'x' }] })).reason, 'bad-group')
assert.equal((await svc.saveGroupTurn({ groupId: '12ab', incoming: [{ speaker: 'A', text: 'x' }] })).reason, 'bad-group')
assert.equal((await svc.saveGroupTurn({ groupId: '', incoming: [{ speaker: 'A', text: 'x' }] })).reason, 'bad-group')
assert.equal((await svc.saveGroupTurn({})).reason, 'bad-group')
assert.equal((await svc.saveGroupTurn({ groupId: '777777' })).reason, 'empty', 'incoming/reply 缺省也安全')
assert.equal(countGroup('222222'), 0)
assert.equal(countGroup('12345'), 0)
assert.equal(countGroup('707380949'), 1, '合法的一轮仍在（上面 noName）')

// ── 7) 截断：说话人 20 / 单条 200 / 总长 600 ────────────────
const longRes = await svc.saveGroupTurn({
  groupId: '333333',
  groupName: '长群',
  incoming: [{ speaker: '说'.repeat(40), text: '文'.repeat(300) }],
  reply: [{ text: '好'.repeat(300) }],
  at: 3000,
})
assert.equal(longRes.ok, true)
const lt = rowOf(longRes.id).text
assert.ok(lt.length <= 600)
assert.ok(lt.includes('说'.repeat(19) + '…'), '说话人截到 20 字（含省略号）')
assert.ok(!lt.includes('说'.repeat(20)), '不说话人超 20 字')
assert.ok(lt.includes('文'.repeat(199) + '…'), '单条截到 200 字')
assert.ok(!lt.includes('文'.repeat(200)))
assert.ok(lt.endsWith('…'))
assert.ok(lt.includes('我：'))

const many = await svc.saveGroupTurn({
  groupId: '444444',
  incoming: Array.from({ length: 10 }, (_, i) => ({ speaker: `人${i}`, text: '字'.repeat(200) })),
  at: 4000,
})
const mt = rowOf(many.id).text
assert.equal(mt.length, 600, '总长截到默认 600')
assert.ok(mt.endsWith('…'))

const capped = await svcWith({ groupMemory: { maxChars: 100 } }).saveGroupTurn({
  groupId: '555555',
  incoming: [{ speaker: 'A', text: '字'.repeat(200) }],
  at: 5000,
})
assert.equal(rowOf(capped.id).text.length, 100, 'maxChars 可配')

// ── 8) TTL 清理 ────────────────────────────────────────────
const NOW = Date.now()
const DAY = 86400000
const oldId = await insertMemory(db, { kind: 'episode', text: '群旧记忆', scopeType: 'group', scopeId: 'qq:999999', createdAt: NOW - 3 * DAY })
db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run(`group_ttl_${oldId}`, '1')
const freshId = await insertMemory(db, { kind: 'episode', text: '群新记忆', scopeType: 'group', scopeId: 'qq:999999', createdAt: NOW - 1 * DAY })
db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run(`group_ttl_${freshId}`, '90')
const ownerId = await insertMemory(db, { kind: 'fact', text: '主人记忆', createdAt: NOW - 400 * DAY })
const noMetaId = await insertMemory(db, { kind: 'episode', text: '群无meta旧记忆', scopeType: 'group', scopeId: 'qq:999999', createdAt: NOW - 3 * DAY })

const pr = pruneGroupMemories({ db, now: NOW, defaultTtlDays: 90 })
assert.equal(pr.expired, 1)
assert.equal(rowOf(oldId).status, 'expired', '到期 group 行软删')
assert.equal(rowOf(freshId).status, 'active', '未到期 group 行不动')
assert.equal(rowOf(ownerId).status, 'active', 'owner 记忆不受影响')
assert.equal(rowOf(noMetaId).status, 'active', '无 meta 用默认 90 天兜底，未到期')
assert.equal(db.prepare('SELECT count(*) c FROM memories WHERE id=?').get(oldId).c, 1, '软删不物理删')
assert.equal(pruneGroupMemories({ db, now: NOW, defaultTtlDays: 90 }).expired, 0, '重复跑幂等')

const pr2 = pruneGroupMemories({ db, now: NOW, defaultTtlDays: 1 })
assert.equal(pr2.expired, 1, '无 meta 的 group 行按 defaultTtlDays 兜底过期')
assert.equal(rowOf(noMetaId).status, 'expired')
assert.equal(rowOf(ownerId).status, 'active', 'owner 仍然不动')

// 新建的群记忆（TTL=90）仍未过期
assert.equal(rowOf(r.id).status, 'active')

out.checks = {
  config: 'ok', groupId: 'ok', write: 'ok', dedupe: 'ok',
  rateLimit: 'ok', reject: 'ok', truncate: 'ok', ttl: 'ok',
}
console.log(JSON.stringify(out))
