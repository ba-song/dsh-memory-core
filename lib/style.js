/**
 * 语感统计（2026-11-12 P0，参考 AstrBot 五层规格 §4）
 * 从主人最近 N 条真实消息算中位句长/无标点率/语气词/短句比例，产出一行 ≤130 字注入文本。
 * 只读 raw_meta（role='user'），不改任何记忆。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PARTICLES = '啊呀吧呢嘛哦哈嘿唉诶啦咯喔噢嗯'
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
const END_PUNCT = /[。！？!?…~～]$/

function clean(raw) {
  return String(raw ?? '')
    .replace(/^\s*\[[^\]]{0,60}\]\s*/, '')
    .replace(/^\s*主人[：:]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function median(nums) {
  if (!nums.length) return 0
  const a = [...nums].sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}

export function computeStyle(db, { limit = 300, now = Date.now() } = {}) {
  let rows = []
  try {
    rows = db.prepare("SELECT raw_text FROM raw_meta WHERE role='user' AND COALESCE(tombstone,0)=0 AND length(raw_text)>0 ORDER BY at DESC LIMIT ?").all(Math.max(20, Math.min(Number(limit) || 300, 1000)))
  } catch { rows = [] }
  const msgs = rows.map((r) => clean(r.raw_text)).filter(Boolean)
  if (!msgs.length) return { at: now, samples: 0, summaryLine: '' }
  const sentenceLens = []
  let noPunct = 0, short = 0, emojiMsgs = 0
  const particleCount = new Map()
  for (const m of msgs) {
    const parts = m.split(/[。！？!?…\n]+/).map((x) => x.trim()).filter(Boolean)
    const lens = parts.length ? parts.map((x) => x.length) : [m.length]
    sentenceLens.push(...lens)
    if (!END_PUNCT.test(m)) noPunct++
    if (m.length < 10) short++
    if (EMOJI_RE.test(m)) emojiMsgs++
    for (const ch of m) if (PARTICLES.includes(ch)) particleCount.set(ch, (particleCount.get(ch) || 0) + 1)
  }
  const med = median(sentenceLens)
  const noPunctRate = noPunct / msgs.length
  const shortRate = short / msgs.length
  const topParticles = [...particleCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0])
  const bits = [`主人发消息中位 ${med} 字`]
  if (noPunctRate >= 0.5) bits.push(`${Math.round(noPunctRate * 100)}% 不带句号`)
  if (shortRate >= 0.4) bits.push('短句多')
  if (topParticles.length) bits.push(`常用语气词「${topParticles.join('/')}」`)
  if (emojiMsgs / msgs.length >= 0.15) bits.push('会用表情')
  bits.push('你回话跟着短一点、别用客服腔或长段落')
  return {
    at: now, samples: msgs.length, medianLen: med, medianSentenceLen: med,
    noPunctRate: Number(noPunctRate.toFixed(2)), shortRate: Number(shortRate.toFixed(2)),
    topParticles, emojiRate: Number((emojiMsgs / msgs.length).toFixed(2)),
    summaryLine: bits.join('；').slice(0, 130),
  }
}

export function writeStyleFile(db, dataDir, { now = Date.now() } = {}) {
  const stats = computeStyle(db, { now })
  try {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(join(dataDir, 'style.json'), JSON.stringify(stats, null, 2), 'utf8')
  } catch {}
  return stats
}
