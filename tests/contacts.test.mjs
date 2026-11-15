/**
 * 联系人层（阶段 3）
 * - 建表 / 唯一约束 / 冲突拒绝 / owner 种子 / 备注
 * - 表不存在时降级为 null（阶段 2 行为）
 * - service.contactOf 走真查询
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

process.env.DY_MEMORY_DIR = '/tmp/dy-contacts-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const {
  ensureContactsSchema, hasContactsSchema, seedOwner, lookupContact,
  bindContact, addContact, addContactNote, listContactNotes, ContactError,
} = await import('../lib/store/contacts.js')

const OWNER_QQ = '1000000001'
const { db } = openDb(process.env.DY_MEMORY_DIR)

// ── 1. 未迁移时降级 ─────────────────────────────────────────────
assert.equal(hasContactsSchema(db), false)
assert.equal(lookupContact(db, 'qq', OWNER_QQ), null, '表不存在时 contactOf 为 null')
assert.throws(() => bindContact(db, { contactId: 'contact:x', channel: 'qq', externalId: OWNER_QQ }), (e) => e.code === 'E_PERSONA_UNAVAILABLE')

// ── 2. 建表 + owner 种子 ───────────────────────────────────────
assert.equal(ensureContactsSchema(db), true)
const s1 = seedOwner(db, { ownerQQ: OWNER_QQ, displayName: '主人' })
assert.equal(s1.contactId, 'contact:owner')
assert.equal(s1.created, true)
const s2 = seedOwner(db, { ownerQQ: OWNER_QQ, displayName: '主人' })
assert.equal(s2.created, false, '重复 seed 应幂等')
assert.equal(db.prepare('SELECT count(*) c FROM contacts').get().c, 1)
assert.equal(db.prepare('SELECT count(*) c FROM contact_bindings').get().c, 1)
assert.equal(db.prepare('SELECT is_primary p FROM contact_bindings').get().p, 1)

// ── 3. 真查询 ──────────────────────────────────────────────────
const owner = lookupContact(db, 'qq', OWNER_QQ)
assert.deepEqual(owner, { id: 'contact:owner', displayName: '主人', relationship: '主人', kind: 'owner' })
assert.equal(lookupContact(db, 'qq', '1999999999'), null, '未绑定返回 null')
assert.equal(lookupContact(db, 'douyin', OWNER_QQ), null, '通道不同不匹配')
assert.equal(lookupContact(db, '', OWNER_QQ), null, '空通道返回 null')

// ── 4. 唯一约束与冲突拒绝 ──────────────────────────────────────
addContact(db, { id: 'contact:x', displayName: '朋友甲', kind: 'friend' })
assert.throws(
  () => bindContact(db, { contactId: 'contact:x', channel: 'qq', externalId: OWNER_QQ }),
  (e) => e instanceof ContactError && e.code === 'E_DUPLICATE',
  '同一 channel+external_id 不得绑到第二个人',
)
assert.equal(lookupContact(db, 'qq', OWNER_QQ).id, 'contact:owner', '冲突后原绑定不变')

const b = bindContact(db, { contactId: 'contact:x', channel: 'qq', externalId: '1000000002', alias: '小甲' })
assert.equal(b.created, true)
assert.equal(lookupContact(db, 'qq', '1000000002').displayName, '朋友甲')
// 重复绑定同一对 → 更新而不是新增
const b2 = bindContact(db, { contactId: 'contact:x', channel: 'qq', externalId: '1000000002', alias: '小甲2' })
assert.equal(b2.created, false)
assert.equal(db.prepare('SELECT count(*) c FROM contact_bindings').get().c, 2)

// ── 5. 备注 ────────────────────────────────────────────────────
const n = addContactNote(db, { contactId: 'contact:owner', kind: 'preference', text: '喜欢看海', importance: 0.8, sourceRef: 'test' })
assert.ok(n.id > 0)
const notes = listContactNotes(db, { contactId: 'contact:owner' })
assert.equal(notes.length, 1)
assert.equal(notes[0].kind, 'preference')
assert.throws(() => addContactNote(db, { contactId: 'contact:owner', text: '  ' }), (e) => e.code === 'E_INVALID_ARG')

// ── 6. service.contactOf 走真查询 ──────────────────────────────
const services = new Map()
const handlers = {}
const ctx = {
  get(n) {
    if (n === 'tools') return { register: () => {} }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    return services.get(n)
  },
  provide(n, v) { services.set(n, v); return () => services.delete(n) },
  on(e, f) { handlers[e] = f },
  logger: { info() {}, warn() {} },
}
const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: OWNER_QQ })
const svc = ctx.get('dyMemory')
const header = { id: 's-owner', cwd: '/root/qq-agent/QQ会话/私聊_1000000001' }
const viaService = await svc.contactOf('qq', OWNER_QQ, { header })
assert.deepEqual(viaService, { id: 'contact:owner', displayName: '主人', relationship: '主人' }, 'contactOf 应返回联系人（不含 kind 之外的额外字段）')
assert.equal(await svc.contactOf('qq', '1999999999', { header }), null)
await assert.rejects(svc.contactOf('qq', OWNER_QQ), (e) => e.code === 'E_PERMISSION', '无 header 仍拒绝')

console.log(JSON.stringify({
  ok: true, test: 'contacts',
  contacts: db.prepare('SELECT count(*) c FROM contacts').get().c,
  bindings: db.prepare('SELECT count(*) c FROM contact_bindings').get().c,
  ownerLookup: owner.id,
  conflictRejected: true,
  notes: notes.length,
  viaService: viaService.id,
}))
process.exit(0)
