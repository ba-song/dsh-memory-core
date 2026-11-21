/**
 * 统一有效性谓词（2026-11-21，MEM-VALIDITY-R5-01 / MEM-VALIDITY-IMPL-01）
 *
 * 背景：仓库曾有四种互不等价的「记忆是否有效」写法（仅 status / 状态+时间窗 /
 * 状态+替代+时间窗 / 严格 as-of），导致当前召回能看到的行与 P4 邻居看到的行不一致。
 * 本模块是**唯一谓词来源**：SQL 片段与参数由同一函数一起返回，调用方不得自行拼装。
 *
 * 两个正交维度：
 *   时间维度  current        以「现在」为判定点
 *             asof           以历史时刻 `at` 为判定点
 *   替代维度  enforce        已标记被替代 → 一律不参与（当前状态优先）
 *             ignore         不读 superseded_by：历史有效性只由 valid_to 表达
 *             guard          按 superseded_by 排除，但保留「有 valid_to 的历史事实」
 *
 * 预设（见 VALIDITY_PRESETS）：
 *   current        当前偏好注入 / 当前召回 / 图臂 / 会话索引
 *   asOfHistory    历史回忆（dy_memory_asof）；近似起点 + 保护历史事实
 *   asOfNeighbor   P4 邻居：as-of 时间基准 + 强制排除已替代（保守邻居语义）
 *   asOfStrict     不允许 valid_from 近似；缺失即 uncertain，不伪装确定
 *
 * 语义要点（不得混淆）：
 *   - `superseded_by` 是**当前**的接班指针，不是历史事实；历史有效性必须由 `valid_to` 表达。
 *     因此 as-of 视图不得因 superseded 而抹掉「T1 有效、T2 被替代」的历史。
 *   - `status='active'` 是当前管理状态；as-of 只用它排除**从未成立**的状态
 *     （pending 未裁决、merged 是重复落库产物），其余状态都可能是历史事实。
 *   - `superseded_by` 已设置但 `valid_to IS NULL` 是**数据不一致**：不猜。
 *     guard 语义把它挡在权威结果之外，并可通过 `uncertaintySql()` 单独取出标记 uncertain。
 */

/** 允许的调用方 alias（表别名前缀）。只允许普通标识符，防止 SQL 片段注入。 */
const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/

/** 预设：mode + 替代策略 + 是否允许 valid_from 近似 */
export const VALIDITY_PRESETS = Object.freeze({
  current: Object.freeze({ mode: 'current', superseded: 'enforce', approximateFrom: false }),
  asOfHistory: Object.freeze({ mode: 'asof', superseded: 'guard', approximateFrom: true }),
  asOfNeighbor: Object.freeze({ mode: 'asof', superseded: 'enforce', approximateFrom: true }),
  asOfStrict: Object.freeze({ mode: 'asof', superseded: 'guard', approximateFrom: false }),
})

export const VALIDITY_MODES = Object.freeze(['current', 'asof'])
export const SUPERSEDED_POLICIES = Object.freeze(['enforce', 'ignore', 'guard'])

/** 错误码：调用方按 code 判断，不要匹配 message 文本。 */
export class ValidityError extends Error {
  constructor(code, message, detail = null) {
    super(message)
    this.name = 'ValidityError'
    this.code = code
    if (detail) this.detail = detail
  }
}

/** 时间基准必须是有限的、正数毫秒时间戳。0 / null / NaN / Infinity / 字符串都被拒绝。 */
export function assertEpochMs(value, name = 'at') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ValidityError(
      'E_BAD_TIMESTAMP',
      `${name} 必须是有限正整数毫秒时间戳（收到 ${describe(value)}）`,
      { name, value: typeof value === 'number' ? value : String(value) },
    )
  }
  return value
}

/**
 * 解析 P4 的 `sourceTs`：
 *   - `undefined`（未提供）→ 保留旧行为，取当前时间；
 *   - 其他值必须是有限正数（或纯数字字符串），否则**明确拒绝**，绝不 `Number(null)` 成 0。
 * @returns {{ok:true, value:number} | {ok:false, code:string, reason:string, input:string}}
 */
export function resolveSourceTs(value, { now = Date.now } = {}) {
  if (value === undefined) return { ok: true, value: Number(now()) }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, code: 'E_BAD_SOURCE_TS', reason: 'invalid-source-ts', input: String(value) }
    }
    return { ok: true, value }
  }
  if (typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value.trim())) {
    const n = Number(value.trim())
    if (Number.isFinite(n) && n > 0) return { ok: true, value: n }
  }
  return {
    ok: false,
    code: 'E_BAD_SOURCE_TS',
    reason: 'invalid-source-ts',
    input: typeof value === 'string' ? value.slice(0, 32) : describe(value),
  }
}

function describe(value) {
  if (value === null) return 'null'
  if (typeof value === 'number') return Number.isNaN(value) ? 'NaN' : String(value)
  if (typeof value === 'string') return `'${value.slice(0, 32)}'`
  return typeof value
}

function aliasOf(alias) {
  if (alias === undefined || alias === null || alias === '') return ''
  if (typeof alias !== 'string' || !ALIAS_RE.test(alias)) {
    throw new ValidityError('E_BAD_ALIAS', `alias 必须是普通标识符（收到 ${describe(alias)}）`, { alias })
  }
  return `${alias}.`
}

function resolveSpec({ preset, mode, superseded, approximateFrom }) {
  if (preset !== undefined && preset !== null) {
    const spec = Object.hasOwn(VALIDITY_PRESETS, String(preset)) ? VALIDITY_PRESETS[String(preset)] : null
    if (!spec) throw new ValidityError('E_BAD_PRESET', `未知预设：${String(preset)}`, { preset: String(preset) })
    if (mode !== undefined || superseded !== undefined || approximateFrom !== undefined) {
      throw new ValidityError('E_BAD_SPEC', 'preset 与 mode/superseded/approximateFrom 不能同时传入')
    }
    return spec
  }
  const m = mode === undefined ? 'current' : String(mode)
  if (!VALIDITY_MODES.includes(m)) throw new ValidityError('E_BAD_MODE', `未知 mode：${m}`, { mode: m })
  const s = superseded === undefined ? (m === 'current' ? 'enforce' : 'ignore') : String(superseded)
  if (!SUPERSEDED_POLICIES.includes(s)) {
    throw new ValidityError('E_BAD_POLICY', `未知 superseded 策略：${s}`, { superseded: s })
  }
  const approx = approximateFrom === undefined ? m === 'asof' : approximateFrom === true
  return { mode: m, superseded: s, approximateFrom: approx }
}

/**
 * 状态域片段（与时间/替代维度正交，单独导出是为了让「不确定性」查询复用同一状态集合）。
 *   current → status='active'
 *   asof    → status NOT IN ('pending','merged')   （排除从未成立的状态）
 * @returns {{sql:string, params:number[]}}
 */
export function validityDomainSql({ preset = 'current', alias = '' } = {}) {
  return domainFor(resolveSpec({ preset }), aliasOf(alias))
}

/** 内部：按已解析的 spec 生成状态域（供 validitySql / validityDomainSql 共用） */
function domainFor(spec, a) {
  return {
    sql: spec.mode === 'current' ? `${a}status='active'` : `${a}status NOT IN ('pending','merged')`,
    params: [],
  }
}

/**
 * 生成有效性 SQL 片段（不含前导/尾随 AND，调用方自行拼接）。
 *
 * 参数顺序固定为 `[at, at]`：先「时间起点」后「时间终点」。
 * 两个占位符绑定同一个 `at`，但顺序由构造顺序固定，并由 tests/validity.test.mjs 断言。
 *
 * @param {object} opts
 * @param {number} opts.at 判定时刻（epoch ms，必须为正有限数）
 * @param {string} [opts.preset] VALIDITY_PRESETS 的键
 * @param {'current'|'asof'} [opts.mode]
 * @param {'enforce'|'ignore'|'guard'} [opts.superseded]
 * @param {boolean} [opts.approximateFrom] as-of 起点是否用 COALESCE(valid_from, created_at_epoch)
 * @param {string} [opts.alias] 表别名（普通标识符）
 * @returns {{sql:string, params:number[], mode:string, superseded:string, approximateFrom:boolean}}
 */
export function validitySql({ at, preset, mode, superseded, approximateFrom, alias = '' } = {}) {
  const spec = resolveSpec({ preset, mode, superseded, approximateFrom })
  const t = assertEpochMs(at, 'at')
  const a = aliasOf(alias)

  const validFrom = `${a}valid_from`
  const validTo = `${a}valid_to`
  const created = `${a}created_at_epoch`
  const sup = `${a}superseded_by`
  const supEmpty = `(${sup} IS NULL OR ${sup}=0 OR ${sup}='')`
  const validToClause = `(${validTo} IS NULL OR ${validTo}>?)`

  if (spec.mode === 'current') {
    // current 恒为 enforce：当前代表已被接班，就不再是当前事实。
    // 显式传入 ignore/guard 属于误用（当前视图不能忽略接班指针），直接拒绝而不是静默改写。
    if (spec.superseded !== 'enforce') {
      throw new ValidityError('E_BAD_SPEC', `current 模式只支持 superseded='enforce'（收到 ${spec.superseded}）`)
    }
    const sql = [
      domainFor(spec, a).sql,
      `(${validFrom} IS NULL OR ${validFrom}<=?)`,
      validToClause,
      supEmpty,
    ].join(' AND ')
    return { sql, params: [t, t], mode: 'current', superseded: 'enforce', approximateFrom: false }
  }

  const fromClause = spec.approximateFrom
    ? `COALESCE(${validFrom}, ${created})<=?`
    : `(${validFrom} IS NOT NULL AND ${validFrom}<=?)`
  const parts = [
    domainFor(spec, a).sql,
    fromClause,
    validToClause,
  ]
  if (spec.superseded === 'enforce') parts.push(supEmpty)
  // guard：有 valid_to 的「已替代」仍算历史事实；没有 valid_to 的拒绝（交给 uncertain）。
  else if (spec.superseded === 'guard') parts.push(`(${supEmpty} OR ${validTo} IS NOT NULL)`)

  return {
    sql: parts.join(' AND '),
    params: [t, t],
    mode: 'asof',
    superseded: spec.superseded,
    approximateFrom: spec.approximateFrom === true,
  }
}

/**
 * 「被预设排除、但必须标记为 uncertain」的行条件（只读审计/结果标注用）。
 *
 * 与 `validitySql()` 配套：权威结果 = validitySql；这些行单独取出并带 reason。
 * 返回的 SQL 不含占位符（params 恒为空数组），调用方可与 validitySql 用 AND NOT 组合。
 *
 * @param {object} opts
 * @param {string} [opts.preset] 默认 asOfHistory
 * @param {string} [opts.alias]
 * @returns {{sql:string, params:number[], reasons:string[]}}
 */
export function uncertaintySql({ preset = 'asOfHistory', alias = '' } = {}) {
  const spec = resolveSpec({ preset })
  const a = aliasOf(alias)
  const sup = `${a}superseded_by`
  const validTo = `${a}valid_to`
  const validFrom = `${a}valid_from`
  const supSet = `NOT (${sup} IS NULL OR ${sup}=0 OR ${sup}='')`

  const clauses = []
  const reasons = []
  // superseded 已设置但没有结束时间 → 无法判定它在 at 时是否有效（current / asof 都算不一致）
  clauses.push(`(${supSet} AND ${validTo} IS NULL)`)
  reasons.push('superseded-without-end')
  if (spec.mode === 'asof' && spec.approximateFrom === false) {
    // 严格模式：没有 valid_from 就没有确定起点
    clauses.push(`${validFrom} IS NULL`)
    reasons.push('missing-valid-from')
  }
  return { sql: clauses.join(' OR '), params: [], reasons }
}

/**
 * JS 镜像判定（与 validitySql 语义逐条对应），供需要在内存里判断单行的调用方使用
 * （例如 event-chain 的 seed/候选复核）。**SQL 仍是权威**；两者一致性由测试矩阵保证。
 *
 * @param {object} row memories 行（或含同名字段的对象）
 * @param {number} at 判定时刻
 * @param {string} preset 预设名
 * @returns {boolean}
 */
export function isValidAt(row, at, preset = 'current') {
  const spec = presetOf(preset)
  const t = assertEpochMs(at, 'at')
  const status = row?.status == null ? null : String(row.status)
  if (status === null) return false
  const vf = row?.valid_from == null ? null : Number(row.valid_from)
  const vt = row?.valid_to == null ? null : Number(row.valid_to)
  const ca = row?.created_at_epoch == null ? null : Number(row.created_at_epoch)
  const sup = row?.superseded_by
  const supEmpty = sup == null || sup === '' || Number(sup) === 0

  if (spec.mode === 'current') {
    if (status !== 'active') return false
    if (!(vf == null || vf <= t)) return false
    if (!(vt == null || vt > t)) return false
    return supEmpty
  }

  if (status === 'pending' || status === 'merged') return false
  const from = spec.approximateFrom ? (vf ?? ca) : vf
  if (from == null || !(from <= t)) return false
  if (!(vt == null || vt > t)) return false
  if (spec.superseded === 'enforce') return supEmpty
  if (spec.superseded === 'guard') return supEmpty || vt != null
  return true
}

/** 供测试与调用方自检：返回预设的规范化定义（副本）。 */
export function presetOf(name) {
  if (!Object.hasOwn(VALIDITY_PRESETS, String(name))) {
    throw new ValidityError('E_BAD_PRESET', `未知预设：${String(name)}`, { preset: String(name) })
  }
  return { ...VALIDITY_PRESETS[String(name)] }
}
