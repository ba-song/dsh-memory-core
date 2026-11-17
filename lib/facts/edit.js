/** 事实卡自填（2026-11-06）：四节追加/列内容；写前备份保留 5 份 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const SECTIONS = ['全局', '主人', '群', '人']
const MAX = 200
const pad = (n) => String(n).padStart(2, '0')
const ts = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` }
export function factsFile(dataDir) { return join(dataDir, '事实卡.md') }
export function backupFacts(dataDir, { keep = 5 } = {}) {
  const f = factsFile(dataDir); if (!existsSync(f)) return ''
  const dir = join(dataDir, '备份'); mkdirSync(dir, { recursive: true })
  const target = join(dir, `facts-before-${ts()}.md`); copyFileSync(f, target)
  const olds = readdirSync(dir).filter((x) => x.startsWith('facts-before-') && x.endsWith('.md')).map((x) => ({ x, m: statSync(join(dir, x)).mtimeMs })).sort((a, b) => b.m - a.m)
  for (const o of olds.slice(keep)) { try { rmSync(join(dir, o.x)) } catch {} }
  return target
}
export function appendFact(dataDir, { section, text, name = '' } = {}) {
  const sec = String(section ?? ''); const body = String(text ?? '').trim()
  if (!SECTIONS.includes(sec)) return { ok: false, error: `section 只能是 ${SECTIONS.join('/')}` }
  if (!body) return { ok: false, error: 'text 不能为空' }
  if (body.length > MAX) return { ok: false, error: `单条 ≤${MAX} 字` }
  const f = factsFile(dataDir)
  const backup = backupFacts(dataDir)
  const raw = existsSync(f) ? readFileSync(f, 'utf8') : '# 事实卡\n'
  const lines = raw.split('\n')
  if (lines.some((l) => l.trim() === `- ${body}`)) return { ok: false, error: 'duplicate' }
  const head = sec === '人' && name ? `## 人 · ${String(name).trim()}` : `## ${sec}`
  let idx = lines.findIndex((l) => l.trim() === head || (sec === '人' && name && l.startsWith(`## 人 · ${String(name).trim()}`)))
  if (idx < 0) { lines.push('', head); idx = lines.length - 1 }
  let end = lines.length
  for (let i = idx + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break }
  lines.splice(end, 0, `- ${body}`)
  writeFileSync(f, lines.join('\n').replace(/\n{3,}/g, '\n\n'))
  return { ok: true, section: sec, line: `- ${body}`, backup }
}
export function listFacts(dataDir) {
  const f = factsFile(dataDir)
  if (!existsSync(f)) return { ok: true, sections: Object.fromEntries(SECTIONS.map((s) => [s, []])) }
  const out = Object.fromEntries(SECTIONS.map((s) => [s, []])); let cur = null
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^##\s+([^·\s]+)(?:\s*·\s*(.+))?$/)
    if (m) { cur = m[1]; continue }
    if (cur && SECTIONS.includes(cur) && /^-\s+/.test(l.trim())) out[cur].push({ text: l.trim().slice(2), sub: m ? '' : '' })
  }
  return { ok: true, sections: out }
}
