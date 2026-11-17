/**
 * as-of 查询（2026-11-16 P0-4）
 *
 * 覆盖：
 *  1) normalizeAsOf：YYYY-MM-DD → 当天结束（本地）、epoch、ISO、非法 → null
 *  2) asOf 只回「那时候有效」的行（旧事实），不混合现在的版本
 *  3) 明确落在窗外（valid_to 已过）的行不进结果
 *  4) 无法判定有效性的行（temporal_kind=unknown 且 valid_from NULL）进 uncertain，不猜
 *  5) 不传 asOf → 老行为完全不变（两版都回）
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const DIR = '/tmp/dy-asof-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { recall, normalizeAsOf } = await import('../lib/recall/recall.js')

const { db } = openDb(DIR)
const out = { ok: true, test: 'asof' }
const texts = (rows) => rows.map((r) => r.text)

// ── 1. 日期解析 ─────────────────────────────────────────────────
{
  const d = normalizeAsOf('2026-03-01')
  assert.equal(new Date(d).getHours(), 23, '按当天结束')
  assert.equal(new Date(d).getMonth(), 2)
  assert.equal(normalizeAsOf(1790000000000), 1790000000000)
  assert.equal(normalizeAsOf('2026-03-01T12:00:00+08:00'), Date.parse('2026-03-01T12:00:00+08:00'))
  assert.equal(normalizeAsOf('不是日期'), null)
  assert.equal(normalizeAsOf(''), null)
  out.normalize = 'ok'
}

// ── 数据：旧事实（1 月—5 月）→ 现行事实（6 月起）+ 一条无时间标注的老行 ──
const JAN = Date.UTC(2026, 0, 1)
const JUN = Date.UTC(2026, 5, 1)
const oldId = await insertMemory(db, {
  kind: 'preference', text: '主人喜欢吃辣', importance: 0.6,
  validFrom: JAN, validTo: JUN, temporalKind: 'historical',
})
const newId = await insertMemory(db, {
  kind: 'preference', text: '主人不喜欢吃辣了', importance: 0.6,
  validFrom: JUN, temporalKind: 'current',
})
const unknownId = await insertMemory(db, { kind: 'preference', text: '主人吃辣会胃疼' })   // 无 valid_from / unknown

// ── 2 & 3. asOf 只回当时有效的行 ────────────────────────────────
{
  const march = await recall(db, '吃辣', { asOf: '2026-03-01' })
  assert.deepEqual(texts(march), ['主人喜欢吃辣'], '3 月只应有旧事实')
  assert.equal(march.asOf, normalizeAsOf('2026-03-01'))
  // 无时间标注的行判不了 → 进 uncertain，不混进结果
  assert.deepEqual(march.uncertain.map((x) => x.text), ['主人吃辣会胃疼'])
  assert.equal(march.uncertain[0].reason, 'unknown-validity')

  const now = await recall(db, '吃辣', { asOf: '2026-11-16' })
  assert.deepEqual(texts(now), ['主人不喜欢吃辣了'], '现在只应有现行事实')
  assert.equal(now.uncertain.length, 1)

  // 旧事实有效期末尾（5/31）仍算旧；6/1 起换新（半开区间）
  assert.deepEqual(texts(await recall(db, '吃辣', { asOf: '2026-05-31' })), ['主人喜欢吃辣'])
  assert.deepEqual(texts(await recall(db, '吃辣', { asOf: '2026-06-01' })), ['主人不喜欢吃辣了'])

  // 更早（valid_from 之前）→ 两条都不该回
  const before = await recall(db, '吃辣', { asOf: '2025-12-01' })
  assert.deepEqual(texts(before), [])
  assert.equal(before.uncertain.length, 1, '只有那条判不了的不确定性行')
  out.asOf = 'ok'
}

// ── 5. 不传 asOf → 当前视图只返回当前有效版本 ───────────────
{
  const plain = await recall(db, '吃辣')
  const got = new Set(texts(plain))
  assert.equal(got.has('主人喜欢吃辣'), false, '已过期版本不进入当前视图')
  assert.equal(got.has('主人不喜欢吃辣了'), true, '当前有效版本应返回')
  assert.equal(plain.uncertain, undefined)
  out.currentView = 'ok'
}

// ── 6. 行内携带时间字段（工具层直接回给模型）─────────────────────
{
  const r = await recall(db, '吃辣', { asOf: '2026-03-01' })
  assert.equal(r[0].id, oldId)
  assert.equal(Number(r[0].valid_from), JAN)
  assert.equal(Number(r[0].valid_to), JUN)
  assert.equal(r[0].temporal_kind, 'historical')
  assert.notEqual(r[0].id, newId)
  assert.notEqual(r[0].id, unknownId)
  out.fields = 'ok'
}

// ── 7. 工具层 `dy_memory_asof` 端到端（注册 + date 解析 + uncertain 透传）──
{
  const registered = {}
  const ctx = {
    get(n) {
      if (n === 'tools') return { register: (d) => { registered[d.name] = d } }
      if (n === 'systemPrompt') return { context: () => () => {} }
      if (n === 'agents') return { list: () => [] }
      return undefined
    },
    on() {},
    logger: { info() {}, warn() {} },
  }
  const mod = await import('../lib/index.js')
  mod.apply(ctx, { ownerQQ: '1000000001' })
  assert.ok(registered.dy_memory_asof, 'dy_memory_asof 必须注册')
  const ownerDir = '/root/qq-agent/QQ会话/私聊_1000000001'
  const exec = { agent: { session: { header: { cwd: ownerDir, id: 'asof-s1' } } } }
  const res = JSON.parse((await registered.dy_memory_asof.execute({ query: '吃辣', date: '2026-03-01' }, exec)).detail)
  assert.equal(res.ok, true)
  assert.equal(res.count, 1)
  assert.equal(res.items[0].id, oldId)
  assert.equal(res.uncertain.length, 1)
  assert.equal(res.uncertain[0].text, '主人吃辣会胃疼')
  const bad = JSON.parse((await registered.dy_memory_asof.execute({ query: '吃辣', date: '不是日期' }, exec)).detail)
  assert.equal(bad.ok, false)
  assert.equal(bad.code, 'BAD_ARG')
  out.tool = 'ok'
}

console.log(JSON.stringify(out))
