#!/usr/bin/env node
/**
 * self:unknown 回填 CLI（阶段 4，只写不跑）
 *
 *   node scripts/backfill-self-id.mjs --self-id self:<uuid> [--db <path>] [--apply] [--limit 500] [--all]
 *
 * - 默认 dry-run：只统计待回填行数
 * - `--apply` 才写；`--all` 表示分批跑到没有为止（否则只跑一批）
 * - 不自动读取 persona 库（跨插件不读表）；selfId 由统筹者从 persona 服务/日志确认后传入
 */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { DATA_DIR } from '../lib/config.js'
import { backfillUnknownSelf, backfillAll, countUnknownSelf } from '../lib/selfid.js'

const argv = process.argv.slice(2)
const arg = (name, def = '') => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const has = (f) => argv.includes(`--${f}`)

const apply = has('apply')
const all = has('all')
const selfId = String(arg('self-id', process.env.PERSONA_SELF_ID ?? '')).trim()
const dbPath = arg('db', join(DATA_DIR, 'memory.db'))
const limit = Number(arg('limit', '500')) || 500

if (!existsSync(dbPath)) {
  console.error(JSON.stringify({ ok: false, error: `数据库不存在：${dbPath}` }))
  process.exit(1)
}
if (!selfId) {
  console.error(JSON.stringify({ ok: false, error: '缺少 --self-id self:<uuid>（或环境变量 PERSONA_SELF_ID）' }))
  process.exit(1)
}

const db = new DatabaseSync(dbPath, { readOnly: !apply })
const before = countUnknownSelf(db)
const out = { ok: true, mode: apply ? 'apply' : 'dry-run', db: dbPath.replace(/.*\//, ''), before, selfIdPrefix: selfId.slice(0, 5) }
try {
  out.result = apply
    ? (all ? backfillAll(db, { selfId, limit }) : backfillUnknownSelf(db, { selfId, limit }))
    : backfillUnknownSelf(db, { selfId, limit, dryRun: true })
  out.after = countUnknownSelf(db)
} catch (e) {
  out.ok = false
  out.error = String(e?.message ?? e)
}
db.close()
console.log(JSON.stringify(out, null, 2))
process.exit(out.ok ? 0 : 1)
