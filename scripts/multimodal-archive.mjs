#!/usr/bin/env node
/** 多模态归档：node scripts/multimodal-archive.mjs [--write] [--limit 20] [--json] */
import { openDb } from '../lib/store/db.js'
import { scanMultimodal } from '../lib/multimodal.js'
const args = process.argv.slice(2)
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const dataDir = getArg('--data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const { db } = openDb(dataDir)
const r = await scanMultimodal({ db, limit: Number(getArg('--limit', 20)) || 20, dryRun: !args.includes('--write'), log: console })
if (args.includes('--json')) console.log(JSON.stringify(r, null, 2))
else { console.log(`scanned=${r.scanned} found=${r.found} inserted=${r.inserted} dryRun=${r.dryRun}`); for (const x of r.items) console.log(`  ${x.type} raw:${x.id} ${x.text.slice(0, 100)}`) }
