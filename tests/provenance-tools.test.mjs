/**
 * 出处上下文 + 工具记录（2026-11-15）
 *
 * 口径：
 *   - 五条对白照旧带 想/心情；工具行（具/果/错/图/文）按
 *     「上一条 dialog(不含) → 当前 assistant 行(不含)」归属，用户行不挂工具；
 *   - 每条消息最多展示 2 个工具；只显示 工具名 + ok/err(+错误码/短句)，
 *     绝不注入参数/结果正文；
 *   - 末尾有【工具概要】一行（调用/成功/失败/最近/错误码），无工具则整块省略；
 *   - 多窗口重叠工具按 file:line 去重；超 maxChars 先整块丢工具、再整窗丢窗口。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = `/tmp/dy-prov-tools-${process.pid}`
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { bigrams } = await import('../lib/store/fts.js')
const { buildProvenanceBlock } = await import('../lib/inject/context-blocks.js')
const { dayOf } = await import('../lib/adapter/timefmt.js')

const { db } = openDb(DIR)
const cwd = '/sdcard/DSHA/生活/数据/home'
new RawArchive({ db, dir: join(DIR, 'raw'), cwdPrefixes: [cwd], log: { info() {}, warn() {} } })

const DAY = dayOf(Date.now())
const T = new Date(`${DAY}T12:00:00+08:00`).getTime()
let line = 0
const ins = ({ file, seq, role, text, at, extra = '{}' }) => {
  line += 1
  const who = role === 'self-thought' ? '汐·想' : role === 'self' ? '汐' : role === 'user' ? '主人' : role
  const full = `10:00:${String(line % 60).padStart(2, '0')} [${seq}] ${who}：${text}`
  const id = Number(db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd)
    VALUES(?,?,?,?,?,'','qq',0,?,?,?,?,?)`).run(DAY, file, line, seq, role, full.length, full, at, extra, cwd).lastInsertRowid)
  if (role === 'user' || role === 'self') db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text) || text)
  return line
}

// ── A. 五条消息 + 工具：ok/err 归属、截断、脱敏 ─────────────────
const FILE_A = `${DAY}/s-toolA123.md`   // sid=toolA1234 → 前 8 位
const A = (role, text, at, seq, extra = '{}') => ins({ file: FILE_A, seq, role, text, at, extra })
A('user', '第一句原话', T, 500)
A('事', 'turn/start', T + 100, 501, '{"event":"turn/start"}')
A('具', 'bash {"command":"echo SECRET_ARGS_TOOL"}', T + 200, 502, '{"name":"bash"}')
A('果', '{"ok":true,"secret":"SECRET_RESULT_VALUE"}', T + 300, 503, '{"isError":false}')
A('具', 'dy_say {"text":"SECRET_ARGS_2"}', T + 400, 504, '{"name":"dy_say"}')
A('果', 'ERROR Error: E_TIMEOUT while doing SECRET_ERROR_TEXT', T + 500, 505, '{"isError":true}')
A('self', '第二条回复', T + 1000, 506)
A('user', '第三条原话', T + 2000, 507)                                    // ← 命中锚点
A('具', 'read_image {"file_path":"/secret/path/SECRET_PATH"}', T + 2100, 508, '{"name":"read_image"}')
A('果', '{"ok":true,"path":"/secret/path/SECRET_PATH"}', T + 2200, 509, '{"isError":false}')
A('self', '第四条回复', T + 3000, 510)
A('user', '第五条原话', T + 4000, 511)
A('self', '第六条回复', T + 5000, 512)
// 窗口外的后续回合：工具不得被塞进本次出处上下文
A('user', '后续用户', T + 6000, 520)
A('具', 'late_tool {"x":"SECRET_LATE_ARGS"}', T + 6100, 521, '{"name":"late_tool"}')
A('果', '{"ok":true,"secret":"SECRET_LATE_RESULT"}', T + 6200, 522, '{"isError":false}')
A('self', '后续回复', T + 7000, 523)

const hitA = { id: 701, kind: 'episode', text: '第三条原话', source_msg_id: 'p4:toolA1234:507', source_ts: T + 2000, scope_type: 'owner' }
const prov = buildProvenanceBlock(db, { cwd, hits: [hitA] })
const lines = prov.block.split('\n').filter((l) => l.startsWith('- '))
assert.equal(lines.length, 5, '五条对白照旧')
assert.equal((prov.block.match(/^  想：/gm) ?? []).length, 5, '五条对白照旧带想')
assert.ok(prov.block.includes('具：bash(ok), dy_say(err: E_TIMEOUT)'), '工具名 + ok/err 归属到第二条回复')
assert.ok(prov.block.includes('具：read_image(ok)'), '成功工具归属到第四条回复')
// 工具行必须挂在其 assistant 行下面（同一条目）
const idxSecond = prov.block.indexOf('第二条回复')
const idxBash = prov.block.indexOf('具：bash(ok)')
const idxFourth = prov.block.indexOf('第四条回复')
const idxRead = prov.block.indexOf('具：read_image(ok)')
const idxFifth = prov.block.indexOf('第五条原话')
assert.ok(idxBash > idxSecond && idxBash < idxFourth, 'bash 应挂在第二条回复下')
assert.ok(idxRead > idxFourth && idxRead < idxFifth, 'read_image 应挂在第四条回复下')
// 概要
const toolLine = prov.block.split('\n').find((l) => l.startsWith('【工具概要】'))
assert.ok(toolLine, '有工具应有【工具概要】')
assert.ok(/调用 3 次/.test(toolLine) && /成功 2/.test(toolLine) && /失败 1/.test(toolLine), '概要应含调用/成功/失败')
assert.ok(/最近 read_image/.test(toolLine), '概要应含最近工具名')
assert.ok(/错误：E_TIMEOUT/.test(toolLine), '有错时应列 1 条错误短句')
assert.ok(toolLine.length <= 300, '工具概要 ≤300 字')
assert.equal(prov.stats.tools.calls, 3)
assert.ok(!prov.block.includes('late_tool'), '窗口外的工具不得塞进来')
assert.ok(!prov.block.includes('SECRET_LATE_ARGS') && !prov.block.includes('SECRET_LATE_RESULT'))
assert.equal((prov.block.match(/^  具：/gm) ?? []).length, 2, '每条消息最多 1 行工具，共 2 条消息有工具')
assert.equal(prov.stats.tools.ok, 2)
assert.equal(prov.stats.tools.err, 1)
assert.equal(prov.stats.tools.dropped, '')
// 参数/结果不泄漏
for (const secret of ['SECRET_ARGS_TOOL', 'SECRET_RESULT_VALUE', 'SECRET_ARGS_2', 'SECRET_ERROR_TEXT', '/secret/path']) {
  assert.ok(!prov.block.includes(secret), `不得泄漏参数/结果：${secret}`)
}

// ── B. 无工具：整块省略 ─────────────────────────────────────────
const FILE_B = `${DAY}/s-toolB123.md`
const B = (role, text, at, seq) => ins({ file: FILE_B, seq, role, text, at })
B('user', '前文一', T + 6000, 600)
B('self', '前文回', T + 7000, 601)
B('user', '无工具锚点', T + 8000, 602)
B('self', '无工具回复', T + 9000, 603)
B('user', '后文', T + 10000, 604)
const hitB = { id: 702, kind: 'episode', text: '无工具锚点', source_msg_id: 'p4:toolB1234:602', source_ts: T + 8000, scope_type: 'owner' }
const provB = buildProvenanceBlock(db, { cwd, hits: [hitB] })
assert.equal(provB.count, 5)
assert.ok(!provB.block.includes('具：'), '没有工具就不加 具 行')
assert.ok(!provB.block.includes('【工具概要】'), '没有工具就整块省略概要')
assert.equal(provB.stats.tools.calls, 0)
assert.equal(provB.stats.tools.shownRows, 0)

// ── C. 多窗口重叠：工具按 file:line 去重、概要只算一次 ──────────
const hitB2 = { id: 703, kind: 'episode', text: '第四条回复', source_msg_id: 'p4:toolA1234:510', source_ts: T + 3000, scope_type: 'owner' }
const provMerge = buildProvenanceBlock(db, { cwd, hits: [hitA, hitB2] })
const mergeLines = provMerge.block.split('\n').filter((l) => l.startsWith('- '))
assert.equal(mergeLines.length, 6, '两窗口重叠后按 file:line 合并为 6 条消息')
assert.equal((provMerge.block.match(/具：bash\(ok\)/g) ?? []).length, 1, '工具行按 file:line 去重')
assert.equal((provMerge.block.match(/具：read_image/g) ?? []).length, 1)
assert.equal(provMerge.stats.tools.calls, 3, '重叠窗口概要不得重复计数')
const mergeToolLine = provMerge.block.split('\n').find((l) => l.startsWith('【工具概要】'))
assert.ok(/调用 3 次/.test(mergeToolLine))

// ── D. 预算：超 maxChars 先整块丢工具，保五条消息/想 ───────────
const provFull = buildProvenanceBlock(db, { cwd, hits: [hitA], maxChars: 100000 })
assert.ok(provFull.block.includes('具：bash(ok)'), '预算充足时保留工具')
const tightCap = 180
const provTight = buildProvenanceBlock(db, { cwd, hits: [hitA], maxChars: tightCap })
assert.equal(provTight.count, 5, '超预算时五条消息不切')
assert.equal((provTight.block.match(/^  想：/gm) ?? []).length, 5)
assert.ok(!provTight.block.includes('具：'), '超预算时工具行整块丢弃')
assert.ok(!provTight.block.includes('【工具概要】'), '超预算时工具概要整块丢弃')
assert.ok(provTight.block.length <= tightCap, `超预算后长度受控（上限 ${tightCap}，实际 ${provTight.block.length}）`)
assert.equal(provTight.stats.tools.dropped, 'max-chars')
assert.equal(provTight.stats.tools.shownRows, 0)

// ── E. 附件行（图/文）也按边界归属，且不展示文件名 ─────────────
const FILE_C = `${DAY}/s-toolC123.md`
const C = (role, text, at, seq) => ins({ file: FILE_C, seq, role, text, at })
C('user', '图片锚点', T + 11000, 700)
C('图', '[图片] SECRET_FILENAME.png 123 bytes', T + 11100, 701)
C('self', '带图回复', T + 11200, 702)
C('user', '图后用户', T + 11300, 703)
C('self', '图后回复', T + 11400, 704)
const hitC = { id: 704, kind: 'episode', text: '图片锚点', source_msg_id: 'p4:toolC1234:700', source_ts: T + 11000, scope_type: 'owner' }
const provC = buildProvenanceBlock(db, { cwd, hits: [hitC] })
assert.ok(provC.block.includes('具：图片(ok)'), '图 行作为附件摘要挂在 assistant 行下')
assert.ok(!provC.block.includes('SECRET_FILENAME'), '附件文件名不注入')
assert.equal(provC.stats.tools.calls, 0, '附件不计入调用次数')
assert.ok(!provC.block.includes('【工具概要】'), '只有附件没有工具调用时省略概要')

console.log(JSON.stringify({
  ok: true, test: 'provenance-tools',
  tools: prov.stats.tools, mergeCalls: provMerge.stats.tools.calls,
  tightChars: provTight.block.length,
}))
process.exit(0)
