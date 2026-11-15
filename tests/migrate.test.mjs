import { openDb } from '../lib/store/db.js'
import { applyAll } from '../lib/ingest/migrate.js'
import assert from 'node:assert'
import { rmSync } from 'node:fs'

// D1：迁移需要主人身份，测试用假号（源码里不写死真实号）
process.env.OWNER_QQ = '1000000001'

const dir = '/tmp/dy-mig-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)
const data = {
  facts: [{ kind: 'fact', text: '测试事实一', sourceKey: 'facts:1' }],
  todos: [{ kind: 'todo', text: '测试待办', sourceKey: 'pin:1' }],
  episodes: [{ kind: 'episode', text: '测试事件', sourceKey: 'chatlog:2026-10-30' }],
  handoffs: [],
}
const r1 = await applyAll(db, data, () => {})
const r2 = await applyAll(db, data, () => {})
assert.equal(r1.inserted, 3)
assert.equal(r2.inserted, 0, '二次 apply 应幂等')
assert.equal(db.prepare('SELECT count(*) c FROM memories').get().c, 3)
console.log(JSON.stringify({ ok: true, test: 'migrate', first: r1.inserted, second: r2.inserted }))
