/**
 * selfid 子进程夹具：验证插件侧两件事（DATA_DIR 在模块加载时固定，故用独立进程）
 * 1. persona 可用时，新归档行写 self:<uuid>（不重复前缀）
 * 2. 启动时把遗留的 self:unknown 行自动回填
 *
 * 输入：env.DY_MEMORY_DIR（空目录）
 * 输出：最后一行 JSON
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.env.DY_MEMORY_DIR
rmSync(dir, { recursive: true, force: true })

const { openDb } = await import('../../lib/store/db.js')
const { db: seed } = openDb(dir)
// 先建 raw_meta，再模拟阶段 3 迁移补 speaker_id
const { RawArchive } = await import('../../lib/ingest/archive.js')
void new RawArchive({ db: seed, dir: join(dir, 'raw'), cwdPrefix: '/root/qq-agent/QQ会话', log: { info() {}, warn() {} } })
seed.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const cwd = '/root/qq-agent/QQ会话/私聊_1000000001'
seed.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,speaker_id,tombstone,chars,raw_text,at,extra,cwd)
  VALUES('2026-11-01','x.md',1,1,'self','','qq','self:unknown',0,5,'旧行',?, '{"pendingIdentity":true}', ?)`).run(Date.now(), cwd)
seed.close?.()

const handlers = {}
const services = new Map()
const ctx = {
  get(n) {
    if (n === 'tools') return { register: () => {} }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    if (n === 'dyPersona') return { selfId: () => 'self:startup-uuid' }
    return services.get(n)
  },
  provide(n, v) { services.set(n, v); return () => services.delete(n) },
  on(e, f) { handlers[e] = f },
  logger: { info() {}, warn() {} },
}
const mod = await import('../../lib/index.js')
mod.apply(ctx, { ownerQQ: '1000000001' })

// 启动回填结果
const { openDb: open2 } = await import('../../lib/store/db.js')
const { db } = open2(dir)
const filled = db.prepare("SELECT speaker_id,extra FROM raw_meta WHERE role='self'").get()

// 新写入
handlers['session/event']({ header: { id: 's2', cwd } }, {
  type: 'assistant/message', seq: 2, time: Date.now(),
  data: { content: [{ type: 'text', text: '恢复后的回复' }] },
})
const live = db.prepare("SELECT speaker_id,extra FROM raw_meta WHERE raw_text LIKE '%恢复后的回复%'").get()

console.log(JSON.stringify({
  ok: true,
  startupBackfill: filled?.speaker_id ?? null,
  pendingCleared: filled ? JSON.parse(filled.extra).pendingIdentity === false : false,
  liveWrite: live?.speaker_id ?? null,
}))
process.exit(0)
