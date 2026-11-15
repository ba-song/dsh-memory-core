/**
 * 群记忆注入（2026-11-09）：buildStable 只给本群注入最近 episode，别的群看不到。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'

const DIR = `/tmp/dy-group-inject-${process.pid}`
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { buildStable } = await import('../lib/inject/stable.js')
const { scopeForSession } = await import('../lib/scope.js')

const { db } = openDb(DIR)
const cwd1 = '/sdcard/DSHA/渠道/qq-群/111'
const cwd2 = '/sdcard/DSHA/渠道/qq-群/222'

await insertMemory(db, {
  kind: 'episode', text: '甲：今晚打本吗\n我：来', layer: 'auto',
  scopeType: 'group', scopeId: 'qq:111', sourceChannel: 'qq-group',
  sourceMsgId: 'group-turn:111:1', extractorVersion: 'group-turn-v1',
  sourceTs: Date.now(), importance: 0.35, confidence: 0.6,
})
await insertMemory(db, {
  kind: 'episode', text: '乙：明天考试\n我：加油', layer: 'auto',
  scopeType: 'group', scopeId: 'qq:222', sourceChannel: 'qq-group',
  sourceMsgId: 'group-turn:222:1', extractorVersion: 'group-turn-v1',
  sourceTs: Date.now(), importance: 0.35, confidence: 0.6,
})

const opts = (cwd) => ({ db, factsPath: '/nonexistent/facts.md', scope: scopeForSession({ cwd }) })

const b1 = buildStable(cwd1, opts(cwd1))
const b2 = buildStable(cwd2, opts(cwd2))
const owner = buildStable('/sdcard/DSHA/生活/数据/home', { db, factsPath: '/nonexistent/facts.md', scope: scopeForSession({ cwd: '/sdcard/DSHA/生活/数据/home', isOwner: true }) })

assert.ok(b1.includes('【这个群最近的事】'), '本群应有群记忆块')
assert.ok(b1.includes('今晚打本'), '本群应看到自己的记忆')
assert.ok(!b1.includes('明天考试'), '本群不该看到别的群')
assert.ok(b2.includes('明天考试') && !b2.includes('今晚打本'), '群 222 只看到自己的')
assert.ok(!owner.includes('【这个群最近的事】'), 'owner/home 不注入群记忆块')

db.close()
console.log('group-inject ok')
