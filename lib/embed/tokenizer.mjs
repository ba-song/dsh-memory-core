// 纯 JS BERT WordPiece（与 Python tokenizers 对拍一致）
import { readFileSync } from 'node:fs'
const isCJK = (c) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c)
const isPunct = (c) => /[\p{P}\p{S}]/u.test(c)
let vocab = null
export function loadVocab(modelDir) {
  if (vocab) return vocab
  const tj = JSON.parse(readFileSync(`${modelDir}/tokenizer.json`, 'utf8'))
  vocab = tj.model.vocab
  return vocab
}
function basic(text) {
  const out = []; let buf = ''
  for (const ch of String(text).toLowerCase()) {
    if (/\s/.test(ch)) { if (buf) { out.push(buf); buf = '' } continue }
    if (isCJK(ch) || isPunct(ch)) { if (buf) { out.push(buf); buf = '' } out.push(ch); continue }
    buf += ch
  }
  if (buf) out.push(buf)
  return out
}
function wordpiece(w) {
  if (vocab[w] !== undefined) return [vocab[w]]
  const ids = []; let s = 0
  while (s < w.length) {
    let e = w.length; let cur = null
    while (s < e) { const sub = (s > 0 ? '##' : '') + w.slice(s, e); if (vocab[sub] !== undefined) { cur = vocab[sub]; break } e-- }
    if (cur === null) return [100]
    ids.push(cur); s = e
  }
  return ids
}
export function encode(text) {
  const ids = [101]
  for (const t of basic(text)) ids.push(...wordpiece(t))
  ids.push(102)
  return ids
}
