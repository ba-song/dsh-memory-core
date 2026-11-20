import {
  appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync,
  readSync, readdirSync, statSync, unlinkSync, writeSync,
} from 'node:fs'
import { join } from 'node:path'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const journalIndexCache = new Map()

export function normalizeArchiveCwd(value) {
  return String(value ?? '').trim().replace(/[/\\\\]+$/, '')
}

export function isHomeArchiveCwd(cwd, homeCwd) {
  const actual = normalizeArchiveCwd(cwd)
  const expected = normalizeArchiveCwd(homeCwd)
  return Boolean(expected && actual === expected)
}

function staleLock(lockPath) {
  let stat
  try { stat = statSync(lockPath) } catch (error) {
    return error?.code === 'ENOENT'
  }
  const oldEnough = Date.now() - stat.mtimeMs > 10 * 60 * 1000
  let metadata = null
  try { metadata = JSON.parse(readFileSync(lockPath, 'utf8')) } catch {}
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
  // 只有无法解析 owner 的损坏锁，才用超时作为人工恢复的保守兜底。
  return oldEnough
}

function acquireLock(eventsDir) {
  const lockPath = join(eventsDir, '.home-archive.lock')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600)
      try { writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() })) }
      catch (writeError) {
        try { closeSync(fd) } catch {}
        try { unlinkSync(lockPath) } catch {}
        throw writeError
      }
      return () => {
        try { closeSync(fd) } catch {}
        try { unlinkSync(lockPath) } catch {}
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      if (staleLock(lockPath)) {
        try { unlinkSync(lockPath); continue } catch (unlinkError) {
          if (unlinkError?.code === 'ENOENT') continue
        }
      }
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
  return files.map((name) => {
    const stat = statSync(join(eventsDir, name))
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
    const source = readFileSync(join(eventsDir, name), 'utf8')
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
  const eventsDir = join(dir, '_events')
  mkdirSync(eventsDir, { recursive: true, mode: 0o700 })
  // Existing directories retain their old mode unless chmod is applied explicitly.
  // Some Android shared-storage filesystems reject chmod; keep the archive best-effort.
  try { chmodSync(dir, 0o700) } catch {}
  try { chmodSync(eventsDir, 0o700) } catch {}
  return eventsDir
}

function appendLine(file, value) {
  let separator = ''
  if (existsSync(file)) {
    const size = statSync(file).size
    if (size > 0) {
      const fd = openSync(file, 'r')
      try {
        const last = Buffer.alloc(1)
        readSync(fd, last, 0, 1, size - 1)
        if (last[0] !== 0x0a) separator = '\n'
      } finally { closeSync(fd) }
    }
  }
  appendFileSync(file, separator + JSON.stringify(value) + '\n', { encoding: 'utf8', flag: 'a', mode: 0o600 })
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
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const eventsDir = ensurePrivateDirectories(dir)
  const release = acquireLock(eventsDir)
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

export function readPermanentJournal(dir) {
  const eventsDir = join(dir, '_events')
  const events = new Map()
  const tombstones = new Set()
  const errors = []
  if (!existsSync(eventsDir)) return { events, tombstones, errors, files: 0 }
  const files = readdirSync(eventsDir).filter((name) => DAY_RE.test(name.slice(0, 10)) && name.endsWith('.jsonl')).sort()
  for (const name of files) {
    const file = join(eventsDir, name)
    const source = readFileSync(file, 'utf8')
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
