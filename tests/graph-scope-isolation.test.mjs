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
    const now = Date.now()
    const expiredId = await insertMemory(db, {
      kind: 'episode', text: '鲸鱼以前去过海边', scopeType: 'public',
      validFrom: now - 10000, validTo: now - 1000, temporalKind: 'historical',
    })
    const futureId = await insertMemory(db, {
      kind: 'episode', text: '鲸鱼计划未来去看海', scopeType: 'public',
      validFrom: now + 1000, temporalKind: 'current',
    })
    const inactiveId = await insertMemory(db, {
      kind: 'episode', text: '鲸鱼已归档的旧记录', scopeType: 'public', status: 'archived',
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

    const restricted = graphCandidates(db, '鲸鱼', { scope: external })
    assert.deepEqual(restricted.direct, [])
    assert.equal(restricted.hop.has(publicId), false)
    assert.equal(restricted.direct.includes(expiredId), false)
    assert.equal(restricted.direct.includes(futureId), false)
    assert.equal(restricted.direct.includes(inactiveId), false)

    const historical = graphCandidates(db, '鲸鱼', { scope: external, asOf: now - 5000 })
    assert.ok(historical.direct.includes(expiredId), '历史 as-of 应包含当时有效的经历')
    assert.equal(historical.direct.includes(futureId), false)
    const future = graphCandidates(db, '鲸鱼', { scope: external, asOf: now + 5000 })
    assert.ok(future.direct.includes(futureId), '未来 as-of 应包含未来有效记录')

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
