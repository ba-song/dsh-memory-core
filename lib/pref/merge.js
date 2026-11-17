/**
 * M1：偏好记录合并与修订。只处理明确持久化的 preference。
 * 匹配采取文本归一化 + 极窄的否定极性比较；不做模糊语义推断。
 */
import { updateMemory } from '../store/memories.js';

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

/**
 * 将明确长期偏好附加到已有记录；相同偏好累积证据，明确反向表达则关闭旧记录。
 * 新旧记录的变更均经 updateMemory/CAS 写修订快照。
 */
export async function mergePersistentPreference(db, { id, text, now = Date.now() } = {}) {
  const current = db.prepare("SELECT * FROM memories WHERE id=? AND kind='preference' AND status='active'").get(Number(id));
  if (!current) return { ok: false, reason: 'candidate-not-active-preference' };
  const incoming = polarityKey(text || current.text);
  if (!incoming.key) return { ok: false, reason: 'empty-key' };

  const rows = db.prepare("SELECT * FROM memories WHERE kind='preference' AND status='active' AND id<>? AND scope_type=? AND scope_id=? AND (valid_to IS NULL OR valid_to>?)").all(
    Number(id), String(current.scope_type ?? 'owner'), String(current.scope_id ?? ''), Number(now)
  );
  for (const old of rows) {
    const meta = parseMeta(old);
    if (meta.persist !== true) continue;
    const prior = polarityKey(old.text);
    if (!prior.key || prior.key !== incoming.key) continue;

    if (prior.polarity === incoming.polarity) {
      // 相同偏好：保留较早的稳定记录，记录新增证据并把新候选标为 merged。
      const r = await updateMemory(db, old.id, {
        importance: Math.min(0.95, Math.max(Number(old.importance) || 0.4, Number(current.importance) || 0.4) + 0.02),
        confidence: Math.min(1, Math.max(Number(old.confidence) || 0.6, Number(current.confidence) || 0.6) + 0.02),
        metaPatch: { evidenceCount: Math.max(1, Number(meta.evidenceCount) || 1) + 1, lastEvidenceAt: Number(now), persist: true, category: 'user_preference' },
      }, Number(old.revision ?? 1), { now, invalidation: 'preference-evidence-merge' });
      if (!r.ok) return r;
      await updateMemory(db, current.id, { status: 'merged', metaPatch: { mergedInto: Number(old.id) } }, Number(current.revision ?? 1), { now, invalidation: 'preference-duplicate' });
      return { ok: true, action: 'merged', targetId: Number(old.id) };
    }

    if (prior.polarity !== 0 && incoming.polarity !== 0 && prior.polarity === -incoming.polarity) {
      const r = await updateMemory(db, old.id, {
        valid_to: Number(now), superseded_by: Number(current.id),
        metaPatch: { supersededAt: Number(now), supersededBy: Number(current.id) },
      }, Number(old.revision ?? 1), { now, invalidation: 'preference-superseded' });
      if (!r.ok) return r;
      return { ok: true, action: 'superseded', previousId: Number(old.id) };
    }
  }
  return { ok: true, action: 'inserted' };
}
