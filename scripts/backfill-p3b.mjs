import { openDb } from '../lib/store/db.js'
import { DATA_DIR } from '../lib/config.js'
import { linkMemory } from '../lib/store/graph.js'
import { loadEmbed, embedTexts } from '../lib/embed/onnx.mjs'
import { saveVector } from '../lib/store/memories.js'
const { db } = openDb(DATA_DIR)
const rows = db.prepare('SELECT id,text FROM memories').all()
let linked = 0
db.exec('BEGIN IMMEDIATE')
try {
  for (const r of rows) linked += linkMemory(db, r.id, r.text) > 0 ? 1 : 0
  db.exec('COMMIT')
} catch (e) { try { db.exec('ROLLBACK') } catch {} ; throw e }
console.log('实体关联：', linked, '/', rows.length, '| 实体数', db.prepare('SELECT count(*) c FROM entities').get().c,
  '| 关联数', db.prepare('SELECT count(*) c FROM memory_entities').get().c)
await loadEmbed('/opt/qqai/models/bge-small-zh')
const missing = db.prepare('SELECT m.id,m.text FROM memories m LEFT JOIN vectors v ON v.memory_id=m.id WHERE v.memory_id IS NULL').all()
let done = 0
for (const m of missing) { try { const [v] = await embedTexts([m.text]); if (v) { await saveVector(db, m.id, v); done += 1 } } catch {} }
console.log('补向量：', done, '/', missing.length, '| 现有向量', db.prepare('SELECT count(*) c FROM vectors').get().c)
