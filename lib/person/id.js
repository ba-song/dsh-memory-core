/** person 级归档（2026-11-07）：把「房间/渠道」归到「人」 */
const PREFIX = 'person:'
export function normalizeChannel(ch) { const c = String(ch ?? '').toLowerCase(); return c === 'qq' ? 'qq' : c === 'mail' ? 'mail' : (c || 'unknown') }
export function resolvePersonId({ channel = '', contactId = '', cwd = '', owner = {} } = {}) {
  const ch = normalizeChannel(channel)
  const cid = String(contactId ?? '').trim()
  const ownerQQ = String(owner.ownerQQ ?? '').trim()
  const ownerMail = String(owner.ownerEmail ?? owner.mailTo ?? '').trim().toLowerCase()
  const ownerDir = String(owner.ownerPrivateDir ?? '').trim()
  if (ch === 'qq' || (!channel && /私聊_|QQ会话/.test(String(cwd)))) {
    const qq = cid || String(cwd).match(/私聊_([0-9]{5,})/)?.[1] || ''
    if (!qq) return ''
    return ownerQQ && qq === ownerQQ ? 'person:owner' : `${PREFIX}contact:qq:${qq}`
  }
  if (ch === 'mail') {
    const addr = cid.toLowerCase()
    if (!addr) return ''
    return ownerMail && addr === ownerMail ? 'person:owner' : `${PREFIX}contact:mail:${addr}`
  }
  return ''
}
export function parsePersonId(pid) { const p = String(pid ?? ''); if (!p.startsWith(PREFIX)) return null; const rest = p.slice(PREFIX.length); if (rest === 'owner') return { kind: 'owner' }; const [kind, ch, ...id] = rest.split(':'); if (kind !== 'contact') return null; return { kind, channel: ch, contactId: id.join(':') } }
