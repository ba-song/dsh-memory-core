import { writeTx } from './db.js'
import { indexTexts, removeTexts } from './fts.js'
import { now } from '../adapter/time.js'
import { resolveQuote, QuoteMismatchError } from '../ingest/provenance.js'
import { linkMemory, unlinkMemory } from './graph.js'

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
export async function updateMemory(db, id, patch = {}, expectedRevision = null, {
  now: at = Date.now(), invalidation = '', syncDerived = false, embedFn = null,
  vectors = null, sourceText = null, relationBuilder = null,
} = {}) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) return { ok: false, code: 'E_BAD_ID', error: 'id 不合法' }
  const keys = Object.keys(patch ?? {})
  const bad = keys.filter((k) => !PATCHABLE_COLUMNS.includes(k) && k !== 'metaPatch')
  if (bad.length) return { ok: false, code: 'E_BAD_PATCH', error: `不认识的列：${bad.join(',')}` }
  let committedVector = null
  let vectorStatus = 'unchanged'
  let derived = null
  const result = await writeTx(db, async (d) => {
    const row = d.prepare('SELECT * FROM memories WHERE id=?').get(mid)
    if (!row) return { ok: false, code: 'E_NOT_FOUND', error: '没有这条记忆' }
    const cur = Number(row.revision ?? 1)
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== cur) {
      return { ok: false, code: 'E_REVISION_CONFLICT', error: 'revision 不匹配', currentRevision: cur, expectedRevision: Number(expectedRevision) }
    }
    const textChanged = Object.hasOwn(patch, 'text') && String(patch.text) !== String(row.text)
    const sync = syncDerived === true && textChanged
    const sets = []
    const vals = []
    for (const k of keys) {
      if (k === 'metaPatch' || (sync && k === 'quote')) continue
      sets.push(`${k}=?`); vals.push(patch[k])
    }
    let meta = {}
    try { meta = JSON.parse(String(row.meta ?? '{}')) || {} } catch {}
    if (patch.meta && typeof patch.meta === 'object') meta = { ...meta, ...patch.meta }
    else if (typeof patch.meta === 'string') { try { meta = { ...meta, ...JSON.parse(patch.meta) } } catch {} }
    if (patch.metaPatch && typeof patch.metaPatch === 'object') meta = { ...meta, ...patch.metaPatch }
    let quote = Object.hasOwn(patch, 'quote') ? String(patch.quote ?? '') : String(row.quote ?? '')
    if (sync && quote) {
      if (typeof sourceText === 'string') {
        const gate = resolveQuote({ quote, sourceText, text: String(patch.text), mode: 'session' })
        if (!gate || gate.ok === false) throw new QuoteMismatchError(`修订引文与来源不符，拒绝更新（${gate?.reason ?? 'invalid-source'}）`, { reason: gate?.reason ?? 'invalid-source', quote, text: patch.text })
        quote = String(gate.quote ?? quote)
      } else {
        quote = ''
        meta.provenanceReviewRequired = true
        meta.provenanceReviewReason = 'source-text-not-provided-for-revision'
      }
    }
    if (sync) {
      sets.push('quote=?'); vals.push(quote)
      meta.derivedIndexes = { ...(meta.derivedIndexes && typeof meta.derivedIndexes === 'object' ? meta.derivedIndexes : {}), vectorStatus: 'pending', entitiesStatus: 'pending', relationsStatus: 'pending' }
      sets.push('meta=?'); vals.push(JSON.stringify(meta))
    } else if (patch.metaPatch && typeof patch.metaPatch === 'object' && !keys.includes('meta')) {
      sets.push('meta=?'); vals.push(JSON.stringify(meta))
    }
    d.prepare('INSERT OR REPLACE INTO memory_revisions(memory_id,revision,previous_json,changed_at,invalidation) VALUES(?,?,?,?,?)').run(mid, cur, JSON.stringify(row), Number(at), String(invalidation))
    sets.push('revision=?'); vals.push(cur + 1)
    sets.push('updated_at=?'); vals.push(Number(at))
    d.prepare(`UPDATE memories SET ${sets.join(', ')} WHERE id=? AND revision=?`).run(...vals, mid, cur)
    if (sync) {
      const nextText = String(patch.text)
      indexTexts(d, mid, nextText)
      d.prepare('DELETE FROM vectors WHERE memory_id=?').run(mid)
      vectorStatus = 'stale'
      if (typeof embedFn === 'function') {
        const vec = await embedFn(nextText)
        if (vec != null) {
          const values = vec instanceof Float32Array ? vec : Float32Array.from(vec)
          if (!values.length || [...values].some((v) => !Number.isFinite(v))) throw new Error('E_INVALID_EMBEDDING')
          const buf = Buffer.from(values.buffer, values.byteOffset, values.byteLength)
          d.prepare('INSERT INTO vectors(memory_id,dim,vec) VALUES(?,?,?)').run(mid, values.length, buf)
          committedVector = values; vectorStatus = 'fresh'
        }
      }
      unlinkMemory(d, mid, Number(at))
      linkMemory(d, mid, nextText, Number(at))
      d.prepare('DELETE FROM relations WHERE memory_id=?').run(mid)
      let relationCount = 0
      if (typeof relationBuilder === 'function') {
        const relations = await relationBuilder(d, { memoryId: mid, text: nextText, at: Number(at) })
        for (const rel of Array.isArray(relations) ? relations : []) {
          const src = Number(rel?.src), dst = Number(rel?.dst), relation = String(rel?.relation ?? '').trim()
          if (!Number.isSafeInteger(src) || !Number.isSafeInteger(dst) || src <= 0 || dst <= 0 || src === dst || !relation) throw new Error('E_INVALID_RELATION')
          d.prepare('INSERT INTO relations(src,dst,relation,weight,memory_id,created_at) VALUES(?,?,?,?,?,?)').run(src, dst, relation, Number(rel.weight ?? 1), mid, Number(at))
          relationCount++
        }
      }
      d.prepare("UPDATE conflict_queue SET status='stale', stale_at=? WHERE status='pending' AND (memory_a=? OR memory_b=?)").run(Number(at), mid, mid)
      meta.derivedIndexes = { vectorStatus, entitiesStatus: 'fresh', relationsStatus: typeof relationBuilder === 'function' ? 'fresh' : 'invalidated-no-builder' }
      d.prepare('UPDATE memories SET meta=? WHERE id=? AND revision=?').run(JSON.stringify(meta), mid, cur + 1)
      derived = { vectorStatus, entitiesStatus: 'fresh', relationsStatus: meta.derivedIndexes.relationsStatus, relationCount, quoteValidated: Boolean(quote) }
    }
    return { ok: true, id: mid, revision: cur + 1, previousRevision: cur }
  })
  if (result?.ok && syncDerived === true && Object.hasOwn(patch, 'text')) {
    try { if (vectorStatus === 'fresh' && committedVector) vectors?.set?.(mid, committedVector); else vectors?.delete?.(mid) } catch {}
    return { ...result, derived }
  }
  return result
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
  d.prepare('DELETE FROM relations WHERE memory_id=?').run(mid)
  d.prepare('DELETE FROM memory_revisions WHERE memory_id=?').run(mid)
  d.prepare("DELETE FROM relations WHERE (memory_id>0 AND NOT EXISTS (SELECT 1 FROM memories m WHERE m.id=relations.memory_id)) OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.id=relations.src) OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.id=relations.dst)").run()
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
