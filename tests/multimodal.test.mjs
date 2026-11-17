import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractAttachments, describeAttachment } from '../lib/multimodal.js'

const DIR = mkdtempSync(join(tmpdir(), 'mm-test-'))
test('提取附件：<path><type> 与 [图片]/[语音] 两种格式，去重', () => {
  const t = '<path>/a.jpg</path>\n<type>image</type>\n[语音] /b.wav\n[图片] /a.jpg'
  const a = extractAttachments(t)
  assert.equal(a.length, 2)
  assert.deepEqual(a.map((x) => x.type).sort(), ['audio', 'image'])
})
test('语音：没有 sidecar 时写“未转写”；有 .txt 时读转写', () => {
  const wav = join(DIR, 'v.wav'); writeFileSync(wav, 'x')
  assert.ok(describeAttachment(wav, 'audio').text.includes('未转写'))
  writeFileSync(`${wav}.txt`, '你好呀')
  assert.equal(describeAttachment(wav, 'audio').text, '你好呀')
})
test.after(() => { try { rmSync(DIR, { recursive: true, force: true }) } catch {} })
