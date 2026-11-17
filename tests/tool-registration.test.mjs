/**
 * 工具注册唯一性（2026-11-06）
 * 生产日志每次启动报：
 *   tool "dy_memory_contacts" is already registered
 *   tool "dy_memory_contact_merge" is already registered
 * 原因是 index.js 里 contacts/merge 两组 reg() 重复。本测试用「重复即抛」的宿主式
 * register 复现，确保启动不产生 already registered，且两个工具仍可用。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

process.env.DY_MEMORY_DIR = '/tmp/dy-toolreg-' + process.pid
const DIR = process.env.DY_MEMORY_DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { ensureContactsSchema, seedOwner, addContact } = await import('../lib/store/contacts.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { db } = openDb(DIR)
new RawArchive({ db, dir: join(DIR, 'raw'), log: { info() {}, warn() {} } })
ensureContactsSchema(db)
seedOwner(db, { ownerQQ: '1000000001' })
addContact(db, { id: 'contact:a', displayName: 'A' })
addContact(db, { id: 'contact:b', displayName: 'B' })

const registered = {}
const counts = new Map()
const warnings = []
const ctx = {
  get(n) {
    if (n === 'tools') {
      return {
        register(d) {
          counts.set(d.name, (counts.get(d.name) ?? 0) + 1)
          // 模拟宿主：同名第二次注册直接抛
          if (counts.get(d.name) > 1) throw new Error(`tool "${d.name}" is already registered`)
          registered[d.name] = d
        },
      }
    }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    return undefined
  },
  on() {},
  provide() { return () => {} },
  logger: { info() {}, warn: (m) => warnings.push(String(m)) },
}

const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: '1000000001' })

const out = { ok: true, test: 'tool-registration' }

// 1) 每个工具只注册一次；启动没有 already registered
assert.equal(counts.get('dy_memory_contacts'), 1, 'contacts 只能注册一次')
assert.equal(counts.get('dy_memory_contact_merge'), 1, 'contact_merge 只能注册一次')
for (const [name, n] of counts) assert.equal(n, 1, `${name} 注册了 ${n} 次`)
assert.ok(!warnings.some((m) => /already registered/.test(m)), `不允许 already registered 警告：${warnings.join(' | ')}`)
out.unique = { contacts: counts.get('dy_memory_contacts'), merge: counts.get('dy_memory_contact_merge') }

// 2) 两个工具仍可用
const exec = { agent: { session: { header: { cwd: '/root/qq-agent/QQ会话/私聊_1000000001', id: 'reg-1' } } } }
const list = JSON.parse((await registered.dy_memory_contacts.execute({}, exec)).detail)
assert.equal(list.ok, true)
assert.ok(list.items.some((x) => x.id === 'contact:a'))
const bad = JSON.parse((await registered.dy_memory_contact_merge.execute({ from: 'contact:x', to: 'contact:b' }, exec)).detail)
assert.equal(bad.ok, false)
db.prepare("INSERT INTO memories(kind,text,speaker_id,created_at_epoch,scope_type,scope_id) VALUES('fact','x','contact:a',?,'owner','')").run(Date.now())
const mg = JSON.parse((await registered.dy_memory_contact_merge.execute({ from: 'contact:a', to: 'contact:b' }, exec)).detail)
assert.equal(mg.ok, true)
assert.equal(mg.updated.speaker, 1)
out.usable = 'ok'

console.log(JSON.stringify(out))
process.exit(0)
