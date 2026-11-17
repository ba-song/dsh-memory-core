/**
 * 2026-11-17 int8 向量编解码。
 * 目标是「格式自描述、双读兼容、精度损失可忽略」——这几点都用断言钉住，
 * 防止以后有人改坏了导致线上旧 float32 行读不出来（那会让语义检索静默失效）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeVector, decodeVector, isInt8Vector } from '../lib/store/vector-codec.js'

const dim = 512
function vec(seed = 1) {
  const f = new Float32Array(dim)
  for (let i = 0; i < dim; i++) f[i] = Math.sin((i + 1) * seed) * 0.8
  return f
}
const cos = (a, b) => {
  let d = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

test('V1 int8 编码是自描述的：长度 = dim + 4', () => {
  const buf = encodeVector(vec())
  assert.equal(buf.length, dim + 4)
  assert.equal(isInt8Vector(dim, buf), true)
  assert.equal(isInt8Vector(dim, Buffer.alloc(dim * 4)), false, 'float32 不能被误判成 int8')
})

test('V2 往返精度：余弦误差 < 1e-2（实测生产平均 5.5e-4）', () => {
  let worst = 0
  for (let s = 1; s <= 8; s++) {
    const v = vec(s)
    const back = decodeVector(dim, encodeVector(v))
    assert.ok(back instanceof Float32Array)
    worst = Math.max(worst, Math.abs(cos(v, v) - cos(back, back)), Math.abs(1 - cos(v, back)))
  }
  assert.ok(worst < 1e-2, `最大余弦误差 ${worst}`)
})

test('V3 旧 float32 行必须仍能读（双格式兼容，否则线上检索会静默断）', () => {
  const v = vec(3)
  const legacy = Buffer.from(v.buffer, v.byteOffset, v.byteLength)
  assert.equal(isInt8Vector(dim, legacy), false)
  const back = decodeVector(dim, legacy)
  assert.ok(back instanceof Float32Array)
  back.forEach((x, i) => assert.equal(x, v[i], `第 ${i} 维不一致`))
})

test('V4 退化输入不抛：全零向量、空、长度不对', () => {
  const zero = decodeVector(dim, encodeVector(new Float32Array(dim)))
  assert.ok(zero instanceof Float32Array)
  zero.forEach((x) => assert.equal(x, 0))
  assert.equal(decodeVector(dim, null), null)
  assert.equal(decodeVector(dim, Buffer.alloc(7)), null, '长度既不是 dim*4 也不是 dim+4 → null')
  assert.equal(decodeVector(0, Buffer.alloc(4)), null)
})

test('V5 byteOffset 未对齐时也不抛（node:sqlite 的 BLOB 不保证对齐）', () => {
  const buf = encodeVector(vec(5))
  const shifted = Buffer.concat([Buffer.from([9]), buf]).subarray(1) // 人为错位
  const back = decodeVector(dim, shifted)
  assert.ok(back instanceof Float32Array)
  assert.equal(back.length, dim)
})
