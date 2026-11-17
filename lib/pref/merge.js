/**
 * M1：偏好记录合并与修订。只处理明确持久化的 preference。
 * 匹配采取文本归一化 + 极窄的否定极性比较；不做模糊语义推断。
 */
import { writeTx } from '../store/db.js';

export function normalizePreferenceText(value) {
  return String(value ?? '').normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s，。！？、；：（）【】《》“”‘’]/gu, '');
}

function polarityKey(value) {
  let s = normalizePreferenceText(value);
  let polarity = 1;
  const negative = /^(?:不太喜欢|不喜欢|不爱吃|不爱|不偏好|不倾向于|讨厌|受不了|最怕|拒绝)/;
  const positive = /^(?:特别喜欢|超喜欢|很喜欢|最喜欢|喜欢|爱吃|最爱|爱|偏好|倾向于|选择)/;
  if (negative.test(s)) { polarity = -1; s = s.replace(negative, ''); }
  else if (positive.test(s)) s = s.replace(positive, '');
  else return { key: s, polarity: 0 };
  return { key: s, polarity };
}

function parseMeta(row) {
  try { return typeof row?.meta === 'string' ? JSON.parse(row.meta || '{}') : (row?.meta ?? {}); }
  catch { return {}; }
}

// 调用方必须已处于 writeTx 的 BEGIN IMMEDIATE 事务中。
// CAS 更新、revision 快照与状态变更均在同一事务提交。
function reviseInTransaction(db, row, patch, now, invalidation) {
  const revision = Number(row.revision ?? 1);
  const meta = { ...parseMeta(row), ...(patch.metaPatch ?? {}) };
  const fields = { ...patch };
  delete fields.metaPatch;
  fields.meta = JSON.stringify(meta);
  fields.revision = revision + 1;
  fields.updated_at = Number(now);
  db.prepare('INSERT INTO memory_revisions(memory_id,revision,previous_json,changed_at,invalidation) VALUES(?,?,?,?,?)')
    .run(Number(row.id), revision, JSON.stringify(row), Number(now), String(invalidation));
  const keys = Object.keys(fields);
  const sql = keys.map((key) => `${key}=?`).join(', ');
  const result = db.prepare(`UPDATE memories SET ${sql} WHERE id=? AND revision=?`)
    .run(...keys.map((key) => fields[key]), Number(row.id), revision);
  if (Number(result.changes) !== 1) throw new Error('E_REVISION_CONFLICT');
}

/**
 * 合并明确长期偏好。BEGIN IMMEDIATE 串行化读-改-写；
 * 旧记录修订与候选状态变更在同一事务，任一步失败全部回滚。
 */
export async function mergePersistentPreference(db, { id, text, now = Date.now() } = {}) {
  return writeTx(db, (tx) => {
    const current = tx.prepare("SELECT * FROM memories WHERE id=? AND kind='preference' AND status IN ('active','pending')").get(Number(id));
    if (!current) return { ok: false, reason: 'candidate-not-active-preference' };
    const currentMeta = parseMeta(current);
    if (currentMeta.persist !== true || currentMeta.persistence !== 'long_term') {
      return { ok: false, reason: 'candidate-not-persistent' };
    }
    const incoming = polarityKey(text || current.text);
    if (!incoming.key) return { ok: false, reason: 'empty-key' };

    const rows = tx.prepare("SELECT * FROM memories WHERE kind='preference' AND status='active' AND id<>? AND scope_type=? AND scope_id=? AND (valid_to IS NULL OR valid_to>?) ORDER BY id")
      .all(Number(id), String(current.scope_type ?? 'owner'), String(current.scope_id ?? ''), Number(now));
    for (const old of rows) {
      const meta = parseMeta(old);
      if (meta.persist !== true || meta.persistence !== 'long_term') continue;
      const prior = polarityKey(old.text);
      if (!prior.key || prior.key !== incoming.key) continue;

      if (prior.polarity === incoming.polarity) {
        reviseInTransaction(tx, old, {
          importance: Math.min(0.95, Math.max(Number(old.importance) || 0.4, Number(current.importance) || 0.4) + 0.02),
          confidence: Math.min(1, Math.max(Number(old.confidence) || 0.6, Number(current.confidence) || 0.6) + 0.02),
          metaPatch: { evidenceCount: Math.max(1, Number(meta.evidenceCount) || 1) + 1, lastEvidenceAt: Number(now), persist: true, persistence: 'long_term', category: 'user_preference' },
        }, now, 'preference-evidence-merge');
        reviseInTransaction(tx, current, { status: 'merged', metaPatch: { mergedInto: Number(old.id) } }, now, 'preference-duplicate');
        return { ok: true, action: 'merged', targetId: Number(old.id) };
      }

      if (prior.polarity !== 0 && incoming.polarity !== 0 && prior.polarity === -incoming.polarity) {
        reviseInTransaction(tx, old, {
          valid_to: Number(now), superseded_by: Number(current.id),
          metaPatch: { supersededAt: Number(now), supersededBy: Number(current.id) },
        }, now, 'preference-superseded');
        reviseInTransaction(tx, current, { status: 'active' }, now, 'preference-activated-after-supersession');
        return { ok: true, action: 'superseded', previousId: Number(old.id) };
      }
    }
    if (current.status !== 'active') reviseInTransaction(tx, current, { status: 'active' }, now, 'preference-activated');
    return { ok: true, action: 'inserted' };
  });
}
