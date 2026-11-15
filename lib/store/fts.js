/** CJK bigram：标点/空白 → 空格（在语义边界断开），再生成相邻二元组 */
const PUNCT = /[\p{P}\p{S}\s]/u
export function bigrams(text) {
  const s = String(text ?? '')
  let out = ''
  for (const ch of s) out += (PUNCT.test(ch) ? ' ' : ch)
  const parts = out.split(/\s+/).filter(Boolean)
  const grams = []
  for (const p of parts) {
    const chars = [...p]
    if (chars.length === 1) { grams.push(chars[0]); continue }
    for (let i = 0; i < chars.length - 1; i++) grams.push(chars[i] + chars[i + 1])
  }
  return grams.join(' ')
}
/** 查询短语：整体加双引号，内部引号加倍；空则 null（必须短路） */
export function phrase(text) {
  const b = bigrams(text)
  if (!b) return null
  return '"' + b.replaceAll('"', '""') + '"'
}
export function indexTexts(db, id, text) {
  // 防御：同一 rowid 先清再写，避免残留索引导致 constraint failed
  try { db.prepare('DELETE FROM fts_bigram WHERE rowid=?').run(id) } catch {}
  try { db.prepare('DELETE FROM fts_trigram WHERE rowid=?').run(id) } catch {}
  const b = bigrams(text)
  const raw = String(text ?? '')
  db.prepare('INSERT INTO fts_bigram(rowid, text) VALUES(?,?)').run(id, b || raw)
  // trigram 对 <3 字无意义，仍写入原文，查询侧路由保证只在 ≥3 字时使用
  db.prepare('INSERT INTO fts_trigram(rowid, text) VALUES(?,?)').run(id, raw)
}
export function removeTexts(db, id) {
  db.prepare('DELETE FROM fts_bigram WHERE rowid=?').run(id)
  db.prepare('DELETE FROM fts_trigram WHERE rowid=?').run(id)
}
export function searchBigram(db, q, limit = 50) {
  const grams = bigrams(q).split(' ').filter(Boolean)
  if (!grams.length) return []
  // 每个 bigram 单独引号 + OR：允许文档只包含查询的一部分
  const expr = grams.map((g) => '"' + g.replaceAll('"', '""') + '"').join(' OR ')
  try { return db.prepare('SELECT rowid AS id FROM fts_bigram WHERE fts_bigram MATCH ? LIMIT ?').all(expr, limit) } catch { return [] }
}
export function searchTrigram(db, q, limit = 50) {
  const chars = [...String(q ?? '')].filter((c) => !PUNCT.test(c))
  if (chars.length < 3) return []
  const grams = []
  for (let i = 0; i + 3 <= chars.length; i++) grams.push(chars.slice(i, i + 3).join(''))
  const expr = [...new Set(grams)].map((g) => '"' + g.replaceAll('"', '""') + '"').join(' OR ')
  try { return db.prepare('SELECT rowid AS id FROM fts_trigram WHERE fts_trigram MATCH ? LIMIT ?').all(expr, limit) } catch { return [] }
}
