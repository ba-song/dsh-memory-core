/** 自动共享（方案 B，保守）：只把「她自己/公开类」新记忆复制一份 public，绝不改原记忆 */
const PRIVACY = /(@[a-z0-9.-]+\.[a-z]{2,})|(1[3-9]\d{9})|密码|身份证|银行卡|家庭住址|详细地址|私聊原文|聊天记录|主人姓名/i
const TOPIC = /近况|兴趣|学习|心情|日常|喜欢|在读|在看|学会了|今天|最近/
export function classifyShare({ text = '', scopeType = 'owner', fromSelf = false, patterns = null } = {}) {
  const t = String(text ?? '').trim()
  if (!t) return { share: false, reason: 'empty' }
  if (String(scopeType) === 'owner') return { share: false, reason: 'owner' }
  if (PRIVACY.test(t)) return { share: false, reason: 'privacy' }
  const allow = Array.isArray(patterns) && patterns.length ? new RegExp(patterns.join('|')) : TOPIC
  if (!allow.test(t)) return { share: false, reason: 'not-topic' }
  if (!fromSelf && String(scopeType) !== 'public') return { share: false, reason: 'not-self' }
  return { share: true, reason: fromSelf ? 'self' : 'public' }
}
export function ensureShareAudit(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS memory_share (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    ok INTEGER NOT NULL DEFAULT 0,
    at INTEGER NOT NULL DEFAULT 0
  )`)
}
export async function shareNewMemory(db, { id = 0, text = '', scopeType = 'owner', fromSelf = false, cfg = {}, llm = null, insertMemory } = {}) {
  ensureShareAudit(db)
  const audit = (reason, ok) => { try { db.prepare('INSERT INTO memory_share(memory_id,reason,ok,at) VALUES(?,?,?,?)').run(Number(id) || 0, String(reason).slice(0, 60), ok ? 1 : 0, Date.now()) } catch {} }
  if (cfg.autoShare !== true) { audit('disabled', false); return { share: false, reason: 'disabled' } }
  let verdict = classifyShare({ text, scopeType, fromSelf, patterns: cfg.autoSharePatterns })
  if (verdict.share && cfg.autoShareLlm === true && typeof llm === 'function') {
    try { const ok = await llm(text); if (ok === false) verdict = { share: false, reason: 'llm-refused' } } catch { verdict = { share: false, reason: 'llm-failed' } }
  }
  if (!verdict.share) { audit(verdict.reason, false); return verdict }
  try {
    const shareId = `share:${id || Date.now()}`
    const dup = db.prepare('SELECT id FROM memories WHERE source_msg_id=?').get(shareId)
    if (dup) { audit('duplicate', false); return { share: false, reason: 'duplicate' } }
    const newId = await insertMemory(db, { kind: 'episode', text: `[汐的近况] ${text}`.slice(0, 300), layer: 'auto', scopeType: 'public', scopeId: '', sourceChannel: 'auto-share', sourceMsgId: shareId, extractorVersion: 'auto-share', sourceTs: Date.now(), importance: 0.3, confidence: 1 })
    audit(verdict.reason, true)
    return { share: true, reason: verdict.reason, id: newId }
  } catch (e) { audit('write-failed', false); return { share: false, reason: 'write-failed' } }
}
