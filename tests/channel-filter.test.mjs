import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-chf-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const {insertMemory}=await import('../lib/store/memories.js'); const {readArchive}=await import('../lib/archive/tools.js')
const {dayOf}=await import('../lib/adapter/timefmt.js'); const day=dayOf(Date.now()); const {db}=openDb(DIR); const a=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/sdcard/DSHA/渠道','/root/qq-agent/QQ会话','/sdcard/DSHA/生活/数据/home'],log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const put=(cwd,role,txt)=>{db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('${day}','d/x.md',1,1,?,'','qq',0,1,?,?, '{}',?,'')`).run(role,txt,Date.now(),cwd); const id=Number(db.prepare('select last_insert_rowid() id').get().id); db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id,txt)}
put('/sdcard/DSHA/渠道/qq','user','qq房间里的看海'); put('/sdcard/DSHA/生活/数据/home','user','家里的看海')
await insertMemory(db,{kind:'fact',text:'qq记忆',sourceChannel:'qq',speakerId:'contact:owner',layer:'manual'})
await insertMemory(db,{kind:'fact',text:'home记忆',sourceChannel:'home',layer:'manual'})
const out={ok:true,test:'channel-filter'}
// 思考不进 dialog；reasoning 只出思考
db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('${day}','d/y.md',1,9,'汐·想','','qq',0,1,'思考专用',?, '{}','/sdcard/DSHA/渠道/qq','')`).run(Date.now())
const dlg=readArchive(db,{limit:20}); assert.ok(!dlg.text.includes('思考专用'),'dialog 不含思考')
const rs=readArchive(db,{limit:20,kind:'reasoning'}); assert.ok(rs.text.includes('思考专用')&&!rs.text.includes('qq房间里的看海'),'reasoning 只出思考')
const d=readArchive(db,{limit:10}); assert.equal(d.ok,true); assert.ok(d.text.includes('qq房间里的看海')&&d.text.includes('家里的看海'),'默认不过滤')
const q=readArchive(db,{limit:10,channel:'qq'}); assert.ok(q.text.includes('qq房间里的')&&!q.text.includes('家里的'),'qq 只出 qq')
const h=readArchive(db,{limit:10,channel:'home'}); assert.ok(h.text.includes('家里的')&&!h.text.includes('qq房间'),'home 只出 home')
console.log(JSON.stringify(out))
