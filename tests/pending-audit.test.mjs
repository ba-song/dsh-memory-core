/**
 * M2-1B：pending 悬置审计工具。
 * 覆盖五类分层、只读、脱敏、owner scope 与工具权限。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { buildPendingAudit, redactSummary, PENDING_REASONS } from '../lib/audit/pending.js'

const DIR = `/tmp/m2-pending-audit-${process.pid}`
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })
const { db } = openDb(DIR)

const add = (text, { status = 'pending', scopeType = 'owner', scopeId = '', meta = {} } = {}) =>
  insertMemory(db, { kind: 'preference', text, status, scopeType, scopeId, meta })

const putQueue = (a, b, status) => Number(db.prepare(
  'INSERT INTO conflict_queue(memory_a,memory_b,reason,created_at,status) VALUES(?,?,?,?,?)',
).run(a, b, 'test-opposition', Date.now(), status).lastInsertRowid)

test('pending 审计：五类分层 + 排除非 owner/非 pending', async () => {
  const quarantined = await add('隔离的旧角色句', { meta: { quarantined: true, quarantineReason: 'llm-role-pronoun' } })
  const oldSay = await add('喜欢辣的', { status: 'active' })
  const newSay = await add('不喜欢辣的')
  const qOpen = putQueue(oldSay, newSay, 'pending')
  const orphanA = await add('孤儿条目')
  const orphanB = await add('另一半', { status: 'active' })
  const qClosed = putQueue(orphanA, orphanB, 'resolved')
  const pref = await add('长期偏好待合并', { meta: { persist: true, persistence: 'long_term' } })
  const plain = await add('无队列悬置')
  const active = await add('活跃条目', { status: 'active' })
  const group = await add('群里的悬置', { scopeType: 'group', scopeId: 'g1' })

  const r = buildPendingAudit(db, { limit: 50 })
  assert.equal(r.ok, true)
  assert.equal(r.total, 5)
  assert.equal(r.count, 5)
  assert.equal(r.truncated, false)
  assert.deepEqual(Object.keys(r.byReason).sort(), [...PENDING_REASONS].sort())
  const byId = new Map(r.items.map((i) => [i.id, i]))
  assert.equal(byId.size, 5)
  assert.equal(byId.get(quarantined).reason, 'quarantined')
  assert.equal(byId.get(newSay).reason, 'conflict-open')
  assert.equal(byId.get(newSay).relatedConflictId, qOpen)
  assert.equal(byId.get(orphanA).reason, 'orphan-closed-queue')
  assert.equal(byId.get(orphanA).relatedConflictId, qClosed)
  assert.equal(byId.get(pref).reason, 'preference-awaiting-merge')
  assert.equal(byId.get(plain).reason, 'orphan-no-queue')
  assert.equal(byId.has(active), false)
  assert.equal(byId.has(group), false)
  assert.equal(byId.get(quarantined).quarantined, true)
  assert.equal(byId.get(pref).persist, true)
  assert.equal(byId.get(plain).ageDays, 0)
  for (const item of r.items) {
    assert.equal(item.status, 'pending')
    assert.ok(item.textLength > 0)
    assert.equal(typeof item.source.layer, 'string')
    assert.equal(typeof item.source.extractor, 'string')
  }
  const limited = buildPendingAudit(db, { limit: 2 })
  assert.equal(limited.count, 2)
  assert.equal(limited.truncated, true)
  assert.equal(limited.total, 5)
})

test('pending 审计严格只读：total_changes、行数、revision 不变', async () => {
  const tables = ['memories', 'memory_revisions', 'meta', 'conflict_queue', 'vectors', 'fts_bigram', 'fts_trigram']
  const changesBefore = Number(db.prepare('SELECT total_changes() AS t').get().t)
  const countsBefore = Object.fromEntries(tables.map((name) => [name, Number(db.prepare(`SELECT count(*) c FROM ${name}`).get().c)]))
  buildPendingAudit(db, { limit: 50 })
  buildPendingAudit(db, { limit: 50 })
  const changesAfter = Number(db.prepare('SELECT total_changes() AS t').get().t)
  assert.equal(changesAfter, changesBefore)
  for (const [name, before] of Object.entries(countsBefore)) {
    assert.equal(Number(db.prepare(`SELECT count(*) c FROM ${name}`).get().c), before, `${name} 不得变化`)
  }
})

test('摘要脱敏：不返回正文，遮邮箱/长数字/URL，长度受限', async () => {
  const text = '主人邮箱 abc@example.com，电话 13800138000，参考 https://x.test/a 后面还有很多很多内容用来确认截断'
  const id = await add(text)
  const item = buildPendingAudit(db, { limit: 100 }).items.find((x) => x.id === id)
  assert.ok(item)
  assert.equal(Object.hasOwn(item, 'text'), false)
  assert.ok(!item.summary.includes('abc@'))
  assert.ok(!item.summary.includes('13800138000'))
  assert.ok(!item.summary.includes('http'))
  assert.ok([...item.summary].length <= 41)
  assert.ok(item.textLength >= 40)
  assert.equal(redactSummary('短句', 40), '短句')
})

test('工具注册与权限：owner 私聊可用，群会话/无会话被拒', async () => {
  process.env.DY_MEMORY_DIR = DIR
  const registered = {}
  const quietLog = { info() {}, warn() {}, debug() {}, error() {} }
  const ctx = {
    get(name) {
      if (name === 'tools') return { register: (def) => { registered[def.name] = def } }
      if (name === 'systemPrompt') return { context: () => () => {} }
      if (name === 'agents') return { list: () => [] }
      return undefined
    },
    on() {},
    provide() { return () => {} },
    logger: quietLog,
  }
  const { apply } = await import('../lib/index.js')
  apply(ctx, { ownerQQ: '1000000001', trustedDirs: ['/tmp/m2-audit-owner'] })
  const tool = registered.dy_memory_pending_audit
  assert.ok(tool)
  assert.equal(tool.parameters.additionalProperties, false)
  const owner = await tool.execute({ limit: 10 }, { agent: { session: { header: { cwd: '/tmp/m2-audit-owner', id: 'owner' } } } })
  assert.equal(JSON.parse(owner.detail).ok, true)
  const group = await tool.execute({}, { agent: { session: { header: { cwd: '/sdcard/DSHA/渠道/qq-群', id: 'g' } } } })
  assert.equal(JSON.parse(group.detail).ok, false)
  const noSession = await tool.execute({}, {})
  assert.equal(JSON.parse(noSession.detail).ok, false)
})
