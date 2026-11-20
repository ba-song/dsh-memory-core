#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite'
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync,
  renameSync, writeFileSync,
} from 'node:fs'
import { join, resolve, parse, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { archiveLabel, normalizeRole, ROLE } from '../lib/roles.js'
import { dayOf, clockOf } from '../lib/adapter/timefmt.js'
import { appendPermanentEvent, appendPermanentTombstone, readPermanentJournal, permanentJournalVersion, isHomeArchiveCwd } from '../lib/permanent/home-archive.js'

const DEFAULT_HOME_CWD = '/sdcard/DSHA/生活/数据/home'
const DEFAULT_ARCHIVE_DIR = '/sdcard/DSHA/记忆/档案/永久/home'
const DEFAULT_DB = join(process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据', 'memory.db')

function argsOf(argv) {
  const out = { dbPath: DEFAULT_DB, outDir: DEFAULT_ARCHIVE_DIR, homeCwd: DEFAULT_HOME_CWD }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === '--db') out.dbPath = argv[++i]
    else if (key === '--out') out.outDir = argv[++i]
    else if (key === '--home-cwd') out.homeCwd = argv[++i]
    else if (key === '--help' || key === '-h') out.help = true
    else throw new Error(`未知参数：${key}`)
  }
  return out
}

function columnsOf(db, table) {
  try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name))) }
  catch { return new Set() }
}

function parseExtra(value) {
  try { return JSON.parse(String(value ?? '{}')) } catch { return {} }
}

function parseRawText(rawText, at) {
  const value = String(rawText ?? '')
  const match = value.match(/^(\d{2}:\d{2}:\d{2}) \[\d*\] [^：]*：([\s\S]*)$/)
  return { time: match?.[1] ?? clockOf(at), text: match?.[2] ?? value }
}

function emotionMapOf(db, rawIds = []) {
  const columns = columnsOf(db, 'raw_emotion_archive')
  if (!columns.has('raw_id')) return new Map()
  const ids = [...new Set((Array.isArray(rawIds) ? rawIds : [])
    .map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (!ids.length) return new Map()
  const fields = ['raw_id', 'label', 'valence', 'arousal', 'certainty', 'intensity', 'source']
    .filter((field) => columns.has(field))
  if (!fields.includes('raw_id')) return new Map()
  const out = new Map()
  // Limit emotion reads to the selected home raw_id set; chunk below SQLite's
  // common bind-parameter ceiling rather than scanning other cwd histories.
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500)
    const placeholders = batch.map(() => '?').join(',')
    try {
      for (const row of db.prepare(`SELECT ${fields.join(',')} FROM raw_emotion_archive WHERE raw_id IN (${placeholders})`).all(...batch)) {
        const { raw_id: id, ...emotion } = row
        out.set(Number(id), emotion)
      }
    } catch {}
  }
  return out
}

function assertNoSymlink(path, label) {
  try {
    if (lstatSync(path).isSymbolicLink() && path !== '/sdcard') throw new Error(`${label} must not be a symbolic link: ${path}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

function assertNoSymlinkAncestors(path, label) {
  const absolute = resolve(path)
  const root = parse(absolute).root
  let current = root
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    let stat
    try { stat = lstatSync(current) } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    const allowedStorageAlias = current === '/sdcard' && stat.isSymbolicLink()
    if (stat.isSymbolicLink() && !allowedStorageAlias) throw new Error(`${label} ancestor must not be a symbolic link: ${current}`)
    if (!stat.isDirectory() && !allowedStorageAlias && current !== absolute) throw new Error(`${label} ancestor must be a directory: ${current}`)
  }
}

function atomicWrite(file, content, { preserveHistory = false } = {}) {
  assertNoSymlink(file, 'home archive derived file')
  if (existsSync(file)) {
    try { chmodSync(file, 0o600) } catch {}
    const current = readFileSync(file, 'utf8')
    if (current === content) return false
    if (preserveHistory) {
      const firstBackup = `${file}.pre-permanent.bak`
      const backup = existsSync(firstBackup)
        ? `${file}.history-${Date.now()}-${randomUUID()}.bak`
        : firstBackup
      copyFileSync(file, backup)
      try { chmodSync(backup, 0o600) } catch {}
    }
  }
  const temp = `${file}.tmp-${process.pid}-${randomUUID()}`
  try {
    writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    renameSync(temp, file)
    return true
  } catch (error) {
    try { unlinkSync(temp) } catch {}
    throw error
  }
}

function turnGroups(events, tombstones) {
  const groups = []
  let current = null
  const flush = () => {
    if (current?.rows?.length) groups.push(current)
    current = null
  }
  const begin = (seq = 0) => {
    current = { turn: Number(seq) || 0, rows: [] }
  }
  for (const event of events) {
    const extra = event.extra && typeof event.extra === 'object' ? event.extra : {}
    const marker = String(extra.event ?? '')
    if (marker === 'turn/start') {
      flush()
      begin(event.seq)
      continue
    }
    if (marker === 'turn/end') {
      flush()
      continue
    }
    const role = normalizeRole(event.role)
    if (['事', '步', '量', '境', '系'].includes(String(event.role))) continue
    if (!current) begin(event.seq)
    if (role === ROLE.USER && current.rows.some((row) => normalizeRole(row.role) === ROLE.USER)) {
      flush()
      begin(event.seq)
    }
    const id = Number(event.raw_id)
    current.rows.push({ ...event, tombstone: Number(event.tombstone) === 1 || tombstones.has(id) })
    if (!current.turn && Number(event.seq)) current.turn = Number(event.seq)
  }
  flush()
  return groups
}

function renderDay(day, events, tombstones) {
  const groups = turnGroups(events, tombstones)
  const lines = [`# ${day} · home 永久原始档案`, '', `> 事件数：${events.length}；对话轮次：${groups.length}；撤回记录：${events.filter((e) => tombstones.has(Number(e.raw_id)) || Number(e.tombstone) === 1).length}`, '']
  for (const group of groups) {
    const first = group.rows[0]
    lines.push(`## ${first.time || clockOf(first.at)} · turn ${group.turn || first.seq || 'unknown'}`)
    for (const row of group.rows) {
      const label = archiveLabel(row.role)
      const body = String(row.text ?? '').replace(/\n/g, '\n  ')
      const emotion = row.emotion && row.emotion.label
        ? `（情绪：${row.emotion.label}${Number.isFinite(Number(row.emotion.valence)) ? ` ${Number(row.emotion.valence).toFixed(2)}` : ''}）`
        : ''
      const revoked = row.tombstone ? '（已撤回）' : ''
      lines.push(`- ${row.time || clockOf(row.at)} [${row.seq ?? ''}] ${label}：${body}${emotion}${revoked}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

export async function exportHomeArchive({ dbPath = DEFAULT_DB, outDir = DEFAULT_ARCHIVE_DIR, homeCwd = DEFAULT_HOME_CWD, now = Date.now() } = {}) {
  const archiveDir = resolve(outDir)
  const cwd = String(homeCwd ?? '').trim().replace(/[/\\]+$/, '')
  if (!isHomeArchiveCwd(cwd, DEFAULT_HOME_CWD)) throw new Error('home archive scope is fixed to /sdcard/DSHA/生活/数据/home; refusing other cwd values')
  assertNoSymlinkAncestors(archiveDir, 'home archive output directory')
  assertNoSymlink(archiveDir, 'home archive output directory')
  mkdirSync(archiveDir, { recursive: true, mode: 0o700 })
  assertNoSymlinkAncestors(archiveDir, 'home archive output directory')
  assertNoSymlink(archiveDir, 'home archive output directory')
  const eventsDir = join(archiveDir, '_events')
  assertNoSymlinkAncestors(eventsDir, 'home archive _events directory')
  assertNoSymlink(eventsDir, 'home archive _events directory')
  mkdirSync(eventsDir, { recursive: true, mode: 0o700 })
  assertNoSymlinkAncestors(eventsDir, 'home archive _events directory')
  assertNoSymlink(eventsDir, 'home archive _events directory')
  try { chmodSync(archiveDir, 0o700) } catch {}
  try { chmodSync(join(archiveDir, '_events'), 0o700) } catch {}

  const db = new DatabaseSync(dbPath, { readOnly: true })
  let journal
  let rows = []
  let emotionById = new Map()
  try {
    db.exec('PRAGMA query_only=ON')
    const cols = columnsOf(db, 'raw_meta')
    for (const required of ['id', 'day', 'seq', 'role', 'raw_text', 'at', 'cwd']) {
      if (!cols.has(required)) throw new Error(`raw_meta 缺少必要字段：${required}`)
    }
    const extraExpr = cols.has('extra') ? 'extra' : "'{}' AS extra"
    const tombstoneExpr = cols.has('tombstone') ? 'tombstone' : '0 AS tombstone'
    rows = db.prepare(`SELECT id,day,seq,role,raw_text,at,cwd,${extraExpr},${tombstoneExpr} FROM raw_meta WHERE cwd=? ORDER BY day,at,id`).all(cwd)
    emotionById = emotionMapOf(db, rows.map((row) => Number(row.id)))
    journal = readPermanentJournal(archiveDir)

    let repaired = 0
    let tombstoneEvents = 0
    for (const row of rows) {
      const id = Number(row.id)
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(row.day ?? '')) ? String(row.day) : dayOf(Number(row.at))
      const parsed = parseRawText(row.raw_text, Number(row.at))
      if (!journal.events.has(id)) {
        const event = {
          raw_id: id, day, seq: Number(row.seq ?? 0), role: String(row.role ?? ''),
          time: parsed.time, at: Number(row.at ?? 0), text: parsed.text,
          tombstone: Number(row.tombstone ?? 0) === 1 ? 1 : 0,
          extra: parseExtra(row.extra), emotion: emotionById.get(id) ?? null, cwd,
        }
        const result = appendPermanentEvent({ dir: archiveDir, homeCwd: cwd, cwd, event })
        if (result.appended) repaired++
      }
      if (Number(row.tombstone ?? 0) === 1 && !journal.tombstones.has(id)) {
        appendPermanentTombstone({ dir: archiveDir, homeCwd: cwd, cwd, rawId: id, day: dayOf(now), at: now })
        tombstoneEvents++
      }
    }
    // 先完成DB缺失行/撤回标记补齐，再记录渲染起点；否则本轮自身修复会被误判为并发写入。
    const journalVersionAtStart = permanentJournalVersion(archiveDir)
    journal = readPermanentJournal(archiveDir)
    const all = [...journal.events.values()].filter((event) => Boolean(event.cwd) && String(event.cwd).replace(/[/\\]+$/, '') === cwd)
    const byDay = new Map()
    for (const event of all) {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(event.day ?? '')) ? String(event.day) : dayOf(Number(event.at))
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day).push(event)
    }

    const dayIndex = []
    for (const [day, dayEvents] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      dayEvents.sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0) || Number(a.seq ?? 0) - Number(b.seq ?? 0) || Number(a.raw_id) - Number(b.raw_id))
      const file = join(archiveDir, `${day}.md`)
      atomicWrite(file, renderDay(day, dayEvents, journal.tombstones), { preserveHistory: true })
      dayIndex.push({ day, events: dayEvents.length, tombstones: dayEvents.filter((event) => journal.tombstones.has(Number(event.raw_id)) || Number(event.tombstone) === 1).length, file: `${day}.md` })
    }

    const index = {
      format: 'dsh-home-permanent-archive/v1',
      generatedAt: new Date(now).toISOString(),
      timezone: 'Asia/Shanghai',
      homeCwd: cwd,
      source: 'append-only _events JSONL + read-only raw_meta reconciliation',
      totalEvents: all.length,
      tombstones: journal.tombstones.size,
      days: dayIndex,
      journalFiles: journal.files,
      journalErrors: journal.errors,
      repairedFromDb: repaired,
      tombstoneEventsAppended: tombstoneEvents,
    }
    atomicWrite(join(archiveDir, 'INDEX.json'), JSON.stringify(index, null, 2) + '\n')
    const readme = [
      '# home 永久原始档案',
      '',
      '- 本目录为明文永久档案；只处理指定 home cwd。',
      '- 目录尝试设置为 0700、文件尝试设置为 0600；Android 共享存储可能不支持 POSIX 权限，必须以 DSHA 本机实测为准。',
      '- 若 `.home-archive.recovery` 因进程被强制终止而残留，写入会安全失败；确认没有归档写入进程后再人工清除该恢复目录。',
      '- `_events/YYYY-MM-DD.jsonl` 是追加式事件日志，不覆盖、不清理。',
      '- 每日 Markdown 与 INDEX.json 是可重建的派生视图。',
      '- 已撤回消息保留原正文，并在可见档案中标注“已撤回”。',
      '- 补齐脚本以只读方式访问 SQLite；不会修改数据库，也不依赖 raw 文件目录。',
      '- 每次替换已有每日 Markdown 前都会保留历史版本：首次为 `.pre-permanent.bak`，后续为唯一 `.history-*.bak`。',
      '- 时区固定为 Asia/Shanghai。',
      '',
      `最近生成：${new Date(now).toISOString()}`,
      '',
    ].join('\n')
    atomicWrite(join(archiveDir, 'README.md'), readme)
    const journalVersionAtEnd = permanentJournalVersion(archiveDir)
    const journalStable = journalVersionAtStart === journalVersionAtEnd
    if (!journalStable) {
      index.journalStable = false
      index.journalVersionAtStart = journalVersionAtStart
      index.journalVersionAtEnd = journalVersionAtEnd
      index.consistencyWarning = 'Journal changed while derived views were being generated; run export again to refresh Markdown and INDEX.'
      atomicWrite(join(archiveDir, 'INDEX.json'), JSON.stringify(index, null, 2) + '\n')
    } else {
      index.journalStable = true
      index.journalVersion = journalVersionAtEnd
      atomicWrite(join(archiveDir, 'INDEX.json'), JSON.stringify(index, null, 2) + '\n')
    }
    return { ok: true, consistent: journalStable && journal.errors.length === 0, journalStable, journalVersionAtStart, journalVersionAtEnd, dbRows: rows.length, journalEvents: all.length, repaired, tombstoneEvents, days: dayIndex.length, journalErrors: journal.errors }
  } finally {
    db.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = argsOf(process.argv.slice(2))
    if (args.help) {
      process.stdout.write('Usage: node scripts/export-home-archive.mjs [--db PATH] [--out DIR] [--home-cwd PATH]\n')
    } else {
      const result = await exportHomeArchive(args)
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      if (result.journalErrors.length || !result.journalStable) process.exitCode = 2
    }
  } catch (error) {
    process.stderr.write(`home archive export failed: ${error?.stack ?? error}\n`)
    process.exitCode = 1
  }
}
