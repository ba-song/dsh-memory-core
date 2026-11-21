import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { linkMemory } from '../lib/store/graph.js'
import { recall } from '../lib/recall/recall.js'

test('as-of recall reports graph-only unknown-validity neighbours as uncertain', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-asof-graph-unknown-'))
  const { db } = openDb(dir)
  const at = Date.UTC(2026, 0, 1)
  try {
    const seedId = await insertMemory(db, {
      kind: 'episode',
      text: '鲸鱼和主人一起讨论了海边旅行',
      scopeType: 'owner',
      validFrom: at - 1000,
      temporalKind: 'current',
    })
    const unknownId = await insertMemory(db, {
      kind: 'episode',
      text: '主人曾经提到一件没有时间标注的往事',
      scopeType: 'owner',
      // 2026-11-21 复核修正：必须创建于判定时点之前，否则属于「当时尚未创建」而不是「判不了」
      createdAt: at - 1000,
    })
    linkMemory(db, seedId, '鲸鱼和主人一起讨论了海边旅行', at)
    linkMemory(db, unknownId, '主人曾经提到一件没有时间标注的往事', at)

    const rows = await recall(db, '鲸鱼', {
      asOf: at,
      vectors: null,
      gate: { semantic: 1, keyword: 1 },
      trackAccess: false,
    })
    assert.ok(rows.some((row) => Number(row.id) === seedId))
    assert.ok(rows.uncertain.some((row) => Number(row.id) === unknownId))
    assert.equal(rows.uncertain.find((row) => Number(row.id) === unknownId).reason, 'unknown-validity')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
