import assert from 'node:assert'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const DIR='/tmp/dy-fe-'+process.pid; process.env.DY_MEMORY_DIR=DIR; rmSync(DIR,{recursive:true,force:true}); mkdirSync(DIR,{recursive:true})
const {appendFact,listFacts}=await import('../lib/facts/edit.js')
const out={ok:true,test:'facts-edit'}
let r=appendFact(DIR,{section:'全局',text:'她喜欢鲸鱼'}); assert.ok(r.ok&&existsSync(join(DIR,'事实卡.md')))
assert.equal(r.backup,'','首次写入无备份（文件原本不存在）')
r=appendFact(DIR,{section:'主人',text:'主人怕辣'}); assert.ok(r.ok)
r=appendFact(DIR,{section:'群',text:'群里不聊私事'}); assert.ok(r.ok)
assert.ok(/facts-before-/.test(r.backup||''),'第三次写入应有备份')
r=appendFact(DIR,{section:'人',name:'阿岚',text:'阿岚爱猫'}); assert.ok(r.ok)
const raw=readFileSync(join(DIR,'事实卡.md'),'utf8')
assert.ok(/## 全局[\s\S]*她喜欢鲸鱼/.test(raw)&&/## 主人/.test(raw)&&/## 群/.test(raw)&&/## 人 · 阿岚/.test(raw),'四节+自动建节')
assert.equal(appendFact(DIR,{section:'全局',text:'她喜欢鲸鱼'}).error,'duplicate')
assert.ok(appendFact(DIR,{section:'全局',text:'x'.repeat(201)}).error.includes('200'))
assert.equal(appendFact(DIR,{section:'全局',text:'  '}).ok,false)
const secs=listFacts(DIR).sections
assert.ok(secs['全局'].some(x=>x.text==='她喜欢鲸鱼')&&secs['人'].length===1,'列表')
const bdir=join(DIR,'备份'); for(let i=0;i<8;i++) appendFact(DIR,{section:'全局',text:'第'+i+'条'})
assert.ok(readdirSync(bdir).filter(x=>x.startsWith('facts-before-')).length<=5,'备份保留 5')
console.log(JSON.stringify(out))
