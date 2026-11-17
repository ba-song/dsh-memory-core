import { openDb, writeTx } from '../lib/store/db.js'
import assert from 'node:assert'

const dir = '/tmp/dy-memory-lock-' + process.pid
const A = openDb(dir)
const B = openDb(dir)
const { db: a } = A, { db: b } = B

// 1) 写锁被占：B 重试后仍失败（busy_timeout 5s + 2 次重试）
a.exec('BEGIN IMMEDIATE')
a.prepare("INSERT INTO memories(text,created_at_epoch) VALUES('a',1)").run()
let failed = false
const t0 = Date.now()
try {
  await writeTx(b, (d) => { d.prepare("INSERT INTO memories(text,created_at_epoch) VALUES('b',2)").run() }, { attempts: 2, backoff: [100, 100] })
} catch (e) { failed = /locked|busy/i.test(String(e?.message)) }
a.exec('COMMIT')
assert.ok(failed, '被锁时应重试后失败')

// 2) 锁释放后能写
await writeTx(b, (d) => { d.prepare("INSERT INTO memories(text,created_at_epoch) VALUES('c',3)").run() })
assert.ok(b.prepare("SELECT count(*) c FROM memories WHERE text='c'").get().c === 1)

// 3) 快照冲突：读事务持有旧快照，另一连接提交后再写
const R = openDb(dir)
const W = openDb(dir)
R.db.exec('BEGIN')
R.db.prepare('SELECT count(*) c FROM memories').get()
await writeTx(W.db, (d) => { d.prepare("INSERT INTO memories(text,created_at_epoch) VALUES('w',4)").run() })
// R 此时写入会撞快照冲突；writeTx 必须回滚重开并成功
await writeTx(R.db, (d) => { d.prepare("INSERT INTO memories(text,created_at_epoch) VALUES('r',5)").run() })
assert.ok(W.db.prepare("SELECT count(*) c FROM memories WHERE text='r'").get().c === 1)
console.log(JSON.stringify({ ok: true, test: 'lock', firstFailMs: Date.now() - t0 }))
