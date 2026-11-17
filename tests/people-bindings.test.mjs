/**
 * 人物主体绑定（2026-11-07）
 * owner QQ + 两个邮箱 → person:owner；陌生联系人可绑定并查回；重复绑定幂等；
 * 无绑定返回 null；dy_memory_contacts 输出 personId。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'

process.env.DY_MEMORY_DIR = '/tmp/dy-people-' + process.pid
const DIR = process.env.DY_MEMORY_DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const OWNER_QQ = '1000000001'
const ownerDir = `/root/qq-agent/QQ会话/私聊_${OWNER_QQ}`
const { openDb } = await import('../lib/store/db.js')
const { resolvePerson, bindPerson, seedOwnerPeople, ensurePersonSchema } = await import('../lib/store/people.js')
const { db } = openDb(DIR)

const out = { ok: true, test: 'people-bindings' }

// 1) 初始化 owner 三地址
{
  ensurePersonSchema(db)
  const r = seedOwnerPeople(db, { ownerQQ: OWNER_QQ, emails: ['yangen2001@qq.com'] })
  assert.equal(r.ok, true)
  assert.equal(r.bindings.length, 3, 'QQ + 两个邮箱')
  for (const [channel, contactId] of [['qq', OWNER_QQ], ['email', 'yangen2001@qq.com'], ['email', `${OWNER_QQ}@qq.com`]]) {
    const p = resolvePerson(db, { channel, contactId })
    assert.equal(p?.personId, 'person:owner', `${channel}:${contactId} 应映射 person:owner`)
    assert.equal(p?.contactId, contactId)
  }
  out.owner = 'ok'
}

// 2) 陌生联系人绑定可查回
{
  const b = bindPerson(db, { channel: 'email', contactId: 'stranger@example.com', personId: 'person:stranger', name: '陌生人' })
  assert.equal(b.ok, true); assert.equal(b.created, true)
  const p = resolvePerson(db, { channel: 'email', contactId: 'stranger@example.com' })
  assert.equal(p?.personId, 'person:stranger')
  assert.equal(p?.name, '陌生人')
  out.stranger = 'ok'
}

// 3) 重复绑定幂等（不新增行）
{
  const n = () => db.prepare("SELECT count(*) c FROM contact_bindings WHERE channel='email' AND external_id='stranger@example.com'").get().c
  const before = n()
  const b = bindPerson(db, { channel: 'email', contactId: 'stranger@example.com', personId: 'person:stranger', name: '陌生人2' })
  assert.equal(b.created, false)
  assert.equal(n(), before)
  assert.equal(resolvePerson(db, { channel: 'email', contactId: 'stranger@example.com' })?.name, '陌生人2')
  out.idempotent = 'ok'
}

// 4) 无绑定 → null
{
  assert.equal(resolvePerson(db, { channel: 'email', contactId: 'nobody@example.com' }), null)
  assert.equal(resolvePerson(db, { channel: '', contactId: 'x' }), null)
  out.missing = 'ok'
}

// 5) 服务方法 + dy_memory_contacts 输出 personId
const registered = {}
const services = new Map()
const ctx = {
  get(n) {
    if (n === 'tools') return { register: (d) => { registered[d.name] = d } }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    return services.get(n)
  },
  provide(n, v) { services.set(n, v); return () => services.delete(n) },
  on() {},
  logger: { info() {}, warn() {} },
}
const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: OWNER_QQ })
const svc = services.get('dyMemory')
assert.ok(svc && typeof svc.bindContact === 'function' && typeof svc.resolveContact === 'function')
const header = { cwd: ownerDir, id: 'sess-people' }

{
  const b = await svc.bindContact({ channel: 'email', contactId: 'svc@example.com', personId: 'person:svc', name: '服务绑定' }, { header })
  assert.equal(b.ok, true)
  const p = await svc.resolveContact({ channel: 'email', contactId: 'svc@example.com' }, { header })
  assert.equal(p.personId, 'person:svc')
  const nil = await svc.resolveContact({ channel: 'email', contactId: 'none@example.com' }, { header })
  assert.equal(nil, null)
  const again = await svc.bindContact({ channel: 'email', contactId: 'svc@example.com', personId: 'person:svc' }, { header })
  assert.equal(again.created, false)

  const tool = registered.dy_memory_contacts
  assert.ok(tool, 'dy_memory_contacts 已注册')
  const list = JSON.parse((await tool.execute({}, { agent: { session: { header } } })).detail)
  assert.equal(list.ok, true)
  assert.ok(list.items.some((x) => x.channel === 'qq' && x.personId === 'person:owner'), 'QQ owner personId')
  assert.ok(list.items.some((x) => x.channel === 'email' && x.external_id === 'yangen2001@qq.com' && x.personId === 'person:owner'), '邮箱 owner personId')
  assert.ok(list.items.some((x) => x.external_id === 'svc@example.com' && x.personId === 'person:svc'), '服务绑定 personId')
  out.service = 'ok'
}

console.log(JSON.stringify(out))
process.exit(0)
