import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
const DIR='/tmp/dy-p4o-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {ingestClassified}=await import('../lib/ingest/p4.js')
const {cleanChannelEnvelope}=await import('../lib/ingest/archive.js')
const {db}=openDb(DIR); const out={ok:true,test:'p4-outcome'}
const run=(t)=>ingestClassified(db,{text:t,sourceKey:'x:'+t.length,speaker:'1000000001',vectors:new Map()})
for (const t of ['在吗','下次还有','你是不是就像住进手机里了','主人喜欢喝冰美式']) {
  const r=await run(t)
  assert.ok(r.action==='insert'||r.action==='merge'||r.action==='queue'||r.reason,'每次尝试必须有结果: '+t)
}
// 带包装先清洗：包装去掉后剩「好的」→ 应因过短被丢
const wrapped='[QQ·私聊·主人(1)] [补收·09:00] 好的\n\n【这个房间的规矩】\n- x\nCurrent runtime context\ny'
assert.equal(cleanChannelEnvelope(wrapped).trim(),'好的')
const r2=await run(cleanChannelEnvelope(wrapped))
assert.ok(r2.reason==='too-short'||r2.reason==='fragment'||r2.reason==='greeting','清洗后按真实长度判')
// 各 reason 至少各命中一次（同一条不重复入库）
const reasons=new Set([(await run('在吗')).reason,(await run('下次还有')).reason,(await run('你是不是就像住进手机里了')).reason])
assert.ok(reasons.has('question')); assert.ok([...reasons].some(x=>x==='fragment'||x==='too-short'))
console.log(JSON.stringify(out))
