/**
 * 副作用操作账本（2026-11-16 P0-2）
 *
 * 目的：一次「会花钱/会改外部状态」的操作（模型调用）最多执行一次，且结果可重放；
 * 结果不确定时**停在 failed_unknown 等人来判**，绝不自动重放。
 *
 * 语义表（`operations`，UNIQUE(kind, request_id)）：
 *
 * | 已有行 | digest 相同 | digest 不同 |
 * |---|---|---|
 * | 无 | 插入 running → run() → succeeded / failed_unknown | — |
 * | succeeded | 直接回缓存结果（`replayed:true`），**不再调 run()** | 冲突 `E_OPERATION_CONFLICT` |
 * | running | `E_OPERATION_RUNNING`（要求换新 id） | 冲突 |
 * | failed_unknown | `E_OPERATION_IN_DOUBT`（要求换新 id，**不重放**） | 冲突 |
 *
 * `digest = sha256(canonicalJson(payload))`，canonicalJson 递归按 key 排序。
 * 账本是账本：不存 prompt 正文（调用方自己决定 payload 里放什么，建议只放 hash/长度）。
 */
import { createHash } from 'node:crypto'

export const OP_RUNNING = 'running'
export const OP_SUCCEEDED = 'succeeded'
export const OP_FAILED_UNKNOWN = 'failed_unknown'

/** 不确定时的账单口径：可能已经扣费、且我们没重试 */
export const BILLING_UNKNOWN = Object.freeze({ billing: 'unknown', retried: false })

export const OPERATION_CODES = Object.freeze({
  CONFLICT: 'E_OPERATION_CONFLICT',
  RUNNING: 'E_OPERATION_RUNNING',
  IN_DOUBT: 'E_OPERATION_IN_DOUBT',
})

/** 递归规范化（对象按 key 排序、数组保序）；非 JSON 值按 JSON 规则降级 */
export function canonicalJson(value) {
  if (value === null || value === undefined) return 'null'
  const t = typeof value
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (t === 'boolean') return value ? 'true' : 'false'
  if (t === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`
  if (t === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
  }
  return JSON.stringify(String(value))
}

export function payloadDigest(payload) {
  return createHash('sha256').update(canonicalJson(payload ?? {})).digest('hex')
}

export function operationId(kind, requestId) {
  return `${String(kind ?? '').trim()}:${String(requestId ?? '').trim()}`
}

function safeParse(text) {
  if (text === null || text === undefined || text === '') return null
  try { return JSON.parse(String(text)) } catch { return null }
}

function safeJson(value) {
  if (value === undefined) return null
  try { return JSON.stringify(value) } catch { return JSON.stringify({ unserializable: true }) }
}

export function getOperation(db, idOrKind, requestId = '') {
  try {
    const id = requestId ? operationId(idOrKind, requestId) : String(idOrKind)
    const row = db.prepare('SELECT * FROM operations WHERE id=?').get(id)
    if (!row) return null
    return { ...row, result: safeParse(row.result_json), usage: safeParse(row.usage_json) }
  } catch { return null }
}

/**
 * 一次性副作用执行器。
 *
 * @param {object} db
 * @param {object} opts
 * @param {string} opts.kind 操作类型（如 `memory-extract`）
 * @param {string} opts.requestId 调用方给的稳定 id（同一次业务只用一个；重试必须复用）
 * @param {*} [opts.payload] 参与 digest 的内容（建议只放不可变标识，不要放正文）
 * @param {() => Promise<*>} opts.run 真正的副作用
 * @param {number} [opts.now] 测试注入时间
 * @param {(result:*) => boolean} [opts.isUncertain] 返回 true 表示结果不可判定（→ failed_unknown）
 * @returns {Promise<{ok:true,replayed:boolean,result:any,status:string,operationId:string}
 *          |{ok:false,code:string,status?:string,requireNewId?:boolean,result?:any}>}
 */
export async function withOperation(db, { kind, requestId, payload = {}, run, now = Date.now, isUncertain = null } = {}) {
  const k = String(kind ?? '').trim()
  const rid = String(requestId ?? '').trim()
  if (!k || !rid) throw new Error('withOperation：kind / requestId 必填')
  if (typeof run !== 'function') throw new Error('withOperation：run 必填')

  const id = operationId(k, rid)
  const digest = payloadDigest(payload)
  const at = Number(now) || Date.now()

  let existing = null
  try { existing = db.prepare('SELECT * FROM operations WHERE id=?').get(id) } catch { existing = null }

  if (existing) {
    if (String(existing.digest) !== digest) {
      return { ok: false, code: OPERATION_CODES.CONFLICT, status: String(existing.status), requireNewId: true }
    }
    if (String(existing.status) === OP_SUCCEEDED) {
      return { ok: true, replayed: true, result: safeParse(existing.result_json), usage: safeParse(existing.usage_json), status: OP_SUCCEEDED, operationId: id }
    }
    // running / failed_unknown：都要求换新 id，绝不自动重放
    return {
      ok: false,
      code: String(existing.status) === OP_RUNNING ? OPERATION_CODES.RUNNING : OPERATION_CODES.IN_DOUBT,
      status: String(existing.status),
      requireNewId: true,
      result: safeParse(existing.result_json),
    }
  }

  // 1) 先落 running（单条 INSERT 自动提交 → 不占着库等模型）
  db.prepare(`INSERT INTO operations(id,kind,request_id,digest,status,result_json,usage_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(id, k, rid, digest, OP_RUNNING, null, null, at, at)

  // 2) 跑副作用；抛异常 → failed_unknown（可能已扣费），再原样抛出
  let result
  try {
    result = await run()
  } catch (e) {
    try {
      db.prepare('UPDATE operations SET status=?, result_json=?, updated_at=? WHERE id=?')
        .run(OP_FAILED_UNKNOWN, JSON.stringify(BILLING_UNKNOWN), Date.now(), id)
    } catch {}
    throw e
  }

  // 3) 落结果（结果不可判定 → failed_unknown，仍然存下来便于人工核对）
  let uncertain = false
  try { uncertain = typeof isUncertain === 'function' ? Boolean(isUncertain(result)) : false } catch { uncertain = true }
  const status = uncertain ? OP_FAILED_UNKNOWN : OP_SUCCEEDED
  const usage = result && typeof result === 'object' ? (result.usage ?? null) : null
  try {
    db.prepare('UPDATE operations SET status=?, result_json=?, usage_json=?, updated_at=? WHERE id=?')
      .run(status, safeJson(result), safeJson(usage), Date.now(), id)
  } catch {}
  return { ok: true, replayed: false, result, status, operationId: id }
}

/**
 * 收尸：running 超过 timeoutMs 的一律标 failed_unknown（**绝不重放**，只等人判）。
 * @returns {{ok:true, swept:number, ids:string[]}}
 */
export function sweepStale(db, { now = Date.now(), timeoutMs = 600000 } = {}) {
  const cutoff = Number(now) - Math.max(1, Number(timeoutMs) || 600000)
  let rows = []
  try { rows = db.prepare("SELECT id FROM operations WHERE status=? AND updated_at < ?").all(OP_RUNNING, cutoff) } catch { return { ok: true, swept: 0, ids: [] } }
  if (!rows.length) return { ok: true, swept: 0, ids: [] }
  const stmt = db.prepare("UPDATE operations SET status=?, result_json=COALESCE(result_json, ?), updated_at=? WHERE id=? AND status=?")
  let swept = 0
  const ids = []
  for (const r of rows) {
    try {
      const n = Number(stmt.run(OP_FAILED_UNKNOWN, JSON.stringify(BILLING_UNKNOWN), Number(now), r.id, OP_RUNNING).changes)
      if (n > 0) { swept += n; ids.push(String(r.id)) }
    } catch {}
  }
  return { ok: true, swept, ids }
}
