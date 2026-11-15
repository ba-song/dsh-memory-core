import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
const DIR='/tmp/dy-env-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive,cleanChannelEnvelope}=await import('../lib/ingest/archive.js')
const {db}=openDb(DIR); const a=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/sdcard/DSHA/渠道','/root/qq-agent/QQ会话'],log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const out={ok:true,test:'channel-envelope'}
assert.equal(cleanChannelEnvelope('[QQ·私聊·霸…霸宋(1000000001)] 晚安\n\n【这个房间的规矩】\n- 要说的全通过 dy_say 发'), '晚安')
const ev=(cwd,sid,txt,seq=1)=>a.onEvent({header:{id:sid,cwd}},{type:'user/message',seq,time:Date.now(),data:{message:{source:{kind:'user'}},content:[{type:'text',text:txt}]}})
const CH='/sdcard/DSHA/渠道/qq'
ev(CH,'c1','[QQ·私聊·主人(1000000001)] 那发个晚安\n\n【这个房间的规矩】\n- 规则一')
const row=db.prepare("SELECT raw_text FROM raw_meta WHERE cwd=?").get(CH)
assert.equal(row.raw_text.includes('【这个房间的规矩】'), false, '规则块不进档案')
assert.equal(row.raw_text.includes('[QQ·'), false, '消息头不进档案')
assert.ok(row.raw_text.includes('那发个晚安'))
// 空消息不归档
const before=db.prepare('select count(*) c from raw_meta').get().c
ev(CH,'c2','[QQ·私聊·主人(1)] \n\n【这个房间的规矩】\n- x',2)
assert.equal(db.prepare('select count(*) c from raw_meta').get().c, before, '清洗后为空 → 不归档')
// 非渠道目录不动
ev('/root/qq-agent/QQ会话/私聊_1000000001','q1','[QQ·x] 正常私聊占位',1)
assert.ok(db.prepare("SELECT raw_text FROM raw_meta WHERE cwd like '/root/qq-agent%'").get().raw_text.includes('[QQ·'), '非渠道目录不清洗')
// doctor dry-run 与 apply 幂等
db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('2026-11-05','p/x.md',1,9,'user','','qq',0,50,? ,1,'{}','/sdcard/DSHA/渠道/qq','')`).run('[QQ·私聊·主人(1)] 脏数据\n\n【这个房间的规矩】\n- y')
const SCRIPT=new URL('../scripts/doctor-memory.mjs',import.meta.url).pathname
const run=(args)=>{const r=spawnSync(process.execPath,[SCRIPT,'--db',join(DIR,'memory.db'),...args],{encoding:'utf8'});return {status:r.status,j:JSON.parse(r.stdout)}}
const dry=run(['--strip-channel-envelope'])
assert.equal(dry.j.dryRun,true); assert.ok(dry.j.matched>=1)
const ap=run(['--strip-channel-envelope','--apply','--backup-dir',join(DIR,'bk')])
assert.ok(ap.j.ok); assert.ok(ap.j.updated+ap.j.deleted>=1)
const dry2=run(['--strip-channel-envelope'])
assert.equal(dry2.j.matched,0,'幂等')
console.log(JSON.stringify(out))
