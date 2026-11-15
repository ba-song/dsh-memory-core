import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const DIR = mkdtempSync(join(tmpdir(), 'dy-weekly-'))
process.env.DY_MEMORY_DIR = DIR
const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { clusterMemories, weeklyConsolidate } = await import('../lib/consolidate/weekly.js')
const { similarity, bestMatch } = await import('../lib/consolidate/similarity.js')

const db = openDb(DIR).db
const now = Date.now()

test('相似度：近似重复高、无关低；bestMatch 阈值生效', () => {
  assert.ok(similarity('主人喜欢烤生蚝', '主人喜欢吃烤生蚝') > 0.55)
  assert.ok(similarity('主人喜欢烤生蚝', '今天下雨了') < 0.2)
  const m = bestMatch('主人喜欢吃烤生蚝', [{ id: 1, text: '主人喜欢烤生蚝' }], { threshold: 0.55 })
  assert.equal(m.item.id, 1)
  assert.equal(bestMatch('今天下雨了', [{ id: 1, text: '主人喜欢烤生蚝' }], { threshold: 0.55 }), null)
})

test('周结 dry-run：相似事实聚成一簇，不写库', async () => {
  await insertMemory(db, { kind: 'fact', text: '主人喜欢烤生蚝', layer: 'auto', importance: 0.6, createdAt: now - 2 * 86400000, scopeType: 'owner' })
  await insertMemory(db, { kind: 'fact', text: '主人喜欢吃烤生蚝', layer: 'auto', importance: 0.7, createdAt: now - 86400000, scopeType: 'owner' })
  await insertMemory(db, { kind: 'preference', text: '主人喜欢看AI教程', layer: 'auto', importance: 0.5, createdAt: now - 86400000, scopeType: 'owner' })
  const rows = db.prepare("SELECT * FROM memories WHERE layer='auto'").all()
  assert.equal(clusterMemories(rows, 0.55).length, 1)
  const r = weeklyConsolidate({ db, cfg: { enabled: true, dryRun: true, threshold: 0.55 }, dataDir: DIR })
  assert.equal(r.ok, true)
  assert.equal(r.clusters.length, 1)
  assert.equal(r.applied.superseded, 0)
  const active = db.prepare("SELECT count(*) c FROM memories WHERE status='active'").get().c
  assert.equal(active, 3, 'dry-run 不能改库')
})

test('周结 apply：只把重复条标 superseded，保留 keeper，不删正文', async () => {
  const r = weeklyConsolidate({ db, cfg: { enabled: true, dryRun: false, threshold: 0.55 }, dataDir: DIR })
  assert.equal(r.ok, true, 'ERR='+(r.error||''))
  assert.equal(r.applied.superseded, 1)
  const rows = db.prepare("SELECT id,status,superseded_by,text FROM memories WHERE layer='auto' ORDER BY id").all()
  const superseded = rows.filter((x) => x.status === 'superseded')
  assert.equal(superseded.length, 1)
  assert.ok(superseded[0].superseded_by > 0)
  assert.ok(superseded[0].text.length > 0, '正文保留')
  assert.equal(rows.filter((x) => x.status === 'active').length, 2)
})

test.after(() => { try { rmSync(DIR, { recursive: true, force: true }) } catch {} })
