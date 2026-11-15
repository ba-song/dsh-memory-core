import { openDb } from '../lib/store/db.js'
import { DATA_DIR } from '../lib/config.js'
import { recall } from '../lib/recall/recall.js'
import { loadVectors } from '../lib/store/memories.js'
import { loadEmbed } from '../lib/embed/onnx.mjs'
import assert from 'node:assert'

const { db } = openDb(DATA_DIR)
await loadEmbed('/opt/qqai/models/bge-small-zh')
const vectors = loadVectors(db)
let checked = 0
for (const q of ['抖音', '五分钟', '主人']) {
  const rows = await recall(db, q, { vectors, limit: 5 })
  if (!rows.length) continue
  for (const r of rows) {
    assert.ok(r.scores.rrf > 0, 'rrf 应大于 0')
    assert.ok(r.scores.keyword >= 0 && r.scores.keyword <= 1, 'keyword ∈0–1')
    assert.ok(r.scores.semantic >= -1 && r.scores.semantic <= 1, 'semantic ∈-1–1')
  }
  assert.ok(rows[0].scores.rrf <= 0.05, 'RRF top 应在 0.01–0.05 量级: ' + rows[0].scores.rrf)
  checked += 1
}
console.log(JSON.stringify({ ok: true, test: 'scale', queries: checked }))
