/**
 * speaker 列写入修正 —— 2026-11-05
 *
 * 旧实现把 selfId 写进 `speaker`、`speaker_id` 永远空 → `self:unknown` 回填永远 0 行。
 * 新规则：self/self-thought → `speaker='self'` + `speaker_id=<selfId>`；user → `speaker='user'` + `speaker_id=''`。
 * 旧行一律不动（本测试预置一条旧行做字节级回归）。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DATA_DIR = '/tmp/dy-speaker-' + process.pid
process.env.DY_MEMORY_DIR = DATA_DIR
rmSync(DATA_DIR, { recursive: true, force: true })
mkdirSync(DATA_DIR, { recursive: true })

const { RawArchive } = await import('../lib/ingest/archive.js')

// 用生产同款 schema（含 thread_id / speaker_id 等阶段 3 列），才能走到生产分支
const db = new DatabaseSync(join(DATA_DIR, 'memory.db'))
db.exec(`CREATE TABLE raw_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, file TEXT, line_no INTEGER,
  seq INTEGER, role TEXT, speaker TEXT, channel TEXT, tombstone INTEGER DEFAULT 0,
  chars INTEGER DEFAULT 0, raw_text TEXT DEFAULT '', at INTEGER, extra TEXT DEFAULT '{}', cwd TEXT DEFAULT '',
  account_id TEXT DEFAULT '', thread_id TEXT DEFAULT '', external_id TEXT DEFAULT '', url TEXT DEFAULT '',
  speaker_id TEXT DEFAULT '')`)

const SELF_ID = 'self:1d21547c-9973-4060-aca8-11bb891ea4e7'
const archive = new RawArchive({
  db, dir: join(DATA_DIR, 'raw'),
  cwdPrefixes: ['/root/qq-agent/QQ会话'],
  log: { info() {}, warn() {} },
  getSelfId: () => SELF_ID,
})
const cwd = '/root/qq-agent/QQ会话/私聊_1000000001'
const emit = (type, seq, data) => archive.onEvent({ header: { id: 'sess-speaker-1', cwd } }, { type, seq, time: Date.now(), data })
const last = () => db.prepare('SELECT role,speaker,speaker_id,extra FROM raw_meta ORDER BY id DESC LIMIT 1').get()
const out = { ok: true, test: 'archive-speaker' }

// 预置一条旧行（模拟历史数据）：speaker=self:<旧id>、speaker_id=''
db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id)
  VALUES('2026-11-04','old/s-legacy.md',1,1,'self',?,'qq',0,10,'00:00:00 [1] 汐：旧的',?, '{}', ?, '')`)
  .run(SELF_ID, Date.now(), cwd)
const legacyBefore = JSON.stringify(db.prepare("SELECT * FROM raw_meta WHERE line_no=1 AND file='old/s-legacy.md'").get())

// ── user：speaker='user'、speaker_id='' ─────────────────────────
emit('user/message', 10, { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '主人说的一句话' }] })
const u = last()
assert.equal(u.role, 'user')
assert.equal(u.speaker, 'user')
assert.equal(u.speaker_id, '')
out.user = 'ok'

// ── self：speaker='self'、speaker_id=selfId ─────────────────────
emit('assistant/message', 11, { content: [{ type: 'text', text: '她说的一句话' }] })
const a = last()
assert.equal(a.role, 'self')
assert.equal(a.speaker, 'self')
assert.equal(a.speaker_id, SELF_ID)
out.self = 'ok'

// ── self-thought：同样 speaker='self'、speaker_id=selfId ────────
emit('assistant/message', 12, { content: [{ type: 'reasoning', text: '她心里想的' }] })
const t = last()
assert.equal(t.role, 'self-thought')
assert.equal(t.speaker, 'self')
assert.equal(t.speaker_id, SELF_ID)
out.thought = 'ok'

// ── 取不到 selfId：speaker_id='self:unknown' + pending 标记 ─────
const archive2 = new RawArchive({ db, dir: join(DATA_DIR, 'raw2'), cwdPrefixes: ['/root/qq-agent/QQ会话'], log: { info() {}, warn() {} }, getSelfId: () => '' })
archive2.onEvent({ header: { id: 'sess-speaker-2', cwd } }, { type: 'assistant/message', seq: 20, time: Date.now(), data: { content: [{ type: 'text', text: '没有 persona 时写的' }] } })
const unk = db.prepare("SELECT speaker,speaker_id,extra FROM raw_meta WHERE file LIKE '2026-%' AND raw_text LIKE '%没有 persona%'").get()
assert.equal(unk.speaker, 'self')
assert.equal(unk.speaker_id, 'self:unknown')
assert.equal(JSON.parse(unk.extra).pendingIdentity, true)
out.unknown = 'ok'

// ── 旧行不受影响（逐字段比对） ──────────────────────────────────
const legacyAfter = JSON.stringify(db.prepare("SELECT * FROM raw_meta WHERE line_no=1 AND file='old/s-legacy.md'").get())
assert.equal(legacyAfter, legacyBefore, '旧行必须一字不改')
out.legacy = 'ok'

console.log(JSON.stringify(out))
db.close()
