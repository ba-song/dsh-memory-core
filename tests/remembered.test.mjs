import assert from 'node:assert'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { insertMemory } from '../lib/store/memories.js'
import { pickRemembered } from '../lib/inject/remembered.js'
import { buildStable } from '../lib/inject/stable.js'

const dir = '/tmp/dy-rem-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const now = Date.now()
const add = (text, kind = 'relation', validFrom = null) => insertMemory(db, {
  kind, text, importance: 0.6, status: 'active', validFrom,
})
await add('喜欢看海')
await add('爱吃海鲜')
await add('讨厌下雨')
await add('习惯晚睡')
await add('最怕冷')
await add('主人喜欢看海', 'fact')
await add('喜欢看海' + '和爬山'.repeat(20), 'relation')
await add('未来才生效的事', 'relation', now + 60_000)
const supersededId = await add('已经被替代的事')
db.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(999999, supersededId)
await insertMemory(db, { kind: 'preference', text: '长期偏好A', importance: 0.7, status: 'active', meta: { persist: true, persistence: 'long_term' } })
const r = pickRemembered(db, { now })
const block = r.block
assert.ok(block.startsWith('【记得的事】'))
assert.ok(block.endsWith('【记得的事结束】'))
assert.ok(block.includes('喜欢看海'))
assert.ok(!block.includes('[fact]'), 'fact 不进记得的事')
assert.ok(!block.includes('长期偏好A'), '长期 preference 不进入 remembered')
assert.ok(!block.includes('未来才生效的事'), 'future valid_from 不得进入当前注入')
assert.ok(!block.includes('已经被替代的事'), 'superseded 记录不得进入当前注入')
assert.ok(r.skipped.some((s) => s.reason === 'preference-managed-separately'), 'preference 应记录独立管理跳过原因')
assert.ok(block.length <= 400)
// 超长且截断在连接词 → 跳过
assert.ok(!block.includes('爬山和别的'), '截断在连接词应跳过')
// 与常驻块重复 → 跳过
const dup = pickRemembered(db, { stableText: '- 喜欢看海', now })
assert.ok(!dup.block.includes('喜欢看海') || dup.skipped.some((s) => s.reason === 'dup-stable'))

// buildStable 集成
const cwd = mkdtempSync('/tmp/dy-rem-cwd-')
writeFileSync(join(cwd, '事实卡.md'), '- 主人喜欢看海\n')
const stable = buildStable(cwd, { db })
assert.ok(stable.includes('【记得的事】'))
assert.ok(stable.includes('爱吃海鲜'))
assert.ok(!stable.includes('喜欢看海\n- [preference] 喜欢看海'), '事实卡里的偏好不重复进记得的事')

console.log(JSON.stringify({ ok: true, test: 'remembered', items: r.count, len: block.length }))
