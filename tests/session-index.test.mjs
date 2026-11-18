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
  await insertMemory(db, { kind: 'todo', text: '继续完成记忆插件 M3-1 评测。', createdAt: now - 500 })
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
  assert.ok(!block.includes('pending 经历'))
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
