/** 把 raw 档案里的 你/她/想 迁到 主人/汐/汐·想（只改行首角色） */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { DATA_DIR } from '../lib/config.js'
import { bigrams } from '../lib/store/fts.js'

const MAP = { 你: '主人', 她: '汐', 想: '汐·想' }
const { db } = openDb(DATA_DIR)
let files = 0, lines = 0
function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${name.name}`
    if (name.isDirectory()) { walk(p); continue }
    if (!name.name.endsWith('.md')) continue
    const src = readFileSync(p, 'utf8')
    let changed = false
    const out = src.split('\n').map((line) => {
      const m = line.match(/^(\d{2}:\d{2}:\d{2} \[(\d*)\] )([^：]+)(：.*)$/)
      if (!m) return line
      const next = MAP[m[3]]
      if (!next) return line
      changed = true; lines++
      return m[1] + next + m[4]
    }).join('\n')
    if (changed) { writeFileSync(p, out); files++ }
  }
}
walk(`${DATA_DIR}/raw`)

const rows = db.prepare("SELECT id,role,raw_text FROM raw_meta WHERE role IN ('你','她','想')").all()
for (const r of rows) {
  const role = MAP[r.role]
  const text = String(r.raw_text).replace(/^(\d{2}:\d{2}:\d{2} \[\d*\] )[^：]+：/, `$1${role}：`)
  db.prepare('UPDATE raw_meta SET role=?, raw_text=?, chars=? WHERE id=?').run(role, text, text.length, r.id)
  db.prepare('DELETE FROM raw_fts WHERE rowid=?').run(r.id)
  db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(r.id, bigrams(text) || text)
}
console.log(JSON.stringify({ ok: true, files, lines, metaRows: rows.length }))
