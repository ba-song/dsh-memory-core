/**
 * 日结归纳（2026-11-12）：把过去一天的原话压成「几条长期记忆 + 一段主人画像 + 一段日记草稿」。
 *
 * 安全口径：
 * - 默认 `dryRun: true`：只生成 JSON 到 `数据/consolidate/dryrun-YYYY-MM-DD.json`，不写库；
 * - 正式写入时：记忆进 memories（layer=auto, scope=owner），画像 upsert 到 profiles，
 *   日记草稿只写文件，不覆盖她的日记；
 * - 每条都带 source_msg_id，可回原话核对；原文一条不删。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { insertMemory } from '../store/memories.js'
import { consolidateByLlm } from './llm.js'
import { bestMatch } from './similarity.js'
import { writeStyleFile } from '../style.js'
import { anchorRelativeTime } from '../time/anchor.js'

export const CONSOLIDATE_DEFAULTS = Object.freeze({
  enabled: false,
  dryRun: true,
  hour: 4,
  minute: 10,
  windowHours: 24,
  maxInputChars: 12000,
  maxInputRows: 600,
  excludeGroup: true,
  maxFacts: 3,
  maxShortterm: 5,
  shorttermTtlHours: 72,
  minConfidence: 0.6,
  dedupeThreshold: 0.55,
  writeProfile: true,
})

const normCfg = (raw = {}) => {
  const num = (v, d, min, max) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
  }
  return {
    ...CONSOLIDATE_DEFAULTS,
    ...raw,
    enabled: raw.enabled === true,
    dryRun: raw.dryRun !== false,
    hour: Math.floor(num(raw.hour, 4, 0, 23)),
    minute: Math.floor(num(raw.minute, 10, 0, 59)),
    windowHours: Math.floor(num(raw.windowHours, 24, 1, 168)),
    maxInputChars: Math.floor(num(raw.maxInputChars, 12000, 1000, 30000)),
    maxInputRows: Math.floor(num(raw.maxInputRows, 600, 50, 2000)),
    excludeGroup: raw.excludeGroup !== false,
    maxFacts: Math.floor(num(raw.maxFacts, 3, 1, 12)),
    maxShortterm: Math.floor(num(raw.maxShortterm, 5, 0, 12)),
    shorttermTtlHours: Math.floor(num(raw.shorttermTtlHours, 72, 1, 24 * 30)),
    writeProfile: raw.writeProfile !== false,
    minConfidence: num(raw.minConfidence, 0.6, 0, 1),
    dedupeThreshold: num(raw.dedupeThreshold, 0.55, 0.3, 0.95),
  }
}

/** 读窗口内的原话：只收真实对话（user/self），默认排除群聊；取最近 N 条（按时间升序返回）。 */
export function gatherWindow(db, { since, until = Date.now(), limit = 600, excludeGroup = true } = {}) {
  const where = [
    'at >= ?', 'at <= ?',
    "COALESCE(tombstone,0)=0",
    'raw_text IS NOT NULL', 'length(raw_text)>0',
    "role IN ('user','self')",
  ]
  const args = [Number(since) || 0, Number(until)]
  if (excludeGroup) {
    where.push("cwd NOT LIKE '%/qq-群/%'")
  }
  const sql = `
    SELECT id, at, role, cwd, raw_text
    FROM raw_meta
    WHERE ${where.join(' AND ')}
    ORDER BY at DESC
    LIMIT ?
  `
  const rows = db.prepare(sql).all(...args, Number(limit) || 600).reverse()
  return rows.map((r) => ({ ...r, text: String(r.raw_text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) })).filter((r) => r.text)
}

/** 拼给模型的对话摘录（带序号，便于 source 回填）。 */
export function buildDigestText(rows, maxChars = 12000) {
  const lines = []
  let used = 0
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const who = r.role === 'user' ? '主人' : (r.role === 'self' || r.role === 'assistant') ? '汐' : String(r.speaker || r.role || '?')
    const line = `#${i + 1} [${who}] ${r.text}`
    if (used + line.length + 1 > maxChars) break
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

const dayKey = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })

/** 写一次日结（dryRun 时只落 JSON 报告）。 */
export async function dailyConsolidate({ db, ctx, cfg: rawCfg, log, now = Date.now(), dataDir = '' } = {}) {
  const cfg = normCfg(rawCfg)
  const until = Number(now)
  const lastRaw = db.prepare("SELECT v FROM meta WHERE k='consolidate.lastAt'").get()?.v
  const since = Number(lastRaw) > 0 ? Math.max(Number(lastRaw), until - cfg.windowHours * 3600000) : until - cfg.windowHours * 3600000
  const rows = gatherWindow(db, { since, until, limit: cfg.maxInputRows, excludeGroup: cfg.excludeGroup })
  if (rows.length < 5) return { ok: false, reason: 'too-few', rows: rows.length }

  const text = buildDigestText(rows, cfg.maxInputChars)
  // 2026-11-16 P0-2：日结模型调用进 operations 账本；id 带窗口，所以「同一窗口重跑」不重复扣费，
  // 换窗口（第二天/手动补跑）是另一个操作，不会被旧结果挡住。
  const llm = await consolidateByLlm({
    ctx, text, config: cfg.llm, log,
    db,
    requestId: `daily:${dayKey(until)}:${since}-${until}`,
    now: until,
  })
  if (!llm.ok) {
    try { log?.warn?.(`日结跳过：${llm.reason}`) } catch {}
    return { ok: false, reason: llm.reason, detail: llm.detail ?? null, rows: rows.length }
  }
  const candidates = (llm.facts || []).filter((f) => Number(f.confidence ?? 0) >= cfg.minConfidence)
  const existing = db.prepare(`
    SELECT id, kind, text, importance, created_at_epoch, last_access_epoch, access_count, pinned, meta
    FROM memories
    WHERE status='active' AND created_at_epoch >= ?
    ORDER BY id DESC LIMIT 500
  `).all(until - 90 * 86400000)
  const kept = []
  const duplicates = []
  for (const f of candidates) {
    const dup = bestMatch(f.text, [...existing, ...kept], { threshold: cfg.dedupeThreshold })
    if (dup) {
      duplicates.push({ text: f.text, matchId: dup.item.id ?? null, matchText: String(dup.item.text ?? '').slice(0, 60), score: Number(dup.score.toFixed(3)) })
      continue
    }
    kept.push(f)
    if (kept.length >= cfg.maxFacts) break
  }
  const result = {
    ok: true,
    at: until,
    day: dayKey(until),
    dryRun: cfg.dryRun,
    window: { since, until, rows: rows.length, user: rows.filter((r) => r.role === 'user').length, self: rows.filter((r) => r.role === 'self').length },
    facts: kept,
    duplicates,
    lessons: (llm.lessons || []).filter((x) => Number(x.confidence ?? 0) >= 0.65).slice(0, 2),
    shortterm: (llm.shortterm || []).slice(0, cfg.maxShortterm),
    profile: llm.profile || '',
    sources: rows.map((r, i) => ({ n: i + 1, id: r.id, at: r.at, role: r.role })).slice(0, 400),
  }

  // 2026-11-12 P0：顺手更新语感统计（只读 raw_meta，写 style.json；人格插件会读取）
  try { if (dataDir) result.style = writeStyleFile(db, dataDir, { now: until }) } catch {}

  if (cfg.dryRun) {
    let reportPath = ''
    if (dataDir) {
      const dir = join(dataDir, 'consolidate')
      mkdirSync(dir, { recursive: true })
      reportPath = join(dir, `dryrun-${result.day}.json`)
      writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8')
    }
    return { ...result, reportPath, applied: { facts: 0, profile: false } }
  }

  // 正式写入：facts 已按置信度过滤、按相似度去重
  let inserted = 0
  for (const f of kept) {
    const dup = db.prepare('SELECT id FROM memories WHERE text=? LIMIT 1').get(f.text)
    if (dup) continue
    await insertMemory(db, {
      kind: f.kind,
      text: f.text,
      detail: '日结归纳',
      importance: Math.min(0.9, 0.5 + 0.3 * Number(f.confidence || 0.6)),
      speakerId: 'owner',
      sourceChannel: 'consolidate',
      sourceMsgId: f.source ? `raw:${rows[f.source - 1]?.id ?? ''}` : '',
      sourceTs: until,
      extractorVersion: 'consolidate-v1',
      layer: 'auto',
      scopeType: 'owner',
      scopeId: '',
      confidence: f.confidence ?? 0.6,
      meta: { consolidated: true, day: result.day },
    })
    inserted++
  }
  // 教训/道理：从重复事件提炼，独立 kind，宁少勿多
  let lessonsInserted = 0
  for (const l of (result.lessons || [])) {
    const dup = db.prepare('SELECT id FROM memories WHERE text=? LIMIT 1').get(l.text)
    if (dup) continue
    await insertMemory(db, {
      kind: 'lesson', text: l.text, detail: '日结提炼', importance: Math.min(0.9, 0.55 + 0.3 * Number(l.confidence || 0.65)),
      speakerId: 'owner', sourceChannel: 'consolidate', sourceTs: until, layer: 'auto',
      scopeType: 'owner', scopeId: '', confidence: l.confidence ?? 0.65,
      meta: { consolidated: true, lesson: true, day: result.day },
    })
    lessonsInserted++
  }

  // 短期记忆层：最近 3 天还要用的约定/待办/状态（独立表，不进 memories）
  let shorttermInserted = 0
  if (cfg.maxShortterm > 0) {
    try {
      const ttl = cfg.shorttermTtlHours * 3600000
      db.prepare('DELETE FROM shortterm WHERE expires_at <= ?').run(until)
      const ins = db.prepare(`INSERT INTO shortterm(self_id,scope_type,scope_id,kind,content,context,importance,at,expires_at,created_at)
        VALUES('','owner','',?,?,?,?,?,?,?)`)
      for (const s of (llm.shortterm || []).slice(0, cfg.maxShortterm)) {
        ins.run(s.kind || 'event', anchorRelativeTime(s.content, until), anchorRelativeTime(s.context || '', until), Number(s.importance) || 0.5, until, until + ttl, until)
        shorttermInserted++
      }
    } catch (e) { try { log?.warn?.(`短期记忆写入失败：${e?.message ?? e}`) } catch {} }
  }

  if (cfg.writeProfile && result.profile) {
    db.prepare('INSERT INTO profiles(speaker_id,summary,updated_at) VALUES(?,?,?) ON CONFLICT(speaker_id) DO UPDATE SET summary=excluded.summary, updated_at=excluded.updated_at')
      .run('owner', result.profile, until)
  }
  db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('consolidate.lastAt',?)").run(String(until))
  db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('consolidate.lastResult',?)").run(JSON.stringify({ at: until, facts: inserted, skippedDuplicates: duplicates.length, profile: Boolean(result.profile) }))
  return { ...result, applied: { facts: inserted, lessons: lessonsInserted, shortterm: shorttermInserted, profile: Boolean(result.profile) } }
}
