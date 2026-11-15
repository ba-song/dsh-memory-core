/**
 * 常驻注入块：事实卡 + 便签 + 人物卡（低频、稳定，走 systemPrompt.context）
 * 预算按字符近似 token：事实卡 ≤300、便签 ≤100。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pickRemembered } from './remembered.js'

function readFirst(cands) {
  for (const p of cands) { try { if (existsSync(p)) return { path: p, text: readFileSync(p, 'utf8') } } catch {} }
  return null
}

/**
 * 事实卡候选路径。
 * - 配了 `factsPath` → **只认这一份**（配置优先，不回退；路径不存在时返回它，readFirst 会读不到 → 空块）
 * - 没配 → 旧逻辑：`<cwd>/事实卡.md` → `<父目录>/事实卡.md` → `<ownerDir>/事实卡.md`
 */
export function factsPathFor(cwd, ownerDir = '', factsPath = '') {
  const explicit = String(factsPath ?? '').trim()
  if (explicit) return [explicit]
  const cands = []
  const dir = String(cwd ?? '').trim()
  if (dir) cands.push(join(dir, '事实卡.md'), join(dirname(dir), '事实卡.md'))
  // 兜底：主人私聊的事实卡（目录来自本地配置，不写死 QQ 号）
  const owner = String(ownerDir ?? '').trim()
  if (owner) cands.push(join(owner, '事实卡.md'))
  return cands
}

/**
 * 占位符防护（2026-11-05）：含 `{{` 的行整行丢弃。
 *
 * 背景：宿主 `dsh-system-prompt` 的 context 默认会插值，遇到未注册变量（如 `{{display_name}}`）
 * 会 `throw unknown prompt variable`，整个回合失败（11-02 01:51 已发生过一次）。
 * 第一道是 `systemPrompt.context({interpolate:false})`（index.js），这是第二道：
 * 用户可编辑文本（事实卡/便签/记得的事）里任何 `{{…}}` 都不许进 prompt。
 * 只回传「丢了几个 + 占位符样例（≤40 字）」，**不碰正文**。
 *
 * @param {string[]} lines
 * @param {{onDrop?: (d:{dropped:number, samples:string[]}) => void}} [opts]
 * @returns {{lines:string[], dropped:number, samples:string[]}}
 */
/** 已知可解析的占位符（只有这些会渲染，其余一律当未知丢弃） */
export const KNOWN_PLACEHOLDERS = Object.freeze({ display_name: 'display_name' })

/**
 * 先渲染、再丢弃（2026-11-05 B-1b）。
 *
 * - 已知占位符 `{{display_name}}`：有 displayName 就替换成真名（`名字：汐`）；
 *   取不到（persona 未就绪/空）就保留原样 → 落到下一道「含 {{ 就丢」。
 * - 未知占位符（`{{foo}}`、裸 `{{`）：不猜，整行丢。
 * - 只回传「丢了几个 + 占位符样例（≤40 字）」，**不碰正文**。
 *
 * @param {string[]} lines
 * @param {{onDrop?: Function, displayName?: string}} [opts]
 */
export function scrubLines(lines, { onDrop = null, displayName = '' } = {}) {
  const kept = []
  const samples = []
  const dn = String(displayName ?? '').trim()
  let dropped = 0
  for (const raw of lines ?? []) {
    const orig = String(raw ?? '')
    let line = orig
    if (dn && line.includes('{{')) line = line.replace(/\{\{\s*display_name\s*\}\}/g, dn)
    if (!line.includes('{{')) { kept.push(line); continue }
    dropped += 1
    if (samples.length < 3) {
      const m = orig.match(/\{\{[^}]{0,40}\}\}?|\{\{/)
      if (m) samples.push(m[0].slice(0, 40))
    }
  }
  if (dropped && typeof onDrop === 'function') {
    try { onDrop({ dropped, samples }) } catch {}
  }
  return { lines: kept, dropped, samples }
}

/**
 * 取「`## 全局`」+ 本会话那一节（事实卡标准格式，2026-11-05）
 *
 * 标准格式（11-02《事实卡分节》，见 `部分报告-事实卡格式.md`）：
 *   # 事实卡
 *   ## 全局                      ← 所有会话都能看到
 *   - …
 *   ## 会话 私聊 主人(<QQ>)      ← 只有这个 QQ / 这个 label 的会话能看到
 *   - …
 *
 * 规则：
 * - `## 全局`：一律可见（旧实现会把这一节当「别人的」丢掉，是本次修的 bug）
 * - 其它 `##`：标题里出现 `(<ownerQQ>)`（或纯 ownerQQ）或 `label` 才可见；不再用 `/私聊/` 通配（那会把别人的私聊节也带出来）
 * - 没有 `##` 的扁平卡：整张取（兼容旧卡；等价于全员可见，写卡的人自负）
 * - `#` / `>` / 空行：跳过
 */
export function pickFacts(text, { ownerQQ = '', label = '', isOwner = false, isGroup = false } = {}) {
  const lines = String(text ?? '').split('\n')
  const out = []
  let mode = 'all'                     // 扁平卡 = 全取（旧行为；见报告：等于全员可见）
  const me = String(ownerQQ ?? '').trim()
  const lab = String(label ?? '').trim()
  const owner = isOwner === true       // 2026-11-05 P0：只有主人/可信会话才允许非「全局」节；未传 = false（fail-closed）
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      const title = line.replace(/^##\s+/, '').trim()
      if (title === '全局') { mode = 'mine'; continue }
      if (title === '主人') { mode = isOwner ? 'mine' : 'other'; continue }
      if (title === '群') { mode = isGroup ? 'mine' : 'other'; continue }
      if (title === '人') { mode = 'other'; continue }   // 「人」节预留（以后按联系人取），当前不自动注入
      if (!owner) { mode = 'other'; continue }
      // 有 ownerQQ：按 QQ 精确匹配（label 可额外命中）；没有 ownerQQ 时，把「私聊…主人」视为主人节
      const byQQ = me ? (title.includes(`(${me})`) || title.includes(me)) : (/私聊/.test(title) && /主人/.test(title))
      const hit = byQQ || (lab && title.includes(lab))
      mode = hit ? 'mine' : 'other'
      continue
    }
    if (mode === 'other') continue
    if (/^>/.test(line) || /^#\s/.test(line)) continue
    if (!line.trim()) continue
    out.push(line.trim())
  }
  return out
}

/**
 * 便签（话头）只取**未完成**项，且取**最近** maxLines 条（2026-11-05 B-1b）。
 * 话头是追加写的：文件越靠后越新，所以取尾部而不是头部（旧实现会注入早已 `[x]` 的旧项）。
 */
export function pickPin(text, maxLines = 5) {
  const n = Math.max(1, Number(maxLines) || 5)
  const todo = String(text ?? '').split('\n').map((l) => l.trim()).filter((l) => /^- \[ \]/.test(l))
  return todo.slice(-n)
}

function clip(lines, budgetChars) {
  const out = []
  let used = 0
  for (const l of lines) {
    if (used + l.length + 1 > budgetChars) break
    out.push(l); used += l.length + 1
  }
  return { out, dropped: lines.length - out.length }
}

/**
 * 生成常驻块；返回 '' 表示这轮没有可注入内容。
 *
 * @param {string} cwd
 * @param {object} [opts]
 * @param {string} [opts.factsPath] 事实卡显式路径（空 = 旧逻辑）
 * @param {function} [opts.onDrop]  占位符清洗回调（{dropped, samples}，不含正文）
 */
export function buildStable(cwd, { budget = { facts: 420, pin: 100 }, label = '', db = null, ownerDir = '', ownerQQ = '', factsPath = '', displayName = '', isOwner = false, isGroup = false, scope = null, onDrop = null } = {}) {
  const ownerVisible = scope ? scope.level === 'owner' : isOwner
  const groupVisible = scope ? scope.level === 'group' : isGroup
  const f = readFirst(factsPathFor(cwd, ownerDir, factsPath))
  const pinFile = readFirst([join(cwd, '话头.md'), join(dirname(cwd), '话头.md')])
  const parts = []
  if (f) {
    const scrub = scrubLines(pickFacts(f.text, { label, ownerQQ, isOwner: ownerVisible, isGroup: groupVisible }), { onDrop, displayName })
    const r = clip(scrub.lines, budget.facts)
    if (r.out.length) {
      parts.push('【记忆·事实卡（必须遵守）】', ...r.out)
      if (r.dropped > 0) parts.push(`（事实卡还有 ${r.dropped} 条没注入，超预算了）`)
      parts.push('【事实卡结束】')
    }
  }
  // 2026-11-12 P0：短期记忆层（最近 3 天还要用的约定/待办/状态），独立于长期记忆
  if (db && ownerVisible) {
    try {
      const rows = db.prepare(
        "SELECT kind,content,context,importance,at FROM shortterm WHERE expires_at>? ORDER BY importance DESC, at DESC LIMIT ?",
      ).all(Date.now(), Number(budget.shorttermItems ?? 5))
      const lines = []
      for (const r of rows) {
        const t = String(r.content ?? '').replace(/\s+/g, ' ').trim()
        if (!t) continue
        const ctx = String(r.context ?? '').trim()
        lines.push(`- [${r.kind}] ${t}${ctx ? `（${ctx}）` : ''}`)
      }
      const r = clip(lines, Number(budget.shortterm ?? 320))
      if (r.out.length) parts.push('【记忆·最近三天（短期）】', ...r.out, '【最近三天结束】')
    } catch {}
  }
  if (pinFile) {
    const scrub = scrubLines(pickPin(pinFile.text), { onDrop, displayName })
    const r2 = clip(scrub.lines, budget.pin)
    if (r2.out.length) parts.push('【记忆·便签（还没接上的话头）】', ...r2.out, '【便签结束】')
  }
  // 群记忆：本群最近的几条 episode（不进 pickRemembered —— 它只收 preference/relation/skill）。
  // 只在群会话注入，别的群看不到；预算 240 字，单条 80 字。
  if (db && scope?.level === 'group' && scope.groupId) {
    try {
      const rows = db.prepare(
        "SELECT text FROM memories WHERE status='active' AND scope_type='group' AND scope_id=? ORDER BY id DESC LIMIT 3",
      ).all(String(scope.groupId))
      const lines = []
      for (const r of rows) {
        const t = String(r.text ?? '').replace(/\s+/g, ' ').trim()
        if (!t) continue
        lines.push(`- ${t.length > 80 ? `${t.slice(0, 80)}…` : t}`)
      }
      const g = clip(lines, 240)
      if (g.out.length) parts.push('【这个群最近的事】', ...g.out, '【这个群的事结束】')
    } catch {}
  }
  if (db) {
    try {
      const r3 = pickRemembered(db, { stableText: parts.join('\n'), scope })
      if (r3.block) {
        const scrub = scrubLines(String(r3.block).split('\n'), { onDrop, displayName })
        if (scrub.lines.join('').trim()) parts.push(scrub.lines.join('\n'))
      }
    } catch {}
  }
  // 最后一道兜底：无论前面哪一段漏了，含 {{ 的行都不许出这个函数（不再回调，避免重复记日志）
  return scrubLines(parts, { displayName }).lines.join('\n')
}
