import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-gd-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const {insertMemory}=await import('../lib/store/memories.js'); const {createMemoryService}=await import('../lib/service.js')
const {buildGroupDigest}=await import('../lib/group/digest.js')
const out={ok:true,test:'group-digest'}
const {db}=openDb(DIR); const raw=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/sdcard/DSHA/渠道'],log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const svc=createMemoryService({db,crystal:1,cfg:{},log:{info(){},warn(){}},recallFn:()=>[],getVectors:()=>new Map(),getMonitor:()=>null,getPersona:()=>null,isOwnerHeader:()=>true,insertMemory,rawArchive:raw})
const header={id:'h1',cwd:'/sdcard/DSHA/生活/数据/home'}
const msgs=[{speaker:'阿岚',text:'今天去看了海'},{speaker:'小周',text:'[图片]'},{speaker:'阿岚',text:'风超大'.repeat(50)}]
const g=buildGroupDigest({groupName:'测试群',groupId:'123456789',messages:msgs})
assert.ok(g.text.startsWith('[群聊摘要] 测试群(123456789) 最近 2 条：'))
assert.ok(g.text.length<=800&&g.text.includes('阿岚：'))
const r=await svc.saveGroupDigest({groupName:'测试群',groupId:'123456789',messages:msgs,at:1000},{header})
assert.equal(r.ok,true); assert.ok(r.id>0)
const m=db.prepare('select * from memories where id=?').get(r.id)
assert.equal(m.kind,'episode'); assert.equal(m.layer,'auto'); assert.equal(m.scope_type,'public'); assert.equal(m.scope_id,''); assert.equal(m.source_channel,'qq-group'); assert.ok(m.source_msg_id.startsWith('group:'))
const r2=await svc.saveGroupDigest({groupName:'测试群',groupId:'123456789',messages:msgs,at:1000},{header})
assert.equal(r2.duplicate,true,'同窗口去重')
assert.equal(db.prepare("select count(*) c from memories where source_channel='qq-group'").get().c,1)
assert.ok(db.prepare("select count(*) c from raw_meta where cwd like '%qq-群%'").get().c>=1,'归档')
const e=await svc.saveGroupDigest({messages:[]},{header}); assert.equal(e.ok,false)
console.log(JSON.stringify(out))
