/**
 * B-1 注入模板崩溃防护 —— 2026-11-05
 *
 * 覆盖：
 *   ① `systemPrompt.context` 必须带 `interpolate:false`（fake ctx 捕获参数断言）
 *   ② 事实卡里含 `{{display_name}}` 的行被整行丢弃，块里不出现 `{{`，也不抛
 *   ③ `factsPath` 配置生效；未配置时仍走旧的三候选逻辑（行为不变）
 *   ④ 清洗只记「丢了几行 + 占位符样例」，日志里不出现正文
 */
import assert from 'node:assert'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = '/tmp/dy-inject-safety-' + process.pid
process.env.DY_MEMORY_DIR = DATA_DIR
rmSync(DATA_DIR, { recursive: true, force: true })
mkdirSync(DATA_DIR, { recursive: true })

const { scrubLines, buildStable, factsPathFor } = await import('../lib/inject/stable.js')
const out = { ok: true, test: 'inject-safety' }

// ── ① scrubLines 单元 ────────────────────────────────────────────
const r = scrubLines(['- 正常一行', '名字：{{display_name}}', 'x{{foo}}y', '{{', '- 另一行'])
assert.deepEqual(r.lines, ['- 正常一行', '- 另一行'])
assert.equal(r.dropped, 3, '三种占位符形态都要丢')
assert.ok(r.samples.length >= 1 && r.samples[0].includes('{{'), '样例要带占位符 token')
assert.ok(!r.samples.join('').includes('名字'), '样例不得带正文')
const clean = scrubLines(['a', 'b'])
assert.equal(clean.dropped, 0)
assert.deepEqual(clean.lines, ['a', 'b'])
out.scrub = 'ok'

// ── ③ factsPath 解析 ─────────────────────────────────────────────
assert.deepEqual(
  factsPathFor('/a/b', '/o', ''),
  ['/a/b/事实卡.md', '/a/事实卡.md', '/o/事实卡.md'],
  '未配置时保持旧三候选',
)
assert.deepEqual(factsPathFor('/a/b', '/o', '/x/事实卡.md'), ['/x/事实卡.md'], '配置优先且不回退')
out.factsPathFor = 'ok'

// ── ② buildStable：含占位符的行被丢弃 ────────────────────────────
const cardPath = join(DATA_DIR, '事实卡.md')
writeFileSync(cardPath, [
  '# 事实卡',
  '',
  '## 会话 私聊 主人(1000000001)',
  '',
  '- 名字：{{display_name}}',
  '- 喜欢看海',
  '',
].join('\n'))
const drops = []
const block = buildStable('/any/cwd', {
  factsPath: cardPath,
  ownerQQ: '1000000001',
  isOwner: true,
  onDrop: (d) => drops.push(d),
})
assert.ok(!block.includes('{{'), '块里不许出现 {{')
assert.ok(!block.includes('名字：'), '含占位符的整行被丢弃')
assert.ok(block.includes('喜欢看海'), '正常行保留')
assert.equal(drops.length, 1)
assert.equal(drops[0].dropped, 1)
assert.ok(drops[0].samples[0].includes('{{display_name}}'))
out.scrubCard = 'ok'

// ── ③ 未配置 factsPath：旧 cwd 逻辑仍生效 ────────────────────────
const legacyCwd = join(DATA_DIR, 'cwd-legacy')
mkdirSync(legacyCwd, { recursive: true })
writeFileSync(join(legacyCwd, '事实卡.md'), '- 旧卡的一行\n')  // 扁平卡：不依赖分节匹配
const legacyBlock = buildStable(legacyCwd, { ownerQQ: '' })
assert.ok(legacyBlock.includes('旧卡的一行'), '未配置 factsPath 时仍读 cwd 下的卡')
// 配置了 factsPath 但文件不存在 → 空块，不报错
assert.equal(buildStable(legacyCwd, { factsPath: join(DATA_DIR, 'nope.md') }), '')
out.legacyPath = 'ok'

// ── ④ 端到端：context 带 interpolate:false，且不抛 ──────────────
const HOME = '/sdcard/DSHA/生活/数据/home'
const handlers = {}
const registered = {}
const ctx = {
  get(n) {
    if (n === 'tools') return { register: (d) => { registered[d.name] = d } }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    return undefined
  },
  on(evt, fn) { handlers[evt] = fn },
  provide() { return () => {} },
  logger: { info() {}, warn() {} },
}
const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: '1000000001', trustedDirs: [HOME], factsPath: cardPath })

const captured = []
handlers['agent/created']({
  agent: {
    session: { header: { cwd: HOME, id: 's-inject-1' } },
    ctx: { systemPrompt: { context: (cfg) => { captured.push(cfg); return () => {} } } },
  },
})
assert.equal(captured.length, 1, 'home 会话应挂上常驻块')
assert.equal(captured[0].name, 'dy-memory-stable')
assert.equal(captured[0].interpolate, false, 'context 必须带 interpolate:false（否则宿主遇 {{}} 会抛）')
const text = captured[0].text()   // 有占位符也不许抛
assert.ok(!text.includes('{{'))
assert.ok(text.includes('喜欢看海'))
out.interpolate = 'ok'

// 日志：记了清洗，但没有正文
const log = readFileSync(join(DATA_DIR, 'logs', 'memory.log'), 'utf8')
assert.match(log, /注入清洗/, '清洗要留一条日志')
assert.ok(!log.includes('名字：'), '日志不许带正文')
assert.match(log, /\{\{display_name\}\}/, '日志可以带占位符样例（不是正文）')
out.log = 'ok'

console.log(JSON.stringify(out))
