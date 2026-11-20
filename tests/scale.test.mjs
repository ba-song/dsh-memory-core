import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { recall } from '../lib/recall/recall.js'
import assert from 'node:assert/strict'

// 纯隔离压测：不读取 DATA_DIR/生产库，不加载本地 BGE 模型，不写 access_count。
const dir = mkdtempSync(join(tmpdir(), 'dsh-recall-scale-'))
const { db } = openDb(dir)
try {
  for (let i = 0; i < 120; i++) {
    await insertMemory(db, { kind: 'episode', text: '抖音 五分钟 主人 记录编号 ' + i, layer: 'auto' })
  }
  let checked = 0
  for (const q of ['抖音', '五分钟', '主人']) {
    const rows = await recall(db, q, { vectors: null, limit: 5, trackAccess: false })
    if (!rows.length) continue
    for (const row of rows) {
      assert.ok(row.scores.rrf > 0, 'rrf 应大于 0')
      assert.ok(row.scores.keyword >= 0 && row.scores.keyword <= 1, 'keyword ∈0–1')
      assert.ok(row.scores.semantic >= -1 && row.scores.semantic <= 1, 'semantic ∈-1–1')
    }
    assert.ok(rows[0].scores.rrf <= 0.05, 'RRF top 应在 0.01–0.05 量级: ' + rows[0].scores.rrf)
    checked += 1
  }
  assert.equal(checked, 3, '三个关键词查询都应命中隔离样本')
  console.log(JSON.stringify({ ok: true, test: 'scale', queries: checked, fixtureMemories: 120, productionDb: false }))
} finally {
  db.close()
  rmSync(dir, { recursive: true, force: true })
}
