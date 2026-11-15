import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-pe-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const out={ok:true,test:'person-email'}
const {db}=openDb(DIR)
const a=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/sdcard/DSHA/渠道','/root/qq-agent/QQ会话','/sdcard/DSHA/生活/数据/home'],log:{info(){},warn(){}},owner:{ownerQQ:'1000000001',ownerEmail:'owner@example.com',ownerAddresses:['owner2@example.com','owner3@example.com'],ownerDirs:['/sdcard/DSHA/生活/数据/home']}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const put=(cid,txt,seq)=>a.onEvent({header:{id:'m1',cwd:'/sdcard/DSHA/渠道/email'}},{type:'user/message',seq,time:Date.now(),data:{message:{source:{kind:'user',contactId:cid}},content:[{type:'text',text:txt}]}})
put('owner@example.com','主人一号',1); put('owner2@example.com','主人二号',2); put('owner3@example.com','主人三号',3)
put('stranger@example.com','陌生人',4)
const rows=db.prepare('select person_id,channel from raw_meta').all()
assert.equal(rows.filter(r=>r.person_id==='person:owner').length,3,'owner 三邮箱')
const s=rows.find(r=>r.person_id.startsWith('person:contact:email:'))
assert.equal(s.person_id,'person:contact:email:stranger@example.com'); assert.equal(s.channel,'email','channel 字段为 email')
// QQ/群/self 回归
const q=(cwd,sid,txt,seq)=>a.onEvent({header:{id:sid,cwd}},{type:'user/message',seq,time:Date.now(),data:{message:{source:{kind:'user'}},content:[{type:'text',text:txt}]}})
q('/root/qq-agent/QQ会话/私聊_123456','q1','陌生人qq',1)
q('/root/qq-agent/QQ会话/群_123456789','g1','群里',1)
q('/sdcard/DSHA/生活/数据/home','h1','home',1)
a.onEvent({header:{id:'h1',cwd:'/sdcard/DSHA/生活/数据/home'}},{type:'assistant/message',seq:2,time:Date.now(),data:{content:[{type:'text',text:'她'}]}})
const m=Object.fromEntries(db.prepare('select person_id,count(*) c from raw_meta group by person_id').all().map(r=>[r.person_id,r.c]))
assert.equal(m['person:contact:qq:123456'],1); assert.equal(m['person:contact:qq:group:123456789'],1); assert.equal(m['person:owner'],4)
assert.equal(db.prepare("select count(*) c from raw_meta where role='self' and person_id<>''").get().c,0)
console.log(JSON.stringify(out))
