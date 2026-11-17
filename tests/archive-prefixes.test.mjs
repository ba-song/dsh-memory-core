process.env.TZ = "Asia/Shanghai"   // 展示/归档固定北京时间，测试同日历
/**
 * B-2 原话归档路径 —— 2026-11-05
 *
 * 覆盖：
 *   ① 旧前缀行为完全不变（回归：QQ 私聊仍落 raw）
 *   ② home（trustedDirs 里的目录）能落 raw（文件 + raw_meta）
 *   ③ 非白名单路径（工作区/渠道）仍不归档
 *   ④ `archiveCwdPrefixes` 列表/旧单值/默认值三种解析；前缀按目录边界
 */
import assert from 'node:assert'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DATA_DIR = '/tmp/dy-archive-prefixes-' + process.pid
process.env.DY_MEMORY_DIR = DATA_DIR
rmSync(DATA_DIR, { recursive: true, force: true })
mkdirSync(DATA_DIR, { recursive: true })

const { resolveArchivePrefixes, LEGACY_ARCHIVE_PREFIX } = await import('../lib/config.js')
const { isUnderPrefix, RawArchive } = await import('../lib/ingest/archive.js')

const HOME = '/sdcard/DSHA/生活/数据/home'
const QQ = '/root/qq-agent/QQ会话/私聊_1000000001'
const WORK = '/sdcard/DSHA/工作区'
const CHANNEL = '/sdcard/DSHA/渠道'
const out = { ok: true, test: 'archive-prefixes' }

// ── ④ 前缀解析 ───────────────────────────────────────────────────
assert.deepEqual(resolveArchivePrefixes({}), [LEGACY_ARCHIVE_PREFIX], '都没配 → 旧前缀（行为不变）')
assert.deepEqual(resolveArchivePrefixes({ trustedDirs: [HOME] }), [LEGACY_ARCHIVE_PREFIX, HOME], 'trustedDirs 自动并入')
assert.deepEqual(resolveArchivePrefixes({ archiveCwdPrefix: '/x/a' }), ['/x/a'], '旧单值仍生效')
assert.deepEqual(resolveArchivePrefixes({ archiveCwdPrefix: '/x/a', trustedDirs: [HOME] }), ['/x/a', HOME])
assert.deepEqual(
  resolveArchivePrefixes({ archiveCwdPrefixes: ['/x/a', '/x/b/'], trustedDirs: [HOME] }),
  ['/x/a', '/x/b', HOME],
  '列表优先 + 尾斜杠归一 + trustedDirs 并入',
)
assert.deepEqual(resolveArchivePrefixes({ archiveCwdPrefixes: [], archiveCwdPrefix: '/x/a' }), ['/x/a'], '空列表回退旧单值')

assert.equal(isUnderPrefix('/x/a/sub', ['/x/a']), true)
assert.equal(isUnderPrefix('/x/a', ['/x/a']), true)
assert.equal(isUnderPrefix('/x/a2', ['/x/a']), false, '按目录边界，不许 /x/a2 命中 /x/a')
assert.equal(isUnderPrefix('', ['/x/a']), false)
assert.equal(isUnderPrefix('/any', []), true, '空前缀 = 不限制（旧语义）')
out.resolve = 'ok'

// 构造器默认值：什么都没给 → 旧前缀；给 cwdPrefixes → 用它
{
  const db = new DatabaseSync(join(DATA_DIR, 'scratch.db'))
  const a = new RawArchive({ db, dir: join(DATA_DIR, 'raw-scratch-1') })
  assert.deepEqual(a.cwdPrefixes, [LEGACY_ARCHIVE_PREFIX])
  const b = new RawArchive({ db, dir: join(DATA_DIR, 'raw-scratch-2'), cwdPrefixes: ['/x/a', HOME] })
  assert.deepEqual(b.cwdPrefixes, ['/x/a', HOME])
  const c = new RawArchive({ db, dir: join(DATA_DIR, 'raw-scratch-3'), cwdPrefix: '/x/legacy' })
  assert.deepEqual(c.cwdPrefixes, ['/x/legacy'], '旧 cwdPrefix 参数仍兼容')
  db.close()
}
out.constructor = 'ok'

// ── 集成：apply 后按 cwd 决定是否归档 ────────────────────────────
const handlers = {}
const ctx = {
  get(n) {
    if (n === 'tools') return { register: () => {} }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    return undefined
  },
  on(evt, fn) { handlers[evt] = fn },
  provide() { return () => {} },
  logger: { info() {}, warn() {} },
}
const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: '1000000001', trustedDirs: [HOME] })

const emit = (cwd, sid, seq, text) => handlers['session/event'](
  { header: { id: sid, cwd } },
  { type: 'user/message', seq, time: Date.now(), data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text }] } },
)
emit(QQ, 'q1', 1, '旧前缀的一句话')
emit(HOME, 'h1', 1, '家里的一句话')
emit(WORK, 'w1', 1, '工作区的一句话')
emit(CHANNEL, 'c1', 1, '渠道里别人的一句话')

// 文件：QQ 与 home 各一份，工作区/渠道没有
const d = new Date()
const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const rawDir = join(DATA_DIR, 'raw', day)
assert.ok(existsSync(join(rawDir, 's-q1.md')), '旧前缀（QQ 私聊）必须仍然归档')
assert.ok(existsSync(join(rawDir, 's-h1.md')), 'home 必须归档')
assert.ok(!existsSync(join(rawDir, 's-w1.md')), '工作区不归档')
assert.ok(existsSync(join(rawDir, 's-c1.md')), '2026-11-07 起渠道默认归档（archiveDirs）')
out.files = 'ok'

// raw_meta：按 cwd 计数
const db = new DatabaseSync(join(DATA_DIR, 'memory.db'), { readOnly: true })
const rows = db.prepare('SELECT cwd, count(*) c FROM raw_meta GROUP BY cwd').all()
const map = Object.fromEntries(rows.map((r) => [r.cwd, r.c]))
db.close()
assert.equal(map[QQ], 1, 'QQ 行入库')
assert.equal(map[HOME], 1, 'home 行入库')
assert.equal(map[WORK], undefined, '工作区不入库')
assert.equal(map[CHANNEL], 1, '2026-11-07 起渠道默认入库（archiveDirs）')
out.rawMeta = 'ok'

console.log(JSON.stringify(out))
