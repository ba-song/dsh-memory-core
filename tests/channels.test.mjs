/**
 * 多通道（阶段 3）
 * - raw_meta 增列后写入自动填 channel/thread_id/account_id/external_id/url
 * - 旧行（列不存在时写入，迁移后补空串）仍可召回，不报错
 * - service.recall 默认只返回「同通道 + 空通道」；allowCrossChannel 才跨通道
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

process.env.DY_MEMORY_DIR = '/tmp/dy-channels-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { RawArchive } = await import('../lib/ingest/archive.js')

const dir = process.env.DY_MEMORY_DIR
const ownerQQ = '1000000001'
const ownerCwd = `/root/qq-agent/QQ会话/私聊_${ownerQQ}`
const groupCwd = '/root/qq-agent/QQ会话/群_123456'

const { db } = openDb(dir)

// ── 1. 迁移前的旧行为：没有新列也能写 ─────────────────────────
const legacy = new RawArchive({ db, dir: dir + '/raw', cwdPrefix: '/root/qq-agent/QQ会话', log: { info() {}, warn() {} } })
legacy.onEvent({ header: { id: 's-legacy', cwd: ownerCwd } }, {
  type: 'user/message', seq: 1, time: Date.now() - 60000,
  data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '迁移前的旧行' }] },
})
// 迁移前：列不存在，写入仍应成功（不报错）
assert.ok(db.prepare('SELECT count(*) c FROM raw_meta').get().c >= 1)

// ── 2. 按迁移脚本建列（模拟 scripts/migrate-stage3.mjs --task channels）──
for (const c of ['account_id', 'thread_id', 'external_id', 'url', 'speaker_id']) db.exec(`ALTER TABLE raw_meta ADD COLUMN ${c} TEXT DEFAULT ''`)
// 回填旧行 thread_id（迁移脚本同一逻辑）
db.prepare("UPDATE raw_meta SET thread_id=? WHERE cwd=?").run(ownerQQ, ownerCwd)
for (const c of ['subject_id', 'source_channel', 'source_ref']) { const has = db.prepare('PRAGMA table_info(memories)').all().some((x) => String(x.name) === c); if (!has) db.exec(`ALTER TABLE memories ADD COLUMN ${c} TEXT DEFAULT ''`) }
try { db.exec('ALTER TABLE memories ADD COLUMN superseded_by INTEGER DEFAULT 0') } catch {}

// ── 3. 新写入：channel/thread_id 自动填 ────────────────────────
const archive = new RawArchive({ db, dir: dir + '/raw', cwdPrefix: '/root/qq-agent/QQ会话', log: { info() {}, warn() {} } })
archive.onEvent({ header: { id: 's-new', cwd: ownerCwd } }, {
  type: 'user/message', seq: 2, time: Date.now(),
  data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '私有聊的新行' }] },
})
archive.onEvent({ header: { id: 's-group', cwd: groupCwd } }, {
  type: 'user/message', seq: 3, time: Date.now(),
  data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '群里的新行' }] },
})

const priv = db.prepare('SELECT * FROM raw_meta WHERE cwd=? ORDER BY id DESC LIMIT 1').get(ownerCwd)
assert.equal(priv.channel, 'qq')
assert.equal(priv.thread_id, ownerQQ, '私聊 thread_id 应是对方 QQ')
assert.equal(priv.account_id, '')
assert.equal(priv.external_id, '')

const grp = db.prepare('SELECT * FROM raw_meta WHERE cwd=? ORDER BY id DESC LIMIT 1').get(groupCwd)
assert.equal(grp.thread_id, 'group:123456', '群 thread_id 应是 group:<gid>')

// 旧行（迁移前写入）补列后 thread_id 为空串 → 仍可读
const old = db.prepare("SELECT * FROM raw_meta WHERE file LIKE '%s-legacy%'").get()
assert.equal(old.thread_id, ownerQQ, '旧行按 cwd 回填 thread_id')
assert.equal(String(old.raw_text).includes('迁移前的旧行'), true)

// ── 4. recall 隔离：默认同通道 + 空通道 ────────────────────────
const ins = async (text, channel) => {
  const id = await insertMemory(db, { kind: 'fact', text, importance: 0.9, layer: 'manual' })
  db.prepare('UPDATE memories SET source_channel=? WHERE id=?').run(channel, id)
  return id
}
const idDouyin = await ins('通道测试 抖音的视频', 'douyin')
const idQq = await ins('通道测试 QQ 的对话', 'qq')
const idOld = await ins('通道测试 空通道旧数据', '')
// 空通道行迁移后是 ''，service 允许它被召回

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
mod.apply(ctx, { ownerQQ, keywordGate: 0.05 }) // 三条同前缀文档，降低关键词门槛以专测通道过滤
const svc = ctx.get('dyMemory')
const header = { id: 's1', cwd: ownerCwd }

const def = await svc.recall('通道测试', { header, limit: 10 })
const defIds = def.map((x) => x.id)
assert.ok(defIds.includes(idQq), '默认应召回同通道（qq）')
assert.ok(defIds.includes(idOld), '默认应召回空通道（历史未标通道）')
assert.ok(!defIds.includes(idDouyin), '默认不得召回其他通道')

const cross = await svc.recall('通道测试', { header, limit: 10, allowCrossChannel: true })
const crossIds = cross.map((x) => x.id)
assert.ok(crossIds.includes(idDouyin), 'allowCrossChannel=true 才跨通道')

// 返回结构带 sourceChannel
const dy = cross.find((x) => x.id === idDouyin)
assert.equal(dy.sourceChannel, 'douyin', 'Hit 应带 sourceChannel')

console.log(JSON.stringify({
  ok: true, test: 'channels',
  privThread: priv.thread_id === ownerQQ,
  groupThread: grp.thread_id,
  defaultIds: defIds.length,
  crossIds: crossIds.length,
  douyinBlockedByDefault: !defIds.includes(idDouyin),
}))
process.exit(0)
