import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-ga-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const out={ok:true,test:'group-archive-tool'}
const {db}=openDb(DIR); const raw=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/sdcard/DSHA/渠道'],log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const {ensureContactsSchema,seedOwner}=await import('../lib/store/contacts.js')
const seed=openDb(DIR); ensureContactsSchema(seed.db); seedOwner(seed.db,{ownerQQ:'1000000001'}); seed.db.close()
const tools={},handlers={}
const ctx={get(n){if(n==='tools')return{register:(d)=>{tools[d.name]=d}};if(n==='systemPrompt')return{context:()=>()=>{}};if(n==='agents')return{list:()=>[]};return undefined},on(e,f){handlers[e]=f},provide(){return()=>{}},logger:{info(){},warn(){}}}
const mod=await import('../lib/index.js'); mod.apply(ctx,{ownerQQ:'1000000001',trustedDirs:['/sdcard/DSHA/生活/数据/home']})
const ownerExec={agent:{session:{header:{id:'h1',cwd:'/sdcard/DSHA/生活/数据/home'}}}}
const grpExec={agent:{session:{header:{id:'g1',cwd:'/sdcard/DSHA/渠道/qq-群'}}}}
// 造 25 条
for(let i=0;i<25;i++) raw.onEvent({header:{id:'grp',cwd:'/sdcard/DSHA/渠道/qq-群'}},{type:'user/message',seq:i,time:Date.now()+i,data:{message:{source:{kind:'user'}},content:[{type:'text',text:'阿岚：消息'+i}]}})
const ok=JSON.parse((await tools.dy_memory_group_archive.execute({limit:20},ownerExec)).detail)
assert.equal(ok.ok,true); assert.equal(ok.denied,undefined,'不应被判非主人'); assert.equal(ok.items.length,20,'limit 截断')
const denied=JSON.parse((await tools.dy_memory_group_archive.execute({limit:5},grpExec)).detail)
assert.equal(denied.denied,true); assert.equal(denied.items.length,0,'非 owner 空')
assert.ok(db.prepare("select count(*) c from meta where k like 'group_archive_denied_%'").get().c>=1,'审计')
console.log(JSON.stringify(out))
