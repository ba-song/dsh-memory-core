/**
 * dyMemory 服务 smoke（契约 v1.1，阶段 2）
 *
 * 覆盖：
 * 1. provide / get：插件挂载后服务可取到，五个方法齐全
 * 2. 判空：空查询、无 episode、无 contacts、无 lastUser 都不崩
 * 3. 无 header → E_PERMISSION（契约 v1.1：不得当「本机受信调用」）
 * 4. 子智能体 header（origin / parentSession / delegationDepth）→ E_PERMISSION
 * 5. addEpisode：缺 persona → E_PERSONA_UNAVAILABLE；正常写入；同 dedupeKey 幂等；空文本 E_INVALID_ARG
 * 6. lastUserMessageAt：不敏感不需要 header；只认真正的用户消息（注入块不算）；meta 持久化
 * 7. 注入消息 UUID：本测试顺带断言 pre-step 注入仍带 UUID（回归）
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

process.env.DY_MEMORY_DIR = '/tmp/dy-service-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })

const handlers = {}
const services = new Map()
let persona = undefined // 可在测试中切换：undefined = persona 未挂载

const ctx = {
  get(n) {
    if (n === 'tools') return { register: () => {} }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    if (n === 'dyPersona') return persona
    return services.get(n)
  },
  provide(n, v) {
    if (services.has(n)) throw new Error(`service "${n}" has been registered at <test>`)
    services.set(n, v)
    return () => services.delete(n)
  },
  on(evt, fn) { handlers[evt] = fn },
  logger: { info() {}, warn() {} },
}

const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: '1000000001' })

const ownerDir = '/root/qq-agent/QQ会话/私聊_1000000001'
const owner = { id: 's-owner', cwd: ownerDir }
const subOrigin = { id: 's-sub', cwd: '/tmp', origin: 'subagent' }
const subParent = { id: 's-sub2', cwd: '/tmp', parentSession: 's-owner' }
const subDepth = { id: 's-sub3', cwd: '/tmp', delegationDepth: 1 }

const errCode = (code) => (e) => {
  assert.equal(e?.code, code, `期望错误码 ${code}，实际 ${e?.code}（${e?.message}）`)
  return true
}

// ── 1. provide / get ─────────────────────────────────────────────
const svc = ctx.get('dyMemory')
assert.ok(svc, 'dyMemory 服务应已 provide，并能通过 ctx.get 取到')
for (const m of ['recall', 'episodeRecent', 'addEpisode', 'saveEmail', 'bindContact', 'resolveContact', 'contactOf', 'lastUserMessageAt']) {
  assert.equal(typeof svc[m], 'function', `服务缺方法 ${m}`)
}
assert.ok(Object.isFrozen(svc), '服务壳应冻结，防止消费方改方法表')

// ── 2. 判空 ─────────────────────────────────────────────────────
assert.deepEqual(await svc.recall('', { header: owner }), [], '空查询应返回 []')
assert.deepEqual(await svc.recall('   ', { header: owner }), [], '空白查询应返回 []')
assert.deepEqual(await svc.episodeRecent(7, 20, { header: owner }), [], '无 episode 时应返回 []')
const ownerContact = await svc.contactOf('qq', '1000000001', { header: owner }); assert.equal(ownerContact?.id, 'contact:owner', '启动已 seed owner，应能查回')
assert.equal(await svc.contactOf('', '', { header: owner }), null, '空参数应返回 null')
assert.equal(await svc.contactOf('qq', '9999999999', { header: owner }), null, '未绑定应返回 null')
assert.equal(svc.lastUserMessageAt(), null, '未收到用户消息时应为 null')

// ── 3. 无 header → E_PERMISSION（v1.1 硬规则）────────────────────
await assert.rejects(svc.recall('看海'), errCode('E_PERMISSION'), 'recall 无 header 必须拒绝')
await assert.rejects(svc.episodeRecent(7, 20), errCode('E_PERMISSION'), 'episodeRecent 无 header 必须拒绝')
await assert.rejects(svc.contactOf('qq', '1000000001'), errCode('E_PERMISSION'), 'contactOf 无 header 必须拒绝')
await assert.rejects(svc.addEpisode({ text: '无 header 的一条' }), errCode('E_PERMISSION'), 'addEpisode 无 header 必须拒绝')

// ── 4. 子智能体 header → E_PERMISSION ───────────────────────────
for (const h of [subOrigin, subParent, subDepth]) {
  await assert.rejects(svc.recall('看海', { header: h }), errCode('E_PERMISSION'), `recall 子智能体 header 必须拒绝：${JSON.stringify(h)}`)
  await assert.rejects(svc.addEpisode({ text: '子智能体写入', header: h }), errCode('E_PERMISSION'), 'addEpisode 子智能体必须拒绝')
  await assert.rejects(svc.contactOf('qq', '1000000001', { header: h }), errCode('E_PERMISSION'), 'contactOf 子智能体必须拒绝')
}
// opts.session.header 形态也要拒绝
await assert.rejects(svc.recall('看海', { session: { header: subOrigin } }), errCode('E_PERMISSION'), 'opts.session.header 子智能体必须拒绝')

// ── 5. addEpisode ───────────────────────────────────────────────
await assert.rejects(
  svc.addEpisode({ text: 'persona 没挂时写一条', header: owner }),
  errCode('E_PERSONA_UNAVAILABLE'),
  'persona 未挂载时必须拒绝写真实记忆',
)

persona = { selfId: () => 'self-abc-123', displayName: () => '汐' }

await assert.rejects(svc.addEpisode({ text: '   ', header: owner }), errCode('E_INVALID_ARG'), '空文本应 E_INVALID_ARG')
await assert.rejects(svc.addEpisode({ text: '字'.repeat(2001), header: owner }), errCode('E_INVALID_ARG'), '超长文本应 E_INVALID_ARG')

const at = Date.now() - 1000
const r1 = await svc.addEpisode({ text: '在抖音刷到一个看海视频，看了两遍', at, source: 'autonomy', actionId: 'a1', channel: 'douyin', ref: 'aweme:123', dedupeKey: 'act:a1', header: owner })
assert.ok(r1 && Number.isInteger(r1.id) && r1.id > 0, 'addEpisode 应返回 id')
assert.equal(r1.duplicate, false)

const r2 = await svc.addEpisode({ text: '在抖音刷到一个看海视频，看了两遍', at, source: 'autonomy', actionId: 'a1', channel: 'douyin', ref: 'aweme:123', dedupeKey: 'act:a1', header: owner })
assert.equal(r2.id, r1.id, '同 dedupeKey 应返回已有 id')
assert.equal(r2.duplicate, true, '同 dedupeKey 应标 duplicate')

const listed = await svc.episodeRecent(7, 20, { header: owner })
assert.equal(listed.length, 1, '重复写入不应产生第二条')
assert.equal(listed[0].id, r1.id)
assert.equal(listed[0].text, '在抖音刷到一个看海视频，看了两遍')
assert.equal(listed[0].source, 'service-v1')
assert.ok(listed[0].at > 0, 'episode 应带 at')
assert.equal(listed[0].ref, 'episode:act:a1', 'ref 应可回溯 dedupeKey')

// episodeRecent 也接受第 3 参数直接是 header（契约签名）
const listed2 = await svc.episodeRecent(7, 20, owner)
assert.equal(listed2.length, 1, 'episodeRecent(days, limit, header) 形态应可用')

// 不同 dedupeKey → 新条目
const r3 = await svc.addEpisode({ text: '给她写了一篇日记', source: 'autonomy', dedupeKey: 'act:a2', header: owner })
assert.notEqual(r3.id, r1.id, '不同 dedupeKey 应是新条目')

// 超期的不返回
await svc.addEpisode({ text: '很久以前的事', at: Date.now() - 40 * 86400000, source: 'autonomy', dedupeKey: 'act:old', header: owner })
const recent7 = await svc.episodeRecent(7, 20, { header: owner })
assert.equal(recent7.length, 2, '7 天窗口应排除 40 天前的 episode')

// ── 5.1 后台插件写身份（契约 v1.2 §5.1）────────────────────────
const pluginWrite = { origin: 'plugin', plugin: 'dsh-autonomy' }
const pw = await svc.addEpisode({ text: '后台插件写入的一条 episode', source: 'autonomy', dedupeKey: 'pw:1', header: pluginWrite })
assert.ok(Number.isInteger(pw.id) && pw.id > 0, 'allowlist 内的后台插件应能 addEpisode')
const pwDup = await svc.addEpisode({ text: '后台插件写入的一条 episode', source: 'autonomy', dedupeKey: 'pw:1', header: pluginWrite })
assert.equal(pwDup.id, pw.id, '后台插件同样受 dedupeKey 幂等约束')
assert.equal(pwDup.duplicate, true)

// 只放行写：读类方法仍拒绝
await assert.rejects(svc.recall('看海', { header: pluginWrite }), errCode('E_PERMISSION'), '后台插件不得 recall')
await assert.rejects(svc.episodeRecent(7, 20, pluginWrite), errCode('E_PERMISSION'), '后台插件不得 episodeRecent')
await assert.rejects(svc.contactOf('qq', '1000000001', { header: pluginWrite }), errCode('E_PERMISSION'), '后台插件不得 contactOf')

// 伪造其他 plugin 名一律拒绝
for (const bad of [
  { origin: 'plugin', plugin: 'dsh-evil' },
  { origin: 'plugin', plugin: 'dsh-autonomy ' },   // 名字带空格不匹配
  { origin: 'plugin', plugin: '' },
  { origin: 'plugin' },
]) {
  await assert.rejects(svc.addEpisode({ text: '伪造身份', dedupeKey: 'pw:bad', header: bad }), errCode('E_PERMISSION'), `伪造插件身份必须拒绝：${JSON.stringify(bad)}`)
}
// 子智能体条件优先于插件身份
await assert.rejects(
  svc.addEpisode({ text: '插件+子智能体', header: { origin: 'plugin', plugin: 'dsh-autonomy', parentSession: 's1' } }),
  errCode('E_PERMISSION'),
  '带 parentSession 的插件身份必须拒绝',
)
// 主人 header 仍然可用
const byOwner = await svc.addEpisode({ text: '主人身份写入的一条', dedupeKey: 'owner:1', header: owner })
assert.ok(byOwner.id > 0, '主人 header 应仍可写入')

// ── 6. lastUserMessageAt ───────────────────────────────────────
assert.equal(typeof handlers['session/event'], 'function', '插件应监听 session/event')
const userEvent = { type: 'user/message', time: 1790000000000, data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '在吗' }] } }
handlers['session/event']({ header: { cwd: ownerDir, id: 's-owner' } }, userEvent)
assert.equal(svc.lastUserMessageAt(), 1790000000000, '用户消息应更新 lastUserMessageAt')

// 本插件自己的注入块（source.kind=plugin:dy-memory）不得更新
handlers['session/event']({ header: { cwd: ownerDir, id: 's-owner' } }, {
  type: 'user/message', time: 1790000500000, data: { message: { source: { kind: 'plugin:dy-memory' } }, content: [{ type: 'text', text: '【记忆·本轮相关】…' }] },
})
assert.equal(svc.lastUserMessageAt(), 1790000000000, '注入块不应更新 lastUserMessageAt')

// 非 QQ 会话（GUI/子智能体 cwd）不算
handlers['session/event']({ header: { cwd: '/tmp', id: 'x' } }, { type: 'user/message', time: 1790000900000, data: { message: { source: { kind: 'user' } } } })
assert.equal(svc.lastUserMessageAt(), 1790000000000, '非 QQ 会话不应更新 lastUserMessageAt')

// meta 持久化（节流 10s，但首条会写）
{
  const { openDb } = await import('../lib/store/db.js')
  const { db } = openDb(process.env.DY_MEMORY_DIR)
  const row = db.prepare("SELECT v FROM meta WHERE k='last_user_message_at'").get()
  assert.ok(row && Number(row.v) === 1790000000000, 'last_user_message_at 应持久化到 meta')
  db.close?.()
}

// ── 7. 注入 UUID 回归（pre-step）─────────────────────────────────
{
  const { insertMemory } = await import('../lib/store/memories.js')
  const { openDb } = await import('../lib/store/db.js')
  const { db } = openDb(process.env.DY_MEMORY_DIR)
  await insertMemory(db, { kind: 'fact', text: '主人喜欢看海', importance: 0.9, layer: 'manual' })
  db.close?.()
  const agent = { session: { header: { cwd: ownerDir, id: 's-uuid' } } }
  const messages = [{ source: { kind: 'user' }, content: [{ type: 'text', text: '我喜欢看海' }] }]
  const decision = await handlers['agent/pre-step']({ agent, messages, step: 1, turn: 1 }, async () => ({ kind: 'enter', messages }))
  const injected = decision.messages.filter((m) => String(m?.source?.kind ?? '').startsWith('plugin:dy-memory'))
  for (const m of injected) {
    assert.match(String(m.id ?? ''), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, '注入 message 必须有 UUID')
  }
}

console.log(JSON.stringify({
  ok: true,
  test: 'service',
  methods: 8,
  noHeaderRejected: ['recall', 'episodeRecent', 'addEpisode', 'contactOf'],
  subagentRejected: 3,
  addEpisode: { first: r1.id, dup: r2.id, other: r3.id },
  episodes7d: recent7.length,
  lastUser: svc.lastUserMessageAt(),
}))
process.exit(0)
