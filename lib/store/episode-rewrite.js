import { updateMemory } from './memories.js'
import { removeTexts } from './fts.js'

const totalChanges = (db) => Number(db.prepare('SELECT total_changes() AS n').get().n)
const parseJson = (v, fallback) => { try { return JSON.parse(String(v ?? '')) ?? fallback } catch { return fallback } }
const tokens = (s, re) => [...String(s ?? '').matchAll(re)].map((m) => m[0])
const dateTokens = (s) => tokens(s, /(?:20\d{2}[-年/]\d{1,2}(?:[-月/]\d{1,2}日?)?|今天|昨天|前天|明天|上周|下周|去年|今年)/g)
const numberTokens = (s) => tokens(s, /\d+(?:\.\d+)?/g)

function requireEpisode(db, id) {
  const row = db.prepare('SELECT * FROM memories WHERE id=?').get(Number(id))
  if (!row) throw new Error('E_NOT_FOUND')
  if (String(row.kind) !== 'episode' || String(row.status) !== 'active') throw new Error('E_NOT_ACTIVE_EPISODE')
  return row
}

export function previewEpisodeRewrite(db, { id, proposedText, injectBudgetChars = 400 } = {}) {
  const before = totalChanges(db)
  const row = requireEpisode(db, id)
  const next = String(proposedText ?? '').trim()
  if (!next) throw new Error('E_EMPTY_PROPOSED_TEXT')
  const currentEntities = new Set(tokens(row.text, /(?:主人|饲养员|汐|豆包|千问|通义|抖音|QQ|GitHub|DeepSeek|DSH|微信)/g))
  const proposedEntities = new Set(tokens(next, /(?:主人|饲养员|汐|豆包|千问|通义|抖音|QQ|GitHub|DeepSeek|DSH|微信)/g))
  const currentNumbers = new Set(numberTokens(row.text))
  const proposedNumbers = new Set(numberTokens(next))
  const currentDates = new Set(dateTokens(row.text))
  const proposedDates = new Set(dateTokens(next))
  const result = {
    ok: true, id: Number(row.id), revision: Number(row.revision ?? 1), kind: row.kind, status: row.status,
    lengths: { current: [...String(row.text)].length, proposed: [...next].length, delta: [...next].length - [...String(row.text)].length },
    facts: {
      entitiesAdded: [...proposedEntities].filter((x) => !currentEntities.has(x)),
      entitiesRemoved: [...currentEntities].filter((x) => !proposedEntities.has(x)),
      numbersAdded: [...proposedNumbers].filter((x) => !currentNumbers.has(x)),
      numbersRemoved: [...currentNumbers].filter((x) => !proposedNumbers.has(x)),
    },
    time: { current: [...currentDates], proposed: [...proposedDates], changed: JSON.stringify([...currentDates]) !== JSON.stringify([...proposedDates]) },
    subject: { stored: String(row.subject ?? ''), proposedEntities: [...proposedEntities] },
    quote: { exists: Boolean(row.quote), length: String(row.quote ?? '').length, sourceValidation: row.quote ? 'requires-source-review-at-apply' : 'none' },
    injectionImpact: {
      currentEligible: row.status === 'active' && row.scope_type === 'owner',
      proposedLength: [...next].length,
      likelyOverMemoryBudget: [...next].length > Math.max(1, Number(injectBudgetChars) || 400),
      statusAndScopeUnchanged: true,
    },
  }
  const after = totalChanges(db)
  if (after !== before) throw new Error('E_PREVIEW_SIDE_EFFECT')
  return { ...result, totalChangesBefore: before, totalChangesAfter: after, sideEffectFree: true }
}

function captureSnapshot(db, row, { now = Date.now(), reason = 'owner-approved-rewrite' } = {}) {
  const vector = db.prepare('SELECT dim,vec FROM vectors WHERE memory_id=?').get(Number(row.id))
  const entities = db.prepare(`SELECT me.entity_id,me.weight,e.name,e.type,e.aliases
    FROM memory_entities me JOIN entities e ON e.id=me.entity_id WHERE me.memory_id=? ORDER BY me.entity_id`).all(Number(row.id))
  const relations = db.prepare('SELECT src,dst,relation,weight,memory_id,created_at FROM relations WHERE memory_id=? ORDER BY src,dst,relation').all(Number(row.id))
  const bigram = db.prepare('SELECT text FROM fts_bigram WHERE rowid=?').get(Number(row.id))?.text ?? null
  const trigram = db.prepare('SELECT text FROM fts_trigram WHERE rowid=?').get(Number(row.id))?.text ?? null
  const fts = JSON.stringify({ bigram, trigram })
  const info = db.prepare(`INSERT INTO episode_rewrite_snapshots
    (memory_id,revision,previous_json,vector_dim,vector_blob,entities_json,relations_json,quote,fts_text,created_at,reason,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'applied')`).run(
      Number(row.id), Number(row.revision ?? 1), JSON.stringify(row),
      vector?.dim == null ? null : Number(vector.dim), vector?.vec ?? null,
      JSON.stringify(entities), JSON.stringify(relations), String(row.quote ?? ''), fts, Number(now), String(reason),
    )
  return Number(info.lastInsertRowid)
}

function restoreEntities(db, memoryId, json) {
  const saved = Array.isArray(json) ? json : []
  db.prepare('DELETE FROM memory_entities WHERE memory_id=?').run(Number(memoryId))
  const affected = new Set()
  for (const item of saved) {
    let id = Number(item.entity_id)
    let exists = db.prepare('SELECT id FROM entities WHERE id=?').get(id)
    if (!exists) {
      db.prepare('INSERT OR IGNORE INTO entities(name,type,aliases,mention_count,first_seen,last_seen) VALUES(?,?,?,0,?,?)')
        .run(String(item.name), String(item.type), String(item.aliases ?? '[]'), Date.now(), Date.now())
      exists = db.prepare('SELECT id FROM entities WHERE name=? AND type=?').get(String(item.name), String(item.type))
      id = Number(exists?.id)
    }
    if (!id) continue
    db.prepare('INSERT OR REPLACE INTO memory_entities(memory_id,entity_id,weight) VALUES(?,?,?)').run(Number(memoryId), id, Number(item.weight ?? 1))
    affected.add(id)
  }
  for (const id of affected) db.prepare('UPDATE entities SET mention_count=(SELECT count(*) FROM memory_entities WHERE entity_id=?) WHERE id=?').run(id, id)
  return affected.size
}

function restoreFts(db, memoryId, raw) {
  const saved = parseJson(raw, {})
  removeTexts(db, Number(memoryId))
  if (saved.bigram != null) db.prepare('INSERT INTO fts_bigram(rowid,text) VALUES(?,?)').run(Number(memoryId), String(saved.bigram))
  if (saved.trigram != null) db.prepare('INSERT INTO fts_trigram(rowid,text) VALUES(?,?)').run(Number(memoryId), String(saved.trigram))
}

function restoreVector(snapshot) {
  if (snapshot.vector_blob == null || snapshot.vector_dim == null) return null
  const buf = Buffer.from(snapshot.vector_blob)
  if (buf.byteLength !== Number(snapshot.vector_dim) * 4) throw new Error('E_SNAPSHOT_VECTOR_CORRUPT')
  const copy = new Float32Array(Number(snapshot.vector_dim))
  for (let i = 0; i < copy.length; i++) copy[i] = buf.readFloatLE(i * 4)
  return copy
}

export async function applyEpisodeRewrite(db, { id, proposedText, embedFn, vectors = null, now = Date.now(), reason = 'owner-approved-rewrite' } = {}) {
  if (typeof embedFn !== 'function') throw new Error('E_EMBEDDING_UNAVAILABLE')
  const row = requireEpisode(db, id)
  const next = String(proposedText ?? '').trim()
  if (!next) throw new Error('E_EMPTY_PROPOSED_TEXT')
  if (next === String(row.text)) throw new Error('E_NO_CHANGE')
  let snapshotId = null
  const result = await updateMemory(db, Number(id), {
    text: next, quote: '',
    metaPatch: { provenanceReviewRequired: true, provenanceReviewReason: 'episode-rewrite-owner-confirmed', episodeRewriteAt: Number(now) },
  }, Number(row.revision ?? 1), {
    now, invalidation: 'episode-rewrite', syncDerived: true, embedFn, vectors,
    beforeWrite: (tx, previous) => { snapshotId = captureSnapshot(tx, previous, { now, reason }) },
  })
  if (!result.ok) return result
  return { ...result, snapshotId, derived: result.derived, note: 'Existing relations were invalidated unless a validated relationBuilder is supplied; no relation semantics are invented.' }
}

export async function rollbackEpisodeRewrite(db, { snapshotId, vectors = null, now = Date.now() } = {}) {
  const snapshot = db.prepare("SELECT * FROM episode_rewrite_snapshots WHERE id=? AND status='applied'").get(Number(snapshotId))
  if (!snapshot) throw new Error('E_SNAPSHOT_NOT_FOUND_OR_ALREADY_ROLLED_BACK')
  const previous = parseJson(snapshot.previous_json, null)
  if (!previous) throw new Error('E_SNAPSHOT_CORRUPT')
  const current = db.prepare('SELECT * FROM memories WHERE id=?').get(Number(snapshot.memory_id))
  if (!current) throw new Error('E_NOT_FOUND')
  const entities = parseJson(snapshot.entities_json, [])
  const relations = parseJson(snapshot.relations_json, [])
  const vector = restoreVector(snapshot)
  const ftsText = snapshot.fts_text
  const patch = {}
  for (const key of ['kind','text','detail','clarity','importance','confidence','status','pinned','quote','valid_from','valid_to','temporal_kind','superseded_by','meta','scope_type','scope_id']) {
    if (Object.hasOwn(previous, key)) patch[key] = previous[key]
  }
  let rollbackSnapshotId = null
  const result = await updateMemory(db, Number(snapshot.memory_id), patch, Number(current.revision ?? 1), {
    now, invalidation: `episode-rewrite-rollback:${Number(snapshotId)}`, syncDerived: true,
    trustedSnapshotQuote: true, vectorStatusWhenMissing: 'missing',
    embedFn: async () => vector,
    vectors,
    entityRestorer: (tx, args) => restoreEntities(tx, args.memoryId, entities),
    relationBuilder: async () => relations,
    ftsRestorer: (tx, args) => restoreFts(tx, args.memoryId, ftsText),
    beforeWrite: (tx, row) => { rollbackSnapshotId = captureSnapshot(tx, row, { now, reason: `rollback-of:${Number(snapshotId)}` }) },
    afterWrite: (tx) => { tx.prepare("UPDATE episode_rewrite_snapshots SET status='rolled_back', rolled_back_at=? WHERE id=? AND status='applied'").run(Number(now), Number(snapshotId)) },
  })
  if (!result.ok) return result
  return { ...result, rollbackSnapshotId, rolledBackSnapshotId: Number(snapshotId), restoredVector: vector !== null, restoredEntities: entities.length, restoredRelations: relations.length }
}
