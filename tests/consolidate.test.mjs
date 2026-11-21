import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const DIR = mkdtempSync(join(tmpdir(), 'dy-cons-'))
process.env.DY_MEMORY_DIR = DIR
const { openDb } = await import('../lib/store/db.js')
const { parseConsolidation, maskText } = await import('../lib/consolidate/llm.js')
const { buildDigestText, gatherWindow, loadDailyDedupCandidates } = await import('../lib/consolidate/daily.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { memoryScore, accessFactorOf, emotionFactorOf } = await import('../lib/maintain/factors.js')

test('日结解析：过滤临时状态/隐私/坏主语，保留合法条目', () => {
  const raw = JSON.stringify({ facts: [
    { kind: 'fact', text: '主人最近在改记忆插件', confidence: 0.8, source: 1 },
    { kind: 'preference', text: '主人喜欢烤生蚝', confidence: 0.7, source: 2 },
    { kind: 'fact', text: '主人正在洗澡', source: 3 },
    { kind: 'fact', text: '主人的手机号 13800138000', source: 4 },
    { kind: 'fact', text: '对方明天来', source: 5 },
    { kind: 'bad', text: '类别不对', source: 6 },
  ], profile: '主人最近熬夜多。今天中午一点多才吃饭。说话简短直接。', diary: '今天聊了插件', shortterm: [{ kind: 'promise', content: '周五陪主人看海', context: '约定', importance: 0.9 }], lessons: [{ text: '答应的事要提前确认时间', confidence: 0.8 }] })
  const r = parseConsolidation(raw)
  assert.equal(r.ok, true)
  assert.equal(r.facts.length, 2)
  assert.equal(r.profile, '主人最近熬夜多。说话简短直接。', '画像不能带当天时间流水')
  assert.equal(r.shortterm?.[0]?.content, '周五陪主人看海')
  assert.equal(r.lessons?.[0]?.text, '答应的事要提前确认时间')
  assert.equal(maskText('电话13800138000', 60).includes('13800138000'), false)
})

test('对话摘录：只收 user/self，排除工具事件与群聊，取最近 N 条', async () => {
  const db = openDb(DIR).db
  db.exec(`CREATE TABLE IF NOT EXISTS raw_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, file TEXT, line_no INTEGER,
    seq INTEGER, role TEXT, speaker TEXT, channel TEXT, tombstone INTEGER DEFAULT 0,
    chars INTEGER DEFAULT 0, raw_text TEXT DEFAULT '', at INTEGER, extra TEXT DEFAULT '{}', cwd TEXT DEFAULT '')`)
  const t = Date.now()
  const ins = (role, text, at, cwd = '/sdcard/DSHA/生活/数据/home') => db.prepare('INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,at,raw_text,cwd) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('2026-11-12', 'f', 1, 1, role, role, 'qq', 0, 10, at, text, cwd)
  ins('user', '主人早', t - 5000)
  ins('self', '汐早', t - 4000)
  ins('具', 'dy_say {"x":1}', t - 3000)
  ins('self-thought', '内部推理', t - 2900)
  ins('user', '群里的话', t - 2000, '/sdcard/DSHA/渠道/qq-群/707380948')
  ins('user', '最近一条', t - 1000)
  const rows = gatherWindow(db, { since: t - 3600000, until: t, limit: 10 })
  assert.deepEqual(rows.map((r) => r.text), ['主人早', '汐早', '最近一条'], 'ROWS='+JSON.stringify(rows.map(r=>[r.role,r.text])))
  const text = buildDigestText(rows)
  assert.ok(text.includes('#1 [主人] 主人早'), 'TEXT='+text)
  assert.ok(text.includes('#2 [汐] 汐早'), 'TEXT2='+text)
  assert.ok(!text.includes('dy_say'))
  assert.ok(!text.includes('群里的话'))
})

test('日结去重候选：只比较 current 记忆，同时保留 90 天窗口和排序上限语义', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-daily-validity-'))
  const { db } = openDb(dir)
  const at = Date.UTC(2026, 10, 21)
  try {
    const add = (text, opts = {}) => insertMemory(db, {
      kind: 'fact', text, createdAt: opts.createdAt ?? at - 86400000,
      status: opts.status ?? 'active',
      validFrom: opts.validFrom ?? null,
      validTo: opts.validTo ?? null,
      layer: 'auto',
    })
    const current = await add('current daily candidate', { validFrom: at - 1000 })
    const legacyNoStart = await add('legacy null valid_from candidate')
    const future = await add('future daily candidate', { validFrom: at + 1 })
    const expired = await add('expired daily candidate', { validFrom: at - 1000, validTo: at })
    const superseded = await add('superseded daily candidate', { validFrom: at - 1000 })
    db.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(999999, superseded)
    const archived = await add('archived daily candidate', { status: 'archived' })
    const tooOld = await add('outside daily lookback', { createdAt: at - 90 * 86400000 - 1 })

    const rows = loadDailyDedupCandidates(db, at)
    const ids = rows.map((row) => Number(row.id))
    assert.ok(ids.includes(current), '当前有效记录应参与相似度去重')
    assert.ok(ids.includes(legacyNoStart), 'valid_from NULL 的旧记录仍按 current helper 兼容')
    for (const id of [future, expired, superseded, archived, tooOld]) {
      assert.ok(!ids.includes(id), `无效/超窗记录不应参与日结去重：#${id}`)
    }
    assert.ok(rows.every((row) => row.created_at_epoch >= at - 90 * 86400000))
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a), '候选仍按 id DESC')
  } finally {
    try { db.close() } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
})

test('多因子：最近访问/情绪/关系都会加权重', () => {
  const base = { kind: 'fact', importance: 0.5, created_at_epoch: Date.now() - 30 * 86400000, access_count: 0, meta: '{}' }
  const a = memoryScore(base).score
  const b = memoryScore({ ...base, access_count: 5, last_access_epoch: Date.now() - 86400000 }).score
  assert.ok(b > a)
  assert.ok(accessFactorOf({ access_count: 5, last_access_epoch: Date.now() - 86400000 }) > accessFactorOf({ access_count: 0 }))
  assert.ok(emotionFactorOf({ meta: JSON.stringify({ emotionIntensity: 1 }) }) > emotionFactorOf({ meta: '{}' }))
})
