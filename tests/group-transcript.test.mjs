import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-gt-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const {insertMemory}=await import('../lib/store/memories.js'); const {createMemoryService}=await import('../lib/service.js')
const out={ok:true,test:'group-transcript'}
const {db}=openDb(DIR); const raw=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/sdcard/DSHA/渠道'],log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const svc=createMemoryService({db,cfg:{},log:{info(){},warn(){}},recallFn:()=>[],getVectors:()=>new Map(),getMonitor:()=>null,getPersona:()=>null,isOwnerHeader:(h)=>String(h?.cwd??'').includes('/home'),insertMemory,rawArchive:raw})
const msgs=[{speaker:'阿岚',text:'今天去看了海',at:1000},{speaker:'小周',text:'风超大',at:2000},{speaker:'汐',text:'我也想看',at:3000}]
const r=await svc.saveGroupTranscript({groupId:'123456789',groupName:'测试群',messages:msgs,at:3000},{header:{id:'h1',cwd:'/sdcard/DSHA/渠道/qq'}})
assert.equal(r.ok,true); assert.equal(r.archived,3)
assert.equal(db.prepare("select count(*) c from raw_meta where cwd='/sdcard/DSHA/渠道/qq-群'").get().c,3,'全文归档')
assert.equal(db.prepare("select count(*) c from memories").get().c,0,'不写 memories')
const r2=await svc.saveGroupTranscript({groupId:'123456789',messages:msgs,at:3000},{header:{id:'h1',cwd:'/x'}})
assert.equal(r2.archived,0,'同批去重')
assert.equal(db.prepare("select count(*) c from raw_meta").get().c,3)
const rows=db.prepare("select role,speaker,at,raw_text from raw_meta order by at").all()
assert.ok(rows[0].raw_text.includes('阿岚：今天去看了海'))
console.log(JSON.stringify(out))
