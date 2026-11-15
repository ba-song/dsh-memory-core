#!/usr/bin/env node
/** 回填 raw_meta.person_id（只增列/改该列；默认 dry-run，--apply 才写；幂等） */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePersonId } from '../lib/person/id.js'
const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const DATA_DIR = arg('data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const DB = arg('db', join(DATA_DIR, 'memory.db'))
const APPLY = argv.includes('--apply')
const cfg = (() => { try { return JSON.parse(readFileSync(join(DATA_DIR, 'config.json'), 'utf8')) } catch { return {} } })()
const owner = { ownerQQ: cfg.ownerQQ ?? '', ownerPrivateDir: cfg.ownerPrivateDir ?? '', ownerEmail: cfg.ownerEmail ?? cfg.mailTo ?? '' }
const db = new DatabaseSync(DB)
try { db.exec("ALTER TABLE raw_meta ADD COLUMN person_id TEXT DEFAULT ''") } catch {}
const rows = db.prepare("SELECT id, cwd, channel, thread_id, person_id FROM raw_meta WHERE person_id IS NULL OR person_id=''").all()
const plan = []
for (const r of rows) {
  const cwd = String(r.cwd ?? '')
  const ch = String(r.channel ?? 'qq') || 'qq'
  const contact = r.thread_id || cwd.match(/私聊_([0-9]{5,})/)?.[1] || (ch === 'mail' ? (cwd.split('/').pop() ?? '') : '')
  const pid = resolvePersonId({ channel: ch, contactId: contact, cwd, owner })
  if (pid) plan.push({ id: r.id, pid })
}
console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', total: rows.length, candidate: plan.length, unresolved: rows.length - plan.length, sample: plan.slice(0, 3) }, null, 2))
if (!APPLY) process.exit(0)
db.exec('BEGIN IMMEDIATE')
for (const p of plan) db.prepare('UPDATE raw_meta SET person_id=? WHERE id=?').run(p.pid, p.id)
db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('person_backfill_at',?)").run(String(Date.now()))
db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('person_backfill_rows',?)").run(String(plan.length))
db.exec('COMMIT')
console.log(JSON.stringify({ ok: true, updated: plan.length }))
