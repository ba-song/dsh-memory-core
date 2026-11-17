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
const add = (text, kind = 'preference') => insertMemory(db, { kind, text, importance: 0.6, status: 'active' })
await add('喜欢看海')
await add('爱吃海鲜')
await add('讨厌下雨')
await add('习惯晚睡')
await add('最怕冷')
await add('主人喜欢看海', 'fact')
await add('喜欢看海' + '和爬山'.repeat(20), 'preference')
const r = pickRemembered(db)
const block = r.block
assert.ok(block.startsWith('【记得的事】'))
assert.ok(block.endsWith('【记得的事结束】'))
assert.ok(block.includes('喜欢看海'))
assert.ok(!block.includes('[fact]'), 'fact 不进记得的事')
assert.ok(block.length <= 400)
// 超长且截断在连接词 → 跳过
assert.ok(!block.includes('爬山和别的'), '截断在连接词应跳过')
// 与常驻块重复 → 跳过
const dup = pickRemembered(db, { stableText: '- 喜欢看海' })
assert.ok(!dup.block.includes('喜欢看海') || dup.skipped.some((s) => s.reason === 'dup-stable'))

// buildStable 集成
const cwd = mkdtempSync('/tmp/dy-rem-cwd-')
writeFileSync(join(cwd, '事实卡.md'), '- 主人喜欢看海\n')
const stable = buildStable(cwd, { db })
assert.ok(stable.includes('【记得的事】'))
assert.ok(stable.includes('爱吃海鲜'))
assert.ok(!stable.includes('喜欢看海\n- [preference] 喜欢看海'), '事实卡里的偏好不重复进记得的事')

console.log(JSON.stringify({ ok: true, test: 'remembered', items: r.count, len: block.length }))
