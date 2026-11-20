import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { linkMemory, graphCandidates } from '../lib/store/graph.js'
import { recall } from '../lib/recall/recall.js'
import { scopeForSession } from '../lib/scope.js'

test('graph traversal cannot use out-of-scope memories as seeds or hops', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-graph-scope-'))
  const { db } = openDb(dir)
  try {
    const privateId = await insertMemory(db, {
      kind: 'episode', text: '鲸鱼曾和主人约定一起看海', scopeType: 'owner',
    })
    const publicId = await insertMemory(db, {
      kind: 'fact', text: '主人公开表达过喜欢海边', scopeType: 'public',
    })
    linkMemory(db, privateId, '鲸鱼曾和主人约定一起看海')
    linkMemory(db, publicId, '主人公开表达过喜欢海边')

    const external = scopeForSession({
      cwd: '/sdcard/DSHA/渠道/douyin/123',
      sessionId: 'graph-scope-test',
      isOwner: false,
    })
    const allowed = new Set(db.prepare(
      "SELECT id FROM memories WHERE status='active' AND (scope_type IN ('core','public') OR (scope_type='contact' AND scope_id='douyin:123'))",
    ).all().map((row) => Number(row.id)))

    const unrestricted = graphCandidates(db, '鲸鱼')
    assert.ok(unrestricted.direct.includes(privateId))
    assert.ok(unrestricted.hop.has(publicId), '对照组应能看到跨记忆关联')

    const restricted = graphCandidates(db, '鲸鱼', { allowedIds: allowed })
    assert.deepEqual(restricted.direct, [])
    assert.equal(restricted.hop.has(publicId), false)

    let graphArms = null
    await recall(db, '鲸鱼', {
      vectors: null,
      scope: external,
      gate: { semantic: 1, keyword: 1 },
      monitor: { record(value) { graphArms = value.arms.graph } },
      trackAccess: false,
    })
    assert.deepEqual(graphArms, [], 'recall 的图谱候选不应经过 owner 私有记忆')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
