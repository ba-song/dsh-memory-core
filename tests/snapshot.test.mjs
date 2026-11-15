import assert from 'node:assert'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-snap-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {openDb}=await import('../lib/store/db.js'); const {insertMemory}=await import('../lib/store/memories.js')
const {snapshotNow,restoreIfNeeded,listSnapshots,KEEP}=await import('../lib/maintain/snapshot.js')
const out={ok:true,test:'snapshot'}
const {db}=openDb(DIR); await insertMemory(db,{kind:'fact',text:'一条记忆',layer:'manual'}); db.close()
// 生成 8 份 → 保留 6
for(let i=0;i<8;i++) snapshotNow(DIR,{now:new Date(Date.UTC(2026,10,6,0,i))})
const snaps=listSnapshots(DIR)
assert.equal(snaps.length,KEEP,'保留 6 份')
assert.ok(existsSync(snaps[0].path))
// 快照可打开且含数据
const {DatabaseSync}=await import('node:sqlite'); const sdb=new DatabaseSync(snaps[0].path,{readOnly:true})
assert.equal(sdb.prepare('select count(*) c from memories').get().c,1); sdb.close()
// 源快照不被恢复改动
const srcHash=readFileSync(snaps[0].path)
// 缺失 → 恢复
rmSync(join(DIR,'memory.db')); const r1=restoreIfNeeded(DIR,{info(){},warn(){}})
assert.equal(r1.restored,true); assert.equal(r1.reason,'missing'); assert.ok(existsSync(join(DIR,'memory.db')))
assert.deepEqual(readFileSync(snaps[0].path),srcHash,'恢复不动源快照')
// 坏库 → 恢复 + 留证
writeFileSync(join(DIR,'memory.db'),'not a sqlite db at all')
const r2=restoreIfNeeded(DIR,{info(){},warn(){}})
assert.equal(r2.restored,true); assert.equal(r2.reason,'corrupt'); assert.ok(existsSync(r2.bad),'坏库改名留证')
const {DatabaseSync:DS}=await import('node:sqlite'); const ok=new DS(join(DIR,'memory.db'),{readOnly:true})
assert.equal(ok.prepare('select count(*) c from memories').get().c,1); ok.close()
// 正常启动不恢复
const r3=restoreIfNeeded(DIR,{info(){},warn(){}})
assert.equal(r3.restored,false); assert.equal(r3.reason,'healthy')
console.log(JSON.stringify(out))
