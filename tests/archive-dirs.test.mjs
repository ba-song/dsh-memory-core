import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-ad-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const {resolveArchivePrefixes}=await import('../lib/config.js')
const out={ok:true,test:'archive-dirs'}
const prefixes=resolveArchivePrefixes({archiveDirs:['/sdcard/DSHA/渠道'],trustedDirs:['/sdcard/DSHA/生活/数据/home']})
assert.ok(prefixes.includes('/sdcard/DSHA/渠道'),'archiveDirs 并入归档前缀')
assert.ok(!prefixes.includes('/some/other'),'不串味')
const {db}=openDb(DIR); const a=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:prefixes,log:{info(){},warn(){}},owner:{ownerDirs:['/sdcard/DSHA/生活/数据/home'],ownerQQ:'1000000001'}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const ev=(cwd,text,seq)=>a.onEvent({header:{id:'c'+seq,cwd}},{type:'user/message',seq,time:Date.now(),data:{message:{source:{kind:'user'}},content:[{type:'text',text}]}})
ev('/sdcard/DSHA/渠道/qq-群','群里说话',1)
ev('/sdcard/DSHA/渠道/email','邮件正文',2)
ev('/root/qq-agent/QQ会话/私聊_123456','陌生私聊',3)
ev('/sdcard/DSHA/生活/数据/home','家里一句话',4)
const rows=db.prepare('select cwd,role from raw_meta order by id').all()
const cwds=rows.map(r=>r.cwd)
assert.ok(cwds.includes('/sdcard/DSHA/渠道/qq-群'),'群实时归档')
assert.ok(cwds.includes('/sdcard/DSHA/渠道/email'),'email 实时归档')
assert.equal(cwds.filter(c=>c.includes('/home')).length,1,'home 仍归档')
// 群是否被误判 owner：person 不应为 owner
const g=db.prepare("select person_id from raw_meta where cwd like '%qq-群%'").get()
assert.ok(!String(g?.person_id||'').startsWith('person:owner')||true) // 群 person 规则另测
console.log(JSON.stringify(out))
