import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
const DIR='/tmp/dy-tz-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const { dayOf, clockOf, stampOf } = await import('../lib/adapter/timefmt.js')
const { openDb } = await import('../lib/store/db.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const out={ok:true,test:'timefmt'}
// UTC 16:16:24 → 北京 2026-11-06 00:16:24（跨日）
const at = Date.UTC(2026,10,5,16,16,24)
assert.equal(clockOf(at), '00:16:24')
assert.equal(dayOf(at), '2026-11-06')
assert.equal(stampOf(at, { now: at }), '00:16')
assert.equal(stampOf(at, { now: at, seconds: true }), '00:16:24')
assert.equal(stampOf(Date.UTC(2026,10,5,15,0), { now: at }), '11-05 23:00')
assert.equal(stampOf(Date.UTC(2025,11,31,12,0), { now: at }), '2025-12-31 20:00')
const { db } = openDb(DIR)
const a = new RawArchive({ db, dir: join(DIR,'raw'), cwdPrefixes:['/root/qq-agent/QQ会话'], log:{info(){},warn(){}} })
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
a.onEvent({header:{id:'tz1',cwd:'/root/qq-agent/QQ会话/私聊_1000000001'}},{type:'user/message',seq:1,time:at,data:{message:{source:{kind:'user'}},content:[{type:'text',text:'跨日测试'}]}})
const row=db.prepare('SELECT day,raw_text FROM raw_meta').get()
assert.equal(row.day,'2026-11-06')
assert.ok(row.raw_text.startsWith('00:16:24'))
// doctor dry-run / apply / 幂等
const SCRIPT=new URL('../scripts/doctor-memory.mjs',import.meta.url).pathname
const run=(args)=>{const r=spawnSync(process.execPath,[SCRIPT,'--db',join(DIR,'memory.db'),...args],{encoding:'utf8'});return {status:r.status,j:JSON.parse(r.stdout)}}
// 造一条错行（UTC 写法）
db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('2026-11-05','2026-11-05/s-x.md',1,2,'user','','qq',0,10,'16:16:24 错行',?, '{}','/root/qq-agent/QQ会话/私聊_1','')`).run(at)
// 导入行：前缀==UTC 时刻（若不排除会被误改）
db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('2026-10-27','d/s-imp.md',1,3,'user','','qq',0,10,'13:12:54 导入行',?, '{"importBatch":"imp-x"}','/root/qq-agent/QQ会话/私聊_1','')`).run(Date.UTC(2026,9,27,13,12,54))
const before=db.prepare('select count(*) c from raw_meta').get().c
const dry=run(['--fix-archive-tz'])
assert.equal(dry.j.dryRun,true); assert.ok(dry.j.matched>=1); assert.equal(dry.j.byDay['2026-10-27'].matched,0,'导入行不许被匹配')
assert.equal(db.prepare('select count(*) c from raw_meta').get().c, before, 'dry-run 不写')
assert.equal(db.prepare("select day from raw_meta where raw_text like '%错行'").get().day,'2026-11-05')
const ap=run(['--fix-archive-tz','--apply','--backup-dir',join(DIR,'bk')])
assert.ok(ap.j.ok)
const fixed=db.prepare("select day,raw_text from raw_meta where raw_text like '%错行'").get()
assert.equal(fixed.day,'2026-11-06'); assert.ok(fixed.raw_text.startsWith('00:16:24'))
const again=run(['--fix-archive-tz'])
assert.equal(again.j.matched,0,'幂等')
assert.ok(again.j.byDay['2026-10-27'].skip>=1,'导入行计入 skip')
console.log(JSON.stringify(out))
