#!/usr/bin/env node
/** 记忆清晰度维护：node scripts/clarity-maintain.mjs [--write] [--days 1] [--json] */
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { planClarity, applyClarityPlan } from '../lib/clarity.js'
const args = process.argv.slice(2)
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const dataDir = getArg('--data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const { db } = openDb(dataDir)
const rows = db.prepare("SELECT id,kind,text,importance,created_at_epoch,pinned,clarity,scope_type,meta,status FROM memories WHERE status='active'").all()
const plan = planClarity(rows, { days: Number(getArg('--days', 1)) || 1 })
const out = { scanned: rows.length, planned: plan.length, plan, applied: null }
if (args.includes('--write')) out.applied = applyClarityPlan(db, plan, { archiveFile: join(dataDir, 'memory-card-full.jsonl') })
if (args.includes('--json')) console.log(JSON.stringify(out, null, 2))
else { console.log(`scanned=${rows.length} planned=${plan.length}`); for (const p of plan.slice(0, 20)) console.log(`  #${p.id} ${p.from}->${p.to} imp=${p.importance} ${p.text}`); if (out.applied) console.log(out.applied) }
