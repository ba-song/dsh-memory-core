/** 修复清理脚本重建后丢失 seq/role/at 的 raw_meta 行：从 md 行首解析 */
import { readFileSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { DATA_DIR } from '../lib/config.js'
import { bigrams } from '../lib/store/fts.js'

const { db } = openDb(DATA_DIR)
const files = db.prepare("SELECT DISTINCT file FROM raw_meta WHERE role=''").all().map((r) => r.file)
let fixed = 0
for (const file of files) {
  const day = file.slice(0, 10)
  const abs = `${DATA_DIR}/raw/${file}`
  const lines = readFileSync(abs, 'utf8').split('\n').filter((l) => l.trim())
  const rows = db.prepare('SELECT id,line_no FROM raw_meta WHERE file=? ORDER BY line_no').all(file)
  for (const r of rows) {
    const line = lines[r.line_no - 1]
    if (!line) continue
    const m = line.match(/^(\d{2}):(\d{2}):(\d{2}) \[(\d*)\] ([^：]+)：(.*)$/)
    if (!m) continue
    const [, hh, mm, ss, seq, role, text] = m
    const at = new Date(`${day}T${hh}:${mm}:${ss}+08:00`).getTime()
    db.prepare('UPDATE raw_meta SET seq=?,role=?,at=?,chars=?,raw_text=? WHERE id=?')
      .run(Number(seq) || 0, role, at, line.length, line, r.id)
    db.prepare('DELETE FROM raw_fts WHERE rowid=?').run(r.id)
    db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(r.id, bigrams(line) || line)
    fixed += 1
  }
}
console.log(JSON.stringify({ ok: true, files, fixed }))
