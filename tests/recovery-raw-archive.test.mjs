import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createLiveSessionRegistry } from '../lib/session-trust.js'
import { createRawArchiveRecoveryAdapter } from '../lib/recovery/raw-archive.js'
import { bigrams } from '../lib/store/fts.js'

function fixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE VIRTUAL TABLE raw_fts USING fts5(text, tokenize='unicode61')`)
  db.exec(`CREATE TABLE raw_meta (
    id INTEGER PRIMARY KEY, file TEXT, line_no INTEGER, day TEXT, at INTEGER,
    role TEXT, raw_text TEXT, cwd TEXT, tombstone INTEGER DEFAULT 0)`)
  db.exec(`CREATE TABLE raw_vectors (
    raw_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL,
    model TEXT, updated_at INTEGER NOT NULL)`)
  const add = (id, cwd, text, tombstone = 0) => {
    db.prepare(`INSERT INTO raw_meta(id,file,line_no,day,at,role,raw_text,cwd,tombstone)
      VALUES(?, 'shared.md', ?, '2026-11-24', ?, 'user', ?, ?, ?)`)
      .run(id, id, Date.now(), text, cwd, tombstone)
    db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(text))
  }
  add(1, '/owner/home', '那天我们一起在海边散步，风很舒服。')
  add(2, '/owner/other', '另一个会话里的海边散步记录。')
  add(3, '/owner/home', '已撤回的海边散步记录。', 1)
  db.prepare('INSERT INTO raw_vectors(raw_id,dim,vec,model,updated_at) VALUES(?,2,?,?,?)')
    .run(2, new Uint8Array(new Float32Array([1, 0]).buffer), 'test', Date.now())
  const liveSessions = createLiveSessionRegistry()
  const isOwnerCwd = (cwd) => String(cwd).startsWith('/owner/')
  const adapter = createRawArchiveRecoveryAdapter({ db, liveSessions, isOwnerCwd })
  const exec = { agent: { session: { header: { id: 'owner-session', cwd: '/owner/home' } } } }
  return { db, liveSessions, adapter, exec }
}

test('recovery adapter denies sessions not observed by the host', () => {
  const { adapter, exec } = fixture()
  const result = adapter.search(exec, { question: '海边散步' })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'E_RECOVERY_ACCESS_DENIED')
  assert.deepEqual(result.evidence, [])
})

test('recovery adapter only returns evidence from the exact trusted owner cwd', () => {
  const { adapter, liveSessions, exec } = fixture()
  liveSessions.observe(exec.agent.session)
  const result = adapter.search(exec, { question: '海边散步', queryEmbed: [1, 0] })
  assert.equal(result.ok, true)
  assert.equal(result.evidence.length, 1)
  assert.equal(result.evidence[0].locator, 'shared.md#1')
  assert.match(result.evidence[0].excerpt, /一起在海边散步/)
  assert.equal(result.evidence[0].access, 'allowed')
  assert.equal(result.evidence[0].relation, 'unclear')
  assert.ok(!result.evidence.some((x) => /另一个会话/.test(x.excerpt)))
  assert.ok(!result.evidence.some((x) => /已撤回/.test(x.excerpt)))
})

test('recovery adapter does not trust model-supplied scope or cwd arguments', () => {
  const { adapter, liveSessions, exec } = fixture()
  liveSessions.observe(exec.agent.session)
  const result = adapter.search(exec, {
    question: '海边散步', cwd: '/owner/other', scope: 'all', access: 'allowed',
  })
  assert.equal(result.ok, true)
  assert.equal(result.evidence.length, 1)
  assert.equal(result.evidence[0].locator, 'shared.md#1')
})

test('recovery adapter denies an observed but non-owner session', () => {
  const { db, liveSessions } = fixture()
  const adapter = createRawArchiveRecoveryAdapter({
    db, liveSessions, isOwnerCwd: () => false,
  })
  const exec = { session: { header: { id: 'external', cwd: '/external/contact' } } }
  liveSessions.observe(exec.session)
  const result = adapter.search(exec, { question: '海边散步' })
  assert.equal(result.error, 'E_RECOVERY_ACCESS_DENIED')
  assert.deepEqual(result.evidence, [])
})
