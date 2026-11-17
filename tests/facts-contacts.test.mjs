import assert from 'node:assert'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
process.env.DY_MEMORY_DIR='/tmp/dy-fc-'+process.pid
const DIR=process.env.DY_MEMORY_DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {pickFacts,buildStable}=await import('../lib/inject/stable.js')
const card=['# 事实卡','## 全局','- 全局一条','## 主人','- 主人一条','## 群','- 群一条','## 人','- 人一条'].join('\n')
const p=join(DIR,'c.md'); writeFileSync(p,card)
const out={ok:true,test:'facts-contacts'}
assert.deepEqual(pickFacts(card,{isOwner:true}),['- 全局一条','- 主人一条'])
assert.deepEqual(pickFacts(card,{isGroup:true}),['- 全局一条','- 群一条'])
assert.deepEqual(pickFacts(card,{}),['- 全局一条'])
assert.deepEqual(pickFacts('- 旧格式一条',{isOwner:true}),['- 旧格式一条'],'旧整文当全局')
assert.equal(buildStable('/x',{factsPath:join(DIR,'empty.md')}),'')
writeFileSync(join(DIR,'empty.md'),'# 事实卡\n## 主人\n'); assert.equal(buildStable('/x',{factsPath:join(DIR,'empty.md'),isOwner:true}),'')
// 联系人工具
const {openDb}=await import('../lib/store/db.js'); const {ensureContactsSchema,seedOwner,addContact}=await import('../lib/store/contacts.js')
const {db}=openDb(DIR); const {RawArchive}=await import('../lib/ingest/archive.js'); new RawArchive({db,dir:join(DIR,'raw'),log:{info(){},warn(){}}}); ensureContactsSchema(db); seedOwner(db,{ownerQQ:'1000000001'}); addContact(db,{id:'contact:a',displayName:'A'}); addContact(db,{id:'contact:b',displayName:'B'})
const handlers={},registered={}
const ctx={get(n){if(n==='tools')return{register:d=>{registered[d.name]=d}};if(n==='systemPrompt')return{context:()=>()=>{}};if(n==='agents')return{list:()=>[]}},on(e,f){handlers[e]=f},provide(){return()=>{}},logger:{info(){},warn(){}}}
const mod=await import('../lib/index.js'); mod.apply(ctx,{ownerQQ:'1000000001'})
const exec={agent:{session:{header:{cwd:'/root/qq-agent/QQ会话/私聊_1000000001',id:'f1'}}}}
const list=JSON.parse((await registered.dy_memory_contacts.execute({},exec)).detail)
assert.equal(list.ok,true); assert.ok(list.items.some(x=>x.id==='contact:a'))
const bad=JSON.parse((await registered.dy_memory_contact_merge.execute({from:'contact:x',to:'contact:b'},exec)).detail)
assert.equal(bad.ok,false,'不存在 id 拒绝')
db.prepare("INSERT INTO memories(kind,text,speaker_id,created_at_epoch) VALUES('fact','x','contact:a',?)").run(Date.now())
const mg=JSON.parse((await registered.dy_memory_contact_merge.execute({from:'contact:a',to:'contact:b'},exec)).detail)
assert.equal(mg.ok,true); assert.equal(mg.updated.speaker,1)
assert.ok(db.prepare("select v from meta where k like 'contact_merge_%'").get(),'写审计')
console.log(JSON.stringify(out))
