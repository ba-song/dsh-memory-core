/**
 * 引文门禁（2026-11-16 P0-1）
 *
 * 覆盖：
 *  1) 显式引文篡改一个词 → E_QUOTE_MISMATCH，且行数不变（整条不入库）
 *  2) 正确引文 → 入库、quote 落库、provenance='verified'、confidence 不变
 *  3) 无原文（手工补录/自主写）→ 降级：quote=正文、confidence*0.8、provenance='degraded'
 *  4) 抽取路径（ingestCandidate）显式引文不符 → action:'none'，不落库
 *  5) 抽取路径自动取引文 → quote 是原文的逐字子串，provenance='derived'
 *  6) 模型改写（无逐字重叠）→ 不误杀，quote 留空、provenance='no-overlap'
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const DIR = '/tmp/dy-quote-gate-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { ingestCandidate } = await import('../lib/ingest/p4.js')
const { resolveQuote, deriveQuote, containsQuote, QUOTE_ERR } = await import('../lib/ingest/provenance.js')

const { db } = openDb(DIR)
const out = { ok: true, test: 'quote-gate' }
const count = () => Number(db.prepare('SELECT count(*) c FROM memories').get().c)
const rowOf = (id) => db.prepare('SELECT * FROM memories WHERE id=?').get(id)

// ── 0. 纯函数：只归一化空白，不做同义词放宽 ────────────────────────
assert.equal(containsQuote('主人 说：我喜欢  吃辣', '我喜欢吃辣'), true)
assert.equal(containsQuote('主人说我喜欢吃辣', '我喜欢吃咸'), false)
assert.equal(deriveQuote('主人最近在学吉他', '我最近在学吉他，已经练了三个月'), '最近在学吉他')
assert.deepEqual(resolveQuote({ quote: '我喜欢吃咸', sourceText: '我喜欢吃辣', text: 'x' }), { ok: false, code: QUOTE_ERR, reason: 'quote-not-in-source', quote: '我喜欢吃咸' })
out.pure = 'ok'

// ── 1. 篡改一个词 → 硬拒，行数不变 ───────────────────────────────
const SOURCE = '主人昨天说：我喜欢吃辣，但是最近胃不舒服'
{
  const before = count()
  let err = null
  try {
    await insertMemory(db, {
      kind: 'preference', text: '主人喜欢吃辣', confidence: 0.7,
      provenanceMode: 'session', sourceText: SOURCE, quote: '主人喜欢吃咸',
    })
  } catch (e) { err = e }
  assert.equal(err?.code, QUOTE_ERR, '必须抛 E_QUOTE_MISMATCH')
  assert.equal(err?.reason, 'quote-not-in-source')
  assert.equal(count(), before, '被拒的整条不入库')
  out.tamperedRejected = 'ok'
}

// ── 2. 正确引文 → 入库、quote/可见性/修订就位 ──────────────────────
{
  const id = await insertMemory(db, {
    kind: 'preference', text: '主人喜欢吃辣', confidence: 0.7,
    provenanceMode: 'session', sourceText: SOURCE, quote: '我喜欢吃辣',
  })
  const row = rowOf(id)
  assert.equal(row.quote, '我喜欢吃辣')
  assert.equal(row.confidence, 0.7, '不降级不改 confidence')
  assert.equal(JSON.parse(row.meta).provenance, 'verified')
  assert.equal(row.revision, 1)
  assert.ok(Number(row.updated_at) >= Number(row.created_at_epoch), 'updated_at 必须落值')
  out.verified = 'ok'
}

// ── 3. 无原文 → 降级档（quote=正文前 60 字、confidence*0.8）────────
{
  const longText = '主人最近在学吉他，每天练半个小时，手指还很疼'
  const id = await insertMemory(db, { kind: 'fact', text: longText, confidence: 0.5, provenanceMode: 'manual' })
  const row = rowOf(id)
  assert.equal(row.quote, [...longText].slice(0, 60).join(''))
  assert.equal(row.confidence, 0.4, '0.5 * 0.8')
  assert.equal(JSON.parse(row.meta).provenance, 'degraded')
  out.degraded = 'ok'
}

// ── 4. 抽取路径：显式引文被篡改 → action:none，不落库 ─────────────
{
  const before = count()
  const r = await ingestCandidate(db, {
    cand: { kind: 'preference', text: '主人喜欢吃辣', confidence: 0.6 },
    text: '主人说我喜欢吃辣，别记错',
    quote: '我喜欢吃咸',
    embed: async () => [null],
    vectors: new Map(),
    sourceKey: 'q:tamper',
  })
  assert.equal(r.action, 'none')
  assert.equal(r.reason, 'quote-not-in-source')
  assert.equal(r.code, QUOTE_ERR)
  assert.equal(count(), before)
  out.extractRejected = 'ok'
}

// ── 5. 抽取路径：自动取「候选 ∩ 原文」最长片段 → 逐字子串 ─────────
{
  const source = '我每天早上都喜欢喝冰美式，不加糖'
  const r = await ingestCandidate(db, {
    cand: { kind: 'preference', text: '喜欢喝冰美式', confidence: 0.6 },
    text: source,
    embed: async () => [null],
    vectors: new Map(),
    sourceKey: 'q:derive',
  })
  assert.equal(r.action, 'insert')
  const row = rowOf(r.id)
  assert.ok(row.quote.length >= 4, '应取到引文: ' + JSON.stringify(row.quote))
  assert.equal(containsQuote(source, row.quote), true, 'quote 必须是原文逐字子串')
  assert.equal(JSON.parse(row.meta).provenance, 'derived')
  out.derived = 'ok'
}

// ── 6. 模型改写（无 ≥4 字重叠）→ 不误杀，quote 留空 ───────────────
{
  const r = await ingestCandidate(db, {
    cand: { kind: 'fact', text: '主人在学吉他', confidence: 0.8 },
    text: '我最近在练吉他，已经三个月',
    embed: async () => [null],
    vectors: new Map(),
    sourceKey: 'q:paraphrase',
  })
  assert.equal(r.action, 'insert', '改写不是幻觉，不能拒')
  const row = rowOf(r.id)
  assert.equal(row.quote, '', '没有逐字片段就留空，不硬凑')
  assert.equal(JSON.parse(row.meta).provenance, 'no-overlap')
  out.paraphrase = 'ok'
}

console.log(JSON.stringify(out))
