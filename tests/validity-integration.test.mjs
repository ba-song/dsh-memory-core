/**
 * MEM-VALIDITY-INTEGRATION-01：统一有效性 helper 接入 recall / graph / event-chain
 *
 * 语义基线（GPT 已裁决）：
 *   current       仅当前有效（排除 superseded）
 *   asOfHistory   历史时点；起点允许 COALESCE(valid_from, created_at_epoch)，但必须标记近似；
 *                 已替代但当时有效 → 保留；pending/merged → 排除；archived/expired → 保留
 *   asOfStrict    不接受近似起点；缺 valid_from → 不确定
 *   asOfNeighbor  P4 专用（本文件不重复覆盖，见 tests/validity.test.mjs）
 *
 * 全部使用 /tmp 临时 DB；不连接生产库、不写生产路径。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { linkMemory, graphCandidates } from '../lib/store/graph.js'
import { recall } from '../lib/recall/recall.js'
import { eventChainCandidates } from '../lib/recall/event-chain.js'
import { RawArchive } from '../lib/ingest/archive.js'
import { validitySql } from '../lib/store/validity.js'

const JAN = Date.UTC(2026, 0, 15)
const MAR = Date.UTC(2026, 2, 1)
const JUN = Date.UTC(2026, 5, 1)
const DEC = Date.UTC(2026, 11, 1)

function mkdb(prefix = 'dsh-validity-integ-') {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  const { db } = openDb(dir)
  return { db, dir, done() { try { db.close() } catch {} ; rmSync(dir, { recursive: true, force: true }) } }
}

async function add(db, { text, kind = 'fact', status = 'active', validFrom = null, validTo = null, supersededBy = null, createdAt } = {}) {
  const id = await insertMemory(db, {
    kind, text, status, confidence: 0.9, layer: 'manual',
    validFrom, validTo, createdAt,
  })
  if (supersededBy != null) db.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(Number(supersededBy), id)
  linkMemory(db, id, text, JAN)
  return id
}

/* ───────────────────────────── graph ───────────────────────────── */

test('graph: current 排除 superseded/pending/merged/archived，保留活跃行', async () => {
  const { db, done } = mkdb('dsh-val-graph-cur-')
  try {
    const active = await add(db, { text: '主人喜欢鲸鱼', validFrom: JAN })
    const supNoEnd = await add(db, { text: '主人喜欢鲸鱼但被替代', validFrom: JAN, supersededBy: 9 })
    const supWithEnd = await add(db, { text: '主人喜欢鲸鱼但历史有效', validFrom: JAN, validTo: JUN, supersededBy: 9 })
    const archived = await add(db, { text: '主人喜欢鲸鱼（归档）', status: 'archived', validFrom: JAN })
    const pending = await add(db, { text: '主人喜欢鲸鱼（待裁决）', status: 'pending', validFrom: JAN })
    const merged = await add(db, { text: '主人喜欢鲸鱼（合并产物）', status: 'merged', validFrom: JAN })
    const future = await add(db, { text: '主人喜欢鲸鱼（未来生效）', validFrom: DEC })

    const g = graphCandidates(db, '主人', { preset: 'current' })
    assert.ok(g.direct.includes(active), '活跃行必须命中')
    for (const id of [supNoEnd, supWithEnd, archived, pending, merged, future]) {
      assert.ok(!g.direct.includes(id), `current 不应包含 #${id}`)
    }
  } finally { done() }
})

test('graph: asOfHistory 保留历史事实（archived / 已替代但有终点 / 近似起点）', async () => {
  const { db, done } = mkdb('dsh-val-graph-hist-')
  try {
    const active = await add(db, { text: '主人喜欢鲸鱼', validFrom: JAN })
    const supWithEnd = await add(db, { text: '主人喜欢鲸鱼（当时有效、后被替代）', validFrom: JAN, validTo: JUN, supersededBy: 9 })
    const supNoEnd = await add(db, { text: '主人喜欢鲸鱼（替代但没有终点）', validFrom: JAN, supersededBy: 9 })
    const archived = await add(db, { text: '主人喜欢鲸鱼（历史归档）', status: 'archived', validFrom: JAN })
    const expired = await add(db, { text: '主人喜欢鲸鱼（历史过期）', status: 'expired', validFrom: JAN })
    const pending = await add(db, { text: '主人喜欢鲸鱼（待裁决）', status: 'pending', validFrom: JAN })
    const merged = await add(db, { text: '主人喜欢鲸鱼（合并产物）', status: 'merged', validFrom: JAN })
    const approx = await add(db, { text: '主人喜欢鲸鱼（无起点、创建于判定前）', createdAt: JAN })
    const approxLate = await add(db, { text: '主人喜欢鲸鱼（无起点、创建于判定后）', createdAt: DEC })
    const future = await add(db, { text: '主人喜欢鲸鱼（未来生效）', validFrom: DEC })

    const g = graphCandidates(db, '主人', { asOf: MAR, preset: 'asOfHistory' })
    for (const id of [active, supWithEnd, archived, expired, approx]) {
      assert.ok(g.direct.includes(id), `asOfHistory 应包含 #${id}`)
    }
    for (const id of [supNoEnd, pending, merged, approxLate, future]) {
      assert.ok(!g.direct.includes(id), `asOfHistory 不应包含 #${id}`)
    }
  } finally { done() }
})

test('graph: asOfStrict 不接受近似起点；preset 优先于 strictAsOf', async () => {
  const { db, done } = mkdb('dsh-val-graph-strict-')
  try {
    const strictOk = await add(db, { text: '主人喜欢鲸鱼', validFrom: JAN })
    const approx = await add(db, { text: '主人喜欢鲸鱼（无起点）', createdAt: JAN })
    const strict = graphCandidates(db, '主人', { asOf: MAR, preset: 'asOfStrict' })
    assert.ok(strict.direct.includes(strictOk))
    assert.ok(!strict.direct.includes(approx), '严格模式不得用 created_at 冒充起点')

    // 旧参数 strictAsOf 仍兼容
    const legacyStrict = graphCandidates(db, '主人', { asOf: MAR, strictAsOf: true })
    assert.deepEqual(legacyStrict.direct, strict.direct, 'strictAsOf 等价于 asOfStrict')

    // 显式 preset 优先于 strictAsOf
    const precedence = graphCandidates(db, '主人', { asOf: MAR, strictAsOf: true, preset: 'asOfHistory' })
    assert.ok(precedence.direct.includes(approx), 'preset=asOfHistory 应覆盖 strictAsOf=true')
  } finally { done() }
})

/* ─────────────────────────── event chain ─────────────────────────── */

function chainFixture({ seedStatus = 'active', seedValidFrom = null, seedValidTo = null, seedSupersededBy = null, memberCreatedAt } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-val-chain-'))
  const { db } = openDb(dir)
  const HOME = '/sdcard/DSHA/生活/数据/home'
  const raw = new RawArchive({ db, dir: join(dir, 'raw'), cwdPrefixes: [HOME], log: { info() {}, warn() {} } })
  const sid = 'session-valchain1-aaaa-1111-2222-333333333333'
  const at = Date.now() - 60000
  const emit = (seq, text) => raw.onEvent(
    { header: { id: sid, cwd: HOME } },
    { type: 'user/message', seq, time: at + seq * 1000, data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text }] } },
  )
  return {
    db, HOME, sid, at, emit,
    async memory(seq, text, opts = {}) {
      const id = await insertMemory(db, {
        kind: 'episode', text, scopeType: 'owner',
        sourceMsgId: `p4:${sid}:${seq}`, sourceTs: at + seq * 1000,
        validFrom: opts.validFrom ?? null, validTo: opts.validTo ?? null,
        status: opts.status ?? 'active', createdAt: opts.createdAt,
      })
      linkMemory(db, id, text, at)
      return db.prepare('SELECT * FROM memories WHERE id=?').get(id)
    },
    done() { try { db.close() } catch {} ; rmSync(dir, { recursive: true, force: true }) },
  }
}

test('event-chain: current 拒绝 superseded seed；asOfHistory 允许当时有效的 superseded seed', async () => {
  const f = chainFixture()
  try {
    f.emit(1, '主人和鲸鱼讨论海边旅行')
    f.emit(2, '主人后来补充海边旅行安排')
    const seed = await f.memory(1, '主人和鲸鱼讨论海边旅行', { validFrom: JAN })
    const neighbor = await f.memory(2, '主人后来补充海边旅行安排', { validFrom: JAN })
    // 把 seed 标记为「已替代，但在 asOf 时点仍有效」
    f.db.prepare('UPDATE memories SET superseded_by=?, valid_to=? WHERE id=?').run(neighbor.id, JUN, seed.id)
    const supersededSeed = f.db.prepare('SELECT * FROM memories WHERE id=?').get(seed.id)

    assert.deepEqual(eventChainCandidates(f.db, supersededSeed, { cwd: f.HOME }), [], 'current 视图不接受 superseded seed')
    const rows = eventChainCandidates(f.db, supersededSeed, { cwd: f.HOME, asOf: MAR })
    assert.deepEqual(rows.map((r) => r.id), [neighbor.id], '历史时点：当时有效就必须允许扩展')
  } finally { f.done() }
})

test('event-chain: asOfHistory 允许近似起点；asOfStrict 明确排除', async () => {
  const f = chainFixture()
  try {
    f.emit(1, '主人和鲸鱼讨论海边旅行')
    f.emit(2, '主人后来补充海边旅行安排')
    const seed = await f.memory(1, '主人和鲸鱼讨论海边旅行', { validFrom: JAN })
    // 候选无 valid_from，但创建时间早于判定时点 → asOfHistory 用 created_at 近似
    const approx = await f.memory(2, '主人后来补充海边旅行安排', { createdAt: JAN })
    const asOf = f.at + 10000
    const hist = eventChainCandidates(f.db, seed, { cwd: f.HOME, asOf, preset: 'asOfHistory' })
    assert.deepEqual(hist.map((r) => r.id), [approx.id])
    const strict = eventChainCandidates(f.db, seed, { cwd: f.HOME, asOf, preset: 'asOfStrict' })
    assert.deepEqual(strict, [], '严格模式不得把 created_at 当成 valid_from')
  } finally { f.done() }
})

/* ───────────────────────────── recall ───────────────────────────── */

test('recall: current 排除 superseded，不把历史记录混入当前结果', async () => {
  const { db, done } = mkdb('dsh-val-recall-cur-')
  try {
    const active = await add(db, { text: '鲸鱼喜欢在海边玩' })
    const supNoEnd = await add(db, { text: '鲸鱼曾经喜欢在海边玩（已替代）', supersededBy: 9 })
    const supWithEnd = await add(db, { text: '鲸鱼喜欢在海边玩（已替代但有终点）', validTo: JUN, supersededBy: 9 })
    const rows = await recall(db, '鲸鱼', { vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } })
    const ids = rows.map((r) => Number(r.id))
    assert.ok(ids.includes(active))
    assert.ok(!ids.includes(supNoEnd), 'superseded 不得进入 current')
    assert.ok(!ids.includes(supWithEnd))
  } finally { done() }
})

test('recall: as-of 使用近似起点并标记 validFromApproximated', async () => {
  const { db, done } = mkdb('dsh-val-recall-approx-')
  try {
    const approx = await add(db, { text: '鲸鱼喜欢在三月出海', createdAt: JAN })
    const late = await add(db, { text: '鲸鱼喜欢在三月出海（十二月才记下）', createdAt: DEC })
    const rows = await recall(db, '鲸鱼', { asOf: MAR, vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } })
    const hit = rows.find((r) => Number(r.id) === approx)
    assert.ok(hit, '创建早于判定时点的无起点记录应进入历史结果')
    assert.equal(hit.validFromApproximated, true, '近似起点必须可识别')
    assert.ok(!rows.some((r) => Number(r.id) === late), '创建晚于判定时点不得被近似带入')
  } finally { done() }
})

test('recall: as-of 保留「已替代但当时有效」的历史事实', async () => {
  const { db, done } = mkdb('dsh-val-recall-sup-')
  try {
    const oldFact = await add(db, { text: '鲸鱼三月还在北方', validFrom: JAN, validTo: JUN, supersededBy: 9 })
    const rows = await recall(db, '鲸鱼', { asOf: MAR, vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } })
    const hit = rows.find((r) => Number(r.id) === oldFact)
    assert.ok(hit, 'superseded_by 是当前状态，不得抹掉历史事实')
    assert.equal(hit.validFromApproximated, false)
  } finally { done() }
})

test('recall: as-of 边界（valid_to 等于判定点 / valid_from 等于判定点）', async () => {
  const { db, done } = mkdb('dsh-val-recall-bound-')
  try {
    const endsAt = await add(db, { text: '鲸鱼边界刚好到期', validFrom: JAN, validTo: MAR })
    const startAt = await add(db, { text: '鲸鱼边界刚刚生效', validFrom: MAR })
    const rows = await recall(db, '鲸鱼', { asOf: MAR, vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } })
    const ids = rows.map((r) => Number(r.id))
    assert.ok(!ids.includes(endsAt), 'valid_to == at → 半开区间，不再有效')
    assert.ok(ids.includes(startAt), 'valid_from == at → 刚好生效')
  } finally { done() }
})

test('recall: as-of 包含 archived/expired，排除 pending/merged', async () => {
  const { db, done } = mkdb('dsh-val-recall-status-')
  try {
    const archived = await add(db, { text: '鲸鱼归档的往事', status: 'archived', validFrom: JAN })
    const expired = await add(db, { text: '鲸鱼过期的群往事', status: 'expired', validFrom: JAN })
    const pending = await add(db, { text: '鲸鱼待裁决的往事', status: 'pending', validFrom: JAN })
    const merged = await add(db, { text: '鲸鱼合并产物', status: 'merged', validFrom: JAN })
    const rows = await recall(db, '鲸鱼', { asOf: MAR, vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } })
    const ids = rows.map((r) => Number(r.id))
    assert.ok(ids.includes(archived))
    assert.ok(ids.includes(expired))
    assert.ok(!ids.includes(pending))
    assert.ok(!ids.includes(merged))
  } finally { done() }
})

test('recall: suspect superseded-without-end 进 uncertain，不被当成确定结果', async () => {
  const { db, done } = mkdb('dsh-val-recall-unc-')
  try {
    const inconsistent = await add(db, { text: '鲸鱼三月的事（替代但没有终点）', validFrom: JAN, supersededBy: 9, createdAt: JAN })
    const rows = await recall(db, '鲸鱼', { asOf: MAR, vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } })
    assert.ok(!rows.some((r) => Number(r.id) === inconsistent), '不一致行不得进入权威结果')
    const u = (rows.uncertain ?? []).find((x) => Number(x.id) === inconsistent)
    assert.ok(u, '不一致行必须保留在 uncertain')
    assert.equal(u.reason, 'superseded-without-end')
  } finally { done() }
})

test('recall: 同一查询的时间基准一致（预过滤与最终读取都用 as-of）', async () => {
  const { db, done } = mkdb('dsh-val-recall-basis-')
  try {
    // 该行在 as-of 时点有效，但在「现在」已过期——若最终读取用 now，就会被丢掉
    const onlyHistorical = await add(db, { text: '鲸鱼在三月看到过极光', validFrom: JAN, validTo: JUN })
    const rows = await recall(db, '鲸鱼', { asOf: MAR, vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } })
    assert.ok(rows.some((r) => Number(r.id) === onlyHistorical), '最终读取必须用同一 as-of 基准')
  } finally { done() }
})

test('recall: as-of 的 SQL 全部来自 helper（片段一致、参数个数正确）', async () => {
  const { db, done } = mkdb('dsh-val-recall-sql-')
  try {
    await add(db, { text: '鲸鱼在三月出海', validFrom: JAN })
    const captured = []
    const spy = new Proxy(db, {
      get(target, prop) {
        if (prop === 'prepare') return (sql) => { captured.push(String(sql)); return target.prepare(sql) }
        const v = target[prop]
        return typeof v === 'function' ? v.bind(target) : v
      },
    })
    const rows = await recall(spy, '鲸鱼', { asOf: MAR, vectors: null, trackAccess: false, gate: { semantic: 1, keyword: 0 } })
    assert.ok(rows.length > 0)
    const fragment = validitySql({ at: MAR, preset: 'asOfHistory' }).sql
    const allowedQuery = captured.find((s) => /SELECT id FROM memories WHERE/.test(s) && s.includes(fragment))
    const finalQuery = captured.find((s) => /SELECT \* FROM memories WHERE id=\?/.test(s) && s.includes(fragment))
    assert.ok(allowedQuery, '允许集查询必须使用 helper 片段')
    assert.ok(finalQuery, '最终读取必须使用同一 helper 片段')
    assert.equal((allowedQuery.match(/\?/g) || []).length, 2, '允许集：两个时间参数')
    assert.equal((finalQuery.match(/\?/g) || []).length, 3, '最终读取：id + 两个时间参数')
    // 不得残留手写的严格谓词
    assert.ok(!captured.some((s) => s.includes('valid_from IS NOT NULL AND valid_from <=') && /FROM memories/.test(s)),
      '不得再拼装旧的严格 as-of 谓词')
  } finally { done() }
})
