/**
 * 主人判定（阶段 4，按 P1 §6.5）
 *
 * 目标态：**只认 `contact_bindings`**（channel + external_id → contact:owner）。
 * 兼容 fallback：binding 未命中 **且** cwd 等于 `ownerPrivateDir` 时临时按 owner 处理，每次告警；
 * fallback 不是长期规则——连续 N 天（默认 7）无 fallback 告警后应删除该分支（`shouldRetireFallback`）。
 *
 * 禁止：靠昵称、靠"私聊里非群友"、靠目录名长期判定。
 */
import { now as nowFn } from './adapter/time.js'

const FALLBACK_WARN_INTERVAL_MS = 10 * 60 * 1000

/** 从私聊 cwd 解析对方 QQ：`/root/qq-agent/QQ会话/私聊_<qq>` */
export function parsePrivateExternalId(cwd) {
  const m = String(cwd ?? '').match(/私聊_([0-9]{5,})\/?$/)
  return m ? m[1] : ''
}

/**
 * 群聊 cwd 判定式（三种真实形态）：
 *   1) 新目录：`<groupCwd>/<群号>`，默认 groupCwd = `/sdcard/DSHA/渠道/qq-群`
 *      来源：dsh-channel-bridge `lib/sessions.js`（`${cfg.groupCwd || '/sdcard/DSHA/渠道/qq-群'}/${id}`）
 *   2) 老部署：`.../QQ群/...`
 *   3) 老部署：`.../群_<群号>`（memory-core 归档侧也用 `/群_(\d+)/` 取号，见 lib/ingest/archive.js）
 * 只做字符串判断，不读盘、不引入异步。
 */
export const GROUP_CWD_PATTERN = /qq-群(\/|$)|QQ群|群_/

/** 是否群聊 cwd */
export function isGroupCwd(cwd) {
  return GROUP_CWD_PATTERN.test(String(cwd ?? ''))
}

/**
 * 受信任目录归一化：去空白、去尾斜杠、去重。
 * 容忍「只配了一个字符串」的写法（数组才是推荐形态）；其它类型一律当空。
 * @param {string[]|string} list
 * @returns {string[]}
 */
export function normalizeTrustedDirs(list) {
  const raw = Array.isArray(list) ? list : (typeof list === 'string' && list.trim() ? [list] : [])
  const out = []
  for (const item of raw) {
    const dir = String(item ?? '').trim().replace(/[/\\]+$/, '')
    if (dir && !out.includes(dir)) out.push(dir)
  }
  return out
}

/**
 * cwd 是否落在受信任目录下（前缀匹配，**按目录边界**）。
 *
 * 与 persona `sessionDirs` 同语义（命中即「她自己的会话」），但比它的裸 `startsWith` 收紧一格：
 * `/x/home` 不匹配 `/x/home2`，避免把邻居目录误判成主人房间。
 */
export function isTrustedDir(cwd, trustedDirs = []) {
  const path = String(cwd ?? '').trim().replace(/[/\\]+$/, '')
  if (!path) return false
  return normalizeTrustedDirs(trustedDirs).some((dir) => path === dir || path.startsWith(`${dir}/`))
}

/** 查 binding：返回 contactId 或 null（表不存在也返回 null） */
export function lookupOwnerBinding(db, externalId, { channel = 'qq' } = {}) {
  const ext = String(externalId ?? '').trim()
  if (!ext) return null
  try {
    const row = db.prepare('SELECT contact_id FROM contact_bindings WHERE channel=? AND external_id=? LIMIT 1').get(channel, ext)
    return row ? String(row.contact_id) : null
  } catch { return null }
}

/**
 * 判定某个会话是否主人。
 *
 * @param {string} cwd 会话 cwd
 * @param {object} opts
 * @param {object} opts.db       sqlite 连接
 * @param {object} opts.owner    resolveOwner() 的结果（含 ownerQQ / ownerPrivateDir / ok）
 * @param {object} opts.log      日志器
 * @param {function} [opts.now]  时间源（测试用）
 * @param {boolean} [opts.track=true] 是否记录 fallback 统计（默认记）
 * @param {string[]} [opts.trustedDirs=[]] 受信任目录（她自己房间：home 等），命中即按主人
 * @returns {{isOwner:boolean, via:'binding'|'fallback'|'trusted-dir'|'none', contactId:string, reason:string}}
 */
export function classifyOwner(cwd, { db, owner = {}, log, now = nowFn, track = true, trustedDirs = [] } = {}) {
  const path = String(cwd ?? '')
  const ownerDir = String(owner?.ownerPrivateDir ?? '')
  if (!path) return { isOwner: false, via: 'none', contactId: '', reason: 'no-cwd' }
  if (isGroupCwd(path)) return { isOwner: false, via: 'none', contactId: '', reason: 'group' }

  const ext = parsePrivateExternalId(path)
  const bound = ext ? lookupOwnerBinding(db, ext) : null
  if (bound && bound === 'contact:owner') {
    return { isOwner: true, via: 'binding', contactId: bound, reason: 'binding' }
  }
  if (bound) {
    // 明确绑给了别人：就算 cwd 像主人目录也不算主人，且**不走 fallback**
    return { isOwner: false, via: 'none', contactId: bound, reason: 'bound-to-other' }
  }

  // binding 未命中：仅当 cwd 命中配置的 ownerPrivateDir 时临时 fallback
  if (ownerDir && path === ownerDir) {
    if (track) noteFallback(db, { log, now })
    return { isOwner: true, via: 'fallback', contactId: 'contact:owner', reason: 'fallback-owner-dir' }
  }

  // 受信任目录（2026-11-05）：她自己的房间（如 <home>），按主人处理。
  // 放在最后一道：群（最前）与「binding 明确绑给别人」（上一段）都已提前返回，
  // 所以 trustedDirs 覆盖不到群聊、也覆盖不了明确归属别人的目录。
  if (isTrustedDir(path, trustedDirs)) {
    return { isOwner: true, via: 'trusted-dir', contactId: 'contact:owner', reason: 'trusted-dir' }
  }
  return { isOwner: false, via: 'none', contactId: '', reason: ext ? 'unbound' : 'no-external-id' }
}

/** fallback 统计落 meta（用于 7 天退出判断） */
export function noteFallback(db, { log, now = nowFn } = {}) {
  try {
    const first = db.prepare("SELECT v FROM meta WHERE k='owner_fallback_first_at'").get()
    if (!first) db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('owner_fallback_first_at',?)").run(String(now()))
    db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('owner_fallback_last_at',?)").run(String(now()))
    const cnt = Number(db.prepare("SELECT v FROM meta WHERE k='owner_fallback_count'").get()?.v ?? 0) + 1
    db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('owner_fallback_count',?)").run(String(cnt))
    const lastWarn = Number(db.prepare("SELECT v FROM meta WHERE k='owner_fallback_warned_at'").get()?.v ?? 0)
    if (!lastWarn || now() - lastWarn > FALLBACK_WARN_INTERVAL_MS) {
      db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('owner_fallback_warned_at',?)").run(String(now()))
      log?.warn?.('owner fallback：binding 未命中，按 ownerPrivateDir 临时当主人（请补 contact_bindings；连续 7 天无 fallback 后应删除该分支）')
    }
  } catch {}
  return true
}

/** fallback 状态（给 RUNBOOK/验收脚本用） */
export function ownerFallbackStatus(db, { now = nowFn, days = 7 } = {}) {
  const get = (k) => { try { return Number(db.prepare('SELECT v FROM meta WHERE k=?').get(k)?.v ?? 0) || 0 } catch { return 0 } }
  const firstAt = get('owner_fallback_first_at')
  const lastAt = get('owner_fallback_last_at')
  const count = get('owner_fallback_count')
  const daysSinceLast = lastAt ? (now() - lastAt) / 86400000 : null
  return {
    firstAt, lastAt, count,
    daysSinceLast: daysSinceLast === null ? null : Number(daysSinceLast.toFixed(2)),
    retireCandidate: Boolean(lastAt) && daysSinceLast >= days,
    thresholdDays: days,
  }
}

/** 7 天退出判据：最近一次 fallback 距今 ≥ days 且从未绑定过 → 可以删掉 fallback 分支 */
export function shouldRetireFallback(db, { now = nowFn, days = 7 } = {}) {
  return ownerFallbackStatus(db, { now, days }).retireCandidate
}
