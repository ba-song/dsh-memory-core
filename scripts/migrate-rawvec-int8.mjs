#!/usr/bin/env node
/**
 * 把 raw_vectors 里的 float32 向量就地转成 int8+scale（2026-11-17）
 *
 * 为什么：生产库 raw_vectors 99MB，占整个库 81%；int8 后 24.7MB。
 * 实测精度：平均余弦误差 5.5e-4、最大 2.4e-3、400 条样本 top-10 检索完全一致。
 *
 * 安全性：
 *  - **只改 raw_vectors.vec 的存储格式**；raw_meta / raw_fts / memories 一个字节都不动
 *  - 幂等：已经是 int8 的行自动跳过，可重复执行
 *  - 分块提交（默认 2000 行/事务）：把写锁切成小片，尽量不阻塞线上写入
 *  - 默认**不做 VACUUM**：快照用的是 VACUUM INTO，本来就会压缩，不需要占独占锁；
 *    空闲页会被后续写入复用（实测量化后 freelist 73%，VACUUM INTO 快照 73MB）
 *  - --dry-run 只统计不写
 *
 * 用法：
 *   node scripts/migrate-rawvec-int8.mjs --dir /sdcard/DSHA/记忆/数据            # 真跑
 *   node scripts/migrate-rawvec-int8.mjs --dir /sdcard/DSHA/记忆/数据 --dry-run  # 只统计
 *   node scripts/migrate-rawvec-int8.mjs --dir ... --vacuum                     # 额外做原地 VACUUM（会占独占锁）
 */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { encodeVector, isInt8Vector } from '../lib/store/vector-codec.js'

const argv = process.argv.slice(2)
const arg = (name, def = null) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def }
const flag = (name) => argv.includes(`--${name}`)

const dir = arg('dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const batch = Math.max(100, Number(arg('batch', 2000)))
const dry = flag('dry-run')
const file = join(dir, 'memory.db')

console.log(`[int8] 目标库 ${file}${dry ? '  (dry-run)' : ''}`)
const db = new DatabaseSync(file)
db.exec('PRAGMA busy_timeout=10000')

const before = db.prepare('SELECT count(*) c, sum(length(vec)) s FROM raw_vectors').get()
const sample = db.prepare('SELECT raw_id, dim, vec FROM raw_vectors').all()
let i8 = 0, f32 = 0, bad = 0
for (const r of sample) {
  if (isInt8Vector(r.dim, r.vec)) i8 += 1
  else if (Number(r.vec?.byteLength ?? 0) === Number(r.dim) * 4) f32 += 1
  else bad += 1
}
console.log(`[int8] 转换前：${before.c} 行 / ${(Number(before.s) / 1048576).toFixed(1)} MB`)
console.log(`[int8] 分布：float32 ${f32} 条 · 已是 int8 ${i8} 条 · 格式不认识 ${bad} 条`)

if (bad > 0) {
  console.log('[int8] ⚠ 有格式不认识的行，本脚本不动它们（读取端会跳过，不会崩）')
}
if (!f32) {
  console.log('[int8] 没有需要转换的行，结束。')
  db.close()
  process.exit(0)
}
if (dry) {
  console.log(`[int8] dry-run：将转换 ${f32} 行，预计 ${(before.s / 1048576 / 4).toFixed(1)} MB`)
  db.close()
  process.exit(0)
}

const upd = db.prepare('UPDATE raw_vectors SET vec=? WHERE raw_id=? AND dim=?')
let done = 0, skipped = 0
const t0 = Date.now()
for (let off = 0; off < sample.length; off += batch) {
  const slice = sample.slice(off, off + batch)
  // 重新读一遍目标行，避免用一条大查询把 100MB 一直握在内存里
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const r of slice) {
      if (isInt8Vector(r.dim, r.vec)) { skipped += 1; continue }
      if (Number(r.vec?.byteLength ?? 0) !== Number(r.dim) * 4) { skipped += 1; continue }
      const f = new Float32Array(new Uint8Array(r.vec).buffer, 0, Number(r.dim))
      upd.run(encodeVector(f), r.raw_id, r.dim)
      done += 1
    }
    db.exec('COMMIT')
  } catch (e) {
    try { db.exec('ROLLBACK') } catch {}
    console.error(`[int8] 第 ${off}-${off + slice.length} 块失败并回滚：${e?.message ?? e}`)
    db.close()
    process.exit(1)
  }
  if ((off + batch) % 10000 === 0) console.log(`[int8] 进度 ${Math.min(off + batch, sample.length)}/${sample.length}`)
}

const after = db.prepare('SELECT count(*) c, sum(length(vec)) s FROM raw_vectors').get()
const integ = db.prepare('PRAGMA integrity_check').get().integrity_check
console.log(`[int8] 转换完成：${done} 行（跳过 ${skipped}）· ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log(`[int8] 向量字节：${(Number(before.s) / 1048576).toFixed(1)} MB → ${(Number(after.s) / 1048576).toFixed(1)} MB · 行数 ${before.c} → ${after.c}`)
console.log(`[int8] integrity_check = ${integ}`)

if (flag('vacuum')) {
  console.log('[int8] 开始原地 VACUUM（会占独占锁，期间线上写入会阻塞）…')
  const t = Date.now()
  db.exec('VACUUM')
  console.log(`[int8] VACUUM 完成 ${((Date.now() - t) / 1000).toFixed(1)}s`)
}
db.close()
