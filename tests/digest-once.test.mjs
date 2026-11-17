import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-dgo-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const {db}=openDb(DIR); const a=new RawArchive({db,dir:join(DIR,'raw'),log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('2026-11-06','d/x.md',1,1,'user','','qq',0,10,'10:00:00 [1] 主人：家里说看海',?,'{}','/sdcard/DSHA/生活/数据/home','')`).run(Date.now())
const warns=[]; const handlers={}
const mkAgent=(ctx,sid='d1')=>({session:{header:{cwd:'/sdcard/DSHA/生活/数据/home',id:sid}},ctx})
const makeCtx=(store)=>({systemPrompt:{context:(c)=>{store.push(c);return()=>{}}}})   // 故意没有 promptContexts getter
const tools={}
const ctx={get(n){if(n==='tools')return{register:(d)=>{tools[d.name]=d}};if(n==='systemPrompt')return{context:()=>()=>{}};if(n==='agents')return{list:()=>[]};return undefined},on(e,f){handlers[e]=f},provide(){return()=>{}},logger:{info(){},warn:(m)=>warns.push(m),debug(){}}}
const mod=await import('../lib/index.js'); mod.apply(ctx,{ownerQQ:'1000000001',trustedDirs:['/sdcard/DSHA/生活/数据/home']})
const out={ok:true,test:'digest-once'}
// 同一 agent（同一 ctx）多轮：只注册一次
const s1=[]; const ag1=mkAgent(makeCtx(s1))
handlers['agent/created']({agent:ag1}); handlers['agent/created']({agent:ag1})
assert.equal(s1.filter(c=>c.name==='dy-digest').length,1,'同一 agent 摘要只注册一次')
assert.equal(s1.filter(c=>c.name==='dy-memory-stable').length,1,'常驻块一次')
// 不同 agent：各一次
const s2=[]; handlers['agent/created']({agent:mkAgent(makeCtx(s2),'d2')})
assert.equal(s2.filter(c=>c.name==='dy-digest').length,1,'新 agent 摘要注册一次')
// 宿主报 already registered → 不再 warn、不再重试
const s3=[]; const ag3={session:{header:{cwd:'/sdcard/DSHA/生活/数据/home',id:'d3'}},ctx:{systemPrompt:{context:()=>{throw new Error('prompt context "dy-digest" is already registered in this scope')}}}}
const before=warns.length; handlers['agent/created']({agent:ag3}); handlers['agent/created']({agent:ag3})
assert.equal(warns.length,before,'already registered 不 warn')
// diag 计数：发一条问句，stats 里 question 计数 +1、lastDrop 有值
handlers['session/event']({header:{id:'x1',cwd:'/sdcard/DSHA/生活/数据/home'}},{type:'user/message',seq:1,time:Date.now(),data:{message:{source:{kind:'user'}},content:[{type:'text',text:'你是不是就像住进手机里了'}]}})
await new Promise(r=>setTimeout(r,300))
const st=JSON.parse((await tools.dy_memory_stats.execute({}, {agent:{session:{header:{cwd:'/sdcard/DSHA/生活/数据/home',id:'x1'}}}})).detail)
assert.ok(st.autoExtract.diag.counts.question>=1,'diag 计数自增')
assert.ok(st.autoExtract.diag.lastDrop?.reason,'lastDrop 有 reason')
assert.ok(st.autoExtract.diag.attempts>=1,'attempts 计数')
assert.ok(st.autoExtract.diag.lastAttemptAt>0,'lastAttemptAt')
// getter 会抛的 ctx：不崩、能注册、不 warn
const s4=[]; const ag4={session:{header:{cwd:'/sdcard/DSHA/生活/数据/home',id:'d4'}},ctx:{get promptContexts(){throw new Error('cannot get property "promptContexts" without inject')},systemPrompt:{context:(c)=>{s4.push(c);return()=>{}}}}}
const w0=warns.length; handlers['agent/created']({agent:ag4})
assert.equal(s4.filter(c=>c.name==='dy-digest').length,1,'抛异常 getter 也能注册'); assert.equal(warns.length,w0,'不 warn')
console.log(JSON.stringify(out))
