/**
 * 情绪统一（退役）—— 2026-11-05
 *
 * memory 侧不再写自己的 4 张情绪表，也不再注册 dy_emotion_*（归 persona）；
 * stats 里只保留只读的 emotionLegacy；raw_emotion 是历史遗留，不再写。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '/tmp/dy-emo-retire-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

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
mod.apply(ctx, { ownerQQ: '1000000001' })
const out = { ok: true, test: 'emotion-retire' }

// 1) 不再注册情绪工具
assert.equal(registered.dy_emotion_state, undefined, 'dy_emotion_state 应归 persona')
assert.equal(registered.dy_emotion_timeline, undefined)
assert.equal(registered.dy_emotion_points, undefined)
out.tools = 'ok'

// 2) 用户情绪消息不再写 memory 的 4 张表
const cwd = '/root/qq-agent/QQ会话/私聊_1000000001'
handlers['session/event']({ header: { id: 'emo1', cwd } }, {
  type: 'user/message', seq: 1, time: Date.now(),
  data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '我今天特别特别开心！！' }] },
})
await new Promise((r) => setTimeout(r, 300))
const { DatabaseSync } = await import('node:sqlite')
const db = new DatabaseSync(join(DIR, 'memory.db'), { readOnly: true })
const count = (t) => { try { return Number(db.prepare(`SELECT count(*) c FROM ${t}`).get().c) } catch { return 0 } }
assert.equal(count('emotion_state'), 0, '不许写 emotion_state')
assert.equal(count('emotion_timeline'), 0, '不许写 emotion_timeline')
assert.equal(count('emotion_audit'), 0, '不许写 emotion_audit')
assert.equal(count('emotion_points'), 0, '不许写 emotion_points')
assert.equal(count('raw_emotion'), 0, 'raw_emotion 是历史遗留，不许写')
out.writes = 'ok'

// 3) stats 只读展示：emotionLegacy 在、emotion（旧字段）不在
const stats = await registered.dy_memory_stats.execute({}, { agent: { session: { header: { cwd, id: 'emo1' } } } })
const detail = JSON.parse(stats.detail)
assert.ok(detail.emotionLegacy && detail.emotionLegacy.legacy === true, '应有只读 emotionLegacy')
assert.equal(detail.emotion, undefined, '旧 emotion 字段应移除')
out.stats = 'ok'

console.log(JSON.stringify(out))
db.close()
