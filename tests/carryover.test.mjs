/** 无感切换【上次聊到】—— 2026-11-05 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const DIR = '/tmp/dy-carry-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true })
const { openDb } = await import('../lib/store/db.js')
const { RawArchive } = await import('../lib/ingest/archive.js')
const { carryoverFor } = await import('../lib/inject/carryover.js')
const HOME = '/sdcard/DSHA/生活/数据/home'
const { db } = openDb(DIR)
new RawArchive({ db, dir: join(DIR, 'raw'), cwdPrefixes: ['/root/qq-agent/QQ会话'], log: { info() {}, warn() {} } })
db.exec("ALTER TABLE raw_meta ADD COLUMN speaker_id TEXT DEFAULT ''")
const put = (role, text, at, cwd = HOME) => {
  const full = `10:00:00 [1] ${role}：${text}`
  db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,speaker_id)
    VALUES('2026-11-05','d/s-a.md',1,1,?,'','qq',0,?,?,?,'{}',?,'')`).run(role, full.length, full, at, cwd)
}
for (let i = 0; i < 10; i++) put('user', `第${i}句：今天聊了看海和搬家的事`, 1000 + i)
put('self', '她说周末去看海', 2000)
const out = { ok: true, test: 'carryover' }
const blk = carryoverFor(db, HOME)
assert.ok(blk.startsWith('【上次聊到】'), '应有块')
assert.ok(blk.length <= 440, `块 ≤440，实际 ${blk.length}`)
assert.ok(blk.includes('看海'), '应带最近内容')
assert.equal(carryoverFor(db, '/no/such/cwd'), '', '无旧会话为空')
// 端到端：mount 注入且每会话一次
const handlers = {}; const registered = {}
const ctx = { get(n) { if (n==='tools') return { register: (d)=>{registered[d.name]=d} }; if (n==='systemPrompt') return { context: ()=>()=>{} }; if (n==='agents') return { list: ()=>[] }; return undefined }, on(e,f){handlers[e]=f}, provide(){return ()=>{} }, logger:{info(){},warn(){}} }
const mod = await import('../lib/index.js'); mod.apply(ctx, { ownerQQ: '1000000001', trustedDirs: [HOME] })
const caps = []
const agent = (sid) => ({ session: { header: { cwd: HOME, id: sid } }, ctx: { systemPrompt: { context: (c) => { caps.push(c); return () => {} } } } })
handlers['agent/created']({ agent: agent('s-1') })
assert.equal(caps.length, 2, 'owner 应挂长期偏好块和常驻记忆块')
const stable = caps.find((c) => c.name === 'dy-memory-stable')
assert.ok(stable, '应挂常驻记忆块')
const text = stable.text()
assert.ok(text.includes('【上次聊到】'), '常驻块里应有上次聊到')
assert.equal((text.match(/【上次聊到】/g) || []).length, 1, '只出现一次')
handlers['agent/created']({ agent: agent('s-1') })
assert.equal(caps.length, 2, '同一会话不重复挂载')
// 无旧会话的 cwd → 不注入
const EMPTY = '/tmp/no-old-session-' + process.pid
caps.length = 0
handlers['agent/created']({ agent: { session: { header: { cwd: EMPTY, id: 's-2' } }, ctx: { systemPrompt: { context: (c) => { caps.push(c); return () => {} } } } } })
if (caps.length) assert.ok(!caps[0].text().includes('【上次聊到】'))
out.mount = 'ok'
console.log(JSON.stringify(out))
