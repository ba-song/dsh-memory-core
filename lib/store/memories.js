import { writeTx } from './db.js'
import { indexTexts, removeTexts } from './fts.js'
import { now } from '../adapter/time.js'

/** 唯一写入入口：memories + 两个 FTS 同事务 */
export async function insertMemory(db, rec) {
  const t = Number(rec.createdAt ?? now())
  return writeTx(db, (d) => {
    const info = d.prepare(`INSERT INTO memories
      (kind,text,detail,clarity,importance,subject,attribute,speaker_id,conversation_scope,owner_scope,
       privacy,visibility,visibility_reason,visibility_set_by,visibility_set_at,
       source_msg_id,source_ts,source_file,extractor_version,source_channel,source_ref,confidence,layer,created_at_epoch,status,pinned,
       scope_type,scope_id,meta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      String(rec.kind ?? 'episode'), String(rec.text ?? ''), String(rec.detail ?? ''),
      String(rec.clarity ?? 'clear'), Number(rec.importance ?? 0.5),
      String(rec.subject ?? ''), String(rec.attribute ?? ''),
      String(rec.speakerId ?? ''), String(rec.conversationScope ?? ''), String(rec.ownerScope ?? ''),
      String(rec.privacy ?? 'owner'), String(rec.visibility ?? 'owner'),
      String(rec.visibilityReason ?? ''), String(rec.visibilitySetBy ?? ''), Number(rec.visibilitySetAt ?? 0),
      String(rec.sourceMsgId ?? ''), Number(rec.sourceTs ?? 0), String(rec.sourceFile ?? ''),
      String(rec.extractorVersion ?? ''), String(rec.sourceChannel ?? ''), String(rec.sourceRef ?? ''),
      Number(rec.confidence ?? 1), String(rec.layer ?? 'manual'),
      t, String(rec.status ?? 'active'),
      rec.pinned ? 1 : 0,
      String(rec.scopeType ?? 'owner'), String(rec.scopeId ?? ''), JSON.stringify(rec.meta ?? {}))
    const id = Number(info.lastInsertRowid)
    indexTexts(d, id, String(rec.text ?? ''))
    return id
  })
}

/** 唯一删除入口：跨表一起删（memories / fts / 实体关联 / 冲突引用） */
export async function deleteMemory(db, id) {
  return writeTx(db, (d) => {
    d.prepare('DELETE FROM memories WHERE id=?').run(id)
    removeTexts(d, id)
    d.prepare('DELETE FROM memory_entities WHERE memory_id=?').run(id)
    d.prepare('DELETE FROM vectors WHERE memory_id=?').run(id)
    d.prepare("UPDATE conflict_queue SET status='stale' WHERE memory_a=? OR memory_b=?").run(id, id)
    return true
  })
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
