/**
 * P2 迁移：把 QQ 侧的人工记忆搬进 memory.db
 * - 事实卡 → fact（置顶）
 * - 便签/话头 → todo
 * - 聊天流水 → 每天一条 episode 摘要（不存原文；原文在原话档案里）
 * - 交接/便签.md → episode（按小节拆分）
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { insertMemory } from '../store/memories.js'
import { bigrams } from '../store/fts.js'

/**
 * 迁移是离线 CLI，主人身份**只能来自环境变量**（D1：源码不写死 QQ 号）：
 *   OWNER_QQ=<数字>   或   OWNER_DIR=/root/qq-agent/QQ会话/私聊_<数字>
 * 两者都没有时直接抛错——迁移会写主人记忆，不允许猜。
 */
export function ownerQQ() {
  const q = String(process.env.OWNER_QQ ?? '').trim()
  if (q) return q
  const d = String(process.env.OWNER_DIR ?? '').trim()
  const m = d.match(/私聊_([0-9]{5,})/)
  return m ? m[1] : ''
}

export function qqDir() {
  const d = String(process.env.OWNER_DIR ?? '').trim()
  if (d) return d
  const q = ownerQQ()
  if (!q) throw new Error('迁移需要主人身份：请设置 OWNER_QQ 或 OWNER_DIR 环境变量')
  return `/root/qq-agent/QQ会话/私聊_${q}`
}

export function readIf(p) { try { return existsSync(p) ? readFileSync(p, 'utf8') : '' } catch { return '' } }

export function parseFacts(text) {
  const out = []
  const me = ownerQQ()
  let inMine = false
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (/^##\s+/.test(line)) { inMine = (me && line.includes(me)) || /私聊/.test(line); continue }
    if (!inMine) continue
    if (!line.startsWith('- ')) continue
    const body = line.slice(2).trim()
    if (body) out.push(body)
  }
  return out
}

export function parsePin(text) {
  const out = []
  for (const raw of String(text ?? '').split('\n')) {
    const m = raw.trim().match(/^- \[( |x)\]\s*(.+)$/)
    if (!m) continue
    const done = m[1] === 'x'
    const body = m[2].replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*/, '').trim()
    if (body) out.push({ text: body, done })
  }
  return out
}

/** 聊天流水：每天一条摘要（取当天首尾各一条用户消息） */
export function parseChatlog(file) {
  const lines = readIf(file).split('\n').filter((l) => l.startsWith('- '))
  const me = ownerQQ()
  const users = lines.filter((l) => (me ? l.includes(me) : true)).map((l) => l.replace(/^- \d{2}:\d{2}:\d{2} · [^：]+：/, '').trim()).filter(Boolean)
  if (!users.length) return null
  // 取首、1/3、2/3、尾各一条，避免只留头尾把中段话题丢掉
  // 挑"最有代表性"的 8 句：过滤掉 CQ 码/链接，用稀有二元组做覆盖（贪心）
  const clean = users.filter((u) => !/\[CQ:|https?:\/\//.test(u) && u.length >= 4)
  const gramSets = clean.map((u) => new Set(bigrams(u).split(' ').filter(Boolean)))
  const freq = new Map()
  for (const gs of gramSets) for (const g of gs) freq.set(g, (freq.get(g) ?? 0) + 1)
  const rare = gramSets.map((gs) => new Set([...gs].filter((g) => (freq.get(g) ?? 0) <= 2)))
  const chosen = []; const used = new Set()
  while (chosen.length < 8 && chosen.length < clean.length) {
    let best = -1; let bestScore = -1
    for (let i = 0; i < clean.length; i++) {
      if (used.has(i)) continue
      let sc = 0
      for (const g of rare[i]) if (!used.has('g:' + g)) sc += 1
      sc += clean[i].length >= 12 ? 0.3 : 0
      if (sc > bestScore) { bestScore = sc; best = i }
    }
    if (best < 0 || bestScore <= 0) break
    chosen.push(best); used.add(best)
    for (const g of rare[best]) used.add('g:' + g)
  }
  const picked = chosen.sort((a, b) => a - b).map((i) => ({ i, u: clean[i].slice(0, 40) }))
  return { count: users.length, text: picked.map((x) => x.u).join(' ｜ ') }
}

export function parseHandoff(text) {
  const out = []
  let cur = ''
  for (const line of String(text ?? '').split('\n')) {
    if (/^##\s+/.test(line)) { if (cur.trim()) out.push(cur.trim()); cur = '' ; continue }
    cur += line + '\n'
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter((s) => s.length >= 8)
}

export function collect({ days = 7, now = Date.now() } = {}) {
  const dir = qqDir()
  const factsFile = join(dir, '事实卡.md')
  const pinFile = join(dir, '话头.md')
  const handoffFile = join(dir, '便签.md')
  const chatDir = join(dir, '聊天记录')

  const facts = parseFacts(readIf(factsFile)).map((t) => ({
    kind: 'fact', text: t, pinned: true, clarity: 'clear',
    sourceFile: factsFile, sourceKey: 'facts:' + t.slice(0, 24), extractor: 'migrate-facts',
  }))
  const todos = parsePin(readIf(pinFile)).filter((x) => !x.done).map((x) => ({
    kind: 'todo', text: x.text, clarity: 'fuzzy', importance: 0.5,
    sourceFile: pinFile, sourceKey: 'pin:' + x.text.slice(0, 24), extractor: 'migrate-pin',
  }))
  const episodes = []
  if (existsSync(chatDir)) {
    const cutoff = now - days * 86400000
    for (const f of readdirSync(chatDir).filter((x) => /^\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort()) {
      const day = f.slice(0, 10)
      if (new Date(`${day}T00:00:00`).getTime() < cutoff) continue
      const s = parseChatlog(join(chatDir, f))
      if (!s) continue
      episodes.push({
        kind: 'episode', text: `${day} 和主人聊了 ${s.count} 句：${s.text}`, clarity: 'fuzzy', importance: 0.35,
        sourceFile: join(chatDir, f), sourceKey: 'chatlog:' + day, extractor: 'migrate-chatlog',
      })
    }
  }
  const handoffs = parseHandoff(readIf(handoffFile)).map((t, i) => ({
    kind: 'episode', text: t.slice(0, 300), clarity: 'fuzzy', importance: 0.4,
    sourceFile: handoffFile, sourceKey: 'handoff:' + i, extractor: 'migrate-handoff',
  }))
  return { facts, todos, episodes, handoffs }
}

export async function applyAll(db, data, log = console.log) {
  const owner = ownerQQ()
  if (!owner) throw new Error('迁移需要主人身份：请设置 OWNER_QQ 或 OWNER_DIR 环境变量')
  const existing = new Set(db.prepare('SELECT meta FROM memories').all().map((r) => {
    try { return JSON.parse(r.meta || '{}').sourceKey || '' } catch { return '' }
  }))
  const rows = [...data.facts, ...data.todos, ...data.episodes, ...data.handoffs]
  let inserted = 0
  const ids = []
  for (const r of rows) {
    if (r.sourceKey && existing.has(r.sourceKey)) continue
    const id = await insertMemory(db, {
      kind: r.kind, text: r.text, clarity: r.clarity ?? 'fuzzy', importance: r.importance ?? 0.5,
      speakerId: owner, ownerScope: owner, conversationScope: '', privacy: 'owner',
      sourceFile: r.sourceFile ?? '', sourceMsgId: r.sourceKey ?? '', extractorVersion: r.extractor ?? 'migrate',
      pinned: r.pinned ? 1 : 0, meta: { sourceKey: r.sourceKey, migratedAt: Date.now() },
    })
    ids.push(id)
    inserted += 1
  }
  log(`迁移完成：候选 ${rows.length} 条，实际写入 ${inserted} 条（其余已存在）`)
  return { inserted, ids }
}
