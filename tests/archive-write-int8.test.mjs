/**
 * 2026-11-17：验证**写入端**真的把向量写成 int8。
 *
 * 为什么单独测：迁移只处理存量；新消息进来时是 `enqueueRawVector` 在写。
 * 如果这里漏改，库会慢慢长回 float32（双格式读取不报错，只会静默变胖）。
 * 这里用假 embedFn 走真实写入函数，直接断言落库的字节格式与精度。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { RawArchive } from '../lib/ingest/archive.js'
import { decodeVector, isInt8Vector } from '../lib/store/vector-codec.js'

const DIM = 16
const FAKE = Array.from({ length: DIM }, (_, i) => Math.sin(i + 1) * 0.7)

function boot() {
  const dir = mkdtempSync(join(tmpdir(), 'archive-i8-'))
  const db = new DatabaseSync(join(dir, 'memory.db'))
  const arch = new RawArchive({ db, dir, cwdPrefixes: ['/tmp/proj'], embedFn: async () => [Float32Array.from(FAKE)] })
  // 手动插一行 raw_meta，拿到真实 id（enqueueRawVector 只依赖 id + 文本）
  const info = db.prepare("INSERT INTO raw_meta(day,at,role,raw_text,cwd,tombstone) VALUES('2026-11-17',?,'user','今天在厨房炒五花肉，火候没掌握好','/tmp/proj',0)").run(Date.now())
  return { dir, db, arch, rid: Number(info.lastInsertRowid) }
}

async function waitVec(db) {
  for (let i = 0; i < 80; i++) {
    const c = Number(db.prepare('SELECT count(*) c FROM raw_vectors').get().c)
    if (c) return c
    await new Promise((r) => setTimeout(r, 20))
  }
  return 0
}

test('W1 新写入的向量是 int8 格式（dim + 4 字节）', async () => {
  const { dir, db, arch, rid } = boot()
  arch.enqueueRawVector(rid, '今天在厨房炒五花肉，火候没掌握好')
  assert.ok(await waitVec(db), '应当写入一条向量')
  const row = db.prepare('SELECT dim, vec FROM raw_vectors LIMIT 1').get()
  assert.equal(Number(row.dim), DIM)
  assert.equal(Number(row.vec.byteLength), DIM + 4, `int8 应为 dim+4，实际 ${row.vec.byteLength}`)
  assert.equal(isInt8Vector(row.dim, row.vec), true)
  db.close(); rmSync(dir, { recursive: true, force: true })
})

test('W2 写入的向量能解码，误差不超过一个量化步长', async () => {
  const { dir, db, arch, rid } = boot()
  arch.enqueueRawVector(rid, '第二条测试消息，内容够长才会建向量')
  assert.ok(await waitVec(db))
  const row = db.prepare('SELECT dim, vec FROM raw_vectors LIMIT 1').get()
  const back = decodeVector(Number(row.dim), row.vec)
  assert.ok(back, '必须能解码')
  const maxErr = Math.max(...FAKE.map((x, i) => Math.abs(x - back[i])))
  const step = Math.max(...FAKE.map(Math.abs)) / 127
  assert.ok(maxErr <= step * 1.01, `量化误差 ${maxErr} 应 ≤ 一个步长 ${step}`)
  db.close(); rmSync(dir, { recursive: true, force: true })
})
