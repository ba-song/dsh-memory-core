import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { loadEmbed, embedAvailable, embedTexts } from '../lib/embed/onnx.mjs'

const modelDir = '/opt/qqai/models/bge-small-zh'
test('BGE embedding model loads and separates related from unrelated text', { skip: !existsSync(modelDir + '/tokenizer.json') ? 'DSHA BGE model is not installed in this runner' : false }, async () => {
  const r = await loadEmbed(modelDir)
  assert.ok(r.ok, '模型应能加载: ' + r.error)
  assert.equal(embedAvailable(), true)
  await embedTexts(['warm'])
  const lat = []
  for (let i = 0; i < 8; i++) { const t = Date.now(); await embedTexts(['主人说想去看海，顺便买点吃的回来'], { query: true }); lat.push(Date.now() - t) }
  lat.sort((a, b) => a - b)
  const [q] = await embedTexts(['主人昨天说想去看海'], { query: true })
  const vs = await embedTexts(['主人想去海边玩', '今天股票大跌'])
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0)
  const rel = dot(q, vs[0]), irr = dot(q, vs[1])
  assert.ok(rel > 0.55, '相关应 >0.55，实际 ' + rel.toFixed(3))
  assert.ok(irr < 0.55, '无关应 <0.55，实际 ' + irr.toFixed(3))
  console.log(JSON.stringify({ ok: true, test: 'embed', dim: q.length, medianMs: lat[4], rel: +rel.toFixed(3), irr: +irr.toFixed(3) }))
})
