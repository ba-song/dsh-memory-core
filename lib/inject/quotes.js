/** P6.5：【相关原话】三源合成——命中出处原文 / 查询命中 / 最近 30 分钟 */
import { bigrams } from '../store/fts.js'
import { cleanChannelEnvelope } from '../ingest/archive.js'
import { overlaps } from './hits.js'
import { normalizeRole, roleDisplay, roleSqlValues, ROLE } from '../roles.js'
import { stampOf } from '../adapter/timefmt.js'
import { isSilentUtterance, stripArchivePrefix } from '../ingest/utterance.js'
import { findAnchorRow } from './anchors.js'

const HEAD = '【相关原话】'
const TAIL = '【相关原话结束】'
const BUDGET = 450
const MAX_ROWS = 5


function roleIsDialog(role) { const n = normalizeRole(role); return n === ROLE.USER || n === ROLE.SELF }
function stripPrefix(line) {
  return String(line ?? '').replace(/^\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：/, '')
}
function clip(text, n = 60) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

export function buildQuotesBlock(db, { cwd, hits = [], query = '', now = Date.now(), maxHits = 2 } = {}) {
  if (!cwd) return { block: '', sources: {} }
  const picked = []
  const seen = new Set()
  const add = (row, tag) => {
    if (!row || picked.length >= MAX_ROWS) return
    const key = `${row.file}:${row.line_no}`
    if (seen.has(key)) return
    if (normalizeRole(row.role) === ROLE.SELF_THOUGHT) return   // 思考归【相关思考】，不混进原话
    const body = stripArchivePrefix(row.raw_text)
    const text = roleIsDialog(row.role) ? cleanChannelEnvelope(body) : body
    if (isSilentUtterance(text)) return   // [SILENT] = 她决定不说话，不是原话
    if (picked.some((p) => overlaps(p.text, text))) return
    seen.add(key)
    picked.push({ text, file: row.file, lineNo: row.line_no, line: `- ${stampOf(row.at)} [${roleDisplay(row.role)}] ${clip(text)}`, tag })
  }

  // 来源 1（2026-11-15）：命中记忆的出处原话。
  // 旧实现只吃 query FTS + 最近 30 分钟：纯语义命中（没有关键词重叠）会整块为空，
  // 命中原话根本没出现过。这里先把每个可用 hit 的 raw_meta 锚点原话放进块里。
  const limitHits = Math.max(0, Math.floor(Number(maxHits) || 0))
  let anchors = 0
  for (const h of (Array.isArray(hits) ? hits : [])) {
    if (anchors >= limitHits || picked.length >= MAX_ROWS) break
    let found = null
    try { found = findAnchorRow(db, h, { cwd }) } catch { found = null }
    if (!found) continue
    anchors += 1
    add(found.row, 'hit')
  }

  // 来源 2：查询命中（排除刚才这条用户消息的回声）
  // 2026-11-05（B-1b）：只取对话角色——事件/工具行（事/步/具/果/量/境…）不是「原话」
  const q = String(query ?? '').trim()
  const grams = bigrams(q).split(' ').filter(Boolean)
  const roles = roleSqlValues()
  const rolePh = roles.map(() => '?').join(',')
  if (grams.length) {
    try {
      const expr = grams.map((g) => `"${g.replaceAll('"', '""')}"`).join(' OR ')
      const rows = db.prepare(`SELECT m.* FROM raw_fts f JOIN raw_meta m ON m.id=f.rowid
        WHERE raw_fts MATCH ? AND m.tombstone=0 AND m.cwd=? AND m.role IN (${rolePh}) LIMIT 20`).all(expr, cwd, ...roles)
      for (const r of rows) {
        if (r.at > now - 120000 && stripPrefix(r.raw_text).includes(q)) continue
        add(r, 'query')
        if (picked.filter((p) => p.tag === 'query').length >= 2) break
      }
    } catch {}
  }

  // 来源 3：最近 30 分钟（同样只取对话角色）
  try {
    const rows = db.prepare(`SELECT * FROM raw_meta WHERE cwd=? AND at>=? AND at<=? AND tombstone=0 AND role IN (${rolePh}) ORDER BY at DESC LIMIT 20`).all(cwd, now - 30 * 60000, now, ...roles)
    for (const r of rows) {
      const body = stripPrefix(r.raw_text).trim()
      if (r.at > now - 120000 && q && body.includes(q)) continue
      add(r, 'recent')
    }
  } catch {}

  if (!picked.length) return { block: '', sources: {} }
  const lines = []
  let used = HEAD.length + TAIL.length + 2
  for (const p of picked.slice(0, MAX_ROWS)) {
    if (used + p.line.length + 1 > BUDGET) break
    lines.push(p.line); used += p.line.length + 1
  }
  if (!lines.length) return { block: '', sources: {} }
  return { block: [HEAD, ...lines, TAIL].join('\n'), sources: { count: lines.length, tags: picked.map((p) => p.tag), rows: picked.map((p) => ({ file: p.file, lineNo: p.lineNo, text: p.text })) } }
}
