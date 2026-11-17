/**
 * self:unknown 最小闭环（阶段 4）
 * - persona 缺失：raw 写 self:unknown + pending；service.addEpisode 拒绝（E_PERSONA_UNAVAILABLE）
 * - persona 恢复：按批次回填成 self:<uuid>，清 pending，幂等
 * - 插件侧：恢复后新写入直接 self:<uuid>；启动时自动回填遗留 pending 行
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
process.env.DY_MEMORY_DIR = '/tmp/dy-selfid-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { countUnknownSelf, backfillUnknownSelf, backfillAll } = await import('../lib/selfid.js')
const { createMemoryService } = await import('../lib/service.js')

const dir = process.env.DY_MEMORY_DIR
const cwd = '/root/qq-agent/QQ会话/私聊_1000000001'
const { db } = openDb(dir)
// 先让 RawArchive 建表，再模拟阶段 3 迁移补 speaker_id 列（self:unknown 依赖它）
const bootstrap = new RawArchive({ db, dir: dir + '/raw', cwdPrefix: '/root/qq-agent/QQ会话', log: { info() {}, warn() {} } })
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
void bootstrap

// ── 1. persona 缺失：写 self:unknown + pending ──────────────────
const archive = new RawArchive({ db, dir: dir + '/raw', cwdPrefix: '/root/qq-agent/QQ会话', log: { info() {}, warn() {} } })
archive.onEvent({ header: { id: 's1', cwd } }, {
  type: 'assistant/message', seq: 1, time: Date.now(),
  data: { content: [{ type: 'reasoning', text: '想一想' }, { type: 'text', text: '好呀' }, { type: 'text', text: '第二段' }] },
})
const rows1 = db.prepare('SELECT role,speaker_id,extra FROM raw_meta ORDER BY id').all()
const selfRows = rows1.filter((r) => r.role === 'self' || r.role === 'self-thought')
assert.equal(selfRows.length, 3, 'reasoning 1 + text 2')
for (const r of selfRows) {
  assert.equal(r.speaker_id, 'self:unknown', 'persona 缺失时 self 行写 self:unknown')
  assert.equal(JSON.parse(r.extra).pendingIdentity, true, '必须带 pending 标记')
}
assert.equal(countUnknownSelf(db), 3)

// service.addEpisode：persona 缺失 → E_PERSONA_UNAVAILABLE
const svc = createMemoryService({
  db,
  recallFn: async () => [],
  getVectors: () => new Map(),
  getMonitor: () => null,
  getPersona: () => undefined,
  isOwnerHeader: () => true,
  lastUserMessageAt: () => null,
  now: () => Date.now(),
  hasColumn: () => false,
  insertMemory: async () => 1,
  cfg: {},
  log: { info() {}, warn() {} },
})
await assert.rejects(
  svc.addEpisode({ text: 'persona 缺失时的一条', header: { id: 's1', cwd } }),
  (e) => e.code === 'E_PERSONA_UNAVAILABLE',
  'persona 缺失时 memories 写入必须拒绝',
)

// ── 2. dry-run 不改 ───────────────────────────────────────────
const dry = backfillUnknownSelf(db, { selfId: 'self:abc-123', dryRun: true })
assert.equal(dry.examined, 3)
assert.equal(dry.updated, 0)
assert.equal(countUnknownSelf(db), 3, 'dry-run 不得修改')

// ── 3. persona 恢复 → 按批次回填 ──────────────────────────────
const r1 = backfillUnknownSelf(db, { selfId: 'abc-123', limit: 2, batch: 'batch-1' })
assert.equal(r1.updated, 2, 'limit 生效：只回填一批')
assert.equal(r1.remaining, 1)
assert.equal(db.prepare("SELECT v FROM meta WHERE k='self_unknown_backfill_batch'").get().v, 'batch-1', '第一批批次标记已落 meta')
const r1b = backfillUnknownSelf(db, { selfId: 'abc-123', limit: 2 })
assert.equal(r1b.updated, 1, '第二批复填剩余')
assert.equal(r1b.remaining, 0)
const back = db.prepare("SELECT speaker_id,extra FROM raw_meta WHERE role IN ('self','self-thought')").all()
for (const r of back) {
  assert.equal(r.speaker_id, 'self:abc-123', '回填成 self:<uuid>（自动补前缀）')
  const e = JSON.parse(r.extra)
  assert.equal(e.pendingIdentity, false)
  assert.equal(e.selfId, 'self:abc-123')
}
const r2 = backfillUnknownSelf(db, { selfId: 'self:abc-123' })
assert.equal(r2.examined, 0, '再跑幂等')
assert.equal(backfillAll(db, { selfId: 'self:abc-123' }).remaining, 0)

// ── 4/5. 插件侧：恢复后写 self:<uuid>；启动自动回填 ─────────────
const childOut = execFileSync(process.execPath, [join(HERE, 'fixtures', 'selfid-child.mjs')], {
  env: { ...process.env, DY_MEMORY_DIR: '/tmp/dy-selfid-child-' + process.pid },
  encoding: 'utf8',
})
const child = JSON.parse(childOut.trim().split('\n').at(-1))
assert.equal(child.liveWrite, 'self:startup-uuid', 'persona 可用时写 self:<uuid>，不重复前缀')
assert.equal(child.startupBackfill, 'self:startup-uuid', '启动时自动回填遗留 self:unknown')
assert.equal(child.pendingCleared, true)

console.log(JSON.stringify({
  ok: true, test: 'selfid',
  unknownBefore: 3, backfilled: r1.updated + r1b.updated, remaining: 0,
  liveWrite: child.liveWrite, startupBackfill: child.startupBackfill,
}))
process.exit(0)
