#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite'
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync,
  renameSync, writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { archiveLabel, normalizeRole, ROLE } from '../lib/roles.js'
import { dayOf, clockOf } from '../lib/adapter/timefmt.js'
import { appendPermanentEvent, appendPermanentTombstone, readPermanentJournal } from '../lib/permanent/home-archive.js'

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

function emotionMapOf(db) {
  const columns = columnsOf(db, 'raw_emotion_archive')
  if (!columns.has('raw_id')) return new Map()
  const fields = ['raw_id', 'label', 'valence', 'arousal', 'certainty', 'intensity', 'source']
    .filter((field) => columns.has(field))
  if (!fields.includes('raw_id')) return new Map()
  const out = new Map()
  try {
    for (const row of db.prepare(`SELECT ${fields.join(',')} FROM raw_emotion_archive`).all()) {
      const { raw_id: id, ...emotion } = row
      out.set(Number(id), emotion)
    }
  } catch {}
  return out
}

function atomicWrite(file, content) {
  const temp = `${file}.tmp-${process.pid}-${randomUUID()}`
  writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  renameSync(temp, file)
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
  if (!cwd) throw new Error('home cwd 不能为空')
  mkdirSync(archiveDir, { recursive: true, mode: 0o700 })
  mkdirSync(join(archiveDir, '_events'), { recursive: true, mode: 0o700 })

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
    emotionById = emotionMapOf(db)
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
      const backup = `${file}.pre-permanent.bak`
      if (existsSync(file) && !existsSync(backup)) { copyFileSync(file, backup); try { chmodSync(backup, 0o600) } catch {} }
      atomicWrite(file, renderDay(day, dayEvents, journal.tombstones))
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
      '- `_events/YYYY-MM-DD.jsonl` 是追加式事件日志，不覆盖、不清理。',
      '- 每日 Markdown 与 INDEX.json 是可重建的派生视图。',
      '- 已撤回消息保留原正文，并在可见档案中标注“已撤回”。',
      '- 补齐脚本以只读方式访问 SQLite；不会修改数据库，也不依赖 raw 文件目录。',
      '- 首次重建已有 Markdown 时，会保留一份 `.pre-permanent.bak` 备份。',
      '- 时区固定为 Asia/Shanghai。',
      '',
      `最近生成：${new Date(now).toISOString()}`,
      '',
    ].join('\n')
    atomicWrite(join(archiveDir, 'README.md'), readme)
    return { ok: true, dbRows: rows.length, journalEvents: all.length, repaired, tombstoneEvents, days: dayIndex.length, journalErrors: journal.errors }
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
      if (result.journalErrors.length) process.exitCode = 2
    }
  } catch (error) {
    process.stderr.write(`home archive export failed: ${error?.stack ?? error}\n`)
    process.exitCode = 1
  }
}
