/**
 * P1 原句档案：吃宿主 session/event，按天写 md（兼容旧格式），同时建 raw_fts。
 * 特点：撤回写 tombstone（不删原文行），检索跳过 tombstone；保留期默认 30 天。
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { bigrams } from '../store/fts.js'
import { ROLE, archiveLabel, normalizeRole } from '../roles.js'
import { resolvePersonId } from '../person/id.js'
import { dayOf, clockOf } from '../adapter/timefmt.js'
import { isSilentUtterance } from './utterance.js'
import { encodeVector } from '../store/vector-codec.js'

/**
 * 去掉她自己偶尔写的自检标签：<system>自检：…</system>
 * 防误删（三条同时满足才删）：成对标签 + 内容以「自检」开头 + 长度 ≤200 字
 */
export function stripSelfCheckTags(text) {
  const s = String(text ?? '')
  const out = s.replace(/<system>\s*自检[:：]?([\s\S]{0,200}?)<\/system>/g, '')
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** 去掉 onebot 拼在用户消息前面的整段聊天规矩（【私聊】/【群聊】 … [现在是 …]） */
export function stripRuleBlock(text, { keepTimeMarker = false } = {}) {
  const s0 = String(text ?? '')
  const timeRe = /\[\s*(?:现在是|20\d{2}-\d{2}-\d{2})[^\]]*\]/
  let s = s0

  const start = s.search(/【(私聊|群聊)】/)
  if (start >= 0) {
    const rest = s.slice(start)
    const end = rest.search(timeRe)
    if (end >= 0) {
      const absEnd = start + end
      const tail = s.slice(absEnd)
      s = keepTimeMarker ? s.slice(0, start) + tail : s.slice(0, start) + tail.replace(/^\[[^\]]*\]/, '')
    }
  }
  // 剩下的独立时间标记（会话里只有第一条带整段规矩）
  if (!keepTimeMarker) s = s.replace(/\[\s*现在是[^\]]*\]\s*/g, '')
  return s
}

const SKIP = new Set(['agent/assistant-stream', 'llm/request', 'llm/response', 'assistant/chunk'])
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const channelOf = (owner, thread) => (thread ? 'qq' : 'qq')


function textOf(content) {
  if (Array.isArray(content)) return content.filter((c) => c?.type === 'text').map((c) => c.text).join(' ')
  return String(content ?? '')
}

const SENSITIVE_KEY = /token|secret|password|passwd|authorization|api[-_]?key|cookie|access[-_]?token/i
const PHONE = /(^|[^0-9])1[3-9]\d{9}(?![0-9])/g
const IDCARD = /(^|[^0-9])\d{17}[\dXx](?![0-9])/g
function maskText(text) {
  return String(text ?? '')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1***')
    .replace(/((?:token|password|passwd|secret|authorization|api[-_]?key)\s*[=:]\s*)[^\s,;&"'}]+/gi, '$1***')
    .replace(PHONE, '$1***')
    .replace(IDCARD, '$1***')
}
function maskValue(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return maskText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (depth >= 10) return maskText(JSON.stringify(value))
  if (Array.isArray(value)) return value.map((v) => maskValue(v, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '***' : maskValue(v, depth + 1)
    return out
  }
  return value
}
function fileMeta(block) {
  const src = block?.source ?? block ?? {}
  const name = String(block?.name ?? src?.name ?? src?.filename ?? block?.filename ?? '')
  const size = Number(block?.size ?? src?.size ?? block?.bytes ?? 0) || 0
  return { name: name || '未命名', size }
}

/** 旧的原话归档前缀（未配置任何前缀时的默认值，保持旧行为） */
export const LEGACY_CWD_PREFIX = '/root/qq-agent/QQ会话'

/** 前缀归一化：去空白、去尾斜杠、去重 */
export function normalizePrefixes(list) {
  const raw = Array.isArray(list) ? list : (list ? [list] : [])
  const out = []
  for (const item of raw) {
    const p = String(item ?? '').trim().replace(/[/\\]+$/, '')
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

/**
 * cwd 是否落在某个前缀下（**按目录边界**，`/x/a` 不匹配 `/x/a2`）。
 * 空列表 = 不限制（归档所有会话，与旧实现「空 cwdPrefix」语义一致）。
 */
export function isUnderPrefix(cwd, prefixes = []) {
  const list = normalizePrefixes(prefixes)
  if (!list.length) return true
  const path = String(cwd ?? '').trim().replace(/[/\\]+$/, '')
  if (!path) return false
  return list.some((p) => path === p || path.startsWith(`${p}/`))
}

/**
 * 归档文件名里的会话片段（2026-11-05 B-11）。
 *
 * 旧实现是 `sid.slice(0,8)`：宿主新会话 id 形如 `session-b87bb63e-…`，
 * 前 8 位恰好是 `session-` → 所有会话共用 `s-session-.md`。
 * 新规则：先去掉 `session-` 前缀，再取前 8 位；没有前缀的 id 行为不变（仍取前 8 位）。
 * 极端情况（空/短到取不出、含非法字符）→ 用 sha1 前 8 位兜底，保证唯一且稳定。
 */
export function shortSid(sid) {
  const raw = String(sid ?? '').trim()
  if (!raw) return 'unknown'
  const body = raw.startsWith('session-') ? raw.slice('session-'.length) : raw
  const clean = body.replace(/[^A-Za-z0-9_-]/g, '')
  if (clean.length >= 8) return clean.slice(0, 8)
  if (clean.length > 0) return clean          // 旧行为：短 id 原样取（不额外加长）
  return createHash('sha1').update(raw).digest('hex').slice(0, 8)
}

export const CHANNEL_PREFIX = '/sdcard/DSHA/渠道'
export function isChannelCwd(cwd) { return String(cwd ?? '').startsWith(CHANNEL_PREFIX) }
/** 清洗桥投递的用户消息：去一个 [渠道·kind·名字(id)] 头；截掉【这个房间的规矩】规则块 */
export function cleanChannelEnvelope(text) {
  const raw = String(text ?? '')
  const m = raw.match(/^(\d{2}:\d{2}:\d{2} \[\d*\] [^：]+：)/)
  const head = m ? m[1] : ''
  let body = m ? raw.slice(head.length) : raw
  // 渠道头：任意位置（[补收·…] 前后都处理），形如 [QQ·私聊·名字(123)] / [群·…]
  body = body.replace(/\[[^\[\]]*·[^\[\]]*\(\d+\)\]\s*/g, '')
  body = body.replace(/\[补收·[^\]]*\]\s*/g, '')
  const k = body.indexOf('【这个房间的规矩】')
  if (k >= 0) body = body.slice(0, k)
  const c = body.indexOf('Current runtime context')
  if (c >= 0) body = body.slice(0, c)
  return (head + body).replace(/\s+$/, '').trimEnd()
}

export class RawArchive {
  constructor({ db, dir, retentionDays = 30, cwdPrefix = '', cwdPrefixes = null, keepTimeMarker = false, log, getSelfId = null, owner = {}, getPersona = null, embedFn = null }) {
    this.owner = owner
    this.getPersona = getPersona
    this.embedFn = embedFn
    this.rawVecPending = 0
    this.rawVecLastError = ''
    this.keepTimeMarker = keepTimeMarker
    // 2026-11-05：前缀从单值改为列表（cwdPrefixes 优先；旧 cwdPrefix 兼容；都没给 → 旧默认）
    const list = Array.isArray(cwdPrefixes) && cwdPrefixes.length
      ? cwdPrefixes
      : (cwdPrefix ? [cwdPrefix] : [LEGACY_CWD_PREFIX])
    this.cwdPrefixes = normalizePrefixes(list)
    this.cwdPrefix = this.cwdPrefixes[0] ?? ''   // 旧字段，保留给外部读取
    this.db = db
    this.dir = dir
    this.retentionDays = retentionDays
    this.log = log
    this.lastSeq = new Map()
    this.gate = { calls: 0, blocked: 0, degraded: 0, top1: [] }
    mkdirSync(dir, { recursive: true })
    this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS raw_fts USING fts5(text, tokenize='unicode61')`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS raw_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, file TEXT, line_no INTEGER,
      seq INTEGER, role TEXT, speaker TEXT, channel TEXT, tombstone INTEGER DEFAULT 0,
      chars INTEGER DEFAULT 0, raw_text TEXT DEFAULT '', at INTEGER, extra TEXT DEFAULT '{}', cwd TEXT DEFAULT '')`)
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_raw_day ON raw_meta(day, role)')
    // 阶段 3 迁移前这些列可能不存在：写路径按列存在与否降级
    this.cols = { rawMeta: new Set((() => { try { return this.db.prepare('PRAGMA table_info(raw_meta)').all().map((c) => String(c.name)) } catch { return [] } })()) }
    this.getSelfId = typeof getSelfId === 'function' ? getSelfId : () => ''
    try { this.db.exec("ALTER TABLE raw_meta ADD COLUMN raw_text TEXT DEFAULT ''") } catch {}
    try { this.db.exec("ALTER TABLE raw_meta ADD COLUMN extra TEXT DEFAULT '{}'") } catch {}
    try { this.db.exec("ALTER TABLE raw_meta ADD COLUMN cwd TEXT DEFAULT ''") } catch {}
    try { this.db.exec("ALTER TABLE raw_meta ADD COLUMN person_id TEXT DEFAULT ''") } catch {}
    // 2026-11-08：情绪快照 + 原话向量索引（幂等建表）
    try { this.db.exec(`CREATE TABLE IF NOT EXISTS raw_emotion_archive (
      raw_id INTEGER PRIMARY KEY, at INTEGER NOT NULL, label TEXT, valence REAL, arousal REAL,
      certainty REAL, intensity REAL, source TEXT DEFAULT 'live', created_at INTEGER)`) } catch {}
    try { this.db.exec(`CREATE TABLE IF NOT EXISTS raw_vectors (
      raw_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL, model TEXT, updated_at INTEGER NOT NULL)`) } catch {}
  }

  /** 插入后：记录 self 首行 + 排队向量 */
  afterInsertRow(norm, text) {
    let rid = 0
    try { rid = Number(this.db.prepare('SELECT last_insert_rowid() id').get().id) } catch { return }
    if (!rid) return
    if (norm === ROLE.SELF) this._firstSelfId = rid
    this.enqueueRawVector(rid, text)
  }

  enqueueRawVector(rid, text) {
    if (!this.embedFn || !rid || String(text ?? '').trim().length < 8) return
    this.rawVecPending += 1
    setImmediate(async () => {
      try {
        const vs = await this.embedFn([String(text).slice(0, 500)])
        const v = vs?.[0]
        if (!v || !v.length) throw new Error('empty-vector')
        // 2026-11-17：改存 int8+scale（自描述格式，读取端两种都认）。99MB→24.7MB，检索 top-10 实测不变。
        this.db.prepare('INSERT OR REPLACE INTO raw_vectors(raw_id,dim,vec,model,updated_at) VALUES(?,?,?,?,?)')
          .run(rid, v.length, encodeVector(v), 'bge-small-zh', Date.now())
      } catch (e) { this.rawVecLastError = String(e?.message ?? e).slice(0, 120) }
      finally { this.rawVecPending = Math.max(0, this.rawVecPending - 1) }
    })
  }

  /** assistant 消息：第一条 self 行记一次情绪快照（失败只 warn） */
  snapshotEmotion(rawId, at) {
    if (!rawId) return
    try {
      const persona = this.getPersona?.()
      let e = null
      // 优先取「事件时间或之前最近一条情绪」；emotionAt 默认只回 ±10 分钟，久未更新会拿不到
      try {
        const rows = persona?.emotionTimeline?.({ from: Number(at) - 24 * 60 * 60 * 1000, to: Number(at), limit: 1 })
        if (Array.isArray(rows) && rows.length) e = rows[rows.length - 1]
      } catch {}
      if (!e) {
        try { e = persona?.emotionAt?.(Number(at), { windowMs: 24 * 60 * 60 * 1000 }) } catch {}
      }
      if (!e || typeof e !== 'object') return
      this.db.prepare(`INSERT OR REPLACE INTO raw_emotion_archive
        (raw_id,at,label,valence,arousal,certainty,intensity,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
        .run(rawId, Number(at), String(e.label ?? ''), Number(e.valence ?? 0), Number(e.arousal ?? 0),
          Number(e.confidence ?? 0.5), Number(e.intensity ?? 0), 'live', Date.now())
    } catch (err) { try { this.log?.warn?.(`情绪快照失败：${err?.message ?? err}`) } catch {} }
  }

  rawVectorStats() {
    let count = 0
    try { count = Number(this.db.prepare('SELECT count(*) c FROM raw_vectors').get()?.c ?? 0) } catch {}
    return { count, pending: this.rawVecPending, lastError: this.rawVecLastError }
  }

  personOfUser(cwd, contactId, srcMsg = {}) {
    try {
      const room = String(cwd ?? '')
      // 2026-11-07：邮件渠道 —— 地址在 owner 集合里归 person:owner，否则 email 联系人
      const isMail = /\/渠道\/email/.test(room) || String(srcMsg?.channel ?? '') === 'email' || String(contactId ?? '').includes('@')
      if (isMail) {
        const addr = String(contactId ?? '').trim().toLowerCase() || String(srcMsg?.contactId ?? srcMsg?.senderId ?? '').trim().toLowerCase()
        if (!addr) return ''
        const owners = [this.owner?.ownerEmail, ...(Array.isArray(this.owner?.ownerAddresses) ? this.owner.ownerAddresses : [])].map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean)
        return owners.includes(addr) ? 'person:owner' : `person:contact:email:${addr}`
      }
      const ownerQQ = String(this.owner?.ownerQQ ?? '').trim()
      const gid = String(srcMsg?.groupId ?? srcMsg?.chatId ?? '').match(/^\d{5,}$/)?.[0] ?? room.match(/群_(\d+)/)?.[1] ?? ''
      const isGroup = Boolean(gid) || srcMsg?.kind === 'group' || srcMsg?.chatType === 'group' || /群_/.test(room)
      if (isGroup) return gid ? `person:contact:qq:group:${gid}` : ''
      const qq = String(contactId ?? '').trim() || String(srcMsg?.contactId ?? srcMsg?.senderId ?? '').trim() || room.match(/私聊_(\d{5,})/)?.[1] || ''
      if (qq) return ownerQQ && qq === ownerQQ ? 'person:owner' : `person:contact:qq:${qq}`
      // 主人自己的目录（home / ownerPrivateDir / trustedDirs）→ person:owner
      const dirs = [this.owner?.ownerPrivateDir, ...(Array.isArray(this.owner?.ownerDirs) ? this.owner.ownerDirs : [])].map((d) => String(d ?? '').replace(/\/+$/, '')).filter(Boolean)
      if (dirs.some((d) => room === d || room.startsWith(d + '/'))) return 'person:owner'
      // 统一投递的渠道房间没有 QQ 号：按 owner 绑定/主人身份判定
      if (/\/渠道\/qq/.test(room) && ownerQQ) return 'person:owner'
      return ''
    } catch { return '' }
  }

  personOf(cwd, contactId) { try { return resolvePersonId({ channel: String(cwd).includes('/渠道/') ? (/渠道\/([a-z]+)/.exec(String(cwd))?.[1] ?? '') : 'qq', contactId, cwd, owner: this.owner }) } catch { return '' } }

  /** 每个事件 → 若干行；撤回事件 → tombstone 标记 */
  linesFor(type, event) {
    const data = event?.data ?? {}
    const out = []
    let firstSelfId = 0
    if (type === 'user/message') {
      const msg = data.message ?? data
      const src = String(msg?.source?.kind ?? data?.source?.kind ?? '')
      if (src && src !== 'user') return []
      const content = data.content ?? data.message?.content
      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content ?? '') }]
      const texts = blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('\n')
      const raw = stripRuleBlock(texts, { keepTimeMarker: this.keepTimeMarker }).trim()
      if (raw) out.push({ role: ROLE.USER, text: maskText(raw) })
      for (const b of blocks) {
        if (b?.type === 'image') { const f = fileMeta(b); out.push({ role: '图', text: `[图片] ${f.name} ${f.size} bytes`, extra: { file: f } }) }
        else if (b?.type === 'file' || b?.type === 'document') { const f = fileMeta(b); out.push({ role: '文', text: `[文件] ${f.name} ${f.size} bytes`, extra: { file: f } }) }
      }
      return out
    }
    this._firstSelfId = 0
    if (type === 'assistant/message') {
      const content = data.content ?? data.message?.content
      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content ?? '') }]
      for (const b of blocks) {
        if (b?.type === 'text') {
          const raw = maskText(stripSelfCheckTags(b.text ?? ''))
          // [SILENT] 是她决定不说话的标记，不是原话；不落档案、不进 raw_fts
          if (raw && !isSilentUtterance(raw)) out.push({ role: ROLE.SELF, text: raw })
        } else if (b?.type === 'reasoning') {
          const raw = maskText(String(b.text ?? '').trim())
          if (raw) out.push({ role: ROLE.SELF_THOUGHT, text: raw })
        } else if (b?.type === 'image') out.push({ role: '图', text: `[图片] ${fileMeta(b).name} ${fileMeta(b).size} bytes` })
        else if (b?.type === 'file' || b?.type === 'document') out.push({ role: '文', text: `[文件] ${fileMeta(b).name} ${fileMeta(b).size} bytes` })
      }
      const usage = data.usage ?? data.message?.usage
      if (usage) out.push({ role: '量', text: `in=${Number(usage.inputTokens ?? 0)} out=${Number(usage.outputTokens ?? 0)} cache=${Number(usage.cacheReadTokens ?? 0)}`, extra: { usage: { in: Number(usage.inputTokens ?? 0), out: Number(usage.outputTokens ?? 0), cache: Number(usage.cacheReadTokens ?? 0) } } })
      return out
    }
    if (type === 'tool/call') {
      const name = String(data.name ?? data.toolName ?? 'tool')
      const args = maskValue(data.arguments ?? data.args ?? {})
      out.push({ role: '具', text: `${name} ${JSON.stringify(args)}`, extra: { name } })
      return out
    }
    if (type === 'tool/result') {
      const msg = data.message ?? data
      const content = msg?.content ?? data.content ?? data.result
      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content ?? '') }]
      const parts = []
      for (const b of blocks) {
        if (b?.type === 'text') { const t = maskText(String(b.text ?? '')); if (t) parts.push(t) }
        else if (b?.type === 'image') { const f = fileMeta(b); parts.push(`[图片] ${f.name} ${f.size} bytes`); }
        else if (b?.type === 'file' || b?.type === 'document') { const f = fileMeta(b); parts.push(`[文件] ${f.name} ${f.size} bytes`); }
      }
      const raw = parts.join(' ')
      out.push({ role: '果', text: (data.isError || msg?.isError ? 'ERROR ' : '') + (raw || '(空结果)'), extra: { isError: Boolean(data.isError ?? msg?.isError) } })
      return out
    }
    if (type === 'agent/error' || type === 'agent/request-error' || type === 'request-error') {
      const err = data.error ?? data.message ?? data
      out.push({ role: '错', text: maskText(typeof err === 'string' ? err : JSON.stringify(err)) })
      return out
    }
    if (type === 'step/start' || type === 'step/end') {
      out.push({ role: '步', text: type + (data.step !== undefined ? ` step=${data.step}` : '') })
      return out
    }
    if (type === 'request/context') {
      out.push({ role: '境', text: `model=${data.model ?? ''} window=${data.contextWindow ?? ''}`, extra: { model: data.model, window: data.contextWindow } })
      return out
    }
    if (type === 'request/header') {
      out.push({ role: '境', text: `header ${JSON.stringify(maskValue(data)).slice(0, 4000)}` })
      return out
    }
    if (type.startsWith('compaction/')) {
      const text = data.summary ?? data.text ?? data.message ?? ''
      out.push({ role: '压', text: `${type} ${maskText(typeof text === 'string' ? text : JSON.stringify(text))}` })
      return out
    }
    if (type === 'session/title') {
      out.push({ role: '题', text: maskText(String(data.title ?? data.text ?? '')) })
      return out
    }
    if (type === 'todo/write') {
      out.push({ role: '待', text: JSON.stringify(maskValue(data)) })
      return out
    }
    if (type === 'system/message') {
      const text = textOf(data.content ?? data.message?.content)
      out.push({ role: '系', text: `system section len=${text.length}` })
      return out
    }
    if (type === 'message/recall' || type === 'recall') {
      return [{ role: '撤', text: String(data.seq ?? data.messageId ?? '') }]
    }
    if (type === 'turn/start' || type === 'turn/end') return [{ role: '事', text: type }]
    if (type) out.push({ role: '事', text: `${type} ${JSON.stringify(maskValue(data)).slice(0, 20000)}`, extra: { event: type } })
    return out
  }

  onEvent(session, event) {
    const sid = String(session?.header?.id ?? '')
    if (!sid) return
    const cwd = String(session?.header?.cwd ?? '')
    // 归档白名单从「单前缀 startsWith」改为「前缀列表 + 目录边界」（2026-11-05）
    if (!isUnderPrefix(cwd, this.cwdPrefixes)) return
    const type = String(event?.type ?? '')
    if (!type || SKIP.has(type) || type.endsWith('/chunk')) return
    this._firstSelfId = 0
    const seq = Number(event?.seq ?? 0)
    const prev = this.lastSeq.get(sid) ?? -1
    if (seq && seq <= prev) return
    let lines = this.linesFor(type, event)
    if (!lines.length) return
    // 2026-11-05：渠道会话的用户消息先清洗（只改归档内容，不改会话投递原文）
    const srcMsg = event?.data?.message?.source ?? event?.data?.source ?? event?.source ?? {}
    const inbound = srcMsg?.channelInbound === true || Boolean(srcMsg?.channel)
    // 2026-11-06：home cwd 也会收到带包装的统一投递——按内容标记判定，user/self 都洗
    const isDialogRole = (r) => r === ROLE.USER || r === ROLE.SELF
    const needsClean = isChannelCwd(cwd) || inbound || lines.some((l) => /【这个房间的规矩】|\[QQ·|\[补收·/.test(String(l.text ?? '')))
    if (needsClean) {
      lines = lines
        .map((l) => (isDialogRole(l.role) ? { ...l, text: cleanChannelEnvelope(l.text) } : l))
        .filter((l) => !isDialogRole(l.role) || l.text)
      if (!lines.length) return
    }
    if (seq) this.lastSeq.set(sid, seq)
    const t = Number(event?.time ?? Date.now())
    const day = dayOf(t)
    const short = shortSid(sid)
    const file = `${day}/s-${short}.md`
    const abs = join(this.dir, file)
    mkdirSync(dirname(abs), { recursive: true })
    const out = []
    for (const l of lines) {
      if (l.role === '撤') { this.tombstone(short, Number(l.text) || 0); continue }
      out.push(`${clockOf(t)} [${seq || ''}] ${archiveLabel(l.role)}：${l.text.replace(/\n/g, '⏎')}`)
    }
    if (!out.length) return
    const before = existsSync(abs) ? readFileSync(abs, 'utf8').split('\n').length - 1 : 0
    appendFileSync(abs, out.join('\n') + '\n')
    let n = before
    for (let i = 0; i < out.length; i++) {
      n += 1
      const role = lines[i]?.role ?? '?'
      // 阶段 4：self / self-thought 的 speaker_id 取 persona.selfId()；取不到写 self:unknown + pending 标记
      const norm = normalizeRole(role)
      // 2026-11-05：speaker 列写「语义值」（self/user），speaker_id 写真实身份；
      // 旧实现把 selfId 写进了 speaker、speaker_id 永远空 → self:unknown 回填一直 0 行。
      let speakerId = ''
      let speakerValue = ''
      let pendingIdentity = false
      if (norm === ROLE.SELF || norm === ROLE.SELF_THOUGHT) {
        let sid = ''
        try { sid = String(this.getSelfId?.() ?? '') } catch { sid = '' }
        if (sid) speakerId = sid.startsWith('self:') ? sid : `self:${sid}`
        else { speakerId = 'self:unknown'; pendingIdentity = true }
        speakerValue = 'self'
      } else if (norm === ROLE.USER) {
        speakerValue = 'user'
      }
      const extraObj = { ...(lines[i]?.extra ?? { event: type }) }
      if (pendingIdentity) extraObj.pendingIdentity = true
      const extra = JSON.stringify(extraObj)
      const cwd = String(session?.header?.cwd ?? '')
      const thread = String(cwd).match(/私聊_([0-9]{5,})$/)?.[1] ?? (String(cwd).match(/群_([0-9]+)$/)?.[1] ? `group:${String(cwd).match(/群_([0-9]+)$/)[1]}` : '')
      const channelVal = /\/渠道\/email/.test(String(cwd)) || String(srcMsg?.channel ?? '') === 'email' ? 'email' : 'qq'
      const personVal = norm === ROLE.USER ? this.personOfUser(cwd, thread, srcMsg) : ''
      if (this.cols.rawMeta.has('thread_id')) {
        this.db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,speaker_id,channel,account_id,thread_id,external_id,url,tombstone,chars,raw_text,at,extra,cwd,person_id)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)`)
          .run(day, file, n, seq, role, speakerValue, speakerId, channelVal, '', thread, '', '', out[i].length, out[i], t, extra, cwd, personVal)
        this.afterInsertRow(norm, out[i])
      } else if (this.cols.rawMeta.has('speaker_id')) {
        // 阶段 3 只补了 speaker_id（或只跑了部分迁移）
        this.db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,speaker_id,tombstone,chars,raw_text,at,extra,cwd,person_id)
                         VALUES(?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)`)
          .run(day, file, n, seq, role, speakerValue, channelVal, speakerId, out[i].length, out[i], t, extra, cwd, personVal)
        this.afterInsertRow(norm, out[i])
      } else {
        this.db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,person_id)
                         VALUES(?,?,?,?,?,?,?,0,?,?,?,?,?,?)`)
          .run(day, file, n, seq, role, speakerValue, channelVal, out[i].length, out[i], t, extra, cwd, personVal)
        this.afterInsertRow(norm, out[i])
      }
      const id = Number(this.db.prepare('SELECT last_insert_rowid() id').get().id)
      // 超长行（一般是 onebot 把整段聊天规矩拼进了用户消息）：只在索引里放末尾的真实内容
      const raw = String(lines[i]?.text ?? '')
      const indexed = raw.length > 600 ? raw.slice(-400) : raw
      try { this.db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(indexed) || indexed) } catch {}
    }
    if (type === 'assistant/message' && this._firstSelfId) this.snapshotEmotion(this._firstSelfId, t)
  }

  /** 撤回：标记该会话此后不可再被召回（原文行保留用于审计） */
  tombstone(sid8, seq) {
    // 先把对应 raw_fts 行删掉（若有），再标 tombstone；避免「内存/索引还有、检索再过滤」的陈旧窗口。
    let ids = []
    try { ids = this.db.prepare("SELECT id FROM raw_meta WHERE file LIKE ? AND seq=?").all(`%/s-${sid8}.md`, seq).map((r) => Number(r.id)) } catch {}
    for (const id of ids) { try { this.db.prepare('DELETE FROM raw_fts WHERE rowid=?').run(id) } catch {} }
    this.db.prepare("UPDATE raw_meta SET tombstone=1 WHERE file LIKE ? AND seq=?").run(`%/s-${sid8}.md`, seq)
  }

  /**
   * 原句召回：
   * - top1 ≥ minScore：返回最多 limit 条（按命中序归一化）
   * - top1 < minScore 但 ≥ floor：降级保留**分数最高 1 条**，标记 degraded
   * - 更低：整块省略
   */
  /**
   * 邮件进原话档案（2026-11-07）：独立房间 cwd=/sdcard/DSHA/渠道/email，
   * role=user（主人来信）、channel=email、speaker=from；按 messageId 去重。
   * @returns {{ok:boolean,id?:number,archived:boolean,duplicate?:boolean,file?:string,error?:string}}
   */
  recordEmail({ from = '', to = '', subject = '', text = '', at = Date.now(), messageId = '' } = {}) {
    const cwd = '/sdcard/DSHA/渠道/email'
    const mid = String(messageId ?? '').trim()
    try {
      if (mid) {
        const exist = this.db.prepare("SELECT id,file FROM raw_meta WHERE channel='email' AND json_extract(extra,'$.messageId')=? LIMIT 1").get(mid)
        if (exist) return { ok: true, id: Number(exist.id), archived: true, duplicate: true, file: String(exist.file ?? '') }
      }
      const t = Number(at) || Date.now()
      const day = dayOf(t)
      const file = `${day}/s-email.md`
      let line = 1
      try { line = Number(this.db.prepare('SELECT max(line_no) m FROM raw_meta WHERE file=?').get(file)?.m ?? 0) + 1 } catch {}
      const body = `[邮件] 主题：${String(subject ?? '').trim() || '(无主题)'} 正文：${String(text ?? '').trim() || '(空正文)'}`.slice(0, 800)
      const rawText = `${clockOf(t)} [0] 主人：${maskText(body).replace(/\n/g, '⏎')}`
      const extra = JSON.stringify({ messageId: mid, from: String(from ?? ''), to: String(to ?? ''), subject: String(subject ?? '') })
      const info = this.db.prepare(`INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd)
        VALUES(?,?,?,?,?,?,?,0,?,?,?,?,?)`).run(day, file, line, 0, ROLE.USER, String(from ?? ''), 'email', body.length, rawText, t, extra, cwd)
      const id = Number(info.lastInsertRowid)
      try { this.db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(id, bigrams(rawText)) } catch {}
      const abs = join(this.dir, file)
      mkdirSync(dirname(abs), { recursive: true })
      appendFileSync(abs, `${clockOf(t)} [0] 主人：${maskText(body).replace(/\n/g, '⏎')}\n`)
      return { ok: true, id, archived: true, file }
    } catch (e) {
      return { ok: false, archived: false, error: String(e?.message ?? e).slice(0, 160) }
    }
  }

  search(query, { limit = 3, minScore = 0.35, floor = 0.15, channel = 'qq', cwd = '' } = {}) {
    this.gate.calls += 1
    const grams = bigrams(query).split(' ').filter(Boolean)
    if (!grams.length) { this.gate.blocked += 1; return [] }
    const expr = grams.map((g) => `"${g.replaceAll('"', '""')}"`).join(' OR ')
    let rows = []
    try {
      rows = this.db.prepare(`SELECT m.id,m.day,m.file,m.line_no,m.role,m.at,m.raw_text,f.text
        FROM raw_fts f JOIN raw_meta m ON m.id=f.rowid
        WHERE raw_fts MATCH ? AND m.tombstone=0 AND m.channel=? AND (?='' OR m.cwd=?)
        LIMIT 50`).all(expr, channel, String(cwd ?? ''), String(cwd ?? ''))
    } catch { this.gate.blocked += 1; return [] }
    rows = rows.filter((r) => !isSilentUtterance(r.raw_text))
    if (!rows.length) { this.gate.blocked += 1; return [] }

    const n = rows.length
    const scored = rows.map((r, i) => ({
      id: r.id, day: r.day, role: r.role, at: r.at,
      snippet: (() => { const t = String(r.raw_text || r.text).replace(/^\d{2}:\d{2}:\d{2} \[\d*\] /, ''); return (t.length > 120 ? t.slice(-60) : t).slice(0, 60) })(),
      score: 1 - i / Math.max(n, 2),
    }))
    const top1 = scored[0]?.score ?? 0
    this.gate.top1.push(top1)
    if (this.gate.top1.length > 500) this.gate.top1.shift()

    if (top1 < minScore) {
      this.gate.blocked += 1
      if (top1 >= floor) {
        this.gate.degraded += 1
        return [{ ...scored[0], degraded: true }]
      }
      return []
    }
    return scored.filter((r) => r.score >= minScore).slice(0, limit)
  }

  gateStats() {
    const arr = this.gate.top1.slice().sort((a, b) => a - b)
    const median = arr.length ? arr[Math.floor(arr.length / 2)] : 0
    const calls = this.gate.calls || 1
    // top1 分布直方图（0.2 一档）：比单一 blockRate 更能指导调参
    const buckets = [0, 0, 0, 0, 0]   // [0,.2) [.2,.4) [.4,.6) [.6,.8) [.8,1]
    for (const v of arr) buckets[Math.min(4, Math.floor(v / 0.2))] += 1
    return {
      calls: this.gate.calls,
      blocked: this.gate.blocked,
      blockRate: +(this.gate.blocked / calls).toFixed(3),
      degraded: this.gate.degraded,
      top1Median: +median.toFixed(3),
      top1Histogram: buckets,
    }
  }

  /** 校验某天文件是否被改过（对 raw_meta 行数做哈希） */
  verify(day) {
    const dir = join(this.dir, day)
    if (!existsSync(dir)) return { ok: false, error: '没有这一天' }
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
    const out = []
    let firstSelfId = 0
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8')
      out.push({ file: `${day}/${f}`, lines: text.split('\n').filter(Boolean).length, hash: sha(text) })
    }
    return { ok: true, files: out }
  }

  /** 保留期清理（默认 30 天） */
  cleanup(now = Date.now()) {
    const cutoff = now - this.retentionDays * 86400000
    const days = readdirSync(this.dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    let removed = 0
    for (const d of days) {
      const t = new Date(`${d}T00:00:00`).getTime()
      if (t < cutoff) { rmSync(join(this.dir, d), { recursive: true, force: true }); removed++ }
    }
    return removed
  }
}
