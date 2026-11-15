import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-rv-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {RawArchive}=await import('../lib/ingest/archive.js')
const {searchArchive}=await import('../lib/archive/tools.js')
const out={ok:true,test:'raw-vectors'}
const {db}=openDb(DIR)
const vec=Float32Array.from({length:8},()=>0.3535)
let failNext=false
const a=new RawArchive({db,dir:join(DIR,'raw'),cwdPrefixes:['/sdcard/DSHA/生活/数据/home'],log:{info(){},warn(){}},
  getPersona:()=>({emotionAt:(at)=>({label:'开心',valence:0.5,arousal:0.6,intensity:0.7,confidence:0.8})}),
  embedFn:async()=>{ if(failNext) throw new Error('onnx down'); return [vec] }})
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const at=Date.UTC(2026,10,7,10,0,0)
a.onEvent({header:{id:'s1',cwd:'/sdcard/DSHA/生活/数据/home'}},{type:'assistant/message',seq:1,time:at,data:{content:[{type:'text',text:'我今天心情很好'}]}})
await new Promise(r=>setTimeout(r,300))
const er=db.prepare('select * from raw_emotion_archive').get()
assert.ok(er,'情绪快照要写入'); assert.equal(Number(er.at),at,'at 用事件时间'); assert.equal(er.label,'开心'); assert.equal(Number(er.certainty),0.8)
const rv=db.prepare('select * from raw_vectors').get()
assert.ok(rv,'向量写入'); assert.equal(Number(rv.dim),8); assert.equal(Number(rv.raw_id),Number(db.prepare("select id from raw_meta where role='self'").get().id))
const st=a.rawVectorStats(); assert.equal(st.count,1)
// 失败降级：不阻断归档，只记 lastError
failNext=true
a.onEvent({header:{id:'s2',cwd:'/sdcard/DSHA/生活/数据/home'}},{type:'user/message',seq:2,time:at+1000,data:{message:{source:{kind:'user'}},content:[{type:'text',text:'另一句测试文本'}]}})
await new Promise(r=>setTimeout(r,300))
assert.ok(a.rawVectorStats().lastError.includes('onnx down'),'失败记 lastError')
assert.ok(db.prepare("select count(*) c from raw_meta where role='user'").get().c>=1,'归档不受影响')
// 语义检索命中
const hit=searchArchive(db,{question:'完全不同的话',queryEmbed:vec})
assert.equal(hit.semantic,true); assert.equal(hit.count>=1,true,'语义命中')
// backfill 脚本 dry-run 不写
const {spawnSync}=await import('node:child_process')
const SCRIPT=new URL('../scripts/backfill-raw-vectors.mjs',import.meta.url).pathname
const r=spawnSync(process.execPath,[SCRIPT,'--data-dir',DIR],{encoding:'utf8'})
assert.equal(r.status,0); assert.ok(JSON.parse(r.stdout).mode==='dry-run')
console.log(JSON.stringify(out))
