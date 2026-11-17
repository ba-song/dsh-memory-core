/**
 * M1：独立的长期偏好注入块。
 * 只注入 owner scope 中明确持久化、仍有效的 preference；无数据时返回空字符串。
 */
import { scopeWhere } from '../scope.js';

export const PREFERENCE_BUDGET = 180;
export const PREFERENCE_MAX_ITEMS = 3;

function parseMeta(value) {
  try {
    const meta = typeof value === 'string' ? JSON.parse(value || '{}') : value;
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : null;
  } catch { return null; }
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function evidenceTime(row) {
  const value = Number(row.meta.lastEvidenceAt);
  return Number.isFinite(value) && value > 0 ? value : Number(row.created_at_epoch) || 0;
}

function fitsBudget(picked, line) {
  const used = '【长期偏好】'.length + '【长期偏好结束】'.length + 1
    + picked.reduce((sum, item) => sum + item.length + 1, 0);
  return used + line.length + 1 <= PREFERENCE_BUDGET;
}

export function buildPreferenceBlock(db, { scope = null, now = Date.now() } = {}) {
  if (scope?.level !== 'owner') return '';
  const w = scopeWhere(scope);
  let rows = [];
  try {
    rows = db.prepare(`SELECT id,text,importance,confidence,created_at_epoch,pinned,meta FROM memories
      WHERE status='active' AND kind='preference' AND scope_type='owner' AND ${w.sql}
        AND (valid_to IS NULL OR valid_to>?)
      LIMIT 40`).all(...w.params, Number(now));
  } catch { return ''; }

  const candidates = [];
  for (const row of rows) {
    const meta = parseMeta(row.meta);
    if (!meta || meta.persist !== true || meta.persistence !== 'long_term') continue;
    const value = cleanText(row.text);
    if (!value || value.includes('{{')) continue;
    candidates.push({
      id: Number(row.id),
      text: value,
      line: '- ' + value,
      pinned: Number(row.pinned) || 0,
      importance: Number(row.importance) || 0,
      confidence: Number(row.confidence) || 0,
      created_at_epoch: Number(row.created_at_epoch) || 0,
      meta,
    });
  }
  if (!candidates.length) return '';

  const stable = [...candidates].sort((a, b) =>
    b.pinned - a.pinned || b.importance - a.importance || a.id - b.id
  );
  const recent = [...candidates].sort((a, b) =>
    evidenceTime(b) - evidenceTime(a) || b.importance - a.importance || a.id - b.id
  ).find((item) => item.confidence >= 0.6 && item.text.length <= 60 && !item.text.includes('{{'));

  const picked = [];
  const selected = new Set();
  if (recent && fitsBudget(picked.map((x) => x.line), recent.line)) {
    picked.push(recent);
    selected.add(recent.id);
  }
  for (const item of stable) {
    if (picked.length >= PREFERENCE_MAX_ITEMS) break;
    if (selected.has(item.id)) continue;
    if (!fitsBudget(picked.map((x) => x.line), item.line)) continue;
    picked.push(item);
    selected.add(item.id);
  }
  return picked.length ? ['【长期偏好】', ...picked.map((x) => x.line), '【长期偏好结束】'].join('\n') : '';
}
