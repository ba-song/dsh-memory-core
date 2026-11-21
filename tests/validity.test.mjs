/**
 * MEM-VALIDITY-IMPL-01：统一有效性谓词（lib/store/validity.js）+ P4 接入
 *
 * 覆盖：
 *   1) helper 单元：预设/SQL 形状/参数顺序/alias 安全/时间校验/近似标记/uncertain
 *   2) 临时 DB 行为：current / asOfHistory / asOfStrict / asOfNeighbor 的集合语义
 *   3) P4 接入：N1–N5、预过滤与最终查询同源、sourceTs 无效输入拒绝
 *
 * 只用 /tmp 下的临时 DB；不连接生产库、不写任何生产路径。
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { ingestCandidate } from '../lib/ingest/p4.js'
import {
  VALIDITY_PRESETS, VALIDITY_MODES, SUPERSEDED_POLICIES,
  validitySql, uncertaintySql, resolveSourceTs, assertEpochMs, presetOf, ValidityError, isValidAt,
} from '../lib/store/validity.js'

const T = 1795000000000          // 固定判定时刻
const H = 3600 * 1000
const D = 24 * H

/* ─────────────────────────── 1. helper 单元 ─────────────────────────── */

test('validity: 预设与枚举完整', () => {
  assert.deepEqual(Object.keys(VALIDITY_PRESETS).sort(), ['asOfHistory', 'asOfNeighbor', 'asOfStrict', 'current', 'currentTodoActiveEmpty', 'currentTodoLegacy'].sort())
  assert.deepEqual([...VALIDITY_MODES], ['current', 'asof'])
  assert.deepEqual([...SUPERSEDED_POLICIES], ['enforce', 'ignore', 'guard'])
  assert.equal(presetOf('current').superseded, 'enforce')
  assert.equal(presetOf('asOfHistory').superseded, 'guard')
  assert.equal(presetOf('asOfNeighbor').superseded, 'enforce')
  assert.equal(presetOf('asOfStrict').approximateFrom, false)
  assert.throws(() => presetOf('nope'), (e) => e.code === 'E_BAD_PRESET')
})

test('validity: current SQL 形状与参数顺序', () => {
  const r = validitySql({ at: T, preset: 'current' })
  assert.equal(r.mode, 'current')
  assert.equal(r.approximateFrom, false)
  assert.deepEqual(r.params, [T, T])
  assert.equal((r.sql.match(/\?/g) || []).length, 2)
  assert.match(r.sql, /status='active'/)
  assert.match(r.sql, /valid_from IS NULL OR valid_from<=\?/)
  assert.match(r.sql, /valid_to IS NULL OR valid_to>\?/)
  assert.match(r.sql, /superseded_by IS NULL OR superseded_by=0 OR superseded_by=''/)
  // 参数顺序固定：时间起点子句必须出现在时间终点子句之前
  assert.ok(r.sql.indexOf('valid_from<=') < r.sql.indexOf('valid_to>'))
})


test('validity: legacy todo presets preserve distinct status domains with current time/supersede rules', () => {
  const activeEmpty = validitySql({ at: T, preset: 'currentTodoActiveEmpty' })
  const legacy = validitySql({ at: T, preset: 'currentTodoLegacy' })
  assert.match(activeEmpty.sql, /status='active' OR status=''/)
  assert.doesNotMatch(activeEmpty.sql, /status IS NULL/)
  assert.match(legacy.sql, /status='active' OR status='' OR status IS NULL/)
  for (const r of [activeEmpty, legacy]) {
    assert.deepEqual(r.params, [T, T])
    assert.match(r.sql, /valid_from IS NULL OR valid_from<=\?/)
    assert.match(r.sql, /valid_to IS NULL OR valid_to>\?/)
    assert.match(r.sql, /superseded_by IS NULL OR superseded_by=0 OR superseded_by=''/)
  }
})

test('validity: as-of 三种预设的差异', () => {
  const hist = validitySql({ at: T, preset: 'asOfHistory' })
  const nb = validitySql({ at: T, preset: 'asOfNeighbor' })
  const strict = validitySql({ at: T, preset: 'asOfStrict' })
  // 状态集合：排除 pending / merged
  for (const r of [hist, nb, strict]) assert.match(r.sql, /status NOT IN \('pending','merged'\)/)
  // 近似起点
  assert.match(hist.sql, /COALESCE\(valid_from, created_at_epoch\)<=\?/)
  assert.match(nb.sql, /COALESCE\(valid_from, created_at_epoch\)<=\?/)
  assert.match(strict.sql, /valid_from IS NOT NULL AND valid_from<=\?/)
  // guard：历史事实（有 valid_to 的 superseded）保留
  assert.match(hist.sql, /OR valid_to IS NOT NULL/)
  assert.match(strict.sql, /OR valid_to IS NOT NULL/)
  // neighbor：强制排除 superseded（无 OR 例外）
  assert.doesNotMatch(nb.sql, /OR valid_to IS NOT NULL/)
  assert.match(nb.sql, /superseded_by IS NULL OR superseded_by=0 OR superseded_by=''/)
  assert.deepEqual(hist.params, [T, T])
  assert.deepEqual(nb.params, [T, T])
  assert.deepEqual(strict.params, [T, T])
})

test('validity: alias 只接受普通标识符（防注入）', () => {
  assert.match(validitySql({ at: T, preset: 'current', alias: 'm' }).sql, /^m\.status='active'/)
  // '' 与 null 表示「不用别名」，不是非法输入
  assert.doesNotThrow(() => validitySql({ at: T, preset: 'current', alias: '' }))
  assert.doesNotThrow(() => validitySql({ at: T, preset: 'current', alias: null }))
  for (const bad of ['m; DROP TABLE memories', 'm.x', '1m', 'm ', 'm--', 'm)']) {
    assert.throws(() => validitySql({ at: T, preset: 'current', alias: bad }), (e) => e.code === 'E_BAD_ALIAS', `alias=${String(bad)}`)
  }
  assert.throws(() => validitySql({ at: T, preset: 'current', alias: 'a'.repeat(40) }), (e) => e.code === 'E_BAD_ALIAS')
})

test('validity: 时间参数与预设参数校验', () => {
  for (const bad of [null, undefined, NaN, Infinity, -Infinity, 0, -1, '1795000000000', {}, []]) {
    assert.throws(() => validitySql({ at: bad, preset: 'current' }), (e) => e.code === 'E_BAD_TIMESTAMP', `at=${String(bad)}`)
  }
  assert.throws(() => validitySql({ at: T, preset: 'nope' }), (e) => e.code === 'E_BAD_PRESET')
  assert.throws(() => validitySql({ at: T, mode: 'nope' }), (e) => e.code === 'E_BAD_MODE')
  assert.throws(() => validitySql({ at: T, mode: 'asof', superseded: 'nope' }), (e) => e.code === 'E_BAD_POLICY')
  // current 不支持忽略/守门（当前视图不能忽略接班指针）
  assert.throws(() => validitySql({ at: T, mode: 'current', superseded: 'ignore' }), (e) => e.code === 'E_BAD_SPEC')
  // preset 与显式参数不能混用
  assert.throws(() => validitySql({ at: T, preset: 'current', mode: 'asof' }), (e) => e.code === 'E_BAD_SPEC')
  assert.equal(assertEpochMs(T), T)
})

test('validity: uncertaintySql 与预设配套', () => {
  const hist = uncertaintySql({ preset: 'asOfHistory' })
  assert.deepEqual(hist.reasons, ['superseded-without-end'])
  assert.deepEqual(hist.params, [])
  assert.match(hist.sql, /superseded_by IS NULL OR superseded_by=0 OR superseded_by=''/)
  const strict = uncertaintySql({ preset: 'asOfStrict' })
  assert.deepEqual(strict.reasons, ['superseded-without-end', 'missing-valid-from'])
  assert.match(strict.sql, /valid_from IS NULL/)
  const nb = uncertaintySql({ preset: 'asOfNeighbor' })
  assert.deepEqual(nb.reasons, ['superseded-without-end'])
})

test('validity: resolveSourceTs 明确拒绝无效输入', () => {
  assert.equal(resolveSourceTs(undefined, { now: () => T }).value, T)
  assert.equal(resolveSourceTs(T).value, T)
  assert.equal(resolveSourceTs(String(T)).value, T)
  for (const bad of [null, NaN, Infinity, -Infinity, 0, -1, '', 'abc', '12abc', true, {}, []]) {
    const r = resolveSourceTs(bad)
    assert.equal(r.ok, false, `input=${String(bad)} 应被拒绝`)
    assert.equal(r.code, 'E_BAD_SOURCE_TS')
    assert.equal(r.reason, 'invalid-source-ts')
  }
})

/* ─────────────────────────── 2. 临时 DB 行为 ─────────────────────────── */

const DIR = '/tmp/dy-validity-' + process.pid
rmSync(DIR, { recursive: true, force: true })
const { db } = openDb(DIR)

async function mk({ kind = 'preference', text, status = 'active', validFrom, validTo, supersededBy, createdAt } = {}) {
  const id = await insertMemory(db, {
    kind, text: text ?? `记忆 ${Math.random().toString(36).slice(2, 8)}`,
    status, confidence: 0.9, layer: 'manual',
    validFrom: validFrom ?? null, validTo: validTo ?? null,
    createdAt,
  })
  if (supersededBy != null) db.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(Number(supersededBy), id)
  return id
}

const ids = {}
ids.base = await mk({ text: '基准行：无时间字段', createdAt: T - 10 * D })
ids.futureFrom = await mk({ text: '未来才生效', validFrom: T + H, createdAt: T - 10 * D })
ids.expiredAt = await mk({ text: '刚好到期（半开区间）', validTo: T, createdAt: T - 10 * D })
ids.futureTo = await mk({ text: '未来才失效', validTo: T + H, createdAt: T - 10 * D })
ids.supNoEnd = await mk({ text: '不一致：已替代但没有结束时间', supersededBy: 9, createdAt: T - 10 * D })
ids.supWithEnd = await mk({ text: '已替代但历史有效', supersededBy: 9, validTo: T + H, createdAt: T - 10 * D })
ids.archived = await mk({ status: 'archived', text: '已归档（clarity）', createdAt: T - 10 * D })
ids.expired = await mk({ status: 'expired', text: '已过期（group ttl）', createdAt: T - 10 * D })
ids.pending = await mk({ status: 'pending', text: '待裁决', createdAt: T - 10 * D })
ids.merged = await mk({ status: 'merged', text: '重复落库产物', createdAt: T - 10 * D })
ids.nullFromOld = await mk({ text: '无起点、创建于判定之前', createdAt: T - 3 * D })
ids.nullFromNew = await mk({ text: '无起点、创建于判定之后', createdAt: T + 3 * D })
ids.windowValid = await mk({ text: '完整窗口：已生效且未到期', validFrom: T - D, validTo: T + H, createdAt: T - 10 * D })
ids.supWindow = await mk({ text: '完整窗口 + 已替代', validFrom: T - D, validTo: T + H, supersededBy: 9, createdAt: T - 10 * D })
ids.supWindowNoEnd = await mk({ text: '完整起点 + 已替代但无终点', validFrom: T - D, supersededBy: 9, createdAt: T - 10 * D })

function selectIds(spec) {
  return new Set(db.prepare(`SELECT id FROM memories WHERE ${spec.sql}`).all(...spec.params).map((r) => Number(r.id)))
}
const sorted = (s) => [...s].sort((a, b) => a - b)


test('validity: legacy todo JS mirror and SQL sets preserve NULL/empty distinctions', async () => {
  const active = await mk({ kind: 'todo', text: 'todo active', createdAt: T - 1 })
  const empty = await mk({ kind: 'todo', text: 'todo empty', createdAt: T - 1 })
  db.prepare("UPDATE memories SET status='' WHERE id=?").run(empty)
  const activeEmpty = selectIds(validitySql({ at: T, preset: 'currentTodoActiveEmpty' }))
  const legacy = selectIds(validitySql({ at: T, preset: 'currentTodoLegacy' }))
  assert.ok(activeEmpty.has(active) && activeEmpty.has(empty))
  assert.ok(legacy.has(active) && legacy.has(empty))
  assert.equal(isValidAt({ status: 'active' }, T, 'currentTodoLegacy'), true)
  assert.equal(isValidAt({ status: '' }, T, 'currentTodoActiveEmpty'), true)
  assert.equal(isValidAt({ status: null }, T, 'currentTodoActiveEmpty'), false)
  assert.equal(isValidAt({ status: null }, T, 'currentTodoLegacy'), true)
})

test('db: current 视图', () => {
  const got = selectIds(validitySql({ at: T, preset: 'current' }))
  // current 只看 status + valid_*，不看 created_at：nullFromNew 仍算有效（这是 current 的既有语义）
  const expect = new Set([ids.base, ids.futureTo, ids.nullFromOld, ids.nullFromNew, ids.windowValid])
  assert.deepEqual(sorted(got), sorted(expect), 'current 只按 status + valid_* 判定')
  assert.ok(!got.has(ids.futureFrom), '未来 valid_from 不参与')
  assert.ok(!got.has(ids.expiredAt), 'valid_to == at 不参与（半开区间）')
  assert.ok(!got.has(ids.supNoEnd), 'superseded 且无 valid_to 不参与 current')
  assert.ok(!got.has(ids.supWithEnd), 'superseded 一律不参与 current')
  assert.ok(!got.has(ids.archived) && !got.has(ids.expired) && !got.has(ids.pending) && !got.has(ids.merged))
})

test('db: asOfHistory 视图（保留历史事实、排除从未成立）', () => {
  const got = selectIds(validitySql({ at: T, preset: 'asOfHistory' }))
  assert.ok(got.has(ids.base))
  assert.ok(!got.has(ids.futureFrom), '未来起点')
  assert.ok(!got.has(ids.expiredAt), '终点恰好等于 at')
  assert.ok(got.has(ids.futureTo))
  assert.ok(!got.has(ids.supNoEnd), '不一致行不得进入权威结果')
  assert.ok(got.has(ids.supWithEnd), '被替代但历史有效 → 必须保留（不得因 superseded 抹掉历史）')
  assert.ok(got.has(ids.archived), 'archived 是历史事实')
  assert.ok(got.has(ids.expired), 'expired 是历史事实')
  assert.ok(!got.has(ids.pending) && !got.has(ids.merged), 'pending/merged 从未成立')
  assert.ok(got.has(ids.nullFromOld), 'valid_from NULL 时用 created_at 近似')
  assert.ok(!got.has(ids.nullFromNew), 'created_at 晚于 at 不得提前参与')
})

test('db: asOfStrict 视图（不接受近似）', () => {
  const got = selectIds(validitySql({ at: T, preset: 'asOfStrict' }))
  assert.ok(!got.has(ids.base), 'valid_from NULL 不进确定结果')
  assert.ok(!got.has(ids.nullFromOld))
  assert.ok(!got.has(ids.futureTo), '只有终点没有起点 → 严格模式不计为确定')
  assert.ok(got.has(ids.windowValid), '完整窗口进入确定结果')
  assert.ok(got.has(ids.supWindow), '完整窗口 + 已替代：历史事实保留（guard）')
  assert.ok(!got.has(ids.supWindowNoEnd), '已替代但无终点 → 不确定')
  assert.ok(!got.has(ids.supWithEnd), '缺 valid_from → 严格模式不确定')
  assert.ok(!got.has(ids.supNoEnd))
})

test('db: asOfNeighbor 与 asOfHistory 的不对称（N5）', () => {
  const hist = selectIds(validitySql({ at: T, preset: 'asOfHistory' }))
  const nb = selectIds(validitySql({ at: T, preset: 'asOfNeighbor' }))
  assert.ok(hist.has(ids.supWithEnd), '历史视图保留「已替代但历史有效」')
  assert.ok(!nb.has(ids.supWithEnd), '邻居视图强制排除已替代')
  assert.ok(!nb.has(ids.supNoEnd))
})

test('db: uncertainty 取出的正是被 guard 排除的不一致行', () => {
  const u = uncertaintySql({ preset: 'asOfHistory' })
  const uncertain = selectIds(u)
  assert.ok(uncertain.has(ids.supNoEnd), 'superseded 无 valid_to → uncertain')
  assert.ok(!uncertain.has(ids.supWithEnd), '有 valid_to 的历史事实不是 uncertain')
  const strictU = selectIds(uncertaintySql({ preset: 'asOfStrict' }))
  assert.ok(strictU.has(ids.base) || strictU.has(ids.nullFromOld), '严格模式下 valid_from 缺失 → uncertain')
})

/* ─────────────────────────── 3. P4 接入 ─────────────────────────── */

const CAND = { kind: 'preference', text: '主人喜欢喝三分糖的奶茶', confidence: 0.9 }
const UNIT = new Float32Array([1, 0])

async function p4run({ target, sourceTs = T, db: handle = db }) {
  const vectors = new Map(handle === db ? [[target.id, target.vec ?? UNIT]] : [[target.id, target.vec ?? UNIT]])
  return ingestCandidate(handle, {
    cand: CAND, text: CAND.text, sourceKey: 'validity:' + Math.random().toString(36).slice(2),
    sourceTs, speaker: 'owner',
    embed: async () => [UNIT], vectors,
  })
}

async function mkNeighbor(opts) {
  // 邻居一般早于候选事件存在；显式给 created_at，避免 as-of 的 COALESCE 起点把它排除
  const id = await mk({ text: opts.text ?? '主人喜欢喝三分糖的奶茶（邻居）', createdAt: T - 10 * D, ...opts.row })
  return { id, vec: opts.vec ?? UNIT }
}

test('p4: N1 未来 valid_to 仍参与', async () => {
  const t = await mkNeighbor({ row: { validTo: T + H } })
  const r = await p4run({ target: t })
  assert.equal(r.action, 'merge')
  assert.equal(Number(r.targetId), t.id)
})

test('p4: N2 valid_to == sourceTs 不参与（半开区间）', async () => {
  const t = await mkNeighbor({ row: { validTo: T } })
  const r = await p4run({ target: t })
  assert.equal(r.action, 'insert')
})

test('p4: N3 未来 valid_from 不参与', async () => {
  const t = await mkNeighbor({ row: { validFrom: T + 1 } })
  const r = await p4run({ target: t })
  assert.equal(r.action, 'insert')
})

test('p4: N4 superseded 且无 valid_to 不参与', async () => {
  const t = await mkNeighbor({ row: { supersededBy: 9 } })
  const r = await p4run({ target: t })
  assert.equal(r.action, 'insert')
})

test('p4: N5 邻居视图排除「已替代但历史有效」', async () => {
  const t = await mkNeighbor({ row: { supersededBy: 9, validTo: T + H } })
  const r = await p4run({ target: t })
  assert.equal(r.action, 'insert', 'P4 是邻居视图：已替代即不参与，哪怕历史窗口覆盖 sourceTs')
  // 同一行在历史视图里仍然可见（语义不对称，见报告 §N5）
  assert.ok(selectIds(validitySql({ at: T, preset: 'asOfHistory' })).has(t.id))
})

test('p4: 预过滤与最终查询使用同一 helper 与同一 sourceTs', async () => {
  const captured = []
  const spy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql) => { captured.push(String(sql)); return target.prepare(sql) }
      const v = target[prop]
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
  const t = await mkNeighbor({ row: { validTo: T + H } })
  const r = await ingestCandidate(spy, {
    cand: CAND, text: CAND.text, sourceKey: 'validity:same-helper', sourceTs: T, speaker: 'owner',
    embed: async () => [UNIT], vectors: new Map([[t.id, UNIT]]),
  })
  assert.equal(r.action, 'merge')
  const pre = captured.find((s) => /SELECT id FROM memories WHERE/.test(s))
  const fin = captured.find((s) => /SELECT id,text,kind FROM memories WHERE id=\?/.test(s))
  assert.ok(pre && fin, '两条查询都必须出现')
  const fragment = validitySql({ at: T, preset: 'asOfNeighbor' }).sql
  assert.ok(pre.includes(fragment), '预过滤必须使用 helper 生成的同一片段')
  assert.ok(fin.includes(fragment), '最终查询必须使用 helper 生成的同一片段')
  assert.equal((pre.match(/\?/g) || []).length, 2)
  assert.equal((fin.match(/\?/g) || []).length, 3, 'id + 两个时间参数')
})

test('p4: 无效 sourceTs 在任何 SQL 之前被拒绝', async () => {
  const captured = []
  const spy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql) => { captured.push(String(sql)); return target.prepare(sql) }
      const v = target[prop]
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
  const before = db.prepare('SELECT COUNT(*) c FROM memories').get().c
  for (const bad of [null, NaN, Infinity, -Infinity, 0, 'abc', true]) {
    captured.length = 0
    const r = await ingestCandidate(spy, {
      cand: CAND, text: CAND.text, sourceKey: 'validity:bad-ts', sourceTs: bad, speaker: 'owner',
      embed: async () => [UNIT], vectors: new Map(),
    })
    assert.equal(r.action, 'none', `sourceTs=${String(bad)} 必须被拒绝`)
    assert.equal(r.code, 'E_BAD_SOURCE_TS')
    assert.equal(captured.length, 0, '拒绝必须发生在任何 SQL 之前')
  }
  assert.equal(db.prepare('SELECT COUNT(*) c FROM memories').get().c, before, '不得静默落库')
})

test('p4: sourceTs 未提供时保留默认（当前时间）', async () => {
  const t = await mkNeighbor({ row: {} })
  const r = await ingestCandidate(db, {
    cand: CAND, text: CAND.text, sourceKey: 'validity:default-ts', speaker: 'owner',
    embed: async () => [UNIT], vectors: new Map([[t.id, UNIT]]),
  })
  assert.equal(r.action, 'merge')
})

test('p4: 数字字符串 sourceTs 可用，且写入行带正确时间', async () => {
  const t = await mkNeighbor({ row: {} })
  const r = await p4run({ target: t, sourceTs: String(T) })
  assert.equal(r.action, 'merge')
  const row = db.prepare('SELECT source_ts FROM memories WHERE id=?').get(r.id)
  assert.equal(Number(row.source_ts), T)
})

process.on('exit', () => { try { db.close() } catch {} ; try { rmSync(DIR, { recursive: true, force: true }) } catch {} })
