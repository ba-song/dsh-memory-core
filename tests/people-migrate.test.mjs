/**
 * people 迁移脚本（2026-11-07）：备份 → 加 person_id → owner QQ/邮箱绑定 person:owner。
 */
import assert from 'node:assert'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DIR = '/tmp/dy-people-migrate-' + process.pid
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })
const dbPath = join(DIR, 'memory.db')
const OWNER_QQ = '1000000001'

const { openDb } = await import('../lib/store/db.js')
const { ensureContactsSchema, seedOwner } = await import('../lib/store/contacts.js')
const { db } = openDb(DIR)
ensureContactsSchema(db)
seedOwner(db, { ownerQQ: OWNER_QQ })
db.close()

const SCRIPT = new URL('../scripts/migrate-people.mjs', import.meta.url).pathname
const run = (extra = []) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--db', dbPath, '--owner-qq', OWNER_QQ, '--owner-emails', 'owner@example.com', '--json', ...extra], { encoding: 'utf8' })
  let json = null
  try { json = JSON.parse(r.stdout) } catch {}
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}
const out = { ok: true, test: 'people-migrate' }

// 1) dry-run
{
  const r = run()
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.dryRun, true)
  assert.equal(r.json.before.hasPerson, false)
  assert.equal(r.json.before.bindings.length, 1)
  assert.equal(r.json.backup, null)
  out.dryRun = 'ok'
}

// 2) apply：备份、加列、owner 三地址
{
  const r = run(['--apply'])
  assert.equal(r.status, 0, r.stderr || r.stdout)
  const j = r.json
  assert.equal(j.ok, true)
  assert.ok(j.backup?.path && existsSync(j.backup.path))
  assert.ok(statSync(j.backup.path).size > 0)
  assert.equal(j.backup.integrity, 'ok')
  assert.equal(j.after.hasPerson, true)
  assert.equal(j.after.bindings.length, 3, 'QQ + 两个邮箱')
  for (const b of j.after.bindings) assert.equal(String(b.person_id), 'person:owner')

  // 备份是迁移前 schema
  const b = new DatabaseSync(j.backup.path, { readOnly: true })
  const cols = b.prepare('PRAGMA table_info(contact_bindings)').all().map((c) => c.name)
  assert.ok(!cols.includes('person_id'))
  assert.equal(b.prepare('SELECT count(*) c FROM contact_bindings').get().c, 1)
  b.close()
  out.apply = { backup: j.backup.path, bindings: j.after.bindings.length }
}

// 3) 幂等
{
  const r = run(['--apply'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.after.bindings.length, 3)
  const ids = new Set(r.json.after.bindings.map((b) => b.id))
  assert.equal(ids.size, 3)
  out.idempotent = 'ok'
}

console.log(JSON.stringify(out))
