/**
 * MEM-VALIDITY-INTEGRATION-REVIEW-FIX-01：复核修正回归测试
 *
 * 修正 1：FTS 关键词臂不得再硬编码 status='active'（状态域完全由 helper 决定）
 * 修正 2：uncertain 必须尊重 as-of 时间边界
 *          created_at > at / valid_from > at / valid_to <= at → 属于「已能判定」，不得进 uncertain
 *
 * 全部使用 /tmp 临时 DB；不连接生产库、不写生产路径。
 */
import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { linkMemory, graphCandidates } from '../lib/store/graph.js'
import { recall } from '../lib/recall/recall.js'
import { uncertaintyWindowSql } from '../lib/store/validity.js'

const JAN = Date.UTC(2026, 0, 15)
const MAR = Date.UTC(2026, 2, 1)
const DEC = Date.UTC(2026, 11, 1)

function mkdb(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  const { db } = openDb(dir)
  return { db, dir, done() { try { db.close() } catch {} ; rmSync(dir, { recursive: true, force: true }) } }
}

async function add(db, opts) {
  const id = await insertMemory(db, {
    kind: opts.kind ?? 'fact',
    text: opts.text,
    status: opts.status ?? 'active',
    confidence: 0.9, layer: 'manual',
    validFrom: opts.validFrom ?? null,
    validTo: opts.validTo ?? null,
    temporalKind: opts.temporalKind,
    createdAt: opts.createdAt,
  })
  if (opts.supersededBy != null) db.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(Number(opts.supersededBy), id)
  if (opts.link !== false) linkMemory(db, id, opts.text, opts.createdAt ?? JAN)
  return id
}

const asOfRecall = (db, q, at) => recall(db, q, {
  asOf: at, vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 },
})

/* ─────────── 修正 1：FTS 关键词臂的状态域 ─────────── */

test('FTS 臂：as-of 通过关键词命中 archived / expired（不依赖 graph）', async () => {
  const { db, done } = mkdb('dsh-val-fts-hist-')
  try {
    // 文本与查询都不含实体词，保证 graph 臂无法兜底
    const archived = await add(db, { text: '极光在北方出现', status: 'archived', validFrom: JAN })
    const expired = await add(db, { text: '极光在南方出现', status: 'expired', validFrom: JAN })
    const pending = await add(db, { text: '极光在东方出现', status: 'pending', validFrom: JAN })
    const merged = await add(db, { text: '极光在西方出现', status: 'merged', validFrom: JAN })
    const currentOnly = await add(db, { text: '极光在头顶出现', validFrom: JAN })

    // 前置断言：graph 臂对该查询没有任何候选，结果只能来自 FTS
    const g = graphCandidates(db, '极光', { asOf: MAR, preset: 'asOfHistory' })
    assert.deepEqual(g.direct, [], '前置：graph 直接命中必须为空')
    assert.equal(g.hop.size, 0, '前置：graph 一跳必须为空')
    assert.equal(g.unknownHop.size, 0, '前置：unknownHop 必须为空')

    const hist = (await asOfRecall(db, '极光', MAR)).map((r) => Number(r.id))
    assert.ok(hist.includes(archived), 'as-of 必须通过 FTS 找到 archived 历史事实')
    assert.ok(hist.includes(expired), 'as-of 必须通过 FTS 找到 expired 历史事实')
    assert.ok(hist.includes(currentOnly))
    assert.ok(!hist.includes(pending), 'pending 仍排除')
    assert.ok(!hist.includes(merged), 'merged 仍排除')

    // current 视图不得把 archived / expired 当成当前记录
    const cur = (await recall(db, '极光', { vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } }))
      .map((r) => Number(r.id))
    assert.ok(cur.includes(currentOnly))
    assert.ok(!cur.includes(archived) && !cur.includes(expired) && !cur.includes(pending) && !cur.includes(merged))
  } finally { done() }
})

/* ─────────── 修正 2：uncertain 的时间边界 ─────────── */

test('uncertainWindowSql：参数顺序固定为 [at, at, at]', () => {
  const w = uncertaintyWindowSql({ at: MAR })
  assert.deepEqual(w.params, [MAR, MAR, MAR])
  assert.equal((w.sql.match(/\?/g) || []).length, 3)
  assert.ok(w.sql.indexOf('created_at_epoch<=') < w.sql.indexOf('valid_from<='))
  assert.ok(w.sql.indexOf('valid_from<=') < w.sql.indexOf('valid_to>'))
  assert.match(uncertaintyWindowSql({ at: MAR, alias: 'm' }).sql, /^m\.created_at_epoch<=/)
  assert.throws(() => uncertaintyWindowSql({ at: NaN }), (e) => e.code === 'E_BAD_TIMESTAMP')
})

test('uncertain：只保留「当时已存在且未明确结束」的判不了的行', async () => {
  const { db, done } = mkdb('dsh-val-unc-bound-')
  try {
    // 种子（会出现在结果里）
    const seed = await add(db, { kind: 'episode', text: '鲸鱼和主人一起讨论了海边旅行', validFrom: JAN })
    // ① 无 valid_from、创建早于 at：asOfHistory 用 created_at 近似 → 属于权威结果（并带近似标记），不是 uncertain
    const approxBefore = await add(db, {
      kind: 'episode', text: '主人曾经提到一件没有时间标注的往事',
      validFrom: null, temporalKind: 'unknown', createdAt: JAN,
    })
    // ② 创建于判定之后 → 既不是结果，也不是「判不了」
    const createdAfter = await add(db, { text: '鲸鱼后来才记下的事情（创建晚于判定点）', createdAt: DEC })
    // ③ valid_from 晚于判定点 → 已能判定「当时未生效」
    const futureFrom = await add(db, { text: '鲸鱼未来才生效的偏好', validFrom: DEC, supersededBy: 9, createdAt: JAN })
    // ④ valid_to 不晚于判定点 → 已能判定「当时已结束」
    const endedAt = await add(db, { text: '鲸鱼在三月已经结束的事情', validFrom: JAN, validTo: MAR, supersededBy: 9, createdAt: JAN })
    // ⑤ 已替代但没有终点、且创建/开始早于 at → superseded-without-end
    const inconsistent = await add(db, { text: '鲸鱼三月的事情（替代但没有终点）', validFrom: JAN, supersededBy: 9, createdAt: JAN })

    const rows = await asOfRecall(db, '鲸鱼', MAR)
    const resultIds = rows.map((r) => Number(r.id))
    assert.ok(resultIds.includes(seed))
    assert.ok(resultIds.includes(approxBefore), '① 近似起点的行属于权威结果，不是 uncertain')
    assert.equal(rows.find((r) => Number(r.id) === approxBefore).validFromApproximated, true)
    for (const id of [createdAfter, futureFrom, endedAt, inconsistent]) {
      assert.ok(!resultIds.includes(id), `#${id} 不得进入权威结果`)
    }

    const uncertain = rows.uncertain ?? []
    const byId = new Map(uncertain.map((x) => [Number(x.id), x]))
    assert.equal(byId.size, uncertain.length, '同一记录不得以两个 reason 重复出现')
    assert.equal(byId.get(inconsistent)?.reason, 'superseded-without-end', '⑤ 已替代但无终点')
    assert.ok(!byId.has(createdAfter), '② created_at > at → 不是不确定')
    assert.ok(!byId.has(futureFrom), '③ valid_from > at → 已能判定')
    assert.ok(!byId.has(endedAt), '④ valid_to <= at → 已能判定')
    assert.ok(!byId.has(approxBefore), '① 近似起点的行不应同时被标成 uncertain')
    assert.deepEqual([...byId.keys()], [inconsistent], '只有真正的 inconsistent 行进入 uncertain')
  } finally { done() }
})

test('uncertain：created_at 晚于 at 的行不得以 unknown-validity 误报（复核修正 2 的回归守卫）', async () => {
  const { db, done } = mkdb('dsh-val-unc-future-')
  try {
    // 该行无关键词语义关联、也没有 valid_from；旧实现会因「unknown-validity」把它误报成不确定
    const futureRow = await add(db, {
      kind: 'episode', text: '鲸鱼在十二月才记下的往事',
      validFrom: null, temporalKind: 'unknown', createdAt: DEC,
    })
    const rows = await asOfRecall(db, '鲸鱼', MAR)
    const uncertain = rows.uncertain ?? []
    assert.ok(!uncertain.some((x) => Number(x.id) === futureRow), '未来创建的行不得进入 uncertain')
    assert.ok(!uncertain.some((x) => x.reason === 'unknown-validity' && Number(x.id) === futureRow))
  } finally { done() }
})

test('uncertain：current 视图不产生 uncertain 字段（行为不变）', async () => {
  const { db, done } = mkdb('dsh-val-unc-cur-')
  try {
    await add(db, { text: '鲸鱼现在的事情' })
    const rows = await recall(db, '鲸鱼', { vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } })
    assert.equal(rows.uncertain, undefined)
  } finally { done() }
})
