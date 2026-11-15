import { openDb } from '../lib/store/db.js'
import { DATA_DIR } from '../lib/config.js'
import { collect, applyAll } from '../lib/ingest/migrate.js'

const dry = !process.argv.includes('--apply')
const refresh = process.argv.includes('--refresh-episodes')
const { db } = openDb(DATA_DIR)
const data = collect({ days: 7 })
const all = { facts: data.facts, todos: data.todos, episodes: data.episodes, handoffs: data.handoffs }
const rows = [...all.facts, ...all.todos, ...all.episodes, ...all.handoffs]
const chars = rows.reduce((s, r) => s + String(r.text).length, 0)
const keys = rows.map((r) => r.sourceKey)
const dup = keys.length - new Set(keys).size
const existing = new Set(db.prepare('SELECT meta FROM memories').all().map((r) => {
  try { return JSON.parse(r.meta || '{}').sourceKey || '' } catch { return '' }
}))
const already = keys.filter((k) => existing.has(k)).length
console.log(JSON.stringify({
  mode: dry ? 'dry-run' : 'apply',
  facts: all.facts.length, todos: all.todos.length,
  episodes: all.episodes.length, handoffs: all.handoffs.length,
  total: rows.length, chars, dupKeys: dup, alreadyImported: already,
}), null, 2)
if (refresh) {
  const { loadEmbed, embedTexts } = await import('../lib/embed/onnx.mjs')
  const { saveVector } = await import('../lib/store/memories.js')
  const { indexTexts, removeTexts } = await import('../lib/store/fts.js')
  await loadEmbed('/opt/qqai/models/bge-small-zh')
  let n = 0
  for (const e of data.episodes) {
    const row = db.prepare("SELECT id,meta FROM memories WHERE json_extract(meta,'$.sourceKey')=?").get(e.sourceKey)
    if (!row) continue
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE memories SET text=? WHERE id=?').run(e.text, row.id)
      removeTexts(db, row.id); indexTexts(db, row.id, e.text)
      db.exec('COMMIT')
    } catch (err) { try { db.exec('ROLLBACK') } catch {} ; throw err }
    const [v] = await embedTexts([e.text])
    if (v) await saveVector(db, row.id, v)
    n += 1
  }
  console.log(`刷新 episode 摘要：${n} 条`)
} else if (dry) {
  console.log('--- 样本 ---')
  for (const r of rows.slice(0, 5)) console.log(`[${r.kind}] ${r.text.slice(0, 50)}`)
} else {
  const r = await applyAll(db, data)
  if (r.inserted) {
    // 给新导入的记忆补向量（语义检索用）
    const { loadEmbed, embedTexts, embedAvailable } = await import('../lib/embed/onnx.mjs')
    await loadEmbed('/opt/qqai/models/bge-small-zh')
    const { saveVector } = await import('../lib/store/memories.js')
    let done = 0
    for (const id of r.ids) {
      const m = db.prepare('SELECT text FROM memories WHERE id=?').get(id)
      if (!m) continue
      try {
        const [v] = await embedTexts([m.text])
        if (v) { await saveVector(db, id, v); done += 1 }
      } catch {}
    }
    console.log(`向量补算：${done} 条`)
  }
}
