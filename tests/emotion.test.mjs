import { openDb } from '../lib/store/db.js'
import { ingestEmotion, currentView, series, points, saveState } from '../lib/emotion/store.js'
import { scoreText, decayState, effectiveHalfLifeDays, salience, labelOf } from '../lib/emotion/core.js'
import { emotionLine } from '../lib/emotion/inject.js'
import assert from 'node:assert'
import { rmSync } from 'node:fs'

const dir = '/tmp/dy-emo-' + process.pid
rmSync(dir, { recursive: true, force: true })
const { db } = openDb(dir)

// 1) 四象限打分
const p1 = scoreText('太好了，我真的好开心！')
const p2 = scoreText('你怎么这样，我很难过')
const p3 = scoreText('今天一般')
const p4 = scoreText('气死我了，烦死了！！')
assert.ok(p1.valence > 0.5 && p1.arousal > 0.5, '正-高激动')
assert.ok(p2.valence < -0.2, '负向')
assert.ok(Math.abs(p3.valence) < 0.15, '中性')
assert.ok(p4.valence < -0.5 && p4.arousal > 0.5, '负-高激动')

// 2) 衰减：6h 心情好坏减半，30min 激动减半（相对基线 0.2）
const base = { valence: 0.8, arousal: 0.8, updatedAt: Date.now() - 6 * 3600e3 }
const d6 = decayState(base)
assert.ok(Math.abs(d6.valence - 0.4) < 0.02, '6h valence 半衰')
const base2 = { valence: 0, arousal: 0.8, updatedAt: Date.now() - 0.5 * 3600e3 }
const d30 = decayState(base2)
assert.ok(Math.abs(d30.arousal - 0.5) < 0.03, '30min arousal 半衰')

// 3) 显著性半衰期 14 → 21 天
assert.equal(effectiveHalfLifeDays(0), 14)
assert.equal(effectiveHalfLifeDays(1), 21)
const old = Date.now() - 14 * 86400e3
assert.ok(salience(1, old, 1) > salience(1, old, 0) * 1.2, '高激动记得更久')

// 4) 10 条语料覆盖四象限；两条线各自出点
const corpus = [
  '今天好开心，太好了！',
  '谢谢你，真的很喜欢',
  '我有点难过',
  '气死我了，烦死了！！',
  '还行吧，一般',
  '有点担心，怕搞砸',
  '累死了，好困',
  '哈哈哈，笑死我了',
  '有点失落，想哭',
  '平静的一天',
]
for (const t of corpus) ingestEmotion(db, { text: t, trigger: t.slice(0, 20), msgRef: 'test:' + t.length, at: Date.now() - 3600e3 })
const st = currentView(db)
assert.equal(st.session_key, 'global') // 默认全局
assert.ok(labelOf(st.valence, st.arousal))
const tl = series(db, 'global', Date.now() - 86400e3)
assert.ok(tl.length >= 8, '时间线有数据')
assert.ok(tl.every((r) => typeof r.valence === 'number' && typeof r.arousal === 'number'), '两条线都有数值')
const pts = points(db, 'global', Date.now() - 86400e3)
assert.ok(pts.some((p) => p.dimension === 'valence'), '有高兴程度转折点')
assert.ok(pts.some((p) => p.dimension === 'arousal'), '有激动程度转折点')
assert.ok(pts.every((p) => Math.abs(p.delta) >= 0.15), '转折点阈值')

// 5) global 语义：写同一个 key 后换个"上下文"读仍是同一状态
const before = currentView(db).valence
ingestEmotion(db, { key: 'global', text: '今天特别开心！', at: Date.now() })
const after = currentView(db).valence
assert.ok(after !== before)

// 6) 注入行：低强度不出、高强度出、off 不出
assert.equal(emotionLine({ label: '平静', valence: 0.05, arousal: 0.2, intensity: 0.2 }), '')
assert.ok(emotionLine({ label: '开心', valence: 0.7, arousal: 0.7, intensity: 0.7 }).includes('开心'))
assert.equal(emotionLine({ label: '开心', valence: 0.7, arousal: 0.7, intensity: 0.7 }, 'off'), '')

console.log(JSON.stringify({ ok: true, test: 'emotion', timeline: tl.length, points: pts.length,
  valencePoints: pts.filter((p) => p.dimension === 'valence').length,
  arousalPoints: pts.filter((p) => p.dimension === 'arousal').length, label: st.label }))
