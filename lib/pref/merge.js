/**
 * M1/M2：持久偏好合并与修订。
 * M2-2 仅处理 meta.persist=true && persistence=long_term 的 preference；
 * 只在可确定的同主题反极性场景 supersede，不做自由语义推断。
 */
import { writeTx } from '../store/db.js'

const TRAD_TO_SIMP = Object.freeze({
  '愛': '爱', '歡': '欢', '厭': '厌', '說': '说', '覺': '觉',
  '麼': '么', '買': '买', '賣': '卖', '聽': '听', '見': '见',
  '貓': '猫', '錯': '错', '對': '对',
})

export function normalizePreferenceText(value) {
  const normalized = String(value ?? '').normalize('NFKC').toLocaleLowerCase()
  const simplified = [...normalized].map((ch) => TRAD_TO_SIMP[ch] ?? ch).join('')
  return simplified.replace(/[\p{P}\p{S}\s，。！？、；：（）【】《》“”‘’]/gu, '')
}

const NEGATIVE_PREFIX = /^(?:不怎么喜欢|不太喜欢|不喜欢|不太爱吃|不爱吃|不偏好|不倾向于|不爱|讨厌|受不了|最怕|怕|拒绝)/
const POSITIVE_PREFIX = /^(?:特别喜欢|超喜欢|很喜欢|最喜欢|喜欢|爱吃|最爱|爱|偏好|倾向于|选择)/
const DEGREE_PREFIX = /^(?:很|超|特别|最|有点|比较|真)/
const POLARITY_IN_TOPIC = /(?:不喜欢|不太喜欢|不怎么喜欢|喜欢|讨厌|爱吃|最爱|最怕|受不了|偏好|倾向于|爱|拒绝)/

/**
 * 返回完全确定的主题与极性；无法确定（多分句、范围不清）一律 polarity=0。
 * 不把近义词、主题词序或自由语义相似当作同一键。
 */
function parseDetailed(value) {
  const raw = String(value ?? '')
  if (/[。！？；;\n]|但是|不过|然而|但/.test(raw)) return { topic: '', polarity: 0, ambiguous: true }
  let s = normalizePreferenceText(raw)
  s = s.replace(/^(?:我|主人|汐|她|他)+/, '')
  while (DEGREE_PREFIX.test(s)) s = s.replace(DEGREE_PREFIX, '')
  let polarity = 0
  let topic = ''

  const negative = s.match(NEGATIVE_PREFIX)
  if (negative) {
    polarity = -1
    topic = s.slice(negative[0].length)
  } else {
    const positive = s.match(POSITIVE_PREFIX)
    if (positive) {
      polarity = 1
      topic = s.slice(positive[0].length)
    }
  }

  if (polarity === 0) {
    // 尾式仅接受整句严格匹配；不从任意子串或多分句中猜主题。
    const tail = s.match(/^(.{2,20}?)(不太|不|不怎么)?(喜欢|讨厌|爱|爱吃|最怕|受不了)$/)
    if (!tail) return { topic: '', polarity: 0, ambiguous: false }
    topic = tail[1]
    const negator = tail[2] || ''
    const verb = tail[3]
    polarity = (negator || ['讨厌', '最怕', '受不了'].includes(verb)) ? -1 : 1
  }

  if (!topic) return { topic: '', polarity: 0, ambiguous: polarity !== 0 }
  if (POLARITY_IN_TOPIC.test(topic)) return { topic: '', polarity: 0, ambiguous: false }
  return { topic, polarity, ambiguous: false }
}

function parseMeta(row) {
  try { return typeof row?.meta === 'string' ? JSON.parse(row.meta || '{}') : (row?.meta ?? {}) }
  catch { return {} }
}

// 调用方必须已处于 writeTx 的 BEGIN IMMEDIATE 事务中。
function reviseInTransaction(db, row, patch, now, invalidation) {
  const revision = Number(row.revision ?? 1)
  const meta = { ...parseMeta(row), ...(patch.metaPatch ?? {}) }
  const fields = { ...patch }
  delete fields.metaPatch
  fields.meta = JSON.stringify(meta)
  fields.revision = revision + 1
  fields.updated_at = Number(now)
  db.prepare('INSERT INTO memory_revisions(memory_id,revision,previous_json,changed_at,invalidation) VALUES(?,?,?,?,?)')
    .run(Number(row.id), revision, JSON.stringify(row), Number(now), String(invalidation))
  const keys = Object.keys(fields)
  const sql = keys.map((key) => `${key}=?`).join(', ')
  const result = db.prepare(`UPDATE memories SET ${sql} WHERE id=? AND revision=?`)
    .run(...keys.map((key) => fields[key]), Number(row.id), revision)
  if (Number(result.changes) !== 1) throw new Error('E_REVISION_CONFLICT')
}

function hasOpenConflict(db, id) {
  return Boolean(db.prepare("SELECT 1 FROM conflict_queue WHERE status='pending' AND (memory_a=? OR memory_b=?) LIMIT 1").get(Number(id), Number(id)))
}

/**
 * 合并明确长期偏好。BEGIN IMMEDIATE 串行化读-改-写；
 * 旧记录修订与候选状态变更在同一事务，任一步失败全部回滚。
 */
export async function mergePersistentPreference(db, { id, text, now = Date.now() } = {}) {
  return writeTx(db, (tx) => {
    const current = tx.prepare("SELECT * FROM memories WHERE id=? AND kind='preference' AND status IN ('active','pending')").get(Number(id))
    if (!current) return { ok: false, reason: 'candidate-not-active-preference' }
    const currentMeta = parseMeta(current)
    if (currentMeta.persist !== true || currentMeta.persistence !== 'long_term') {
      return { ok: false, reason: 'candidate-not-persistent' }
    }
    if (currentMeta.quarantined === true) return { ok: false, reason: 'candidate-quarantined' }
    if (current.valid_to != null) return { ok: false, reason: 'candidate-invalidated' }

    const incoming = parseDetailed(text || current.text)
    if (!incoming.topic || incoming.polarity === 0) {
      if (!incoming.ambiguous && current.status === 'pending' && !hasOpenConflict(tx, current.id)) {
        reviseInTransaction(tx, current, { status: 'active' }, now, 'preference-activated')
        return { ok: true, action: 'inserted', reason: 'preference-polarity-uncertain' }
      }
      return { ok: true, action: 'unchanged', reason: 'preference-polarity-uncertain' }
    }

    const rows = tx.prepare("SELECT * FROM memories WHERE kind='preference' AND status='active' AND id<>? AND scope_type=? AND scope_id=? AND (valid_to IS NULL OR valid_to>?) ORDER BY id")
      .all(Number(id), String(current.scope_type ?? 'owner'), String(current.scope_id ?? ''), Number(now))

    for (const old of rows) {
      const meta = parseMeta(old)
      if (meta.persist !== true || meta.persistence !== 'long_term' || meta.quarantined === true) continue
      const prior = parseDetailed(old.text)
      if (!prior.topic || prior.topic !== incoming.topic) continue

      if (prior.polarity === incoming.polarity) {
        reviseInTransaction(tx, old, {
          importance: Math.min(0.95, Math.max(Number(old.importance) || 0.4, Number(current.importance) || 0.4) + 0.02),
          confidence: Math.min(1, Math.max(Number(old.confidence) || 0.6, Number(current.confidence) || 0.6) + 0.02),
          metaPatch: {
            evidenceCount: Math.max(1, Number(meta.evidenceCount) || 1) + 1,
            lastEvidenceAt: Number(now), persist: true, persistence: 'long_term', category: 'user_preference',
          },
        }, now, 'preference-evidence-merge')
        reviseInTransaction(tx, current, { status: 'merged', metaPatch: { mergedInto: Number(old.id) } }, now, 'preference-duplicate')
        return { ok: true, action: 'merged', targetId: Number(old.id) }
      }

      const opposite = prior.polarity * incoming.polarity === -1
      const olderEvidence = Number(old.created_at_epoch) < Number(current.created_at_epoch)
      const priorValid = old.valid_to == null || Number(old.valid_to) > Number(now)
      const incomingValid = current.valid_to == null
      const incomingCanResolve = current.status === 'active' || !hasOpenConflict(tx, current.id)
      if (opposite && olderEvidence && priorValid && incomingValid && incomingCanResolve) {
        reviseInTransaction(tx, old, {
          valid_to: Number(now),
          superseded_by: Number(current.id),
          metaPatch: {
            supersededAt: Number(now),
            supersededBy: Number(current.id),
            supersedeReason: 'explicit-opposite-preference',
          },
        }, now, 'preference-superseded')
        if (current.status === 'pending' && !hasOpenConflict(tx, current.id)) {
          reviseInTransaction(tx, current, { status: 'active' }, now, 'preference-activated-after-supersession')
        }
        return { ok: true, action: 'superseded', previousId: Number(old.id) }
      }
    }

    // 新主题保持原有激活路径；未解冲突或隔离候选继续 pending。
    if (current.status === 'pending' && !hasOpenConflict(tx, current.id)) {
      reviseInTransaction(tx, current, { status: 'active' }, now, 'preference-activated')
      return { ok: true, action: 'inserted' }
    }
    if (current.status === 'active') return { ok: true, action: 'unchanged' }
    return { ok: true, action: 'pending', reason: 'open-conflict' }
  })
}


/** 对外只暴露 topic/polarity，保持既有调用方与测试的返回形状 */
export function parsePreference(value) {
  const r = parseDetailed(value)
  return { topic: r.topic, polarity: r.polarity }
}
