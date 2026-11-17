/**
 * 受信任目录（home）端到端测试 —— 2026-11-05
 *
 * 只验证「记忆侧的门有没有打开」，不涉及真正的 home 会话由谁创建。
 * 覆盖：
 *   ① home 会话能调记忆工具（dy_memory_add）
 *   ② home 会话的 pre-step 能注入【记忆·本轮相关】（hits 通道没被二次 gate 挡住）
 *   ③ home 会话的 user/message 能自动记录（memoryRecordEnabled 通道没被二次 gate 挡住）
 *   ④ home 会话能挂常驻块，且 buildStable 在「事实卡/话头都不存在」时返回空串而不抛
 *   ⑤ 对照：工作目录（不在 trustedDirs）仍然全拒
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

process.env.DY_MEMORY_DIR = '/tmp/dy-trusted-e2e-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })
mkdirSync(process.env.DY_MEMORY_DIR, { recursive: true })

const HOME = '/sdcard/DSHA/生活/数据/home'
const WORK = '/sdcard/DSHA/工作区'

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
mod.apply(ctx, { ownerQQ: '1000000001', trustedDirs: [HOME] })

const sess = (cwd, id) => ({ agent: { session: { header: { cwd, id } } } })
const out = { ok: true, test: 'trusted-home-e2e' }

// ① home 工具放行
const add = await registered.dy_memory_add.execute({ text: '主人喜欢看海' }, sess(HOME, 'h1'))
assert.equal(JSON.parse(add.detail).ok, true, 'home 里应能写记忆')
// ⑤ 对照：工作目录仍拒
const denied = await registered.dy_memory_add.execute({ text: '工作区不该写进来' }, sess(WORK, 'w1'))
assert.equal(JSON.parse(denied.detail).ok, false, '非受信任目录必须仍被拒')
assert.match(JSON.parse(denied.detail).error, /主人私聊/)
out.tool = 'home-ok/work-denied'

// ② home 的 pre-step 注入命中块
const agent = { session: { header: { cwd: HOME, id: 'h1' } } }
const messages = [{ source: { kind: 'user' }, content: [{ type: 'text', text: '我喜欢看海' }] }]
const next = async () => ({ kind: 'enter', messages: [...messages] })
const d1 = await handlers['agent/pre-step']({ agent, messages, step: 1, turn: 1 }, next)
assert.equal(d1.messages.length, 2, 'home 第一轮应注入一条')
const inj = d1.messages.at(-1)
assert.equal(inj.source.kind, 'plugin:dy-memory')
assert.match(inj.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
assert.ok(inj.content[0].text.startsWith('【记忆·本轮相关】'))
out.hits = 'injected'

// ⑤ 对照：工作目录 pre-step 不注入
const dw = await handlers['agent/pre-step']({ agent: { session: { header: { cwd: WORK, id: 'w1' } } }, messages, step: 1, turn: 1 }, next)
assert.equal(dw.messages.length, 1, '工作区不应注入')
out.hitsWork = 'skipped'

// ③ home 的 user/message 自动记录（异步，轮询等落库）
handlers['session/event'](
  { header: { id: 'h1', cwd: HOME } },
  {
    type: 'user/message',
    seq: 1,
    time: Date.now(),
    data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '记住：明天买猫粮' }] },
  },
)
const dbPath = join(process.env.DY_MEMORY_DIR, 'memory.db')
let recorded = null
for (let i = 0; i < 30 && !recorded; i++) {
  await new Promise((r) => setTimeout(r, 100))
  try {
    const ro = new DatabaseSync(dbPath, { readOnly: true })
    const row = ro.prepare("SELECT id,text,source_msg_id FROM memories WHERE extractor_version='explicit-v1'").get()
    ro.close()
    if (row) recorded = row
  } catch {}
}
assert.ok(recorded, 'home 里的「记住：…」应自动落库')
assert.match(recorded.text, /猫粮/)
assert.match(recorded.source_msg_id, /^explicit:h1:1$/)
out.autoRecord = 'ok'

// ④ home 能挂常驻块；事实卡/话头都不存在时返回空串，不抛
const mounted = []
handlers['agent/created']({
  agent: {
    session: { header: { cwd: HOME, id: 'h2' } },
    ctx: { systemPrompt: { context: (cfg) => { mounted.push(cfg); return () => {} } } },
  },
})
const stableCfgs = mounted.filter((c) => c.name === 'dy-memory-stable')
assert.equal(stableCfgs.length, 1, 'home 新会话应挂常驻块')
assert.equal(stableCfgs[0].name, 'dy-memory-stable')
const stableText = stableCfgs[0].text()
assert.ok(!stableText.includes('{{'), '不该有未渲染占位符')
assert.ok(stableText === '' || stableText.includes('【上次聊到】'), '要么空块，要么只有【上次聊到】（无事实卡/话头）')
out.stable = 'mounted-empty'

console.log(JSON.stringify(out))
