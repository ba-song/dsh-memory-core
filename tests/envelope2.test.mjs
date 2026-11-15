import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-en2-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive,cleanChannelEnvelope}=await import('../lib/ingest/archive.js')
const {readArchive}=await import('../lib/archive/tools.js'); const {bigrams}=await import('../lib/store/fts.js')
const {dayOf}=await import('../lib/adapter/timefmt.js'); const day=dayOf(Date.now()); const {db}=openDb(DIR); const a=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/sdcard/DSHA/渠道','/root/qq-agent/QQ会话','/sdcard/DSHA/生活/数据/home'],log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const out={ok:true,test:'envelope2'}
// channelInbound 新行（cwd 不在渠道目录）
a.onEvent({header:{id:'cib1',cwd:'/sdcard/DSHA/生活/数据/home'}},{type:'user/message',seq:1,time:Date.now(),data:{message:{source:{kind:'user',channelInbound:true,channel:'qq'}},content:[{type:'text',text:'[QQ·私聊·主人(1)] [补收·10:00] 可是你秀色可餐呀\n\n【这个房间的规矩】\n- 规则\nCurrent runtime context\nxx'}]}})
const row=db.prepare('select raw_text from raw_meta order by id desc limit 1').get()
assert.ok(!row.raw_text.includes('[QQ·')&&!row.raw_text.includes('补收')&&!row.raw_text.includes('这个房间的规矩')&&!row.raw_text.includes('Current runtime context'),'新行入库即干净')
assert.ok(row.raw_text.includes('可是你秀色可餐呀'))
// home cwd + 带头 user 行（无 channelInbound 标记）也要洗；普通行原样
a.onEvent({header:{id:'h2',cwd:'/sdcard/DSHA/生活/数据/home'}},{type:'user/message',seq:2,time:Date.now(),data:{message:{source:{kind:'user'}},content:[{type:'text',text:'[QQ·私聊·主人(1)] 家里收到的转发\n\n【这个房间的规矩】\n- y'}]}})
const r2=db.prepare('select raw_text from raw_meta order by id desc limit 1').get().raw_text
assert.ok(!r2.includes('[QQ·')&&!r2.includes('这个房间的规矩')&&r2.includes('家里收到的转发'),'home cwd 带头行也要洗')
a.onEvent({header:{id:'h2',cwd:'/sdcard/DSHA/生活/数据/home'}},{type:'user/message',seq:3,time:Date.now(),data:{message:{source:{kind:'user'}},content:[{type:'text',text:'普通一句话'}]}})
const r3=db.prepare('select raw_text from raw_meta order by id desc limit 1').get().raw_text
assert.ok(r3.includes('普通一句话')&&!r3.includes('[QQ·'),'普通 home 行不误改')
// 老行读取兜底
const id=Number(db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('${day}','d/o.md',1,2,'user','','qq',0,1,?,?, '{}','/sdcard/DSHA/渠道/qq','')`).run('[QQ·私聊·主人(1)] 老行里的原话\n\n【这个房间的规矩】\n- x',Date.now()).lastInsertRowid)
db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id,bigrams('老行里的原话'))
const r=readArchive(db,{limit:5})
assert.ok(r.text.includes('老行里的原话')&&!r.text.includes('这个房间的规矩'),'老行读取被 strip')
console.log(JSON.stringify(out))
