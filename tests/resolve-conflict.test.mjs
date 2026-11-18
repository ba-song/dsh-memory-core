import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
const DIR='/tmp/dy-rc-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {insertMemory}=await import('../lib/store/memories.js'); const {createMemoryService}=await import('../lib/service.js')
const {resolveConflictRow}=await import('../lib/conflict/resolve.js')
const out={ok:true,test:'resolve-conflict'}
const {db}=openDb(DIR)
let seq=0
const mk=async(text)=>{const id=await insertMemory(db,{kind:'fact',text,layer:'manual',scopeType:'owner'}); const otherId=await insertMemory(db,{kind:'fact',text:text+' other',layer:'manual',scopeType:'owner'}); const qid=Number(db.prepare("insert into conflict_queue(memory_a,memory_b,reason,created_at,status) values(?,?, 'dup',?, 'pending')").run(id,otherId,Date.now()).lastInsertRowid); return {id,otherId,qid}}
const home={id:'h1',cwd:'/sdcard/DSHA/生活/数据/home'}
const svc=createMemoryService({db,cfg:{},log:{info(){},warn(){}},recallFn:()=>[],getVectors:()=>new Map(),getMonitor:()=>null,getPersona:()=>null,isOwnerHeader:(h)=>String(h?.cwd??'').includes('/home')||String(h?.cwd??'').startsWith('/root/qq-agent/QQ会话/私聊_'),insertMemory})
// keep old → new 删除
let p=await mk('keep old 场景'); const a1=p.id,a1Other=p.otherId,q1=p.qid
let r=svc.resolveConflict({id:q1,action:'keep',side:'old'},{header:home})
assert.equal(r.ok,true); assert.equal(db.prepare('select count(*) c from memories where id=?').get(a1Other).c,0,'new 被删')
assert.equal(db.prepare('select status from conflict_queue where id=?').get(q1).status,'resolved')
// 幂等
r=svc.resolveConflict({id:q1,action:'keep',side:'old'},{header:home}); assert.equal(r.alreadyResolved,true)
// keep new → old 删
p=await mk('keep new 场景'); const a2=p.id,a2Other=p.otherId,q2=p.qid
r=svc.resolveConflict({id:q2,action:'keep',side:'new'},{header:home}); assert.equal(r.ok,true)
assert.equal(db.prepare('select count(*) c from memories where id=?').get(a2).c,0,'old 被删')
// drop new：new 侧真实存在，迁移为 corrected；old 侧继续保留。
p=await mk('drop new'); r=svc.resolveConflict({id:p.qid,action:'drop',side:'new'},{header:home}); assert.equal(r.ok,true)
assert.equal(db.prepare('select count(*) c from memories where id=?').get(p.id).c,1,'drop 不物理删')
assert.equal(db.prepare('select status from memories where id=?').get(p.id).status,'active')
assert.equal(db.prepare('select status from memories where id=?').get(p.otherId).status,'corrected')
// drop old → 旧侧标 corrected：行数不减、revision+1、留一条修订快照
p=await mk('drop old'); r=svc.resolveConflict({id:p.qid,action:'drop',side:'old'},{header:home}); assert.equal(r.ok,true)
assert.equal(db.prepare('select count(*) c from memories where id=?').get(p.id).c,1,'drop 后行数不减')
assert.equal(db.prepare('select status from memories where id=?').get(p.id).status,'corrected')
assert.equal(db.prepare('select revision from memories where id=?').get(p.id).revision,2)
assert.equal(db.prepare('select count(*) c from memory_revisions where memory_id=?').get(p.id).c,1,'revisions+1')
// 审计
const aud=db.prepare("select v from meta where k like 'conflict_audit_%'").all()
assert.ok(aud.length>=4); assert.ok(aud.every((a)=>JSON.parse(a.v).at>0&&JSON.parse(a.v).actor==='owner'))
assert.ok(aud.some((a)=>JSON.parse(a.v).action==='drop'&&JSON.parse(a.v).side==='old'))
// 权限
assert.throws(()=>svc.resolveConflict({id:1,action:'keep',side:'old'},{header:{id:'g',cwd:'/sdcard/DSHA/渠道/qq-群'}}),/E_PERMISSION|只有主人/)
assert.throws(()=>svc.resolveConflict({id:1,action:'keep',side:'old'},{}),/E_PERMISSION|必须带 header/)
console.log(JSON.stringify(out))
