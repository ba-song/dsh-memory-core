import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { buildStable } from '../lib/inject/stable.js'
import { isCorrection } from '../lib/inject/correction.js'
import { partsOf } from '../lib/adapter/timefmt.js'

const DIR = mkdtempSync(join(tmpdir(), 'dy-shortterm-'))
const { db } = openDb(DIR)
const now = Date.now()

test('短期记忆：只注入未过期的，按重要度排序', () => {
  const ins = db.prepare("INSERT INTO shortterm(self_id,scope_type,scope_id,kind,content,context,importance,at,expires_at,created_at) VALUES('','owner','',?,?,?,?,?,?,?)")
  ins.run('promise', '周五陪主人看海', '约定', 0.9, now, now + 86400000, now)
  ins.run('plan', '把 10 月底的日记补完', '待办', 0.6, now, now + 86400000, now)
  ins.run('event', '过期的事', '旧', 0.95, now - 2 * 86400000, now - 1000, now)
  const block = buildStable(DIR, { db, ownerDir: DIR, factsPath: '', budget: { facts: 420, pin: 100, shortterm: 400, shorttermItems: 5 }, scope: { level: 'owner' }, isOwner: true })
  assert.ok(block.includes('【记忆·最近三天（短期）】'))
  const p = partsOf(now)
  assert.ok(block.includes(`（${p.month}-${p.day} 记）`), '短期记忆应显示记录日期')
  assert.ok(block.includes('周五陪主人看海'))
  assert.ok(block.includes('把 10 月底的日记补完'))
  assert.ok(!block.includes('过期的事'))
  assert.ok(block.indexOf('周五陪主人看海') < block.indexOf('把 10 月底的日记补完'), '高重要度排前')
})

test('纠错检测：只认明确的否定/纠正', () => {
  for (const s of ['不是这样', '你记错了', '不对，我没说过', '别乱记']) assert.equal(isCorrection(s), true, s)
  for (const s of ['今天不是周一吗', '不是我想的那样也没关系', '好', '']) assert.equal(isCorrection(s), false, s)
})

test.after(() => { try { rmSync(DIR, { recursive: true, force: true }) } catch {} })
