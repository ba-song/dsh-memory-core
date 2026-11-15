import assert from 'node:assert'
import { rmSync } from 'node:fs'
process.env.DY_MEMORY_DIR = '/tmp/dy-pre-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })

const handlers = {}
const registered = {}
const ctx = {
  get(n) {
    if (n === 'tools') return { register: (d) => { registered[d.name] = d } }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return {}
    return undefined
  },
  on(evt, fn) { handlers[evt] = fn },
  logger: { info() {}, warn() {} },
}
const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: '1000000001' })

const ownerDir = '/root/qq-agent/QQ会话/私聊_1000000001'
const exec = { agent: { session: { header: { cwd: ownerDir, id: 's1' } } } }
await registered.dy_memory_add.execute({ text: '主人喜欢看海' }, exec)
await new Promise((r) => setTimeout(r, 300))

const agent = { session: { header: { cwd: ownerDir, id: 's1' } } }
const userMsg = { source: { kind: 'user' }, content: [{ type: 'text', text: '我喜欢看海' }] }
const call = async (turn, text = '我喜欢看海') => {
  const messages = [{ source: { kind: 'user' }, content: [{ type: 'text', text }] }]
  const next = async () => ({ kind: 'enter', messages: [...messages] })
  return handlers['agent/pre-step']({ agent, messages, step: 1, turn }, next)
}
const d1 = await call(1)
assert.equal(d1.messages.length, 2, '第一轮应注入一条')
const inj = d1.messages.at(-1)
assert.equal(inj.source.kind, 'plugin:dy-memory')
assert.match(inj.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, '注入消息必须有 id，否则 session v4 恢复会校验失败')
assert.ok(inj.content[0].text.length <= 200)
assert.ok(inj.content[0].text.startsWith('【记忆·本轮相关】'))

const d2 = await call(2)
assert.equal(d2.messages.length, 1, '同一集合第二轮应跳过（same）')

// 换会话（新 sid）→ first
const agent2 = { session: { header: { cwd: ownerDir, id: 's2' } } }
const d3 = await handlers['agent/pre-step']({ agent: agent2, messages: [userMsg], step: 1, turn: 1 }, async () => ({ kind: 'enter', messages: [userMsg] }))
assert.equal(d3.messages.length, 2, '新会话应重新注入')

// 换会话后常驻块重建：agent/created 应重新注册 systemPrompt.context
const mountedCalls = []
const agent3 = { session: { header: { cwd: ownerDir, id: 's3' } }, ctx: { systemPrompt: { context: (cfg) => { mountedCalls.push(cfg); return () => {} } } } }
handlers['agent/created']({ agent: agent3 })
assert.equal(mountedCalls.length, 1, '新会话应重新挂常驻块')
assert.equal(mountedCalls[0].name, 'dy-memory-stable')

console.log(JSON.stringify({ ok: true, test: 'prestep', first: inj.content[0].text.length, same: d2.messages.length, newsid: d3.messages.length, remount: mountedCalls.length }))
