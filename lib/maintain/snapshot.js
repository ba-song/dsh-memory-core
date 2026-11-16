/**
 * 记忆库自动快照 + 自愈（2026-11-06）
 *
 * 为什么用「定时 30 分钟」而不是「写 N 次」：写入是突发型（聊天一阵一阵），
 * 按次数快照会在短时间内堆很多重复快照、闲时又长期不拍；定时更可预测，
 * 且 VACUUM INTO 是只读快照，不会阻塞写入方太久。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

/**
 * 内容指纹（2026-11-17）：判断「上次快照之后到底有没有东西变了」。
 *
 * 为什么需要：生产库 245MB，每 30 分钟一次 `VACUUM INTO` 全量拷贝 = 约 12 GB/天写放大，
 * 手机 flash 与 I/O 都被白白占用；而夜间/发呆时段其实一份都没变。
 * 这里只取几张核心表的最大 rowid / 计数，代价几次索引查询（毫秒级）。
 *
 * 取舍（诚实写在这里）：指纹只覆盖 memories / raw_meta / shortterm / operations / notes / vectors。
 * 若只有更冷门的表变了（如 conflict_queue），这一窗口会被跳过——最多晚 30 分钟才进快照，
 * 换来的是绝大多数空闲窗口不再写 245MB。要更严格就把 want 的字段加进 SQL。
 */
function fingerprint(dataDir) {
  let db = null
  try {
    db = new DatabaseSync(join(dataDir, 'memory.db'), { readOnly: true })
    const row = db.prepare(`
      SELECT
        (SELECT count(*) FROM memories) AS m_cnt,
        (SELECT COALESCE(max(updated_at), 0) FROM memories) AS m_upd,
        (SELECT COALESCE(max(created_at_epoch), 0) FROM memories) AS m_new,
        (SELECT count(*) FROM raw_meta) AS r_cnt,
        (SELECT COALESCE(max(id), 0) FROM raw_meta) AS r_max,
        (SELECT COALESCE(max(rowid), 0) FROM shortterm) AS st_max,
        (SELECT count(*) FROM operations) AS op_cnt,
        (SELECT COALESCE(max(rowid), 0) FROM notes) AS n_max,
        (SELECT COALESCE(max(rowid), 0) FROM vectors) AS v_max
    `).get()
    return Object.values(row ?? {}).join('|')
  } catch {
    return ''
  } finally {
    try { db?.close() } catch {}
  }
}

const FP_FILE = '.fingerprint'

function readFingerprint(dir) {
  try { return String(readFileSync(join(dir, FP_FILE), 'utf8')).trim() } catch { return '' }
}

function writeFingerprint(dir, fp) {
  try { writeFileSync(join(dir, FP_FILE), fp, { mode: 0o600 }) } catch {}
}

/**
 * 生成一份快照并轮转（保留最近 keep 份）
 *
 * 2026-11-17 优化：`skipIfUnchanged !== false` 时，先比内容指纹；与上次相同时**直接跳过**，
 * 不再做 245MB 的全量拷贝（省掉夜间约一半的写放大）。已有快照仍留在原地，不影响恢复。
 */
export function snapshotNow(dataDir, { keep = KEEP, now = new Date(), skipIfUnchanged = true } = {}) {
  const dir = join(dataDir, SNAPSHOT_DIRNAME)
  mkdirSync(dir, { recursive: true })
  if (skipIfUnchanged) {
    const fp = fingerprint(dataDir)
    if (fp && fp === readFingerprint(dir) && listSnapshots(dataDir).length > 0) {
      return { skipped: true, reason: 'unchanged', path: null, kept: listSnapshots(dataDir).length, removed: [] }
    }
    writeFingerprint(dir, fp)
  }
  const target = join(dir, `${PREFIX}${stamp(now)}.db`)
  const db = new DatabaseSync(join(dataDir, 'memory.db'), { readOnly: true })
  try { db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`) } finally { db.close() }
  const all = listSnapshots(dataDir)
  const removed = []
  for (const old of all.slice(keep)) { try { rmSync(old.path); removed.push(old.file) } catch {} }
  return { skipped: false, path: target, kept: Math.min(all.length, keep), removed }
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
