/**
 * dyMemory 服务（契约 v1.1，阶段 2 骨架）
 *
 * 只暴露契约 §3 的五个方法：
 *   recall(query, {limit, allowCrossChannel, header})   → Hit[]
 *   episodeRecent(days, limit, header)                  → Episode[]
 *   addEpisode({text, at, source, actionId, ..., header})→ {id, duplicate?}
 *   contactOf(channel, externalId, {header})            → Contact | null
 *   lastUserMessageAt()                                 → number | null
 *
 * 硬约束（契约 v1.1 §3/§4）：
 * 1. **服务调用必须带 header**：`opts.header` 或 `opts.session.header`；无 header 一律 `E_PERMISSION`，
 *    不得当「本机受信调用」（子智能体/其他插件都可能无 header 调服务）。
 * 2. 子智能体 header（parentSession / origin=subagent / delegationDepth>0）一律 `E_PERMISSION`。
 * 3. 超时降级不抛到聊天：recall 3s→[]、episodeRecent 1s→[]、contactOf 200ms→null。
 * 4. persona 不在时 `addEpisode` 抛 `E_PERSONA_UNAVAILABLE`，其余方法照常返回。
 * 5. `lastUserMessageAt` 不敏感：不要求 header（契约 §3 明确「无；不敏感」）。
 *
 * 本文件不直接 import 插件内部状态，全部依赖由 index.js 注入，方便单测。
 */
import { randomUUID } from 'node:crypto'
import { lookupContact } from './store/contacts.js'
import { saveDiary as saveDiaryFile, DiaryError, MAX_DIARY_CHARS } from './diary/store.js'
import { createHash } from 'node:crypto'
import { carryoverFor } from './inject/carryover.js'
import { handoffBrief as buildHandoffBrief } from './handoff/brief.js'
import { resolveConflictRow } from './conflict/resolve.js'
import { buildGroupDigest, digestMsgId, GROUP_CWD } from './group/digest.js'
import { buildGroupTurn, isGroupId } from './group/turn.js'
import { groupMemoryConfig } from './config.js'
import { scopeWhere } from './scope.js'
import { bindPerson, resolvePerson } from './store/people.js'

/** 契约 §5 的错误码 */
export const ERR = Object.freeze({
  PERSONA_UNAVAILABLE: 'E_PERSONA_UNAVAILABLE',
  PERMISSION: 'E_PERMISSION',
  DUPLICATE: 'E_DUPLICATE',
  BUSY: 'E_BUSY',
  TIMEOUT: 'E_TIMEOUT',
  INVALID_ARG: 'E_INVALID_ARG',
})

export class ServiceError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    Object.assign(this, extra)
  }
}

/** 子智能体判定（契约 §4 的三个条件，任一命中即拒绝） */
export function isSubagentHeader(header) {
  if (!header || typeof header !== 'object') return false
  const parent = header.parentSession
  if (parent !== undefined && parent !== null && parent !== '') return true
  if (String(header.origin ?? '') === 'subagent') return true
  if (Number(header.delegationDepth ?? 0) > 0) return true
  return false
}

const HEADER_KEYS = ['cwd', 'id', 'origin', 'parentSession', 'delegationDepth', 'sessionId']

/** 判断一个对象本身是不是 header（而不是包着 header 的 opts） */
export function looksLikeHeader(v) {
  if (!v || typeof v !== 'object') return false
  return HEADER_KEYS.some((k) => k in v)
}

/**
 * 从各种调用形态里取 header：
 *   recall(q, {header}) / recall(q, {session:{header}}) / episodeRecent(d, n, header) / episodeRecent(d, n, {header})
 *   addEpisode({...header}) / contactOf(ch, ext, {header})
 * 返回 null 表示调用方没给。
 */
export function resolveHeader(...candidates) {
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue
    if (looksLikeHeader(c)) return c
    const nested = c.header ?? c.session?.header ?? c.actor?.session?.header
    if (nested && typeof nested === 'object') return nested
  }
  return null
}

/** 后台插件写身份（契约 v1.2 §5.1）：{ origin:'plugin', plugin:<name> } */
export function isPluginHeader(header) {
  return Boolean(header) && typeof header === 'object' && String(header.origin ?? '') === 'plugin'
}

/**
 * 方法入口守卫（契约 v1.2 §4/§5.1）。
 * - 无 header → E_PERMISSION
 * - 子智能体 header → E_PERMISSION（不返回任何 owner 数据）
 * - 后台插件身份：只有 `addEpisode` 放行（且 plugin 在 allowlist 内），其余方法一律拒绝
 */
export function guard(method, header, { allowPluginWrite = false, pluginAllowlist = [] } = {}) {
  if (!header || typeof header !== 'object') {
    throw new ServiceError(ERR.PERMISSION, `${method}：服务调用必须带 header`, { method })
  }
  if (isSubagentHeader(header)) {
    throw new ServiceError(ERR.PERMISSION, `${method}：子智能体不可调用记忆服务`, { method })
  }
  if (isPluginHeader(header)) {
    const plugin = String(header.plugin ?? '')
    // 精确匹配：allowlist 由代码/配置控制，不做 trim，避免拼写变体被放过
    const allowed = allowPluginWrite && Boolean(plugin) && pluginAllowlist.includes(plugin)
    if (!allowed) {
      throw new ServiceError(ERR.PERMISSION, `${method}：后台插件 ${plugin || '(未命名)'} 无该权限`, { method, plugin })
    }
  }
  return header
}

const TIMEOUT = Symbol('timeout')
const DEFAULTS = Object.freeze({
  recallTimeoutMs: 3000,
  episodeTimeoutMs: 1000,
  contactTimeoutMs: 200,
  maxEpisodeChars: 2000,
  defaultRecallLimit: 5,
  maxRecallLimit: 20,
  defaultEpisodeDays: 7,
  defaultEpisodeLimit: 20,
  maxEpisodeLimit: 100,
})

/** 超时即降级为 fallback，失败也不抛给调用方 */
async function withTimeout(label, fn, ms, fallback, onError) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), Math.max(1, Number(ms) || 1))
    // 不要 unref：等待期间没有任何其它句柄时，进程会在超时前退出（test/CLI 场景）
    
  })
  try {
    const value = await Promise.race([
      Promise.resolve().then(fn).catch((e) => {
        onError?.(e)
        return fallback
      }),
      timeout,
    ])
    return value === TIMEOUT ? fallback : value
  } finally {
    clearTimeout(timer)
  }
}

function clampInt(v, def, min, max) {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(Math.trunc(n), max))
}

function isBusyError(e) {
  return /locked|busy/i.test(String(e?.message ?? e))
}

/**
 * @param {object} deps
 * @param {object} deps.db                 node:sqlite 连接
 * @param {Function} deps.recallFn         (db, query, opts) => rows（index.js 注入现有 recall）
 * @param {Function} deps.getVectors       () => Map<id, Float32Array>
 * @param {Function} deps.getMonitor       () => armMonitor（可能尚未初始化）
 * @param {Function} deps.getPersona       () => dyPersona 服务 | undefined
 * @param {Function} deps.isOwnerHeader    (header) => boolean
 * @param {Function} deps.lastUserMessageAt () => number | null
 * @param {Function} deps.now              () => epoch ms
 * @param {Function} deps.hasColumn        (table, col) => boolean（阶段 2 表结构未迁移时降级）
 * @param {Function} deps.insertMemory     (db, rec) => id
 * @param {object} deps.cfg                插件配置
 * @param {object} deps.log                日志器
 */
export function createMemoryService(deps) {
  const { db, recallFn, getVectors, getMonitor, getPersona, isOwnerHeader, isTrustedHeader = null, scopeForHeader = null, lastUserMessageAt, now, hasColumn, insertMemory, archiveEmail = null, rawArchive = null, cfg = {}, log, dataDir = '' } = deps
  const pluginAllowlist = Array.isArray(cfg.servicePluginWriteAllowlist) && cfg.servicePluginWriteAllowlist.length
    ? cfg.servicePluginWriteAllowlist.map((x) => String(x))
    : ['dsh-autonomy']
  const T = { ...DEFAULTS, ...(cfg.serviceTimeouts ?? {}) }
  const warn = (m) => { try { log?.warn?.(m) } catch {} }
  const info = (m) => { try { log?.info?.(m) } catch {} }

  const memHas = (col) => {
    try { return typeof hasColumn === 'function' ? Boolean(hasColumn('memories', col)) : false } catch { return false }
  }

  /** persona 判空：契约要求 selfId() 可用，否则视为不可用 */
  const personaSelfId = () => {
    let persona
    try { persona = getPersona?.() } catch { persona = undefined }
    if (!persona || typeof persona.selfId !== 'function') return null
    let id = ''
    try { id = String(persona.selfId() ?? '') } catch { id = '' }
    if (!id) return null
    return id.startsWith('self:') ? id : `self:${id}`
  }

  const mapHit = (r) => ({
    id: Number(r.id),
    kind: String(r.kind ?? ''),
    text: String(r.text ?? ''),
    score: Number(Number(r?.scores?.rrf ?? r?.scores?.semantic ?? 0).toFixed(4)),
    sourceChannel: memHas('source_channel') ? String(r.source_channel ?? '') : '',
    sourceRef: memHas('source_ref') ? String(r.source_ref ?? '') : '',
  })

  const mapEpisode = (r) => ({
    id: Number(r.id),
    text: String(r.text ?? ''),
    at: Number(r.created_at_epoch ?? 0),
    source: String(r.extractor_version ?? ''),
    channel: (memHas('source_channel') ? String(r.source_channel ?? '') : '') || 'qq',
    ref: String(r.source_msg_id ?? ''),
  })

  /** recall：缺 header → E_PERMISSION；超时 3s → []；非 owner 只给 public fact/skill */
  async function recall(query, opts = {}) {
    const header = guard('recall', resolveHeader(opts))
    const q = String(query ?? '').trim()
    if (!q) return []
    const limit = clampInt(opts?.limit, T.defaultRecallLimit, 1, T.maxRecallLimit)
    const owner = Boolean(isOwnerHeader?.(header))
    let scope = null
    try { scope = typeof scopeForHeader === 'function' ? scopeForHeader(header) : null } catch { scope = null }
    return withTimeout(
      'recall',
      async () => {
        const rows = await recallFn(db, q, {
          vectors: getVectors?.(),
          gate: { semantic: cfg.semanticGate ?? 0.55, keyword: cfg.keywordGate ?? 0.35 },
          limit,
          monitor: getMonitor?.(),
          scope,
        })
        let visible = Array.isArray(rows) ? rows : []
        // 有 scope 时以 scope 为权威；旧 privacy 过滤只在没有 scope 的兼容路径生效
        if (!scope && !owner) {
          visible = visible.filter((r) => r.privacy === 'public' && (r.kind === 'fact' || r.kind === 'skill'))
        }
        if (opts?.allowCrossChannel !== true && memHas('source_channel')) {
          const channel = String(opts?.channel ?? header?.channel ?? 'qq')
          visible = visible.filter((r) => {
            const c = String(r.source_channel ?? '')
            return c === '' || c === channel
          })
        }
        return visible.map(mapHit)
      },
      T.recallTimeoutMs,
      [],
      (e) => warn(`dyMemory.recall 失败：${e?.message ?? e}`),
    )
  }

  /** episodeRecent：缺 header → E_PERMISSION；超时 1s → [] */
  async function episodeRecent(days = T.defaultEpisodeDays, limit = T.defaultEpisodeLimit, headerArg = null) {
    const header = guard('episodeRecent', resolveHeader(headerArg))
    const d = clampInt(days, T.defaultEpisodeDays, 1, 90)
    const n = clampInt(limit, T.defaultEpisodeLimit, 1, T.maxEpisodeLimit)
    let scope = null
    try { scope = typeof scopeForHeader === 'function' ? scopeForHeader(header) : null } catch { scope = null }
    const sw = scopeWhere(scope)
    return withTimeout(
      'episodeRecent',
      async () => {
        const since = now() - d * 86400000
        const rows = db.prepare(`SELECT id,text,created_at_epoch,source_msg_id,extractor_version,status
            FROM memories WHERE kind='episode' AND status='active' AND ${sw.sql} AND created_at_epoch>=?
            ORDER BY created_at_epoch DESC, id DESC LIMIT ?`).all(...sw.params, since, n)
        return rows.map(mapEpisode)
      },
      T.episodeTimeoutMs,
      [],
      (e) => warn(`dyMemory.episodeRecent 失败：${e?.message ?? e}`),
    )
  }

  /** addEpisode：缺 header → E_PERMISSION；无 persona → E_PERSONA_UNAVAILABLE；同 dedupeKey 返回已有 id */
  async function addEpisode(input = {}, opts = {}) {
    const header = guard('addEpisode', resolveHeader(input, opts), { allowPluginWrite: true, pluginAllowlist })
    let scope = null
    try { scope = typeof scopeForHeader === 'function' ? scopeForHeader(header) : null } catch { scope = null }
    const text = String(input?.text ?? '').trim()
    if (!text) throw new ServiceError(ERR.INVALID_ARG, 'addEpisode：text 不能为空', { method: 'addEpisode' })
    if (text.length > T.maxEpisodeChars) {
      throw new ServiceError(ERR.INVALID_ARG, `addEpisode：text 超过 ${T.maxEpisodeChars} 字`, { method: 'addEpisode', length: text.length })
    }
    const selfId = personaSelfId()
    if (!selfId) {
      throw new ServiceError(ERR.PERSONA_UNAVAILABLE, 'addEpisode：dyPersona 服务不可用，拒绝写入真实记忆', { method: 'addEpisode' })
    }

    const dedupeKey = String(input?.dedupeKey ?? '').trim()
    const sourceMsgId = dedupeKey ? `episode:${dedupeKey}` : ''
    if (sourceMsgId) {
      try {
        const exist = db.prepare("SELECT id FROM memories WHERE source_msg_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(sourceMsgId)
        if (exist) return { id: Number(exist.id), duplicate: true }
      } catch (e) { warn(`addEpisode 幂等查询失败：${e?.message ?? e}`) }
    }

    const at = Number(input?.at ?? 0) || now()
    const channel = String(input?.channel ?? 'qq')
    const ref = String(input?.ref ?? '')
    const source = String(input?.source ?? 'manual')
    const actionId = input?.actionId == null ? '' : String(input.actionId)
    const subjectId = String(input?.subjectId ?? '')
    const meta = { source, actionId, channel, ref, dedupeKey, pendingIdentity: false, serviceVersion: 'v1.1', ingestedAt: now() }

    try {
      const id = await insertMemory(db, {
        kind: 'episode',
        text,
        detail: ref,
        clarity: 'clear',
        importance: 0.5,
        subject: subjectId,
        speakerId: selfId,
        conversationScope: '',
        scopeType: scope?.write?.scopeType ?? 'owner',
        scopeId: scope?.write?.scopeId ?? '',
        ownerScope: 'owner',
        privacy: 'owner',
        visibility: 'owner',
        sourceMsgId,
        sourceTs: at,
        extractorVersion: 'service-v1',
        confidence: 0.7,
        layer: 'auto',
        meta,
        // episode 的 created_at_epoch 取「事件发生时间」，episodeRecent(days) 才按发生时间筛
        createdAt: at,
      })
      // 阶段 3 表结构就位后自动补写；现在列不存在则跳过（不报错）
      if (memHas('subject_id') && subjectId) {
        try { db.prepare('UPDATE memories SET subject_id=? WHERE id=?').run(subjectId, id) } catch {}
      }
      if (memHas('source_channel')) {
        try { db.prepare('UPDATE memories SET source_channel=?, source_ref=? WHERE id=?').run(channel, ref, id) } catch {}
      }
      if (isPluginHeader(header)) info(`plugin-write ${String(header.plugin ?? '')} addEpisode #${id} dedupe=${dedupeKey || '(none)'}`)
      else info(`dyMemory.addEpisode #${id} source=${source} dedupe=${dedupeKey || '(none)'}`)
      return { id: Number(id), duplicate: false }
    } catch (e) {
      if (isBusyError(e)) throw new ServiceError(ERR.BUSY, 'addEpisode：SQLite busy，已重试仍失败', { method: 'addEpisode' })
      throw e
    }
  }

  /** contactOf：缺 header → E_PERMISSION；阶段 2 无 contacts 表 → null（契约允许） */
  async function contactOf(channel, externalId, opts = {}) {
    guard('contactOf', resolveHeader(opts))
    const ch = String(channel ?? '').trim()
    const ext = String(externalId ?? '').trim()
    if (!ch || !ext) return null
    return withTimeout(
      'contactOf',
      async () => {
        // 表不存在时 lookupContact 返回 null（阶段 2 行为，不报错）
        const row = lookupContact(db, ch, ext)
        return row ? { id: row.id, displayName: row.displayName, relationship: row.relationship } : null
      },
      T.contactTimeoutMs,
      null,
      (e) => warn(`dyMemory.contactOf 失败：${e?.message ?? e}`),
    )
  }

  /**
   * saveDiary：只写日记文件（契约 v1.3 §3）。
   * 权限：主人会话（isOwnerHeader）或 `{origin:'plugin', plugin:<白名单>}`；子智能体一律拒。
   * 不写 memories / raw_meta、不读、不检索、不摘要、不注入；无幂等键。
   */
  async function saveDiary(input = {}, opts = {}) {
    const header = resolveHeader(input, opts)
    if (!header || typeof header !== 'object') {
      throw new ServiceError(ERR.PERMISSION, 'saveDiary：必须带 header', { method: 'saveDiary' })
    }
    if (isSubagentHeader(header)) {
      throw new ServiceError(ERR.PERMISSION, 'saveDiary：子智能体不可调用', { method: 'saveDiary' })
    }
    const plugin = String(header.plugin ?? '')
    const byPlugin = isPluginHeader(header)
    const allowed = byPlugin
      ? Boolean(plugin) && pluginAllowlist.includes(plugin)
      : Boolean(isOwnerHeader?.(header))
    if (!allowed) {
      throw new ServiceError(
        ERR.PERMISSION,
        byPlugin ? `saveDiary：后台插件 ${plugin || '(未命名)'} 无该权限` : 'saveDiary：只有主人会话可用',
        { method: 'saveDiary', plugin },
      )
    }
    const text = String(input?.text ?? '').trim()
    if (!text) throw new ServiceError(ERR.INVALID_ARG, 'saveDiary：text 不能为空', { method: 'saveDiary' })
    if (text.length > MAX_DIARY_CHARS) {
      throw new ServiceError(ERR.INVALID_ARG, `saveDiary：text 超过 ${MAX_DIARY_CHARS} 字`, { method: 'saveDiary', length: text.length })
    }
    if (!String(dataDir ?? '').trim()) {
      throw new ServiceError(ERR.INVALID_ARG, 'saveDiary：缺少 dataDir', { method: 'saveDiary' })
    }
    try {
      const r = saveDiaryFile({ text, at: input?.at, title: input?.title, mood: input?.mood, tags: input?.tags, dataDir })
      info(`dyMemory.saveDiary #${r.id} (${r.bytes}B${byPlugin ? `, plugin ${plugin}` : ''})`)
      return r
    } catch (e) {
      if (e?.name === 'DiaryError' && e.code === 'E_INVALID_ARG') {
        throw new ServiceError(ERR.INVALID_ARG, e.message, { method: 'saveDiary' })
      }
      throw new ServiceError(ERR.BUSY, `saveDiary：写入失败 ${e?.message ?? e}`, { method: 'saveDiary' })
    }
  }

  /**
   * saveEmail：邮件进记忆（2026-11-07）。
   * 权限：主人会话或白名单插件；失败不抛，返回 {ok:false,error}。
   * 写原话档案（邮箱房间）+ 一条 episode（owner scope，source_channel=email），按 messageId 去重。
   */
  async function saveEmail(input = {}, opts = {}) {
    try {
      const header = resolveHeader(input, opts)
      if (!header || typeof header !== 'object') return { ok: false, error: 'E_PERMISSION', message: 'saveEmail：必须带 header' }
      if (isSubagentHeader(header)) return { ok: false, error: 'E_PERMISSION', message: 'saveEmail：子智能体不可调用' }
      const byPlugin = isPluginHeader(header)
      const allowed = byPlugin ? pluginAllowlist.includes(String(header.plugin ?? '')) : Boolean(isOwnerHeader?.(header))
      if (!allowed) return { ok: false, error: 'E_PERMISSION', message: 'saveEmail：无权限' }
      const from = String(input?.from ?? '').trim()
      const to = String(input?.to ?? '').trim()
      const subject = String(input?.subject ?? '').trim()
      const body = String(input?.text ?? '').trim()
      if (!from || !body) return { ok: false, error: 'E_INVALID_ARG', message: 'saveEmail：from/text 不能为空' }
      const at = Number(input?.at) || now()
      const messageId = String(input?.messageId ?? '').trim() || `email:${from}:${at}`
      const exist = db.prepare('SELECT id FROM memories WHERE source_msg_id=? ORDER BY id DESC LIMIT 1').get(messageId)
      if (exist) return { ok: true, id: Number(exist.id), archived: false, duplicate: true }

      let archived = false
      let archiveError = ''
      if (typeof archiveEmail === 'function') {
        try {
          const a = await archiveEmail({ from, to, subject, text: body, at, messageId })
          archived = Boolean(a?.ok && a?.archived)
          if (!a?.ok) archiveError = String(a?.error ?? 'archive-failed').slice(0, 120)
        } catch (e) { archiveError = String(e?.message ?? e).slice(0, 120) }
      }
      const text = `[邮件] 主题：${subject || '(无主题)'} 正文：${body}`.slice(0, 800)
      const id = await insertMemory(db, {
        kind: 'episode',
        text,
        detail: subject,
        clarity: 'clear',
        importance: 0.5,
        speakerId: 'contact:owner',
        conversationScope: '',
        ownerScope: 'owner',
        privacy: 'owner',
        visibility: 'owner',
        sourceMsgId: messageId,
        sourceTs: at,
        extractorVersion: 'email-v1',
        sourceChannel: 'email',
        sourceRef: messageId,
        confidence: 0.8,
        layer: 'auto',
        scopeType: 'owner',
        scopeId: '',
        meta: { source: 'email', from, to, subject, messageId },
      })
      if (memHas('source_channel')) {
        try { db.prepare('UPDATE memories SET source_channel=?, source_ref=? WHERE id=?').run('email', messageId, id) } catch {}
      }
      info(`dyMemory.saveEmail #${id} from=${from.slice(0, 40)} archived=${archived}`)
      return { ok: true, id: Number(id), archived, ...(archiveError ? { archiveError } : {}) }
    } catch (e) {
      warn(`dyMemory.saveEmail 失败：${e?.message ?? e}`)
      return { ok: false, error: 'E_WRITE', message: String(e?.message ?? e).slice(0, 160) }
    }
  }

  /** 绑定/查询主体只给 owner 或白名单插件，避免外部会话探测联系人映射 */
  function ownerOrPlugin(header, method) {
    const byPlugin = isPluginHeader(header)
    const allowed = byPlugin
      ? pluginAllowlist.includes(String(header.plugin ?? ''))
      : Boolean(isOwnerHeader?.(header))
    if (!allowed) throw new ServiceError(ERR.PERMISSION, `${method}：只有主人或白名单插件可用`, { method })
    return byPlugin
  }

  /** bindContact：渠道地址 → personId（owner/白名单插件） */
  async function bindContact(input = {}, opts = {}) {
    const header = guard('bindContact', resolveHeader(input, opts), { allowPluginWrite: true, pluginAllowlist })
    ownerOrPlugin(header, 'bindContact')
    const r = bindPerson(db, { channel: input?.channel, contactId: input?.contactId, personId: input?.personId, name: input?.name })
    info(`dyMemory.bindContact ${String(input?.channel ?? '')}:${String(input?.contactId ?? '')} → ${r.personId}${r.created ? '' : '（已存在）'}`)
    return { ok: true, ...r }
  }

  /** resolveContact：渠道地址 → personId；无绑定返回 null */
  async function resolveContact(input = {}, opts = {}) {
    const header = guard('resolveContact', resolveHeader(input, opts))
    ownerOrPlugin(header, 'resolveContact')
    return resolvePerson(db, { channel: input?.channel, contactId: input?.contactId })
  }

  /** publishPublic：家/主人可公开的近况（scope=public，群聊可读）；去重 + ttl */
  async function publishPublic(input = {}, opts = {}) {
    const header = resolveHeader(input, opts)
    if (!header.id) throw new ServiceError(ERR.PERMISSION, 'publishPublic：必须带 header', { method: 'publishPublic' })
    if (!isOwnerHeader(header)) throw new ServiceError(ERR.PERMISSION, 'publishPublic：只有家/主人可以发近况', { method: 'publishPublic' })
    const body = String(input?.text ?? '').replace(/\s+/g, ' ').trim()
    if (!body) return { ok: false, reason: 'empty' }
    const text = `[汐的近况] ${body.slice(0, 295)}`
    const ttlDays = Number(input?.ttlDays) > 0 ? Number(input.ttlDays) : 7
    const h = createHash('sha1').update(text).digest('hex').slice(0, 16)
    const msgId = `public:${h}`
    const dup = db.prepare('SELECT id FROM memories WHERE source_msg_id=?').get(msgId)
    if (dup) return { ok: true, id: dup.id, duplicate: true, ttlDays }
    try {
      const id = await insertMemory(db, { kind: 'episode', text, layer: 'auto', scopeType: 'public', scopeId: '', sourceChannel: 'self-brief', sourceMsgId: msgId, extractorVersion: 'public', sourceTs: Date.now(), importance: 0.3, confidence: 1 })
      try { db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)").run(`public_ttl_${id}`, String(ttlDays)) } catch {}
      return { ok: true, id, ttlDays }
    } catch (e) { return { ok: false, error: String(e?.message ?? e) } }
  }

  /** publicBrief：暂时 fail-closed；public scope 本身不能代替目标 Conversation 授权。 */
  function publicBrief(_input = {}) {
    // Re-enable only after the service can verify source, target, purpose and an explicit authorization reference.
    return []
  }

  /** saveGroupTranscript：群聊全文 → 原话归档（不写 memories，不自动注入；失败不抛） */
  async function saveGroupTranscript(input = {}, opts = {}) {
    const header = resolveHeader(input, opts)
    if (!header.id) return { ok: false, reason: 'no-header' }
    const gid = String(input?.groupId ?? '').trim()
    const msgs = (Array.isArray(input?.messages) ? input.messages : []).filter((m) => m && String(m.text ?? '').trim()).slice(0, 20)
    if (!gid || !msgs.length) return { ok: false, reason: 'empty' }
    if (!rawArchive || typeof rawArchive.onEvent !== 'function') return { ok: false, reason: 'no-archive' }
    let archived = 0
    for (const m of msgs) {
      const at = Number(m.at) || Date.now()
      const speaker = String(m.speaker ?? '群友').slice(0, 40)
      const text = String(m.text).replace(/\s+/g, ' ').trim().slice(0, 500)
      const dup = db.prepare('SELECT 1 FROM raw_meta WHERE cwd=? AND at=? AND raw_text LIKE ?').get(GROUP_CWD, at, `%${text.slice(0, 60)}%`)
      if (dup) continue
      try {
        const roleText = /汐|自己/.test(speaker) ? 'self' : 'user'
        rawArchive.onEvent({ header: { id: `group-${gid}-${at}`, cwd: GROUP_CWD } }, {
          type: 'user/message', seq: 0, time: at,
          data: { message: { source: { kind: 'user', speakerName: speaker, role: roleText } }, content: [{ type: 'text', text: `${speaker}：${text}` }] },
        })
        archived += 1
      } catch {}
    }
    return { ok: true, archived }
  }

  /** saveGroupDigest：群聊摘要 → 家（写 memories + 原话归档；失败不抛） */
  async function saveGroupDigest(input = {}, opts = {}) {
    const header = resolveHeader(input, opts)
    if (!header.id) throw new ServiceError(ERR.PERMISSION, 'saveGroupDigest：必须带 header', { method: 'saveGroupDigest' })
    const d = buildGroupDigest({ groupName: input?.groupName, groupId: input?.groupId, messages: input?.messages })
    if (!d.ok) return { ok: false, reason: 'empty' }
    const at = Number(input?.at) || Date.now()
    const msgId = String(input?.messageId ?? '') || digestMsgId(input?.groupId, at)
    let archived = false
    try {
      // 原话归档：直接追加到 raw_meta（cwd=群房间），失败不影响 memory 写入
      if (rawArchive && typeof rawArchive.onEvent === 'function') {
        const before = db.prepare('SELECT count(*) c FROM raw_meta').get().c
        rawArchive.onEvent({ header: { id: `group-digest-${at}`, cwd: GROUP_CWD } }, {
          type: 'user/message', seq: 0, time: at,
          data: { message: { source: { kind: 'user' } }, content: [{ type: 'text', text: d.text }] },
        })
        archived = db.prepare('SELECT count(*) c FROM raw_meta').get().c > before
      }
    } catch {}
    try {
      const dup = db.prepare('SELECT id FROM memories WHERE source_msg_id=?').get(msgId)
      if (dup) return { ok: true, id: dup.id, archived, duplicate: true }
      const id = await insertMemory(db, { kind: 'episode', text: d.text, layer: 'auto', scopeType: 'public', scopeId: '', sourceChannel: 'qq-group', sourceMsgId: msgId, extractorVersion: 'group-digest', sourceTs: at, importance: 0.4, confidence: 1 })
      return { ok: true, id, archived }
    } catch (e) { warn(`saveGroupDigest 写记忆失败：${e?.message ?? e}`); return { ok: false, error: String(e?.message ?? e), archived } }
  }

  /**
   * saveGroupTurn：群聊一轮（群友说的 + 汐回的）→ 一条 group scope 的 episode。
   *
   * 2026-11-09 新增。调用方是渠道桥：**不要求 header、不走 guard**（桥没有 agent header），
   * 但也不改 lib/index.js 的写入门禁——群写入只从这条服务入口进。
   * 去重键 `group-turn:<群号>:<at>`；限额按 1h/1d 窗口 SQL 实时计数（不建表）。
   * 任何异常都返回 {ok:false,...}，不抛：桥的聊天轮次不能被记忆写入打断。
   */
  async function saveGroupTurn(input = {}) {
    try {
      const gid = String(input?.groupId ?? '').trim()
      if (!isGroupId(gid)) return { ok: false, reason: 'bad-group' }

      const gm = groupMemoryConfig(cfg)
      const turn = buildGroupTurn({
        groupId: gid,
        groupName: input?.groupName,
        incoming: input?.incoming,
        reply: input?.reply,
        at: input?.at,
        maxChars: gm.maxChars,
      })
      if (!turn.ok) return { ok: false, reason: turn.reason }

      const scopeId = `qq:${gid}`
      const dup = db.prepare('SELECT id, text FROM memories WHERE source_msg_id=?').get(turn.sourceMsgId)
      if (dup) return { ok: true, id: Number(dup.id), duplicate: true, chars: String(dup.text ?? '').length }

      // 限额：只数同群、最近窗口内的行（status 不过滤，过期行仍在窗口外时无影响）
      const nowMs = Number(now?.()) || Date.now()
      const countSince = (since) => Number(
        db.prepare("SELECT count(*) c FROM memories WHERE scope_type='group' AND scope_id=? AND created_at_epoch>?").get(scopeId, since)?.c ?? 0,
      )
      if (countSince(nowMs - 60 * 60 * 1000) >= gm.maxPerHour) return { ok: false, reason: 'rate-limited' }
      if (countSince(nowMs - 24 * 60 * 60 * 1000) >= gm.maxPerDay) return { ok: false, reason: 'rate-limited' }

      const id = await insertMemory(db, {
        kind: 'episode',
        text: turn.text,
        layer: 'auto',
        scopeType: 'group',
        scopeId,
        sourceChannel: 'qq-group',
        sourceMsgId: turn.sourceMsgId,
        extractorVersion: 'group-turn-v1',
        sourceTs: turn.at,
        importance: 0.35,
        confidence: 0.6,
      })
      // TTL：每条群记忆单独记 group_ttl_<id>；清理见 lib/group/ttl.js
      try { db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run(`group_ttl_${id}`, String(gm.ttlDays)) } catch {}
      info(`dyMemory.saveGroupTurn group=${gid} #${id} chars=${turn.chars}`)
      return { ok: true, id: Number(id), chars: turn.chars }
    } catch (e) {
      warn(`dyMemory.saveGroupTurn 失败：${e?.message ?? e}`)
      return { ok: false, error: String(e?.message ?? e) }
    }
  }

  /** resolveConflict：HUD 红点解冲突（owner/home；幂等；写审计） */
  function resolveConflict(input = {}, opts = {}) {
    if (!opts?.header && !opts?.session?.header && !input?.header) throw new ServiceError(ERR.PERMISSION, 'resolveConflict：必须带 header', { method: 'resolveConflict' })
    const header = resolveHeader(opts?.header ?? opts?.session?.header ?? input?.header, opts?.session)
    if (!header?.id) throw new ServiceError(ERR.PERMISSION, 'resolveConflict：必须带 header', { method: 'resolveConflict' })
    if (!isOwnerHeader(header)) throw new ServiceError(ERR.PERMISSION, 'resolveConflict：只有主人/家可用', { method: 'resolveConflict' })
    return resolveConflictRow(db, { id: input?.id, action: input?.action, side: input?.side, deleteMemory: input?.deleteMemory ?? null, vectors: getVectors?.(), actor: 'owner' })
  }

  /** handoffBrief：交接简报（只读、纯确定、不写表）。
   * P0-1: handoff identity must match a host-observed live session. The caller may
   * supply a header (Autonomy currently does so), but cannot mint trust with it:
   * id + cwd must already exist in the host-observed live-session registry.
   */
  function handoffBrief(input = {}, opts = {}) {
    const header = resolveHeader(opts?.header, opts?.session?.header, input?.header)
    const empty = () => ({ ok: true, text: '', sections: { project: '', decisions: [], todos: [], lastUnanswered: '', topics: [] } })
    if (!header || !String(header.id ?? header.sessionId ?? '').trim()) return empty()
    let trusted = false
    try { trusted = typeof isTrustedHeader === 'function' && Boolean(isTrustedHeader(header)) } catch {}
    if (!trusted) return empty()
    let scope = null
    try { scope = typeof scopeForHeader === 'function' ? scopeForHeader(header) : null } catch {}
    if (!scope || scope.level !== 'owner') return empty()
    let owner = false
    try { owner = Boolean(isOwnerHeader(header)) } catch {}
    const headerCwd = String(header.cwd ?? '').trim()
    const requestedCwd = String(input?.cwd ?? headerCwd).trim()
    if (!owner || !headerCwd || requestedCwd !== headerCwd) return empty()
    return buildHandoffBrief(db, {
      cwd: headerCwd,
      recent: input?.recent ?? [],
      kind: input?.kind ?? '',
      contactId: input?.contactId ?? '',
      maxChars: Number(input?.maxChars) || 1200,
      isOwner: true,
    })
  }

  /** carryover：只读，返回这个房间的「上次聊到」块（供别的插件/GUI 用）
   * P0-1: identity must come from host-injected opts.header/session.header; never from input.cwd.
   * The target cwd must equal the trusted header cwd; otherwise fail closed. */
  async function carryover(input = {}, opts = {}) {
    const header = resolveHeader(opts?.header, opts?.session?.header)
    if (!header || !String(header.id ?? header.sessionId ?? '').trim()) {
      throw new ServiceError(ERR.PERMISSION, 'carryover：缺少可信 session header', { method: 'carryover' })
    }
    guard('carryover', header)
    if (typeof isTrustedHeader !== 'function' || !isTrustedHeader(header)) {
      throw new ServiceError(ERR.PERMISSION, 'carryover：header 非受信运行时会话', { method: 'carryover' })
    }
    let scope = null
    try { scope = typeof scopeForHeader === 'function' ? scopeForHeader(header) : null } catch { scope = null }
    if (!scope || scope.level !== 'owner') {
      throw new ServiceError(ERR.PERMISSION, 'carryover：仅 owner 会话可读', { method: 'carryover' })
    }
    const hcwd = String(header.cwd ?? '').trim()
    const target = String(input?.cwd ?? hcwd).trim()
    if (!hcwd || target !== hcwd) {
      throw new ServiceError(ERR.PERMISSION, 'carryover：cwd 与可信 header 不一致', { method: 'carryover' })
    }
    const sid = String(header.id ?? header.sessionId ?? '')
    return withTimeout('carryover', async () => carryoverFor(db, hcwd, { limit: input?.limit, sid }), T.episodeTimeoutMs, '', (e) => warn(`dyMemory.carryover 失败：${e?.message ?? e}`))
  }

  /** 短期记忆（2026-11-12 P0）：最近 N 天还要用的约定/待办/状态；owner 可见全部，其他 scope 只看自己 */
  function shorttermRecent(days = 3, limit = 5, headerArg = null) {
    const header = guard('shorttermRecent', resolveHeader(headerArg))
    let scope = null
    try { scope = typeof scopeForHeader === 'function' ? scopeForHeader(header) : null } catch { scope = null }
    const d = clampInt(days, 3, 1, 30)
    const n = clampInt(limit, 5, 1, 20)
    const since = Date.now() - d * 86400000
    let where = 'expires_at > ? AND at >= ?'
    const args = [Date.now(), since]
    if (scope && scope.level !== 'owner') {
      where += ' AND scope_type=? AND scope_id=?'
      args.push(String(scope.write?.scopeType ?? scope.scopeType ?? 'owner'), String(scope.write?.scopeId ?? scope.scopeId ?? ''))
    }
    try {
      return db.prepare(`SELECT id,kind,content,context,importance,at,expires_at FROM shortterm WHERE ${where} ORDER BY importance DESC, at DESC LIMIT ?`).all(...args, n)
        .map((r) => ({ id: Number(r.id), kind: String(r.kind), content: String(r.content), context: String(r.context ?? ''), importance: Number(r.importance), at: Number(r.at), expiresAt: Number(r.expires_at) }))
    } catch (e) { warn(`dyMemory.shorttermRecent 失败：${e?.message ?? e}`); return [] }
  }

  /** 写短期记忆（owner/home 或插件写身份；daily 直接写库不走这里） */
  async function shorttermAdd(input = {}, opts = {}) {
    const header = guard('shorttermAdd', resolveHeader(input, opts), { allowPluginWrite: true })
    let scope = null
    try { scope = typeof scopeForHeader === 'function' ? scopeForHeader(header) : null } catch { scope = null }
    if (scope && scope.level !== 'owner' && !isPluginHeader?.(header)) throw new ServiceError(ERR.PERMISSION, 'shorttermAdd：只有主人/家可用', { method: 'shorttermAdd' })
    const items = Array.isArray(input?.items) ? input.items : []
    const ttlMs = clampInt(input?.ttlHours, 72, 1, 24 * 30) * 3600000
    const now = Date.now()
    let inserted = 0
    try {
      db.prepare('DELETE FROM shortterm WHERE expires_at <= ?').run(now)
      const ins = db.prepare(`INSERT INTO shortterm(self_id,scope_type,scope_id,kind,content,context,importance,at,expires_at,created_at,source_msg_id)
        VALUES('',?,?,?,?,?,?,?,?,?,?)`)
      for (const x of items.slice(0, 12)) {
        const content = String(x?.content ?? '').trim()
        if (!content) continue
        ins.run(String(scope?.write?.scopeType ?? 'owner'), String(scope?.write?.scopeId ?? ''), String(x?.kind ?? 'event'), content.slice(0, 200), String(x?.context ?? '').slice(0, 100), Number(x?.importance) || 0.5, now, now + ttlMs, now, String(x?.sourceMsgId ?? ''))
        inserted++
      }
      return { ok: true, inserted }
    } catch (e) { warn(`dyMemory.shorttermAdd 失败：${e?.message ?? e}`); return { ok: false, error: String(e?.message ?? e) } }
  }

  /** lastUserMessageAt：不敏感、不要求 header（契约 §3） */
  function lastUserMessageAtFn() {
    try {
      const v = Number(lastUserMessageAt?.() ?? 0)
      return Number.isFinite(v) && v > 0 ? v : null
    } catch (e) {
      warn(`dyMemory.lastUserMessageAt 失败：${e?.message ?? e}`)
      return null
    }
  }

  const api = {
    recall,
    episodeRecent,
    addEpisode,
    saveDiary,
    saveEmail,
    bindContact,
    resolveContact,
    contactOf,
    carryover,
    handoffBrief,
    resolveConflict,
    saveGroupDigest,
    saveGroupTurn,
    saveGroupTranscript,
    publishPublic,
    publicBrief,
    shorttermRecent,
    shorttermAdd,
    lastUserMessageAt: lastUserMessageAtFn,
  }
  return Object.freeze(api)
}

/** 预留：给 pending 记录生成 trace id（阶段 2 未使用） */
export function newServiceTraceId() {
  return randomUUID()
}
