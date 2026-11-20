/**
 * 命中出处定位（2026-11-15）
 *
 * 目标：recall 返回的是 memories 行；注入要能看到「命中原话 + 前后各 2 条对白」。
 * 纯语义命中没有关键词重叠时，也必须能靠 source_msg_id / source_ts / hit.text
 * 回到 raw_meta 的原始对白行；定位不到就返回 null（调用方记 stats 跳过），绝不编造。
 *
 * 约定：
 * - 只认「对白」行（user/self，旧角色值也归一进来），self-thought / 工具 / 事件行不是原话；
 * - 所有查询都带 cwd + tombstone=0，不串房间、不引用已撤回原话；
 * - 只读、无状态，不写任何表。
 */
import { bigrams } from '../store/fts.js'
import { cleanChannelEnvelope, shortSid } from '../ingest/archive.js'
import { isSilentUtterance, stripArchivePrefix } from '../ingest/utterance.js'
import { normalizeRole, ROLE } from '../roles.js'
import { dayOf } from '../adapter/timefmt.js'

/** SQL 里要匹配的旧/新对白角色值（读路径双读兼容） */
const DIALOG_SQL = [ROLE.USER, ROLE.SELF, '主人', '汐', '你', '她']
/** SQL 里要匹配的思考角色值 */
const THOUGHT_SQL = [ROLE.SELF_THOUGHT, '汐·想', '想']
/** 工具/附件行角色（call / result / error / 附件） */
export const TOOL_ROLES = Object.freeze(['具', '果', '错', '图', '文'])

const TS_WINDOW_MS = 5 * 60 * 1000
const TEXT_MATCH_MIN_DICE = 0.5

export function isDialogRole(role) {
  const r = normalizeRole(role)
  return r === ROLE.USER || r === ROLE.SELF
}

/**
 * 原话正文：去档案行前缀、去渠道信封、把归档用的 ⏎ 还原成空格并压空白。
 * 非对白行不做渠道清洗（思考/工具行本来就没信封）。
 */
export function cleanRowBody(row) {
  let body = stripArchivePrefix(String(row?.raw_text ?? ''))
  if (isDialogRole(row?.role)) body = cleanChannelEnvelope(body)
  return body.replace(/⏎/g, ' ').replace(/\s+/g, ' ').trim()
}

/** 思考正文：只去前缀/换行，不丢内容（展示侧再截断） */
export function cleanThoughtText(row) {
  return stripArchivePrefix(String(row?.raw_text ?? '')).replace(/⏎/g, ' ').replace(/\s+/g, ' ').trim()
}

/** 记忆正文（用于文本兜底匹配；去掉块标题之类的前缀） */
export function normalizeHitText(text) {
  return String(text ?? '').replace(/^【[^】]{0,24}】\s*/, '').replace(/\s+/g, ' ').trim()
}

/** 字符 bigram Dice 相似度（0..1；中英文都按字母/数字切） */
export function bigramDice(a, b) {
  const grams = (s) => {
    const out = new Set()
    const t = String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    const chars = [...t]
    for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i] + chars[i + 1])
    return out
  }
  const A = grams(a)
  const B = grams(b)
  if (!A.size || !B.size) {
    const x = String(a ?? '').replace(/\s+/g, '').toLowerCase()
    const y = String(b ?? '').replace(/\s+/g, '').toLowerCase()
    return x && x === y ? 1 : 0
  }
  let hit = 0
  for (const g of A) if (B.has(g)) hit += 1
  return (2 * hit) / (A.size + B.size)
}

/**
 * 解析 source_msg_id 的几种已知形态：
 *   raw:<raw_meta.id>                → 直接锚
 *   p4:<sessionId>:<event.seq>       → 会话文件 + seq
 *   explicit:<sessionId>:<event.seq> → 会话文件 + seq
 *   group-turn:<群号>:<at 毫秒>      → 时间
 *   其余以 13 位毫秒结尾的             → 时间
 * 不认识的形态一律不猜 seq（例如 `chatlog:2026-11-05` 的末位 5 不是 seq）。
 */
export function parseSourceRef(hit) {
  const raw = String(hit?.source_msg_id ?? '').trim()
  const ts = Number(hit?.source_ts ?? 0) || 0
  if (!raw) return { kind: ts > 0 ? 'ts' : 'none', ts, raw: '' }
  let m = raw.match(/^raw:(\d+)$/)
  if (m) return { kind: 'raw-id', rawId: Number(m[1]), ts, raw }
  m = raw.match(/^(p4|explicit):(.+):(\d+)$/)
  if (m) return { kind: 'session-seq', sid: String(m[2] ?? ''), seq: Number(m[3]), ts, raw }
  m = raw.match(/^group-turn:([^:]+):(\d+)$/)
  if (m) return { kind: 'ts', ts: Number(m[2]) || ts, raw }
  m = raw.match(/:(\d+)$/)
  if (m && Number(m[1]) >= 1e11) return { kind: 'ts', ts: Number(m[1]), raw }
  return { kind: ts > 0 ? 'ts' : 'text-or-none', ts, raw }
}

/** 跨房间/非 owner 的命中不做出处回捞（避免把别处记忆硬贴到本房间原话上） */
function scopeAllowsOrigin(hit) {
  const st = String(hit?.scope_type ?? '')
  return !st || st === 'owner' || st === 'core'
}

export function sessionIdOfRow(row) {
  try { return String(JSON.parse(String(row?.extra ?? '{}'))?.sessionId ?? '') } catch { return '' }
}

/** 对新归档记录使用完整 sessionId；纯旧数据才退回短文件名。 */
export function filterSessionRows(rows, sessionId = '') {
  if (!Array.isArray(rows) || !sessionId) return Array.isArray(rows) ? rows : []
  const tagged = rows.filter((row) => sessionIdOfRow(row))
  if (tagged.length) return rows.filter((row) => sessionIdOfRow(row) === sessionId)
  const short = shortSid(sessionId)
  const scoped = rows.filter((row) => String(row.file ?? '').includes(`/s-${short}`))
  // 纯旧数据没有 sessionId 元数据时，保留时间/文本二次判定的历史降级路径。
  return scoped.length ? scoped : rows
}

function dialogCandidate(rows, { ts = 0, hit } = {}) {
  if (!Array.isArray(rows) || !rows.length) return null
  const hitText = normalizeHitText(hit?.text)
  let best = null
  let bestScore = -Infinity
  for (const r of rows) {
    if (Number(r?.tombstone ?? 0) !== 0) continue
    if (!isDialogRole(r.role)) continue
    const body = cleanRowBody(r)
    if (!body || isSilentUtterance(body)) continue
    let score = 0
    // 时间差按秒扣分（最多扣 3600），文本相似最多加 60：时间优先、文本破同分
    if (ts > 0) score -= Math.min(3600, Math.abs(Number(r.at ?? 0) - ts) / 1000)
    if (hitText) score += 60 * bigramDice(hitText, body)
    if (score > bestScore) { bestScore = score; best = r }
  }
  return best
}

/** day 列和文件日期前缀不一致（老/迁移/测试行）时才需要按 file 全表兜底 */
function needsFileFallback(day, file) {
  const d = String(day ?? '')
  if (!d) return true
  const prefix = String(file ?? '').match(/^(\d{4}-\d{2}-\d{2})\//)
  return !prefix || prefix[1] !== d
}

/** 行所属档案日：优先 day 列；老/测试行退化为 `YYYY-MM-DD/文件名` 前缀 */
export function dayOfRow(row) {
  const d = String(row?.day ?? '').trim()
  if (d) return d
  const m = String(row?.file ?? '').match(/^(\d{4}-\d{2}-\d{2})\//)
  return m ? m[1] : ''
}

/** source_ts 附近可能跨天的档案日（±5 分钟；Asia/Shanghai，与归档一致） */
function daysAround(ts) {
  const t = Number(ts)
  if (!(t > 0)) return []
  return [...new Set([-TS_WINDOW_MS, 0, TS_WINDOW_MS].map((d) => dayOf(t + d)))]
}

/**
 * 按天 + 角色走 idx_raw_day(day, role) 索引，避免 raw_meta 全表扫描
 * （生产库 raw_meta ~18MB、raw_vectors 170MB+，全扫一次 40ms 起）。
 */
function queryByDays(db, { days = [], cwd = '', roles = DIALOG_SQL, seq = 0, ts = 0, needle = '' }) {
  const ph = roles.map(() => '?').join(',')
  const out = []
  for (const day of days) {
    const where = ['day=?', 'cwd=?', 'tombstone=0', `role IN (${ph})`]
    const params = [day, cwd, ...roles]
    if (seq > 0) { where.push('seq=?'); params.push(seq) }
    if (ts > 0) { where.push('at BETWEEN ? AND ?'); params.push(ts - TS_WINDOW_MS, ts + TS_WINDOW_MS) }
    if (needle) { where.push('instr(raw_text, ?) > 0'); params.push(needle) }
    try {
      out.push(...db.prepare(`SELECT * FROM raw_meta WHERE ${where.join(' AND ')} ORDER BY at DESC, line_no DESC`).all(...params))
    } catch {}
  }
  return out
}

function legacySeqRows(db, { cwd, sid = '', seq }) {
  try {
    const rows = db.prepare('SELECT * FROM raw_meta WHERE seq=? AND cwd=? AND tombstone=0 ORDER BY at DESC, line_no DESC').all(seq, cwd)
    return filterSessionRows(rows, sid)
  } catch { return [] }
}

function findBySeq(db, { cwd, sid = '', seq, ts = 0, hit }) {
  if (!Number.isFinite(seq) || seq <= 0) return null
  const short = sid ? shortSid(sid) : ''
  const days = daysAround(ts)
  if (days.length) {
    const rows = queryByDays(db, { days, cwd, seq })
    if (rows.length) {
      // 同一天里优先命中该会话文件（s-<short>.md / .backfill.md），否则按 source_ts 距离挑
      return dialogCandidate(filterSessionRows(rows, sid), { ts, hit })
    }
    // day 列异常/老迁移行：只在按天查空时退一次全表（命中后仍按 source_ts 选，避免同 seq 撞会话）
    return dialogCandidate(legacySeqRows(db, { cwd, sid, seq }), { ts, hit })
  }
  // 旧数据没有 source_ts：只退这一次全表（不猜会话；seq+cwd）
  return dialogCandidate(legacySeqRows(db, { cwd, sid, seq }), { ts, hit })
}

function findByTs(db, { cwd, ts, hit, sid = '' }) {
  const t = Number(ts)
  if (!(t > 0)) return null
  let rows = queryByDays(db, { days: daysAround(t), cwd, ts: t })
  if (!rows.length) {
    // day 列异常/老迁移行：按时间窗全表退一次（生产上仅锚点定位失败时走到）
    try {
      rows = db.prepare('SELECT * FROM raw_meta WHERE cwd=? AND tombstone=0 AND at BETWEEN ? AND ? ORDER BY ABS(at-?) ASC LIMIT 200')
        .all(cwd, t - TS_WINDOW_MS, t + TS_WINDOW_MS, t)
    } catch { return null }
  }
  rows = filterSessionRows(rows, sid)
  if (!rows.length) return null
  rows.sort((a, b) => Math.abs(Number(a.at ?? 0) - t) - Math.abs(Number(b.at ?? 0) - t))
  return dialogCandidate(rows, { ts: t, hit })
}

function findByText(db, { cwd, hit, sid = '' }) {
  const needle = normalizeHitText(hit?.text)
  if (needle.length < 2) return null
  const core = needle.slice(0, 60)
  // 只查记忆来源日/创建日附近，避免为了文本兜底全表扫 raw_meta
  const ts = Number(hit?.source_ts ?? 0)
  const created = Number(hit?.created_at_epoch ?? 0)
  const days = ts > 0
    ? daysAround(ts)
    : (created > 0 ? [...new Set([dayOf(created), dayOf(created - 86400000)])] : [])
  // 1) 原话正文就是记忆正文的子串（最常见：记忆是原话摘要/原话本身）
  let exact = days.length ? queryByDays(db, { days, cwd, needle: core }) : []
  if (!exact.length) {
    // 没有任何时间可用（老/测试行）：只做一次无日期兜底；生产 memories 一定有 created_at_epoch
    const ph0 = DIALOG_SQL.map(() => '?').join(',')
    try {
      exact = db.prepare(`SELECT * FROM raw_meta WHERE cwd=? AND tombstone=0 AND role IN (${ph0}) AND instr(raw_text, ?) > 0 ORDER BY at DESC LIMIT 20`)
        .all(cwd, ...DIALOG_SQL, core)
    } catch { exact = [] }
  }
  exact = filterSessionRows(exact, sid)
  const picked = dialogCandidate(exact, { hit })
  if (picked) return picked
  // 2) bigram FTS 兜底：只收 Dice ≥ 0.5 的候选；不到阈值就跳过（不编造）
  const grams = bigrams(core).split(' ').filter(Boolean)
  if (!grams.length) return null
  const ph = DIALOG_SQL.map(() => '?').join(',')
  try {
    const expr = grams.map((g) => `"${g.replaceAll('"', '""')}"`).join(' OR ')
    // FTS 只取 cwd 内前 50 条（索引驱动，不扫 raw_meta 全表）；文本相似度不到阈值仍跳过
    const rows = db.prepare(`SELECT m.* FROM raw_fts f JOIN raw_meta m ON m.id=f.rowid
      WHERE raw_fts MATCH ? AND m.cwd=? AND m.tombstone=0 AND m.role IN (${ph})
      ORDER BY m.at DESC LIMIT 50`).all(expr, cwd, ...DIALOG_SQL)
    rows = filterSessionRows(rows, sid)
    let best = null
    let bestDice = 0
    for (const r of rows) {
      const body = cleanRowBody(r)
      if (!body || isSilentUtterance(body)) continue
      const d = bigramDice(core, body)
      if (d > bestDice) { bestDice = d; best = r }
    }
    if (best && bestDice >= TEXT_MATCH_MIN_DICE) return best
  } catch {}
  return null
}

/**
 * 命中 memories 行 → raw_meta 原话锚点。
 * @returns {{row:object, via:'source-id'|'source-ts'|'hit-text', src:object}|null}
 */
export function findAnchorRow(db, hit, { cwd = '' } = {}) {
  if (!db || !cwd || !hit) return null
  if (!scopeAllowsOrigin(hit)) return null
  const src = parseSourceRef(hit)
  let row = null
  let via = ''
  if (src.kind === 'raw-id') {
    try {
      const cand = db.prepare('SELECT * FROM raw_meta WHERE id=? AND cwd=? AND tombstone=0').get(src.rawId, cwd)
      if (cand && isDialogRole(cand.role)) {
        const body = cleanRowBody(cand)
        if (body && !isSilentUtterance(body)) { row = cand; via = 'source-id' }
      }
    } catch {}
  }
  if (!row && src.kind === 'session-seq') {
    const cand = findBySeq(db, { cwd, sid: src.sid, seq: src.seq, ts: src.ts || 0, hit })
    if (cand) { row = cand; via = 'source-id' }
  }
  if (!row && src.ts > 0) {
    const sid = src.kind === 'session-seq' ? src.sid : ''
    const cand = findByTs(db, { cwd, ts: src.ts, hit, sid })
    if (cand) { row = cand; via = 'source-ts' }
  }
  if (!row) {
    const sid = src.kind === 'session-seq' ? src.sid : ''
    const cand = findByText(db, { cwd, hit, sid })
    if (cand) { row = cand; via = 'hit-text' }
  }
  return row ? { row, via, src } : null
}

/** 同一天同一文件里的全部对白行（升序；排除思考/工具/事件/[SILENT]） */
export function loadDialogRows(db, { file, cwd, day = '', sessionId = '' }) {
  if (!db || !file || !cwd) return []
  const d = day || dayOfRow({ file })
  const ph = DIALOG_SQL.map(() => '?').join(',')
  const cols = 'id,day,file,line_no,seq,role,at,raw_text,extra'
  let rows = []
  if (d) {
    try {
      rows = db.prepare(`SELECT ${cols} FROM raw_meta
        WHERE day=? AND cwd=? AND tombstone=0 AND role IN (${ph}) ORDER BY line_no`)
        .all(d, cwd, ...DIALOG_SQL)
        .filter((r) => String(r.file ?? '') === String(file))
    } catch { rows = [] }
  }
  if (!rows.length && needsFileFallback(d, file)) {
    // 仅老库/迁移行（day 与文件日期对不上）才按文件退一次，避免正常空文件全表扫
    try {
      rows = db.prepare(`SELECT ${cols} FROM raw_meta
        WHERE file=? AND cwd=? AND tombstone=0 AND role IN (${ph}) ORDER BY line_no`)
        .all(file, cwd, ...DIALOG_SQL)
    } catch { return [] }
  }
  rows = filterSessionRows(rows, sessionId)
  return rows.filter((r) => {
    const body = cleanRowBody(r)
    return Boolean(body) && !isSilentUtterance(body)
  })
}

/**
 * 以锚点为中心取「前后各 radius 条对白」，共 2*radius+1 条；
 * 文件边界不足时从另一侧继续补足（不跨越文件）。
 */
export function expandDialogWindow(rows, anchor, { radius = 2 } = {}) {
  const list = Array.isArray(rows) ? rows : []
  const idx = list.findIndex((r) => Number(r.line_no) === Number(anchor?.line_no))
  if (idx < 0) return []
  const r = Math.max(0, Math.floor(Number(radius) || 0))
  const want = 2 * r + 1
  const picked = [list[idx]]
  let li = idx - 1
  let ri = idx + 1
  for (let k = 0; k < r; k++) {
    if (li >= 0) picked.push(list[li--])
    if (ri < list.length) picked.push(list[ri++])
  }
  while (picked.length < want && (li >= 0 || ri < list.length)) {
    if (ri < list.length) picked.push(list[ri++])
    if (picked.length >= want) break
    if (li >= 0) picked.push(list[li--])
  }
  picked.sort((a, b) => Number(a.line_no) - Number(b.line_no))
  return picked.slice(0, want)
}

/** 同一天同一文件里的全部思考行（一次取回，供整个窗口复用） */
export function loadThoughtRows(db, { file, cwd, day = '', sessionId = '' }) {
  if (!db || !file || !cwd) return []
  const d = day || dayOfRow({ file })
  const ph = THOUGHT_SQL.map(() => '?').join(',')
  const cols = 'day,file,line_no,seq,role,at,raw_text,extra'
  let rows = []
  if (d) {
    try {
      rows = db.prepare(`SELECT ${cols} FROM raw_meta
        WHERE day=? AND cwd=? AND tombstone=0 AND role IN (${ph}) ORDER BY line_no`)
        .all(d, cwd, ...THOUGHT_SQL)
        .filter((r) => String(r.file ?? '') === String(file))
    } catch { rows = [] }
  }
  if (!rows.length && needsFileFallback(d, file)) {
    try {
      rows = db.prepare(`SELECT ${cols} FROM raw_meta
        WHERE file=? AND cwd=? AND tombstone=0 AND role IN (${ph}) ORDER BY line_no`)
        .all(file, cwd, ...THOUGHT_SQL)
    } catch { return [] }
  }
  return filterSessionRows(rows, sessionId)
}

/**
 * 每条原话对应的思考：同 file、±radius 行内最近的 self-thought；
 * 同 seq（同一条 assistant 消息里的思考）优先，其次行号最近、时间最近。
 * @returns {{text:string, at:number, lineNo:number, sameSeq:boolean}|null}
 */
export function nearestThoughtFrom(rows, row, { radius = 8 } = {}) {
  const base = Number(row?.line_no)
  if (!Array.isArray(rows) || !Number.isFinite(base)) return null
  const seq = Number(row?.seq ?? 0)
  const at = Number(row?.at ?? 0)
  const rN = Math.max(0, Math.floor(Number(radius) || 0))
  const picked = rows.filter((r) => Math.abs(Number(r.line_no) - base) <= rN)
  const scored = picked
    .map((r) => ({
      r,
      sameSeq: seq > 0 && Number(r.seq) === seq ? 0 : 1,
      dLine: Math.abs(Number(r.line_no) - base),
      dAt: Math.abs(Number(r.at ?? 0) - at),
    }))
    .sort((a, b) => a.sameSeq - b.sameSeq || a.dLine - b.dLine || a.dAt - b.dAt)
  for (const s of scored) {
    const text = cleanThoughtText(s.r)
    if (text) return { text, at: Number(s.r.at ?? 0), lineNo: Number(s.r.line_no), sameSeq: s.sameSeq === 0 }
  }
  return null
}

/** 同一天同一文件里的工具/附件行（升序；供「上一条 dialog → 当前 assistant 行」归属） */
export function loadToolRows(db, { file, cwd, day = '', sessionId = '' }) {
  if (!db || !file || !cwd) return []
  const d = day || dayOfRow({ file })
  const ph = TOOL_ROLES.map(() => '?').join(',')
  const cols = 'day,file,line_no,seq,role,at,raw_text,extra'
  let rows = []
  if (d) {
    try {
      rows = db.prepare(`SELECT ${cols} FROM raw_meta
        WHERE day=? AND cwd=? AND tombstone=0 AND role IN (${ph}) ORDER BY line_no`)
        .all(d, cwd, ...TOOL_ROLES)
        .filter((r) => String(r.file ?? '') === String(file))
    } catch { rows = [] }
  }
  if (!rows.length && needsFileFallback(d, file)) {
    try {
      rows = db.prepare(`SELECT ${cols} FROM raw_meta
        WHERE file=? AND cwd=? AND tombstone=0 AND role IN (${ph}) ORDER BY line_no`)
        .all(file, cwd, ...TOOL_ROLES)
    } catch { return [] }
  }
  return filterSessionRows(rows, sessionId)
}

function toolNameOf(row) {
  try {
    const ex = JSON.parse(String(row?.extra ?? '{}'))
    if (ex && typeof ex.name === 'string' && ex.name.trim()) return sanitizeToolName(ex.name)
  } catch {}
  const body = stripArchivePrefix(String(row?.raw_text ?? '')).trim()
  return sanitizeToolName(body.split(/\s+/)[0] ?? '')
}

function sanitizeToolName(name) {
  const t = String(name ?? '').replace(/[^\w.:-]/g, '').slice(0, 40)
  return t || 'tool'
}

function toolResultIsError(row) {
  try {
    const ex = JSON.parse(String(row?.extra ?? '{}'))
    if (ex && ex.isError === true) return true
  } catch {}
  return /^ERROR\b/i.test(stripArchivePrefix(String(row?.raw_text ?? '')).trim())
}

/**
 * 脱敏错误摘要：只回错误码（要求含下划线，避免把自由文本/参数当码），
 * 没有码再退化到 40 字以内的短句；含 JSON/引号的结果正文一律不取（防泄漏参数/结果）。
 */
function toolErrorDetail(row) {
  const body = stripArchivePrefix(String(row?.raw_text ?? ''))
    .replace(/^ERROR\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const code = body.match(/\b(?:E_[A-Z0-9]{2,}|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/)
  if (code) return code[0].slice(0, 40)
  const http = body.match(/\b(?:HTTP|status)[ :=]*(\d{3})\b/i)
  if (http) return `HTTP ${http[1]}`
  if (!body || /[{}\[\]"]/.test(body)) return ''
  // 兜底短句再做一次脱敏：超长 token / 手机号打码，防止错误正文夹带参数或隐私
  const safe = body
    .replace(/[A-Za-z0-9_./:\-]{16,}/g, '***')
    .replace(/(^|[^0-9])1[3-9]\d{9}(?![0-9])/g, '$1***')
  return safe.slice(0, 40)
}

/**
 * 把一段行号区间里的工具行解析成短条目：
 * - 具 开一次调用；其后第一条果 定 ok/err；错 视为失败；
 * - 图/文 作为附件条目（kind=attachment，不计入调用次数）；
 * - 没有对应参数的孤立结果直接忽略（不猜归属）。
 * @returns {Array<{kind:'call'|'attachment',name:string,status:'ok'|'err'|'?',errCode:string,lineNo:number,at:number}>}
 */
export function parseToolEntries(rows) {
  const out = []
  let open = null
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const role = String(r?.role ?? '')
    if (role === '具') {
      if (open) out.push(open)
      open = { kind: 'call', name: toolNameOf(r), status: '?', errCode: '', lineNo: Number(r.line_no), at: Number(r.at) }
    } else if (role === '果') {
      if (!open) continue
      const isErr = toolResultIsError(r)
      open.status = isErr ? 'err' : 'ok'
      open.errCode = isErr ? toolErrorDetail(r) : ''
      out.push(open)
      open = null
    } else if (role === '错') {
      const errCode = toolErrorDetail(r)
      if (open) { open.status = 'err'; open.errCode = errCode; out.push(open); open = null }
      else out.push({ kind: 'call', name: '错误', status: 'err', errCode, lineNo: Number(r.line_no), at: Number(r.at) })
    } else if (role === '图' || role === '文') {
      out.push({ kind: 'attachment', name: role === '图' ? '图片' : '文件', status: 'ok', errCode: '', lineNo: Number(r.line_no), at: Number(r.at) })
    }
  }
  if (open) out.push(open)
  return out
}

/**
 * 取「(上一条 dialog, 当前 assistant 行)」之间的工具条目。
 * 超出区间的一律不要（不把整个文件/全天的工具塞进来）。
 */
export function toolsBetween(toolRows, { fromLine = 0, toLine = 0 } = {}) {
  const from = Number(fromLine)
  const to = Number(toLine)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return []
  const rows = (Array.isArray(toolRows) ? toolRows : [])
    .filter((r) => Number(r.line_no) > from && Number(r.line_no) < to)
    .sort((a, b) => Number(a.line_no) - Number(b.line_no))
  return parseToolEntries(rows)
}

/** 工具概要：只统计调用（不含附件），最近名称按条目顺序取最后一个 call */
export function summarizeToolEntries(entries) {
  const list = Array.isArray(entries) ? entries.filter((e) => e?.kind === 'call') : []
  const ok = list.filter((e) => e.status === 'ok').length
  const err = list.filter((e) => e.status === 'err').length
  const unknown = list.length - ok - err
  const latest = list.length ? String(list.at(-1)?.name ?? '') : ''
  const errEntry = [...list].reverse().find((e) => e.status === 'err' && e.errCode)
  return { calls: list.length, ok, err, unknown, latest, errDetail: errEntry?.errCode ?? '' }
}

/** 单条查询便捷入口（保持旧 API；窗口内请用 loadThoughtRows + nearestThoughtFrom 复用） */
export function nearestThought(db, row, { cwd = '', radius = 8 } = {}) {
  if (!db || !row || !cwd) return null
  const rows = loadThoughtRows(db, { file: row.file, cwd, day: row.day ?? '' })
  return nearestThoughtFrom(rows, row, { radius })
}

function usableEmotion(e, { minIntensity, minConfidence }) {
  if (!e) return false
  const i = Number(e.intensity)
  if (!Number.isFinite(i) || i < minIntensity) return false
  return Number(e.confidence ?? 1) >= minConfidence
}

/**
 * 某条原话当时的情绪：persona.emotionAt 优先 → persona.emotionTimeline → 本地 emotion_timeline 退化。
 * 强度/置信度不足或取不到 → null（调用方省略「心情」，保持现状）。
 */
export function emotionAtTime(db, { at, persona, windowMs = 600000, minIntensity = 0.35, minConfidence = 0.35 } = {}) {
  const t = Number(at)
  if (!Number.isFinite(t) || t <= 0) return null
  const w = Math.max(0, Number(windowMs) || 0)
  const opt = { minIntensity, minConfidence }
  if (persona && typeof persona.emotionAt === 'function') {
    try {
      const e = persona.emotionAt(t, { windowMs: w })
      // persona 明确给了数据（哪怕是低强度）就按「强度 <0.35 省略」，不拿旧表冒充
      if (e && typeof e.then !== 'function') return usableEmotion(e, opt) ? e : null
    } catch {}
  }
  if (persona && typeof persona.emotionTimeline === 'function') {
    try {
      const rows = persona.emotionTimeline({ from: t - w, to: t + w, limit: 5 })
      if (Array.isArray(rows) && rows.length) {
        const ok = rows.filter((e) => usableEmotion(e, opt))
        return ok.length ? ok.at(-1) : null
      }
    } catch {}
  }
  try {
    const e = db.prepare('SELECT label,intensity,at FROM emotion_timeline WHERE at BETWEEN ? AND ? ORDER BY ABS(at-?), id DESC LIMIT 1')
      .get(t - w, t + w, t)
    if (usableEmotion(e, opt)) return e
  } catch {}
  return null
}
