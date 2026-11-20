import { scopeWhere } from '../scope.js'

/** 规则实体抽取 + 关联写入（P3b）。不调模型，宁可少抽也不乱抽。 */
const PLATFORM = /(抖音|QQ|B站|Chrome|GitHub|DeepSeek|DSH|SnowLuma|NapCat|微信)/g
const PERSON = /(主人|饲养员|草荧|木心|汐|豆包|千问|通义)/g
const PLACE = /(看海|海边|大海|家里|公司|学校|医院|餐厅)/g
const PET = /(鲸鱼|大肥鱼|猫|狗)/g

export function extractEntities(text) {
  const s = String(text ?? '')
  const out = new Map()
  const add = (name, type) => { if (name && !out.has(name)) out.set(name, type) }
  for (const m of s.matchAll(PLATFORM)) add(m[1], 'platform')
  for (const m of s.matchAll(PERSON)) add(m[1], 'person')
  for (const m of s.matchAll(PLACE)) add(m[1], 'place')
  for (const m of s.matchAll(PET)) add(m[1], 'pet')
  for (const m of s.matchAll(/\b\d{5,12}\b/g)) add(m[0], 'number')
  return [...out.entries()].map(([name, type]) => ({ name, type }))
}

export function unlinkMemory(db, memoryId, _at = Date.now()) {
  const rows = db.prepare('SELECT entity_id FROM memory_entities WHERE memory_id=?').all(Number(memoryId))
  db.prepare('DELETE FROM memory_entities WHERE memory_id=?').run(Number(memoryId))
  for (const row of rows) {
    db.prepare(`UPDATE entities SET
      mention_count=(SELECT count(*) FROM memory_entities WHERE entity_id=entities.id),
      last_seen=COALESCE((SELECT MAX(m.created_at_epoch) FROM memory_entities me JOIN memories m ON m.id=me.memory_id WHERE me.entity_id=entities.id), first_seen)
      WHERE id=?`).run(Number(row.entity_id))
  }
  return rows.length
}

export function linkMemory(db, memoryId, text, at = Date.now()) {
  const ents = extractEntities(text)
  for (const e of ents) {
    db.prepare(`INSERT INTO entities(name,type,mention_count,first_seen,last_seen)
      VALUES(?,?,1,?,?)
      ON CONFLICT(name,type) DO UPDATE SET mention_count=mention_count+1, last_seen=excluded.last_seen`)
      .run(e.name, e.type, at, at)
    const row = db.prepare('SELECT id FROM entities WHERE name=? AND type=?').get(e.name, e.type)
    if (!row) continue
    db.prepare('INSERT OR IGNORE INTO memory_entities(memory_id,entity_id,weight) VALUES(?,?,1)').run(memoryId, row.id)
  }
  return ents.length
}

/** 查询实体直接命中的记忆 + 1 跳（与命中记忆共享实体的其他记忆，权重 0.4） */
export function graphCandidates(db, query, { limit = 30, scope = null, asOf = Date.now(), strictAsOf = false, includeUnknownHops = false } = {}) {
  const qEnts = extractEntities(query).map((e) => e.name)
  const direct = new Set()
  const scopeFilter = scopeWhere(scope, { alias: 'm' })
  const parsedAsOf = asOf === null || asOf === undefined ? Date.now() : Number(asOf)
  const timestamp = Number.isFinite(parsedAsOf) ? parsedAsOf : Date.now()
  const temporalSql = strictAsOf ? '(m.valid_from IS NOT NULL AND m.valid_from<=? AND (m.valid_to IS NULL OR m.valid_to>?))' : '(m.valid_from IS NULL OR m.valid_from<=?) AND (m.valid_to IS NULL OR m.valid_to>?)'
  const filterSql = ` AND m.status='active' AND (${scopeFilter.sql}) AND ${temporalSql}`
  const filterParams = [...scopeFilter.params, timestamp, timestamp]
  if (qEnts.length) {
    const ph = qEnts.map(() => '?').join(',')
    const rows = db.prepare(`SELECT DISTINCT me.memory_id id FROM memory_entities me
      JOIN memories m ON m.id=me.memory_id
      JOIN entities e ON e.id=me.entity_id WHERE e.name IN (${ph})${filterSql} ORDER BY me.memory_id ASC`).all(...qEnts, ...filterParams)
    for (const r of rows) direct.add(Number(r.id))
  }
  const hop = new Map()
  const unknownHop = new Map()
  const seeds = [...direct].slice(0, 10)
  if (seeds.length) {
    const ph = seeds.map(() => '?').join(',')
    const rows = db.prepare(`SELECT me2.memory_id id, count(*) c FROM memory_entities me1
      JOIN memory_entities me2 ON me2.entity_id=me1.entity_id AND me2.memory_id<>me1.memory_id
      JOIN memories m ON m.id=me2.memory_id
      WHERE me1.memory_id IN (${ph})${filterSql} GROUP BY me2.memory_id ORDER BY c DESC, me2.memory_id ASC LIMIT ?`).all(...seeds, ...filterParams, limit)
    for (const r of rows) if (!direct.has(Number(r.id))) hop.set(Number(r.id), Math.min(1, Number(r.c) / 3) * 0.4)

    if (includeUnknownHops) {
      const unknownFilter = ` AND m.status='active' AND (${scopeFilter.sql}) AND COALESCE(m.temporal_kind,'unknown')='unknown' AND m.valid_from IS NULL`
      const unknownRows = db.prepare(`SELECT me2.memory_id id, count(*) c FROM memory_entities me1
        JOIN memory_entities me2 ON me2.entity_id=me1.entity_id AND me2.memory_id<>me1.memory_id
        JOIN memories m ON m.id=me2.memory_id
        WHERE me1.memory_id IN (${ph})${unknownFilter} GROUP BY me2.memory_id ORDER BY c DESC, me2.memory_id ASC LIMIT ?`)
        .all(...seeds, ...scopeFilter.params, limit)
      for (const r of unknownRows) {
        const id = Number(r.id)
        if (!direct.has(id) && !hop.has(id)) unknownHop.set(id, Math.min(1, Number(r.c) / 3) * 0.4)
      }
    }
  }
  return { direct: [...direct], hop, unknownHop }
}
