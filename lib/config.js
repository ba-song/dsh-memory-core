import { join } from 'node:path'
import { readJson } from './adapter/fs.js'
import { DEFAULT_LLM_EXTRACT } from './extract/llm.js'

export const DATA_DIR = process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据'
export const CONFIG_FILE = join(DATA_DIR, 'config.json')

// cosmokit 的 volatile 引用标记（dsh-settings 的 .volatile() 字段解析后就是这种只读引用）
// 与 dsh-channel-bridge/lib/config.js 同源（照抄其实现与注释，2026-11-10）
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/** 裸 volatile 引用：没有 cosmokit Symbol，唯一自有键就是 get（手写/旧包装形态） */
function isBareVolatileRef(value) {
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === 'get'
}

/**
 * 把 schemastery `.volatile()` 解析出来的引用还原成普通 JSON 值。
 * cordis 在调用 apply 前会用插件导出的 Config schema 解析 profile 配置，
 * volatile 字段会变成 `{ get() }` 只读引用；loadConfig 是唯一配置读入口，
 * 所以先还原再清洗。对原本就是普通对象的配置零影响。
 *
 * 与 dsh-channel-bridge/lib/config.js 的实现同源（2026-11-10 照抄），另加一个窄分支：
 * 没有 cosmokit Symbol、唯一自有键为 `get` 的裸引用（手写 `{get:()=>false}` / 旧包装）也还原。
 * 只认「只有一个 key 且就叫 get」，避免把普通配置对象里的 get 字段当引用。
 */
export function unwrapVolatile(value, seen = new Set()) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function'
    && (VOLATILE_WRITE in value || isBareVolatileRef(value))) {
    return unwrapVolatile(value.get(), seen)
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return value
    seen.add(value)
    const out = value.map((item) => unwrapVolatile(item, seen))
    seen.delete(value)
    return out
  }
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return value
    if (seen.has(value)) return value
    seen.add(value)
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = unwrapVolatile(item, seen)
    seen.delete(value)
    return out
  }
  return value
}

/** 群记忆默认值（2026-11-09）：service 写入限额 / TTL 定时器 / 测试共用同一份 */
export const GROUP_MEMORY_DEFAULTS = Object.freeze({
  maxPerHour: 12,
  maxPerDay: 60,
  ttlDays: 90,
  maxChars: 600,
})

/** 数字容错：非数字回落默认，数字夹到 [min,max]（与 lib/extract/llm.js 的 num 同口径） */
export function num(v, def, min, max) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

/**
 * 命中出处上下文默认值（2026-11-15）：
 * 每个 hit 展开「锚点 + 前后各 window 条对白」（默认 5 条），每条带 想/心情；
 * maxRows/maxChars 是总预算，超限按命中相关度整窗丢弃。
 */
export const PROVENANCE_DEFAULTS = Object.freeze({
  enabled: true,
  maxHits: 2,
  window: 2,
  maxRows: 10,
  maxChars: 2000,
})

/**
 * 解析出处上下文配置（config.json 可只写部分键）：
 * 优先读 `provenance` 对象；兼容顶层 `provenanceMaxHits / provenanceWindow /
 * provenanceMaxRows / provenanceMaxChars`（任务书里的写法），非法值回落默认。
 */
export function provenanceConfig(cfg = {}) {
  const src = cfg?.provenance && typeof cfg.provenance === 'object' ? cfg.provenance : {}
  const D = PROVENANCE_DEFAULTS
  const pick = (nestedKey, topKey, def, min, max) => {
    const v = src[nestedKey] ?? (topKey ? cfg?.[topKey] : undefined)
    return v === undefined || v === null ? def : Math.floor(num(v, def, min, max))
  }
  return {
    enabled: src.enabled === undefined ? D.enabled : src.enabled !== false,
    maxHits: pick('maxHits', 'provenanceMaxHits', D.maxHits, 1, 5),
    window: pick('window', 'provenanceWindow', D.window, 1, 3),
    maxRows: pick('maxRows', 'provenanceMaxRows', D.maxRows, 5, 40),
    maxChars: Math.floor(num(
      src.maxChars ?? cfg?.provenanceMaxChars,
      D.maxChars, 600, 12000,
    )),
  }
}

/**
 * 解析群记忆配置（支持 config.json 只写部分键）。
 * 非法/缺省回落 GROUP_MEMORY_DEFAULTS；越界夹到安全区间，不抛。
 */
export function groupMemoryConfig(cfg = {}) {
  const src = cfg?.groupMemory && typeof cfg.groupMemory === 'object' ? cfg.groupMemory : {}
  const D = GROUP_MEMORY_DEFAULTS
  return {
    maxPerHour: Math.floor(num(src.maxPerHour, D.maxPerHour, 1, 10000)),
    maxPerDay: Math.floor(num(src.maxPerDay, D.maxPerDay, 1, 100000)),
    ttlDays: Math.floor(num(src.ttlDays, D.ttlDays, 1, 3650)),
    maxChars: Math.floor(num(src.maxChars, D.maxChars, 80, 2000)),
  }
}

export const DEFAULTS = {
  memoryEnabled: true,
  memoryRecordEnabled: true,
  memoryInjectEnabled: true,       // 2026-10-30 起默认注入（主人确认）
  embedEnabled: true,
  semanticGate: 0.55,
  keywordGate: 0.35,
  injectBudget: { facts: 420, memory: 400, pin: 100, shortterm: 320, shorttermItems: 5 },
  rulesInjectEnabled: true,
  rulesBudget: { maxItems: 5, maxChars: 400, itemChars: 70 },
  // 2026-11-12 P1：本轮相关命中的预算（可按需调大，默认保持 3 条/200 字）
  hitsBudget: { maxItems: 3, maxChars: 200, minScore: 0.55 },
  hitMinSemantic: 0.55,
  hitMinKeywordOverlap: 0.35,
  sessionIndexEnabled: true,
  sessionIndexMaxChars: 300,
  sessionIndexEpisodes: 3,
  sessionIndexAgreements: 2,
  // 2026-11-15：命中出处上下文（每个 hit 5 条对白 + 想/心情；只 owner 注入）。
  // 支持嵌套 provenance 或顶层 provenanceMaxHits/provenanceWindow/provenanceMaxRows/provenanceMaxChars。
  provenance: { ...PROVENANCE_DEFAULTS },
  rawTopN: 5,
  // 2026-11-12：本轮相关命中除了主人这句话，也带上她上一句（她的想法/表达也能触发记忆）
  hitSelfQuery: true,
  // 2026-11-12：每一步都跑一次命中检索（默认只第 1 步）；每轮最多注入 hitEveryStepMaxPerTurn 次
  hitEveryStep: false,
  hitEveryStepMaxPerTurn: 2,
  // 日结归纳（2026-11-12）：默认关闭 + dryRun；开之前先看一周 dry-run 结果
  consolidate: {
    enabled: false,
    dryRun: true,
    hour: 4,
    minute: 10,
    windowHours: 24,
    maxInputChars: 12000,
    maxFacts: 6,
    writeProfile: true,
    writeDiary: true,
    runOnStart: false,
  },
  // 周结（2026-11-12）：把一周 auto 事实聚成簇；默认 dry-run
  // 2026-11-13：多模态归档（图片 OCR/视频抽帧/语音 sidecar）；默认关
  multimodal: { enabled: false, intervalHours: 6, limit: 20 },
  // 2026-11-13：清晰度/遗忘（默认 dryRun；dailyHour 后每天一次）
  clarity: { enabled: false, dryRun: true, dailyHour: 4, days: 1 },
  weekly: {
    enabled: false,
    dryRun: true,
    weekday: 0,
    hour: 3,
    minute: 30,
    lookbackDays: 7,
    threshold: 0.6,
    maxClusters: 20,
  },
  // 多因子维护（2026-11-12）：默认只算不写，供脚本 dry-run 用
  maintain: {
    enabled: false,
    dryRun: true,
    intervalHours: 24,
    threshold: 0.25,
  },
  archiveDir: '/sdcard/DSHA/记忆/档案',
  // 原话归档的 cwd 白名单（2026-11-05）：默认空 = 沿用旧单值/旧前缀，行为不变。
  // 生效顺序见 resolveArchivePrefixes()；trustedDirs 会自动并入（她的房间也留原话）。
  archiveCwdPrefixes: [],
  // 2026-11-07：只用于原话归档/摄取的前缀（群/私聊/email/未来渠道）；**不并入 owner 判定**
  archiveDirs: ['/sdcard/DSHA/渠道'],
  chatlogDir: '/root/qq-agent/QQ会话',
  // 事实卡路径（2026-11-05）：空 = 沿用旧逻辑（cwd → 父目录 → ownerPrivateDir）；
  // 配了就用这一份（例：/sdcard/DSHA/记忆/数据/事实卡.md）。不回退、不迁移、不覆盖。
  factsPath: '',
  // 主人身份（D1：代码里不写死 QQ 号，只从本地配置解析）
  ownerQQ: '',
  ownerPrivateDir: '',
  // 主人邮箱（2026-11-07）：用于 person:owner 跨渠道绑定；QQ 邮箱自动由 ownerQQ 推导。
  // 2026-11-17 脱敏：默认不写死真实邮箱（空数组），需要时在本地 config.json 的 ownerEmails 里配置。
  ownerEmails: [],
  // 受信任目录（2026-11-05）：她自己房间的 cwd，命中即按主人处理（注入/写记忆/工具放行）。
  // 默认空 = 行为完全不变；前缀匹配按目录边界（见 lib/owner.js isTrustedDir）。
  trustedDirs: [],
  // dyMemory 服务：后台插件写身份白名单（契约 v1.2 §5.1）
  servicePluginWriteAllowlist: ['dsh-autonomy'],
  // P4.5 心情层（2026-11-05 起 memory 侧已退役：本组配置不再被读取，仅保留兼容旧 config.json）
  emotionEnabled: false,
  emotionScope: 'global',          // global | conversation
  emotionInjectMode: 'subtle',     // subtle | explicit | off
  emotionSubtleThreshold: 0.35,
  emotionBaseHalfLifeDays: 14,
  emotionArousalCoef: 0.5,
  // P5 本轮相关记忆
  hitsInjectEnabled: true,
  // P4 自动抽取质量闸（2026-11-05）：enabled=false 整体关；minChars=整句最短字数；
  // requireSubject=候选必须有主语；maxPerTurn=每轮最多挑几条候选（写入路径一次仍只落 1 条）
  autoExtract: { enabled: true, minChars: 8, requireSubject: true, maxPerTurn: 1 },
  // P4-L 模型兜底（2026-11-06）：规则 no-candidate 时调一次小模型抽 1 条；
  // enabled=false 整体关；dailyCap 进程内按本地自然日计（重启清零）；minChars 是触发下限。
  extract: { llm: { ...DEFAULT_LLM_EXTRACT } },
  autoSnapshot: true,
  // 2026-11-07：自动共享（方案 B，默认关）；只复制「她自己/公开类」新记忆为 public，绝不改原记忆
  autoShare: false,
  autoSharePatterns: ['近况', '兴趣', '学习', '心情', '日常', '喜欢', '在读', '在看', '学会了'],
  autoShareLlm: false,   // 每 30 分钟 VACUUM INTO 快照，保留 6 份
  // 2026-11-09 群记忆：每轮群聊写一条 group scope 的 episode。
  // 限额按 SQL 实时计数（1h/1d 窗口），TTL 记在 meta 的 group_ttl_<id>；
  // config.json 只写部分键也安全，非法值由 groupMemoryConfig() 回落默认/夹区间。
  groupMemory: { ...GROUP_MEMORY_DEFAULTS },
}
export function loadConfig(overrides = {}) {
  // Config schema 里的 .volatile() 字段被 cordis 解析成 { get() } 只读引用，先还原成普通值
  const raw = unwrapVolatile(overrides)
  const c = readJson(CONFIG_FILE, {})
  const cfg = { ...DEFAULTS, ...c, ...(raw && typeof raw === 'object' ? raw : {}) }
  if (!cfg.memoryEnabled) { cfg.memoryRecordEnabled = false; cfg.memoryInjectEnabled = false }
  return cfg
}

/**
 * 解析主人身份（D1：源码里不出现真实 QQ 号）。
 *
 * 优先级：ownerPrivateDir（`.../私聊_<qq>` 里解析出 QQ）→ ownerQQ（拼出私聊目录）。
 * 两者至少要有一个；都没有时返回 { ok:false }，调用方必须降级：
 * 不注入、不写主人记忆、不碰原话档案，只打一条启动警告，**不崩**。
 *
 * @param {object} cfg 插件配置（含 ownerQQ / ownerPrivateDir / chatlogDir）
 * @returns {{ok:boolean, ownerQQ:string, ownerPrivateDir:string, reason:string}}
 */
export function resolveOwner(cfg = {}) {
  const base = String(cfg.chatlogDir ?? DEFAULTS.chatlogDir).replace(/[/\\]+$/, '')
  let dir = String(cfg.ownerPrivateDir ?? '').trim()
  let qq = ''
  // 目录优先：能从 `.../私聊_<qq>` 解析出 QQ，就以目录为准（避免 ownerQQ 与目录打架）
  if (dir) {
    const m = dir.match(/私聊_([0-9]{5,})[/\\]?$/)
    if (m) qq = m[1]
  }
  if (!qq) qq = String(cfg.ownerQQ ?? '').trim()
  if (!dir && qq) dir = `${base}/私聊_${qq}`
  const ok = Boolean(dir)
  return {
    ok,
    ownerQQ: qq,
    ownerPrivateDir: dir,
    reason: ok ? '' : 'ownerQQ / ownerPrivateDir 均未配置',
  }
}

/** 旧的原话归档前缀（行为兼容的默认值，只在没配任何前缀时使用） */
export const LEGACY_ARCHIVE_PREFIX = '/root/qq-agent/QQ会话'

/**
 * 解析「哪些 cwd 的原话要归档」（2026-11-05）。
 *
 * 生效顺序（前面的非空即生效，避免"配了新值把旧行为弄丢"）：
 *   1. `archiveCwdPrefixes`（数组，推荐；配了就是**替换**旧单值）
 *   2. `archiveCwdPrefix`（旧的单值，兼容生产 config.json）
 *   3. 都没有 → 旧默认 `LEGACY_ARCHIVE_PREFIX`
 * 最后**总是并入** `trustedDirs`（她自己的房间也该留原话）。
 *
 * @param {object} cfg
 * @returns {string[]} 去重后的前缀列表（去尾斜杠）
 */
export function resolveArchivePrefixes(cfg = {}) {
  const norm = (v) => String(v ?? '').trim().replace(/[/\\]+$/, '')
  const out = []
  const push = (v) => { const s = norm(v); if (s && !out.includes(s)) out.push(s) }
  const list = Array.isArray(cfg.archiveCwdPrefixes) ? cfg.archiveCwdPrefixes : []
  const explicitList = list.map(norm).filter(Boolean)
  if (explicitList.length) for (const p of explicitList) push(p)
  else if (norm(cfg.archiveCwdPrefix)) push(cfg.archiveCwdPrefix)
  else push(LEGACY_ARCHIVE_PREFIX)
  for (const p of Array.isArray(cfg.archiveDirs) ? cfg.archiveDirs : []) push(p)
  for (const p of Array.isArray(cfg.trustedDirs) ? cfg.trustedDirs : []) push(p)
  return out
}
