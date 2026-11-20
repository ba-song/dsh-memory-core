import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory, saveVector } from '../lib/store/memories.js'
import { linkMemory } from '../lib/store/graph.js'
import { previewEpisodeRewrite, applyEpisodeRewrite, rollbackEpisodeRewrite } from '../lib/store/episode-rewrite.js'

const dir='/tmp/dy-m3-2b-'+process.pid
rmSync(dir,{recursive:true,force:true})
const {db}=openDb(dir)
const get=(sql,...args)=>db.prepare(sql).get(...args)
test('M3-2B preview is read-only and apply snapshots all derived state',async()=>{
 const id=await insertMemory(db,{kind:'episode',text:'主人在抖音看了视频',quote:'主人在抖音看了视频',sourceMsgId:'s:1',meta:{source:'fixture'}})
 linkMemory(db,id,'主人在抖音看了视频')
 await saveVector(db,id,[1,0,0])
 const ent=get("SELECT e.id FROM entities e JOIN memory_entities me ON me.entity_id=e.id WHERE me.memory_id=? AND e.name='抖音'",id)
 const other=get("SELECT id FROM entities WHERE name='主人' AND type='person'")
 db.prepare('INSERT INTO relations(src,dst,relation,weight,memory_id,created_at) VALUES(?,?,?,?,?,?)').run(ent.id,other.id,'mentions',0.8,id,10)
 const before=Number(get('SELECT total_changes() n').n)
 const preview=previewEpisodeRewrite(db,{id,proposedText:'主人在 GitHub 维护项目',injectBudgetChars:400})
 assert.equal(preview.sideEffectFree,true)
 assert.equal(preview.totalChangesBefore,preview.totalChangesAfter)
 assert.equal(Number(get('SELECT count(*) c FROM episode_rewrite_snapshots').c),0)
 const applied=await applyEpisodeRewrite(db,{id,proposedText:'主人在 GitHub 维护项目',embedFn:async()=>new Float32Array([0,1,0]),now:20})
 assert.equal(applied.ok,true)
 assert.equal(Number(get('SELECT count(*) c FROM episode_rewrite_snapshots').c),1)
 assert.equal(get('SELECT text FROM memories WHERE id=?',id).text,'主人在 GitHub 维护项目')
 assert.equal(get('SELECT quote FROM memories WHERE id=?',id).quote,'')
 assert.equal(get('SELECT dim FROM vectors WHERE memory_id=?',id).dim,3)
 assert.equal(Number(get('SELECT count(*) c FROM relations WHERE memory_id=?',id).c),0)
 const snap=get('SELECT * FROM episode_rewrite_snapshots WHERE id=?',applied.snapshotId)
 assert.equal(JSON.parse(snap.previous_json).text,'主人在抖音看了视频')
 assert.equal(JSON.parse(snap.entities_json).length,2)
 assert.equal(JSON.parse(snap.relations_json).length,1)
 assert.equal(before<Number(get('SELECT total_changes() n').n),true)
})
test('rollback restores text, quote, vector, entities, relations and creates a new revision',async()=>{
 const snap=get("SELECT id FROM episode_rewrite_snapshots WHERE status='applied' ORDER BY id DESC LIMIT 1")
 const id=Number(get('SELECT memory_id FROM episode_rewrite_snapshots WHERE id=?',snap.id).memory_id)
 const rolled=await rollbackEpisodeRewrite(db,{snapshotId:snap.id,now:30})
 assert.equal(rolled.ok,true)
 assert.equal(get('SELECT text FROM memories WHERE id=?',id).text,'主人在抖音看了视频')
 assert.equal(get('SELECT quote FROM memories WHERE id=?',id).quote,'主人在抖音看了视频')
 assert.equal(get('SELECT hex(vec) v FROM vectors WHERE memory_id=?',id).v,Buffer.from(new Float32Array([1,0,0]).buffer).toString('hex').toUpperCase())
 assert.equal(Number(get('SELECT count(*) c FROM relations WHERE memory_id=?',id).c),1)
 assert.equal(Number(get("SELECT count(*) c FROM memory_entities me JOIN entities e ON e.id=me.entity_id WHERE me.memory_id=? AND e.name='抖音'",id).c),1)
 assert.equal(get('SELECT status FROM episode_rewrite_snapshots WHERE id=?',snap.id).status,'rolled_back')
 assert.equal(Number(get('SELECT revision FROM memories WHERE id=?',id).revision),3)
})
test('embedding failure rolls back the entire apply and leaves no snapshot',async()=>{
 const id=await insertMemory(db,{kind:'episode',text:'主人喜欢海边'})
 linkMemory(db,id,'主人喜欢海边')
 await saveVector(db,id,[0,1])
 const before=JSON.stringify({row:get('SELECT * FROM memories WHERE id=?',id),vec:get('SELECT dim,hex(vec) v FROM vectors WHERE memory_id=?',id),links:db.prepare('SELECT entity_id FROM memory_entities WHERE memory_id=?').all(id)})
 await assert.rejects(()=>applyEpisodeRewrite(db,{id,proposedText:'主人改为喜欢 GitHub',embedFn:async()=>{throw new Error('mock embedding failure')}}),/mock embedding failure/)
 const after=JSON.stringify({row:get('SELECT * FROM memories WHERE id=?',id),vec:get('SELECT dim,hex(vec) v FROM vectors WHERE memory_id=?',id),links:db.prepare('SELECT entity_id FROM memory_entities WHERE memory_id=?').all(id)})
 assert.equal(after,before)
 assert.equal(Number(get('SELECT count(*) c FROM episode_rewrite_snapshots WHERE memory_id=?',id).c),0)
})
test('preview and apply reject non-episode or missing ids',async()=>{
 const id=await insertMemory(db,{kind:'fact',text:'普通事实'})
 assert.throws(()=>previewEpisodeRewrite(db,{id,proposedText:'新事实'}),/E_NOT_ACTIVE_EPISODE/)
 await assert.rejects(()=>applyEpisodeRewrite(db,{id:999999,proposedText:'不存在',embedFn:async()=>[1]}),/E_NOT_FOUND/)
 db.close();rmSync(dir,{recursive:true,force:true})
})
