/** 【相关思考】【相关情绪】——2026-11-05 注入口径：思考/情绪各自成块，不混进原话 */
import { normalizeRole, roleDisplay, ROLE } from '../roles.js'
import { stampOf } from '../adapter/timefmt.js'
import {
  findAnchorRow, loadDialogRows, expandDialogWindow, cleanRowBody, loadThoughtRows, nearestThoughtFrom, emotionAtTime, parseSourceRef, dayOfRow,
  loadToolRows, toolsBetween, summarizeToolEntries, sessionIdOfRow,
} from './anchors.js'
const PREFIX = /^\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：/
const PROV_HEAD = '【出处上下文】'
const PROV_TAIL = '【出处上下文结束】'


/** 命中消息 ±2 行里的「思考」（self-thought），最多 4 条 */
export function buildThoughtsBlock(db, { cwd = '', hits = [] } = {}) {
  if (!db || !cwd || !hits.length) return { block: '', count: 0 }
  const seen = new Set(); const rows = []
  for (const hit of hits.slice(0, 2)) {
    let found = null
    try { found = findAnchorRow(db, hit, { cwd }) } catch {}
    if (!found) continue
    const anchor = found.row
    const sessionId = found.src.sid || sessionIdOfRow(anchor)
    const near = loadThoughtRows(db, { file: anchor.file, cwd, day: dayOfRow(anchor), sessionId })
      .filter((row) => Math.abs(Number(row.line_no) - Number(anchor.line_no)) <= 2)
    for (const row of near) {
      if (normalizeRole(row.role) !== ROLE.SELF_THOUGHT) continue
      const key = `${row.file}:${row.line_no}`
      if (seen.has(key)) continue
      seen.add(key)
      const text = String(row.raw_text ?? '').replace(PREFIX, '').replace(/\s+/g, ' ').trim()
      if (text) rows.push({ line: `- ${stampOf(row.at)} [${roleDisplay(row.role)}] ${text.slice(0, 80)}`, at: row.at })
    }
  }
  const picked = rows.slice(0, 4)
  if (!picked.length) return { block: '', count: 0 }
  return { block: ['【相关思考】', ...picked.map((row) => row.line), '【相关思考结束】'].join('\n'), count: picked.length }
}
/**
 * 命中消息 ±2 条范围内对应的情绪：优先 persona 服务（emotionTimeline / emotionAt），
 * 拿不到再退化到 memory 遗留的 emotion_timeline；都没有则省略。
 */
export function buildEmotionBlock(db, { cwd = '', hits = [], persona } = {}) {
  if (!db || !cwd || !hits.length) return { block: '', count: 0 }
  const times = []
  try {
    for (const hit of hits.slice(0, 2)) {
      let found = null
      try { found = findAnchorRow(db, hit, { cwd }) } catch {}
      if (!found) continue
      const anchor = found.row
      const sessionId = found.src.sid || sessionIdOfRow(anchor)
      const near = loadDialogRows(db, { file: anchor.file, cwd, day: dayOfRow(anchor), sessionId })
        .filter((row) => Math.abs(Number(row.line_no) - Number(anchor.line_no)) <= 2)
      times.push(...near.map((row) => Number(row.at)).filter((value) => value > 0))
    }
  } catch {}
  if (!times.length) return { block: '', count: 0 }
  const from = Math.min(...times); const to = Math.max(...times)

  let best = null
  let personaTried = false
  const usable = (row) => row && Number(row.intensity ?? 0) >= 0.35 && Number(row.confidence ?? 1) >= 0.35
  if (persona && typeof persona.emotionTimeline === 'function') {
    personaTried = true
    try {
      const rows = awaitMaybe(persona.emotionTimeline({ from, to, limit: 3 })) || []
      best = rows.filter(usable).at(-1) ?? null
    } catch {}
  } else if (persona && typeof persona.emotionAt === 'function') {
    personaTried = true
    try { const row = awaitMaybe(persona.emotionAt(to, { windowMs: 600000 })); if (usable(row)) best = row } catch {}
  }
  if (!best && !personaTried) {
    try { best = db.prepare('SELECT label,valence,arousal,intensity,at FROM emotion_timeline WHERE at BETWEEN ? AND ? ORDER BY ABS(at-?) LIMIT 1').get(from, to, to) ?? null } catch {}
  }
  if (!usable(best)) return { block: '', count: 0 }
  return { block: [`【相关情绪】${best.label ?? ''}（强度 ${Number(best.intensity).toFixed(2)}）`, '【相关情绪结束】'].join('\n'), count: 1 }
}
/** 兼容同步/异步的 persona 接口（真接口是同步的，测试里可能给 Promise） */
function awaitMaybe(v) { return v && typeof v.then === 'function' ? null : v }

const rowKey = (r) => `${r?.file ?? ''}:${r?.line_no ?? ''}`
const intOr = (v, def) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? n : def
}

/**
 * 【出处上下文】（2026-11-15 口径）
 *
 * 命中 memories 行 → raw_meta 原话锚点 → 前后各 window 条对白（默认共 5 条），
 * 每条带「想：」（±8 行内最近的 self-thought，同 seq 优先）与「心情：」
 * （persona.emotionAt 优先 → emotionTimeline → 本地 emotion_timeline；强度 < 0.35 省略）。
 *
 * - top N（默认 2，可配 maxHits）个可用 hit 各自展开；窗口重叠按 file:line 去重合并，
 *   最终按时间/行号升序输出；
 * - 与【相关原话】重复的行用「（同 RAG 第 N 条）」指代，**锚点原话除外** ——
 *   锚点必须保留完整原文，保证纯语义命中也能看到「命中原话」；
 * - 预算：maxRows（默认 10）/ maxChars（默认 2000）；超限按 hit 顺序（recall 相关度序）
 *   整窗丢弃，不把 5 条窗口切一半；
 * - 定位不到锚点 / 窗口为空的 hit 计入 stats.skipped，不伪造。
 */
export function buildProvenanceBlock(db, {
  cwd = '', hits = [], persona, ragRows = [],
  maxHits = 2, window: radius = 2, maxRows = 10, maxChars = 2000,
  thoughtRadius = 8, emotionWindowMs = 600000, minIntensity = 0.35, minConfidence = 0.35,
} = {}) {
  const empty = (stats) => ({ block: '', count: 0, stats })
  const baseStats = {
    hits: Array.isArray(hits) ? hits.length : 0,
    considered: 0, windows: 0, anchors: 0, merged: 0, rows: 0, chars: 0,
    skipped: [], dropped: [], maxHits: intOr(maxHits, 2), window: intOr(radius, 2),
    maxRows: intOr(maxRows, 10), maxChars: intOr(maxChars, 2000),
    tools: { calls: 0, ok: 0, err: 0, unknown: 0, shownRows: 0, summaryChars: 0, dropped: '' },
  }
  if (!db || !cwd || !Array.isArray(hits) || !hits.length) return empty({ ...baseStats, anchors: 0 })
  const wantHits = Math.max(0, intOr(maxHits, 2))
  const radiusN = Math.max(0, intOr(radius, 2))
  const thoughtN = Math.max(0, intOr(thoughtRadius, 8))
  const rowsCap = Math.max(1, intOr(maxRows, 10))
  const charsCap = Math.max(1, intOr(maxChars, 2000))
  const emoWindow = Math.max(0, Number(emotionWindowMs) || 600000)
  const minI = Number.isFinite(Number(minIntensity)) ? Number(minIntensity) : 0.35
  const minC = Number.isFinite(Number(minConfidence)) ? Number(minConfidence) : 0.35

  const windows = []
  const dialogCache = new Map()
  const loadDialogsFor = (row, sessionId = '') => {
    const key = `${row?.file ?? ''}:${sessionId}`
    if (!dialogCache.has(key)) dialogCache.set(key, loadDialogRows(db, { file: row.file, cwd, day: dayOfRow(row), sessionId }))
    return dialogCache.get(key)
  }
  const usedAnchors = new Set()
  const skipped = []
  let merged = 0
  let considered = 0
  for (const h of hits) {
    if (windows.length >= wantHits) break
    considered += 1
    const src = parseSourceRef(h)
    const hitId = h?.id ?? null
    let found = null
    try { found = findAnchorRow(db, h, { cwd }) } catch { found = null }
    if (!found) {
      skipped.push({ id: hitId, reason: 'anchor-not-found', source: src.kind, text: String(h?.text ?? '').slice(0, 30) })
      continue
    }
    const anchor = found.row
    const key = rowKey(anchor)
    if (usedAnchors.has(key)) { merged += 1; continue }
    const sessionId = found.src.sid || sessionIdOfRow(anchor)
    const win = expandDialogWindow(loadDialogsFor(anchor, sessionId), anchor, { radius: radiusN })
    if (!win.length) {
      skipped.push({ id: hitId, reason: 'empty-window', source: found.via, text: String(h?.text ?? '').slice(0, 30) })
      continue
    }
    usedAnchors.add(key)
    windows.push({ hit: h, hitId, via: found.via, anchor, sessionId, rows: win })
  }
  const stats = { ...baseStats, considered, windows: windows.length, anchors: windows.length }
  if (!windows.length) return empty({ ...stats, skipped })

  // 去重合并：同一 file:line 只出现一次；锚点行单独标记（正文不缩写）
  const unionRows = (list) => {
    const anchorKeys = new Set(list.map((w) => rowKey(w.anchor)))
    const map = new Map()
    for (const w of list) {
      for (const r of w.rows) {
        const k = rowKey(r)
        const cur = map.get(k)
        if (!cur) map.set(k, { row: r, anchor: anchorKeys.has(k), sessionId: w.sessionId })
      }
    }
    return [...map.values()].sort((a, b) => {
      const dt = Number(a.row.at ?? 0) - Number(b.row.at ?? 0)
      if (dt) return dt
      const df = String(a.row.file ?? '').localeCompare(String(b.row.file ?? ''))
      if (df) return df
      return Number(a.row.line_no ?? 0) - Number(b.row.line_no ?? 0)
    })
  }

  // 按 maxRows 整窗截断：命中顺序 = recall 相关度顺序，丢最后（最不相关）的窗口
  const dropped = []
  const kept = windows.slice()
  while (kept.length > 1 && unionRows(kept).length > rowsCap) {
    const w = kept.pop()
    dropped.push({ id: w.hitId, reason: 'max-rows' })
  }

  // 工具归属（2026-11-15）：每条 assistant 行 = 「上一条 dialog (不含) → 本行 (不含)」之间的
  // 具/果/错/图/文；用户行不挂工具（工具是她当轮的动作，归到紧随其后的 assistant 行）。
  // 只按行号边界取，不把整个文件/全天的工具塞进来。
  const toolCache = new Map()
  const loadToolsFor = (row, sessionId = '') => {
    const key = `${row?.file ?? ''}:${sessionId}`
    if (!toolCache.has(key)) toolCache.set(key, loadToolRows(db, { file: row.file, cwd, day: dayOfRow(row), sessionId }))
    return toolCache.get(key)
  }
  const toolsByRow = new Map()
  const toolEntries = []
  for (const item of unionRows(kept)) {
    const r = item.row
    if (normalizeRole(r.role) !== ROLE.SELF) continue
    const dialogs = loadDialogsFor(r, item.sessionId)
    const idx = dialogs.findIndex((x) => Number(x.line_no) === Number(r.line_no))
    if (idx < 0) continue
    const prevLine = idx > 0 ? Number(dialogs[idx - 1].line_no) : 0
    const entries = toolsBetween(loadToolsFor(r, item.sessionId), { fromLine: prevLine, toLine: Number(r.line_no) })
    if (entries.length) {
      toolsByRow.set(rowKey(r), entries)
      toolEntries.push(...entries)
    }
  }
  const toolSummary = summarizeToolEntries(toolEntries)
  const toolSummaryLine = () => {
    let line = `【工具概要】调用 ${toolSummary.calls} 次，成功 ${toolSummary.ok}，失败 ${toolSummary.err}`
    if (toolSummary.unknown > 0) line += `，未完成 ${toolSummary.unknown}`
    if (toolSummary.latest) line += `，最近 ${toolSummary.latest}`
    if (toolSummary.errDetail) line += `；错误：${toolSummary.errDetail}`
    return line.length > 300 ? line.slice(0, 299) + '…' : line
  }
  const formatToolEntry = (e) => {
    const status = e.status === 'ok' ? 'ok' : e.status === 'err' ? (e.errCode ? `err: ${e.errCode}` : 'err') : '?'
    return `${String(e.name ?? 'tool')}(${status})`
  }

  // 每条原话的想/心情只算一次（预算裁剪时只重排，不重查）；
  // 思考按文件批量取（按 day+role 走索引），窗口内复用，避免每行一次全表扫描
  const detail = new Map()
  const thoughtCache = new Map()
  for (const item of unionRows(kept)) {
    const r = item.row
    const thoughtKey = `${r.file}:${item.sessionId ?? ''}`
    let thoughts = thoughtCache.get(thoughtKey)
    if (!thoughts) {
      thoughts = loadThoughtRows(db, { file: r.file, cwd, day: dayOfRow(r), sessionId: item.sessionId ?? '' })
      thoughtCache.set(thoughtKey, thoughts)
    }
    const th = nearestThoughtFrom(thoughts, r, { radius: thoughtN })
    const emo = emotionAtTime(db, {
      at: r.at, persona, windowMs: emoWindow, minIntensity: minI, minConfidence: minC,
    })
    detail.set(rowKey(r), { th, emo })
  }

  const ragList = Array.isArray(ragRows) ? ragRows : []
  const ragKey = new Map()
  ragList.forEach((r, i) => { if (r?.file) ragKey.set(`${r.file}:${r.lineNo}`, i + 1) })
  const render = (list, { tools = true } = {}) => {
    const rows = unionRows(list)
    if (!rows.length) return { block: '', count: 0 }
    const out = [PROV_HEAD]
    let n = 0
    for (const item of rows) {
      const r = item.row
      const text = cleanRowBody(r)
      if (!text) continue
      n += 1
      let dupOf = 0
      if (!item.anchor) {
        dupOf = ragKey.get(rowKey(r)) || (ragList.findIndex((x) => String(x?.text ?? '').trim() === text) + 1) || 0
      }
      if (dupOf) out.push(`- ${stampOf(r.at)} [${roleDisplay(r.role)}]（同 RAG 第 ${dupOf} 条）`)
      else out.push(`- ${stampOf(r.at)} [${roleDisplay(r.role)}] ${text.slice(0, 80)}`)
      const th = detail.get(rowKey(r))?.th
      out.push(`  想：${th?.text ? th.text.slice(0, 60) : '无'}`)
      const emo = detail.get(rowKey(r))?.emo
      if (emo) out.push(`  心情：${emo.label ?? ''}（${Number(emo.intensity).toFixed(2)}）`)
      if (tools) {
        const entries = toolsByRow.get(rowKey(r))
        if (entries?.length) out.push(`  具：${entries.slice(-2).map(formatToolEntry).join(', ')}`)
      }
    }
    if (n === 0) return { block: '', count: 0 }
    if (tools && toolSummary.calls > 0) out.push(toolSummaryLine())
    out.push(PROV_TAIL)
    return { block: out.join('\n'), count: n }
  }

  // 预算：先保五条消息/想/心情；超 maxChars 时工具行+【工具概要】整块丢弃；再超才整窗丢弃
  let toolsDropped = ''
  let result = render(kept, { tools: true })
  if (result.block.length > charsCap && toolsByRow.size > 0) {
    result = render(kept, { tools: false })
    toolsDropped = 'max-chars'
  }
  while (kept.length > 1 && result.block.length > charsCap) {
    const w = kept.pop()
    dropped.push({ id: w.hitId, reason: 'max-chars' })
    result = render(kept, { tools: false })
  }
  if (!result.block) return empty({ ...stats, skipped, dropped })

  stats.anchors = kept.length
  stats.merged = merged
  stats.rows = result.count
  stats.chars = result.block.length
  stats.skipped = skipped
  stats.dropped = dropped
  stats.overBudget = result.block.length > charsCap
  stats.tools = {
    calls: toolSummary.calls,
    ok: toolSummary.ok,
    err: toolSummary.err,
    unknown: toolSummary.unknown,
    shownRows: toolsDropped ? 0 : toolsByRow.size,
    summaryChars: toolsDropped || !toolSummary.calls ? 0 : toolSummaryLine().length,
    dropped: toolsDropped,
  }
  return { block: result.block, count: result.count, stats }
}
