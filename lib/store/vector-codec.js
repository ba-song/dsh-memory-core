/**
 * 原话向量编解码（2026-11-17）
 *
 * 背景：`raw_vectors` 在手机上是库的 81%（99MB / 50,670 条，512 维 float32）。
 * 改成 int8 量化后降到 24.7MB，而实测精度损失可忽略：
 *   平均余弦误差 5.5e-4、最大 2.4e-3、400 条样本检索 top-10 **完全一致**。
 *
 * 格式是**自描述**的，所以不需要新增列、也不需要版本标记：
 *   float32（旧） : byteLength === dim * 4
 *   int8（新）    : byteLength === dim + 4   ← 前 4 字节是 float32 的 scale，后面每维 1 字节
 * 读取时按长度判断，两种都能读 → 老库、灰度期混写、回滚都安全。
 */

/** 把向量编码成 int8 + scale（dim + 4 字节）。 */
export function encodeVector(vec) {
  const f = vec instanceof Float32Array ? vec : Float32Array.from(vec ?? [])
  let maxAbs = 0
  for (let i = 0; i < f.length; i++) {
    const a = Math.abs(f[i])
    if (a > maxAbs) maxAbs = a
  }
  const scale = maxAbs > 0 ? maxAbs / 127 : 1
  const buf = Buffer.allocUnsafe(4 + f.length)
  buf.writeFloatLE(scale, 0)
  for (let i = 0; i < f.length; i++) {
    const q = Math.round(f[i] / scale)
    buf.writeInt8(q > 127 ? 127 : q < -127 ? -127 : q, 4 + i)
  }
  return buf
}

/** 这个 blob 是 int8 格式吗？（dim 未知时返回 false，交给调用方按 float32 处理） */
export function isInt8Vector(dim, blob) {
  const d = Number(dim)
  const len = Number(blob?.byteLength ?? blob?.length ?? 0)
  return d > 0 && len === d + 4
}

/**
 * 解码成 Float32Array（统一表示，调用方只管点积）。
 * 无法识别时返回 null —— 调用方应跳过该条，而不是抛。
 */
export function decodeVector(dim, blob) {
  const d = Number(dim)
  if (!(d > 0) || !blob) return null
  const u8 = blob instanceof Uint8Array ? blob : new Uint8Array(blob)
  const len = u8.byteLength
  if (len === d * 4) {
    // float32：复制一份，避免 byteOffset 未对齐时抛 RangeError
    const copy = new Uint8Array(len)
    copy.set(u8)
    return new Float32Array(copy.buffer, 0, d)
  }
  if (len === d + 4) {
    const scale = Buffer.from(u8.buffer, u8.byteOffset, 4).readFloatLE(0)
    const out = new Float32Array(d)
    for (let i = 0; i < d; i++) {
      // Uint8Array 取出的是 0..255，要按补码还原成 -128..127
      const q = (u8[4 + i] << 24) >> 24
      out[i] = q * scale
    }
    return out
  }
  return null
}
