export const RULES_BUDGET = 400
export const RULES_MAX_ITEMS = 5
export const RULE_ITEM_CHARS = 70

const HEAD = '【必须遵守的规则】'
const TAIL = '【必须遵守的规则结束】'

export function normalizeRuleText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase()
}
export function canManageRules(scope) { return scope?.level === 'owner' }
function clampInt(value, fallback, min, max) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback
}
function truncateChars(value, max) { return Array.from(String(value ?? '')).slice(0, max).join('') }
function inTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try { const out = fn(); db.exec('COMMIT'); return out }
  catch (e) { try { db.exec('ROLLBACK') } catch {}; throw e }
}

export function addRule(db, { text, priority = null, source = null, sourceMsgId = null, supersedesId = 0, scope = null, now = Date.now() } = {}) {
  if (!canManageRules(scope)) return { ok: false, code: 'E_PERMISSION' }
  const value = String(text ?? '').trim()
  if (!value || Array.from(value).length > 200) return { ok: false, code: 'E_INVALID_TEXT' }
  const normalized = normalizeRuleText(value)
  const hasPriority = priority !== null && priority !== undefined
  const hasSource = source !== null && source !== undefined
  const hasSourceMsgId = sourceMsgId !== null && sourceMsgId !== undefined
  const p = hasPriority ? clampInt(priority, 0, -100, 100) : null
  const src = hasSource ? String(source ?? '').trim().slice(0, 200) : null
  const msgId = hasSourceMsgId ? String(sourceMsgId ?? '').trim().slice(0, 200) : null
  const requestedOldId = Number(supersedesId) || 0
  return inTransaction(db, () => {
    const rows = db.prepare("SELECT id,revision,text,priority,source,source_msg_id FROM rules WHERE status='active' AND scope_type='owner' AND scope_id='' AND (valid_to IS NULL OR valid_to>?) ORDER BY id DESC").all(now)
    const duplicate = rows.find((row) => normalizeRuleText(row.text) === normalized)

    if (duplicate && !requestedOldId) {
      const metadataChanged =
        (hasPriority && Number(duplicate.priority) !== p) ||
        (hasSource && String(duplicate.source ?? '') !== src) ||
        (hasSourceMsgId && String(duplicate.source_msg_id ?? '') !== msgId)
      if (metadataChanged) {
        return {
          ok: false,
          code: 'E_RULE_METADATA_CONFLICT',
          id: Number(duplicate.id),
          message: '同文本规则已存在，但 priority/source 元数据不同；如需更新，请传 supersedes_id。',
          hint: '请传 supersedes_id 指向现有规则以创建新版本。',
        }
      }
      return { ok: true, id: Number(duplicate.id), revision: Number(duplicate.revision), idempotent: true }
    }

    if (duplicate && requestedOldId && requestedOldId !== Number(duplicate.id)) {
      return {
        ok: false,
        code: 'E_RULE_SUPERSEDES_MISMATCH',
        id: Number(duplicate.id),
        supersedesId: requestedOldId,
        message: '同文本规则已存在，但 supersedes_id 指向另一条规则；为避免重复 active 规则，操作已拒绝。',
      }
    }

    let old = null
    let revision = 1
    if (requestedOldId) {
      old = db.prepare("SELECT id,revision,priority,source,source_msg_id FROM rules WHERE id=? AND status='active' AND scope_type='owner' AND scope_id=''").get(requestedOldId)
      if (!old) return { ok: false, code: 'E_RULE_NOT_ACTIVE', id: requestedOldId }
      revision = Number(old.revision || 1) + 1
    }

    const nextPriority = hasPriority ? p : (old ? Number(old.priority) || 0 : 0)
    const nextSource = hasSource ? src : (old ? String(old.source ?? '') : '')
    const nextSourceMsgId = hasSourceMsgId ? msgId : (old ? String(old.source_msg_id ?? '') : '')
    const result = db.prepare("INSERT INTO rules(text,scope_type,scope_id,status,priority,source,source_msg_id,created_at,updated_at,valid_from,valid_to,superseded_by,revision,revoked_at,revoke_reason) VALUES(?,'owner','', 'active', ?, ?, ?, ?, ?, ?, NULL, 0, ?, NULL, '')").run(value, nextPriority, nextSource, nextSourceMsgId, now, now, now, revision)
    const id = Number(result.lastInsertRowid)
    if (old) db.prepare("UPDATE rules SET status='superseded',valid_to=?,superseded_by=?,updated_at=? WHERE id=? AND status='active'").run(now, id, now, requestedOldId)
    return { ok: true, id, revision, supersedesId: requestedOldId || null, idempotent: false }
  })
}

export function revokeRule(db, { id, reason = '', scope = null, now = Date.now() } = {}) {
  if (!canManageRules(scope)) return { ok: false, code: 'E_PERMISSION' }
  const ruleId = Number(id)
  if (!Number.isSafeInteger(ruleId) || ruleId <= 0) return { ok: false, code: 'E_INVALID_ID' }
  return inTransaction(db, () => {
    const row = db.prepare('SELECT id,status FROM rules WHERE id=? AND scope_type=? AND scope_id=?').get(ruleId, 'owner', '')
    if (!row) return { ok: false, code: 'E_NOT_FOUND', id: ruleId }
    if (row.status === 'revoked') return { ok: true, id: ruleId, idempotent: true }
    if (row.status !== 'active') return { ok: false, code: 'E_RULE_NOT_ACTIVE', id: ruleId, status: row.status }
    db.prepare("UPDATE rules SET status='revoked',valid_to=?,revoked_at=?,revoke_reason=?,updated_at=? WHERE id=? AND status='active'").run(now, now, String(reason ?? '').trim().slice(0, 500), now, ruleId)
    return { ok: true, id: ruleId, idempotent: false }
  })
}

export function listRules(db, { all = false, scope = null } = {}) {
  if (!canManageRules(scope)) return { ok: false, code: 'E_PERMISSION', count: 0, items: [] }
  const where = all ? '' : " AND status='active'"
  const rows = db.prepare("SELECT id,text,scope_type,scope_id,status,priority,source,source_msg_id,created_at,updated_at,valid_from,valid_to,superseded_by,revision,revoked_at,revoke_reason FROM rules WHERE scope_type='owner' AND scope_id=''" + where + ' ORDER BY priority DESC,id DESC').all()
  return { ok: true, count: rows.length, items: rows }
}

export function buildRulesBlock(db, { scope = null, now = Date.now(), enabled = true, budget = null } = {}) {
  if (!db || !enabled || !canManageRules(scope)) return ''
  const maxChars = clampInt(budget?.maxChars, RULES_BUDGET, 40, RULES_BUDGET)
  const maxItems = clampInt(budget?.maxItems, RULES_MAX_ITEMS, 1, RULES_MAX_ITEMS)
  const itemChars = clampInt(budget?.itemChars, RULE_ITEM_CHARS, 12, RULE_ITEM_CHARS)
  let rows = []
  try {
    rows = db.prepare("SELECT id,text,priority FROM rules WHERE status='active' AND scope_type='owner' AND scope_id='' AND (valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>?) ORDER BY priority DESC,id DESC").all(Number(now), Number(now))
  } catch { return '' }
  const picked = [], seen = new Set()
  let used = HEAD.length + TAIL.length + 2, dropped = 0
  for (const row of rows) {
    const normalized = normalizeRuleText(row.text)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    if (picked.length >= maxItems) { dropped++; continue }
    const prefix = '- [' + (Number(row.priority) || 0) + '] '
    const textLimit = Math.max(1, itemChars - Array.from(prefix).length)
    const line = prefix + truncateChars(String(row.text ?? '').replace(/\s+/gu, ' ').trim(), textLimit)
    if (used + Array.from(line).length + 1 > maxChars) { dropped++; continue }
    picked.push(line)
    used += Array.from(line).length + 1
  }
  if (!picked.length) return ''
  const note = dropped ? '（另有 ' + dropped + ' 条未注入）' : ''
  if (note && used + Array.from(note).length + 1 <= maxChars) picked.push(note)
  return [HEAD, ...picked, TAIL].join('\n')
}
