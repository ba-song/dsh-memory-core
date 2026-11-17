/**
 * 出处上下文注入门禁（2026-11-15）
 *
 * 只 owner 会话注入【相关原话】/【出处上下文】：
 *   - home（受信任目录）→ 命中后带 5 条对白 + 想/心情；
 *   - 群聊 cwd → 不注入原话/出处（即使群记忆能命中、群房间也有 raw_meta 行）；
 *   - 工作区（子智能体/GUI 常用 cwd，scope=unknown）→ 完全不注入。
 *
 * 只验证注入门禁，不涉及真实 home 会话由谁创建。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = `/tmp/dy-prov-gate-${process.pid}`
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const HOME = '/sdcard/DSHA/生活/数据/home'
const WORK = '/sdcard/DSHA/工作区'
const GCWD = '/sdcard/DSHA/渠道/qq-群/111'

const { openDb } = await import('../lib/store/db.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { bigrams } = await import('../lib/store/fts.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { dayOf } = await import('../lib/adapter/timefmt.js')

const { db } = openDb(DIR)
new RawArchive({ db, dir: join(DIR, 'raw'), cwdPrefixes: [HOME, GCWD], log: { info() {}, warn() {} } })

const DAY = dayOf(Date.now())
const T = new Date(`${DAY}T12:00:00+08:00`).getTime()
const ins = ({ cwd, file, line, seq, role, text, at, extra = '{}' }) => {
  const who = role === 'self-thought' ? '汐·想' : role === 'self' ? '汐' : role === 'user' ? '主人' : role
  const full = `10:00:00 [${seq}] ${who}：${text}`
  const id = Number(db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd)
    VALUES(?,?,?,?,?,'','qq',0,?,?,?,?,?)`).run(DAY, file, line, seq, role, full.length, full, at, extra, cwd).lastInsertRowid)
  db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text) || text)
}

// owner 房间：5 条对白 + 1 条思考；anchor = line3
const FILE_OWN = `${DAY}/s-sessOwn1.md`   // sid=sessOwn1234 → 前 8 位 sessOwn1
ins({ cwd: HOME, file: FILE_OWN, line: 1, seq: 690, role: 'user', text: '前文一', at: T - 3000 })
ins({ cwd: HOME, file: FILE_OWN, line: 2, seq: 691, role: 'self', text: '前文一回复', at: T - 2000 })
const OWN_ANCHOR_AT = T
ins({ cwd: HOME, file: FILE_OWN, line: 3, seq: 700, role: 'user', text: '我们周末去看海吧', at: OWN_ANCHOR_AT })
ins({ cwd: HOME, file: FILE_OWN, line: 4, seq: 701, role: '具', text: 'dy_say {"text":"SECRET_OWNER_ARGS"}', at: T + 100, extra: '{"name":"dy_say"}' })
ins({ cwd: HOME, file: FILE_OWN, line: 5, seq: 702, role: '果', text: '{"ok":true,"secret":"SECRET_OWNER_RESULT"}', at: T + 200, extra: '{"isError":false}' })
ins({ cwd: HOME, file: FILE_OWN, line: 6, seq: 702, role: 'self-thought', text: '他约我周末去看海', at: T + 1000 })
ins({ cwd: HOME, file: FILE_OWN, line: 7, seq: 702, role: 'self', text: '好啊，周末去', at: T + 1000 })
ins({ cwd: HOME, file: FILE_OWN, line: 8, seq: 702, role: 'user', text: '那就说定了', at: T + 2000 })
await insertMemory(db, {
  kind: 'preference', text: '主人喜欢看海', layer: 'auto', scopeType: 'owner', scopeId: '',
  sourceMsgId: 'p4:sessOwn1234:700', sourceTs: OWN_ANCHOR_AT, importance: 0.8, confidence: 0.9,
})

// 群房间：同样有可命中的群记忆 + 可定位的 raw_meta（如果门禁破了就会漏原话）
const GAT = T + 3600 * 1000
const FILE_GRP = `${DAY}/s-grpabcd.md`
ins({ cwd: GCWD, file: FILE_GRP, line: 1, seq: 800, role: 'user', text: '今晚打本吗', at: GAT })
ins({ cwd: GCWD, file: FILE_GRP, line: 2, seq: 801, role: '具', text: 'dy_say {"text":"SECRET_GROUP_ARGS"}', at: GAT + 100, extra: '{"name":"dy_say"}' })
ins({ cwd: GCWD, file: FILE_GRP, line: 3, seq: 802, role: '果', text: '{"ok":true,"secret":"SECRET_GROUP_RESULT"}', at: GAT + 200, extra: '{"isError":false}' })
ins({ cwd: GCWD, file: FILE_GRP, line: 4, seq: 802, role: 'self', text: '来', at: GAT + 1000 })
ins({ cwd: GCWD, file: FILE_GRP, line: 5, seq: 803, role: 'user', text: '八点开组', at: GAT + 2000 })
ins({ cwd: GCWD, file: FILE_GRP, line: 6, seq: 803, role: 'self', text: '好', at: GAT + 3000 })
ins({ cwd: GCWD, file: FILE_GRP, line: 7, seq: 804, role: 'user', text: '别迟到', at: GAT + 4000 })
await insertMemory(db, {
  kind: 'episode', text: '群友约今晚打本', layer: 'auto', scopeType: 'group', scopeId: 'qq:111',
  sourceMsgId: `group-turn:111:${GAT}`, sourceTs: GAT, importance: 0.8, confidence: 0.9,
})

// 启动插件（与 trusted-home-e2e 同款最小 ctx）
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
mod.apply(ctx, { ownerQQ: '1000000001', trustedDirs: [HOME], factsPath: '/nonexistent/facts.md' })
assert.equal(typeof handlers['agent/pre-step'], 'function', 'pre-step 应已注册')

const run = async (cwd, sid, userText) => {
  const messages = [{ source: { kind: 'user' }, content: [{ type: 'text', text: userText }] }]
  const decision = await handlers['agent/pre-step']({ agent: { session: { header: { cwd, id: sid } } }, messages, step: 1, turn: 1 }, async () => ({ kind: 'enter', messages: [...messages] }))
  const added = (decision.messages ?? []).slice(messages.length)
  return added.map((m) => (Array.isArray(m.content) ? m.content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n') : String(m.content ?? ''))).join('\n')
}

const out = { ok: true, test: 'provenance-gate' }

// ① owner/home：注入【相关原话】+【出处上下文】，命中原话与 想 都在
const ownerText = await run(HOME, 's-own', '我喜欢看海')
assert.ok(ownerText.includes('【相关原话】'), 'owner 应有【相关原话】')
assert.ok(ownerText.includes('【出处上下文】'), 'owner 应有【出处上下文】')
assert.ok(ownerText.includes('我们周末去看海吧'), '命中锚点原话必须出现')
assert.ok(ownerText.includes('想：'), '出处上下文每条都带想')
assert.ok(ownerText.includes('具：dy_say(ok)'), 'owner 应注入工具摘要')
assert.ok(ownerText.includes('【工具概要】'), 'owner 应注入【工具概要】')
assert.ok(!ownerText.includes('SECRET_OWNER_ARGS') && !ownerText.includes('SECRET_OWNER_RESULT'), 'owner 工具参数/结果不得泄漏')
out.owner = 'injected+tools'

// ② 群聊：不注入原话/出处（群记忆命中也不给）
const groupText = await run(GCWD, 's-group', '今晚打本吗')
assert.ok(!groupText.includes('【相关原话】'), '群聊不得注入【相关原话】')
assert.ok(!groupText.includes('【出处上下文】'), '群聊不得注入【出处上下文】')
assert.ok(!groupText.includes('今晚打本吗'), '群聊不得注入原话正文')
assert.ok(!groupText.includes('我们周末去看海吧'), '群聊不得串到 owner 原话')
assert.ok(!groupText.includes('具：'), '群聊不得注入工具摘要')
assert.ok(!groupText.includes('【工具概要】'), '群聊不得注入工具概要')
assert.ok(!groupText.includes('SECRET_GROUP_ARGS') && !groupText.includes('SECRET_GROUP_RESULT'), '群聊不得泄漏工具参数/结果')
out.group = 'blocked'

// ③ 工作区（子智能体/GUI 常用 cwd）：scope=unknown，完全不注入
const workText = await run(WORK, 's-work', '我喜欢看海')
assert.equal(workText, '', '工作区不得注入')
out.work = 'blocked'

console.log(JSON.stringify(out))
process.exit(0)
