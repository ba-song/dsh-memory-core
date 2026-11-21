import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { buildSessionIndex, shouldInjectSessionIndex } from '../lib/inject/session-index.js'

const dir = '/tmp/dy-m3-session-index-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
try {
  const now = Date.now()
  await insertMemory(db, { kind: 'episode', text: '主人和汐讨论过一起去看海的约定与准备。', createdAt: now - 1000 })
  await insertMemory(db, { kind: 'episode', text: '这条 pending 经历不应出现在索引。', createdAt: now, status: 'pending' })
  await insertMemory(db, { kind: 'episode', text: '群聊经历不应进入 owner 索引。', createdAt: now, scopeType: 'group', scopeId: 'qq:123456' })
  await insertMemory(db, { kind: 'todo', text: '已经过期的待办不应进入索引。', createdAt: now - 1000, validTo: now - 1 })
  await insertMemory(db, { kind: 'todo', text: '继续完成记忆插件 M3-1 评测。', createdAt: now - 500 })
  await insertMemory(db, { kind: 'todo', text: 'legacy 空状态待办应保留。', createdAt: now - 400, status: '' })
  await insertMemory(db, { kind: 'todo', text: 'legacy NULL 状态待办不属于 session-index 原有状态域。', createdAt: now - 300, status: null })
  const futureEpisode = await insertMemory(db, { kind: 'episode', text: '未来经历不应进入索引。', createdAt: now - 200, validFrom: now + 60_000 })
  const supersededEpisode = await insertMemory(db, { kind: 'episode', text: '已替代经历不应进入索引。', createdAt: now - 100 })
  db.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(999999, supersededEpisode)
  db.exec(`CREATE TABLE decisions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', choice TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'decided', decided_at INTEGER NOT NULL DEFAULT 0
  )`)
  db.prepare('INSERT INTO decisions(id,title,choice,status,decided_at) VALUES(?,?,?,?,?)')
    .run('d1', '一起看海', '天气合适时出发', 'decided', now)

  const before = Number(db.prepare('SELECT total_changes() c').get().c)
  const block = buildSessionIndex(db, { now, episodes: 3, agreements: 2, maxChars: 300 })
  const after = Number(db.prepare('SELECT total_changes() c').get().c)
  assert.equal(after, before, '构建索引必须只读')
  assert.ok(block.includes('【跨会话经历】'))
  assert.ok(block.includes('一起去看海'))
  assert.ok(block.includes('约定：一起看海'))
  assert.ok(block.includes('M3-1 评测'))
  assert.ok(block.includes('legacy 空状态待办'))
  assert.ok(!block.includes('legacy NULL 状态待办'))
  assert.ok(!block.includes('未来经历不应进入索引'))
  assert.ok(!block.includes('已替代经历不应进入索引'))
  assert.ok(!block.includes('pending 经历'))
  assert.ok(!block.includes('群聊经历'))
  assert.ok(!block.includes('已经过期'))
  assert.ok(block.length <= 300)

  const injected = new Set()
  const args = { owner: true, enabled: true, turn: 1, step: 1, sid: 'owner-session', injected }
  assert.equal(shouldInjectSessionIndex(args), true)
  injected.add(args.sid)
  assert.equal(shouldInjectSessionIndex(args), false, '同一 sid 只注入一次')
  assert.equal(shouldInjectSessionIndex({ ...args, sid: 'group-session', owner: false, injected: new Set() }), false, '非 owner 不注入')
  assert.equal(shouldInjectSessionIndex({ ...args, turn: 2, injected: new Set() }), false)
  assert.equal(shouldInjectSessionIndex({ ...args, step: 2, injected: new Set() }), false)
  console.log(JSON.stringify({ ok: true, test: 'session-index', chars: block.length }))
} finally {
  db.close()
  rmSync(dir, { recursive: true, force: true })
}
