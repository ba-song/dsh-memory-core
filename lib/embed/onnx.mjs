import { loadVocab, encode } from './tokenizer.mjs'

let ort = null

const INSTRUCTION = '为这个句子生成表示以用于检索相关文章：'
let sess = null, dim = 0, failed = false, loading = null

export async function loadEmbed(modelDir) {
  if (sess) return { ok: true, dim }
  if (failed) return { ok: false, error: '之前加载失败' }
  if (loading) return loading
  loading = (async () => {
    try {
      ort = ort ?? (await import('onnxruntime-node')).default
      loadVocab(modelDir)
      sess = await ort.InferenceSession.create(`${modelDir}/model_quantized.onnx`)
      dim = 512
      return { ok: true, dim }
    } catch (e) {
      failed = true
      return { ok: false, error: String(e?.message ?? e) }
    } finally { loading = null }
  })()
  return loading
}

export function embedAvailable() { return !!sess }

export async function embedTexts(texts, { query = false, maxLen = 512 } = {}) {
  if (!sess) return null
  const input = texts.map((t) => encode(query ? INSTRUCTION + t : t))
  const L = Math.min(maxLen, Math.max(...input.map((e) => e.length)))
  const n = texts.length
  const ids = new BigInt64Array(n * L), mask = new BigInt64Array(n * L)
  input.forEach((e, i) => { for (let j = 0; j < Math.min(e.length, L); j++) { ids[i * L + j] = BigInt(e[j]); mask[i * L + j] = 1n } })
  const zeros = new BigInt64Array(n * L)
  const out = await sess.run({
    input_ids: new ort.Tensor('int64', ids, [n, L]),
    attention_mask: new ort.Tensor('int64', mask, [n, L]),
    token_type_ids: new ort.Tensor('int64', zeros, [n, L]),
  })
  const key = sess.outputNames[0]
  const h = out[key].data
  const d = out[key].dims[2]
  const vecs = []
  for (let i = 0; i < n; i++) {
    const v = new Float32Array(d); let c = 0
    for (let j = 0; j < L; j++) if (mask[i * L + j] === 1n) { c++; for (let k = 0; k < d; k++) v[k] += h[(i * L + j) * d + k] }
    let norm = 0
    for (let k = 0; k < d; k++) { v[k] /= (c || 1); norm += v[k] * v[k] }
    norm = Math.sqrt(norm) || 1
    for (let k = 0; k < d; k++) v[k] /= norm
    vecs.push(v)
  }
  return vecs
}
