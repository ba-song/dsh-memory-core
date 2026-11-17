import test from 'node:test'
import assert from 'node:assert/strict'
import { segmentText, locateSegments, takeSegments } from '../lib/segments.js'

const LONG = `## 背景\n${'主人和汐在讨论部署。'.repeat(80)}\n\n## 部署命令\n${'pnpm build 然后 zstd 压缩 /srv/app/deploy。'.repeat(60)}\n\n## 坑\n空行不是硬边界；percent-encoding 要注意。`

test('切段：按 ## 标题、长节再断、段号连续', () => {
  const segs = segmentText(LONG)
  assert.ok(segs.length >= 3)
  assert.deepEqual(segs.map((s) => s.idx), segs.map((_, i) => i + 1))
  assert.ok(segs.some((s) => s.label.startsWith('部署命令')))
  assert.ok(segs.every((s) => s.chars > 0))
})

test('段级 BM25：定位到正确段，只回预览不回正文', () => {
  const hit = locateSegments(LONG, 'zstd /srv/app/deploy')
  assert.ok(hit.length >= 1)
  assert.ok(hit[0].label.includes('部署命令') || hit[0].label.includes('坑'))
  assert.ok(hit[0].terms.length >= 1)
  assert.ok(!hit[0].preview.includes('\n'))
  const picked = takeSegments(LONG, [hit[0].idx])
  assert.equal(picked.segments.length, 1)
  assert.ok(picked.segments[0].text.length > 0)
})

test('短文本只有 1 段；取不存在的段返回空', () => {
  assert.equal(segmentText('一句话').length, 1)
  assert.equal(takeSegments('一句话', [99]).segments.length, 0)
})
