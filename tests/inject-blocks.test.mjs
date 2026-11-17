/** 注入块：原话 5 条上限 / 思考不进原话 / 情绪块工具函数（独立块已按 22:41 决议移除） */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-blk-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const {buildQuotesBlock}=await import('../lib/inject/quotes.js'); const {buildEmotionBlock}=await import('../lib/inject/context-blocks.js')
const {bigrams}=await import('../lib/store/fts.js')
const {db}=openDb(DIR); new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/root/qq-agent/QQ会话'],log:{info(){},warn(){}}})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const cwd='/sdcard/DSHA/生活/数据/home'; const now=Date.now(); let ln=0
const ins=(role,text,at)=>{ln+=1;const full=`10:00:${String(ln).padStart(2,'0')} [${ln}] ${role}：${text}`
 db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id) VALUES('2026-11-05','f/b1.md',?,?,?,'','qq',0,?,?,?,'{}',?,'')`).run(ln,ln,role,full.length,full,at,cwd)
 const id=Number(db.prepare('SELECT last_insert_rowid() id').get().id); db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id,bigrams(text)||text)}
for(let i=0;i<8;i++) ins('user','看海 第'+i+'条',now-500000+i)
ins('self-thought','这是想法不该进原话',now-499000)
const q=buildQuotesBlock(db,{cwd,query:'看海',hits:[],now})
assert.ok(q.block.split('\n').filter(l=>l.startsWith('- ')).length<=5,'≤5 条')
assert.ok(q.block.length<=450,'≤450 字')
assert.ok(!q.block.includes('不该进原话'),'思考不进原话块')
// 情绪工具函数：persona 有/无/低置信
assert.ok(buildEmotionBlock(db,{cwd,hits:[{source_ts:now}],persona:{emotionAt:()=>({label:'开心',intensity:0.6,confidence:0.9})}}).block.includes('开心'))
assert.equal(buildEmotionBlock(db,{cwd,hits:[{source_ts:now}],persona:{emotionTimeline:()=>[]}}).block,'')
assert.equal(buildEmotionBlock(db,{cwd,hits:[{source_ts:now}],persona:{emotionAt:()=>({label:'淡',intensity:0.9,confidence:0.1})}}).block,'')
console.log(JSON.stringify({ok:true,test:'inject-blocks'}))
