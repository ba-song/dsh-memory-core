/**
 * B-1b 质量项 —— 2026-11-05
 *
 * 覆盖：
 *   ① 先渲染再丢：`{{display_name}}` 有 displayName 就变真名；未知占位符/取不到名字 → 整行丢
 *   ② `buildStable` 传 db →「记得的事」能读库；不传 → 行为不变（空）
 *   ③ 原话两源角色过滤：事件行（事/步/具…）不进注入
 *   ④ `pickPin` 只取未完成、且取最近 N 条
 */
import assert from 'node:assert'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = '/tmp/dy-inject-b1b-' + process.pid
process.env.DY_MEMORY_DIR = DATA_DIR
rmSync(DATA_DIR, { recursive: true, force: true })
mkdirSync(DATA_DIR, { recursive: true })

const { scrubLines, buildStable, pickPin } = await import('../lib/inject/stable.js')
const { buildQuotesBlock } = await import('../lib/inject/quotes.js')
const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { bigrams } = await import('../lib/store/fts.js')

const out = { ok: true, test: 'inject-b1b' }

// ── ① 先渲染再丢 ─────────────────────────────────────────────────
const rendered = scrubLines(['名字：{{display_name}}', '- 正常'], { displayName: '汐' })
assert.deepEqual(rendered.lines, ['名字：汐', '- 正常'], '已知占位符应渲染成真名')
assert.equal(rendered.dropped, 0)

const unknown = scrubLines(['a{{foo}}b'], { displayName: '汐' })
assert.equal(unknown.dropped, 1, '未知占位符仍要丢')

const mixed = scrubLines(['{{display_name}} 和 {{foo}}'], { displayName: '汐' })
assert.equal(mixed.dropped, 1, '渲染后仍含未知占位符 → 整行丢')

const noPersona = scrubLines(['名字：{{display_name}}'], { displayName: '' })
assert.equal(noPersona.dropped, 1, '取不到名字时保留原样 → 落到丢弃')
assert.equal(noPersona.samples[0], '{{display_name}}')
out.render = 'ok'

// ── ④ pickPin：只取未完成 + 最近 N 条 ────────────────────────────
const pinText = ['- [ ] 旧事', '- [x] 已完成', '- [ ] 新事1', '- [ ] 新事2'].join('\n')
assert.deepEqual(pickPin(pinText, 2), ['- [ ] 新事1', '- [ ] 新事2'], '取最近 2 条未完成')
assert.deepEqual(pickPin(pinText, 5), ['- [ ] 旧事', '- [ ] 新事1', '- [ ] 新事2'], '已完成项不出现')
assert.deepEqual(pickPin('- [x] 只有已完成', 5), [])
out.pickPin = 'ok'

// ── ② buildStable 传 db →「记得的事」 ────────────────────────────
const { db } = openDb(DATA_DIR)
await insertMemory(db, { kind: 'preference', text: '喜欢看海', importance: 0.8, layer: 'manual' })
const noDb = buildStable(join(DATA_DIR, 'empty-cwd'), {})
assert.equal(noDb, '', '没有卡/便签、也没传 db → 空块（行为不变）')
const withDb = buildStable(join(DATA_DIR, 'empty-cwd'), { db })
assert.ok(withDb.includes('【记得的事】'), '传 db 后应能读到「记得的事」')
assert.ok(withDb.includes('喜欢看海'))
out.remembered = 'ok'

// ── ③ 原话两源角色过滤 ───────────────────────────────────────────
const rawDir = join(DATA_DIR, 'raw-probe')
new RawArchive({ db, dir: rawDir, log: { info() {}, warn() {} } })
const cwd = '/root/qq-agent/QQ会话/私聊_1000000001'
const now = Date.now()
const dayOf = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
let line = 0
const ins = (role, text, at) => {
  line += 1
  const full = `10:00:00 [${line}] ${role}：${text}`
  db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd)
    VALUES(?,?,?,?,?,?,?,0,?,?,?,'{}',?)`).run(dayOf(at), 'probe', line, line, role, '', 'qq', full.length, full, at, cwd)
  const id = Number(db.prepare('SELECT last_insert_rowid() id').get().id)
  db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text) || text)
}
ins('user', '看海这件事估计还要等好久', now - 600000)   // 对话行：应进
ins('事', 'tool 看海 事件行', now - 300000)              // 事件行：不应进
ins('步', 'step/start 看海', now - 200000)               // 事件行：不应进
const qb = buildQuotesBlock(db, { cwd, hits: [], query: '看海', now })
assert.ok(qb.block.includes('看海这件事'), '对话行应带出')
assert.ok(!qb.block.includes('事件行'), '事件行不得当原话')
assert.ok(!qb.block.split('\n').some((l) => l.includes('[事]') || l.includes('[步]')), '块里不许出现事件角色标签')
out.quotesRole = 'ok'

// ── ① 端到端：persona 在 → 渲染成真名，不抛、不丢 ────────────────
const HOME = '/sdcard/DSHA/生活/数据/home'
const cardPath = join(DATA_DIR, '事实卡.md')
writeFileSync(cardPath, ['# 事实卡', '', '## 会话 私聊 主人(1000000001)', '', '- 名字：{{display_name}}', '- 喜欢看海', ''].join('\n'))
const handlers = {}
const ctx = {
  get(n) {
    if (n === 'tools') return { register: () => {} }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    if (n === 'dyPersona') return { displayName: () => '汐', selfId: () => 'self:test-1' }
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
    session: { header: { cwd: HOME, id: 's-b1b' } },
    ctx: { systemPrompt: { context: (cfg) => { captured.push(cfg); return () => {} } } },
  },
})
assert.equal(captured.length, 1)
assert.equal(captured[0].interpolate, false)
const text = captured[0].text()
assert.ok(text.includes('名字：汐'), '端到端应渲染成真名')
assert.ok(!text.includes('{{'), '块里不许残留占位符')
assert.ok(text.includes('喜欢看海'))
out.e2eRender = 'ok'

console.log(JSON.stringify(out))
