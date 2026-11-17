#!/usr/bin/env node
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { computeStyle, writeStyleFile } from '../lib/style.js'
const args = process.argv.slice(2)
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const dataDir = getArg('--data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const { db } = openDb(dataDir)
if (args.includes('--write')) console.log(JSON.stringify(writeStyleFile(db, dataDir), null, 2))
else console.log(JSON.stringify(computeStyle(db), null, 2))
