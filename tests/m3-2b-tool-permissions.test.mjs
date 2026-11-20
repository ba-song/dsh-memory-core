import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'

process.env.DY_MEMORY_DIR = '/tmp/dy-m3-2b-tools-' + process.pid
rmSync(process.env.DY_MEMORY_DIR,{recursive:true,force:true})
mkdirSync(process.env.DY_MEMORY_DIR,{recursive:true})
const mod = await import('../lib/index.js')
const makeCtx = (registered) => ({
  get(name) {
    if(name==='tools') return { register(def){ if(registered[def.name]) throw new Error('duplicate'); registered[def.name]=def } }
    if(name==='systemPrompt') return { context:()=>()=>{} }
    if(name==='agents') return { list:()=>[] }
    return undefined
  },
  on(){},
  provide(){return ()=>{}},
  logger:{info(){},warn(){}},
})
const owner = { agent:{session:{header:{cwd:'/root/qq-agent/QQ会话/私聊_1000000001',id:'m3-2b-owner'}}} }
const group = { agent:{session:{header:{cwd:'/sdcard/DSHA/渠道/qq/群_123456',id:'m3-2b-group'}}} }

test('M3-2B tools are absent by default and owner-only/non-batch when explicitly enabled',async()=>{
 const off={}
 mod.apply(makeCtx(off),{ownerQQ:'1000000001'})
 assert.equal(off.dy_episode_rewrite_preview,undefined)
 const on={}
 mod.apply(makeCtx(on),{ownerQQ:'1000000001',m3_2b:{enabled:true}})
 for(const name of ['dy_episode_rewrite_preview','dy_episode_rewrite_apply','dy_episode_rewrite_rollback']) assert.ok(on[name],name)
 const denied=JSON.parse((await on.dy_episode_rewrite_preview.execute({id:1,proposed_text:'x'},group)).detail)
 assert.equal(denied.code,'E_PERMISSION')
 const batch=JSON.parse((await on.dy_episode_rewrite_preview.execute({id:1,proposed_text:'x',ids:[1,2]},owner)).detail)
 assert.equal(batch.code,'E_BATCH_NOT_SUPPORTED')
 const applyBatch=JSON.parse((await on.dy_episode_rewrite_apply.execute({id:1,proposed_text:'x',confirm:true,ids:[1,2]},owner)).detail)
 assert.equal(applyBatch.code,'E_BATCH_NOT_SUPPORTED')
 const confirm=JSON.parse((await on.dy_episode_rewrite_apply.execute({id:1,proposed_text:'x',confirm:false},owner)).detail)
 assert.equal(confirm.code,'E_CONFIRM_REQUIRED')
 const rollbackBatch=JSON.parse((await on.dy_episode_rewrite_rollback.execute({snapshot_id:1,ids:[1,2]},owner)).detail)
 assert.equal(rollbackBatch.code,'E_BATCH_NOT_SUPPORTED')
 assert.equal(on.dy_episode_rewrite_apply.parameters.additionalProperties,false)
})
