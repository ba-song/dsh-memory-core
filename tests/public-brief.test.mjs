import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-pb-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {insertMemory}=await import('../lib/store/memories.js')
const {createMemoryService}=await import('../lib/service.js')
const out={ok:true,test:'public-brief'}
const {db}=openDb(DIR)
const svc=createMemoryService({db,cfg:{},log:{info(){},warn(){}},recallFn:()=>[],getVectors:()=>new Map(),getMonitor:()=>null,getPersona:()=>null,isOwnerHeader:(h)=>String(h?.cwd??'').includes('/home'),insertMemory})
const home={id:'h1',cwd:'/sdcard/DSHA/生活/数据/home'}
const group={id:'g1',cwd:'/sdcard/DSHA/渠道/qq-群'}
const r=await svc.publishPublic({text:'今天在家看了海，心情还行'},{header:home})
assert.equal(r.ok,true); assert.ok(r.id>0)
const m=db.prepare('select * from memories where id=?').get(r.id)
assert.ok(m.text.startsWith('[汐的近况]')); assert.equal(m.scope_type,'public'); assert.equal(m.scope_id,''); assert.equal(m.source_channel,'self-brief'); assert.equal(m.kind,'episode')
const r2=await svc.publishPublic({text:'今天在家看了海，心情还行'},{header:home}); assert.equal(r2.duplicate,true)
await assert.rejects(()=>svc.publishPublic({text:'非主人'},{header:group}), /E_PERMISSION|只有家/)
// 过期：把 ttl 设成 0.0001 天
const r3=await svc.publishPublic({text:'马上过期',ttlDays:0.00001},{header:home}); assert.equal(r3.ok,true)
db.prepare('UPDATE memories SET created_at_epoch=? WHERE id=?').run(Date.now()-10*86400*1000, r3.id)
const brief=svc.publicBrief({limit:5})
assert.deepEqual(brief,[],'没有可验证的目标 Conversation 与授权引用时 fail closed')
// 不含 owner/contact scope
db.prepare("INSERT INTO memories(kind,text,scope_type,scope_id,created_at_epoch) VALUES('fact','私密',?,? ,?)").run('owner','owner','1')
assert.ok(!svc.publicBrief({limit:10}).some((x)=>x.text==='私密'))
console.log(JSON.stringify(out))
