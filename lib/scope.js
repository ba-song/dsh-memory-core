/**
 * 记忆 scope（2026-11-06 P0）
 *
 * scope 是记忆的一等键：core（人格/规则）、owner（主人事实/隐私）、
 * contact（某联系人）、group（某个群）、public（公开/安全）。会话能看哪些层由 cwd/身份决定，
 * **不由模型传参决定**；工具层只认会话推导出的 scope，越权请求返回空并写审计。
 *
 * 兼容：现有 memories 行迁移后全部是 `scope_type='owner'`；owner 会话（home/主人私聊）
 * 继续看全量，行为不变。group 是 2026-11-09 新增的地基：只按群隔离，不做实时抽取。
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isGroupCwd } from './owner.js'

/** 五个合法 scope_type */
export const SCOPE_TYPES = Object.freeze(['core', 'owner', 'contact', 'group', 'public'])
const SCOPE_SET = new Set(SCOPE_TYPES)

/** 模型/调用方不许自己传 scope：工具层发现这些键就拒绝 */
export const SCOPE_ARG_KEYS = Object.freeze(['scope', 'scope_type', 'scopeType', 'scope_id', 'scopeId', 'allowedScopes', 'ownerScope', 'visibility'])

/** 从参数里找出非法 scope 键（返回第一个键名，没有返回 ''） */
export function findScopeArg(args) {
  if (!args || typeof args !== 'object') return ''
  for (const k of SCOPE_ARG_KEYS) if (Object.hasOwn(args, k)) return k
  return ''
}

/**
 * 从外部渠道 cwd 解析联系人：
 *   /sdcard/DSHA/渠道/douyin/123456      → { channel:'douyin', externalId:'123456', scopeId:'douyin:123456' }
 *   /root/qq-agent/QQ会话/私聊_1000000009 → { channel:'qq', externalId:'1000000009', scopeId:'qq:1000000009' }
 */
export function resolveExternalContact(cwd) {
  const p = String(cwd ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (!p) return null
  let m = p.match(/\/渠道\/([^/]+)\/([^/]+)(?:\/|$)/)
  if (m && m[1] && m[2]) return { channel: m[1], externalId: m[2], scopeId: `${m[1]}:${m[2]}` }
  m = p.match(/私聊_([0-9]{5,})\/?$/)
  if (m) return { channel: 'qq', externalId: m[1], scopeId: `qq:${m[1]}` }
  // 抖音统一接待室（2026-11-14）：一个共享会话，不按联系人拆；固定为 douyin:others
  if (/\/渠道\/douyin\/?$/.test(p)) return { channel: 'douyin', externalId: 'others', scopeId: 'douyin:others' }
  return null
}

/**
 * 群 cwd → groupId（形如 `qq:<群号>`）。
 *
 * 新形态 `<groupCwd>/<群号>` 取最后一段纯数字；
 * 老形态 `群_<群号>` 沿用归档侧同样的取号方式（lib/ingest/archive.js:`room.match(/群_(\d+)/)`）；
 * 只剩根目录 `.../qq-群` 时退回整段 `qq-群`；都取不到给空串（该群视图看不到任何 group 行）。
 */
export function groupIdFromCwd(cwd) {
  const p = String(cwd ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (!p) return ''
  const last = p.split('/').pop() ?? ''
  if (/^\d+$/.test(last)) return `qq:${last}`
  const legacy = last.match(/群_(\d+)$/)
  if (legacy) return `qq:${legacy[1]}`
  if (/(?:^|\/)qq-群$/.test(p)) return 'qq:qq-群'
  return ''
}

/**
 * 会话 → scope 视图。
 *
 * @param {object} opts
 * @param {string} opts.cwd 会话 cwd
 * @param {string} [opts.sessionId]
 * @param {boolean} [opts.isOwner] 调用方用既有 classifyOwner/isOwnerCwd 判定（home/主人私聊为 true）
 * @returns {{level:'owner'|'external'|'group'|'unknown', cwd:string, sessionId:string,
 *   contactId:string, channel:string, groupId:string, scopeTypes:string[], raw:'all'|'own'|'none',
 *   scopeType:string, scopeId:string, write:{scopeType:string,scopeId:string}}}
 */
export function scopeForSession({ cwd = '', sessionId = '', isOwner = false } = {}) {
  const path = String(cwd ?? '').trim().replace(/\/+$/, '')
  const sid = String(sessionId ?? '')
  if (isOwner === true) {
    return { level: 'owner', cwd: path, sessionId: sid, contactId: '', channel: '', scopeTypes: [...SCOPE_TYPES], raw: 'all', scopeType: 'owner', scopeId: '', write: { scopeType: 'owner', scopeId: '' } }
  }
  if (isGroupCwd(path)) {
    const gid = groupIdFromCwd(path)
    return {
      level: 'group', cwd: path, sessionId: sid, contactId: '', channel: 'qq',
      groupId: gid, scopeTypes: ['core', 'public', 'group'],
      raw: 'none',
      scopeType: 'group', scopeId: gid,
      write: { scopeType: 'group', scopeId: gid },
    }
  }
  const ext = resolveExternalContact(path)
  if (ext) {
    return {
      level: 'external', cwd: path, sessionId: sid,
      contactId: ext.scopeId, channel: ext.channel,
      scopeTypes: ['core', 'public', 'contact'],
      raw: 'own',
      scopeType: 'contact', scopeId: ext.scopeId,
      write: { scopeType: 'contact', scopeId: ext.scopeId },
    }
  }
  // 未知 cwd：最小权限，只看 core/public；不读原话
  return { level: 'unknown', cwd: path, sessionId: sid, contactId: '', channel: '', scopeTypes: ['core', 'public'], raw: 'none', scopeType: 'owner', scopeId: '', write: { scopeType: 'public', scopeId: '' } }
}

/** 是否为 owner 级的全量视图（home / 主人私聊） */
export function isScopeOwner(scope) { return scope?.level === 'owner' }

/** SQL WHERE 片段：只允许 scope 内的行。owner 全量 → 1=1（保持老行为） */
export function scopeWhere(scope, { alias = '' } = {}) {
  if (!scope || scope.level === 'owner') return { sql: '1=1', params: [] }
  const a = alias ? `${String(alias)}.` : ''
  const types = Array.isArray(scope.scopeTypes) ? scope.scopeTypes.filter((t) => SCOPE_SET.has(t)) : []
  // contact/group 必须带 scope_id 精确匹配，不能混进 IN (...)：否则群 111 会看到群 222 的 group 行
  const simple = types.filter((t) => t !== 'contact' && t !== 'group')
  const clauses = []
  const params = []
  if (simple.length) {
    clauses.push(`${a}scope_type IN (${simple.map(() => '?').join(',')})`)
    params.push(...simple)
  }
  if (types.includes('contact')) {
    if (scope.contactId) { clauses.push(`(${a}scope_type='contact' AND ${a}scope_id=?)`); params.push(String(scope.contactId)) }
  }
  if (types.includes('group')) {
    if (scope.groupId) { clauses.push(`(${a}scope_type='group' AND ${a}scope_id=?)`); params.push(String(scope.groupId)) }
  }
  if (!clauses.length) return { sql: '0=1', params: [] }
  return { sql: `(${clauses.join(' OR ')})`, params }
}

/** JS 侧最终校验（SQL 之外的第二道闸） */
export function scopeAllows(scope, row) {
  if (!scope || scope.level === 'owner') return true
  const type = String(row?.scope_type ?? '')
  if (!scope.scopeTypes?.includes(type)) return false
  if (type === 'contact') return Boolean(scope.contactId) && String(row?.scope_id ?? '') === String(scope.contactId)
  if (type === 'group') return Boolean(scope.groupId) && String(row?.scope_id ?? '') === String(scope.groupId)
  return true
}

/** 原话/档案：owner 全量；external 只看自己房间；group/unknown 不给 */
export function rawAllowsCwd(scope, cwd) {
  if (!scope) return false
  if (scope.raw === 'all') return true
  if (scope.raw !== 'own' || !scope.cwd) return false
  const p = String(cwd ?? '').replace(/\/+$/, '')
  return p === scope.cwd || p.startsWith(`${scope.cwd}/`)
}

/** 原始档案 channel 过滤（qq/home/douyin…；owner 不强制） */
export function scopeRawChannel(scope) {
  if (!scope || scope.level === 'owner') return ''
  return String(scope.channel ?? '')
}

/**
 * 越权/拒绝审计：只写一行 JSON，失败不抛。
 * @param {object} opts
 * @param {string} opts.dataDir 记忆数据目录（写 logs/scope-audit.log）
 */
export function auditScopeDenied({ dataDir = '', scope = null, tool = '', request = '', result = 'denied', extra = {} } = {}) {
  try {
    if (!dataDir) return
    const dir = join(dataDir, 'logs')
    mkdirSync(dir, { recursive: true })
    const line = JSON.stringify({
      at: new Date().toISOString(),
      level: scope?.level ?? 'unknown',
      sessionId: String(scope?.sessionId ?? '').slice(0, 80),
      cwd: String(scope?.cwd ?? '').slice(0, 200),
      tool: String(tool ?? '').slice(0, 80),
      request: String(request ?? '').slice(0, 120),
      result: String(result ?? '').slice(0, 80),
      ...extra,
    })
    appendFileSync(join(dir, 'scope-audit.log'), `${line}\n`)
  } catch {}
}
