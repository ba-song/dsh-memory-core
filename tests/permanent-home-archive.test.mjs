import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'
import { readPermanentJournal, appendPermanentEvent, appendPermanentTombstone } from '../lib/permanent/home-archive.js'
import { exportHomeArchive } from '../scripts/export-home-archive.mjs'
import { dayOf } from '../lib/adapter/timefmt.js'

const HOME = '/sdcard/DSHA/生活/数据/home'
const OTHER = '/sdcard/DSHA/群聊/测试'
const mk = (prefix) => {
  const dir = join(tmpdir(), `dsh-home-archive-${prefix}-${process.pid}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}
const event = (type, seq, time, data) => ({ type, seq, time, data })
const session = (id, cwd) => ({ header: { id, cwd } })


test('permanent archive refuses symlink roots, _events directories and journal files', () => {
  const dir = mk('symlink-boundary')
  const outside = join(dir, 'outside')
  const rootLink = join(dir, 'root-link')
  const eventsLinkRoot = join(dir, 'events-link-root')
  const fileLinkRoot = join(dir, 'file-link-root')
  mkdirSync(outside, { recursive: true })
  try {
    symlinkSync(outside, rootLink, 'dir')
    assert.throws(
      () => appendPermanentEvent({ dir: rootLink, homeCwd: HOME, cwd: HOME, event: { raw_id: 701, day: '2026-11-20' } }),
      /must not be a symbolic link/,
    )

    mkdirSync(eventsLinkRoot, { recursive: true })
    symlinkSync(outside, join(eventsLinkRoot, '_events'), 'dir')
    assert.throws(
      () => appendPermanentEvent({ dir: eventsLinkRoot, homeCwd: HOME, cwd: HOME, event: { raw_id: 702, day: '2026-11-20' } }),
      /must not be a symbolic link/,
    )

    const eventsDir = join(fileLinkRoot, '_events')
    mkdirSync(eventsDir, { recursive: true })
    symlinkSync(join(outside, 'target.jsonl'), join(eventsDir, '2026-11-20.jsonl'), 'file')
    assert.throws(
      () => appendPermanentEvent({ dir: fileLinkRoot, homeCwd: HOME, cwd: HOME, event: { raw_id: 703, day: '2026-11-20' } }),
      /must not be a symbolic link/,
    )
    assert.throws(() => readPermanentJournal(fileLinkRoot), /must not be a symbolic link/)
    assert.equal(readdirSync(outside).length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})


test('exporter refuses symlinked output root, _events directory and derived INDEX file', async () => {
  const dir = mk('export-symlink-boundary')
  const { db, file: dbPath } = openDb(dir)
  new RawArchive({ db, dir: join(dir, 'raw'), cwdPrefixes: [HOME], log: { warn() {}, info() {} } })
  db.close()
  const outside = join(dir, 'outside')
  const rootLink = join(dir, 'root-link')
  const eventsLink = join(dir, 'events-link')
  const indexLink = join(dir, 'index-link')
  mkdirSync(outside, { recursive: true })
  const target = join(outside, 'target.txt')
  writeFileSync(target, 'must remain unchanged')
  try {
    symlinkSync(outside, rootLink, 'dir')
    await assert.rejects(
      () => exportHomeArchive({ dbPath, outDir: rootLink, homeCwd: HOME }),
      /must not be a symbolic link/,
    )

    mkdirSync(eventsLink, { recursive: true })
    symlinkSync(outside, join(eventsLink, '_events'), 'dir')
    await assert.rejects(
      () => exportHomeArchive({ dbPath, outDir: eventsLink, homeCwd: HOME }),
      /must not be a symbolic link/,
    )

    mkdirSync(join(indexLink, '_events'), { recursive: true })
    symlinkSync(target, join(indexLink, 'INDEX.json'), 'file')
    await assert.rejects(
      () => exportHomeArchive({ dbPath, outDir: indexLink, homeCwd: HOME }),
      /must not be a symbolic link/,
    )
    assert.equal(readFileSync(target, 'utf8'), 'must remain unchanged')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('home raw rows are best-effort dual-written as append-only JSONL events', () => {
  const dir = mk('dual')
  const { db } = openDb(dir)
  const archiveDir = join(dir, 'permanent')
  const raw = new RawArchive({
    db, dir: join(dir, 'raw'), cwdPrefixes: [HOME, OTHER],
    permanentArchiveEnabled: true, permanentArchiveDir: archiveDir, permanentArchiveHomeCwd: HOME,
    log: { warn() {}, info() {} },
  })
  try {
    const at = Date.now()
    raw.onEvent(session('home-session-001', HOME), event('user/message', 1, at, {
      message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '永久档案双写测试正文' }],
    }))
    const journal = readPermanentJournal(archiveDir)
    assert.equal(journal.events.size, 1)
    const [saved] = [...journal.events.values()]
    assert.equal(saved.role, 'user')
    assert.equal(saved.text, '永久档案双写测试正文')
    assert.equal(saved.cwd, HOME)
    assert.equal(saved.raw_id > 0, true)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('tool call arguments and tool result text are preserved without archive-side truncation', () => {
  const dir = mk('tools')
  const { db } = openDb(dir)
  const archiveDir = join(dir, 'permanent')
  const raw = new RawArchive({
    db, dir: join(dir, 'raw'), cwdPrefixes: [HOME],
    permanentArchiveEnabled: true, permanentArchiveDir: archiveDir, permanentArchiveHomeCwd: HOME,
    log: { warn() {}, info() {} },
  })
  try {
    const at = Date.now()
    const longArgs = '参数内容'.repeat(1200)
    const longResult = '工具结果全文'.repeat(1200)
    const s = session('home-tool-session', HOME)
    raw.onEvent(s, event('tool/call', 1, at, { name: 'read_file', arguments: { path: '/tmp/a', detail: longArgs } }))
    raw.onEvent(s, event('tool/result', 2, at + 1, { content: [{ type: 'text', text: longResult }] }))
    const saved = [...readPermanentJournal(archiveDir).events.values()]
    assert.equal(saved.length, 2)
    assert.ok(saved.some((row) => row.role === '具' && row.text.includes(longArgs)))
    assert.ok(saved.some((row) => row.role === '果' && row.text.includes(longResult)))
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('permanent archive failure does not roll back successful raw file or raw_meta writes', () => {
  const dir = mk('failure')
  const { db } = openDb(dir)
  const badPath = join(dir, 'not-a-directory')
  writeFileSync(badPath, 'block')
  const warnings = []
  const raw = new RawArchive({
    db, dir: join(dir, 'raw'), cwdPrefixes: [HOME],
    permanentArchiveEnabled: true, permanentArchiveDir: badPath, permanentArchiveHomeCwd: HOME,
    log: { warn(message) { warnings.push(String(message)) }, info() {} },
  })
  try {
    const at = Date.now()
    raw.onEvent(session('home-session-fail', HOME), event('user/message', 1, at, {
      message: { source: { kind: 'user' } }, content: [{ type: 'text', text: 'raw 必须成功' }],
    }))
    assert.equal(db.prepare('SELECT count(*) c FROM raw_meta WHERE cwd=?').get(HOME).c, 1)
    assert.ok(existsSync(join(dir, 'raw', dayOf(at), 's-home-ses.md')))
    assert.ok(warnings.some((message) => message.includes('home 永久档案双写失败')))
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('non-home cwd never writes to the home permanent journal', () => {
  const dir = mk('scope')
  const { db } = openDb(dir)
  const archiveDir = join(dir, 'permanent')
  const raw = new RawArchive({
    db, dir: join(dir, 'raw'), cwdPrefixes: [HOME, OTHER],
    permanentArchiveEnabled: true, permanentArchiveDir: archiveDir, permanentArchiveHomeCwd: HOME,
    log: { warn() {}, info() {} },
  })
  try {
    raw.onEvent(session('other-session', OTHER), event('user/message', 1, Date.now(), {
      message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '群聊不能进入 home 永久档案' }],
    }))
    assert.equal(db.prepare('SELECT count(*) c FROM raw_meta WHERE cwd=?').get(OTHER).c, 1)
    assert.equal(readPermanentJournal(archiveDir).events.size, 0)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('new permanent archive journal uses owner-only POSIX permissions', () => {
  const dir = mk('permissions')
  const archiveDir = join(dir, 'permanent')
  const eventsDir = join(archiveDir, '_events')
  const file = join(eventsDir, '2026-11-20.jsonl')
  const item = { raw_id: 990, day: '2026-11-20', seq: 1, role: 'user', at: Date.now(), text: '权限测试' }
  try {
    mkdirSync(eventsDir, { recursive: true, mode: 0o777 })
    writeFileSync(file, 'legacy\n', { mode: 0o666 })
    chmodSync(archiveDir, 0o777)
    chmodSync(eventsDir, 0o777)
    chmodSync(file, 0o666)
    appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: item })
    assert.equal(statSync(archiveDir).mode & 0o077, 0)
    assert.equal(statSync(eventsDir).mode & 0o077, 0)
    assert.equal(statSync(file).mode & 0o077, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('stale lock recovery checks owner process before deleting an old lock', () => {
  const dir = mk('stale-lock')
  const archiveDir = join(dir, 'permanent')
  const eventsDir = join(archiveDir, '_events')
  const lockPath = join(eventsDir, '.home-archive.lock')
  const item = { raw_id: 991, day: '2026-11-20', seq: 1, role: 'user', at: Date.now(), text: '锁恢复测试' }
  try {
    mkdirSync(eventsDir, { recursive: true })
    writeFileSync(lockPath, JSON.stringify({ pid: 2147483647, at: 1 }))
    const old = new Date(Date.now() - 20 * 60 * 1000)
    utimesSync(lockPath, old, old)
    assert.equal(appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: item }).appended, true)

    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, at: 1 }))
    utimesSync(lockPath, old, old)
    assert.throws(
      () => appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: { ...item, raw_id: 992 } }),
      (error) => error?.code === 'ELOCKED',
    )
    const recoveryDir = join(eventsDir, '.home-archive.recovery')
    mkdirSync(recoveryDir, { mode: 0o700 })
    assert.throws(
      () => appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: { ...item, raw_id: 993 } }),
      (error) => error?.code === 'ELOCKED',
    )
    rmSync(recoveryDir, { recursive: true, force: true })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('same short session filename and seq in different cwd only tombstones the matching cwd', () => {
  const dir = mk('tombstone-scope')
  const { db } = openDb(dir)
  const archiveDir = join(dir, 'permanent')
  const raw = new RawArchive({
    db, dir: join(dir, 'raw'), cwdPrefixes: [HOME, OTHER],
    permanentArchiveEnabled: true, permanentArchiveDir: archiveDir, permanentArchiveHomeCwd: HOME,
    log: { warn() {}, info() {} },
  })
  try {
    const at = Date.now()
    raw.onEvent(session('aaaaaaaa-home-session', HOME), event('user/message', 1, at, {
      message: { source: { kind: 'user' } }, content: [{ type: 'text', text: 'home 原文' }],
    }))
    raw.onEvent(session('aaaaaaaa-group-session', OTHER), event('user/message', 1, at + 1, {
      message: { source: { kind: 'user' } }, content: [{ type: 'text', text: 'group 原文' }],
    }))
    raw.onEvent(session('aaaaaaaa-home-session', HOME), event('message/recall', 2, at + 2, { seq: 1 }))
    const rows = db.prepare('SELECT cwd,tombstone,raw_text FROM raw_meta WHERE seq=1 ORDER BY id').all()
    assert.equal(rows.length, 2)
    assert.equal(rows.find((row) => row.cwd === HOME).tombstone, 1)
    assert.equal(rows.find((row) => row.cwd === OTHER).tombstone, 0)
    const journal = readPermanentJournal(archiveDir)
    assert.ok(journal.tombstones.size >= 1)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('duplicate raw_id is idempotent and does not append a second base event', () => {
  const dir = mk('idempotent')
  const archiveDir = join(dir, 'permanent')
  const item = { raw_id: 77, day: '2026-11-20', seq: 4, role: 'user', time: '12:00:00', at: 1795156800000, text: '同一条', extra: {}, emotion: null }
  try {
    assert.equal(appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: item }).appended, true)
    assert.equal(appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: { ...item, raw_id: 78 } }).appended, true)
    assert.equal(appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: item }).duplicate, true)
    assert.equal(readPermanentJournal(archiveDir).events.size, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('repeated tombstone is idempotent and incomplete trailing JSONL bytes are preserved', () => {
  const dir = mk('journal-recovery')
  const archiveDir = join(dir, 'permanent')
  const eventsDir = join(archiveDir, '_events')
  mkdirSync(eventsDir, { recursive: true })
  const day = '2026-11-20'
  const file = join(eventsDir, `${day}.jsonl`)
  const brokenTail = '{"raw_id":'
  writeFileSync(file, brokenTail, 'utf8')
  const item = { raw_id: 88, day, seq: 8, role: 'user', time: '12:00:00', at: 1795156800000, text: '尾部恢复', extra: {}, emotion: null }
  try {
    appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: item })
    appendPermanentTombstone({ dir: archiveDir, homeCwd: HOME, cwd: HOME, rawId: 88, day, at: item.at })
    const second = appendPermanentTombstone({ dir: archiveDir, homeCwd: HOME, cwd: HOME, rawId: 88, day, at: item.at + 1 })
    assert.equal(second.duplicate, true)
    const journal = readPermanentJournal(archiveDir)
    assert.equal(journal.events.size, 1)
    assert.ok(journal.tombstones.has(88))
    assert.equal(journal.errors.length, 1)
    assert.ok(readFileSync(file, 'utf8').startsWith(brokenTail + '\n'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('raw_id idempotency is global across date files and invalidates after external append', () => {
  const dir = mk('global-idempotency')
  const archiveDir = join(dir, 'permanent')
  const eventsDir = join(archiveDir, '_events')
  const firstDay = '2026-11-19'
  const nextDay = '2026-11-20'
  const first = { raw_id: 901, day: firstDay, seq: 1, role: 'user', at: 1795070400000, text: '原始事件' }
  const duplicateOtherDay = { ...first, day: nextDay, text: '错误的跨日重复' }
  try {
    assert.equal(appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: first }).appended, true)
    assert.equal(appendPermanentEvent({ dir: archiveDir, homeCwd: HOME, cwd: HOME, event: duplicateOtherDay }).duplicate, true)
    assert.equal(readPermanentJournal(archiveDir).events.size, 1)

    mkdirSync(eventsDir, { recursive: true })
    writeFileSync(join(eventsDir, '2026-11-18.jsonl'), JSON.stringify({
      raw_id: 902, day: '2026-11-18', cwd: HOME, role: 'user', text: '外部追加',
    }) + '\n')
    assert.equal(appendPermanentEvent({
      dir: archiveDir, homeCwd: HOME, cwd: HOME,
      event: { ...first, raw_id: 902, day: nextDay },
    }).duplicate, true)
    assert.equal(readPermanentJournal(archiveDir).events.size, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('daily markdown replacement preserves each prior version', async () => {
  const dir = mk('markdown-history')
  const { db, file: dbPath } = openDb(dir)
  const archiveDir = join(dir, 'permanent')
  const raw = new RawArchive({ db, dir: join(dir, 'raw'), cwdPrefixes: [HOME], log: { warn() {}, info() {} } })
  const at = Date.now()
  const day = dayOf(at)
  const file = join(archiveDir, day + '.md')
  try {
    mkdirSync(archiveDir, { recursive: true })
    writeFileSync(file, '# 人工保留的初始历史\n')
    raw.onEvent(session('markdown-history-session', HOME), event('user/message', 1, at, {
      message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '第一条永久记录' }],
    }))
    await exportHomeArchive({ dbPath, outDir: archiveDir, homeCwd: HOME, now: at + 1000 })
    assert.match(readFileSync(file + '.pre-permanent.bak', 'utf8'), /人工保留的初始历史/)
    writeFileSync(file, readFileSync(file, 'utf8') + '\n人工补充的第二版说明\n')
    raw.onEvent(session('markdown-history-session', HOME), event('user/message', 2, at + 2000, {
      message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '第二条永久记录' }],
    }))
    await exportHomeArchive({ dbPath, outDir: archiveDir, homeCwd: HOME, now: at + 3000 })
    const backups = readdirSync(archiveDir).filter((name) => name.includes('.history-') && name.endsWith('.bak'))
    assert.equal(backups.length, 1)
    assert.match(readFileSync(join(archiveDir, backups[0]), 'utf8'), /人工补充的第二版说明/)
    const current = readFileSync(file, 'utf8')
    assert.match(current, /第一条永久记录/)
    assert.match(current, /第二条永久记录/)
  } finally {
    try { db.close() } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
})

test('export repairs missing journal rows from read-only DB and does not depend on raw files', async () => {
  const dir = mk('export')
  const { db, file: dbPath } = openDb(dir)
  const archiveDir = join(dir, 'permanent')
  const rawDir = join(dir, 'raw')
  const raw = new RawArchive({
    db, dir: rawDir, cwdPrefixes: [HOME],
    permanentArchiveEnabled: true, permanentArchiveDir: archiveDir, permanentArchiveHomeCwd: HOME,
    getPersona: () => ({ emotionAt: () => ({ label: '平静', valence: 0.16, intensity: 0.2, confidence: 0.9 }) }),
    log: { warn() {}, info() {} },
  })
  const at = Date.now()
  try {
    raw.onEvent(session('home-export-session', HOME), event('user/message', 1, at, {
      message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '补齐器应恢复这段正文' }],
    }))
    raw.onEvent(session('home-export-session', HOME), event('assistant/message', 2, at + 1, {
      content: [{ type: 'text', text: '我会把这段写入永久档案' }],
    }))
    raw.onEvent(session('home-export-session', HOME), event('message/recall', 3, at + 2, { seq: 1 }))
    db.close()

    // 模拟永久双写缺失；数据库仍保留 raw_meta，且 raw Markdown 文件被清理。
    rmSync(join(archiveDir, '_events'), { recursive: true, force: true })
    rmSync(rawDir, { recursive: true, force: true })
    const result = await exportHomeArchive({ dbPath, outDir: archiveDir, homeCwd: HOME, now: at + 1000 })
    assert.equal(result.ok, true)
    assert.equal(result.repaired, 2)
    const day = dayOf(at)
    const markdown = readFileSync(join(archiveDir, `${day}.md`), 'utf8')
    assert.match(markdown, /补齐器应恢复这段正文/)
    assert.match(markdown, /我会把这段写入永久档案/)
    assert.match(markdown, /已撤回/)
    assert.ok(existsSync(join(archiveDir, 'INDEX.json')))
    assert.ok(existsSync(join(archiveDir, 'README.md')))
    assert.ok(existsSync(join(archiveDir, '_events', `${day}.jsonl`)))
  } finally {
    try { db.close() } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
})
