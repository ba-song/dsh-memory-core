import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { insertMemory, updateMemory, deleteMemory } from '../lib/store/memories.js'
import { linkMemory } from '../lib/store/graph.js'
const dir='/tmp/dy-m3-derived-sync-'+process.pid
rmSync(dir,{recursive:true,force:true})
const {db}=openDb(dir)
const scalar=(sql,...args)=>db.prepare(sql).get(...args)
test('syncDerived updates FTS/vector/entities/relations/quote/revision and conflict queue atomically',async()=>{
 const id=await insertMemory(db,{kind:'fact',text:'主人喜欢抖音',quote:'主人喜欢抖音',meta:{provenance:'session'}})
 linkMemory(db,id,'主人喜欢抖音')
 db.prepare('INSERT INTO vectors(memory_id,dim,vec) VALUES(?,?,?)').run(id,2,Buffer.from(new Float32Array([1,0]).buffer))
 const oldEntity=scalar("SELECT e.id FROM entities e JOIN memory_entities me ON me.entity_id=e.id WHERE me.memory_id=? AND e.name='抖音'",id)
 const other=await insertMemory(db,{kind:'fact',text:'GitHub 项目'})
 linkMemory(db,other,'GitHub 项目')
 const newEntity=scalar("SELECT id FROM entities WHERE name='GitHub' AND type='platform'")
 db.prepare('INSERT INTO relations(src,dst,relation,weight,memory_id,created_at) VALUES(?,?,?,?,?,?)').run(oldEntity.id,newEntity.id,'mentions',1,id,1)
 const q=Number(db.prepare("INSERT INTO conflict_queue(memory_a,memory_b,reason,created_at,status) VALUES(?,?,?,?,?)").run(id,other,'test',1,'pending').lastInsertRowid)
 const r=await updateMemory(db,id,{text:'主人现在使用 GitHub'},1,{syncDerived:true,sourceText:'主人现在使用 GitHub',embedFn:async()=>new Float32Array([0,1]),relationBuilder:async()=>[{src:newEntity.id,dst:oldEntity.id,relation:'uses',weight:0.8}]})
 assert.equal(r.ok,true); assert.equal(r.revision,2); assert.equal(r.derived.vectorStatus,'fresh')
 assert.equal(scalar('SELECT count(*) c FROM vectors WHERE memory_id=?',id).c,1)
 assert.equal(scalar("SELECT count(*) c FROM fts_bigram WHERE rowid=? AND text MATCH '抖音'",id).c,0)
 assert.equal(scalar("SELECT count(*) c FROM memory_entities me JOIN entities e ON e.id=me.entity_id WHERE me.memory_id=? AND e.name='抖音'",id).c,0)
 assert.equal(scalar("SELECT count(*) c FROM memory_entities me JOIN entities e ON e.id=me.entity_id WHERE me.memory_id=? AND e.name='GitHub'",id).c,1)
 assert.equal(scalar('SELECT count(*) c FROM relations WHERE memory_id=? AND relation=?',id,'uses').c,1)
 assert.equal(scalar('SELECT count(*) c FROM relations WHERE memory_id=? AND relation=?',id,'mentions').c,0)
 assert.equal(scalar('SELECT quote FROM memories WHERE id=?',id).quote,'主人现在使用 GitHub')
 assert.equal(scalar('SELECT revision FROM memory_revisions WHERE memory_id=? AND revision=1',id).revision,1)
 assert.equal(scalar('SELECT status FROM conflict_queue WHERE id=?',q).status,'stale')
})
test('syncDerived failure rolls back row, FTS, vector, entities, relations and revision',async()=>{
 const id=await insertMemory(db,{kind:'fact',text:'主人喜欢 Chrome'})
 linkMemory(db,id,'主人喜欢 Chrome')
 db.prepare('INSERT INTO vectors(memory_id,dim,vec) VALUES(?,?,?)').run(id,2,Buffer.from(new Float32Array([1,0]).buffer))
 const before=JSON.stringify({row:scalar('SELECT * FROM memories WHERE id=?',id),vec:scalar('SELECT dim,hex(vec) vec FROM vectors WHERE memory_id=?',id),links:db.prepare('SELECT entity_id FROM memory_entities WHERE memory_id=? ORDER BY entity_id').all(id),fts:scalar('SELECT text FROM fts_bigram WHERE rowid=?',id)})
 await assert.rejects(()=>updateMemory(db,id,{text:'主人改用 DeepSeek'},1,{syncDerived:true,embedFn:async()=>{throw new Error('mock embedding failure')}}),/mock embedding failure/)
 const after=JSON.stringify({row:scalar('SELECT * FROM memories WHERE id=?',id),vec:scalar('SELECT dim,hex(vec) vec FROM vectors WHERE memory_id=?',id),links:db.prepare('SELECT entity_id FROM memory_entities WHERE memory_id=? ORDER BY entity_id').all(id),fts:scalar('SELECT text FROM fts_bigram WHERE rowid=?',id)})
 assert.equal(after,before); assert.equal(scalar('SELECT count(*) c FROM memory_revisions WHERE memory_id=?',id).c,0)
})
test('deleteMemory removes revision and owned relation orphans',async()=>{
 const id=await insertMemory(db,{kind:'fact',text:'待删除记忆'}); const other=await insertMemory(db,{kind:'fact',text:'保留记忆'})
 db.prepare('INSERT INTO memory_revisions(memory_id,revision,previous_json,changed_at) VALUES(?,?,?,?)').run(id,1,'{}',1)
 db.prepare('INSERT INTO relations(src,dst,relation,memory_id) VALUES(?,?,?,?)').run(1,2,'orphan',id)
 await deleteMemory(db,id)
 assert.equal(scalar('SELECT count(*) c FROM memory_revisions WHERE memory_id=?',id).c,0)
 assert.equal(scalar('SELECT count(*) c FROM relations WHERE memory_id=?',id).c,0)
 assert.ok(scalar('SELECT id FROM memories WHERE id=?',other))
 db.close(); rmSync(dir,{recursive:true,force:true})
})
