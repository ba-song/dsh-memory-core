import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const DIR = mkdtempSync(join(tmpdir(), 'dy-weekly-'))
process.env.DY_MEMORY_DIR = DIR
const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { clusterMemories, weeklyConsolidate, loadWeeklyCandidates } = await import('../lib/consolidate/weekly.js')
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
  await insertMemory(db, { kind: 'fact', text: '主人喜欢烤生蚝', layer: 'auto', importance: 0.6, createdAt: now - 2 * 86400000, scopeType: 'owner', validTo: now + 86400000 })
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
  const r = weeklyConsolidate({ db, cfg: { enabled: true, dryRun: false, threshold: 0.55 }, now, dataDir: DIR })
  assert.equal(r.ok, true, 'ERR='+(r.error||''))
  assert.equal(r.applied.superseded, 1)
  const rows = db.prepare("SELECT id,status,superseded_by,text FROM memories WHERE layer='auto' ORDER BY id").all()
  const superseded = rows.filter((x) => x.status === 'superseded')
  assert.equal(superseded.length, 1)
  assert.ok(superseded[0].superseded_by > 0)
  assert.ok(superseded[0].text.length > 0, '正文保留')
  assert.equal(rows.filter((x) => x.status === 'active').length, 2)
  // 2026-11-16 补：superseded 必须同时 bump revision、写快照、设 valid_to，
  // 否则 dy_memory_asof 看不到「这条以前是真的」这段历史（原先只改 status）。
  const full = db.prepare('SELECT revision, updated_at, valid_to, temporal_kind FROM memories WHERE id=?').get(superseded[0].id)
  assert.equal(Number(full.revision), 2, 'superseded 必须 revision+1')
  assert.ok(Number(full.updated_at) > 0, 'superseded 必须更新 updated_at')
  assert.equal(Number(full.valid_to), now, '原有未来 valid_to 必须收敛到实际 supersede 时刻')
  const snapshot = db.prepare('SELECT previous_json FROM memory_revisions WHERE memory_id=?').get(superseded[0].id)
  assert.ok(Number(JSON.parse(snapshot.previous_json).valid_to) > now, 'revision 快照必须保留迁移前的未来 valid_to')
  assert.equal(full.temporal_kind, 'historical')
  const snaps = db.prepare('SELECT count(*) c FROM memory_revisions WHERE memory_id=?').get(superseded[0].id).c
  assert.equal(Number(snaps), 1, 'superseded 必须留一条修订快照')
})



test('周结候选：统一 current validity 排除 future、expired、superseded、archived 与超窗记录', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-weekly-validity-'))
  const { db: isolated } = openDb(dir)
  const at = Date.UTC(2026, 10, 21)
  try {
    const add = (text, opts = {}) => insertMemory(isolated, {
      kind: opts.kind ?? 'fact',
      text,
      layer: opts.layer ?? 'auto',
      status: opts.status ?? 'active',
      createdAt: opts.createdAt ?? at - 86400000,
      validFrom: opts.validFrom ?? null,
      validTo: opts.validTo ?? null,
      importance: opts.importance ?? 0.5,
    })
    const current = await add('current weekly candidate', { validFrom: at - 1000 })
    const legacy = await add('legacy weekly candidate')
    const future = await add('future weekly candidate', { validFrom: at + 1 })
    const expired = await add('expired weekly candidate', { validFrom: at - 1000, validTo: at })
    const superseded = await add('superseded weekly candidate', { validFrom: at - 1000 })
    isolated.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(999999, superseded)
    const archived = await add('archived weekly candidate', { status: 'archived' })
    const tooOld = await add('outside weekly lookback', { createdAt: at - 7 * 86400000 - 1 })
    const manual = await add('manual weekly candidate', { layer: 'manual' })
    const otherKind = await add('episode weekly candidate', { kind: 'episode' })

    const rows = loadWeeklyCandidates(isolated, { at, since: at - 7 * 86400000 })
    const ids = rows.map((row) => Number(row.id))
    assert.ok(ids.includes(current))
    assert.ok(ids.includes(legacy), 'legacy NULL valid_from remains compatible')
    for (const id of [future, expired, superseded, archived, tooOld, manual, otherKind]) {
      assert.ok(!ids.includes(id), `must not be a weekly candidate: #${id}`)
    }
  } finally {
    try { isolated.close() } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
})

test('周结 apply：缺少 revision 快照表时失败关闭并整体回滚', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-weekly-no-revisions-'))
  const { db: isolated } = openDb(dir)
  try {
    const a = await insertMemory(isolated, { kind: 'fact', text: '主人喜欢烤生蚝', layer: 'auto', importance: 0.6, createdAt: now - 2 * 86400000 })
    const b = await insertMemory(isolated, { kind: 'fact', text: '主人喜欢吃烤生蚝', layer: 'auto', importance: 0.7, createdAt: now - 86400000, validTo: now + 86400000 })
    isolated.exec('DROP TABLE memory_revisions')
    const r = weeklyConsolidate({ db: isolated, cfg: { dryRun: false, threshold: 0.55 }, now })
    assert.equal(r.ok, false, 'missing history table must not fall back to legacy status-only write')
    assert.match(r.error, /memory_revisions/i)
    assert.equal(isolated.prepare('SELECT status FROM memories WHERE id=?').get(a).status, 'active')
    assert.equal(isolated.prepare('SELECT status FROM memories WHERE id=?').get(b).status, 'active')
    assert.equal(isolated.prepare("SELECT v FROM meta WHERE k='consolidate.weeklyLastAt'").get(), undefined)
  } finally {
    try { isolated.close() } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
})

test('周结 apply：CAS 更新未命中时快照和状态迁移一起回滚', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dy-weekly-cas-'))
  const { db: isolated } = openDb(dir)
  try {
    const keeper = await insertMemory(isolated, { kind: 'fact', text: '主人喜欢烤生蚝', layer: 'auto', importance: 0.8, createdAt: now - 2 * 86400000 })
    const member = await insertMemory(isolated, { kind: 'fact', text: '主人喜欢吃烤生蚝', layer: 'auto', importance: 0.5, createdAt: now - 86400000 })
    isolated.exec(`
      CREATE TRIGGER ignore_weekly_member_update
      BEFORE UPDATE OF status ON memories
      WHEN OLD.id = ${Number(member)} AND NEW.status = 'superseded'
      BEGIN SELECT RAISE(IGNORE); END
    `)
    const r = weeklyConsolidate({ db: isolated, cfg: { dryRun: false, threshold: 0.55 }, now })
    assert.equal(r.ok, false)
    assert.match(r.error, /E_WEEKLY_MEMBER_CAS_CONFLICT/)
    assert.equal(isolated.prepare('SELECT status FROM memories WHERE id=?').get(member).status, 'active')
    assert.equal(isolated.prepare('SELECT importance FROM memories WHERE id=?').get(keeper).importance, 0.8)
    assert.equal(Number(isolated.prepare('SELECT count(*) AS n FROM memory_revisions').get().n), 0)
    assert.equal(isolated.prepare("SELECT v FROM meta WHERE k='consolidate.weeklyLastAt'").get(), undefined)
  } finally {
    try { isolated.close() } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
})

test.after(() => { try { rmSync(DIR, { recursive: true, force: true }) } catch {} })
