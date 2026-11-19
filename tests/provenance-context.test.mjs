/**
 * 命中出处上下文（2026-11-15）
 *
 * 目标口径：
 *   1) 纯语义命中（query 与原话没有关键词重叠）也必须出现「命中原话」；
 *   2) 每个可用 hit 展开「锚点 + 前后各 2 条对白」共 5 条，按时间/行号升序；
 *   3) 每条带当时的思考（±8 行内最近 self-thought；没有 = 想：无）与情绪
 *      （persona.emotionAt 优先 → 退化 emotion_timeline；强度 <0.35 省略）；
 *   4) 多个 hit 窗口重叠按 file:line 合并去重；
 *   5) 预算（maxRows/maxChars）按命中顺序整窗截断，不切 5 条窗口；
 *   6) 锚点找不到 → 明确跳过并计入 stats（不伪造）；
 *   7) 群/子智能体不注入（见 provenance-gate.test.mjs）。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = `/tmp/dy-prov-ctx-${process.pid}`
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { bigrams } = await import('../lib/store/fts.js')
const { buildProvenanceBlock } = await import('../lib/inject/context-blocks.js')
const { buildQuotesBlock } = await import('../lib/inject/quotes.js')
const { provenanceConfig, PROVENANCE_DEFAULTS } = await import('../lib/config.js')
const { dayOf, stampOf } = await import('../lib/adapter/timefmt.js')

const { db } = openDb(DIR)
const cwd = '/sdcard/DSHA/生活/数据/home'
new RawArchive({ db, dir: join(DIR, 'raw'), cwdPrefixes: [cwd], log: { info() {}, warn() {} } })
const now = Date.now()
// 正午基准，保证整段窗口落在同一个档案日（真实归档按北京时间分日）
const DAY = dayOf(now)
const T = new Date(`${DAY}T12:00:00+08:00`).getTime()

let ftsRows = 0
const ins = ({ file, line, seq, role, text, at, day = DAY }) => {
  const full = `10:00:${String(line % 60).padStart(2, '0')} [${seq}] ${role === 'self-thought' ? '汐·想' : role === 'self' ? '汐' : '主人'}：${text}`
  const id = Number(db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd)
    VALUES(?,?,?,?,?,'','qq',0,?,?,?,'{}',?)`).run(day, file, line, seq, role, full.length, full, at, cwd).lastInsertRowid)
  db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text) || text)
  ftsRows += 1
  return id
}
const emo = (at, label, intensity) => {
  db.prepare("INSERT INTO emotion_timeline(session_key,valence,arousal,label,intensity,trigger,at) VALUES('global',0.5,0.5,?,?,'x',?)")
    .run(label, intensity, at)
}

// ── A. 主窗口：1 个语义 hit；±2 对白外还有事件行填充，确保「想：无」真实出现 ──
const FILE_A = `${DAY}/s-sessA123.md`        // sid=sessA1234 → 归档名取前 8 位
const A = (line, role, text, at, seq) => ins({ file: FILE_A, line, seq, role, text, at })
A(1, 'user', '窗口外前文一', T - 900000, 60)
A(2, 'self', '窗口外前文二', T - 890000, 61)
for (let i = 3; i <= 12; i++) A(i, '事', `工具事件 ${i}`, T - 880000, 62)
A(13, 'user', '窗口前一句', T - 500000, 63)
for (let i = 14; i <= 27; i++) A(i, '事', `工具事件 ${i}`, T - 490000, 64)
A(28, 'self', '窗口前两句', T - 300000, 65)
A(29, 'self-thought', '窗口前的想法', T - 310000, 65)
const anchorSeqA = 100
A(30, 'user', '锚点原文：周末去海边', T - 100000, anchorSeqA)
A(31, 'self-thought', '锚点的想法', T - 99000, 101)
A(32, 'self', '好呀，几点出发', T - 98000, 101)
A(33, 'user', '窗口后一句', T + 60000, 102)
A(34, 'self', '窗口后两句', T + 120000, 103)

// 情绪：T-500000 平静 0.6；T-100000 开心 0.6；T+60000 烦躁 0.2（低于阈值应省略）
emo(T - 500000, '平静', 0.6)
emo(T - 100000, '开心', 0.6)
emo(T + 60000, '烦躁', 0.2)
const persona = {
  emotionAt(at) {
    if (at === T - 100000) return { label: '超开心', intensity: 0.9, confidence: 0.9 }
    return null
  },
}

const hitA = { id: 901, kind: 'episode', text: '周末去海边（纯语义命中，正文与原话没有关键词重叠）', source_msg_id: 'p4:sessA1234:100', source_ts: T - 100000, scope_type: 'owner' }

// 1) 纯语义命中：query 与原话无关键词重叠，【相关原话】仍带命中原话
const quotesA = buildQuotesBlock(db, { cwd, hits: [hitA], query: '今天天气怎么样', now: T + 180000 })
assert.ok(quotesA.block.startsWith('【相关原话】'))
assert.ok(quotesA.block.includes('锚点原文：周末去海边'), '无关键词重叠时命中原话也必须进【相关原话】')
assert.ok(quotesA.sources.tags.includes('hit'), '命中出处标记为 hit')

// 2) 5 条对白齐全 + 升序（不带 ragRows，检查正文顺序）
const prov = buildProvenanceBlock(db, { cwd, hits: [hitA], persona, ragRows: [] })
assert.ok(prov.block.startsWith('【出处上下文】') && prov.block.endsWith('【出处上下文结束】'))
const lines = prov.block.split('\n').filter((l) => l.startsWith('- '))
assert.equal(lines.length, 5, '应取满 5 条对白')
assert.deepEqual(
  lines.map((l) => l.replace(/^- (?:\d{2}-\d{2} )?\d{2}:\d{2} \[[^\]]+\] /, '')),
  ['窗口前一句', '窗口前两句', '锚点原文：周末去海边', '好呀，几点出发', '窗口后一句'],
  '窗口应按行号升序且正好是锚点前后各 2 条对白',
)
assert.ok(!lines.some((l) => l.includes('工具事件')), '事件行不是对白，不进窗口')
assert.ok(!lines.some((l) => l.includes('窗口外')), '窗口外的对白不进 5 条')
assert.equal(prov.count, 5)
assert.equal(prov.stats.anchors, 1)
assert.equal(prov.stats.skipped.length, 0)

// 跨天出处：旧日期行必须显式带 MM-DD，不能误显示成当天时刻
const FILE_D = `${DAY}/s-sessD123.md`
const crossDayAt = new Date(`${DAY}T00:01:00+08:00`).getTime()
for (let i = 1; i <= 5; i++) {
  ins({
    file: FILE_D, line: i, seq: 500 + i,
    role: i % 2 ? 'user' : 'self',
    text: `跨天窗口第${i}句`,
    at: crossDayAt + (i - 3) * 120000,
  })
}
const crossDayHit = {
  id: 910, kind: 'episode', text: '跨天窗口第3句',
  source_msg_id: 'p4:sessD1234:503', source_ts: crossDayAt,
  scope_type: 'owner',
}
const crossDayProv = buildProvenanceBlock(db, { cwd, hits: [crossDayHit] })
const priorLabel = stampOf(crossDayAt - 120000).slice(0, 5)
assert.ok(
  crossDayProv.block.split('\n').some((l) => l.startsWith(`- ${priorLabel} `) && l.includes('跨天窗口第2句')),
  '跨天的旧日期出处行必须显示 MM-DD',
)

// 3) 每条都有想：4 条有真实思考、1 条明确「想：无」；情绪 persona 优先、阈值以下省略
const wantLines = prov.block.split('\n').filter((l) => l.startsWith('  想：'))
assert.equal(wantLines.length, 5, '5 条对白每条都要带「想：」')
assert.equal(wantLines.filter((l) => l.trim() === '想：无').length, 1, '没有思考的行写「想：无」')
assert.ok(prov.block.includes('想：窗口前的想法'))
assert.ok(prov.block.includes('想：锚点的想法'))
const moodLines = prov.block.split('\n').filter((l) => l.startsWith('  心情：'))
assert.equal(moodLines.length, 4, '有情绪的 4 条带心情，0.2 强度那条省略')
assert.ok(prov.block.includes('心情：超开心（0.90）'), 'persona.emotionAt 优先于本地 emotion_timeline')
assert.ok(prov.block.includes('心情：平静（0.60）'), 'persona 无数据时退化 emotion_timeline')
assert.ok(prov.block.includes('心情：开心（0.60）'))
assert.ok(!prov.block.includes('（0.20）'), '强度 <0.35 不显示心情')

// 4) 与【相关原话】重复：锚点正文不缩写，其它行用「（同 RAG 第 N 条）」
const prov2 = buildProvenanceBlock(db, { cwd, hits: [hitA], persona, ragRows: quotesA.sources.rows })
assert.ok(prov2.block.includes('锚点原文：周末去海边'), '锚点原话即使与 RAG 重复也必须保留正文')
assert.ok(/（同 RAG 第 \d+ 条）/.test(prov2.block), '非锚点重复行用指代')
assert.ok(prov2.block.includes('想：'), '指代行仍带想')
assert.equal((prov2.block.match(/^  想：/gm) ?? []).length, 5, '指代行也要带想')

// ── B. 两个 hit 窗口重叠：file:line 合并去重、按时间升序、不重复 ──
const hitB = { id: 902, kind: 'episode', text: '窗口前一句是什么', source_msg_id: 'p4:sessA1234:63', source_ts: T - 500000, scope_type: 'owner' }
const provMerge = buildProvenanceBlock(db, { cwd, hits: [hitA, hitB], persona, ragRows: [] })
const mergeLines = provMerge.block.split('\n').filter((l) => l.startsWith('- '))
const mergeTexts = mergeLines.map((l) => l.replace(/^- \d{2}:\d{2}:\d{2} \[[^\]]+\] /, ''))
assert.equal(new Set(mergeTexts).size, mergeTexts.length, '窗口合并后不能有重复对白')
assert.equal(provMerge.count, 7, 'A 窗口 5 条 + B 窗口 [1,2,13,28,30] 合并后 7 条')
assert.deepEqual(mergeTexts, ['窗口外前文一', '窗口外前文二', '窗口前一句', '窗口前两句', '锚点原文：周末去海边', '好呀，几点出发', '窗口后一句'])
assert.ok(provMerge.block.includes('锚点原文：周末去海边'))
assert.ok(provMerge.block.includes('窗口前一句'))
assert.equal(provMerge.stats.anchors, 2)

// 同锚点重复命中：只展开一次，计入 merged
const hitA2 = { ...hitA, id: 903 }
const provSame = buildProvenanceBlock(db, { cwd, hits: [hitA, hitA2], persona })
assert.equal(provSame.count, 5)
assert.equal(provSame.stats.merged, 1, '同一锚点的重复命中只算合并')

// ── C. 找不到锚点：跳过并计入 stats，不伪造 ──
const ghost = { id: 999, kind: 'episode', text: 'zzzqqq 完全不存在的档案语句', source_msg_id: 'p4:ghost999:404', source_ts: 0, scope_type: 'owner' }
const provGhost = buildProvenanceBlock(db, { cwd, hits: [ghost] })
assert.equal(provGhost.block, '', '锚点找不到时不出块')
assert.equal(provGhost.stats.anchors, 0)
assert.equal(provGhost.stats.skipped.length, 1)
assert.equal(provGhost.stats.skipped[0].reason, 'anchor-not-found')
assert.equal(provGhost.stats.skipped[0].id, 999)
const provMix = buildProvenanceBlock(db, { cwd, hits: [ghost, hitA], persona })
assert.equal(provMix.stats.skipped.length, 1, '坏 hit 跳过，好 hit 照常出窗口')
assert.equal(provMix.count, 5)
assert.ok(provMix.block.includes('锚点原文：周末去海边'))

// ── C2. 缺 source_msg_id/source_ts 时用 hit.text 匹配；raw:<id> / 只有 source_ts 也能锚定 ──
const FILE_C = `${DAY}/s-sessC123.md`
for (let i = 1; i <= 5; i++) {
  ins({ file: FILE_C, line: i, seq: 400 + i, role: i % 2 ? 'user' : 'self', text: `文字兜底第${i}句`, at: T + 300000 + i * 1000 })
}
const textHit = { id: 906, kind: 'episode', text: '文字兜底第3句', created_at_epoch: T + 303000 }
const provText = buildProvenanceBlock(db, { cwd, hits: [textHit] })
assert.equal(provText.count, 5, '没有 source id/ts 时用 hit.text 也能定位锚点')
assert.ok(provText.block.includes('文字兜底第3句'))
assert.equal(provText.stats.anchors, 1)
const anchorIdC = Number(db.prepare('SELECT id FROM raw_meta WHERE file=? AND line_no=3').get(FILE_C).id)
const provRawId = buildProvenanceBlock(db, { cwd, hits: [{ id: 907, kind: 'episode', text: 'x', source_msg_id: `raw:${anchorIdC}` }] })
assert.ok(provRawId.block.includes('文字兜底第3句'), 'raw:<raw_meta.id> 直接锚定')
const provTs = buildProvenanceBlock(db, { cwd, hits: [{ id: 908, kind: 'episode', text: '', source_msg_id: '', source_ts: T + 303000 }] })
assert.equal(provTs.count, 5, '只有 source_ts 时按时间窗定位')
assert.ok(provTs.block.includes('文字兜底第3句'))

// 跨房间命中（group scope）不做文本兜底回捞
const groupHit = { id: 904, kind: 'episode', text: '窗口前一句', scope_type: 'group', source_ts: T - 500000 }
assert.equal(buildProvenanceBlock(db, { cwd, hits: [groupHit] }).block, '', '群记忆不能在 owner 房间回捞原话')

// ── D. 预算：超限整窗丢弃，不切 5 条窗口 ──
const FILE_B = `${DAY}/s-sessB123.md`
const seedShort = (file, baseAt, seqBase) => {
  for (let i = 1; i <= 5; i++) ins({ file, line: i, seq: seqBase + i, role: i % 2 ? 'user' : 'self', text: `这是第${i}句很短的原话内容`, at: baseAt + i * 1000 })
  return { anchorSeq: seqBase + 3, anchorAt: baseAt + 3000 }
}
const bInfo = seedShort(FILE_B, T + 600000, 200)
const hitC = { id: 905, kind: 'episode', text: '短句', source_msg_id: `p4:sessB1234:${bInfo.anchorSeq}`, source_ts: bInfo.anchorAt, scope_type: 'owner' }
// 两个窗口各 5 条，共 10 条（默认不裁）
const provTwo = buildProvenanceBlock(db, { cwd, hits: [hitA, hitC], persona, maxRows: 10 })
assert.equal(provTwo.count, 10, '两个不重叠窗口默认取满 10 条')
assert.equal(provTwo.stats.dropped.length, 0)
// maxRows=5：只保留第一个（相关度更高）窗口，整窗丢弃第二个
const provRows = buildProvenanceBlock(db, { cwd, hits: [hitA, hitC], persona, maxRows: 5 })
assert.equal(provRows.count, 5, 'maxRows=5 时保留 1 个完整窗口')
assert.equal(provRows.stats.dropped.length, 1)
assert.equal(provRows.stats.dropped[0].id, 905)
assert.equal(provRows.stats.dropped[0].reason, 'max-rows')
assert.ok(provRows.block.includes('锚点原文：周末去海边'))
assert.ok(!provRows.block.includes('这是第1句'), '被丢窗口不能残留半截')
// maxChars：两个短窗口 600 字放不下 → 丢第二个，仍保留完整 5 条
const provChars = buildProvenanceBlock(db, { cwd, hits: [hitA, hitC], persona, maxRows: 10, maxChars: 300 })
assert.equal(provChars.count, 5)
assert.equal(provChars.stats.dropped.length, 1)
assert.equal(provChars.stats.dropped[0].reason, 'max-chars')
assert.ok(provChars.block.length <= 300)

// ── E. 配置：默认值、顶层别名、越界夹区间 ──
const cfgDefault = provenanceConfig({})
assert.equal(cfgDefault.enabled, true)
assert.equal(cfgDefault.maxHits, PROVENANCE_DEFAULTS.maxHits)
assert.equal(cfgDefault.window, PROVENANCE_DEFAULTS.window)
assert.equal(cfgDefault.maxRows, PROVENANCE_DEFAULTS.maxRows)
assert.equal(cfgDefault.maxChars, PROVENANCE_DEFAULTS.maxChars)
const cfgAlias = provenanceConfig({ provenanceMaxHits: 4, provenanceWindow: 9, provenanceMaxRows: 99, provenanceMaxChars: 10 })
assert.equal(cfgAlias.maxHits, 4)
assert.equal(cfgAlias.window, 3, 'window 夹到 1..3')
assert.equal(cfgAlias.maxRows, 40, 'maxRows 夹到 5..40')
assert.equal(cfgAlias.maxChars, 600, 'maxChars 夹到 600..12000')
assert.equal(provenanceConfig({ provenance: { enabled: false } }).enabled, false)
assert.equal(provenanceConfig({ provenance: { maxHits: 3 } }).maxHits, 3, '嵌套写法优先并覆盖默认')

console.log(JSON.stringify({
  ok: true, test: 'provenance-context', ftsRows,
  provRows: prov.count, mergeRows: provMerge.count,
  suspended: provGhost.stats.skipped[0].reason,
  budget: { rows: provRows.count, chars: provChars.block.length, dropped: provChars.stats.dropped.length },
}))
process.exit(0)
