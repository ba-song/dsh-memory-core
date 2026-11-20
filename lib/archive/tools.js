/** P5.4a：档案分层读取 + 本地抽取（子智能体接通前的安全回退） */
import { bigrams } from '../store/fts.js'

import { roleDisplay, roleSqlValues, normalizeRole, ROLE } from '../roles.js'
import { dayOf, clockOf } from '../adapter/timefmt.js'
import { cleanChannelEnvelope } from '../ingest/archive.js'
import { isSilentUtterance } from '../ingest/utterance.js'
import { decodeVector } from '../store/vector-codec.js'

// 2026-11-06：对话只含 user+self（含旧显示名别名），排除 self-thought（思考走 reasoning）
const DIALOG_ROLES = roleSqlValues().filter((r) => ['user', 'self', '主人', '你', '汐', '她'].includes(String(r)))
const TOOL_ROLES = ['具', '果', '错', '图', '文', '步']


function stripPrefix(line) {
  return String(line ?? '').replace(/^\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：/, '')
}
/** 读取兜底：user/self 的旧行也可能带渠道信封，输出前再洗一次 */
function cleanOut(role, rawText) {
  const n = normalizeRole(role)
  const t = stripPrefix(rawText)
  return (n === ROLE.USER || n === ROLE.SELF) ? cleanChannelEnvelope(t) : t
}

export function readArchive(db, { kind = 'dialog', days = 1, limit = 40, channel = '', cwd = '' } = {}) {
  if (Number(days) !== 1) return { ok: false, error: 'days 只接受 1；更早的内容用 dy_archive_research' }
  const n = Math.max(1, Math.min(Number(limit) || 40, 200))
  const roles = kind === 'reasoning' ? ['self-thought', '汐·想', '想'] : DIALOG_ROLES
  const ph = roles.map(() => '?').join(',')
  const day = dayOf(Date.now())
  const ch = String(channel ?? '')
  const ROOM = { qq: ['/sdcard/DSHA/渠道/qq', '/root/qq-agent/QQ会话'], home: ['/sdcard/DSHA/生活/数据/home'] }
  const room = ROOM[ch] ?? []
  const c = String(cwd ?? '')
  const rows = db.prepare(`SELECT role,at,raw_text,cwd FROM raw_meta
    WHERE day=? AND role IN (${ph}) AND tombstone=0 AND (?='' OR cwd=?) ORDER BY at DESC, id DESC LIMIT ?`).all(day, ...roles, c, c, n)
    .filter((r) => !room.length || room.some((p) => String(r.cwd ?? '') === p || String(r.cwd ?? '').startsWith(p + '/')))
    .filter((r) => !isSilentUtterance(r.raw_text))
    .reverse()
  const lines = rows.map((r) => `${clockOf(r.at)} [${roleDisplay(r.role)}] ${cleanOut(r.role, r.raw_text)}`)
  return { ok: true, count: lines.length, text: lines.join('\n') }
}

export function toolsOverview(db, { days = 1, cwd = '' } = {}) {
  if (Number(days) !== 1) return { ok: false, error: 'days 只接受 1' }
  const day = dayOf(Date.now())
  const c = String(cwd ?? '')
  const counts = db.prepare(`SELECT role,count(*) c FROM raw_meta WHERE day=? AND role IN ('具','果','错','图','文','步') AND tombstone=0 AND (?='' OR cwd=?) GROUP BY role`).all(day, c, c)
  const calls = db.prepare(`SELECT raw_text FROM raw_meta WHERE day=? AND role='具' AND tombstone=0 AND (?='' OR cwd=?) ORDER BY at DESC LIMIT 5`).all(day, c, c).map((r) => stripPrefix(r.raw_text))
  const errs = db.prepare(`SELECT raw_text FROM raw_meta WHERE day=? AND role='错' AND tombstone=0 AND (?='' OR cwd=?) ORDER BY at DESC LIMIT 2`).all(day, c, c).map((r) => stripPrefix(r.raw_text))
  const m = new Map(counts.map((r) => [r.role, r.c]))
  const parts = []
  const callN = m.get('具') ?? 0, resN = m.get('果') ?? 0
  if (callN) parts.push(`调了 ${callN} 次工具`, ...calls.slice(0, 3))
  if (resN) parts.push(`返回 ${resN} 条`)
  if (m.get('错')) parts.push(`报错 ${m.get('错')} 次`, ...errs)
  if (m.get('图') || m.get('文')) parts.push(`图片 ${m.get('图') ?? 0} / 文件 ${m.get('文') ?? 0}`)
  if (!parts.length) return { ok: true, text: '', count: 0 }
  let text = parts.join('；')
  if (text.length > 300) text = text.slice(0, 299) + '…'
  return { ok: true, text, count: callN + resN }
}


/** 一条命中：取前后各 2 条对白，并带出最近思考、情绪（2026-11-08） */
function hitWindow(db, hit, { persona = null, budget = 1200 } = {}) {
  const a = db.prepare('SELECT * FROM raw_meta WHERE id=?').get(hit.id)
  if (!a) return ''
  const c = String(a.cwd ?? '')
  let rows = []
  try {
    rows = db.prepare('SELECT * FROM raw_meta WHERE file=? AND (?=\'\' OR cwd=?) AND tombstone=0 ORDER BY line_no').all(a.file, c, c)
  } catch { return '' }
  const idx = rows.findIndex((r) => Number(r.id) === Number(a.id))
  if (idx < 0) return ''
  const dialog = (r) => {
    const n = normalizeRole(r.role)
    return n === ROLE.USER || n === ROLE.SELF
  }
  const picked = [rows[idx]]
  let left = idx - 1, right = idx + 1
  while (picked.length < 5 && (left >= 0 || right < rows.length)) {
    if (left >= 0) { if (dialog(rows[left])) picked.push(rows[left]); left -= 1 }
    if (picked.length >= 5) break
    if (right < rows.length) { if (dialog(rows[right])) picked.push(rows[right]); right += 1 }
  }
  picked.sort((x, y) => Number(x.line_no) - Number(y.line_no))
  const out = [`【命中 ${hit.index}】`]
  let used = 0
  for (const r of picked) {
    const text = cleanOut(r.role, r.raw_text)
    const line = `- ${clockOf(r.at)} [${roleDisplay(r.role)}] ${text.slice(0, 160)}`
    if (used + line.length > budget) break
    out.push(line); used += line.length + 1
    let th = null
    try {
      th = db.prepare(`SELECT raw_text FROM raw_meta WHERE file=? AND (?=\'\' OR cwd=?) AND tombstone=0 AND role IN ('self-thought','汐·想','想') AND line_no BETWEEN ? AND ? ORDER BY ABS(line_no-?) LIMIT 1`)
        .get(r.file, c, c, Number(r.line_no) - 8, Number(r.line_no) + 8, Number(r.line_no))
    } catch {}
    if (th) {
      const tx = String(th.raw_text ?? '').replace(/^\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：/, '').replace(/\s+/g, ' ').trim()
      if (tx) out.push(`  想：${tx.slice(0, 100)}`)
    }
    let emo = null
    try { emo = db.prepare('SELECT label,intensity,at FROM raw_emotion_archive WHERE raw_id=?').get(r.id) } catch {}
    if (!emo && persona?.emotionAt) {
      try { emo = persona.emotionAt(Number(r.at), { windowMs: 600000 }) } catch {}
    }
    if (emo && Number(emo.intensity ?? 0) >= 0.35) out.push(`  心情：${emo.label ?? ''}（${Number(emo.intensity).toFixed(2)}）`)
  }
  return out.join('\n')
}

export function searchArchive(db, { question = '', limit = 400, cwd = '', queryEmbed = null, withContext = false, persona = null } = {}) {
  const q = String(question ?? '').trim()
  const grams = bigrams(q).split(' ').filter(Boolean)
  if (!grams.length) return { ok: true, text: '', count: 0 }
  const expr = grams.map((g) => `"${g.replaceAll('"', '""')}"`).join(' OR ')
  let rows = []
  try {
    const c = String(cwd ?? '')
    rows = db.prepare(`SELECT m.id,m.day,m.at,m.role,m.raw_text FROM raw_fts f JOIN raw_meta m ON m.id=f.rowid
      WHERE raw_fts MATCH ? AND m.tombstone=0 AND (?='' OR m.cwd=?) LIMIT 20`).all(expr, c, c)
  } catch { return { ok: true, text: '', count: 0 } }
  const seen = new Set()
  const out = []
  const selected = []
  let used = 0
  rows = rows.filter((r) => !isSilentUtterance(r.raw_text))
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    const line = cleanOut(r.role, r.raw_text)
    const idx = q ? line.indexOf(q.slice(0, 4)) : -1
    const start = idx > 200 ? idx - 200 : 0
    const snippet = line.slice(start, start + 400)
    const item = `${r.day.slice(5)} ${clockOf(r.at)} [${r.role}] ${snippet}`
    if (used + item.length + 1 > limit) break
    out.push(item); used += item.length + 1
    selected.push({ id: Number(r.id), index: selected.length + 1 })
  }
  // 2026-11-08：语义通路（有 raw_vectors + queryEmbed 时），与关键词结果按 id 并集
  // 2026-11-17 优化（实测）：生产库 raw_vectors 51,072 行 / 99.8MB，`SELECT ... .all()`
  // 一次要 **2.66 s 且 RSS 冲到 208MB**；而下面 for 循环的第一句就是
  // `if (used + item.length + 1 > limit) break` —— 关键词结果一旦占满预算（默认 limit=400 字，
  // 一条命中 400 字就到顶），语义结果必然被原样丢掉，这 2.66 秒纯属白烧。
  // 因此剩余预算连「最短可能的一段」都放不下时直接短路：行为完全不变（本来也加不进去）。
  // 最短一段 = "MM-DD HH:MM [role] " ≈ 19 字，这里取 16 作保守下界（只会少跳、不会错跳）。
  const MIN_ITEM_CHARS = 16
  if (queryEmbed && queryEmbed.length && limit - used >= MIN_ITEM_CHARS) {
    try {
      const qv = queryEmbed instanceof Float32Array ? queryEmbed : Float32Array.from(queryEmbed)
      const have = new Set(rows.map((r) => Number(r.id)))
      const vecRows = db.prepare('SELECT raw_id,dim,vec FROM raw_vectors').all()
      const cand = []
      for (const v of vecRows) {
        if (have.has(Number(v.raw_id))) continue
        // 2026-11-17：int8 量化后统一走 decodeVector（float32 旧行与 int8 新行都认）
        const arr = decodeVector(Number(v.dim), v.vec)
        if (!arr || arr.length !== qv.length) continue
        let dot = 0
        for (let i = 0; i < qv.length; i++) dot += qv[i] * arr[i]
        if (dot >= 0.5) cand.push({ id: Number(v.raw_id), score: dot })
      }
      cand.sort((a, b) => b.score - a.score)
      for (const c of cand.slice(0, 5)) {
        const m = db.prepare('SELECT id,day,at,role,raw_text FROM raw_meta WHERE id=? AND tombstone=0').get(c.id)
        if (!m) continue
        const item = `${String(m.day).slice(5)} ${clockOf(m.at)} [${roleDisplay(m.role)}] ${cleanOut(m.role, m.raw_text).slice(0, 400)}`
        if (used + item.length + 1 > limit) break
        out.push(item); used += item.length + 1; seen.add(c.id)
        selected.push({ id: Number(m.id), index: selected.length + 1 })
      }
    } catch {}
  }
  if (withContext && selected.length) {
    const windows = selected.map((h) => hitWindow(db, h, { persona })).filter(Boolean)
    return { ok: true, text: windows.join('\n\n'), count: selected.length, semantic: Boolean(queryEmbed), withContext: true }
  }
  return { ok: true, text: out.join('\n'), count: out.length, semantic: Boolean(queryEmbed) }
}
