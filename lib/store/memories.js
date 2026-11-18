import { writeTx } from './db.js'
import { indexTexts, removeTexts } from './fts.js'
import { now } from '../adapter/time.js'
import { resolveQuote, QuoteMismatchError } from '../ingest/provenance.js'

/** updateMemory 允许改的列（白名单；未知键一律拒绝，避免拼 SQL 注入） */
export const PATCHABLE_COLUMNS = Object.freeze([
  'kind', 'text', 'detail', 'clarity', 'importance', 'confidence', 'status', 'pinned',
  'quote', 'valid_from', 'valid_to', 'temporal_kind', 'superseded_by', 'meta',
  'scope_type', 'scope_id',
])

const round3 = (n) => Math.round(Number(n) * 1000) / 1000

/**
 * 唯一写入入口：memories + 两个 FTS 同事务
 *
 * 2026-11-16 P0-1 引文门禁：调用方传 `provenanceMode` 时才启用（既有调用方零影响）。
 * - `provenanceMode:'session'` + `sourceText`：quote 必须是原文逐字子串，否则抛 QuoteMismatchError（整条不进库）
 * - `provenanceMode:'manual'|'degraded'`：无原文 → quote=正文前 60 字、confidence*0.8、meta.provenance='degraded'
 */
export async function insertMemory(db, rec) {
  const t = Number(rec.createdAt ?? now())
  const gate = rec?.provenanceMode
    ? resolveQuote({ quote: rec?.quote, sourceText: rec?.sourceText, text: rec?.text, mode: rec.provenanceMode })
    : null
  if (gate && gate.ok === false) {
    throw new QuoteMismatchError(`引文与原文不符，拒绝写入（${gate.reason}）`, { reason: gate.reason, quote: gate.quote, text: rec?.text })
  }
  const confidence = round3(Number(rec.confidence ?? 1) * Number(gate?.confidenceFactor ?? 1))
  const meta = { ...(rec.meta && typeof rec.meta === 'object' ? rec.meta : {}) }
  if (gate?.provenance) meta.provenance = gate.provenance
  const quote = String(gate ? gate.quote : (rec.quote ?? ''))
  return writeTx(db, (d) => {
    const info = d.prepare(`INSERT INTO memories
      (kind,text,detail,clarity,importance,subject,attribute,speaker_id,conversation_scope,owner_scope,
       privacy,visibility,visibility_reason,visibility_set_by,visibility_set_at,
       source_msg_id,source_ts,source_file,extractor_version,source_channel,source_ref,confidence,layer,created_at_epoch,status,pinned,
       scope_type,scope_id,meta,quote,revision,updated_at,valid_from,valid_to,temporal_kind)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      String(rec.kind ?? 'episode'), String(rec.text ?? ''), String(rec.detail ?? ''),
      String(rec.clarity ?? 'clear'), Number(rec.importance ?? 0.5),
      String(rec.subject ?? ''), String(rec.attribute ?? ''),
      String(rec.speakerId ?? ''), String(rec.conversationScope ?? ''), String(rec.ownerScope ?? ''),
      String(rec.privacy ?? 'owner'), String(rec.visibility ?? 'owner'),
      String(rec.visibilityReason ?? ''), String(rec.visibilitySetBy ?? ''), Number(rec.visibilitySetAt ?? 0),
      String(rec.sourceMsgId ?? ''), Number(rec.sourceTs ?? 0), String(rec.sourceFile ?? ''),
      String(rec.extractorVersion ?? ''), String(rec.sourceChannel ?? ''), String(rec.sourceRef ?? ''),
      confidence, String(rec.layer ?? 'manual'),
      t, String(rec.status ?? 'active'),
      rec.pinned ? 1 : 0,
      String(rec.scopeType ?? 'owner'), String(rec.scopeId ?? ''), JSON.stringify(meta),
      quote, 1, t,
      rec.validFrom == null ? null : Number(rec.validFrom),
      rec.validTo == null ? null : Number(rec.validTo),
      String(rec.temporalKind ?? 'unknown'))
    const id = Number(info.lastInsertRowid)
    indexTexts(d, id, String(rec.text ?? ''))
    return id
  })
}

/**
 * 修订写入（2026-11-16 P0-3）：乐观锁 CAS
 *
 * - `expectedRevision` 与实际 `revision` 不符 → 返回 `{ok:false, code:'E_REVISION_CONFLICT'}`，**不写**
 * - 写前把「改之前的整行 JSON」存进 `memory_revisions(memory_id, revision)`，然后 revision+1、updated_at=now
 * - 只改白名单列；`metaPatch` 与旧 meta 浅合并（不清掉既有键）
 *
 * @returns {{ok:true,id:number,revision:number,previousRevision:number}
 *          |{ok:false,code:string,error:string,currentRevision?:number}}
 */
export async function updateMemory(db, id, patch = {}, expectedRevision = null, { now: at = Date.now(), invalidation = '' } = {}) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) return { ok: false, code: 'E_BAD_ID', error: 'id 不合法' }
  const keys = Object.keys(patch ?? {})
  const bad = keys.filter((k) => !PATCHABLE_COLUMNS.includes(k) && k !== 'metaPatch')
  if (bad.length) return { ok: false, code: 'E_BAD_PATCH', error: `不认识的列：${bad.join(',')}` }

  return writeTx(db, (d) => {
    const row = d.prepare('SELECT * FROM memories WHERE id=?').get(mid)
    if (!row) return { ok: false, code: 'E_NOT_FOUND', error: '没有这条记忆' }
    const cur = Number(row.revision ?? 1)
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== cur) {
      return { ok: false, code: 'E_REVISION_CONFLICT', error: 'revision 不匹配', currentRevision: cur, expectedRevision: Number(expectedRevision) }
    }
    const sets = []
    const vals = []
    for (const k of keys) {
      if (k === 'metaPatch') continue
      sets.push(`${k}=?`)
      vals.push(patch[k])
    }
    if (patch.metaPatch && typeof patch.metaPatch === 'object') {
      let prev = {}
      try { prev = JSON.parse(row.meta || '{}') || {} } catch { prev = {} }
      if (!keys.includes('meta')) { sets.push('meta=?'); vals.push(JSON.stringify({ ...prev, ...patch.metaPatch })) }
    }
    d.prepare('INSERT OR REPLACE INTO memory_revisions(memory_id,revision,previous_json,changed_at,invalidation) VALUES(?,?,?,?,?)')
      .run(mid, cur, JSON.stringify(row), Number(at), String(invalidation))
    sets.push('revision=?'); vals.push(cur + 1)
    sets.push('updated_at=?'); vals.push(Number(at))
    const textChanged = Object.hasOwn(patch, 'text') && String(patch.text) !== String(row.text)
    d.prepare(`UPDATE memories SET ${sets.join(', ')} WHERE id=?`).run(...vals, mid)
    if (textChanged) indexTexts(d, mid, String(patch.text))
    return { ok: true, id: mid, revision: cur + 1, previousRevision: cur }
  })
}

/** 修订历史（新→旧）；只回 revision/时间/失效原因，不回旧正文（正文用 getRevision 取） */
export function listRevisions(db, id, { limit = 20 } = {}) {
  try {
    return db.prepare('SELECT memory_id,revision,changed_at,invalidation FROM memory_revisions WHERE memory_id=? ORDER BY revision DESC LIMIT ?')
      .all(Number(id), Math.max(1, Number(limit) || 20))
  } catch { return [] }
}

/** 取某一版的历史正文 */
export function getRevision(db, id, revision) {
  try {
    const row = db.prepare('SELECT previous_json FROM memory_revisions WHERE memory_id=? AND revision=?').get(Number(id), Number(revision))
    if (!row) return null
    return JSON.parse(row.previous_json)
  } catch { return null }
}

/** 在调用方现有事务内删除记忆及其派生索引；不启动嵌套事务。 */
export function deleteRowsInTx(d, id) {
  const mid = Number(id)
  d.prepare('DELETE FROM memories WHERE id=?').run(mid)
  removeTexts(d, mid)
  d.prepare('DELETE FROM memory_entities WHERE memory_id=?').run(mid)
  d.prepare('DELETE FROM vectors WHERE memory_id=?').run(mid)
  // 仅将仍 pending 的关联队列标 stale；已 resolved 的历史队列不回退。
  d.prepare("UPDATE conflict_queue SET status='stale' WHERE status='pending' AND (memory_a=? OR memory_b=?)").run(mid, mid)
  return true
}

/** 唯一删除入口：跨表一起删（memories / fts / 实体关联 / 冲突引用） */
export async function deleteMemory(db, id) {
  return writeTx(db, (d) => deleteRowsInTx(d, id))
}

export function getMemory(db, id) {
  return db.prepare('SELECT * FROM memories WHERE id=?').get(id)
}

export async function saveVector(db, id, vec) {
  const buf = Buffer.from(new Float32Array(vec).buffer)
  return writeTx(db, (d) => {
    d.prepare('INSERT OR REPLACE INTO vectors(memory_id,dim,vec) VALUES(?,?,?)').run(id, vec.length, buf)
  })
}

export function loadVectors(db) {
  const rows = db.prepare('SELECT memory_id, dim, vec FROM vectors').all()
  const map = new Map()
  for (const r of rows) {
    const f = new Float32Array(r.vec.buffer, r.vec.byteOffset, r.vec.byteLength / 4)
    map.set(Number(r.memory_id), f)
  }
  return map
}
