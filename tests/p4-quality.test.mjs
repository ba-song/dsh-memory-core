/**
 * P4 自动抽取质量闸 —— 2026-11-05
 *
 * 事故背景：她把「你才是大傻鱼，叫我主人」抽成 relation「叫我主人」；另有 8 条碎片
 * （「下次还有」「喜欢就留着」「叫我哦」…）。本测试钉住闸门的判据与可观测性。
 *
 * 覆盖（≥10 条）：
 *   句子级：疑问句 / 问候 / 太短
 *   候选级：无主语、无谓词、<5 字、裸语气词、以及真实事故串
 *   通道：enabled=false 全关；maxPerTurn=1；显式「记住：…」不受影响
 *   可观测：memory.log 出现 `P4 丢弃：reason=…`，stats 里能读到计数
 */
import assert from 'node:assert'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = '/tmp/dy-p4q-' + process.pid
process.env.DY_MEMORY_DIR = DATA_DIR
rmSync(DATA_DIR, { recursive: true, force: true })
mkdirSync(DATA_DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { ingestClassified } = await import('../lib/ingest/p4.js')
const { judgeSentence, judgeCandidate, autoExtractCfg } = await import('../lib/ingest/quality.js')
const { extractExplicit, ingestExplicit } = await import('../lib/ingest/explicit.js')
const { extractAll } = await import('../lib/ingest/classes.js')

const out = { ok: true, test: 'p4-quality' }

// ── 句子级 ───────────────────────────────────────────────────────
assert.deepEqual(judgeSentence('你是不是就像住进手机里了'), { ok: false, reason: 'question' })
assert.deepEqual(judgeSentence('今天天气不错？'), { ok: false, reason: 'question' })
assert.deepEqual(judgeSentence('早安'), { ok: false, reason: 'greeting' })
assert.deepEqual(judgeSentence('你好呀'), { ok: false, reason: 'greeting' })
assert.equal(judgeSentence('主人喜欢喝冰美式').ok, true)
assert.deepEqual(judgeSentence(''), { ok: false, reason: 'too-short' })
out.sentence = 'ok'

// ── 候选级（用真实抽取器的产出，不手搓） ────────────────────────
const jc = (sentence) => {
  const cands = extractAll(sentence)
  assert.ok(cands.length, `抽取器应有候选：${sentence}`)
  return cands.map((c) => judgeCandidate(c, sentence))
}
for (const s of ['下次还有', '喜欢就留着', '叫我哦']) {
  const js = jc(s)
  assert.ok(js.every((j) => j.ok === false && j.reason === 'fragment'), `${s} 应判 fragment，实际 ${JSON.stringify(js)}`)
}
assert.equal(jc('以后要带去看海的')[0].reason, 'fragment', '无主语 → fragment')
const incident = jc('你才是大傻鱼，叫我主人')
assert.equal(incident[0].reason, 'fragment', '事故串「叫我主人」必须挡住（长度 <5）')
// 两个必须通过的真实陈述
assert.equal(jc('主人喜欢喝冰美式')[0].ok, true, '主人喜欢喝冰美式 应通过')
assert.equal(jc('我在温州，喜欢吃辣')[0].ok, true, '我在温州，喜欢吃辣 应通过（主语从句子补回）')
out.candidate = 'ok'

// ── 管线（真库、无 embedding） ──────────────────────────────────
const { db } = openDb(DATA_DIR)
const embed = undefined // 模拟 embedding 不可用：闸门拒绝时不应依赖它
const vectors = new Map()
const count = () => db.prepare('SELECT count(*) c FROM memories').get().c
const run = (text, autoExtract) => ingestClassified(db, { text, sourceKey: `q:${text}`, speaker: '1000000001', embed, vectors, autoExtract })

assert.equal((await run('下次还有')).reason, 'fragment')
assert.equal((await run('喜欢就留着')).reason, 'fragment')
assert.equal((await run('叫我哦')).reason, 'fragment')
assert.equal((await run('你是不是就像住进手机里了')).reason, 'question')
assert.equal((await run('你才是大傻鱼，叫我主人')).reason, 'fragment')
assert.equal(count(), 0, '被闸挡掉的都不许落库')

assert.equal((await run('主人喜欢喝冰美式')).action, 'insert')
assert.equal((await run('我在温州，喜欢吃辣')).action, 'insert')
assert.equal(count(), 2, '两条真实陈述应落库')

// 太短（整句 < minChars）：候选合格但句子不够 8 字
assert.equal((await run('我喜欢吃辣')).reason, 'too-short')
assert.equal(count(), 2, 'too-short 不落库')

// enabled=false：整体关
assert.equal((await run('主人喜欢喝冰美式', { enabled: false })).reason, 'disabled')
assert.equal(count(), 2, '关闭后不再增长')

// maxPerTurn=1：一句里能抽多条，但只写 1 条
const multi = '我喜欢看海，以后就叫我海王'
assert.ok(extractAll(multi).length >= 2, '该句应能抽出多条候选（前提断言）')
const rm = await run(multi, { enabled: true, minChars: 8, requireSubject: true, maxPerTurn: 1 })
assert.equal(rm.action, 'insert')
assert.equal(count(), 3, 'maxPerTurn=1 只写 1 条')
out.pipeline = 'ok'

// ── 显式通道不受影响 ────────────────────────────────────────────
const body = extractExplicit('记住：每天 8 点叫我')
assert.ok(body && body.includes('叫我'), '显式抽取应照旧命中')
const eid = await ingestExplicit(db, { sessionId: 's1', seq: 9, text: '记住：每天 8 点叫我', speaker: '1000000001' })
assert.ok(eid, '显式「记住：…」应照常落库')
assert.equal(count(), 4)
out.explicit = 'ok'

// ── 可观测：日志 + stats ─────────────────────────────────────────
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
const ownerCwd = '/root/qq-agent/QQ会话/私聊_1000000001'
handlers['session/event'](
  { header: { id: 'p4q1', cwd: ownerCwd } },
  { type: 'user/message', seq: 1, time: Date.now(), data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '你是不是就像住进手机里了' }] } },
)
await new Promise((r) => setTimeout(r, 400))
const logText = readFileSync(join(DATA_DIR, 'logs', 'memory.log'), 'utf8')
assert.match(logText, /P4 丢弃：reason=question/, '丢弃要留一行日志')
assert.match(logText, /text20=/, '日志带 20 字以内片段')
const stats = await registered.dy_memory_stats.execute({}, { agent: { session: { header: { cwd: ownerCwd, id: 'p4q1' } } } })
const detail = JSON.parse(stats.detail)
assert.ok(detail.p4Drops && detail.p4Drops.question >= 1, 'stats 里应有按 reason 的计数')
assert.equal(detail.autoExtract.minChars, 8, 'stats 里能看到闸门配置')
out.observable = 'ok'

console.log(JSON.stringify(out))
