import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { graphCandidates, linkMemory } from '../lib/store/graph.js'
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

    const graph = graphCandidates(db, '鲸鱼', {
      asOf: at,
      preset: 'asOfHistory',
      includeUnknownHops: true,
    })
    assert.ok(graph.hop.has(unknownId), 'asOfHistory hop may admit the created_at approximation')
    assert.ok(graph.hopStrict.has(unknownId), 'strict diagnostic lane must retain the same missing-valid_from hop')

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


test('as-of recall does not mislabel approximate-valid keyword hits omitted by top-N', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-asof-topn-approx-'))
  const { db } = openDb(dir)
  const at = Date.UTC(2026, 0, 1)
  try {
    const seedId = await insertMemory(db, {
      kind: 'episode',
      text: '鲸鱼种子记录',
      scopeType: 'owner',
      validFrom: at - 2000,
      temporalKind: 'current',
      createdAt: at - 2000,
    })
    const approximateId = await insertMemory(db, {
      kind: 'episode',
      text: '鲸鱼没有显式起点但创建时间早于判定点',
      scopeType: 'owner',
      temporalKind: 'unknown',
      createdAt: at - 1000,
    })
    const rows = await recall(db, '鲸鱼', {
      asOf: at,
      vectors: null,
      gate: { semantic: 1, keyword: 0 },
      limit: 1,
      trackAccess: false,
    })
    assert.equal(rows.length, 1)
    assert.ok(rows.some((row) => Number(row.id) === seedId), '第一条候选应占据 top-N')
    assert.ok(!rows.some((row) => Number(row.id) === approximateId), '近似有效行因 top-N 被截断')
    assert.ok(!rows.uncertain.some((row) => Number(row.id) === approximateId),
      'top-N 截断不代表 unknown-validity；只有 graph unknownHop 才可产生该 reason')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
