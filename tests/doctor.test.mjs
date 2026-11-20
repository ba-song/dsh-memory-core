/**
 * doctor-memory 只读体检 —— 2026-11-05
 *
 * 5 个场景：健康 → 0；缺库 → 3；向量孤儿 → 1（WARN）；缺核心表 → 2（FAIL）；raw_fts 孤儿 → 1。
 * 另断言体检前后库文件字节不变（只读）。
 */
import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const DIR = '/tmp/dy-doctor-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory, saveVector } = await import('../lib/store/memories.js')
const { RawArchive } = await import('../lib/ingest/archive.js')

const SCRIPT = new URL('../scripts/doctor-memory.mjs', import.meta.url).pathname
const DB = join(DIR, 'memory.db')
const run = (dbPath = DB) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--db', dbPath], { encoding: 'utf8' })
  let json = null
  try { json = JSON.parse(r.stdout) } catch {}
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const modelAvailable = existsSync('/opt/qqai/models/bge-small-zh/tokenizer.json')
const out = { ok: true, test: 'doctor', healthyWarns: modelAvailable ? [] : ['embedding'] }

// 造一个健康库：1 条记忆 + 向量 + FTS；1 行原话 + 文件
const { db } = openDb(DIR)
const id = await insertMemory(db, { kind: 'fact', text: '主人喜欢看海', importance: 0.8, layer: 'manual' })
await saveVector(db, id, new Float32Array(8).fill(0.1))
const archive = new RawArchive({ db, dir: join(DIR, 'raw'), cwdPrefixes: ['/root/qq-agent/QQ会话'], log: { info() {}, warn() {} } })
archive.onEvent(
  { header: { id: 'doctor-sess', cwd: '/root/qq-agent/QQ会话/私聊_1000000001' } },
  { type: 'user/message', seq: 1, time: Date.now(), data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: '一句话' }] } },
)

const before = sha(DB)
const healthy = run()
// embedding 现在真可用 → 健康库应 0
assert.equal(healthy.status, modelAvailable ? 0 : 1, `健康库状态应与模型可用性一致，实际 ${healthy.status}`)
assert.equal(healthy.json.verdict, modelAvailable ? 'PASS' : 'WARN')
assert.equal(sha(DB), before, '体检不得改库（字节不变）')
out.healthy = 'ok'

// 缺库 → ERROR 3
const missing = run(join(DIR, 'nope.db'))
assert.equal(missing.status, 3)
assert.equal(missing.json.verdict, 'ERROR')
out.missing = 'ok'

// 向量孤儿 → WARN 1
const { db: db2 } = openDb(DIR + '-warn')
new RawArchive({ db: db2, dir: join(DIR + '-warn', 'raw'), cwdPrefixes: ['/root/qq-agent/QQ会话'], log: { info() {}, warn() {} } })
await insertMemory(db2, { kind: 'fact', text: '一条记忆', layer: 'manual' })
await saveVector(db2, 999, new Float32Array(8).fill(0.2))
const warn = run(join(DIR + '-warn', 'memory.db'))
assert.equal(warn.status, 1, `向量孤儿应 WARN，实际 ${warn.status}`)
assert.equal(warn.json.verdict, 'WARN')
assert.ok(warn.json.checks.some((c) => c.name === 'vectors' && c.status === 'WARN'))
out.warn = 'ok'

// 缺核心表 → FAIL 2
const { db: db3 } = openDb(DIR + '-fail')
db3.exec('DROP TABLE vectors')
const fail = run(join(DIR + '-fail', 'memory.db'))
assert.equal(fail.status, 2, `缺表应 FAIL，实际 ${fail.status}`)
assert.equal(fail.json.verdict, 'FAIL')
assert.ok(fail.json.checks.some((c) => c.name === 'tables' && c.status === 'FAIL'))
out.fail = 'ok'

// raw_fts 孤儿 → WARN 1
const { db: db4 } = openDb(DIR + '-fts')
new RawArchive({ db: db4, dir: join(DIR + '-fts', 'raw'), cwdPrefixes: ['/root/qq-agent/QQ会话'], log: { info() {}, warn() {} } })
db4.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(424242, 'x')
const ftsWarn = run(join(DIR + '-fts', 'memory.db'))
assert.equal(ftsWarn.status, 1)
assert.ok(ftsWarn.json.checks.some((c) => c.name === 'orphans' && c.status === 'WARN'))
out.orphan = 'ok'


// ── 增强参数：--json（单行）/ --fix-speaker（幂等）/ --verify-import（对/错） ──
const runArgs = (args) => { const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' }); let j = null; try { j = JSON.parse(r.stdout) } catch {}; return { status: r.status, json: j, stdout: r.stdout } }
const j1 = runArgs(['--db', DB, '--json'])
assert.equal(j1.stdout.trim().split('\n').length, 1, '--json 应单行')
assert.equal(j1.json.verdict, 'PASS')
const insLegacy = (d, day, file, role, speaker, extra) => d.prepare(
  `INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id)
   VALUES(?,?,1,1,?,?,'qq',0,1,'x',?,?,'','')`).run(day, file, role, speaker, Date.now(), extra)

// --fix-speaker：第一次 1 行，第二次 0（幂等），列值正确
const { db: db5 } = openDb(DIR + '-fix')
new RawArchive({ db: db5, dir: join(DIR + '-fix', 'raw'), cwdPrefixes: ['/root/qq-agent/QQ会话'], log: { info() {}, warn() {} } })
db5.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
insLegacy(db5, '2026-11-04', 'x/s-a.md', 'self', 'self:old-id', '{}')
const fix1 = runArgs(['--db', join(DIR + '-fix', 'memory.db'), '--fix-speaker'])
assert.equal(fix1.status, 0)
assert.equal(fix1.json.updated.total, 1, '第一次应修 1 行')
const fix2 = runArgs(['--db', join(DIR + '-fix', 'memory.db'), '--fix-speaker'])
assert.equal(fix2.json.updated.total, 0, '第二次应幂等 0')
const row = db5.prepare("SELECT speaker,speaker_id FROM raw_meta WHERE file='x/s-a.md'").get()
assert.equal(row.speaker, 'self')
assert.equal(row.speaker_id, 'self:old-id')

// --verify-import：对 → PASS；把 meta 行数改错 → FAIL/2
const { db: db6 } = openDb(DIR + '-imp')
new RawArchive({ db: db6, dir: join(DIR + '-imp', 'raw'), cwdPrefixes: ['/root/qq-agent/QQ会话'], log: { info() {}, warn() {} } })
db6.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const batch = 'imp-test-1'
insLegacy(db6, '2026-10-27', 'd/s-1.md', 'user', 'user', JSON.stringify({ importBatch: batch }))
insLegacy(db6, '2026-10-27', 'd/s-2.md', 'user', 'user', JSON.stringify({ importBatch: batch }))
db6.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('import_1027_1029_batch',?)").run(batch)
db6.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('import_1027_1029_rows','2')").run()
db6.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('import_1027_1029_frozen','1')").run()
const vOk = runArgs(['--db', join(DIR + '-imp', 'memory.db'), '--verify-import', '--batch', batch])
assert.ok(vOk.json.checks.some((c) => c.name === 'verify-import' && c.status === 'PASS'), '导入校验应 PASS')
db6.prepare("UPDATE meta SET v='5' WHERE k='import_1027_1029_rows'").run()
const vBad = runArgs(['--db', join(DIR + '-imp', 'memory.db'), '--verify-import', '--batch', batch])
assert.equal(vBad.status, 2, '行数不符应 FAIL/2')
assert.ok(vBad.json.checks.some((c) => c.name === 'verify-import' && c.status === 'FAIL'))
const stubEnv = { ...process.env, DY_EMBED_MODEL: '/nonexistent-model-' + process.pid }
const rStub = spawnSync(process.execPath, [SCRIPT, '--db', DB], { encoding: 'utf8', env: stubEnv })
const jStub = JSON.parse(rStub.stdout)
assert.equal(rStub.status, 1, '模型缺失应 WARN/1')
assert.deepEqual(jStub.checks.filter((c) => c.status === 'WARN').map((c) => c.name), ['embedding'])
out.enhanced = 'ok'

console.log(JSON.stringify(out))
