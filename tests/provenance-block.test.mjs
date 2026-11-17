import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-prov-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js')
const {RawArchive}=await import('../lib/ingest/archive.js')
const {buildProvenanceBlock}=await import('../lib/inject/context-blocks.js')
const {buildQuotesBlock}=await import('../lib/inject/quotes.js')
const {bigrams}=await import('../lib/store/fts.js')
const HOME='/sdcard/DSHA/生活/数据/home'; const {db}=openDb(DIR)
new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/root/qq-agent/QQ会话'],log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const cwd=HOME; let ln=0; const now=Date.now()
const ins=(role,text,at)=>{ln+=1;const full=`10:00:${String(ln).padStart(2,'0')} [${ln}] ${role}：${text}`
 db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('2026-11-05','f/p1.md',?,?,?,'','qq',0,?,?,?,'{}',?,'')`).run(ln,ln,role,full.length,full,at,cwd)
 const id=Number(db.prepare('SELECT last_insert_rowid() id').get().id); db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id,bigrams(text)||text); return ln}
// 9 行：带思考与情绪
for(let i=0;i<3;i++){ins('user','前文'+i,now-900000+i*1000); ins('self-thought','想法'+i,now-899000+i*1000)}
const seqHit=ins('user','看海那件事',now-800000)
ins('self-thought','看海的想法',now-799000)
ins('self','好啊',now-798000)
db.prepare("INSERT INTO emotion_timeline(session_key,valence,arousal,label,intensity,trigger,at) VALUES('global',0.5,0.6,'开心',0.6,'x',?)").run(now-800000)
const out={ok:true,test:'provenance-block'}
const hit={source_msg_id:'p4:x:'+db.prepare('select seq from raw_meta where line_no=?').get(seqHit).seq,source_ts:now-800000}
const prov=buildProvenanceBlock(db,{cwd,hits:[hit],persona:{emotionAt:()=>({label:'开心',intensity:0.6,confidence:0.9})}})
assert.ok(prov.block.startsWith('【出处上下文】')&&prov.block.endsWith('【出处上下文结束】'))
const lines=prov.block.split('\n').filter(l=>l.startsWith('- '))
assert.equal(lines.length,5,'应取满 5 条原话')
assert.ok(prov.block.includes('想：'),'每条应带想')
assert.ok(prov.block.includes('心情：开心（0.60）'),'应带心情')
// 与 RAG 去重：不重复正文，但保留想/心情
const q=buildQuotesBlock(db,{cwd,query:'看海',hits:[],now})
const prov2=buildProvenanceBlock(db,{cwd,hits:[hit],ragRows:q.sources.rows,persona:{}})
assert.ok(/同 RAG 第 \d+ 条/.test(prov2.block),'重复项用指代')
assert.ok(prov2.block.includes('想：'),'去重后仍带想')
assert.ok(prov2.block.includes('心情：')||prov2.block.includes('想：'),'去重后不丢信息')
// 每行上限
assert.ok(prov.block.split('\n').filter(l=>l.startsWith('- ')).length<=5)
console.log(JSON.stringify(out))
