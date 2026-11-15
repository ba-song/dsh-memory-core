/**
 * 记忆库自动快照 + 自愈（2026-11-06）
 *
 * 为什么用「定时 30 分钟」而不是「写 N 次」：写入是突发型（聊天一阵一阵），
 * 按次数快照会在短时间内堆很多重复快照、闲时又长期不拍；定时更可预测，
 * 且 VACUUM INTO 是只读快照，不会阻塞写入方太久。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const SNAPSHOT_DIRNAME = '备份'
export const KEEP = 6
const PREFIX = 'auto-'

const pad = (n) => String(n).padStart(2, '0')
function stamp(d = new Date()) {
  const p = (n) => pad(n)
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export function listSnapshots(dataDir) {
  const dir = join(dataDir, SNAPSHOT_DIRNAME)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
    .map((f) => ({ file: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
}

/** 生成一份快照并轮转（保留最近 keep 份） */
export function snapshotNow(dataDir, { keep = KEEP, now = new Date() } = {}) {
  const dir = join(dataDir, SNAPSHOT_DIRNAME)
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `${PREFIX}${stamp(now)}.db`)
  const db = new DatabaseSync(join(dataDir, 'memory.db'), { readOnly: true })
  try { db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`) } finally { db.close() }
  const all = listSnapshots(dataDir)
  const removed = []
  for (const old of all.slice(keep)) { try { rmSync(old.path); removed.push(old.file) } catch {} }
  return { path: target, kept: Math.min(all.length, keep), removed }
}

function integrityOk(dbPath) {
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try { return String(db.prepare('PRAGMA integrity_check').get()?.integrity_check ?? '') === 'ok' } finally { db.close() }
  } catch { return false }
}

/**
 * 启动自愈：库不存在或 integrity_check 失败 → 用最新快照恢复。
 * 恢复前把坏库改名留证（memory.db.bad-<ts>）；正常启动不动库。
 */
export function restoreIfNeeded(dataDir, log = { info() {}, warn() {} }, { now = new Date() } = {}) {
  const dbPath = join(dataDir, 'memory.db')
  const exists = existsSync(dbPath)
  if (exists && integrityOk(dbPath)) return { restored: false, reason: 'healthy' }
  const snaps = listSnapshots(dataDir).filter((s) => integrityOk(s.path))
  if (!snaps.length) return { restored: false, reason: exists ? 'corrupt-no-snapshot' : 'missing-no-snapshot' }
  const tag = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  let bad = ''
  if (exists) { bad = `${dbPath}.bad-${tag}`; try { renameSync(dbPath, bad) } catch {} ; try { rmSync(`${dbPath}-wal`); rmSync(`${dbPath}-shm`) } catch {} }
  copyFileSync(snaps[0].path, dbPath)
  log.warn?.(`记忆库自愈：${exists ? 'integrity 失败' : '库缺失'} → 已从 ${snaps[0].file} 恢复${bad ? `（坏库留证 ${bad.split('/').pop()}）` : ''}`)
  return { restored: true, from: snaps[0].file, bad, reason: exists ? 'corrupt' : 'missing' }
}
