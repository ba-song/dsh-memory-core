/**
 * dsh-memory-core —— 长期记忆（P0 地基版）
 * 当前提供：SQLite 存储、bigram 检索、embedding、统计/写入/删除工具
 * 未启用：归档搬运、注入、衰减整理（后续阶段）
 */
import { join } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { loadConfig, DATA_DIR, DEFAULTS, resolveOwner, resolveArchivePrefixes, groupMemoryConfig, provenanceConfig } from './config.js'
import { openDb, writeTx } from './store/db.js'
import { insertMemory, deleteMemory, loadVectors, saveVector, updateMemory } from './store/memories.js'
import { resolveConflictRow } from './conflict/resolve.js'
import { recall, countBlockedMatches, normalizeAsOf } from './recall/recall.js'
import { P4, noteAttempt, noteInsert, noteDrop, llmDiag } from './ingest/p4-stats.js'
import { retryPendingPreferences } from './pref/retry.js'
import { loadEmbed, embedAvailable, embedTexts } from './embed/onnx.mjs'
import { acquireLock } from './adapter/fs.js'
import { snapshotNow, restoreIfNeeded } from './maintain/snapshot.js'
import { makeLog } from './adapter/log.js'
import { bigrams, phrase } from './store/fts.js'
import { RawArchive } from './ingest/archive.js'
import { createArmMonitor } from './recall/score.js'
import { buildHitQuery, buildHitsBlock, shouldInject, createHitState, relevanceOf, filterPersistentPreferenceHits, filterInjectionHits } from './inject/hits.js'
import { locateSegments, takeSegments, segmentText } from './segments.js'
import { isCorrection } from './inject/correction.js'
import { readArchive, toolsOverview, searchArchive } from './archive/tools.js'
import { buildQuotesBlock } from './inject/quotes.js'
import { buildProvenanceBlock } from './inject/context-blocks.js'
import { noticeMessage } from './inject/notice.js'
import { extractEntities } from './store/graph.js'
import { previewEpisodeRewrite, applyEpisodeRewrite, rollbackEpisodeRewrite } from './store/episode-rewrite.js'
import { ingestExplicit } from './ingest/explicit.js'
import { currentView } from './emotion/store.js'   // 2026-11-05：情绪写入已退役，仅保留只读展示
import { cleanUserUtterance } from './ingest/utterance.js'
import { ingestWithLlmFallback } from './extract/pipeline.js'
import { extractExplicit } from './ingest/explicit.js'
import { buildStable, factsPathFor } from './inject/stable.js'
import { addRule, revokeRule, listRules } from './inject/rules.js'
import { buildPreferenceBlock } from './inject/preference.js'
import { buildSessionIndex, shouldInjectSessionIndex } from './inject/session-index.js'
import { carryoverFor } from './inject/carryover.js'
import { buildDigest } from './inject/digest.js'
import { appendFact, listFacts } from './facts/edit.js'
import { addPin, donePin, dropPin, listPins, renderPins } from './pins.js'
import { shareNewMemory } from './share/auto.js'
import { ensureProjectSchema, resolveProject, upsertProject, addDecision, listDecisions, decisionsBlock } from './project/index.js'
import { cleanChannelEnvelope } from './ingest/archive.js'
import { createMemoryService } from './service.js'
import { pruneGroupMemories } from './group/ttl.js'
import { dailyConsolidate } from './consolidate/daily.js'
import { weeklyConsolidate } from './consolidate/weekly.js'
import { scanMultimodal } from './multimodal.js'
import { planClarity, applyClarityPlan } from './clarity.js'
import { classifyOwner } from './owner.js'
import { ensureContactsSchema } from './store/contacts.js'
import { ensurePersonSchema, seedOwnerPeople } from './store/people.js'
import { backfillUnknownSelf, countUnknownSelf } from './selfid.js'
import { scopeForSession, findScopeArg, auditScopeDenied, scopeWhere, scopeAllows } from './scope.js'
import { buildPendingAudit } from './audit/pending.js'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-memory-core'
export const inject = ['tools', 'systemPrompt', 'agents']

/**
 * 设置页只认识 Config schema 里标了 `.volatile()` 的字段（dsh-settings 的
 * `volatileForm`/`isVolatilePath`），所以这里只声明设置卡片暴露的 3 个字段：
 *   memoryRecordEnabled / memoryInjectEnabled / groupMemory.ttlDays。
 * 未声明的键（profile 里的 autoShare/trustedDirs/factsPath 等）走 schemastery
 * 的非 strict 合并原样保留，loadConfig 继续按 DEFAULTS 清洗，运行时行为不变
 * （apply 仍然只是 loadConfig(raw)，volatile 引用由 unwrapVolatile 还原）。
 * 风格照抄 dsh-channel-bridge/lib/index.js 的 Config（2026-11-10）。
 */
export const Config = z.object({
  memoryRecordEnabled: z.boolean().default(DEFAULTS.memoryRecordEnabled).volatile(),
  memoryInjectEnabled: z.boolean().default(DEFAULTS.memoryInjectEnabled).volatile(),
  groupMemory: z.object({
    ttlDays: z.number().default(DEFAULTS.groupMemory.ttlDays).volatile(),
  }),
  clarity: z.object({ enabled: z.boolean().default(false).volatile() }).default({}),
})

const OUT_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, detail: { type: 'string' } },
  required: ['ok', 'detail'],
  additionalProperties: false,
}
const text = (t) => ({ type: 'text', text: String(t) })
const render = (_a, v) => [text(v.detail)]

/** 从工具执行上下文里取会话信息（DSH: exec.agent.session）；ownerDir 来自本地配置，不写死 */
function sessionOf(exec, isOwnerFn = () => false) {
  const s = exec?.agent?.session ?? exec?.session
  const header = s?.header ?? s ?? {}
  const cwd = String(header.cwd ?? s?.cwd ?? '')
  const id = String(header.id ?? s?.id ?? '')
  let isOwnerPrivate = false
  try { isOwnerPrivate = Boolean(isOwnerFn(cwd)) } catch { isOwnerPrivate = false }
  const isGroup = /QQ群|群_/.test(cwd)
  const scope = scopeForSession({ cwd, sessionId: id, isOwner: isOwnerPrivate })
  return { cwd, id, isOwnerPrivate, isGroup, scope }
}

const pack = (obj) => ({ ok: obj?.ok !== false, detail: JSON.stringify(obj, null, 2) })

/** 工具层 scope 硬校验：模型传 scope 键 → 空 + 审计（scope 只由会话决定） */
function scopedArgGuard(args, { scope, tool }) {
  const bad = findScopeArg(args)
  if (!bad) return null
  auditScopeDenied({ dataDir: DATA_DIR, scope, tool, request: `arg:${bad}`, result: 'E_SCOPE' })
  return pack({ ok: true, count: 0, items: [], text: '', scopeBlocked: true, error: 'E_SCOPE' })
}

/**
 * 原句去重（注入层）：
 * 1) 记忆正文是该原句的子串（摘要 vs 原文，最常见的重复形态）
 * 2) 或原句的 bigram 有 ≥80% 被某条记忆覆盖
 * 命中任一即视为重复，丢弃原句。
 */
function dropDuplicateQuotes(items, quotes) {
  if (!items?.length || !quotes?.length) return quotes ?? []
  const mems = items.map((m) => ({
    text: String(m.text ?? ''),
    grams: new Set(bigrams(String(m.text ?? '')).split(' ').filter(Boolean)),
  }))
  return quotes.filter((q) => {
    const snip = String(q.snippet ?? '')
    const qg = bigrams(snip).split(' ').filter(Boolean)
    for (const m of mems) {
      if (m.text && snip.includes(m.text)) return false
      if (qg.length >= 2 && m.grams.size) {
        const hit = qg.filter((g) => m.grams.has(g)).length
        if (hit / qg.length >= 0.8) return false
      }
    }
    return true
  })
}

function dirSize(dir) {
  let total = 0
  try {
    for (const name of readdirSync(dir)) {
      const p = `${dir}/${name}`
      const st = statSync(p)
      total += st.isDirectory() ? dirSize(p) : st.size
    }
  } catch {}
  return total
}

export function apply(ctx, overrides = {}) {
  const cfg = loadConfig(overrides)
  // D1：主人身份只从本地配置解析（ownerQQ / ownerPrivateDir），源码里不出现真实号
  const owner = resolveOwner(cfg)
  const OWNER_DIR = owner.ownerPrivateDir
  const recordEnabled = cfg.memoryRecordEnabled !== false && owner.ok
  const injectEnabled = cfg.memoryInjectEnabled !== false && owner.ok
  const logger = ctx?.logger ?? console
  const log = makeLog(join(DATA_DIR, 'logs'))
  if (!owner.ok) {
    log.warn('主人身份未配置（ownerQQ / ownerPrivateDir）：本次不注入、不写主人记忆、原话档案工具禁用；请补充本地 config.json')
  } else {
    const masked = owner.ownerQQ ? `***${String(owner.ownerQQ).slice(-2)}` : '(由目录解析失败)'
    log.info(`主人身份：ownerQQ=${masked} dir=${owner.ownerPrivateDir}`)
  }
  const lock = acquireLock(DATA_DIR)
  if (!lock) log.warn('已有实例持锁，跳过挂载')
  // 2026-11-06：启动自愈——只有库缺失/integrity 失败才从最新快照恢复；正常启动不动库
  try { restoreIfNeeded(DATA_DIR, log) } catch (e) { log.warn(`自愈检查失败（跳过）：${e?.message ?? e}`) }
  const { db } = openDb(DATA_DIR)
  try { ensureProjectSchema(db) } catch (e) { log.warn(`项目表迁移失败：${e?.message ?? e}`) }
  // 2026-11-07：联系人 person 主体初始化（owner QQ + 两个邮箱 → person:owner，幂等）
  try {
    ensureContactsSchema(db)
    ensurePersonSchema(db)
    const emails = [
      ...(Array.isArray(cfg.ownerEmails) ? cfg.ownerEmails : []),
      owner.ownerQQ ? `${owner.ownerQQ}@qq.com` : '',
    ].filter(Boolean)
    const seeded = seedOwnerPeople(db, { ownerQQ: owner.ownerQQ, emails })
    if (seeded.ok) log.info(`person 绑定：${seeded.bindings.length} 条（owner → person:owner）`)
  } catch (e) { log.warn(`person 绑定初始化失败：${e?.message ?? e}`) }
  // 阶段 4：主人判定只认 contact_bindings；binding 未命中且 cwd 命中 ownerPrivateDir 时临时 fallback（带告警与 7 天退出统计）
  // 2026-11-05：另加「受信任目录」——她自己房间（home 等）的 cwd 命中 cfg.trustedDirs 即按主人（注入/写记忆/工具放行）
  const isOwnerCwd = (cwd) => {
    const r = classifyOwner(cwd, { db, owner, log, trustedDirs: cfg.trustedDirs })
    return r.isOwner
  }
  // 阶段 2：contacts / source_channel 等列尚未迁移，服务层按「列是否存在」降级，不硬失败
  const hasColumn = (table, col) => {
    try {
      const safe = String(table).replace(/[^A-Za-z0-9_]/g, '')
      return db.prepare(`PRAGMA table_info(${safe})`).all().some((c) => String(c.name) === col)
    } catch { return false }
  }
  // lastUserMessageAt：内存为准 + meta 节流持久化（10s 一次），重启后可恢复
  const LAST_USER_KEY = 'last_user_message_at'
  let lastUserAt = (() => {
    try { return Number(db.prepare('SELECT v FROM meta WHERE k=?').get(LAST_USER_KEY)?.v ?? 0) || null } catch { return null }
  })()
  let lastUserPersistAt = 0
  const touchLastUser = (at) => {
    const ts = Number(at) || Date.now()
    if (lastUserAt && ts <= lastUserAt) return lastUserAt
    lastUserAt = ts
    if (Date.now() - lastUserPersistAt > 10000) {
      lastUserPersistAt = Date.now()
      try { db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run(LAST_USER_KEY, String(ts)) } catch {}
    }
    return lastUserAt
  }
  let vectors = loadVectors(db)
  // 阶段 4：self 侧 speaker_id 取 persona.selfId()；取不到写 self:unknown + pending
  const getSelfId = () => {
    try {
      const p = ctx.get?.('dyPersona')
      if (!p || typeof p.selfId !== 'function') return ''
      const v = String(p.selfId() ?? '').trim()
      if (!v) return ''
      return v.startsWith('self:') ? v : `self:${v}`
    } catch { return '' }
  }
  // 2026-11-05 B-1b：注入前渲染 `{{display_name}}` 用；取不到返回 ''（调用方保留原样 → 该行被丢）
  const getDisplayName = () => {
    try {
      const p = ctx.get?.('dyPersona')
      if (!p || typeof p.displayName !== 'function') return ''
      return String(p.displayName() ?? '').trim()
    } catch { return '' }
  }
  // P4 质量闸丢弃统计（2026-11-05）：按 reason 累计，日志按 reason 节流 10 分钟
  const p4DropLogged = new Map()
  const noteP4Drops = (drops = []) => {
    const before = { ...P4.counts }
    noteDrop(drops)
    for (const d of (Array.isArray(drops) ? drops : [])) {
      const reason = String(d?.reason ?? 'unknown')
      if ((P4.counts[reason] ?? 0) === (before[reason] ?? 0)) continue
      const now = Date.now()
      if (now - (p4DropLogged.get(reason) ?? 0) < 10 * 60 * 1000) continue
      p4DropLogged.set(reason, now)
      log.info(`P4 丢弃：reason=${reason}${d?.text20 ? ` text20=${String(d.text20).slice(0, 20)}` : ''}`)
    }
  }

  // 原话归档白名单（2026-11-05）：旧的单值/旧前缀 + trustedDirs（她的房间也留原话）；见 resolveArchivePrefixes
  const archivePrefixes = resolveArchivePrefixes(cfg)
  log.info(`原话归档前缀：${archivePrefixes.length} 个（${archivePrefixes.join(' | ')}）`)
  const raw = new RawArchive({ db, dir: join(DATA_DIR, 'raw'), cwdPrefixes: archivePrefixes, keepTimeMarker: cfg.archiveKeepTimeMarker === true, log, getSelfId, getPersona: () => { try { return ctx.get?.('dyPersona') } catch { return undefined } }, embedFn: embedTexts, permanentArchiveEnabled: cfg.permanentArchiveEnabled !== false, permanentArchiveDir: cfg.permanentArchiveDir ?? DEFAULTS.permanentArchiveDir, permanentArchiveHomeCwd: cfg.permanentArchiveHomeCwd ?? DEFAULTS.permanentArchiveHomeCwd, owner: { ...owner, ownerEmail: cfg.ownerEmail ?? cfg.mailTo ?? '', ownerDirs: [OWNER_DIR, ...(Array.isArray(cfg.trustedDirs) ? cfg.trustedDirs : []), '/sdcard/DSHA/生活/数据/home'] } })

  // 阶段 4：persona 恢复后按批次回填 self:unknown（启动 + agent/created 时各试一次，10 分钟节流）
  let lastSelfBackfill = 0
  const maybeBackfillSelfId = (reason = 'startup') => {
    const sid = getSelfId()
    if (!sid) return
    if (Date.now() - lastSelfBackfill < 10 * 60 * 1000) return
    lastSelfBackfill = Date.now()
    try {
      const before = countUnknownSelf(db)
      if (!before) return
      const r = backfillUnknownSelf(db, { selfId: sid, limit: 500 })
      if (r.updated) log.info(`self:unknown 回填（${reason}）：${r.updated}/${before} 行，剩余 ${r.remaining}`)
    } catch (e) { log.warn(`self:unknown 回填失败：${e?.message ?? e}`) }
  }
  maybeBackfillSelfId('startup')
  // 向量缓存：迁移/后台补算后再调用时自动重载，避免"库里有、检索没带"
  const ensureVectors = () => {
    try {
      const c = Number(db.prepare('SELECT count(*) c FROM vectors').get().c)
      if (c !== vectors.size) vectors = loadVectors(db)
    } catch {}
  }
  ctx.on?.('session/event', (session, event) => {
    try { raw.onEvent(session, event) } catch (e) { log.warn(`归档失败：${e?.message ?? e}`) }
    // dyMemory.lastUserMessageAt：只统计 QQ 会话里真正的用户消息（注入块/seed/系统话不算）
    try {
      const src = String(event?.data?.message?.source?.kind ?? event?.data?.source?.kind ?? '')
      const cwd0 = String(session?.header?.cwd ?? '')
      if (event?.type === 'user/message' && src === 'user' && cwd0.startsWith('/root/qq-agent/')) {
        touchLastUser(Number(event?.time ?? Date.now()))
      }
    } catch {}
    // P4.5 心情写入已退役（2026-11-05）：情绪归 persona；memory 不再写自己的 4 张表

    // P4-pre：主人私聊里的"记住…"自动入库（默认 fuzzy + 低权重，可整批撤回）
    try {
      if (!recordEnabled) return
      const cwd = String(session?.header?.cwd ?? '')
      if (!isOwnerCwd(cwd) || event?.type !== 'user/message') return
      const data = event?.data ?? {}
      const src = String(data?.message?.source?.kind ?? data?.source?.kind ?? '')
      if (src !== 'user') return
      const content = data?.content ?? data?.message?.content
      const rawText = Array.isArray(content) ? content.filter((c) => c?.type === 'text').map((c) => c.text).join(' ') : String(content ?? '')
      const text = cleanUserUtterance(rawText) || rawText
      const seq = Number(event?.seq ?? 0)
      if (!text.trim() || !seq) return
      ensureVectors()
      // 2026-11-06 P0：写入 scope 由会话推（owner=owner；外部=contact:该联系人）
      const sessScope = scopeForSession({ cwd, sessionId: String(session?.header?.id ?? ''), isOwner: isOwnerCwd(cwd) })
      const writeScope = sessScope.write
      // P4：显式陈述走 explicit-v1；其余四类走四类管线（门控 + 查重/冲突）
      // P4-L（2026-11-06）：规则 no-candidate 时兜底调一次小模型抽 1 条（extract.llm 可关/限流）
      const p4Text = cleanChannelEnvelope(text)
      if (!extractExplicit(p4Text)) {
        noteAttempt()
        const p4Turn = { llmTried: 0 }
        ingestWithLlmFallback(db, { ctx, text: p4Text, sessionId: String(session?.header?.id ?? ''), sourceKey: `p4:${session?.header?.id ?? ''}:${seq}`, sourceTs: Number(event?.time ?? Date.now()), speaker: owner.ownerQQ, embed: embedTexts, vectors, autoExtract: cfg.autoExtract, llmConfig: cfg.extract?.llm, log, turn: p4Turn, writeScope, opsRequestId: `p4:${session?.header?.id ?? ''}:${seq}` })
          .then((r) => {
            if (r?.drops?.length) noteP4Drops(r.drops)
            // 2026-11-06：每次尝试都必须落一个结果（inserted 或 counts[reason]），不允许静默
            if (r?.action === 'insert') { /* 已在下方 noteInsert */ }
            else if (r?.action !== 'merge' && r?.action !== 'queue') noteP4Drops([{ reason: String(r?.reason ?? r?.action ?? 'none'), text20: String(p4Text).slice(0, 20) }])
            const tag = r?.via === 'llm' ? 'P4-LLM' : 'P4'
            try { log.debug?.(`${tag} 尝试：len=${p4Text.length} hasSubject=${/我|你|她|他|主人|饲养员|汐|大傻鱼/.test(p4Text)} → ${r?.action ?? 'none'}/${r?.reason ?? '-'}${r?.llmReason ? ` llm=${r.llmReason}` : ''}`) } catch {}
            if (r.action === 'insert') {
              noteInsert();
              shareNewMemory(db, { id: r.id, text: r.text ?? p4Text, scopeType: r.scopeType ?? 'owner', fromSelf: false, cfg, insertMemory }).catch(() => {})
              if (r.vec) vectors.set(r.id, r.vec); log.info(`${tag} 记下 ${r.kind}：${text.slice(0, 20)}`) }
            else if (r.action === 'queue') log.info(`${tag} 冲突停放：${text.slice(0, 20)}（与 #${r.targetId} 相似 ${Number(r.score).toFixed(2)}）`)
            else if (r.action === 'merge') log.info(`${tag} 合并到 #${r.targetId}：${text.slice(0, 20)}`)
          })
          .catch((e) => log.warn(`P4 抽取失败：${e?.message ?? e}`))
      }
      ingestExplicit(db, { sessionId: String(session?.header?.id ?? ''), seq, text, at: Number(event?.time ?? Date.now()), speaker: owner.ownerQQ, scopeType: writeScope.scopeType, scopeId: writeScope.scopeId })
        .then(async (id) => {
          if (!id) return
          try { const row = db.prepare('SELECT text,layer FROM memories WHERE id=?').get(id); log.info(`自动记下一条（layer=${row?.layer}）：${String(row?.text ?? '').slice(0, 24)}`) } catch {}
          try {
            await embedReady
            if (embedAvailable()) {
              const [v] = await embedTexts([String(text.match(/(?:记住|记一下|别忘了|要记得|帮我记)[：:，,\s]*([^\n。！？!?]{2,80})/)?.[1] ?? text)])
              if (v) { await saveVector(db, id, v); vectors.set(id, v) }
            }
          } catch {}
        })
        .catch((e) => log.warn(`自动记忆失败：${e?.message ?? e}`))
    } catch (e) { log.warn(`自动记忆异常：${e?.message ?? e}`) }
  })
  try { const n = raw.cleanup(); if (n) log.info(`清理过期原句档案 ${n} 天`) } catch {}
  try {
    const bytes = dirSize(join(DATA_DIR, 'raw'))
    if (bytes > 500 * 1024 * 1024) log.warn(`raw 档案目录 ${(bytes / 1024 / 1024).toFixed(0)}MB，超过 500MB 提醒（不自动删）`)
    else log.info(`raw 档案体积 ${(bytes / 1024 / 1024).toFixed(1)}MB`)
  } catch {}

  const embedReady = loadEmbed('/opt/qqai/models/bge-small-zh').then((r) => {
    log.info(`embedding: ${r.ok ? 'ok dim=' + r.dim : '不可用 ' + r.error}`)
    return r
  })

  const tools = ctx.get?.('tools')
  if (tools?.register) {
    const reg = (def) => { try { tools.register(def) } catch (e) { log.warn(`注册 ${def.name} 失败：${e?.message ?? e}`) } }

    reg({
      name: 'dy_memory_consolidate',
      description: '立即跑一次记忆归纳 dry-run（mode=daily 日结 / weekly 周结）：只生成报告，不写库、不改记忆。只有主人/家的会话能用。',
      parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['daily', 'weekly'] } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        if (!sess.isOwnerPrivate) return pack({ ok: false, code: 'E_PERMISSION', message: '只有主人或她的家可以使用归纳功能' })
        try {
          if (String(args?.mode ?? 'daily') === 'weekly') {
            const r = weeklyConsolidate({ db, cfg: { ...(cfg.weekly ?? {}), enabled: true, dryRun: true }, dataDir: DATA_DIR })
            return pack({ ok: r.ok, mode: 'weekly', day: r.day, scanned: r.scanned, clusters: r.clusters?.length ?? 0, reportPath: r.reportPath ?? '' })
          }
          const r = await dailyConsolidate({ db, ctx, cfg: { ...(cfg.consolidate ?? {}), enabled: true, dryRun: true }, log, dataDir: DATA_DIR })
          if (!r.ok) return pack({ ok: false, code: r.reason, rows: r.rows ?? 0 })
          return pack({ ok: true, mode: 'daily', day: r.day, rows: r.window?.rows ?? 0, facts: r.facts?.length ?? 0, duplicates: r.duplicates?.length ?? 0, profile: r.profile ?? '', reportPath: r.reportPath ?? '' })
        } catch (e) {
          return pack({ ok: false, code: 'CONSOLIDATE_FAILED', error: String(e?.message ?? e).slice(0, 200) })
        }
      },
    })

    reg({
      name: 'dy_memory_stats',
      description: '记忆库状态：条数、按类型统计、embedding 是否可用、检索路由自检。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async () => {
        await embedReady
        ensureVectors()
        const total = db.prepare('SELECT count(*) c FROM memories').get().c
        const auto = db.prepare("SELECT count(*) c FROM memories WHERE layer='auto'").get().c
        const withSource = db.prepare("SELECT count(*) c FROM memories WHERE source_msg_id<>''").get().c
        const byKind = db.prepare('SELECT kind, count(*) c FROM memories GROUP BY kind').all()
        let emotionLegacy = null
        try {
          const v = currentView(db)
          emotionLegacy = { legacy: true, label: v.label, valence: +v.valence.toFixed(2), arousal: +v.arousal.toFixed(2), intensity: +v.intensity.toFixed(2) }
        } catch {}
        const ms = armMonitor.stats
        return pack({ ok: true, total, byKind, autoLayer: auto, withSource,
          embed: embedAvailable(), vectors: vectors.size,
          rawSearch: raw.gateStats(),
          rawVectors: raw.rawVectorStats?.() ?? null,
          emotionLegacy,
          hits: { enabled: cfg.hitsInjectEnabled !== false, ...hitStats },
          p4Drops: { ...P4.counts },
          autoExtract: { ...(cfg.autoExtract ?? {}), diag: { counts: { ...P4.counts }, lastDrop: P4.lastDrop, attempts: P4.attempts, inserted: P4.inserted, lastAttemptAt: P4.lastAttemptAt, lastInsertAt: P4.lastInsertAt, llm: llmDiag(), note: '进程内计数（重启清零）' } },
          retrieve: { calls: ms.calls, armHits: ms.arms, cooccurRate: ms.lastCooccur, windows: ms.windows, warnings: ms.warnings.slice(-3) } })
      },
    })

    reg({
      name: 'dy_memory_shortterm',
      description: '看最近 3 天的短期记忆（约定/待办/最近状态）。只有主人/家的会话可用。',
      parameters: { type: 'object', properties: { limit: { type: 'number' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        if (!sess.isOwnerPrivate) return pack({ ok: false, code: 'E_PERMISSION', message: '只有主人或她的家可以查看短期记忆' })
        const n = Math.max(1, Math.min(Number(args?.limit) || 10, 20))
        const rows = db.prepare('SELECT id,kind,content,context,importance,at,expires_at FROM shortterm WHERE expires_at>? ORDER BY importance DESC, at DESC LIMIT ?').all(Date.now(), n)
        return pack({ ok: true, count: rows.length, items: rows })
      },
    })

    reg({
      name: 'dy_memory_pin',
      description: '她自己的话头便签：add 记一条、done 划掉、drop 删掉、list 看全文。只有主人/家的会话可用；轮换交接时最多带 5 条，平时不注入。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'done', 'drop', 'list'] },
          text: { type: 'string' },
          id: { type: 'number', description: '条目编号（列表第几条，从 1 开始）' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        if (!sess.isOwnerPrivate) return pack({ ok: false, code: 'E_PERMISSION', message: '只有主人或她的家可以操作话头' })
        try {
          if (args.action === 'add') {
            if (!String(args.text ?? '').trim()) return pack({ ok: false, code: 'E_INVALID_ARG', message: '话头不能为空' })
            return pack({ ok: true, action: 'add', items: addPin(db, 'self', args.text) })
          }
          if (args.action === 'done' || args.action === 'drop') {
            const ok = args.action === 'done' ? donePin(db, 'self', args.id) : dropPin(db, 'self', args.id)
            return pack({ ok, action: args.action, items: listPins(db, 'self') })
          }
          return pack({ ok: true, action: 'list', text: renderPins(db, 'self'), items: listPins(db, 'self') })
        } catch (e) { return pack({ ok: false, code: 'E_PIN', message: String(e?.message ?? e) }) }
      },
    })

    reg({
      name: 'dy_memory_add',
      description: '手动写入一条记忆。text 必填；kind 默认 fact；speaker 可选；source_quote/source_text 可选（给了就做引文校验：与原文不符会拒写）。仅主人私聊可用。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          kind: { type: 'string', enum: ['episode', 'fact', 'preference', 'relation', 'skill', 'todo', 'reflection', 'lesson'] },
          speaker: { type: 'string' },
          source_quote: { type: 'string', description: '支撑这条记忆的原文片段（逐字）；给了会与 source_text 比对' },
          source_text: { type: 'string', description: '原文（可选）；给了就要求 source_quote 是它的逐字子串' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        if (!sess.isOwnerPrivate) return pack({ ok: false, error: '只有和主人私聊时才能写记忆' })
        if (!cfg.memoryRecordEnabled) return pack({ ok: false, error: '记录已关闭' })
        const sourceText = args?.source_text == null ? null : String(args.source_text)
        const sourceQuote = String(args?.source_quote ?? '')
        // 2026-11-16 P0-1：给了原文 → 逐字校验（不符整条拒）；没给原文 → 手工补录走降级档打标
        let id
        try {
          id = await insertMemory(db, {
            kind: args?.kind ?? 'fact', text: String(args?.text ?? ''),
            speakerId: String(args?.speaker ?? ''), extractorVersion: 'manual',
            quote: sourceQuote,
            sourceText,
            provenanceMode: sourceText !== null ? 'session' : (sourceQuote ? 'manual' : 'degraded'),
          })
        } catch (e) {
          if (e?.code === 'E_QUOTE_MISMATCH') return pack({ ok: false, code: e.code, message: '引文与原文不符，已拒绝写入', reason: e.reason })
          throw e
        }
        await embedReady
        if (embedAvailable()) {
          try {
            const [v] = await embedTexts([String(args?.text ?? '')])
            if (v) { await saveVector(db, id, v); vectors.set(id, v) }
          } catch {}
        }
        return pack({ ok: true, id })
      },
    })

    if (cfg.m3_2b?.enabled === true) {
      reg({
        name: 'dy_episode_rewrite_preview',
        description: '只读预览一条 active episode 的拟议改写，不写数据库、快照或账本；仅主人私聊/家可用。',
        parameters: { type: 'object', properties: { id: { type: 'number' }, proposed_text: { type: 'string' } }, required: ['id','proposed_text'], additionalProperties: false },
        output: { schema: OUT_SCHEMA, render },
        execute: async (args, exec) => {
          const sess = sessionOf(exec, isOwnerCwd)
          if (!sess.isOwnerPrivate || sess.scope.level !== 'owner') return pack({ ok: false, code: 'E_PERMISSION' })
          try { return pack(previewEpisodeRewrite(db, { id: args.id, proposedText: args.proposed_text, injectBudgetChars: Number(cfg.injectBudget?.memory ?? 400) })) }
          catch (e) { return pack({ ok: false, code: 'E_PREVIEW', message: String(e?.message ?? e).slice(0, 200) }) }
        },
      })
      reg({
        name: 'dy_episode_rewrite_apply',
        description: '主人明确确认后，对单条 episode 执行改写并先保存完整快照；需要 embedding 可用；不支持批量。',
        parameters: { type: 'object', properties: { id: { type: 'number' }, proposed_text: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['id','proposed_text','confirm'], additionalProperties: false },
        output: { schema: OUT_SCHEMA, render },
        execute: async (args, exec) => {
          const sess = sessionOf(exec, isOwnerCwd)
          if (!sess.isOwnerPrivate || sess.scope.level !== 'owner') return pack({ ok: false, code: 'E_PERMISSION' })
          if (args.confirm !== true) return pack({ ok: false, code: 'E_CONFIRM_REQUIRED' })
          const embedFn = async (value) => {
            await embedReady
            if (!embedAvailable()) throw new Error('E_EMBEDDING_UNAVAILABLE')
            const [vec] = await embedTexts([value])
            if (!vec) throw new Error('E_EMBEDDING_FAILED')
            return vec
          }
          try { return pack(await applyEpisodeRewrite(db, { id: args.id, proposedText: args.proposed_text, embedFn, vectors, now: Date.now() })) }
          catch (e) { return pack({ ok: false, code: String(e?.message ?? '').startsWith('E_') ? String(e.message) : 'E_REWRITE_APPLY', message: String(e?.message ?? e).slice(0, 200) }) }
        },
      })
      reg({
        name: 'dy_episode_rewrite_rollback',
        description: '按快照 ID 恢复单条 episode 的完整历史状态，并创建新的 revision；仅主人私聊/家可用。',
        parameters: { type: 'object', properties: { snapshot_id: { type: 'number' } }, required: ['snapshot_id'], additionalProperties: false },
        output: { schema: OUT_SCHEMA, render },
        execute: async (args, exec) => {
          const sess = sessionOf(exec, isOwnerCwd)
          if (!sess.isOwnerPrivate || sess.scope.level !== 'owner') return pack({ ok: false, code: 'E_PERMISSION' })
          try { return pack(await rollbackEpisodeRewrite(db, { snapshotId: args.snapshot_id, vectors, now: Date.now() })) }
          catch (e) { return pack({ ok: false, code: String(e?.message ?? '').startsWith('E_') ? String(e.message) : 'E_REWRITE_ROLLBACK', message: String(e?.message ?? e).slice(0, 200) }) }
        },
      })
    }

    reg({
      name: 'dy_memory_rule_add',
      description: '新增主人必须遵守的长期规则；仅主人私聊/家可用。重复文本幂等；更新时传 supersedes_id，旧版本标记 superseded。',
      parameters: { type: 'object', properties: { text: { type: 'string' }, priority: { type: 'number' }, source: { type: 'string' }, supersedes_id: { type: 'number' } }, required: ['text'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        if (sess.scope.level !== 'owner') return pack({ ok: false, code: 'E_PERMISSION', message: '规则仅允许主人私聊/家管理，不支持群规则' })
        try { return pack(addRule(db, { text: args?.text, priority: args?.priority, source: args?.source, supersedesId: args?.supersedes_id, scope: sess.scope })) }
        catch (e) { return pack({ ok: false, code: 'E_RULE_ADD', message: String(e?.message ?? e).slice(0, 200) }) }
      },
    })

    reg({
      name: 'dy_memory_rule_revoke',
      description: '撤销一条 active 主人规则；保留审计记录，不物理删除。仅主人私聊/家可用。',
      parameters: { type: 'object', properties: { id: { type: 'number' }, reason: { type: 'string' } }, required: ['id'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        if (sess.scope.level !== 'owner') return pack({ ok: false, code: 'E_PERMISSION', message: '规则仅允许主人私聊/家管理' })
        try { return pack(revokeRule(db, { id: args?.id, reason: args?.reason, scope: sess.scope })) }
        catch (e) { return pack({ ok: false, code: 'E_RULE_REVOKE', message: String(e?.message ?? e).slice(0, 200) }) }
      },
    })

    reg({
      name: 'dy_memory_rules_list',
      description: '列出主人规则；默认只看 active，all=true 可查看 revoked/superseded 历史。仅主人私聊/家可用。',
      parameters: { type: 'object', properties: { all: { type: 'boolean' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        if (sess.scope.level !== 'owner') return pack({ ok: false, code: 'E_PERMISSION', message: '规则仅允许主人私聊/家查看' })
        try { return pack(listRules(db, { all: args?.all === true, scope: sess.scope })) }
        catch (e) { return pack({ ok: false, code: 'E_RULE_LIST', message: String(e?.message ?? e).slice(0, 200) }) }
      },
    })

    reg({
      name: 'dy_memory_quote_search',
      description: '在原始聊天档案里搜原话（含思考过程），返回带日期与角色的片段；已撤回的内容不会返回。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'number' }, channel: { type: 'string', enum: ['qq', 'home'] }, contactId: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        const scope = sess.scope
        const blockedArg = scopedArgGuard(args, { scope, tool: 'dy_memory_quote_search' })
        if (blockedArg) return blockedArg
        if (scope.raw === 'none') {
          auditScopeDenied({ dataDir: DATA_DIR, scope, tool: 'dy_memory_quote_search', request: String(args?.query ?? ''), result: 'E_SCOPE_RAW' })
          return pack({ ok: true, count: 0, items: [], scopeBlocked: true })
        }
        const rows = raw.search(String(args?.query ?? ''), {
          limit: Math.max(1, Math.min(Number(args?.limit) || 3, 10)),
          channel: scope.level === 'owner' ? undefined : (scope.channel || 'qq'),
          cwd: scope.raw === 'own' ? scope.cwd : '',
        })
        return pack({ ok: true, count: rows.length, items: rows })
      },
    })

    reg({
      name: 'dy_memory_raw_verify',
      description: '校验某天的原句档案有没有被改过（行数 + 哈希）。参数日期形如 2026-10-30。',
      parameters: { type: 'object', properties: { day: { type: 'string' } }, required: ['day'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args) => pack({ ok: true, ...raw.verify(String(args?.day ?? '')) }),
    })

    // ── P5.4a 档案分层读取（本地抽取，子智能体接通前） ──
    const overviewCache = new Map()
    const TOOL_ROLE_SQL = "('具','果','错','图','文','步')"
    const latestToolRow = () => { try { return Number(db.prepare(`SELECT COALESCE(max(id),0) id FROM raw_meta WHERE role IN ${TOOL_ROLE_SQL}`).get().id) } catch { return 0 } }
    const overviewForRead = () => {
      const now = Date.now()
      const last = latestToolRow()
      const c = overviewCache.get(1)
      if (c && now - c.createdAt < 5 * 60 * 1000 && c.lastToolId === last) return c.text
      const r = toolsOverview(db, { days: 1 })
      const text = r.ok ? r.text : ''
      overviewCache.set(1, { text, createdAt: now, lastToolId: last })
      return text
    }

    reg({
      name: 'dy_archive_read',
      description: '读最近的对话和思考（你/她/想），不含工具日志；days 只接受 1，按时间倒序取最近 limit 行。',
      parameters: { type: 'object', properties: { kind: { type: 'string' }, days: { type: 'number' }, limit: { type: 'number' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        const scope = sess.scope
        const blockedArg = scopedArgGuard(args, { scope, tool: 'dy_archive_read' })
        if (blockedArg) return blockedArg
        if (scope.raw === 'none') {
          auditScopeDenied({ dataDir: DATA_DIR, scope, tool: 'dy_archive_read', request: String(args?.kind ?? 'dialog'), result: 'E_SCOPE_RAW' })
          return pack({ ok: true, count: 0, text: '', scopeBlocked: true })
        }
        const room = scope.raw === 'own' ? scope.cwd : ''
        const r = readArchive(db, { kind: args?.kind === 'reasoning' ? 'reasoning' : 'dialog', days: Number(args?.days) || 1, limit: Number(args?.limit) || 40, cwd: room, channel: scope.level === 'owner' ? '' : (scope.channel || '') })
        if (!r.ok) return pack(r)
        const ov = scope.level === 'owner' ? overviewForRead() : (scope.raw === 'own' ? (toolsOverview(db, { days: 1, cwd: room }).text || '') : '')
        const text = ov ? `${r.text}
【工具概述】${ov}` : r.text
        return pack({ ok: true, count: r.count, text })
      },
    })

    reg({
      name: 'dy_archive_tools_overview',
      description: '总结最近一天用了哪些工具、结果如何（内部概述；不要对用户说“正在整理”）。',
      parameters: { type: 'object', properties: { days: { type: 'number' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        const scope = sess.scope
        const blockedArg = scopedArgGuard(args, { scope, tool: 'dy_archive_tools_overview' })
        if (blockedArg) return blockedArg
        if (scope.raw === 'none') {
          auditScopeDenied({ dataDir: DATA_DIR, scope, tool: 'dy_archive_tools_overview', request: String(args?.days ?? 1), result: 'E_SCOPE_RAW' })
          return pack({ ok: true, text: '', count: 0, scopeBlocked: true })
        }
        const r = toolsOverview(db, { days: Number(args?.days) || 1, cwd: scope.raw === 'own' ? scope.cwd : '' })
        if (r.ok && scope.level === 'owner') overviewCache.set(1, { text: r.text, createdAt: Date.now(), lastToolId: latestToolRow() })
        return pack(r)
      },
    })

    reg({
      name: 'dy_archive_research',
      description: '按问题在档案里查旧事，返回命中句及前后各 2 条对白、思考、情绪；用于回答“上次说到哪”。',
      parameters: { type: 'object', properties: { question: { type: 'string' }, limit: { type: 'number' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        const scope = sess.scope
        const blockedArg = scopedArgGuard(args, { scope, tool: 'dy_archive_research' })
        if (blockedArg) return blockedArg
        if (scope.raw === 'none') {
          auditScopeDenied({ dataDir: DATA_DIR, scope, tool: 'dy_archive_research', request: String(args?.question ?? ''), result: 'E_SCOPE_RAW' })
          return pack({ ok: true, text: '', count: 0, scopeBlocked: true })
        }
        let queryEmbed = null
        try { const vs = await embedTexts([String(args?.question ?? '')]); queryEmbed = vs?.[0] ?? null } catch {}
        return pack(searchArchive(db, { question: String(args?.question ?? ''), limit: Number(args?.limit) || 400, cwd: scope.raw === 'own' ? scope.cwd : '', queryEmbed, withContext: true, persona: (() => { try { return ctx.get?.('dyPersona') } catch { return undefined } })() }))
      },
    })

    reg({
      name: 'dy_memory_fact_add',
      description: '往事实卡对应节追加一条（全局/主人/群/人）；写前备份；单条 ≤200 字；家人/主人可用。',
      parameters: { type: 'object', properties: { section: { type: 'string', enum: ['全局', '主人', '群', '人'] }, text: { type: 'string' }, name: { type: 'string' } }, required: ['section', 'text'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        if (!sessionOf(exec, isOwnerCwd).isOwnerPrivate) return pack({ ok: false, error: '只有主人私聊/家可以写事实卡' })
        const r = appendFact(DATA_DIR, { section: args?.section, text: args?.text, name: args?.name })
        if (!r.ok) return pack(r)
        log.info(`事实卡追加：${r.section}`)
        return pack(r)
      },
    })

    reg({
      name: 'dy_memory_facts_list',
      description: '只读列出事实卡四节内容（她自己填了什么）。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (_a, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        const scope = sess.scope
        const r = listFacts(DATA_DIR)
        if (!r.ok) return pack(r)
        const src = r.sections ?? {}
        const sections = { 全局: src.全局 ?? [] }
        if (scope.level === 'owner') { sections.主人 = src.主人 ?? []; sections.群 = src.群 ?? []; sections.人 = src.人 ?? [] }
        else if (scope.level === 'group') sections.群 = src.群 ?? []
        return pack({ ok: true, sections, scope: scope.level })
      },
    })

    reg({
      name: 'dy_memory_project_upsert',
      description: '创建/更新项目（owner/home）。',
      parameters: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, root: { type: 'string' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        if (!sessionOf(exec, isOwnerCwd).isOwner) return pack({ ok: false, error: '只有主人/家可用' })
        return pack(upsertProject(db, { id: args?.id, name: args?.name, root: args?.root }))
      },
    })

    reg({
      name: 'dy_memory_decision_add',
      description: '写一条项目决策（owner/home）；project 可省略=当前 cwd 项目。',
      parameters: { type: 'object', properties: { project: { type: 'string' }, title: { type: 'string' }, context: { type: 'string' }, options: { type: 'array' }, choice: { type: 'string' }, reason: { type: 'string' }, status: { type: 'string' }, decidedAt: { type: 'number' } }, required: ['title', 'choice'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const ss = sessionOf(exec, isOwnerCwd)
        if (!ss.isOwner) return pack({ ok: false, error: '只有主人/家可用' })
        const pj = String(args?.project ?? '').trim() || (resolveProject(ss.cwd ?? exec?.agent?.session?.header?.cwd)?.id ?? '')
        return pack(addDecision(db, { project: pj, title: args?.title, context: args?.context, options: args?.options, choice: args?.choice, reason: args?.reason, status: args?.status, decidedAt: args?.decidedAt, decidedBy: 'owner' }))
      },
    })

    reg({
      name: 'dy_memory_decision_list',
      description: '只读列出项目决策（owner/home）。',
      parameters: { type: 'object', properties: { project: { type: 'string' }, status: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const ss = sessionOf(exec, isOwnerCwd)
        if (!ss.isOwner) return pack({ ok: true, count: 0, decisions: [] })
        const pj = String(args?.project ?? '').trim() || (resolveProject(ss.cwd ?? exec?.agent?.session?.header?.cwd)?.id ?? '')
        return pack(listDecisions(db, { project: pj, status: args?.status, query: args?.query, limit: args?.limit }))
      },
    })

    reg({
      name: 'dy_memory_group_archive',
      description: '（家/主人只读）按需取群里最近的原话归档（不进 memories、不自动注入）。给 groupId 时按群筛，不给返回最新群。',
      parameters: { type: 'object', properties: { groupId: { type: 'string' }, limit: { type: 'number' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const ss = sessionOf(exec, isOwnerCwd)
        const GROUP_CWD = '/sdcard/DSHA/渠道/qq-群'
        const execCwd = String(exec?.agent?.session?.header?.cwd ?? '')
        const trusted = (Array.isArray(cfg.trustedDirs) ? cfg.trustedDirs : []).some((d) => execCwd === d || execCwd.startsWith(String(d).replace(/\/+$/, '') + '/'))
        if (!ss.isOwner && !trusted) {
          try { db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)").run(`group_archive_denied_${Date.now()}`, JSON.stringify({ cwd: exec?.agent?.session?.header?.cwd ?? '', at: Date.now() })) } catch {}
          return pack({ ok: true, count: 0, items: [], denied: true })
        }
        const gid = String(args?.groupId ?? '').trim()
        const n = Math.max(1, Math.min(Number(args?.limit) || 20, 100))
        try {
          const rows = db.prepare(`SELECT role, speaker, at, substr(raw_text,1,300) text FROM raw_meta WHERE cwd=? AND tombstone=0 ${gid ? "AND raw_text LIKE ?" : ''} ORDER BY at DESC LIMIT ?`).all(...(gid ? [GROUP_CWD, `%${gid}%`, n] : [GROUP_CWD, n]))
          return pack({ ok: true, groupId: gid || 'latest', count: rows.length, items: rows })
        } catch (e) { return pack({ ok: false, error: String(e?.message ?? e) }) }
      },
    })

    reg({
      name: 'dy_memory_publish',
      description: '（家/主人）发布一条可公开的近况（≤300 字，7 天过期，群聊可读）。注意：不要放主人隐私、地址、密码、聊天原文。',
      parameters: { type: 'object', properties: { text: { type: 'string' }, ttlDays: { type: 'number' } }, required: ['text'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const s2 = sessionOf(exec, isOwnerCwd)
        if (!s2.isOwner || !s2.isOwnerPrivate) return pack({ ok: false, error: '只有家/主人可以发公开近况' })
        const r = await memoryService.publishPublic({ text: args?.text, ttlDays: args?.ttlDays }, { session: exec?.agent?.session })
        return pack(r)
      },
    })

    reg({
      name: 'dy_memory_person_archive',
      description: '按「人」查原话归档：不给 personId 列最近有原话的人；给了则跨房间/渠道返回最近 N 条（只读，每条截断 300 字）。',
      parameters: { type: 'object', properties: { personId: { type: 'string' }, channel: { type: 'string' }, limit: { type: 'number' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args) => {
        const n = Math.max(1, Math.min(Number(args?.limit) || 50, 200))
        const pid = String(args?.personId ?? '').trim(); const ch = String(args?.channel ?? '').trim()
        try {
          if (!pid) {
            const rows = db.prepare(`SELECT person_id, channel, count(*) c, max(at) last_at FROM raw_meta WHERE person_id<>'' AND tombstone=0 ${ch ? 'AND channel=?' : ''} GROUP BY person_id, channel ORDER BY last_at DESC LIMIT ?`).all(...(ch ? [ch, n] : [n]))
            return pack({ ok: true, persons: rows })
          }
          const rows = db.prepare(`SELECT role, channel, at, substr(raw_text,1,300) text FROM raw_meta WHERE person_id=? AND tombstone=0 ${ch ? 'AND channel=?' : ''} ORDER BY at DESC LIMIT ?`).all(...(ch ? [pid, ch, n] : [pid, n]))
          return pack({ ok: true, personId: pid, count: rows.length, items: rows })
        } catch (e) { return pack({ ok: false, error: String(e?.message ?? e) }) }
      },
    })

    reg({
      name: 'dy_memory_contacts',
      description: '列出联系人（qq 号、名字、最后出现、来源渠道）。仅主人私聊。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (_a, exec) => {
        if (!sessionOf(exec, isOwnerCwd).isOwnerPrivate) return pack({ ok: false, error: '只有和主人私聊时才能看联系人' })
        let rows = []
        const hasPerson = hasColumn('contact_bindings', 'person_id')
        try {
          rows = db.prepare(`SELECT c.id, c.display_name, c.kind, b.external_id, b.channel, b.alias,
              ${hasPerson ? 'b.person_id' : "'' AS person_id"}
            FROM contacts c LEFT JOIN contact_bindings b ON b.contact_id=c.id
            ORDER BY c.id, b.id`).all()
        } catch { rows = [] }
        for (const r of rows) {
          r.personId = String(r.person_id || r.id || '')
          delete r.person_id
          try { r.last_at = Number(db.prepare('SELECT max(at) m FROM raw_meta WHERE (speaker_id=? OR speaker=?) AND tombstone=0').get(r.id, r.external_id)?.m ?? 0) } catch { r.last_at = 0 }
        }
        return pack({ ok: true, count: rows.length, items: rows })
      },
    })

    reg({
      name: 'dy_memory_contact_merge',
      description: '把 from 联系人的引用并到 to（只改 memories 的联系人引用，不删记忆）；仅主人私聊，写审计。',
      parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        if (!sessionOf(exec, isOwnerCwd).isOwnerPrivate) return pack({ ok: false, error: '只有和主人私聊时才能归并联系人' })
        const from = String(args?.from ?? '').trim(); const to = String(args?.to ?? '').trim()
        if (!from || !to || from === to) return pack({ ok: false, error: 'from/to 不合法' })
        const has = (id) => { try { return Boolean(db.prepare('SELECT 1 FROM contacts WHERE id=?').get(id)) } catch { return false } }
        if (!has(from) || !has(to)) return pack({ ok: false, error: '联系人不存在' })
        const a = Number(db.prepare('UPDATE memories SET speaker_id=? WHERE speaker_id=?').run(to, from).changes)
        let b = 0
        try { b = Number(db.prepare('UPDATE memories SET subject_id=? WHERE subject_id=?').run(to, from).changes) } catch {}   // 旧库可能没有 subject_id 列
        try { db.prepare('UPDATE contact_bindings SET contact_id=? WHERE contact_id=?').run(to, from) } catch {}
        try { db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run(`contact_merge_${Date.now()}`, JSON.stringify({ from, to, speaker: a, subject: b, at: Date.now() })) } catch {}
        log.info(`联系人归并：${from} → ${to}（speaker ${a} / subject ${b}）`)
        return pack({ ok: true, from, to, updated: { speaker: a, subject: b } })
      },
    })

    reg({
      name: 'dy_memory_conflicts',
      description: '列出待解冲突（conflict_queue pending）。仅主人私聊。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (_a, exec) => {
        if (!sessionOf(exec, isOwnerCwd).isOwnerPrivate) return pack({ ok: false, error: '只有和主人私聊时才能看冲突' })
        const rows = db.prepare(`SELECT q.id,q.memory_a,q.memory_b,q.reason,q.created_at,a.text ta,b.text tb
          FROM conflict_queue q LEFT JOIN memories a ON a.id=q.memory_a LEFT JOIN memories b ON b.id=q.memory_b
          WHERE q.status='pending' ORDER BY q.id`).all()
        return pack({ ok: true, count: rows.length, items: rows.map((r) => ({ id: r.id, a: { id: r.memory_a, text: r.ta }, b: { id: r.memory_b, text: r.tb }, reason: r.reason })) })
      },
    })

    reg({
      name: 'dy_memory_conflict_resolve',
      description: '解一条冲突：action=keep|drop，side=old|new。仅主人私聊；写审计。',
      parameters: { type: 'object', properties: { id: { type: 'number' }, action: { type: 'string', enum: ['keep', 'drop'] }, side: { type: 'string', enum: ['old', 'new'] } }, required: ['id', 'action'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        if (!sessionOf(exec, isOwnerCwd).isOwnerPrivate) return pack({ ok: false, error: '只有和主人私聊时才能解冲突' })
        return pack(resolveConflictRow(db, { id: args?.id, action: args?.action, side: args?.side, vectors, actor: 'owner' }))
      },
    })

    reg({
      name: 'dy_memory_auto_list',
      description: '列出最近自动记下的条目（layer=auto），用于检查是否误抽；可拿 id 去 dy_memory_forget 删除。',
      parameters: { type: 'object', properties: { limit: { type: 'number' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        if (!sessionOf(exec, isOwnerCwd).isOwnerPrivate) return pack({ ok: false, error: '只有和主人私聊时才能看自动记忆' })
        const n = Math.max(1, Math.min(Number(args?.limit) || 10, 50))
        const rows = db.prepare("SELECT id,text,importance,confidence,source_msg_id,created_at_epoch,status,meta FROM memories WHERE layer='auto' ORDER BY id DESC LIMIT ?").all(n)
        const items = rows.map(({ meta: rawMeta, ...row }) => {
          let meta = {}
          try { meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta || '{}') : (rawMeta ?? {}) } catch {}
          return { ...row, retryCount: Number(meta.retryCount ?? 0), lastError: String(meta.lastError ?? '') }
        })
        return pack({ ok: true, count: items.length, items })
      },
    })

    reg({
      name: 'dy_memory_pending_audit',
      description: '（主人/家，只读）审计悬置记忆：列出 status=pending 的条目并分层（隔离 / 未解冲突 / 队列已处理却仍悬置的孤儿 / 长期偏好待合并 / 无队列孤儿）；只回 id、原因、年龄与脱敏摘要，不改任何状态。',
      parameters: { type: 'object', properties: { limit: { type: 'number' } }, additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        if (!sessionOf(exec, isOwnerCwd).isOwnerPrivate) return pack({ ok: false, error: '只有和主人私聊时才能审计悬置记忆' })
        try { return pack(buildPendingAudit(db, { limit: args?.limit })) }
        catch (e) { return pack({ ok: false, error: String(e?.message ?? e) }) }
      },
    })

    reg({
      name: 'dy_memory_forget_by_source',
      description: '按来源批量撤回自动记忆：给 sourcePrefix（如 explicit:）或 extractor（如 explicit-v1）。只删同时匹配的条目。',
      parameters: {
        type: 'object',
        properties: { sourcePrefix: { type: 'string' }, extractor: { type: 'string' } },
        additionalProperties: false,
      },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        if (!sessionOf(exec, isOwnerCwd).isOwnerPrivate) return pack({ ok: false, error: '只有和主人私聊时才能批量撤回' })
        const pre = String(args?.sourcePrefix ?? '')
        const ext = String(args?.extractor ?? '')
        if (!pre && !ext) return pack({ ok: false, error: '给 sourcePrefix 或 extractor，至少一个' })
        const rows = db.prepare('SELECT id, source_msg_id, extractor_version FROM memories').all()
          .filter((r) => (!pre || String(r.source_msg_id ?? '').startsWith(pre)) && (!ext || String(r.extractor_version ?? '') === ext))
        for (const r of rows) { await deleteMemory(db, r.id); vectors.delete(r.id) }
        return pack({ ok: true, removed: rows.length, sample: rows.slice(0, 3).map((r) => r.id) })
      },
    })

    reg({
      name: 'dy_memory_recall',
      description: '按查询检索记忆：关键词 + 语义（embedding 可用时），返回条目与分数。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'number' } },
        required: ['query'],
        additionalProperties: false,
      },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        await embedReady
        ensureVectors()
        const sess = sessionOf(exec, isOwnerCwd)
        const scope = sess.scope
        // 硬校验：scope 只由会话决定，模型传这些键一律拒绝（空 + 审计）
        const badArg = findScopeArg(args)
        if (badArg) {
          auditScopeDenied({ dataDir: DATA_DIR, scope, tool: 'dy_memory_recall', request: `arg:${badArg}`, result: 'E_SCOPE' })
          return pack({ ok: true, count: 0, matched: 0, items: [], quotes: [], scopeBlocked: true, error: 'E_SCOPE' })
        }
        const q = String(args?.query ?? '')
        // 越权探测：query 在 scope 外有命中 → 整条返回空 + 审计（fail-closed）
        if (scope.level !== 'owner') {
          const blocked = countBlockedMatches(db, q, scope)
          if (blocked > 0) {
            auditScopeDenied({ dataDir: DATA_DIR, scope, tool: 'dy_memory_recall', request: q, result: `E_SCOPE blocked=${blocked}` })
            return pack({ ok: true, count: 0, matched: blocked, items: [], quotes: [], scopeBlocked: true })
          }
        }
        const rows = await recall(db, q, {
          vectors,
          gate: { semantic: cfg.semanticGate, keyword: cfg.keywordGate },
          limit: Math.max(1, Math.min(Number(args?.limit) || 8, 20)),
          monitor: armMonitor,
          scope,
        })
        // scope 已是权威过滤；旧 privacy 过滤退役（否则会误伤 contact 层）
        let visible = rows
        let quotes = []
        if (q && cfg.rawRecallEnabled !== false && scope.raw !== 'none') {
          try {
            quotes = raw.search(q, {
              limit: cfg.rawTopN ?? 3,
              minScore: cfg.rawMinScore ?? 0.35,
              channel: scope.level === 'owner' ? undefined : (scope.channel || 'qq'),
              cwd: scope.raw === 'own' ? scope.cwd : '',
            })
            const before = quotes.length
            quotes = dropDuplicateQuotes(visible, quotes)
            const g = raw.gateStats()
            log.info(`原句召回 q="${q.slice(0, 20)}" 命中${before} 去重后${quotes.length} 降级${quotes.filter((x) => x.degraded).length} 阻塞率${g.blockRate}`)
          } catch (e) { log.warn(`原句召回失败：${e?.message ?? e}`) }
        }
        // 2026-11-06：按渠道/联系人过滤（只做收窄，不改变 scope）
        const ch = String(args?.channel ?? ''); const cid = String(args?.contactId ?? '').trim()
        const ROOM = { qq: ['/sdcard/DSHA/渠道/qq', '/root/qq-agent/QQ会话'], home: ['/sdcard/DSHA/生活/数据/home'] }
        if (ch && ROOM[ch]) {
          quotes = quotes.filter((q) => { const c = String(q?.cwd ?? ''); return ROOM[ch].some((p) => c === p || c.startsWith(p + '/')) })
          visible = visible.filter((r) => String(r.source_channel ?? '') === ch || (!r.source_channel && ch === 'qq'))
        }
        if (cid) visible = visible.filter((r) => [r.speaker_id, r.owner_scope, r.subject_id].some((v) => String(v ?? '').includes(cid)))
        return pack({ ok: true, count: visible.length, matched: rows.length,
          items: visible.map((r) => ({ id: r.id, kind: r.kind, text: r.text, scores: r.scores })),
          quotes, rawGate: raw.gateStats() })
      },
    })

    // 2026-11-12 P1：段级索引（参考 dsh-workspace-recollection 的分层检索）
    const visibleMemory = (row, scope) => {
      if (!row) return false
      if (!scope || scope.level === 'owner') return true
      if (row.scope_type === 'public') return true
      const st = String(scope.write?.scopeType ?? scope.scopeType ?? '')
      const sid = String(scope.write?.scopeId ?? scope.scopeId ?? '')
      return String(row.scope_type) === st && String(row.scope_id ?? '') === sid
    }

    reg({
      name: 'dy_memory_locate',
      description: '段级定位：在一条长记忆里按关键词找“哪一段”，只回段号/小标题/字数/命中词/片段，不取正文。拿到段号再用 dy_memory_detail 取那几段。',
      parameters: { type: 'object', properties: { id: { type: 'number' }, query: { type: 'string' }, limit: { type: 'number' } }, required: ['id', 'query'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        const id = Number(args?.id)
        const q = String(args?.query ?? '').trim()
        if (!id || !q) return pack({ ok: false, code: 'BAD_ARG' })
        const row = db.prepare('SELECT id,scope_type,scope_id,text FROM memories WHERE id=? AND status=?').get(id, 'active')
        if (!visibleMemory(row, sess.scope)) return pack({ ok: false, code: 'E_SCOPE' })
        const segs = locateSegments(row.text, q, { limit: Math.max(1, Math.min(Number(args?.limit) || 5, 10)) })
        return pack({ ok: true, id, total: segmentText(row.text).length, segments: segs })
      },
    })

    reg({
      name: 'dy_memory_detail',
      description: '按 id 取记忆正文；给 segments:[段号] 只取那几段（先用 dy_memory_locate 定位），不给段号则整条返回。',
      parameters: { type: 'object', properties: { id: { type: 'number' }, segments: { type: 'array', items: { type: 'number' } } }, required: ['id'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        const id = Number(args?.id)
        if (!id) return pack({ ok: false, code: 'BAD_ARG' })
        const row = db.prepare('SELECT id,kind,scope_type,scope_id,text FROM memories WHERE id=? AND status=?').get(id, 'active')
        if (!visibleMemory(row, sess.scope)) return pack({ ok: false, code: 'E_SCOPE' })
        const idxs = Array.isArray(args?.segments) ? args.segments.map(Number).filter((n) => n > 0) : []
        if (idxs.length) {
          const picked = takeSegments(row.text, idxs)
          return pack({ ok: true, id, kind: row.kind, total: picked.total, segments: picked.segments })
        }
        return pack({ ok: true, id, kind: row.kind, text: String(row.text).slice(0, 20000) })
      },
    })

    // 2026-11-16 P0-4：as-of 查询（「那天当时是什么事实」）；无法判定有效性的行进 uncertain
    reg({
      name: 'dy_memory_asof',
      description: '按「某一天当时的事实」查记忆（as-of）：只返回 valid_from<=date 且未失效的行；判定不了有效性的行单独列在 uncertain，不猜。date 支持 YYYY-MM-DD / ISO / epoch ms。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, date: { type: 'string' }, limit: { type: 'number' } },
        required: ['query', 'date'],
        additionalProperties: false,
      },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        const denied = scopedArgGuard(args, { scope: sess.scope, tool: 'dy_memory_asof' })
        if (denied) return denied
        const q = String(args?.query ?? '').trim()
        if (!q) return pack({ ok: false, code: 'BAD_ARG', message: 'query 必填' })
        const asOf = normalizeAsOf(args?.date)
        if (asOf === null) return pack({ ok: false, code: 'BAD_ARG', message: 'date 无法解析（用 YYYY-MM-DD / ISO / epoch ms）' })
        await embedReady
        ensureVectors()
        // 越权探测：query 在 scope 外有命中 → 整条空 + 审计（与 dy_memory_recall 同口径）
        if (sess.scope.level !== 'owner') {
          const blocked = countBlockedMatches(db, q, sess.scope)
          if (blocked > 0) {
            auditScopeDenied({ dataDir: DATA_DIR, scope: sess.scope, tool: 'dy_memory_asof', request: q, result: `E_SCOPE blocked=${blocked}` })
            return pack({ ok: true, count: 0, items: [], uncertain: [], scopeBlocked: true })
          }
        }
        const rows = await recall(db, q, {
          vectors,
          gate: { semantic: cfg.semanticGate, keyword: cfg.keywordGate },
          limit: Math.max(1, Math.min(Number(args?.limit) || 8, 20)),
          monitor: armMonitor,
          scope: sess.scope,
          asOf,
        })
        return pack({
          ok: true,
          date: String(args?.date ?? ''),
          asOf,
          asOfText: new Date(asOf).toISOString(),
          count: rows.length,
          items: rows.map((r) => ({
            id: r.id, kind: r.kind, text: r.text,
            validFrom: r.valid_from ?? null, validTo: r.valid_to ?? null,
            temporalKind: r.temporal_kind ?? 'unknown',
            quote: r.quote ?? '', revision: r.revision ?? 1,
            scores: r.scores,
          })),
          uncertain: rows.uncertain ?? [],
        })
      },
    })

    reg({
      name: 'dy_memory_forget',
      description: '删除一条记忆（跨表删除：fts、实体关联、向量、冲突引用一起清）。',
      parameters: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'], additionalProperties: false },
      output: { schema: OUT_SCHEMA, render },
      execute: async (args, exec) => {
        const sess = sessionOf(exec, isOwnerCwd)
        if (!sess.isOwnerPrivate) return pack({ ok: false, error: '只有和主人私聊时才能删除记忆' })
        const id = Number(args?.id)
        if (!Number.isFinite(id)) return pack({ ok: false, error: 'id 不合法' })
        await deleteMemory(db, id)
        vectors.delete(id)
        return pack({ ok: true, id, detail: '已删除' })
      },
    })
  }

  // ── 常驻注入：事实卡 + 便签（低频、稳定；走 systemPrompt.context） ──
  const armMonitor = createArmMonitor()

  // ── dyMemory 服务（契约 v1.3）：供 autonomy / GUI 调用，缺失时消费方降级 ──
  const memoryService = createMemoryService({
    db,
    cfg,
    log,
    recallFn: recall,
    getVectors: () => vectors,
    getMonitor: () => armMonitor,
    getPersona: () => { try { return ctx.get?.('dyPersona') } catch { return undefined } },
    rawArchive: raw,
    isOwnerHeader: (h) => isOwnerCwd(String(h?.cwd ?? '')),
    scopeForHeader: (h) => scopeForSession({ cwd: String(h?.cwd ?? ''), sessionId: String(h?.id ?? h?.sessionId ?? ''), isOwner: isOwnerCwd(String(h?.cwd ?? '')) }),
    lastUserMessageAt: () => lastUserAt,
    hasColumn,
    insertMemory,
    archiveEmail: (mail) => raw.recordEmail(mail),
    dataDir: DATA_DIR,
    now: () => Date.now(),
  })
  let serviceOff = null
  try {
    if (typeof ctx.provide === 'function') {
      serviceOff = ctx.provide('dyMemory', memoryService)
      log.info('dyMemory 服务已注册（契约 v1.3，含 saveDiary）')
    } else {
      log.warn('宿主 ctx.provide 不可用，dyMemory 服务未注册（消费方将降级）')
    }
  } catch (e) {
    const m = String(e?.message ?? e)
    if (m.includes('has been registered')) log.warn('dyMemory 服务已被占用（热重载残留），本次跳过注册')
    else log.warn(`注册 dyMemory 服务失败：${m}`)
  }

  const hitState = createHitState()
  const sessionIndexInjected = new Set()
  // 2026-11-12 P0：纠错反馈——记住本轮注入了哪些记忆，下一轮用户说“不是/记错了”时降权
  const lastInjected = new Map()
  const quoteState = new Map()
  const hitStats = { injected: 0, skipped: 0, lastReason: '', lastAt: 0, lastProvenance: null, provenance: { anchors: 0, skipped: 0, tools: 0 } }
  // 2026-11-15：命中出处上下文预算（每个 hit 5 条 + 想/心情；只 owner 注入）
  const provCfg = provenanceConfig(cfg)
  const mounted = new Map()
  const lastLogged = new Map()
  // 注入清洗日志（2026-11-05）：同一会话 10 分钟最多一条，只记「丢了几行 + 占位符样例」，不记正文
  const scrubLogged = new Map()
  const noteScrub = (sid, { dropped = 0, samples = [] } = {}) => {
    try {
      const now = Date.now()
      if (now - (scrubLogged.get(sid) ?? 0) < 10 * 60 * 1000) return
      scrubLogged.set(sid, now)
      log.warn(`注入清洗：会话${String(sid).slice(0, 8)} 丢弃 ${dropped} 行含 {{…}} 的文本（样例 ${JSON.stringify(samples)}）`)
    } catch {}
  }
  let injectOffs = []
  const digestDone = new WeakSet()
  const digestWarned = new WeakSet()
  const preferenceDone = new Set()
  const mountAgent = (agent) => {
    if (!injectEnabled) return
    const sess = agent?.session
    const header = sess?.header ?? {}
    const cwd = String(header.cwd ?? '')
    const sid = String(header.id ?? '')
    // 2026-11-06 P0：注入按 scope 走。owner（home/主人私聊）全量；external/group 只注入
    // 允许的层；未知 cwd（工作区/子智能体）不注入，避免污染。
    const scope = scopeForSession({ cwd, sessionId: sid, isOwner: isOwnerCwd(cwd) })
    if (scope.level === 'unknown') return
    const ownerSession = scope.level === 'owner'
    // 无感切换（2026-11-05）：同一会话只算一次【上次聊到】（mountAgent 每个 sid 只进一次）
    // 只给 owner：external/group 不跨房间带上次对话。
    let carry = ''
    try { if (ownerSession && cfg.carryoverEnabled !== false) carry = carryoverFor(db, cwd, { sid }) } catch {}
    // 2026-11-06：跨渠道摘要（家 + 渠道/qq），每个 agent 只注册一次 dy-digest；只给 owner
    if (ownerSession && cfg.digestEnabled !== false && !digestDone.has(agent) && !digestDone.has(agent?.ctx)) {
      const actx = agent.ctx ?? {}
      try {
        // 绝不读 promptContexts：未 inject 的 getter 一读就抛，可选链救不了
        const dg = buildDigest(db)
        if (!dg) { digestDone.add(agent); if (agent?.ctx) digestDone.add(agent.ctx) }
        else {
          const off2 = actx.systemPrompt.context({ name: 'dy-digest', order: 940, interpolate: false, text: () => dg })
          injectOffs.push(off2); digestDone.add(agent); if (agent?.ctx) digestDone.add(agent.ctx)
          log.info(`跨渠道摘要已注入（${cwd}，${dg.length} 字）`)
        }
      } catch (e) {
        const m = String(e?.message ?? e)
        if (m.includes('already registered')) { digestDone.add(agent); if (agent?.ctx) digestDone.add(agent.ctx); try { log.debug?.(`dy-digest 已存在，跳过`) } catch {} }
        else if (!digestWarned.has(agent)) { digestWarned.add(agent); log.warn(`跨渠道摘要失败：${m}`) }
      }
    }
    // M1：独立长期偏好块（order 945），仅 owner；空数据返回空字符串。
    if (ownerSession && (!sid || !preferenceDone.has(sid))) {
      try {
        const offPref = agent.ctx.systemPrompt.context({
          name: 'dy-preference',
          order: 945,
          interpolate: false,
          text: () => {
            try { return cfg.memoryInjectEnabled ? buildPreferenceBlock(db, { scope, now: Date.now() }) : '' }
            catch (e) { log.warn(`长期偏好注入失败：${e?.message ?? e}`); return '' }
          },
        })
        injectOffs.push(offPref)
        if (sid) preferenceDone.add(sid)
      } catch (e) {
        const m = String(e?.message ?? e)
        if (m.includes('already registered')) { if (sid) preferenceDone.add(sid) }
        else log.warn(`挂长期偏好注入失败：${m}`)
      }
    }
    if (!sid || mounted.has(sid)) return
    { try {
        const off = agent.ctx.systemPrompt.context({
          name: 'dy-memory-stable',
          order: 950,
          // 2026-11-05（P0）：内容含用户可编辑文本（事实卡/便签）。不关插值的话，
          // 文本里任何 {{…}} 都会让宿主 dsh-system-prompt 抛 unknown prompt variable，整轮失败。
          interpolate: false,
          text: () => {
            try {
              if (!cfg.memoryInjectEnabled) return ''
              let block = buildStable(cwd, {
                budget: cfg.injectBudget ?? { facts: 420, pin: 100 },
                db,
                ownerDir: ownerSession ? OWNER_DIR : '',
                ownerQQ: owner.ownerQQ,
                factsPath: cfg.factsPath ?? '',
                displayName: getDisplayName(),
                rulesEnabled: cfg.rulesInjectEnabled !== false,
                rulesBudget: cfg.rulesBudget ?? { maxItems: 5, maxChars: 400, itemChars: 70 },
                scope,
                isOwner: ownerSession,
                isGroup: scope.level === 'group',
                onDrop: (d) => noteScrub(sid, d),
              })
              if (carry) block = block ? `${carry}\n${block}` : carry
              try { const pj = isOwnerCwd(cwd) ? resolveProject(cwd) : null; const db2 = pj ? decisionsBlock(db, pj.id) : ''; if (db2) block = block ? `${db2}\n${block}` : db2 } catch {}
              const now = Date.now()
              if (now - (lastLogged.get(sid) ?? 0) > 10 * 60 * 1000) {
                lastLogged.set(sid, now)
                log.info(`注入被读取：会话${sid.slice(0, 8)} 长度${block.length} 首行=${block.split('\n')[0] || '(空)'}`)
              }
              return block
            } catch (e) { log.warn(`注入失败：${e?.message ?? e}`); return '' }
          },
        })
        injectOffs.push(off)
        mounted.set(sid, true)
        log.info(`常驻注入了会话 ${sid.slice(0, 8)}（${cwd}）`)
      } catch (e) {
        const m = String(e?.message ?? e)
        if (m.includes('already registered')) { mounted.set(sid, true); return }
        log.warn(`挂注入失败：${m}`)
      }
    }
  }

  // ① 先挂上已存在的 agent ② 之后靠 agent/created 事件即时挂（不用等消息轮询）
  const mountInject = () => {
    if (!injectEnabled) return
    let list = []
    try { list = ctx.agents?.list?.() ?? [] } catch { list = [] }
    if (!mounted.has('__diag')) {
      mounted.set('__diag', true)
      const cwds = list.map((a) => String(a?.session?.header?.cwd ?? '(无 cwd)')).slice(0, 5)
      log.info(`注入扫描：agents=${list.length} cwds=${JSON.stringify(cwds)}`)
    }
    for (const agent of list) mountAgent(agent)
  }
  mountInject()

  // M1：注入挂载完成后延迟重试；重试实现与 P4 共用写队列，不阻塞启动。
  const preferenceRetryTimer = setTimeout(() => {
    void retryPendingPreferences({ db, log })
  }, 30000)
  preferenceRetryTimer.unref?.()

  // ── P5：本轮相关记忆（pre-step 通道；只在每轮第一步注入，不每轮堆） ──
  try {
    ctx.on?.('agent/pre-step', async ({ agent, messages, step, turn }, next) => {
      const decision = await next()
      try {
        if (!injectEnabled) return decision
        if (decision?.kind !== 'enter') return decision
        if (!cfg.hitEveryStep && Number(step) !== 1) return decision
        const header = agent?.session?.header ?? {}
        const cwd = String(header.cwd ?? '')
        const sid = String(header.id ?? '')
        if (!sid) return decision
        const scope = scopeForSession({ cwd, sessionId: sid, isOwner: isOwnerCwd(cwd) })
        if (scope.level === 'unknown') return decision
        const sessionNotices = []
        const withSessionIndex = (value) => sessionNotices.length
          ? { ...value, messages: [...(value?.messages ?? []), ...sessionNotices] }
          : value
        const ownerSession = scope.level === 'owner'
        if (shouldInjectSessionIndex({
          owner: ownerSession, enabled: cfg.sessionIndexEnabled !== false,
          turn, step, sid, injected: sessionIndexInjected,
        })) {
          sessionIndexInjected.add(sid)
          try {
            const indexBlock = buildSessionIndex(db, {
              now: Date.now(),
              episodes: cfg.sessionIndexEpisodes ?? 3,
              agreements: cfg.sessionIndexAgreements ?? 2,
              maxChars: cfg.sessionIndexMaxChars ?? 300,
            })
            if (indexBlock) sessionNotices.push(noticeMessage(indexBlock, '跨会话经历'))
          } catch {}
        }
        if (!cfg.hitsInjectEnabled) return withSessionIndex(decision)
        // 2026-11-12：命中 query = 主人当前这句 + 她上一句（她的想法/表达也能触发记忆）
        const built = buildHitQuery(messages, { includeSelf: cfg.hitSelfQuery !== false })
        const query = built.query
        if (!query || /【记忆·|【本轮相关/.test(query)) return withSessionIndex(decision)
        // 2026-11-12 P0：纠错反馈（只看主人这句，不看她的上一句）
        try {
          const prev = lastInjected.get(sid)
          if (prev && isCorrection(built.user || '') && Date.now() - prev.at < 10 * 60 * 1000 && prev.ids?.length) {
            const ids = prev.ids.slice(0, 5).map(Number).filter((x) => x > 0)
            if (ids.length) {
              const q = `UPDATE memories SET importance=MAX(0.05, importance*0.85) WHERE id IN (${ids.map(() => '?').join(',')})`
              db.prepare(q).run(...ids)
              await insertMemory(db, {
                kind: 'fact', text: `主人纠正过我：${String(built.user || '').replace(/\s+/g, ' ').slice(0, 40)}`,
                detail: '纠错反馈', importance: 0.7, speakerId: 'owner',
                sourceChannel: 'correction', sourceTs: Date.now(), layer: 'auto',
                scopeType: 'owner', scopeId: '', confidence: 0.8,
                meta: { correction: true, penalized: ids },
              })
              log.info(`纠错反馈：降权 ${ids.length} 条记忆（${ids.join(',')}）`)
            }
            lastInjected.delete(sid)
          }
        } catch (e) { try { log.warn(`纠错反馈失败：${e?.message ?? e}`) } catch {} }
        ensureVectors()
        const hits = filterInjectionHits(
          filterPersistentPreferenceHits(await recall(db, query, { vectors, limit: 5, monitor: armMonitor, scope })),
          query,
          { minSemantic: cfg.hitMinSemantic ?? 0.55, minKeywordOverlap: cfg.hitMinKeywordOverlap ?? 0.35 },
        )
        const stableText = buildStable(cwd, { budget: cfg.injectBudget ?? { facts: 420, pin: 100 }, db, ownerDir: ownerSession ? OWNER_DIR : '', ownerQQ: owner.ownerQQ, factsPath: cfg.factsPath ?? '', displayName: getDisplayName(), rulesEnabled: cfg.rulesInjectEnabled !== false, rulesBudget: cfg.rulesBudget ?? { maxItems: 5, maxChars: 400, itemChars: 70 }, scope, isOwner: ownerSession, isGroup: scope.level === 'group' })
        const entities = hits.flatMap((h) => extractEntities(h.text).map((e) => e.name))
        const block = buildHitsBlock(hits, { stableText, ...(cfg.hitsBudget ?? {}) })
        const quotes = ownerSession ? buildQuotesBlock(db, { cwd, hits, query, maxHits: provCfg.maxHits }) : { block: '', sources: {} }
        const provenance = ownerSession && provCfg.enabled
          ? buildProvenanceBlock(db, {
            cwd, hits, ragRows: quotes.sources?.rows ?? [],
            persona: (() => { try { return ctx.get?.('dyPersona') } catch { return undefined } })(),
            maxHits: provCfg.maxHits, window: provCfg.window, maxRows: provCfg.maxRows, maxChars: provCfg.maxChars,
          })
          : { block: '', stats: null }
        // 2026-11-15：出处上下文定位统计（找不到锚点/预算丢弃都记下来，不伪造）
        const provStats = provenance.stats ?? null
        if (provStats) {
          hitStats.lastProvenance = {
            hits: provStats.considered, anchors: provStats.anchors, rows: provStats.rows,
            skipped: provStats.skipped.length, dropped: provStats.dropped.length, chars: provenance.block.length,
            tools: provStats.tools
              ? { calls: provStats.tools.calls, ok: provStats.tools.ok, err: provStats.tools.err, dropped: provStats.tools.dropped }
              : null,
          }
        }
        if (!block && !quotes.block && !provenance.block) {
          hitStats.skipped += 1
          if (provStats?.skipped?.length) hitStats.lastReason = `provenance-skip:${provStats.skipped[0].reason}`
          return withSessionIndex(decision)
        }
        let verdict2 = { inject: true, reason: 'quotes-only' }
        if (block) verdict2 = shouldInject(hitState, sid, { hits, turn: Number(turn ?? 1), entities, chars: block.length, maxPerTurn: cfg.hitEveryStep ? Math.max(1, Number(cfg.hitEveryStepMaxPerTurn ?? 2)) : 0 })
        else {
          const qs = quoteState.get(sid)
          const t = Number(turn ?? 1)
          if (qs && t >= qs.turn && t - qs.turn < 5) { hitStats.skipped += 1; hitStats.lastReason = 'quotes-same'; return withSessionIndex(decision) }
        }
        if (!verdict2.inject) { hitStats.skipped += 1; hitStats.lastReason = verdict2.reason; return withSessionIndex(decision) }
        hitStats.injected += 1; hitStats.lastAt = Date.now()
        if (provStats) {
          hitStats.provenance.anchors += provStats.anchors
          hitStats.provenance.skipped += provStats.skipped.length
          hitStats.provenance.tools += Number(provStats.tools?.calls ?? 0)
        }
        lastInjected.set(sid, { at: Date.now(), ids: (hits ?? []).slice(0, 3).map((h) => h.id) })
        const out = []
        if (block) out.push(noticeMessage(block, '本轮相关记忆'))
        if (quotes.block) {
          out.push(noticeMessage(quotes.block, '相关原话'))
          hitStats.lastQuotes = quotes.block.length
        }
        if (provenance.block) out.push(noticeMessage(provenance.block, '出处上下文'))
        if (!block) quoteState.set(sid, { turn: Number(turn ?? 1) })
        log.info(`本轮相关注入：${verdict2.reason} top1=${hits.length ? relevanceOf(hits[0]).toFixed(2) : '0'} 长度=${block.length}${quotes.block ? ` 原话=${quotes.block.length}` : ''}${provenance.block ? ` 出处=${provenance.count}行/锚${provStats?.anchors ?? 0}${provStats?.tools?.calls ? `/工具${provStats.tools.calls}` : ''}${provStats?.skipped?.length ? `/跳过${provStats.skipped.length}` : ''}` : ''}`)
        return { ...decision, messages: [...decision.messages, ...sessionNotices, ...out] }
      } catch (e) { log.warn(`本轮相关注入失败：${e?.message ?? e}`); return withSessionIndex(decision) }
    })
  } catch (e) { log.warn('监听 agent/pre-step 失败：' + (e?.message ?? e)) }

  try {
    ctx.on?.('agent/created', (payload) => {
      try {
        const agent = payload?.agent
        const cwd = String(agent?.session?.header?.cwd ?? '')
        // 只关心「她的会话」：QQ 聊天目录（原判据）或受信任目录（2026-11-05 加，home 等）；
        // GUI / 子代理 / 定时任务一律静默跳过。真正的「是不是她」仍由 mountAgent 里的 isOwnerCwd 决定。
        if (!cwd.startsWith('/root/qq-agent/') && !isOwnerCwd(cwd)) return
        try { maybeBackfillSelfId('agent/created') } catch {}
        const before = mounted.size
        mountAgent(agent)
        if (mounted.size > before) log.info(`agent/created → 挂注入（${cwd}）`)
      } catch (e) { log.warn(`agent/created 挂注入失败：${e?.message ?? e}`) }
    })
  } catch (e) { log.warn(`监听 agent/created 失败：${e?.message ?? e}`) }
  // 2026-11-06：每 30 分钟自动快照（保留 6 份）；不影响正常读写
  let snapshotTimer = null
  if (cfg.autoSnapshot !== false) {
    snapshotTimer = setInterval(() => { try { snapshotNow(DATA_DIR) } catch (e) { log.warn(`自动快照失败：${e?.message ?? e}`) } }, 30 * 60 * 1000)
    snapshotTimer.unref?.()
    try { snapshotNow(DATA_DIR) } catch (e) { log.warn(`启动快照失败：${e?.message ?? e}`) }
  }
  const injectTimer = setInterval(mountInject, 60000)
  injectTimer.unref?.()

  // 2026-11-09：群记忆 TTL 软删（每 6 小时一次；只 UPDATE status='expired'，不物理删）。
  // 到期判断 = created_at_epoch + meta.group_ttl_<id> 天（没有 meta 的 group 行用配置默认兜底）；
  // 失败只 warn，不影响聊天/注入主流程。
  let groupTtlTimer = null
  try {
    const gm = groupMemoryConfig(cfg)
    groupTtlTimer = setInterval(() => {
      try {
        const r = pruneGroupMemories({ db, now: Date.now(), defaultTtlDays: gm.ttlDays })
        if (r.expired > 0) log.info(`群记忆 TTL：${r.expired} 条转为 expired（软删）`)
      } catch (e) { log.warn(`群记忆 TTL 清理失败：${e?.message ?? e}`) }
    }, 6 * 60 * 60 * 1000)
    groupTtlTimer.unref?.()
  } catch (e) { log.warn(`群记忆 TTL 定时器注册失败：${e?.message ?? e}`) }

  // 2026-11-12：日结归纳（默认关闭/dry-run）。每天到点跑一次；失败只 warn。
  let consolidateTimer = null
  try {
    const ccfg = cfg.consolidate || {}
    if (ccfg.enabled === true) {
      let running = false
      const tick = async () => {
        if (running) return
        try {
          const now = Date.now()
          const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(now))
          const day = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
          const last = db.prepare("SELECT v FROM meta WHERE k='consolidate.lastRunDay'").get()?.v
          if (String(last) === day) return
          if (hour !== Number(ccfg.hour ?? 4)) {
            // runOnStart：重启后如果今天还没跑过，补一次（dry-run 与正式写入都适用；
            // 正式写入仍有 maxFacts/minConfidence/去重与库备份兜底）
            if (!(ccfg.runOnStart === true && last === undefined)) return
          }
          running = true
          const r = await dailyConsolidate({ db, ctx, cfg: ccfg, log, now, dataDir: DATA_DIR })
          if (r.ok) {
            db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('consolidate.lastRunDay',?)").run(day)
          }
          db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('consolidate.lastRun',?)").run(JSON.stringify({ at: now, ok: r.ok, reason: r.reason ?? null, detail: r.detail ?? null, dryRun: ccfg.dryRun !== false, facts: r.facts?.length ?? 0 }))
          if (r.ok) log.info(`日结：facts=${r.facts.length} profile=${r.profile ? '有' : '空'}${ccfg.dryRun !== false ? '（dry-run）' : '（正式）'}`)
          else log.warn(`日结跳过：${r.reason}${r.detail ? `（${r.detail}）` : ''}`)
        } catch (e) {
          log.warn(`日结失败：${e?.message ?? e}`)
        } finally { running = false }
      }
      consolidateTimer = setInterval(() => { void tick() }, 10 * 60 * 1000)
      consolidateTimer.unref?.()
      // 启动时模型/embedding 可能还没就绪，延迟 20s 再补跑；失败不写“已跑”标记，10 分钟后会重试
      const firstTick = setTimeout(() => { void tick() }, 20000)
      firstTick.unref?.()
    }
  } catch (e) { log.warn(`日结定时器注册失败：${e?.message ?? e}`) }

  // 2026-11-12：周结（默认 dry-run）。周日 3:30 把一周 auto 事实聚类，重复条目出报告/降级。
  let weeklyTimer = null
  try {
    const wcfg = cfg.weekly || {}
    if (wcfg.enabled === true) {
      let running = false
      const tick = () => {
        if (running) return
        try {
          const now = new Date()
          const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
          const parts = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]))
          const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
          const weekday = map[parts.weekday]
          const hour = Number(parts.hour)
          const minute = Number(parts.minute)
          const target = Number(wcfg.hour ?? 3) * 60 + Number(wcfg.minute ?? 30)
          const current = hour * 60 + minute
          if (weekday !== Number(wcfg.weekday ?? 0) || current < target || current > target + 10) return
          const day = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
          const last = db.prepare("SELECT v FROM meta WHERE k='consolidate.weeklyRunDay'").get()?.v
          if (String(last) === day) return
          running = true
          const r = weeklyConsolidate({ db, cfg: wcfg, now: Date.now(), dataDir: DATA_DIR })
          db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('consolidate.weeklyRunDay',?)").run(day)
          db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('consolidate.weeklyResult',?)").run(JSON.stringify({ at: Date.now(), ok: r.ok, clusters: r.clusters?.length ?? 0, superseded: r.applied?.superseded ?? 0, dryRun: wcfg.dryRun !== false }))
          log.info(`周结：scanned=${r.scanned} clusters=${r.clusters?.length ?? 0}${wcfg.dryRun !== false ? '（dry-run）' : ` 降级=${r.applied?.superseded ?? 0}`}`)
        } catch (e) {
          log.warn(`周结失败：${e?.message ?? e}`)
        } finally { running = false }
      }
      weeklyTimer = setInterval(tick, 5 * 60 * 1000)
      weeklyTimer.unref?.()
    }
  } catch (e) { log.warn(`周结定时器注册失败：${e?.message ?? e}`) }

  // 2026-11-13：多模态归档定时器（默认关）
  let multimodalTimer = null
  try {
    const mcfg = cfg.multimodal || {}
    if (mcfg.enabled === true) {
      let running = false
      const tick = async () => {
        if (running) return
        running = true
        try {
          const r = await scanMultimodal({ db, limit: Number(mcfg.limit ?? 20), dryRun: false, log })
          if (r.inserted) log.info(`多模态归档：scanned=${r.scanned} inserted=${r.inserted}`)
        } catch (e) { log.warn(`多模态归档失败：${e?.message ?? e}`) } finally { running = false }
      }
      multimodalTimer = setInterval(() => { void tick() }, Math.max(1, Number(mcfg.intervalHours ?? 6)) * 3600 * 1000)
      multimodalTimer.unref?.()
      const first = setTimeout(() => { void tick() }, 90_000); first.unref?.()
    }
  } catch (e) { log.warn(`多模态定时器注册失败：${e?.message ?? e}`) }

  // 2026-11-13：清晰度/遗忘定时器（默认关；dryRun 时只出日志）
  let clarityTimer = null
  try {
    const ccfg = cfg.clarity || {}
    if (ccfg.enabled === true) {
      const tick = () => {
        try {
          const now = Date.now()
          const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(now))
          if (hour !== Number(ccfg.dailyHour ?? 4)) return
          const day = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
          const last = db.prepare("SELECT v FROM meta WHERE k='clarity.lastDay'").get()?.v
          if (String(last) === day) return
          const rows = db.prepare("SELECT id,kind,text,importance,created_at_epoch,pinned,clarity,scope_type,meta,status FROM memories WHERE status='active'").all()
          const plan = planClarity(rows, { now, days: ccfg.days ?? 1 })
          let applied = null
          if (ccfg.dryRun !== true) applied = applyClarityPlan(db, plan, { now, archiveFile: join(DATA_DIR, 'memory-card-full.jsonl') })
          db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('clarity.lastDay',?)").run(day)
          log.info(`清晰度维护：planned=${plan.length}${ccfg.dryRun !== true ? ` changed=${applied.changed} archived=${applied.archived}` : '（dry-run）'}`)
        } catch (e) { log.warn(`清晰度维护失败：${e?.message ?? e}`) }
      }
      clarityTimer = setInterval(tick, 10 * 60 * 1000)
      clarityTimer.unref?.()
    }
  } catch (e) { log.warn(`清晰度定时器注册失败：${e?.message ?? e}`) }

  log.info(`挂载完成：record=${recordEnabled} inject=${injectEnabled} embed=${embedAvailable()} facts=${factsPathFor('', OWNER_DIR, cfg.factsPath ?? '')[0]}`)
  ctx.on?.('dispose', () => {
    try { clearTimeout(preferenceRetryTimer) } catch {}
    try { clearInterval(injectTimer) } catch {}
    try { if (snapshotTimer) clearInterval(snapshotTimer) } catch {}
    try { if (groupTtlTimer) clearInterval(groupTtlTimer) } catch {}
    try { if (consolidateTimer) clearInterval(consolidateTimer) } catch {}
    try { if (weeklyTimer) clearInterval(weeklyTimer) } catch {}
    try { if (multimodalTimer) clearInterval(multimodalTimer) } catch {}
    try { if (clarityTimer) clearInterval(clarityTimer) } catch {}
    for (const off of injectOffs) { try { typeof off === 'function' ? off() : off?.dispose?.() } catch {} }
    try { typeof serviceOff === 'function' ? serviceOff() : serviceOff?.dispose?.() } catch {}
    try { lock?.release() } catch {}
  })
}
