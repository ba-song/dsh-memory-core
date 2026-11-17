import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-dg-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const {buildDigest}=await import('../lib/inject/digest.js'); const {insertMemory}=await import('../lib/store/memories.js')
const {db}=openDb(DIR); const a=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/sdcard/DSHA/渠道','/root/qq-agent/QQ会话'],log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const HOME='/sdcard/DSHA/生活/数据/home', QQ='/sdcard/DSHA/渠道/qq', GROUP='/sdcard/DSHA/渠道/qq/群_1'
let n=0; const put=(cwd,role,txt)=>{n+=1;db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('2026-11-06','d/x.md',?,?,?,'','qq',0,?,?,?, '{}',?,'')`).run(n,n,role,txt.length,'10:00:00 [1] '+role+'：'+txt,Date.now()-n*1000,cwd)}
put(HOME,'user','家里说想看海'); put(HOME,'self','我说好'); put(QQ,'user','qq说晚安'); put(QQ,'user','qq说晚安'); put(QQ,'user','[QQ·私聊·主人(1)] [补收·09:00] 真要我修⏎⏎【这个房间的规矩】\n- 规则\nCurrent runtime context\nxx')
put(GROUP,'user','群里不该出现')
const d=buildDigest(db)
assert.ok(d.includes('【家】')&&d.includes('【QQ】'),'按房间分组')
assert.ok(!d.includes('群里不该出现'),'群不注入')
assert.equal((d.match(/qq说晚安/g)||[]).length,1,'去重')
assert.ok(d.length<=400,'≤400')
assert.ok(!d.includes('[补收·')&&!d.includes('[QQ·')&&!d.includes('这个房间的规矩')&&!d.includes('Current runtime context')&&!d.includes('⏎'),'摘要不带包装')
assert.equal(buildDigest(db,{now:Date.now()+13*3600*1000}),'','12h 外无内容时不注入')
console.log(JSON.stringify({ok:true,test:'digest',len:d.length}))
