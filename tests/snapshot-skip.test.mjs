/**
 * 2026-11-17：快照写放大优化。
 * 生产库 245MB，原实现每 30 分钟无条件 `VACUUM INTO` 一份 → 约 12 GB/天写放大。
 * 现在先比内容指纹，没变化就跳过。这一组测试把「该跳的跳、该拍的拍」钉死。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { snapshotNow, listSnapshots, SNAPSHOT_DIRNAME } from '../lib/maintain/snapshot.js'

const DIR = mkdtempSync(join(tmpdir(), 'mem-snap-'))
const { db } = openDb(DIR)

const countSnaps = () => {
  try { return readdirSync(join(DIR, SNAPSHOT_DIRNAME)).filter((f) => f.startsWith('auto-') && f.endsWith('.db')).length } catch { return 0 }
}

test('P1 首次快照照常拍（没有旧快照时不能跳过）', () => {
  const r = snapshotNow(DIR, { now: new Date('2026-11-17T01:00:00') })
  assert.equal(r.skipped, false)
  assert.equal(countSnaps(), 1)
})

test('P2 内容没变 → 跳过，不再写 245MB', () => {
  const r = snapshotNow(DIR, { now: new Date('2026-11-17T01:30:00') })
  assert.equal(r.skipped, true)
  assert.equal(r.reason, 'unchanged')
  assert.equal(countSnaps(), 1, '跳过时不应新增文件')
})

test('P3 有新记忆 → 必须拍新快照', async () => {
  const { insertMemory } = await import('../lib/store/memories.js')
  await insertMemory(db, { kind: 'fact', text: '快照指纹测试用的新记忆', layer: 'manual', confidence: 1 })
  const r = snapshotNow(DIR, { now: new Date('2026-11-17T02:00:00') })
  assert.equal(r.skipped, false, '有写入时必须拍')
  assert.equal(countSnaps(), 2)
})

test('P4 skipIfUnchanged:false → 无条件拍（保留旧语义可用）', () => {
  const r = snapshotNow(DIR, { now: new Date('2026-11-17T02:30:00'), skipIfUnchanged: false })
  assert.equal(r.skipped, false)
  assert.equal(countSnaps(), 3)
})

test('P5 轮转仍然生效：keep=2 时只留最新两份', () => {
  snapshotNow(DIR, { now: new Date('2026-11-17T03:00:00'), skipIfUnchanged: false, keep: 2 })
  assert.ok(listSnapshots(DIR).length <= 2, `实际 ${listSnapshots(DIR).length}`)
})

test.after(() => { try { db.close(); rmSync(DIR, { recursive: true, force: true }) } catch {} })
