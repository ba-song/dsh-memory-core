/**
 * 一次性清理：把原句档案里 onebot 拼进来的聊天规矩（【私聊】… [现在是 …]）去掉，
 * 然后重建 raw_meta / raw_fts。原始行格式保持 "HH:MM:SS [seq] 角色：内容"。
 */
import { openDb } from '../lib/store/db.js'
import { stripRuleBlock, stripSelfCheckTags } from '../lib/ingest/archive.js'
import { bigrams } from '../lib/store/fts.js'
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.DY_MEMORY_DIR || '/sdcard/Documents/DSH记忆档案/memory-core-live'
const RAW = join(DIR, 'raw')
const { db } = openDb(DIR)

let files = 0, lines = 0, before = 0, after = 0
const dayDirs = readdirSync(RAW).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
const rows = []
for (const day of dayDirs) {
  const dir = join(RAW, day)
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const abs = join(dir, f)
    const text = readFileSync(abs, 'utf8')
    const out = []
    const parsed = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      lines += 1; before += line.length
      const m = line.match(/^(\d{2}:\d{2}:\d{2}) \[(\d*)\] (你|她|想|事|撤)：(.*)$/)
      if (!m) { out.push(line); continue }
      const [, clock, seq, role, body] = m
      let clean = role === '你' ? stripRuleBlock(body).trim() : body
      if (role === '她' || role === '想') clean = stripSelfCheckTags(clean)
      const newLine = clean ? `${clock} [${seq}] ${role}：${clean}` : ''
      if (newLine) { out.push(newLine); after += newLine.length }
      if (newLine) parsed.push({ day, file: `${day}/${f}`, line: out.length, seq: Number(seq) || 0, role, text: newLine, body: clean })
    }
    writeFileSync(abs, out.join('\n') + '\n')
    files += 1
    rows.push(...parsed)
  }
}

// 重建索引
db.exec('DELETE FROM raw_fts')
db.exec('DELETE FROM raw_meta')
const insM = db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at)
  VALUES(?,?,?,?,?,?,?,0,?,?,?)`)
const insF = db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)')
db.exec('BEGIN IMMEDIATE')
try {
  for (const r of rows) {
    const t = new Date(`${r.day}T00:00:00`).getTime() + 0
    insM.run(r.day, r.file, r.line, r.seq, r.role, '', 'qq', r.text.length, r.text, t)
    const id = Number(db.prepare('SELECT last_insert_rowid() id').get().id)
    const indexed = r.body.length > 600 ? r.body.slice(-400) : r.body
    insF.run(id, bigrams(indexed) || indexed)
  }
  db.exec('COMMIT')
} catch (e) { try { db.exec('ROLLBACK') } catch {} ; throw e }

console.log(JSON.stringify({ ok: true, files, lines, beforeChars: before, afterChars: after, rows: rows.length }))
