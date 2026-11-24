import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { ingestWithLlmFallback } from '../lib/extract/pipeline.js'
import { resetLlmStats, llmDiag } from '../lib/ingest/p4-stats.js'

const dir = `/tmp/dy-llm-quote-gate-${process.pid}`
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)

function makeCtx(answer) {
  let calls = 0
  const route = { provider: 'fixture-provider', model: 'fixture-model' }
  return {
    get calls() { return calls },
    ctx: {
      get(name) {
        if (name === 'agentDefaultModel') return { currentSelection: () => route }
        if (name !== 'llm') return undefined
        return {
          async prepareCall() {
            return {
              config: {},
              stream: async function* () {
                calls += 1
                yield { type: 'text-delta', text: answer }
                yield { type: 'finish', reason: { kind: 'stop' } }
              },
            }
          },
        }
      },
    },
  }
}

const sourceText = '我最近在学吉他，已经练了三个月'
const base = {
  text: sourceText,
  sessionId: 'fixture-session',
  sourceKey: 'fixture-session:message-1',
  sourceTs: 1763942400000,
  speaker: 'fixture-owner',
  vectors: new Map(),
  autoExtract: { enabled: true, minChars: 8, requireSubject: true, maxPerTurn: 1 },
  llmConfig: { enabled: true, maxPerTurn: 1, dailyCap: 10, timeoutMs: 1000, minChars: 8 },
  log: { info() {}, warn() {} },
}

const count = () => db.prepare('SELECT count(*) AS n FROM memories').get().n
const rows = () => db.prepare('SELECT * FROM memories ORDER BY id').all()

// An explicit model quote that is not a verbatim substring must hard-fail.
// It must not fall back to deriving a different quote or write the candidate.
{
  resetLlmStats()
  const fake = makeCtx(JSON.stringify({
    kind: 'fact',
    text: '主人最近在学吉他',
    quote: '主人喜欢游泳',
    confidence: 0.9,
  }))
  const before = count()
  const result = await ingestWithLlmFallback(db, { ...base, ctx: fake.ctx })
  assert.equal(fake.calls, 1)
  assert.equal(result.via, 'llm')
  assert.equal(result.action, 'none')
  assert.equal(result.reason, 'quote-not-in-source')
  assert.equal(result.code, 'E_QUOTE_MISMATCH')
  assert.equal(count(), before, 'mismatched model quote must not write')
  assert.equal(llmDiag().inserted, 0)
}

// A model quote that is an exact source substring may pass the quote gate.
// This proves only quote provenance, not the truth of the derived proposition.
{
  resetLlmStats()
  const fake = makeCtx(JSON.stringify({
    kind: 'fact',
    text: '主人在学吉他',
    quote: '已经练了三个月',
    confidence: 0.8,
  }))
  const before = count()
  const result = await ingestWithLlmFallback(db, { ...base, ctx: fake.ctx })
  assert.equal(fake.calls, 1)
  assert.equal(result.via, 'llm')
  assert.equal(result.action, 'insert')
  assert.equal(count(), before + 1)
  const row = rows().at(-1)
  assert.equal(row.quote, '已经练了三个月')
  assert.equal(JSON.parse(row.meta).provenance, 'verified')
  assert.equal(row.extractor_version, 'p4-llm-v1')
}

console.log(JSON.stringify({
  ok: true,
  test: 'llm-quote-gate',
  mismatchedQuote: 'hard-rejected-no-write',
  exactQuote: 'verified-verbatim-substring',
}))
