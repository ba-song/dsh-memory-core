#!/usr/bin/env node
/**
 * 换会话监测：不改 500000 阈值，等真实换会话发生后自动验收。
 * 用法：
 *   node scripts/watch-swap.mjs --once     # 扫一遍，报告当前会话与最近一次换会话
 *   node scripts/watch-swap.mjs --watch    # 每 10 秒扫一次，发现新 sid 就写报告
 * 报告写到 memory-core-live/logs/swap-check.jsonl
 */
import { readFileSync, existsSync, appendFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, loadConfig, resolveOwner } from '../lib/config.js'

const LOG = join(DATA_DIR, 'logs', 'memory.log')
const OUT = join(DATA_DIR, 'logs', 'swap-check.jsonl')
const STATE = join(DATA_DIR, 'logs', 'swap-watch-state.json')
// D1：主人身份从本地 config.json 解析（ownerQQ / ownerPrivateDir），源码不写死
const owner = resolveOwner(loadConfig())
if (!owner.ok) {
  console.error('未配置主人身份（ownerQQ / ownerPrivateDir）：请先补本地 config.json，再跑本脚本')
  process.exit(1)
}
const OWNER = owner.ownerPrivateDir
const HANDOFF_DIR = join(OWNER, '记忆区', '压缩记忆')

const once = process.argv.includes('--once')
const watch = process.argv.includes('--watch')
const interval = 10000

function lines() {
  try { return readFileSync(LOG, 'utf8').split('\n').filter(Boolean) } catch { return [] }
}
function sidOf(line) {
  const m = line.match(/常驻注入了会话 ([0-9a-f-]{8})/) || line.match(/注入被读取：会话([0-9a-f-]{8})/)
  return m ? m[1] : null
}
function loadState() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')) } catch { return { known: [], last: null } }
}
function saveState(s) { try { writeFileSync(STATE, JSON.stringify(s, null, 2)) } catch {} }
function newestHandoff() {
  try {
    const files = readdirSync(HANDOFF_DIR).filter((f) => f.startsWith('聊天记忆-'))
    if (!files.length) return null
    const p = join(HANDOFF_DIR, files.sort().at(-1))
    const st = statSync(p)
    return { file: p, mtime: st.mtimeMs }
  } catch { return null }
}
function rawFileOf(sid8) {
  const day = new Date().toISOString().slice(0, 10)
  return join(DATA_DIR, 'raw', day, `s-${sid8}.md`)
}
function check() {
  const all = lines()
  const state = loadState()
  const sids = [...new Set(all.map(sidOf).filter(Boolean))]
  const fresh = sids.filter((s) => !state.known.includes(s))
  const latest = all.slice(-80).join('\n')
  for (const sid of fresh) {
    const handoff = newestHandoff()
    const rec = {
      at: new Date().toISOString(),
      sid,
      injected: latest.includes(`常驻注入了会话 ${sid}`) || all.some((l) => l.includes(`常驻注入了会话 ${sid}`)),
      read: all.some((l) => l.includes(`注入被读取：会话${sid}`)),
      handoff: handoff ? { file: handoff.file, ageMin: +((Date.now() - handoff.mtime) / 60000).toFixed(1) } : null,
      rawFile: existsSync(rawFileOf(sid)) ? rawFileOf(sid) : null,
    }
    appendFileSync(OUT, JSON.stringify(rec) + '\n')
    console.log('新会话：', JSON.stringify(rec))
  }
  state.known = [...new Set([...state.known, ...sids])].slice(-50)
  state.last = sids.at(-1) ?? null
  saveState(state)
  if (once) console.log('当前已知会话：', state.known.join(', ') || '(无)')
}

if (once) check()
else if (watch) { check(); setInterval(check, interval) }
else { console.log('用法：--once 或 --watch') }
