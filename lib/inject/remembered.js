/** P5.2：常驻「记得的事」——只取 preference/relation/skill，fact 不进 */
import { overlaps } from './hits.js'
import { scopeWhere } from '../scope.js'

const HEAD = '【记得的事】'
const TAIL = '【记得的事结束】'
export const BUDGET = 400
export const MAX_ITEMS = 8
export const MAX_ITEM_CHARS = 50
const CONNECTORS = ['但', '但是', '和', '或', '而且', '然后', '所以', '因为', '以及', '不过', '并且']

export function pickRemembered(db, { stableText = '', scope = null } = {}) {
  const stableLines = String(stableText ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
  let rows = []
  try {
    const w = scopeWhere(scope)
    rows = db.prepare(`SELECT id,kind,text,importance,access_count FROM memories
      WHERE status='active' AND ${w.sql} AND kind IN ('preference','relation','skill')
        AND (valid_to IS NULL OR valid_to>?)
      ORDER BY pinned DESC, importance DESC, COALESCE(last_access_epoch,created_at_epoch) DESC LIMIT 80`).all(...w.params, Date.now())
  } catch { return { block: '', count: 0, skipped: [] } }
  const picked = []
  const skipped = []
  let used = HEAD.length + TAIL.length + 2
  for (const r of rows) {
    // M1：所有 preference 均由独立生命周期管理；长期项进入 dy-preference，非长期项不作常驻注入。
    if (r.kind === 'preference') { skipped.push({ id: r.id, reason: 'preference-managed-separately' }); continue }
    if (picked.length >= MAX_ITEMS) break
    let text = String(r.text ?? '').trim()
    if (!text) continue
    if (text.length > MAX_ITEM_CHARS) {
      const cut = text.slice(0, MAX_ITEM_CHARS)
      if (CONNECTORS.some((c) => cut.endsWith(c))) { skipped.push({ id: r.id, reason: 'truncated-connector' }); continue }
      text = cut + '…'
    }
    if (stableLines.some((line) => overlaps(text, line))) { skipped.push({ id: r.id, reason: 'dup-stable' }); continue }
    const line = `- [${r.kind}] ${text}`
    if (used + line.length + 1 > BUDGET) break
    picked.push(line); used += line.length + 1
  }
  if (!picked.length) return { block: '', count: 0, skipped }
  return { block: [HEAD, ...picked, TAIL].join('\n'), count: picked.length, skipped }
}
