import assert from 'node:assert'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-pj-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const WS='/sdcard/DSHA/工作区'
const {openDb}=await import('../lib/store/db.js'); const {ensureProjectSchema,resolveProject,upsertProject,addDecision,listDecisions,decisionsBlock}=await import('../lib/project/index.js')
const {db}=openDb(DIR); ensureProjectSchema(db); ensureProjectSchema(db) // 幂等
const out={ok:true,test:'project-decisions'}
// 解析
assert.equal(resolveProject('/sdcard/DSHA/生活/数据/home'),null,'home 不是项目')
assert.equal(resolveProject('/sdcard/DSHA/渠道/qq'),null,'渠道不是项目')
const rootP=resolveProject('/sdcard/DSHA/工作区'); assert.ok(rootP&&rootP.root==='/sdcard/DSHA/工作区','工作区根 → 根项目')
const sub=join(WS,'项目A','src'); 
const p=resolveProject(sub); // 无 AGENTS 时回落到工作区根
assert.ok(p&&p.id.startsWith('proj:'))
// upsert
let u=upsertProject(db,{root:join(WS,'项目A'),name:'项目A'}); assert.equal(u.ok,true); const pid=u.project.id
u=upsertProject(db,{id:pid,name:'项目A2'}); assert.equal(u.project.name,'项目A2')
assert.equal(upsertProject(db,{}).ok,false)
// 决策
let d=addDecision(db,{project:pid,title:'用 SQLite',choice:'文件库',reason:'轻量',options:['a','b']})
assert.equal(d.ok,true); const did=d.decision.id
assert.equal(addDecision(db,{project:pid,id:did,title:'x',choice:'y'}).ok,false,'不覆盖同 id')
assert.equal(addDecision(db,{project:'',title:'x',choice:'y'}).ok,false)
assert.equal(addDecision(db,{project:pid,title:'',choice:'y'}).ok,false)
const L=listDecisions(db,{project:pid}); assert.equal(L.count,1)
assert.equal(listDecisions(db,{project:pid,query:'SQLite'}).count,1)
// 注入块 ≤3 条 ≤120 字
for(let i=0;i<5;i++) addDecision(db,{project:pid,title:'决策'+i,choice:'选择'+i,reason:'理由'.repeat(40)})
const blk=decisionsBlock(db,pid)
assert.ok(blk.startsWith('【项目决策】'))
const lines=blk.split('\n').filter(l=>l.startsWith('- '))
assert.ok(lines.length<=3,'最多 3 条'); assert.ok(lines.every(l=>l.length<=120),'每条 ≤120')
assert.equal(decisionsBlock(db,''),'')
// scope：非 owner 工具返回空
const tools={}
const ctx={get(n){if(n==='tools')return{register:(d)=>{tools[d.name]=d}};if(n==='systemPrompt')return{context:()=>()=>{}};if(n==='agents')return{list:()=>[]};return undefined},on(){},provide(){return()=>{}},logger:{info(){},warn(){}}}
const mod=await import('../lib/index.js'); mod.apply(ctx,{ownerQQ:'1000000001',trustedDirs:['/sdcard/DSHA/生活/数据/home']})
const grp={agent:{session:{header:{id:'g',cwd:'/sdcard/DSHA/渠道/qq-群'}}}}
assert.equal(JSON.parse((await tools.dy_memory_decision_list.execute({},grp)).detail).decisions.length,0,'群拒绝')
assert.equal(JSON.parse((await tools.dy_memory_decision_add.execute({title:'t',choice:'c',project:pid},grp)).detail).ok,false,'群不可写')
console.log(JSON.stringify(out))
