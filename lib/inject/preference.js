/**
 * M1：独立的长期偏好注入块。
 * 只注入 owner scope 中明确持久化、仍有效的 preference；无数据时返回空字符串。
 */
import { scopeWhere } from '../scope.js';

export const PREFERENCE_BUDGET = 180;
export const PREFERENCE_MAX_ITEMS = 3;

export function buildPreferenceBlock(db, { scope = null, now = Date.now() } = {}) {
  if (scope?.level !== 'owner') return '';
  const w = scopeWhere(scope);
  let rows = [];
  try {
    rows = db.prepare(`SELECT id,text,importance,meta FROM memories
      WHERE status='active' AND kind='preference' AND scope_type='owner' AND ${w.sql}
        AND (valid_to IS NULL OR valid_to>?)
      ORDER BY pinned DESC, importance DESC, COALESCE(last_access_epoch,created_at_epoch) DESC
      LIMIT 40`).all(...w.params, Number(now));
  } catch { return ''; }

  const picked = [];
  let used = '【长期偏好】\n【长期偏好结束】'.length + 1;
  for (const row of rows) {
    let meta = {};
    try { meta = typeof row.meta === 'string' ? JSON.parse(row.meta || '{}') : (row.meta ?? {}); } catch {}
    if (meta.persist !== true || meta.persistence !== 'long_term') continue;
    const value = String(row.text ?? '').replace(/\s+/g, ' ').trim();
    if (!value || value.includes('{{')) continue;
    const line = '- ' + value;
    if (picked.length >= PREFERENCE_MAX_ITEMS) break;
    if (used + line.length + 1 > PREFERENCE_BUDGET) continue;
    picked.push(line);
    used += line.length + 1;
  }
  return picked.length ? ['【长期偏好】', ...picked, '【长期偏好结束】'].join('\n') : '';
}
