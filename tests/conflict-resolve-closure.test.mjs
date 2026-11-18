import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { resolveConflictRow } from '../lib/conflict/resolve.js'

let serial = 0
async function setup() {
  const dir = `/tmp/m2-conflict-closure-${process.pid}-${++serial}`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const { db } = openDb(dir)
  const add = (text, opts = {}) => insertMemory(db, { kind: 'fact', text, scopeType: 'owner', ...opts })
  const pair = async (a = 'old', b = 'new', optsA = {}, optsB = {}) => {
    const oldId = await add(a, optsA)
    const newId = await add(b, optsB)
    const qid = Number(db.prepare("INSERT INTO conflict_queue(memory_a,memory_b,reason,created_at,status) VALUES(?,?, 'test', ?, 'pending')").run(oldId, newId, Date.now()).lastInsertRowid)
    return { oldId, newId, qid }
  }
  return { db, add, pair }
}

test('keep/old 保留 old 并物理删除 new', async () => {
  const { db, pair } = await setup()
  const p = await pair()
  const r = resolveConflictRow(db, { id: p.qid, action: 'keep', side: 'old' })
  assert.equal(r.ok, true)
  assert.ok(db.prepare('SELECT 1 FROM memories WHERE id=?').get(p.oldId))
  assert.equal(db.prepare('SELECT 1 FROM memories WHERE id=?').get(p.newId), undefined)
  assert.equal(db.prepare('SELECT status FROM conflict_queue WHERE id=?').get(p.qid).status, 'resolved')
})

test('keep/new 保留 new 并物理删除 old', async () => {
  const { db, pair } = await setup()
  const p = await pair()
  const r = resolveConflictRow(db, { id: p.qid, action: 'keep', side: 'new' })
  assert.equal(r.ok, true)
  assert.equal(db.prepare('SELECT 1 FROM memories WHERE id=?').get(p.oldId), undefined)
  assert.ok(db.prepare('SELECT 1 FROM memories WHERE id=?').get(p.newId))
  assert.equal(db.prepare('SELECT status FROM conflict_queue WHERE id=?').get(p.qid).status, 'resolved')
})

test('drop/old 将 old 迁移 corrected 并激活 pending survivor', async () => {
  const { db, pair } = await setup()
  const p = await pair('old', 'new', { status: 'active' }, { status: 'pending' })
  const r = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old', now: 1000 })
  const victim = db.prepare('SELECT * FROM memories WHERE id=?').get(p.oldId)
  const survivor = db.prepare('SELECT * FROM memories WHERE id=?').get(p.newId)
  assert.equal(r.ok, true)
  assert.equal(victim.status, 'corrected')
  assert.equal(victim.valid_to, 1000)
  assert.equal(victim.superseded_by, p.newId)
  assert.equal(victim.revision, 2)
  assert.equal(survivor.status, 'active')
  assert.equal(survivor.revision, 2)
})

test('drop/new 正确迁移 new 侧，不删除记录', async () => {
  const { db, pair } = await setup()
  const p = await pair('old', 'new', { status: 'pending' }, { status: 'active' })
  const r = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'new' })
  assert.equal(r.ok, true)
  assert.equal(db.prepare('SELECT status FROM memories WHERE id=?').get(p.newId).status, 'corrected')
  assert.ok(db.prepare('SELECT 1 FROM memories WHERE id=?').get(p.newId))
})

test('quarantined survivor 不得激活', async () => {
  const { db, pair } = await setup()
  const p = await pair('old', 'new', { status: 'active' }, { status: 'pending', meta: { quarantined: true } })
  const r = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old' })
  assert.equal(r.ok, true)
  assert.equal(db.prepare('SELECT status FROM memories WHERE id=?').get(p.newId).status, 'pending')
})

test('仍有其他 pending 冲突的 survivor 不得激活', async () => {
  const { db, pair } = await setup()
  const p = await pair('old', 'new', { status: 'active' }, { status: 'pending' })
  const other = await pair('new-other', 'other')
  db.prepare('UPDATE conflict_queue SET memory_a=? WHERE id=?').run(p.newId, other.qid)
  const r = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old' })
  assert.equal(r.ok, true)
  assert.equal(db.prepare('SELECT status FROM memories WHERE id=?').get(p.newId).status, 'pending')
})

test('valid_to 非空的 survivor 不得激活', async () => {
  const { db, pair } = await setup()
  const p = await pair('old', 'new', { status: 'active' }, { status: 'pending', validTo: 50 })
  const r = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old' })
  assert.equal(r.ok, true)
  assert.equal(db.prepare('SELECT status FROM memories WHERE id=?').get(p.newId).status, 'pending')
})

for (const status of ['archived', 'corrected', 'merged']) {
  test(`非 pending survivor（${status}）不复活`, async () => {
    const { db, pair } = await setup()
    const p = await pair('old', 'new', { status: 'active' }, { status })
    const r = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old' })
    assert.equal(r.ok, true)
    assert.equal(db.prepare('SELECT status FROM memories WHERE id=?').get(p.newId).status, status)
  })
}

test('相同决策重复调用幂等，不增加 revision', async () => {
  const { db, pair } = await setup()
  const p = await pair('old', 'new', { status: 'active' }, { status: 'pending' })
  const first = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old' })
  const before = Number(db.prepare('SELECT count(*) c FROM memory_revisions').get().c)
  const second = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old' })
  assert.equal(first.ok, true)
  assert.equal(second.alreadyResolved, true)
  assert.equal(Number(db.prepare('SELECT count(*) c FROM memory_revisions').get().c), before)
})

test('已解决冲突不能被不同决策静默覆盖', async () => {
  const { db, pair } = await setup()
  const p = await pair()
  resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old' })
  const second = resolveConflictRow(db, { id: p.qid, action: 'keep', side: 'old' })
  assert.equal(second.ok, false)
  assert.equal(second.code, 'E_CONFLICT_DECISION_MISMATCH')
})

test('事务回滚：状态迁移失败时队列、记忆、revision 全部回滚', async () => {
  const { db, pair } = await setup()
  const p = await pair('old', 'new', { status: 'active' }, { status: 'pending' })
  db.exec("CREATE TRIGGER fail_corrected BEFORE UPDATE ON memories WHEN NEW.status='corrected' BEGIN SELECT RAISE(ABORT, 'forced rollback'); END")
  const r = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old' })
  assert.equal(r.ok, false)
  assert.equal(db.prepare('SELECT status FROM conflict_queue WHERE id=?').get(p.qid).status, 'pending')
  assert.equal(db.prepare('SELECT status FROM memories WHERE id=?').get(p.oldId).status, 'active')
  assert.equal(Number(db.prepare('SELECT count(*) c FROM memory_revisions').get().c), 0)
})

test('受害者缺失返回明确错误，不伪报成功', async () => {
  const { db, pair } = await setup()
  const p = await pair()
  db.prepare('DELETE FROM memories WHERE id=?').run(p.newId)
  const r = resolveConflictRow(db, { id: p.qid, action: 'keep', side: 'old' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'victim-missing')
  assert.equal(db.prepare('SELECT status FROM conflict_queue WHERE id=?').get(p.qid).status, 'pending')
})

test('keep 清理 FTS、实体关联与向量残行', async () => {
  const { db, pair } = await setup()
  const p = await pair('保留的咖啡偏好', '待删除的辣椒偏好')
  db.prepare("INSERT INTO entities(name,type) VALUES('测试实体','thing')").run()
  const eid = Number(db.prepare("SELECT id FROM entities WHERE name='测试实体'").get().id)
  db.prepare('INSERT INTO memory_entities(memory_id,entity_id,weight) VALUES(?,?,1)').run(p.newId, eid)
  db.prepare('INSERT INTO vectors(memory_id,dim,vec) VALUES(?,?,?)').run(p.newId, 1, Buffer.from(new Float32Array([1]).buffer))
  const r = resolveConflictRow(db, { id: p.qid, action: 'keep', side: 'old' })
  assert.equal(r.ok, true)
  assert.equal(Number(db.prepare('SELECT count(*) c FROM fts_bigram WHERE rowid=?').get(p.newId).c), 0)
  assert.equal(Number(db.prepare('SELECT count(*) c FROM fts_trigram WHERE rowid=?').get(p.newId).c), 0)
  assert.equal(Number(db.prepare('SELECT count(*) c FROM memory_entities WHERE memory_id=?').get(p.newId).c), 0)
  assert.equal(Number(db.prepare('SELECT count(*) c FROM vectors WHERE memory_id=?').get(p.newId).c), 0)
})

test('audit meta 与队列/记忆状态同事务写入', async () => {
  const { db, pair } = await setup()
  const p = await pair('old', 'new', { status: 'active' }, { status: 'pending' })
  const r = resolveConflictRow(db, { id: p.qid, action: 'drop', side: 'old', actor: 'owner', now: 500 })
  assert.equal(r.ok, true)
  const audit = JSON.parse(db.prepare('SELECT v FROM meta WHERE k=?').get(`conflict_audit_${p.qid}`).v)
  assert.equal(audit.action, 'drop')
  assert.equal(audit.side, 'old')
  assert.equal(audit.victimId, p.oldId)
  assert.equal(audit.survivorId, p.newId)
  assert.equal(audit.survivorActivated, true)
})

test('队列已 stale 或 resolved 外的状态不允许被处理', async () => {
  const { db, pair } = await setup()
  const p = await pair()
  db.prepare("UPDATE conflict_queue SET status='stale' WHERE id=?").run(p.qid)
  const r = resolveConflictRow(db, { id: p.qid, action: 'keep', side: 'old' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'E_CONFLICT_NOT_PENDING')
})
