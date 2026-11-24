import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/store/db.js'
import { addPin, donePin, dropPin, renderPins, listPins } from '../lib/pins.js'
import { handoffBrief } from '../lib/handoff/brief.js'
import { ensureProjectSchema, upsertProject, addDecision, resolveProject } from '../lib/project/index.js'
import { insertMemory } from '../lib/store/memories.js'

test('话头：pins 自身 CRUD 正常，但 handoff 不自动读取/输出 pins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pins-'))
  const { db } = openDb(dir)
  try {
    for (let i = 0; i < 6; i++) addPin(db, 'self', `第 ${i} 条还没接上的话`, 1_800_000_000_000 + i)
    assert.equal(listPins(db, 'self').length, 6)

    // pins 渲染函数本身仍可用（供明确的 pin list 工具使用）
    const rendered = renderPins(db, 'self')
    assert.ok(rendered.includes('【话头】'))
    assert.ok(rendered.includes('还有 1 条没列'))
    assert.ok(donePin(db, 'self', 1))
    assert.equal(listPins(db, 'self').length, 5)
    assert.ok(dropPin(db, 'self', 1))
    assert.equal(listPins(db, 'self').length, 4)

    // P0-1：handoff 不得自动读取 db 中的 pins，也不得以任何回退路径输出 【话头】
    const empty = handoffBrief(db, { isOwner: true, cwd: '/tmp/no-project', recent: [] })
    assert.equal(empty.text, '')
    assert.ok(!empty.text.includes('【话头】'))
    assert.equal(empty.sections.project, '')
    assert.deepEqual(empty.sections.decisions, [])
    assert.deepEqual(empty.sections.todos, [])

    const withRecent = handoffBrief(db, { isOwner: true, cwd: '/tmp/no-project', recent: [{ role: 'user', text: '在吗' }] })
    assert.ok(withRecent.text.includes('在吗'))
    assert.ok(!withRecent.text.includes('【话头】'), 'pins 不得经回退进入 handoff')
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('handoff 不输出 Owner 标签/项目/决策/待办，空 recent 不回退到全局信息', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pins-tags-'))
  const { db } = openDb(dir)
  try {
    // Owner 全局信息：标签、项目、决策、待办 —— 均不得进入 handoff
    await insertMemory(db, { kind: 'preference', text: '喜欢猫', scopeType: 'owner', layer: 'manual' })
    const WS = '/sdcard/DSHA/工作区'
    ensureProjectSchema(db)
    const rp = resolveProject(WS + '/项目A')
    const pj = upsertProject(db, { root: rp.root, name: rp.name }).project
    addDecision(db, { project: pj.id, title: '用 SQLite', choice: '文件库', reason: '轻量' })
    const todo = await insertMemory(db, { kind: 'todo', text: '补测试', scopeType: 'owner', layer: 'manual' })
    try { db.prepare('UPDATE memories SET project_id=? WHERE id=?').run(pj.id, todo) } catch {}

    // 空 recent：不得回退到 pins/项目/决策/待办/标签
    const empty = handoffBrief(db, { cwd: WS + '/项目A', isOwner: true, recent: [] })
    assert.equal(empty.text, '')
    assert.equal(empty.sections.project, '')
    assert.deepEqual(empty.sections.decisions, [])
    assert.deepEqual(empty.sections.todos, [])

    // 有 recent：只处理调用方明确传入的消息，不混入 Owner 全局信息
    const withRecent = handoffBrief(db, { cwd: WS + '/项目A', isOwner: true, recent: [{ role: 'user', text: '这个问题怎么修' }] })
    assert.ok(withRecent.text.includes('这个问题怎么修'))
    for (const forbidden of ['【话头】', '标签：', '项目：', '决策：', '待办：', '喜欢猫', '补测试', '用 SQLite']) {
      assert.ok(!withRecent.text.includes(forbidden), `handoff 不得包含 Owner 全局信息：${forbidden}`)
    }
    assert.equal(withRecent.sections.project, '')
    assert.deepEqual(withRecent.sections.decisions, [])
    assert.deepEqual(withRecent.sections.todos, [])
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('recent 中调用方明确传入的消息仍按现有契约处理（最后没回/已回/截断）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pins-recent-'))
  const { db } = openDb(dir)
  try {
    const unanswered = handoffBrief(db, { recent: [{ role: 'user', text: '还没回的一句' }] })
    assert.ok(unanswered.text.includes('最后没回：还没回的一句'))
    assert.ok(unanswered.sections.lastUnanswered.includes('还没回的一句'))

    const answered = handoffBrief(db, { recent: [{ role: 'user', text: '问一句' }, { role: 'assistant', text: '答一句' }] })
    assert.ok(!answered.text.includes('最后没回'))
    assert.ok(answered.text.includes('最近话题'))
    assert.ok(answered.text.includes('问一句'))

    const long = handoffBrief(db, { recent: Array.from({ length: 5 }, (_, i) => ({ role: 'user', text: '很长的话'.repeat(40) + i })), maxChars: 120 })
    assert.ok(long.text.length <= 120)

    const onlyAssistant = handoffBrief(db, { recent: [{ role: 'assistant', text: '只有回复' }] })
    assert.equal(onlyAssistant.text, '')
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
