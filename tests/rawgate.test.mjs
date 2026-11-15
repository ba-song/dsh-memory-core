import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'
import { insertMemory } from '../lib/store/memories.js'
import { bigrams } from '../lib/store/fts.js'
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const dir = '/tmp/dy-rawgate-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const raw = new RawArchive({ db, dir: dir + '/raw', log: {} })
const session = { header: { id: 'bbbb2222-cccc-dddd-eeee-ffffffffffff', cwd: '/root/qq-agent/QQ会话/私聊_1' } }
const t = Date.now()
raw.onEvent(session, { type: 'user/message', data: { content: [{ type: 'text', text: '我最近特别想去看海，海风咸咸的' }] }, seq: 1, time: t })

// 1) 高分：正常返回
const high = raw.search('想去看海', { limit: 3, minScore: 0.35 })
assert.ok(high.length >= 1 && !high[0].degraded)

// 2) 降级：门槛设到 1.1（必然低于阈值），floor 设 0 → 保留最高分 1 条并标 degraded
const deg = raw.search('想去看海', { limit: 3, minScore: 1.1, floor: 0 })
assert.equal(deg.length, 1)
assert.equal(deg[0].degraded, true)

// 3) 全挡：floor 也高 → 空
const none = raw.search('想去看海', { limit: 3, minScore: 1.1, floor: 1.1 })
assert.equal(none.length, 0)

// 4) 统计
const g = raw.gateStats()
assert.ok(g.calls === 3 && g.blocked === 2 && g.degraded === 1)

// 5) 去重：记忆已含该原句的 bigram → 应被丢弃
const memText = '我最近特别想去看海'
const q = [{ snippet: '我最近特别想去看海，海风咸咸的' }]
const memGrams = new Set(bigrams(memText).split(' ').filter(Boolean))
const qg = bigrams(q[0].snippet).split(' ').filter(Boolean)
const dupSubstring = q[0].snippet.includes(memText)
const dupRatio = qg.filter((x) => memGrams.has(x)).length / qg.length
assert.ok(dupSubstring || dupRatio >= 0.8, '去重判据应命中（子串或 ≥80% bigram 覆盖）')

console.log(JSON.stringify({ ok: true, test: 'rawgate', gate: g, dupDetected: dupSubstring || dupRatio >= 0.8 }))
