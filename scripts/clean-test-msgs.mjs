import { readFileSync, writeFileSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { DATA_DIR } from '../lib/config.js'
import { bigrams } from '../lib/store/fts.js'

const PAT = /(好累啊|好笑的视频|担心明天的事|吃海鲜|按这个格式发|我真的爱你|我们不是一个人|测试的|测试消息|所以不用记|你还记得抖音怎么改资料吗|那 B 站呢|B 站怎么改资料|那 B 站头像呢|下面这几条是刚才断线期间)/
// D1：不再写死主人号/会话 id；由调用方用环境变量指定
const RAW = String(process.env.CLEAN_RAW ?? '').trim()
const OLD = String(process.env.CLEAN_OLD ?? '').trim()
const OWNER_NAME = String(process.env.OWNER_NAME ?? '').trim()
if (!RAW || !OLD) {
  console.error('用法：CLEAN_RAW=<原话 md 路径> CLEAN_OLD=<旧聊天记录 md 路径> [OWNER_NAME=<主人昵称>] node scripts/clean-test-msgs.mjs')
  process.exit(1)
}

// 1) 原话档案：整轮删除（含她的回复），保留其它轮
const lines = readFileSync(RAW, 'utf8').split('\n')
const blocks = []
let cur = null
for (const line of lines) {
  if (line.includes('事：turn/start')) { if (cur) blocks.push(cur); cur = [line]; continue }
  if (!cur) { blocks.push([line]); continue }
  cur.push(line)
  if (line.includes('事：turn/end')) { blocks.push(cur); cur = null }
}
if (cur) blocks.push(cur)
const drop = blocks.filter((b) => b.some((l) => l.includes('你：') && PAT.test(l)))
const keep = blocks.filter((b) => !b.some((l) => l.includes('你：') && PAT.test(l)))
writeFileSync(RAW, keep.flat().join('\n'), 'utf8')
console.log('原话档案：删除轮次', drop.length, '保留行', keep.flat().length)

// 2) 旧聊天记录：删测试用户行 + 紧跟的她的回复
const old = readFileSync(OLD, 'utf8').split('\n')
const out = []
let skipping = false
for (const line of old) {
  const isUser = OWNER_NAME ? line.includes(OWNER_NAME) : true
  if (isUser) {
    skipping = PAT.test(line)
    if (skipping) continue
    out.push(line); continue
  }
  if (skipping && line.includes('汐(')) continue
  skipping = false
  out.push(line)
}
writeFileSync(OLD, out.join('\n'), 'utf8')
console.log('旧聊天记录：保留行', out.length)

// 3) 重建这一天的 raw_meta / raw_fts
const { db } = openDb(DATA_DIR)
const day = '2026-10-31'
const rows = db.prepare('SELECT id FROM raw_meta WHERE day=? AND file=?').all(day, '2026-10-31/s-9d1cfb9f.md')
for (const r of rows) { db.prepare('DELETE FROM raw_fts WHERE rowid=?').run(r.id); db.prepare('DELETE FROM raw_meta WHERE id=?').run(r.id) }
const now = Date.now()
let n = 0
for (const line of keep.flat()) {
  if (!line.trim()) continue
  n += 1
  const mm = line.match(/^(\d{2}):(\d{2}):(\d{2}) \[(\d*)\] ([^：]+)：(.*)$/)
  const seqNo = mm ? Number(mm[4]) || 0 : 0
  const role = mm ? mm[5] : ''
  const atMs = mm ? new Date(`${day}T${mm[1]}:${mm[2]}:${mm[3]}+08:00`).getTime() : now
  db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra)
              VALUES(?,?,?,?,?,?,?,0,?,?,?,?)`).run(day, '2026-10-31/s-9d1cfb9f.md', n, seqNo, role, '', 'qq', line.length, line, atMs, '{}')
  const id = Number(db.prepare('SELECT last_insert_rowid() id').get().id)
  db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(line) || line)
}
console.log('raw 索引重建行数', n)

// 4) 清孤儿实体
const orphan = db.prepare('SELECT id FROM entities WHERE id NOT IN (SELECT DISTINCT entity_id FROM memory_entities)').all()
for (const e of orphan) db.prepare('DELETE FROM entities WHERE id=?').run(e.id)
console.log('清理孤儿实体', orphan.length)
