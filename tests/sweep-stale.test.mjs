/**
 * 2026-11-16 补：sweepStale 先前定义了却**零调用**。
 * 后果：进程被杀留下的 running 行永远卡着——同 kind+requestId 的后续调用会一直 E_PENDING，
 * 而「不自动重放」意味着它不会自己恢复。这里验证 withOperation 的惰性巡检真的把它收掉。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { withOperation, OP_RUNNING, OP_FAILED_UNKNOWN, sweepStale } from '../lib/store/receipts.js'

const DIR = mkdtempSync(join(tmpdir(), 'mem-sweep-'))
const { db } = openDb(DIR)
const OLD = Date.now() - 3_600_000 // 1 小时前的 running

function seedRunning(id, kind, requestId, updatedAt) {
  db.prepare(
    `INSERT INTO operations(id,kind,request_id,digest,status,result_json,usage_json,created_at,updated_at)
     VALUES(?,?,?,?,?,NULL,NULL,?,?)`,
  ).run(id, kind, requestId, 'd'.repeat(64), OP_RUNNING, updatedAt, updatedAt)
}

test('S1 sweepStale 本身：超时的 running 变 failed_unknown，新的不动', () => {
  seedRunning('probe:stale', 'probe', 'stale', OLD)
  seedRunning('probe:fresh', 'probe', 'fresh', Date.now())
  const r = sweepStale(db, { now: Date.now(), timeoutMs: 600_000 })
  assert.equal(r.ok, true)
  assert.equal(r.swept, 1, '只该收掉 1 小时前那条')
  const stale = db.prepare("SELECT status,result_json FROM operations WHERE id='probe:stale'").get()
  assert.equal(stale.status, OP_FAILED_UNKNOWN)
  assert.equal(JSON.parse(stale.result_json).billing, 'unknown', '不确定的口径必须是 unknown，不能写 0')
  assert.equal(JSON.parse(stale.result_json).retried, false)
  const fresh = db.prepare("SELECT status FROM operations WHERE id='probe:fresh'").get()
  assert.equal(fresh.status, OP_RUNNING, '刚插入的 running 不能被误收')
})

test('S2 withOperation 惰性巡检：卡住的旧行会被顺手收掉（证明不再是死代码）', async () => {
  seedRunning('probe:stuck', 'probe2', 'stuck', OLD)
  // 换一个 requestId → 走新操作路径，同时触发节流巡检
  const out = await withOperation(db, {
    kind: 'probe2',
    requestId: 'brand-new',
    payload: { x: 1 },
    run: async () => ({ done: true }),
  })
  assert.equal(out.ok, true)
  const stuck = db.prepare("SELECT status FROM operations WHERE id='probe:stuck'").get()
  assert.equal(stuck.status, OP_FAILED_UNKNOWN, 'withOperation 应惰性收掉卡住的 running')
})

test('S3 被收掉的 id 不会变成「可重放」——仍是 requireNewId', async () => {
  const out = await withOperation(db, {
    kind: 'probe',
    requestId: 'stale',
    payload: {},
    run: async () => ({ shouldNotRun: true }),
  })
  assert.equal(out.ok, false)
  assert.equal(out.requireNewId, true, 'failed_unknown 必须要求换新 id，绝不自动重放')
})

test.after(() => { try { rmSync(DIR, { recursive: true, force: true }) } catch {} })
