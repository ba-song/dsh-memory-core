/**
 * P0 scope 迁移（2026-11-06）
 * 造一个「旧 schema（无 scope 两列）」库 + 34 行，验证脚本：dry-run 不写、
 * --apply 先 VACUUM INTO 备份再 ALTER/回填、备份仍是旧 schema、迁移后 34 行全 owner。
 */
import assert from 'node:assert'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DIR = '/tmp/dy-scope-migrate-' + process.pid
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })
const dbPath = join(DIR, 'memory.db')

// 旧 schema（没有 scope_type/scope_id），与迁移前的生产表一致
const OLD_DDL = `CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'episode',
  text TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  clarity TEXT NOT NULL DEFAULT 'clear',
  importance REAL NOT NULL DEFAULT 0.5,
  subject TEXT NOT NULL DEFAULT '',
  attribute TEXT NOT NULL DEFAULT '',
  speaker_id TEXT NOT NULL DEFAULT '',
  conversation_scope TEXT NOT NULL DEFAULT '',
  owner_scope TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT 'owner',
  visibility TEXT NOT NULL DEFAULT 'owner',
  visibility_reason TEXT NOT NULL DEFAULT '',
  visibility_set_by TEXT NOT NULL DEFAULT '',
  visibility_set_at INTEGER NOT NULL DEFAULT 0,
  source_msg_id TEXT NOT NULL DEFAULT '',
  source_ts INTEGER NOT NULL DEFAULT 0,
  source_file TEXT NOT NULL DEFAULT '',
  extractor_version TEXT NOT NULL DEFAULT '',
  created_at_epoch INTEGER NOT NULL,
  last_access_epoch INTEGER NOT NULL DEFAULT 0,
  access_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  pinned INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 1.0,
  layer TEXT NOT NULL DEFAULT 'manual',
  meta TEXT NOT NULL DEFAULT '{}'
)`

const db = new DatabaseSync(dbPath)
db.exec(OLD_DDL)
const ins = db.prepare("INSERT INTO memories(kind,text,created_at_epoch,status,layer,confidence) VALUES('fact',?,?,'active','auto',0.8)")
for (let i = 1; i <= 34; i++) ins.run(`迁移样本 ${i}`, Date.now() - i * 1000)
db.close()

const SCRIPT = new URL('../scripts/migrate-scope.mjs', import.meta.url).pathname
const run = (extra = []) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--db', dbPath, '--json', ...extra], { encoding: 'utf8' })
  let json = null
  try { json = JSON.parse(r.stdout) } catch {}
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}
const out = { ok: true, test: 'scope-migrate' }

// 1) dry-run：不写、不备份
{
  const r = run()
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.dryRun, true)
  assert.equal(r.json.before.total, 34)
  assert.equal(r.json.before.needMigrate, true)
  assert.equal(r.json.backup, null)
  const d = new DatabaseSync(dbPath, { readOnly: true })
  const cols = d.prepare('PRAGMA table_info(memories)').all().map((c) => c.name)
  d.close()
  assert.ok(!cols.includes('scope_type'), 'dry-run 不许改 schema')
  out.dryRun = 'ok'
}

// 2) apply：备份 → ALTER → 回填 owner
{
  const r = run(['--apply'])
  assert.equal(r.status, 0, r.stderr || r.stdout)
  const j = r.json
  assert.equal(j.ok, true)
  assert.equal(j.dryRun, false)
  assert.deepEqual([...j.altered].sort(), ['scope_id', 'scope_type'])
  assert.ok(j.backup?.path && existsSync(j.backup.path), '备份必须存在')
  assert.ok(statSync(j.backup.path).size > 0)
  assert.equal(j.backup.integrity, 'ok')
  assert.equal(j.after.total, 34)
  assert.deepEqual(j.after.scope, { owner: 34 }, '34 条必须全是 owner')

  // 备份库仍是旧 schema（证明是写前快照）
  const b = new DatabaseSync(j.backup.path, { readOnly: true })
  const bcols = b.prepare('PRAGMA table_info(memories)').all().map((c) => c.name)
  assert.ok(!bcols.includes('scope_type'), '备份应是迁移前 schema')
  assert.equal(b.prepare('SELECT count(*) c FROM memories').get().c, 34)
  b.close()

  // 主库两列 + 全部 owner
  const d = new DatabaseSync(dbPath, { readOnly: true })
  try {
    assert.deepEqual(d.prepare('SELECT scope_type,count(*) c FROM memories GROUP BY scope_type').all().map((x) => [x.scope_type, x.c]), [['owner', 34]])
    const idx = d.prepare('PRAGMA index_list(memories)').all().map((i) => i.name)
    assert.ok(idx.includes('idx_mem_scope_key'))
  } finally { d.close() }
  out.apply = { backup: j.backup.path, counts: j.after.scope }
}

// 3) 迁移后的库能被 openDb 正常打开；新行默认 owner
{
  process.env.DY_MEMORY_DIR = DIR
  const { openDb } = await import('../lib/store/db.js')
  const { db: d } = openDb(DIR)
  assert.equal(d.prepare('SELECT count(*) c FROM memories WHERE scope_type=?').get('owner').c, 34)
  const { insertMemory } = await import('../lib/store/memories.js')
  const id = await insertMemory(d, { kind: 'fact', text: '迁移后新写入' })
  const row = d.prepare('SELECT scope_type,scope_id FROM memories WHERE id=?').get(id)
  assert.deepEqual(row, { scope_type: 'owner', scope_id: '' })
  d.close()
  out.openDb = 'ok'
}

console.log(JSON.stringify(out))
