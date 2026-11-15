#!/usr/bin/env node
/**
 * 阶段 3 迁移「二次演练」（阶段 4，只操作副本，不碰生产）
 *
 *   node scripts/drill-stage3-migration.mjs [--src <memory.db>] [--workdir <dir>] [--json <out>]
 *
 * 覆盖：
 *   1) 全量 apply（contacts → roles → speaker → channels）
 *   2) 重复 apply（幂等：数量不二次变化）
 *   3) 断点：只跑 contacts 后再全量（可续跑）
 *   4) 回滚：用迁移前备份覆盖回去，状态回到迁移前
 * 所有数据库都是 `VACUUM INTO` 出来的副本；生产库只用只读连接。
 */
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { DATA_DIR } from '../lib/config.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(HERE)
const argv = process.argv.slice(2)
const arg = (n, d = '') => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const src = arg('src', join(DATA_DIR, 'memory.db'))
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
const workdir = arg('workdir', `/tmp/drill-stage3-${stamp}`)
const jsonOut = arg('json', '')

mkdirSync(workdir, { recursive: true })
const fails = []
const ok = (name, cond, detail = {}) => { if (!cond) fails.push(name); return { name, pass: Boolean(cond), ...detail } }

function snapshot(dbPath, dest) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    try { rmSync(dest, { force: true }) } catch {}
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`)
  } finally { db.close() }
  return dest
}

function stats(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const q = (sql, ...p) => { try { return db.prepare(sql).get(...p) } catch { return undefined } }
  const all = (sql, ...p) => { try { return db.prepare(sql).all(...p) } catch { return [] } }
  const cols = (t) => all(`PRAGMA table_info(${t})`).map((c) => String(c.name))
  const rawCols = cols('raw_meta')
  const hasThread = rawCols.includes('thread_id')
  const roleRows = all("SELECT role, count(*) c FROM raw_meta WHERE role IN ('主人','你','汐','她','汐·想','想') GROUP BY role")
  const legacyTotal = roleRows.reduce((s, x) => s + x.c, 0)
  const bareSpeaker = q("SELECT count(*) c FROM memories WHERE speaker_id GLOB '[0-9]*' AND speaker_id<>''")?.c ?? 0
  const hasContacts = Boolean(q("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_bindings'"))
  const out = {
    rawTotal: q('SELECT count(*) c FROM raw_meta')?.c ?? 0,
    memoriesTotal: q('SELECT count(*) c FROM memories')?.c ?? 0,
    legacyTotal,
    byRole: Object.fromEntries(roleRows.map((r) => [r.role, r.c])),
    bareSpeaker,
    hasThreadCol: hasThread,
    hasContacts,
    contacts: hasContacts ? (q('SELECT count(*) c FROM contacts')?.c ?? 0) : 0,
    bindings: hasContacts ? (q('SELECT count(*) c FROM contact_bindings')?.c ?? 0) : 0,
    semantic: Object.fromEntries(all("SELECT role, count(*) c FROM raw_meta WHERE role IN ('user','self','self-thought') GROUP BY role").map((r) => [r.role, r.c])),
    threadFilled: hasThread ? (q("SELECT count(*) c FROM raw_meta WHERE thread_id<>''")?.c ?? 0) : 0,
    threadEmpty: hasThread ? (q("SELECT count(*) c FROM raw_meta WHERE thread_id=''")?.c ?? 0) : null,
    ownerSpeaker: q("SELECT count(*) c FROM memories WHERE speaker_id='contact:owner'")?.c ?? 0,
    metaMarkers: all("SELECT k FROM meta WHERE k LIKE 'stage3_%'").map((r) => r.k),
  }
  db.close()
  return out
}

function runMigrate(dbPath, task = 'all') {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'migrate-stage3.mjs'), '--task', task, '--db', dbPath, '--apply'], { encoding: 'utf8' })
  const last = out.trim().split('\n').slice(-2).join('')
  return JSON.parse(out.slice(out.indexOf('{')))
}

const expectThreadFillable = (dbPath) => {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const rows = (() => { try { return db.prepare("SELECT cwd FROM raw_meta WHERE cwd<>''").all() } catch { return [] } })()
  db.close()
  return rows.filter((r) => /私聊_[0-9]{5,}$|群_[0-9]+$/.test(String(r.cwd))).length
}

const report = { ok: true, src: src.replace(/.*\//, ''), workdir, phases: {} }

// ── 0. 快照 + 备份 ────────────────────────────────────────────
const snap = snapshot(src, join(workdir, 'snap.db'))
copyFileSync(snap, join(workdir, 'snap.backup.db'))
const base = stats(snap)
const fillable = expectThreadFillable(snap)

// ── 1. 全量 apply ─────────────────────────────────────────────
const r1 = runMigrate(snap, 'all')
const p1 = stats(snap)
report.phases.full = {
  migrateOk: r1.ok,
  checks: [
    ok('contacts 表与 owner 绑定已建', p1.hasContacts && p1.contacts === 1 && p1.bindings === 1, { contacts: p1.contacts, bindings: p1.bindings }),
    ok('旧角色清零', p1.legacyTotal === 0, { legacyTotal: p1.legacyTotal }),
    ok('语义角色总数 == 迁移前旧角色总数', (p1.semantic.user ?? 0) + (p1.semantic.self ?? 0) + (p1.semantic['self-thought'] ?? 0) === base.legacyTotal, { semantic: p1.semantic, before: base.byRole }),
    ok('每个旧标签都映射到对应语义角色', (p1.semantic.user ?? 0) === (base.byRole['主人'] ?? 0) + (base.byRole['你'] ?? 0) &&
      (p1.semantic.self ?? 0) === (base.byRole['汐'] ?? 0) + (base.byRole['她'] ?? 0) &&
      (p1.semantic['self-thought'] ?? 0) === (base.byRole['汐·想'] ?? 0) + (base.byRole['想'] ?? 0), {}),
    ok('speaker 裸号清零且落到 contact:owner', p1.bareSpeaker === 0 && p1.ownerSpeaker === base.bareSpeaker, { bareSpeaker: p1.bareSpeaker, ownerSpeaker: p1.ownerSpeaker, before: base.bareSpeaker }),
    ok('thread_id 回填数量 == 可由 cwd 解析的行数', p1.threadFilled === fillable, { threadFilled: p1.threadFilled, fillable }),
    ok('行数不变（raw / memories）', p1.rawTotal === base.rawTotal && p1.memoriesTotal === base.memoriesTotal, { raw: p1.rawTotal, memories: p1.memoriesTotal }),
    ok('四个 meta 标记齐全', ['stage3_contacts_at', 'stage3_roles_at', 'stage3_speaker_at', 'stage3_channels_at'].every((k) => p1.metaMarkers.includes(k)), { markers: p1.metaMarkers }),
  ],
}

// ── 2. 重复 apply（幂等）─────────────────────────────────────
runMigrate(snap, 'all')
const p2 = stats(snap)
report.phases.repeat = {
  checks: [
    ok('重复 apply 不改 contacts/bindings', p2.contacts === p1.contacts && p2.bindings === p1.bindings),
    ok('重复 apply 不改角色分布', JSON.stringify(p2.semantic) === JSON.stringify(p1.semantic)),
    ok('重复 apply 不改 speaker', p2.ownerSpeaker === p1.ownerSpeaker && p2.bareSpeaker === p1.bareSpeaker),
    ok('重复 apply 不改 thread', p2.threadFilled === p1.threadFilled && p2.threadEmpty === p1.threadEmpty),
    ok('行数仍不变', p2.rawTotal === p1.rawTotal && p2.memoriesTotal === p1.memoriesTotal),
  ],
}

// ── 3. 断点：只跑 contacts，再全量 ─────────────────────────────
const snap2 = snapshot(src, join(workdir, 'snap2.db'))
runMigrate(snap2, 'contacts')
const mid = stats(snap2)
runMigrate(snap2, 'all')
const p3 = stats(snap2)
report.phases.resume = {
  mid: { contacts: mid.contacts, legacyTotal: mid.legacyTotal },
  checks: [
    ok('断点（只跑 contacts）时角色未迁移', mid.contacts === 1 && mid.legacyTotal > 0, { legacyTotal: mid.legacyTotal }),
    ok('续跑后结果与一次跑完一致', p3.legacyTotal === 0 && (p3.semantic.user ?? 0) === (p1.semantic.user ?? 0) && p3.ownerSpeaker === p1.ownerSpeaker && p3.threadFilled === p1.threadFilled),
    ok('续跑后 contacts 不重复', p3.contacts === 1 && p3.bindings === 1),
  ],
}

// ── 4. 回滚：用迁移前备份覆盖 ─────────────────────────────────
const snap3 = snapshot(src, join(workdir, 'snap3.db'))
runMigrate(snap3, 'all')
copyFileSync(join(workdir, 'snap.backup.db'), snap3)
const restored = stats(snap3)
report.phases.rollback = {
  checks: [
    ok('回滚后旧角色恢复', restored.legacyTotal === base.legacyTotal, { legacyTotal: restored.legacyTotal, before: base.legacyTotal }),
    ok('回滚后 contacts 表不存在', restored.hasContacts === false),
    ok('回滚后线程/说话人回到迁移前', (restored.hasThreadCol === base.hasThreadCol) && restored.bareSpeaker === base.bareSpeaker, { bareSpeaker: restored.bareSpeaker }),
    ok('回滚后行数不变', restored.rawTotal === base.rawTotal && restored.memoriesTotal === base.memoriesTotal),
  ],
}

report.ok = fails.length === 0
report.failed = fails
report.baseline = base
report.after = { semantic: p1.semantic, ownerSpeaker: p1.ownerSpeaker, threadFilled: p1.threadFilled, threadEmpty: p1.threadEmpty }
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 1)
