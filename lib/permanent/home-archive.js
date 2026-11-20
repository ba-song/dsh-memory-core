import {
  constants as fsConstants, chmodSync, closeSync, existsSync, fchmodSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, readSync, readdirSync, rmdirSync, statSync, unlinkSync,
  writeFileSync, writeSync,
} from 'node:fs'
import { join, resolve, parse, sep } from 'node:path'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const FIXED_HOME_CWD = '/sdcard/DSHA/生活/数据/home'
const journalIndexCache = new Map()

// Archive paths are user data boundaries. Never follow a symlink at the archive root,
// _events directory, or a journal file; otherwise an apparently local write can escape
// the configured home archive directory.
function assertNoSymlink(path, label = 'home archive path') {
  let stat
  try { stat = lstatSync(path) } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  if (stat.isSymbolicLink() && path !== '/sdcard') throw new Error(`${label} must not be a symbolic link: ${path}`)
  return stat
}

function assertDirectoryPath(path, label) {
  const absolute = resolve(path)
  const root = parse(absolute).root
  let current = root
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    const item = assertNoSymlink(current, label)
    const allowedStorageAlias = current === '/sdcard' && item?.isSymbolicLink()
    if (item && !item.isDirectory() && !allowedStorageAlias) {
      throw new Error(`${label} parent must be a directory: ${current}`)
    }
  }
  const stat = assertNoSymlink(absolute, label)
  if (stat && !stat.isDirectory()) throw new Error(`${label} must be a directory: ${absolute}`)
  return stat
}

function openRegularNoFollow(path, flags, mode) {
  if (typeof fsConstants.O_NOFOLLOW !== 'number') {
    throw new Error('filesystem does not support O_NOFOLLOW; refusing home archive file access')
  }
  const fd = openSync(path, flags | fsConstants.O_NOFOLLOW, mode)
  try {
    if (!fstatSync(fd).isFile()) throw new Error(`home archive path is not a regular file: ${path}`)
    return fd
  } catch (error) {
    try { closeSync(fd) } catch {}
    throw error
  }
}

function readJournalFile(path) {
  const fd = openRegularNoFollow(path, fsConstants.O_RDONLY)
  try { return readFileSync(fd, { encoding: 'utf8' }) }
  finally { closeSync(fd) }
}

export function normalizeArchiveCwd(value) {
  return String(value ?? '').trim().replace(/[/\\\\]+$/, '')
}

export function isHomeArchiveCwd(cwd, homeCwd) {
  const actual = normalizeArchiveCwd(cwd)
  const expected = normalizeArchiveCwd(homeCwd)
  return Boolean(expected === FIXED_HOME_CWD && actual === FIXED_HOME_CWD)
}

function staleLock(lockPath) {
  let stat
  try { stat = lstatSync(lockPath) } catch (error) {
    return error?.code === 'ENOENT'
  }
  // Never inspect or reclaim a symlink/non-file lock entry.
  if (stat.isSymbolicLink() || !stat.isFile()) return false
  const oldEnough = Date.now() - stat.mtimeMs > 10 * 60 * 1000
  let metadata = null
  let fd
  try {
    fd = openRegularNoFollow(lockPath, fsConstants.O_RDONLY)
    metadata = JSON.parse(readFileSync(fd, 'utf8'))
  } catch (error) {
    // A malformed regular lock may use the age-based manual-recovery fallback;
    // filesystem/path errors are not evidence that the lock is stale.
    if (!(error instanceof SyntaxError) && error?.code !== 'ENOENT' && error?.code !== 'EINVAL') return false
  } finally {
    if (fd !== undefined) try { closeSync(fd) } catch {}
  }
  const pid = Number(metadata?.pid)
  if (Number.isSafeInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0)
      return false
    } catch (error) {
      if (error?.code === 'ESRCH') return true
      return false
    }
  }
  // Only malformed regular lock files use the age-based manual-recovery fallback.
  return oldEnough
}

function unlinkLockIfOwned(lockPath, identity) {
  try {
    const current = lstatSync(lockPath)
    if (!current.isFile() || current.isSymbolicLink()) return false
    if (current.dev !== identity.dev || current.ino !== identity.ino) return false
    unlinkSync(lockPath)
    return true
  } catch {
    return false
  }
}

function reclaimStaleLock(eventsDir, lockPath) {
  // Serialize stale-lock reclamation itself. Without this claim, two contenders
  // can both observe a dead PID and one may unlink the other's newly-created live lock.
  const recoveryDir = join(eventsDir, '.home-archive.recovery')
  try { mkdirSync(recoveryDir, { mode: 0o700 }) } catch { return false }
  try {
    const before = statSync(lockPath)
    if (!staleLock(lockPath)) return false
    const current = statSync(lockPath)
    if (before.dev !== current.dev || before.ino !== current.ino) return false
    if (!staleLock(lockPath)) return false
    unlinkSync(lockPath)
    return true
  } catch {
    return false
  } finally {
    try { rmdirSync(recoveryDir) } catch {}
  }
}

function acquireLock(eventsDir) {
  const lockPath = join(eventsDir, '.home-archive.lock')
  const recoveryDir = join(eventsDir, '.home-archive.recovery')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (existsSync(recoveryDir)) {
        const busy = new Error('home-archive stale-lock recovery is in progress or needs manual recovery')
        busy.code = 'ELOCKED'
        throw busy
      }
      const fd = openSync(lockPath, 'wx', 0o600)
      const identity = fstatSync(fd)
      try { writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() })) }
      catch (writeError) {
        try { closeSync(fd) } catch {}
        unlinkLockIfOwned(lockPath, identity)
        throw writeError
      }
      return () => {
        try { closeSync(fd) } catch {}
        // Do not unlink a successor's lock if this lock path was replaced.
        unlinkLockIfOwned(lockPath, identity)
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      if (reclaimStaleLock(eventsDir, lockPath)) continue
      const busy = new Error('home-archive writer lock is busy')
      busy.code = 'ELOCKED'
      throw busy
    }
  }
  const busy = new Error('home-archive writer lock is busy')
  busy.code = 'ELOCKED'
  throw busy
}

function journalFiles(eventsDir) {
  return readdirSync(eventsDir)
    .filter((name) => DAY_RE.test(name.slice(0, 10)) && name.endsWith('.jsonl'))
    .sort()
}

function journalSignature(eventsDir, files = journalFiles(eventsDir)) {
  assertDirectoryPath(eventsDir, 'home archive _events')
  return files.map((name) => {
    const file = join(eventsDir, name)
    const stat = assertNoSymlink(file, 'home archive journal file')
    if (!stat?.isFile()) throw new Error(`home archive journal is not a regular file: ${file}`)
    return `${name}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`
  }).join('|')
}

/** raw_id 是全局唯一键，去重必须跨全部日期文件，而不能只检查当天文件。 */
function journalIndex(eventsDir) {
  const files = journalFiles(eventsDir)
  const signature = journalSignature(eventsDir, files)
  const cached = journalIndexCache.get(eventsDir)
  if (cached?.signature === signature) return cached

  const ids = new Set()
  const tombstones = new Set()
  for (const name of files) {
    const source = readJournalFile(join(eventsDir, name))
    for (const line of source.split('\n')) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        const id = Number(event.raw_id)
        if (!Number.isSafeInteger(id) || id <= 0) continue
        if (event.type === 'tombstone') tombstones.add(id)
        else ids.add(id)
      } catch {
        // 保留损坏行原样；后续追加时以换行隔开并在读取报告中暴露错误。
      }
    }
  }
  const index = { signature, ids, tombstones }
  journalIndexCache.set(eventsDir, index)
  return index
}

function refreshJournalIndex(eventsDir, index) {
  index.signature = journalSignature(eventsDir)
  journalIndexCache.set(eventsDir, index)
}
function ensurePrivateDirectories(dir) {
  assertDirectoryPath(dir, 'home archive root')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  assertDirectoryPath(dir, 'home archive root')
  const eventsDir = join(dir, '_events')
  assertDirectoryPath(eventsDir, 'home archive _events')
  mkdirSync(eventsDir, { recursive: true, mode: 0o700 })
  assertDirectoryPath(eventsDir, 'home archive _events')
  // Existing directories retain their old mode unless chmod is applied explicitly.
  // Some Android shared-storage filesystems reject chmod; keep the archive best-effort.
  try { chmodSync(dir, 0o700) } catch {}
  try { chmodSync(eventsDir, 0o700) } catch {}
  return eventsDir
}

function acquireLockWithRetry(eventsDir) {
  const delays = [100, 250, 500]
  for (let attempt = 0; ; attempt++) {
    try { return acquireLock(eventsDir) }
    catch (error) {
      if (error?.code !== 'ELOCKED' || attempt >= delays.length) throw error
      // Raw has already committed before permanent append; this bounded wait only
      // improves best-effort archival under a short burst and never rolls raw back.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delays[attempt])
    }
  }
}

function appendLine(file, value) {
  let separator = ''
  if (existsSync(file)) {
    assertNoSymlink(file, 'home archive journal file')
    const size = statSync(file).size
    if (size > 0) {
      const fd = openRegularNoFollow(file, fsConstants.O_RDONLY)
      try {
        const last = Buffer.alloc(1)
        readSync(fd, last, 0, 1, size - 1)
        if (last[0] !== 0x0a) separator = '\n'
      } finally { closeSync(fd) }
    }
  }
  assertNoSymlink(file, 'home archive journal file')
  const fd = openRegularNoFollow(file, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT, 0o600)
  try {
    try { fchmodSync(fd, 0o600) } catch {}
    writeFileSync(fd, separator + JSON.stringify(value) + '\n', { encoding: 'utf8' })
    try { fchmodSync(fd, 0o600) } catch {}
  } finally { closeSync(fd) }
}

function validateEvent(event) {
  const rawId = Number(event?.raw_id)
  const day = String(event?.day ?? '')
  if (!Number.isSafeInteger(rawId) || rawId <= 0) throw new TypeError('raw_id must be a positive safe integer')
  if (!DAY_RE.test(day)) throw new TypeError('day must be YYYY-MM-DD')
}

export function appendPermanentEvent({ dir, homeCwd, cwd, event }) {
  if (!isHomeArchiveCwd(cwd, homeCwd)) return { ok: true, skipped: true, reason: 'non-home-cwd' }
  validateEvent(event)
  assertDirectoryPath(dir, 'home archive root')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const eventsDir = ensurePrivateDirectories(dir)
  const release = acquireLockWithRetry(eventsDir)
  try {
    const file = join(eventsDir, `${event.day}.jsonl`)
    const index = journalIndex(eventsDir)
    if (index.ids.has(Number(event.raw_id))) return { ok: true, duplicate: true }
    appendLine(file, { ...event, raw_id: Number(event.raw_id), cwd: normalizeArchiveCwd(cwd) })
    index.ids.add(Number(event.raw_id))
    refreshJournalIndex(eventsDir, index)
    return { ok: true, appended: true }
  } finally { release() }
}

export function appendPermanentTombstone({ dir, homeCwd, cwd, rawId, day, at = Date.now() }) {
  if (!isHomeArchiveCwd(cwd, homeCwd)) return { ok: true, skipped: true, reason: 'non-home-cwd' }
  const id = Number(rawId)
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError('raw_id must be a positive safe integer')
  if (!DAY_RE.test(String(day ?? ''))) throw new TypeError('day must be YYYY-MM-DD')
  assertDirectoryPath(dir, 'home archive root')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const eventsDir = ensurePrivateDirectories(dir)
  const release = acquireLock(eventsDir)
  try {
    const file = join(eventsDir, `${day}.jsonl`)
    // 同一 raw_id 的撤回状态只需追加一次；历史原始事件本身永不修改。
    const index = journalIndex(eventsDir)
    if (index.tombstones.has(id)) return { ok: true, duplicate: true }
    appendLine(file, { type: 'tombstone', raw_id: id, day, at: Number(at) || Date.now(), cwd: normalizeArchiveCwd(cwd) })
    index.tombstones.add(id)
    refreshJournalIndex(eventsDir, index)
    return { ok: true, appended: true }
  } finally { release() }
}

export function permanentJournalVersion(dir) {
  const eventsDir = join(dir, '_events')
  assertDirectoryPath(dir, 'home archive root')
  assertDirectoryPath(eventsDir, 'home archive _events')
  if (!existsSync(eventsDir)) return 'missing'
  return journalSignature(eventsDir)
}

export function readPermanentJournal(dir) {
  const eventsDir = join(dir, '_events')
  assertDirectoryPath(dir, 'home archive root')
  assertDirectoryPath(eventsDir, 'home archive _events')
  const events = new Map()
  const tombstones = new Set()
  const errors = []
  if (!existsSync(eventsDir)) return { events, tombstones, errors, files: 0 }
  const files = readdirSync(eventsDir).filter((name) => DAY_RE.test(name.slice(0, 10)) && name.endsWith('.jsonl')).sort()
  for (const name of files) {
    const file = join(eventsDir, name)
    const fileStat = assertNoSymlink(file, 'home archive journal file')
    if (!fileStat?.isFile()) { errors.push({ file: name, line: 0, error: 'journal is not a regular file', trailing: false }); continue }
    const source = readJournalFile(file)
    const lines = source.split('\n')
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        const id = Number(event.raw_id)
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('invalid raw_id')
        if (event.type === 'tombstone') tombstones.add(id)
        else if (!events.has(id)) events.set(id, event)
      } catch (error) {
        errors.push({ file: name, line: index + 1, error: String(error?.message ?? error), trailing: index === lines.length - 1 })
      }
    }
  }
  return { events, tombstones, errors, files: files.length }
}
