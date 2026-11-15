import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { noticeMessage } from '../lib/inject/notice.js'

const a = noticeMessage('【记忆·本轮相关】x', '本轮相关记忆')
const b = noticeMessage('【相关原话】y', '相关原话')
assert.match(a.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
assert.match(b.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
assert.notEqual(a.id, b.id)
assert.equal(a.role, 'user')
assert.equal(a.source.kind, 'plugin:dy-memory')
assert.equal(a.content[0].text, '【记忆·本轮相关】x')

// 防止以后新增注入点绕过 helper：plugin:dy-memory 只允许出现在 notice.js
const dir = new URL('../lib', import.meta.url).pathname
const hits = []
function walk(d) {
  for (const ent of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, ent.name)
    if (ent.isDirectory()) { walk(p); continue }
    if (!p.endsWith('.js')) continue
    const s = readFileSync(p, 'utf8')
    if (s.includes('plugin:dy-memory')) hits.push(p.replace(dir + '/', ''))
  }
}
walk(dir)
assert.deepEqual(hits, ['inject/notice.js'], 'dy-memory 注入必须统一走 noticeMessage')

console.log(JSON.stringify({ ok: true, test: 'notice', ids: 2, files: hits }))
