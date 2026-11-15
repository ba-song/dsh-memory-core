/** 从 session_projcache 的 identity.cwd 回填 raw_meta.cwd（按 sid 前 8 位匹配） */
import { readFileSync, readdirSync } from 'node:fs'
import { openDb } from '../lib/store/db.js'
import { DATA_DIR } from '../lib/config.js'

const { db } = openDb(DATA_DIR)
try { db.exec("ALTER TABLE raw_meta ADD COLUMN cwd TEXT DEFAULT ''") } catch {}
const map = new Map()
try {
  for (const f of readdirSync('/root/.dsh/storages/session_projcache/sessions')) {
    if (!f.endsWith('.json')) continue
    try {
      const j = JSON.parse(readFileSync('/root/.dsh/storages/session_projcache/sessions/' + f, 'utf8'))
      const id = (f.match(/^([0-9a-f]{8})/) ?? [])[1] ?? ''
      const cwd = String(j?.record?.identity?.cwd ?? '')
      if (id && cwd) map.set(id, cwd)
    } catch {}
  }
} catch {}
const rows = db.prepare("SELECT file, count(*) c FROM raw_meta WHERE cwd='' OR cwd IS NULL GROUP BY file").all()
let fixed = 0
for (const r of rows) {
  const sid = String(r.file).split('/').pop().replace(/^s-/, '').replace(/\.md$/, '').slice(0, 8)
  const cwd = map.get(sid)
  if (!cwd) continue
  db.prepare("UPDATE raw_meta SET cwd=? WHERE file=? AND (cwd='' OR cwd IS NULL)").run(cwd, r.file)
  fixed += db.prepare("SELECT changes() c").get().c
}
console.log(JSON.stringify({ ok: true, files: rows.length, fixed, sessions: map.size }))
