import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'
import { searchArchive } from '../lib/archive/tools.js'

const HOME = '/sdcard/DSHA/生活/数据/home'
const session = { header: { id: 'session-12345678-context-test', cwd: HOME } }
const event = (type, seq, data, time = Date.now()) => ({ type, seq, time, data })

test('searchArchive withContext never includes tombstoned neighboring dialogue', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tombstone-context-'))
  const { db } = openDb(dir)
  const raw = new RawArchive({
    db,
    dir: join(dir, 'raw'),
    cwdPrefixes: [HOME],
    log: { warn() {}, info() {} },
  })
  try {
    const at = Date.now()
    raw.onEvent(session, event('user/message', 1, {
      message: { source: { kind: 'user' } },
      content: [{ type: 'text', text: '这段已经撤回的邻近私密内容不能再次出现在上下文中' }],
    }, at))
    raw.onEvent(session, event('assistant/message', 2, {
      content: [{ type: 'text', text: '这是仍然有效并且可以被搜索命中的目标内容' }],
    }, at + 1))
    raw.onEvent(session, event('message/recall', 3, { seq: 1 }, at + 2))

    const result = searchArchive(db, {
      question: '仍然有效可以搜索命中目标内容',
      cwd: HOME,
      withContext: true,
    })
    assert.equal(result.ok, true)
    assert.equal(result.withContext, true)
    assert.match(result.text, /仍然有效并且可以被搜索命中的目标内容/)
    assert.doesNotMatch(result.text, /已经撤回的邻近私密内容/)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})


test('searchArchive withContext=false keeps the plain search path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tombstone-context-off-'))
  const { db } = openDb(dir)
  const raw = new RawArchive({ db, dir: join(dir, 'raw'), cwdPrefixes: [HOME], log: { warn() {}, info() {} } })
  try {
    const at = Date.now()
    raw.onEvent(session, event('user/message', 1, { content: [{ type: 'text', text: '不应出现在普通搜索结果里的相邻内容' }] }, at))
    raw.onEvent(session, event('assistant/message', 2, { content: [{ type: 'text', text: '普通搜索目标内容仍然可用' }] }, at + 1))
    const result = searchArchive(db, { question: '普通搜索目标内容', cwd: HOME, withContext: false })
    assert.equal(result.ok, true)
    assert.equal(result.withContext, undefined)
    assert.match(result.text, /普通搜索目标内容/)
    // Plain search historically returns each keyword hit as a separate result; it must not switch to hitWindow context.
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
