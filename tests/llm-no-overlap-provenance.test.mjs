import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { ingestWithLlmFallback } from '../lib/extract/pipeline.js'
import { resetLlmStats } from '../lib/ingest/p4-stats.js'

const dir = `/tmp/dy-llm-no-overlap-${process.pid}`
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)

const answer = JSON.stringify({
  kind: 'fact',
  text: '主人会弹吉他',
  confidence: 0.8,
})
const ctx = {
  get(name) {
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fixture', model: 'fixture' }) }
    if (name !== 'llm') return undefined
    return {
      async prepareCall() {
        return {
          config: {},
          stream: async function* () {
            yield { type: 'text-delta', text: answer }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      },
    }
  },
}

resetLlmStats()
const before = db.prepare('SELECT count(*) n FROM memories').get().n
const result = await ingestWithLlmFallback(db, {
  ctx,
  text: '我最近在学吉他，已经练了三个月',
  sessionId: 'fixture-session',
  sourceKey: 'fixture-session:message-2',
  sourceTs: 1763942400000,
  speaker: 'fixture-owner',
  vectors: new Map(),
  autoExtract: { enabled: true, minChars: 8, requireSubject: true, maxPerTurn: 1 },
  llmConfig: { enabled: true, dailyCap: 10, timeoutMs: 1000, minChars: 8 },
  log: { info() {}, warn() {} },
})

assert.equal(result.via, 'llm')
assert.equal(result.action, 'insert')
const after = db.prepare('SELECT count(*) n FROM memories').get().n
assert.equal(after, before + 1)
const row = db.prepare('SELECT * FROM memories ORDER BY id DESC LIMIT 1').get()
assert.equal(row.quote, '')
assert.equal(JSON.parse(row.meta).provenance, 'no-overlap')

// Current contract permits a candidate with no verbatim overlap to be stored,
// but explicitly labels it no-overlap. This test makes that policy visible;
// it does not assert that such a candidate is verified or safe for all uses.
console.log(JSON.stringify({
  ok: true,
  test: 'llm-no-overlap-provenance',
  action: result.action,
  provenance: JSON.parse(row.meta).provenance,
  quote: row.quote,
}))
