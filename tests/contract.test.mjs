/**
 * 契约测试（阶段 4，契约 v1.2）
 * 覆盖：返回结构 / 错误码 / 超时降级 / header 形态 / 子智能体 / 后台插件写身份
 * 超时说明：episodeRecent 与 contactOf 是同步 SQL，不会超时；E_TIMEOUT 场景只可能出现在 recall（异步检索）上，
 * 服务对超时的处理是**降级返回 []**，不抛 E_TIMEOUT（契约 §5「返回空/降级，不抛到聊天」）。
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

process.env.DY_MEMORY_DIR = '/tmp/dy-contract-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { createMemoryService } = await import('../lib/service.js')
const { ensureContactsSchema, seedOwner } = await import('../lib/store/contacts.js')

const OWNER_QQ = '1000000001'
const ownerCwd = `/root/qq-agent/QQ会话/私聊_${OWNER_QQ}`
const { db } = openDb(process.env.DY_MEMORY_DIR)
// 模拟阶段 3 迁移：memories 多通道列就位
for (const c of ['subject_id', 'source_channel', 'source_ref']) { const has = db.prepare('PRAGMA table_info(memories)').all().some((x) => String(x.name) === c); if (!has) db.exec(`ALTER TABLE memories ADD COLUMN ${c} TEXT DEFAULT ''`) }
try { db.exec('ALTER TABLE memories ADD COLUMN superseded_by INTEGER DEFAULT 0') } catch {}
const hasCol = (t, c) => { try { return db.prepare(`PRAGMA table_info(${t})`).all().some((x) => String(x.name) === c) } catch { return false } }
ensureContactsSchema(db)
seedOwner(db, { ownerQQ: OWNER_QQ, displayName: '主人' })

const calls = []
const recallFn = async (_db, q, opts) => {
  calls.push({ q, opts })
  return [
    { id: 1, kind: 'fact', text: '默认频道的记忆', privacy: 'owner', scores: { rrf: 0.0315 } },
    { id: 2, kind: 'fact', text: '抖音频道的记忆', privacy: 'owner', scores: { rrf: 0.02 }, source_channel: 'douyin' },
    { id: 3, kind: 'fact', text: '公开规则', privacy: 'public', scores: { rrf: 0.01 } },
  ]
}

const svc = createMemoryService({
  db,
  recallFn,
  getVectors: () => new Map(),
  getMonitor: () => null,
  getPersona: () => ({ selfId: () => 'self:contract-uuid' }),
  isOwnerHeader: (h) => String(h?.cwd ?? '') === ownerCwd,
  lastUserMessageAt: () => 1793500000000,
  now: () => Date.now(),
  hasColumn: hasCol, // 真实列探测（已模拟迁移）
  insertMemory,
  cfg: { serviceTimeouts: { recallTimeoutMs: 3000 } },
  log: { info() {}, warn() {} },
})

const header = { id: 's1', cwd: ownerCwd }

// ── 1. Hit 结构 ────────────────────────────────────────────────
const hits = await svc.recall('记忆', { header, limit: 5 })
assert.equal(hits.length, 2, '默认过滤掉其他通道（douyin）')
assert.ok(!hits.some((h) => h.sourceChannel === 'douyin'))
for (const h of hits) {
  assert.deepEqual(Object.keys(h).sort(), ['id', 'kind', 'score', 'sourceChannel', 'sourceRef', 'text'])
  assert.equal(typeof h.id, 'number')
  assert.equal(typeof h.text, 'string')
  assert.equal(typeof h.score, 'number')
  assert.equal(typeof h.sourceChannel, 'string')
}
assert.equal(hits[0].score, 0.0315, 'score 取 RRF 并保留 4 位')
// limit 上限 20
await svc.recall('记忆', { header, limit: 999 })
assert.equal(calls.at(-1).opts.limit, 20, 'limit 应被 clamp 到 20')

// ── 2. Episode 结构 ────────────────────────────────────────────
await insertMemory(db, { kind: 'episode', text: '契约测试 episode', createdAt: Date.now() - 1000, sourceMsgId: 'episode:contract', extractorVersion: 'service-v1' })
const eps = await svc.episodeRecent(7, 20, header) // header 直接作为第 3 参
assert.equal(eps.length, 1)
assert.deepEqual(Object.keys(eps[0]).sort(), ['at', 'channel', 'id', 'ref', 'source', 'text'])
assert.equal(eps[0].source, 'service-v1')
assert.equal(eps[0].channel, 'qq')
assert.equal(eps[0].ref, 'episode:contract')

// ── 3. Contact 结构 ────────────────────────────────────────────
const contact = await svc.contactOf('qq', OWNER_QQ, { header })
assert.deepEqual(contact, { id: 'contact:owner', displayName: '主人', relationship: '主人' })
assert.equal(await svc.contactOf('qq', '1999999999', { header }), null)

// ── 4. header 形态 ─────────────────────────────────────────────
assert.ok((await svc.recall('记忆', { session: { header } })).length > 0, 'opts.session.header 可用')
await assert.rejects(svc.recall('记忆'), (e) => e.code === 'E_PERMISSION', '无 header → E_PERMISSION')
await assert.rejects(svc.episodeRecent(7, 20), (e) => e.code === 'E_PERMISSION')
await assert.rejects(svc.contactOf('qq', OWNER_QQ), (e) => e.code === 'E_PERMISSION')
await assert.rejects(svc.addEpisode({ text: 'x' }), (e) => e.code === 'E_PERMISSION')

// ── 5. 子智能体三条件 ──────────────────────────────────────────
for (const h of [
  { ...header, origin: 'subagent' },
  { ...header, parentSession: 'p1' },
  { ...header, delegationDepth: 2 },
]) {
  await assert.rejects(svc.recall('记忆', { header: h }), (e) => e.code === 'E_PERMISSION')
  await assert.rejects(svc.addEpisode({ text: '子智能体写', header: h }), (e) => e.code === 'E_PERMISSION')
}

// ── 6. 后台插件写身份 ─────────────────────────────────────────
const plugin = { origin: 'plugin', plugin: 'dsh-autonomy' }
const pw = await svc.addEpisode({ text: '后台写一条', dedupeKey: 'contract:1', header: plugin })
assert.ok(pw.id > 0 && pw.duplicate === false)
const pw2 = await svc.addEpisode({ text: '后台写一条', dedupeKey: 'contract:1', header: plugin })
assert.equal(pw2.id, pw.id)
assert.equal(pw2.duplicate, true, '重复返回 duplicate（不抛）')
for (const m of ['recall', 'episodeRecent', 'contactOf']) {
  const p = m === 'recall' ? svc.recall('x', { header: plugin }) : m === 'episodeRecent' ? svc.episodeRecent(7, 20, plugin) : svc.contactOf('qq', OWNER_QQ, { header: plugin })
  await assert.rejects(p, (e) => e.code === 'E_PERMISSION', `插件身份不得调用 ${m}`)
}
await assert.rejects(svc.addEpisode({ text: '伪造', header: { origin: 'plugin', plugin: 'dsh-evil' } }), (e) => e.code === 'E_PERMISSION')

// ── 7. E_PERSONA_UNAVAILABLE / E_INVALID_ARG ──────────────────
const noPersona = createMemoryService({
  db, recallFn, getVectors: () => new Map(), getMonitor: () => null,
  getPersona: () => undefined, isOwnerHeader: () => true,
  lastUserMessageAt: () => null, now: () => Date.now(), hasColumn: hasCol,
  insertMemory, cfg: {}, log: { info() {}, warn() {} },
})
await assert.rejects(noPersona.addEpisode({ text: '无 persona', header }), (e) => e.code === 'E_PERSONA_UNAVAILABLE')
await assert.rejects(svc.addEpisode({ text: '   ', header }), (e) => e.code === 'E_INVALID_ARG')
await assert.rejects(svc.addEpisode({ text: '字'.repeat(2001), header }), (e) => e.code === 'E_INVALID_ARG')

// ── 8. 超时降级（recall 异步依赖挂起 → []，不抛）───────────────
const slow = createMemoryService({
  db,
  recallFn: () => new Promise(() => {}), // 永不 resolve
  getVectors: () => new Map(), getMonitor: () => null,
  getPersona: () => undefined, isOwnerHeader: () => true,
  lastUserMessageAt: () => null, now: () => Date.now(), hasColumn: hasCol,
  insertMemory, cfg: { serviceTimeouts: { recallTimeoutMs: 30 } }, log: { info() {}, warn() {} },
})
const t0 = Date.now()
const timedOut = await slow.recall('记忆', { header })
const cost = Date.now() - t0
assert.deepEqual(timedOut, [], '超时应降级为空数组，不抛到调用方')
assert.ok(cost < 1000, `超时应尽快返回（实测 ${cost}ms）`)

// ── 9. non-owner 只给 public；跨通道默认关 ─────────────────────
const stranger = await svc.recall('记忆', { header: { cwd: '/root/qq-agent/QQ会话/私聊_1999999999', id: 's9' } })
assert.ok(stranger.every((h) => h.text.includes('公开')), '非 owner 只返回 public')
const crossHits = await svc.recall('记忆', { header, allowCrossChannel: true })
assert.ok(crossHits.some((h) => h.sourceChannel === 'douyin'), 'allowCrossChannel=true 才出现其他通道')

console.log(JSON.stringify({
  ok: true, test: 'contract',
  hitKeys: 6, episodeKeys: 6,
  timeoutDegraded: timedOut.length === 0, timeoutMs: cost,
  pluginWrite: pw.id, duplicate: pw2.duplicate,
  strangerPublicOnly: stranger.length,
}))
process.exit(0)
