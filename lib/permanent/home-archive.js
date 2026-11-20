import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync,
  readSync, readdirSync, statSync, unlinkSync, writeSync,
} from 'node:fs'
import { join } from 'node:path'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function normalizeArchiveCwd(value) {
  return String(value ?? '').trim().replace(/[/\\\\]+$/, '')
}

export function isHomeArchiveCwd(cwd, homeCwd) {
  const actual = normalizeArchiveCwd(cwd)
  const expected = normalizeArchiveCwd(homeCwd)
  return Boolean(expected && actual === expected)
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true }
  catch (error) { return error?.code === 'EPERM' }
}

function acquireLock(eventsDir) {
  const lockPath = join(eventsDir, '.home-archive.lock')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600)
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }))
      return () => {
        try { closeSync(fd) } catch {}
        try { unlinkSync(lockPath) } catch {}
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      // 只回收明确超过 10 分钟且持有进程已不存在的陈旧锁。
      try {
        const stat = statSync(lockPath)
        const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
        if (Date.now() - stat.mtimeMs > 10 * 60 * 1000 && !pidAlive(Number(lock.pid))) {
          unlinkSync(lockPath)
          continue
        }
      } catch (readError) {
        if (readError?.code === 'ENOENT') continue
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

function hasRawId(file, rawId) {
  if (!existsSync(file)) return false
  const content = readFileSync(file, 'utf8')
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      if (event.type !== 'tombstone' && Number(event.raw_id) === Number(rawId)) return true
    } catch {
      // 不完整/损坏行不覆盖、不修剪；后续追加时先用换行隔开。
    }
  }
  return false
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
  appendFileSync(file, separator + JSON.stringify(value) + '\n', { encoding: 'utf8', flag: 'a' })
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
  const eventsDir = join(dir, '_events')
  mkdirSync(eventsDir, { recursive: true })
  const release = acquireLock(eventsDir)
  try {
    const file = join(eventsDir, `${event.day}.jsonl`)
    if (hasRawId(file, event.raw_id)) return { ok: true, duplicate: true }
    appendLine(file, { ...event, raw_id: Number(event.raw_id), cwd: normalizeArchiveCwd(cwd) })
    return { ok: true, appended: true }
  } finally { release() }
}

export function appendPermanentTombstone({ dir, homeCwd, cwd, rawId, day, at = Date.now() }) {
  if (!isHomeArchiveCwd(cwd, homeCwd)) return { ok: true, skipped: true, reason: 'non-home-cwd' }
  const id = Number(rawId)
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError('raw_id must be a positive safe integer')
  if (!DAY_RE.test(String(day ?? ''))) throw new TypeError('day must be YYYY-MM-DD')
  const eventsDir = join(dir, '_events')
  mkdirSync(eventsDir, { recursive: true })
  const release = acquireLock(eventsDir)
  try {
    const file = join(eventsDir, `${day}.jsonl`)
    // Tombstone 是追加式状态事件；重复撤回允许重复记录，不触碰既有原始事件。
    appendLine(file, { type: 'tombstone', raw_id: id, day, at: Number(at) || Date.now(), cwd: normalizeArchiveCwd(cwd) })
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
