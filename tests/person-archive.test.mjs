import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-pa-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const {resolvePersonId}=await import('../lib/person/id.js')
const out={ok:true,test:'person-archive'}
// 解析：owner 三地址
const owner={ownerQQ:'1000000001',ownerPrivateDir:'/root/qq-agent/QQ会话/私聊_1000000001',ownerEmail:'owner@example.com'}
assert.equal(resolvePersonId({channel:'qq',contactId:'1000000001',owner}),'person:owner')
assert.equal(resolvePersonId({channel:'qq',cwd:'/root/qq-agent/QQ会话/私聊_1000000001',owner}),'person:owner')
assert.equal(resolvePersonId({channel:'mail',contactId:'owner@example.com',owner}),'person:owner')
assert.equal(resolvePersonId({channel:'qq',contactId:'123456',owner}),'person:contact:qq:123456')
assert.equal(resolvePersonId({channel:'mail',contactId:'a@b.com',owner}),'person:contact:mail:a@b.com')
// 写入归到 person
const {db}=openDb(DIR); const a=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/root/qq-agent/QQ会话','/sdcard/DSHA/渠道','/sdcard/DSHA/生活/数据/home'],log:{info(){},warn(){}},owner:{...owner,ownerDirs:['/sdcard/DSHA/生活/数据/home']}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const put=(cwd,sid,txt,seq)=>{a.onEvent({header:{id:sid,cwd}},{type:'user/message',seq,time:Date.now(),data:{message:{source:{kind:'user'}},content:[{type:'text',text:txt}]}})}
put('/root/qq-agent/QQ会话/私聊_1000000001','s1','owner 一句',1)
put('/root/qq-agent/QQ会话/私聊_123456','s2','陌生人一句',1)
put('/sdcard/DSHA/渠道/qq','c1','渠道房间的主人消息',1)
put('/sdcard/DSHA/生活/数据/home','h1','home 里的主人消息',1)
put('/sdcard/DSHA/生活/数据/home/sub','h1','home 子目录消息',2)
put('/root/qq-agent/QQ会话/群_123456789','g1','群里一句',1)
a.onEvent({header:{id:'s1',cwd:'/root/qq-agent/QQ会话/私聊_1000000001'}},{type:'assistant/message',seq:2,time:Date.now(),data:{content:[{type:'text',text:'她的一句'}]}})
const rows=db.prepare('select person_id,count(*) c from raw_meta group by person_id').all()
const map=Object.fromEntries(rows.map(r=>[r.person_id,r.c]))
assert.equal(map['person:owner'],4,'owner 私聊 + 渠道房间 + home + home 子目录'); assert.equal(map['person:contact:qq:123456'],1)
assert.equal(map['person:contact:qq:group:123456789'],1,'群按群号')
const selfBad=db.prepare("select id,person_id,substr(raw_text,1,20) t from raw_meta where role='self' and person_id<>''").all(); assert.equal(selfBad.length,0,'self 留空 '+JSON.stringify(selfBad))
// self 行允许空（不参与 person 归档）
assert.ok(db.prepare("select count(*) c from raw_meta where person_id=''").get().c>=1)
console.log(JSON.stringify(out))
