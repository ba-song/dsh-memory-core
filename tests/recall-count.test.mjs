/**
 * dy_memory_recall 返回语义 + P0 scope（2026-11-06 更新）：
 * - `count` = 过滤后可见条数（== items.length）；`matched` = scope 过滤后召回数
 * - owner 会话：count === matched
 * - external：只看 public + 自己 contact；query 命中 scope 外行 → 整条空 + `scopeBlocked` + 审计
 * - group：只看 core/public
 */
import assert from 'node:assert'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '/tmp/dy-recall-count-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })

const OWNER_QQ = '1000000001'
const ownerDir = `/root/qq-agent/QQ会话/私聊_${OWNER_QQ}`
const strangerDir = '/sdcard/DSHA/渠道/douyin/123'
const groupDir = '/root/qq-agent/QQ会话/群_123456'

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { db } = openDb(DIR)

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
mod.apply(ctx, { ownerQQ: OWNER_QQ, keywordGate: 0.1 })

await insertMemory(db, { kind: 'fact', text: '海王测试：公开的规则事实', privacy: 'public', scopeType: 'public', importance: 0.9 })
await insertMemory(db, { kind: 'fact', text: '本会独有：只给这个联系人看', privacy: 'owner', scopeType: 'contact', scopeId: 'douyin:123', importance: 0.9 })
await insertMemory(db, { kind: 'fact', text: '别人专属：另一个联系人的事', privacy: 'owner', scopeType: 'contact', scopeId: 'douyin:456', importance: 0.9 })
await insertMemory(db, { kind: 'fact', text: '鲸落私藏：主人的生日是12月2号', privacy: 'owner', scopeType: 'owner', importance: 0.9 })

const run = (query, { cwd, id }) => registered.dy_memory_recall.execute(
  { query, limit: 10 },
  { agent: { session: { header: { cwd, id } } } },
).then((r) => JSON.parse(r.detail))

const out = { ok: true, test: 'recall-count' }

// 1) owner：不过滤，count === matched
{
  for (const q of ['海王测试', '本会独有', '别人专属', '鲸落私藏']) {
    const d = await run(q, { cwd: ownerDir, id: 'sess-owner' })
    assert.equal(d.count, d.items.length, `owner ${q}: count === items`)
    assert.equal(d.matched, d.count, `owner ${q}: matched === count`)
    assert.equal(d.count, 1, `owner 应看到 ${q}`)
  }
  out.owner = 'ok'
}

// 2) external：public + 自己 contact；别人的 contact/owner 触发越权 → 空 + 审计
{
  const pub = await run('海王测试', { cwd: strangerDir, id: 'sess-ext' })
  assert.equal(pub.count, 1); assert.equal(pub.matched, 1); assert.equal(pub.items[0].text.includes('公开'), true)

  const own = await run('本会独有', { cwd: strangerDir, id: 'sess-ext' })
  assert.equal(own.count, 1); assert.equal(own.matched, 1); assert.equal(own.items.length, 1)

  const other = await run('别人专属', { cwd: strangerDir, id: 'sess-ext' })
  assert.equal(other.count, 0, '别人的 contact 不可见')
  assert.equal(other.matched, 1)
  assert.equal(other.items.length, 0)
  assert.equal(other.scopeBlocked, true, '命中 scope 外行应整条空')

  const ownerOnly = await run('鲸落私藏', { cwd: strangerDir, id: 'sess-ext' })
  assert.equal(ownerOnly.count, 0, 'owner 层绝不可见')
  assert.equal(ownerOnly.matched, 1)
  assert.equal(ownerOnly.scopeBlocked, true)
  out.external = { pub: pub.count, own: own.count, blocked: [other.scopeBlocked, ownerOnly.scopeBlocked] }
}

// 3) group：只看 core/public；contact 命中 → 越权空
{
  const pub = await run('海王测试', { cwd: groupDir, id: 'sess-group' })
  assert.equal(pub.count, 1); assert.equal(pub.matched, 1)
  const contact = await run('本会独有', { cwd: groupDir, id: 'sess-group' })
  assert.equal(contact.count, 0)
  assert.equal(contact.scopeBlocked, true)
  out.group = 'ok'
}

// 4) 审计落盘
{
  const f = join(DIR, 'logs', 'scope-audit.log')
  assert.equal(existsSync(f), true, '越权应写 scope-audit.log')
  const text = readFileSync(f, 'utf8')
  assert.match(text, /dy_memory_recall/)
  assert.match(text, /E_SCOPE/)
  assert.match(text, /sess-ext/)
  out.audit = 'ok'
}

// 5) 模型传 scope 参数 → 空 + 审计（scope 只由会话决定）
{
  const d = await registered.dy_memory_recall.execute(
    { query: '海王测试', scope_type: 'owner' },
    { agent: { session: { header: { cwd: strangerDir, id: 'sess-ext' } } } },
  ).then((r) => JSON.parse(r.detail))
  assert.equal(d.count, 0)
  assert.equal(d.scopeBlocked, true)
  assert.equal(d.error, 'E_SCOPE')
  out.scopeArg = 'ok'
}

console.log(JSON.stringify(out))
process.exit(0)
