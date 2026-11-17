/**
 * 存量隔离脚本 `scripts/quarantine-memories.mjs`（2026-11-06）
 *
 * 生产背景：模型兜底抽出 id 61/62 角色错乱；要把它们标 `pending`（不删、不活跃、可审计），
 * 且**写前必须有整库备份**。测试在 /tmp 建库，验证：
 *   - dry-run 不写、不备份；
 *   - --apply 生成 VACUUM INTO 备份（integrity=ok，备份里两行仍是 active）；
 *   - 主库两行变 pending、meta 留审计字段，合法记忆保持 active；
 *   - pending 不参与检索；
 *   - 幂等：再跑一次 updated=0。
 */
import assert from 'node:assert'
import { existsSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const DIR = '/tmp/dy-quarantine-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { recall } = await import('../lib/recall/recall.js')
const { DatabaseSync } = await import('node:sqlite')

const { db } = openDb(DIR)
const badA = await insertMemory(db, { kind: 'relation', text: '隔离测试：说话人是听者的父亲，会供养听者', layer: 'auto', extractorVersion: 'p4-llm-v1', importance: 0.8, confidence: 0.8 })
const badB = await insertMemory(db, { kind: 'preference', text: '隔离测试：主人不介意对方多唠叨一些', layer: 'auto', extractorVersion: 'p4-llm-v1', importance: 0.6, confidence: 0.6 })
const good = await insertMemory(db, { kind: 'fact', text: '隔离测试：主人的生日是12月2号', layer: 'auto', extractorVersion: 'p4-llm-v1', importance: 0.9, confidence: 0.95 })

const SCRIPT = new URL('../scripts/quarantine-memories.mjs', import.meta.url).pathname
const runScript = (extra = []) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--db', join(DIR, 'memory.db'), '--ids', `${badA},${badB}`, ...extra], { encoding: 'utf8' })
  let json = null
  try { json = JSON.parse(r.stdout) } catch {}
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

const statusOf = (id) => db.prepare('SELECT status FROM memories WHERE id=?').get(id)?.status
const out = { ok: true, test: 'quarantine' }

// 1) dry-run：不写、不备份
{
  const r = runScript(['--json'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.dryRun, true)
  assert.equal(r.json.updated, 0)
  assert.equal(r.json.backup, null)
  assert.equal(statusOf(badA), 'active')
  assert.equal(statusOf(badB), 'active')
  out.dryRun = 'ok'
}

// 2) --apply：先备份再改；备份里仍是 active，主库变 pending
{
  const r = runScript(['--reason', 'test-llm-role-pronoun', '--apply', '--json'])
  assert.equal(r.status, 0, r.stderr || r.stdout)
  const j = r.json
  assert.equal(j.ok, true)
  assert.equal(j.dryRun, false)
  assert.equal(j.updated, 2)
  assert.ok(j.backup?.path && existsSync(j.backup.path), '备份必须存在')
  assert.ok(statSync(j.backup.path).size > 0, '备份不能是空文件')
  assert.equal(j.backup.integrity, 'ok', '备份 integrity_check 必须 ok')
  assert.deepEqual([...j.backup.activeIds].sort((a, b) => a - b), [badA, badB].sort((a, b) => a - b), '备份应是写前状态')
  assert.deepEqual(j.after.map((x) => x.status), ['pending', 'pending'])

  // 备份库内容：两行 active 且正文还在
  const bdb = new DatabaseSync(j.backup.path, { readOnly: true })
  try {
    const rows = bdb.prepare('SELECT id,status,text FROM memories WHERE id IN (?,?) ORDER BY id').all(badA, badB)
    assert.equal(rows.length, 2)
    assert.ok(rows.every((x) => x.status === 'active'), '备份里应保留写前 active')
    assert.ok(rows.every((x) => String(x.text).startsWith('隔离测试：')))
  } finally { bdb.close() }

  // 主库：pending + meta 审计；合法记忆不动
  assert.equal(statusOf(badA), 'pending')
  assert.equal(statusOf(badB), 'pending')
  assert.equal(statusOf(good), 'active')
  const meta = JSON.parse(db.prepare('SELECT meta FROM memories WHERE id=?').get(badA).meta)
  assert.equal(meta.quarantined, true)
  assert.equal(meta.quarantineReason, 'test-llm-role-pronoun')
  assert.ok(Number(meta.quarantinedAt) > 0)
  out.apply = { backup: j.backup.path, activeInBackup: j.backup.activeIds, updated: j.updated }
}

// 3) pending 不参与检索
{
  const hits = await recall(db, '隔离测试', { vectors: new Map(), gate: { semantic: 0.55, keyword: 0.1 }, limit: 10 })
  assert.equal(hits.length, 1, '只应检索到 active 的合法记忆')
  assert.match(hits[0].text, /生日/, 'pending 的两条不许返回')
  out.recall = 'ok'
}

// 4) 幂等：再跑一次没有 active 行 → updated=0、不重复备份
{
  const r = runScript(['--apply', '--json'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.updated, 0)
  assert.equal(r.json.backup, null)
  assert.equal(statusOf(badA), 'pending')
  out.idempotent = 'ok'
}

console.log(JSON.stringify(out))
