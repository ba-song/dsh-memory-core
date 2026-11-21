import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
const DIR='/tmp/dy-hb-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {ensureProjectSchema,upsertProject,addDecision,resolveProject}=await import('../lib/project/index.js')
const {insertMemory}=await import('../lib/store/memories.js'); const {handoffBrief}=await import('../lib/handoff/brief.js')
const out={ok:true,test:'handoff-brief'}
const {db}=openDb(DIR); ensureProjectSchema(db)
const WS='/sdcard/DSHA/工作区'
const rp=resolveProject(WS+'/项目A')
const pj=upsertProject(db,{root:rp.root,name:rp.name}).project
addDecision(db,{project:pj.id,title:'用 SQLite',choice:'文件库',reason:'轻量'})
await insertMemory(db,{kind:'todo',text:'补测试',scopeType:'owner',layer:'manual'})
await insertMemory(db,{kind:'todo',text:'旧版空状态待办保留',scopeType:'owner',layer:'manual',status:''})
await insertMemory(db,{kind:'todo',text:'未来生效待办不得进入简报',scopeType:'owner',layer:'manual',validFrom:Date.now()+60_000})
const supersededTodo=await insertMemory(db,{kind:'todo',text:'已替代待办不得进入简报',scopeType:'owner',layer:'manual'})
db.prepare('update memories set superseded_by=? where id=(select max(id) from memories)').run(999999)
try { db.prepare("update memories set project_id=? where kind='todo'").run(pj.id) } catch {}
const owner=handoffBrief(db,{cwd:WS+'/项目A',isOwner:true,recent:[{role:'user',text:'这个问题怎么修'}]})
assert.ok(owner.text.startsWith('【交接简报】')&&owner.text.includes(rp.name)&&owner.text.includes('SQLite')&&owner.text.includes('补测试'),'owner 有项目/决策/待办')
assert.ok(owner.text.includes('旧版空状态待办保留'),'handoff 保留空/active 旧 todo 状态域')
assert.ok(!owner.text.includes('未来生效待办不得进入简报')&&!owner.text.includes('已替代待办不得进入简报'),'handoff 排除 future/superseded todo')
assert.ok(owner.text.includes('最后没回'),'最后没回')
// 群：不泄漏项目
const grp=handoffBrief(db,{cwd:'/sdcard/DSHA/渠道/qq-群',isOwner:false,recent:[{role:'user',text:'群里问一句'}]})
assert.ok(!grp.text.includes(rp.name)&&!grp.text.includes('SQLite')&&!grp.text.includes('补测试'),'群不泄漏')
assert.ok(grp.text.includes('最后没回'))
// 陌生人
const ext=handoffBrief(db,{cwd:'/root/qq-agent/QQ会话/私聊_123',isOwner:false,recent:[{role:'user',text:'你好'},{role:'assistant',text:'你好呀'}]})
assert.ok(!ext.text.includes('项目')&&!ext.text.includes('SQLite'))
assert.ok(!ext.text.includes('最后没回'),'已回不算')
// 空、无 header、截断
assert.equal(handoffBrief(db,{cwd:WS+'/项目A',isOwner:true,recent:[]}).text.includes(rp.name),true)
const noHeader=handoffBrief(db,{cwd:'/unknown',recent:[]}); assert.equal(noHeader.text,'')
const long=handoffBrief(db,{cwd:WS+'/项目A',isOwner:true,recent:Array.from({length:50},(_,i)=>({role:'user',text:'很长的一句话'.repeat(20)+i})),maxChars:200})
assert.ok(long.text.length<=200,'截断')
console.log(JSON.stringify(out))
