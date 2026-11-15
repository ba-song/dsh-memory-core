#!/usr/bin/env node
/**
 * 阶段 3 离线迁移（**只写不跑**：默认 dry-run，必须显式 --apply）
 *
 *   node scripts/migrate-stage3.mjs --task contacts|roles|speaker|channels|all [--apply] [--db <path>]
 *
 * 约束：
 * - 本脚本不会自动被插件调用；生产执行由统筹者按《阶段3迁移RUNBOOK.md》操作
 * - 默认 dry-run 只读统计，不改库
 * - speaker 迁移只把「裸 owner QQ」映射到 contact:owner；其他裸 ID 只报告，不猜
 * - 每个 task 写入后打 meta 标记，便于定向回滚
 */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { DATA_DIR, loadConfig, resolveOwner } from '../lib/config.js'
import { ensureContactsSchema, hasContactsSchema, seedOwner } from '../lib/store/contacts.js'
import { ROLE } from '../lib/roles.js'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(`--${f}`)
const arg = (name, def = '') => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const apply = has('apply')
const task = arg('task', 'all')
const dbPath = arg('db', join(DATA_DIR, 'memory.db'))
if (!existsSync(dbPath)) {
  console.error(JSON.stringify({ ok: false, error: `数据库不存在：${dbPath}` }))
  process.exit(1)
}

const cfg = loadConfig()
const owner = resolveOwner(cfg)
// dry-run 用只读连接：保证「只看」不产生任何写（含 WAL）
const db = new DatabaseSync(dbPath, { readOnly: !apply })
const out = { ok: true, mode: apply ? 'apply' : 'dry-run', db: dbPath.replace(/.*\//, ''), task, ownerConfigured: owner.ok, tasks: {} }
const fail = (m) => { out.ok = false; out.error = m; console.log(JSON.stringify(out, null, 2)); process.exit(1) }
const rows = (sql, ...p) => { try { return db.prepare(sql).all(...p) } catch { return [] } }
const one = (sql, ...p) => { try { return db.prepare(sql).get(...p) } catch { return undefined } }
const meta = (k) => one('SELECT v FROM meta WHERE k=?', k)?.v
const setMeta = (k, v) => db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run(k, String(v))

const cols = (table) => rows(`PRAGMA table_info(${table})`).map((c) => String(c.name))

// ── contacts ────────────────────────────────────────────────────
function runContacts() {
  const r = { hasSchema: hasContactsSchema(db), ownerQQSet: Boolean(owner.ownerQQ), planned: [], applied: [] }
  if (!owner.ok || !owner.ownerQQ) return { ...r, skipped: 'owner 未配置（ownerQQ / ownerPrivateDir）' }
  if (!r.hasSchema) r.planned.push('CREATE TABLE contacts / contact_bindings / contact_notes + 索引')
  const existing = r.hasSchema ? one('SELECT id FROM contact_bindings WHERE channel=? AND external_id=?', 'qq', owner.ownerQQ) : null
  r.planned.push(existing ? `更新 owner 绑定（binding#${existing.id}）` : '建立 contact:owner + qq 绑定（唯一约束 channel+external_id）')
  if (apply) {
    ensureContactsSchema(db)
    const s = seedOwner(db, { ownerQQ: owner.ownerQQ, channel: 'qq', displayName: '主人' })
    r.applied.push({ contactId: s.contactId, bindingId: s.bindingId, created: s.created })
    setMeta('stage3_contacts_at', Date.now())
  }
  r.after = apply ? { contacts: one('SELECT count(*) c FROM contacts').c, bindings: one('SELECT count(*) c FROM contact_bindings').c } : undefined
  return r
}

// ── roles ───────────────────────────────────────────────────────
function runRoles() {
  const legacy = rows("SELECT role, count(*) c FROM raw_meta WHERE role IN ('主人','你','汐','她','汐·想','想') GROUP BY role")
  const total = legacy.reduce((s, x) => s + x.c, 0)
  const r = { legacyRows: total, byRole: legacy, planned: total ? [`UPDATE raw_meta：${total} 行旧角色 → 语义角色`] : [], applied: [] }
  if (apply && total) {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare("UPDATE raw_meta SET role='user' WHERE role IN ('主人','你')").run()
      db.prepare("UPDATE raw_meta SET role='self' WHERE role IN ('汐','她')").run()
      db.prepare("UPDATE raw_meta SET role='self-thought' WHERE role IN ('汐·想','想')").run()
      db.exec('COMMIT')
      setMeta('stage3_roles_at', Date.now())
      r.applied.push('raw_meta.role → user/self/self-thought')
    } catch (e) { try { db.exec('ROLLBACK') } catch {}; fail(`roles 迁移失败：${e?.message ?? e}`) }
  }
  r.after = apply ? rows('SELECT role, count(*) c FROM raw_meta WHERE role IN (?,?,?) GROUP BY role', ROLE.USER, ROLE.SELF, ROLE.SELF_THOUGHT) : undefined
  return r
}

// ── speaker（memories.speaker_id 去裸号）────────────────────────
function runSpeaker() {
  const bare = rows("SELECT speaker_id, count(*) c FROM memories WHERE speaker_id GLOB '[0-9]*' AND speaker_id<>'' GROUP BY speaker_id")
  const r = { bareIds: bare.length, rows: bare.reduce((s, x) => s + x.c, 0), planned: [], applied: [] }
  if (!bare.length) return r
  const ownerRow = bare.find((x) => x.speaker_id === owner.ownerQQ)
  const others = bare.filter((x) => x.speaker_id !== owner.ownerQQ)
  const mask = (v) => `***${String(v).slice(-2)}`
  if (ownerRow) r.planned.push(`memories.speaker_id ${mask(ownerRow.speaker_id)} → contact:owner（${ownerRow.c} 行）`)
  if (others.length) r.unmapped = others.map((x) => ({ id: `***${String(x.speaker_id).slice(-2)}`, rows: x.c }))
  if (apply && ownerRow) {
    db.prepare("UPDATE memories SET speaker_id='contact:owner' WHERE speaker_id=?").run(owner.ownerQQ)
    setMeta('stage3_speaker_at', Date.now())
    r.applied.push(`owner 裸号 → contact:owner（${ownerRow.c} 行）`)
  }
  r.after = apply ? { bareLeft: one("SELECT count(*) c FROM memories WHERE speaker_id GLOB '[0-9]*' AND speaker_id<>''").c } : undefined
  return r
}

// ── channels（多通道字段）──────────────────────────────────────
function runChannels() {
  const rawCols = cols('raw_meta')
  const memCols = cols('memories')
  const wantRaw = ['account_id', 'thread_id', 'external_id', 'url', 'speaker_id']
  const wantMem = ['subject_id', 'source_channel', 'source_ref', 'superseded_by']
  const missRaw = wantRaw.filter((c) => !rawCols.includes(c))
  const missMem = wantMem.filter((c) => !memCols.includes(c))
  const r = {
    planned: [
      ...missRaw.map((c) => `ALTER TABLE raw_meta ADD COLUMN ${c} TEXT DEFAULT ''`),
      ...missMem.map((c) => `ALTER TABLE memories ADD COLUMN ${c} ${c === 'superseded_by' ? 'INTEGER DEFAULT 0' : "TEXT DEFAULT ''"}`),
      '回填 raw_meta.thread_id（私聊_<qq> → <qq>；群_<gid> → group:<gid>）',
      "回填 memories.source_channel='qq'",
      '建索引 idx_raw_channel_thread(channel,thread_id) / idx_mem_channel(source_channel)',
    ],
    applied: [],
  }
  if (apply) {
    for (const c of missRaw) { try { db.exec(`ALTER TABLE raw_meta ADD COLUMN ${c} TEXT DEFAULT ''`) } catch {} }
    for (const c of missMem) {
      const def = c === 'superseded_by' ? 'INTEGER DEFAULT 0' : "TEXT DEFAULT ''"
      try { db.exec(`ALTER TABLE memories ADD COLUMN ${c} ${def}`) } catch {}
    }
    // thread_id 回填：从 cwd 解析
    const cwds = rows('SELECT DISTINCT cwd FROM raw_meta WHERE cwd<>\'\'')
    for (const { cwd } of cwds) {
      const thread = String(cwd).match(/私聊_([0-9]{5,})$/)?.[1] ?? String(cwd).match(/群_([0-9]+)$/)?.[1]
      const val = thread ? (String(cwd).includes('群_') ? `group:${thread}` : thread) : ''
      if (val) db.prepare("UPDATE raw_meta SET thread_id=? WHERE cwd=? AND (thread_id IS NULL OR thread_id='')").run(val, cwd)
    }
    db.prepare("UPDATE memories SET source_channel='qq' WHERE source_channel IS NULL OR source_channel=''").run()
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_raw_channel_thread ON raw_meta(channel, thread_id)') } catch {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_mem_channel ON memories(source_channel)') } catch {}
    setMeta('stage3_channels_at', Date.now())
    r.applied.push('字段与索引已建；thread_id / source_channel 已回填')
  }
  r.after = apply ? { rawCols: cols('raw_meta').length, memCols: cols('memories').length } : undefined
  return r
}

const map = { contacts: runContacts, roles: runRoles, speaker: runSpeaker, channels: runChannels }
const tasks = task === 'all' ? Object.keys(map) : [task]
for (const t of tasks) {
  if (!map[t]) fail(`未知 task：${t}`)
  out.tasks[t] = map[t]()
}
out.rollback = {
  contacts: 'DROP TABLE contact_notes; DROP TABLE contact_bindings; DROP TABLE contacts;（DROP 前先备份 memory.db）',
  roles: "UPDATE raw_meta SET role='主人' WHERE role='user' AND day>='<执行日>' …（按 meta.stage3_roles_at 定向回滚）",
  speaker: "UPDATE memories SET speaker_id=<ownerQQ> WHERE speaker_id='contact:owner'（需人工确认）",
  channels: '新增列保留不删（回滚=新代码读旧列）；索引可 DROP INDEX',
}
db.close()
console.log(JSON.stringify(out, null, 2))
