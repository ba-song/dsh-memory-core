/**
 * 多模态归档（2026-11-13）：把 raw_meta 里的图片/语音/视频附件变成一行可检索描述。
 * - 图片：tesseract OCR（chi_sim+eng）
 * - 视频：ffmpeg 抽 3 帧 + OCR
 * - 语音：找同名 .txt/.json 转写，没有就写“未转写”
 * 只写 memories(kind=episode, source_channel='multimodal')，不改 raw 原文。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { insertMemory } from './store/memories.js'

const PATH_TYPE_RE = /<path>([^<]+)<\/path>\s*<type>(image|audio|video)<\/type>/g
const BRACKET_RE = /\[(图片|语音|视频)\]\s*(\/[^\s\n]+)/g
const CN_TYPE = { 图片: 'image', 语音: 'audio', 视频: 'video' }

export function extractAttachments(rawText) {
  const text = String(rawText ?? '')
  const out = []
  for (const m of text.matchAll(PATH_TYPE_RE)) out.push({ path: m[1], type: m[2] })
  for (const m of text.matchAll(BRACKET_RE)) out.push({ path: m[2], type: CN_TYPE[m[1]] || 'image' })
  const seen = new Set()
  return out.filter((x) => (seen.has(x.path) ? false : seen.add(x.path)))
}

function run(cmd, args, timeout = 30_000) {
  try { return String(execFileSync(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }) ?? '') } catch { return '' }
}

export function describeAttachment(file, type) {
  const p = String(file ?? '')
  if (!p || !existsSync(p)) return { ok: false, code: 'E_NOT_FOUND' }
  let st
  try { st = statSync(p) } catch { return { ok: false, code: 'E_STAT' } }
  if (!st.isFile()) return { ok: false, code: 'E_NOT_FILE' }
  if (type === 'image') {
    // 优先手写/模型 sidecar：`<图片>.json` 的 caption/desc/text 或 `<图片>.txt`
    for (const ext of ['.json', '.txt']) {
      const side = `${p}${ext}`
      if (!existsSync(side)) continue
      try {
        const raw = readFileSync(side, 'utf8')
        const text = ext === '.json' ? String(JSON.parse(raw)?.caption ?? JSON.parse(raw)?.desc ?? JSON.parse(raw)?.text ?? '') : raw
        if (String(text).trim()) return { ok: true, type, text: String(text).replace(/\s+/g, ' ').slice(0, 500), bytes: st.size, source: 'sidecar' }
      } catch {}
    }
    const txt = run('tesseract', [p, 'stdout', '-l', 'chi_sim+eng']).replace(/\s+/g, ' ').trim()
    return { ok: true, type, text: txt.slice(0, 500) || '图片附件（无文字）', bytes: st.size }
  }
  if (type === 'video') {
    const dir = mkdtempSync(join(tmpdir(), 'mm-video-'))
    try {
      run('ffmpeg', ['-y', '-v', 'error', '-i', p, '-vf', 'fps=1/10', '-frames:v', '3', join(dir, 'f_%02d.png')])
      const texts = []
      for (let i = 1; i <= 3; i++) {
        const f = join(dir, `f_${String(i).padStart(2, '0')}.png`)
        if (!existsSync(f)) continue
        const t = run('tesseract', [f, 'stdout', '-l', 'chi_sim+eng']).replace(/\s+/g, ' ').trim()
        if (t) texts.push(t)
      }
      return { ok: true, type, text: [...new Set(texts)].join(' / ').slice(0, 500) || '视频附件（无可读文字）', bytes: st.size }
    } finally { try { rmSync(dir, { recursive: true, force: true }) } catch {} }
  }
  if (type === 'audio') {
    for (const ext of ['.txt', '.json']) {
      const side = `${p}${ext}`
      if (!existsSync(side)) continue
      try {
        const raw = readFileSync(side, 'utf8')
        const text = ext === '.json' ? String(JSON.parse(raw)?.text ?? '') : raw
        if (text.trim()) return { ok: true, type, text: text.replace(/\s+/g, ' ').slice(0, 500), bytes: st.size }
      } catch {}
    }
    return { ok: true, type, text: '语音附件（未转写，可手动补 .txt）', bytes: st.size }
  }
  return { ok: false, code: 'E_TYPE' }
}

const KEY = (path, mtime) => `mm:${createHash('sha1').update(`${path}|${mtime}`).digest('hex').slice(0, 16)}`

export async function scanMultimodal({ db, limit = 20, dryRun = true, now = Date.now(), log = null } = {}) {
  const rows = db.prepare(`SELECT id,at,raw_text FROM raw_meta WHERE raw_text LIKE '%<path>%' OR raw_text LIKE '%[图片]%' OR raw_text LIKE '%[语音]%' OR raw_text LIKE '%[视频]%' ORDER BY id DESC LIMIT ?`).all(Math.max(1, Math.min(Number(limit) || 20, 100)))
  const items = []
  let inserted = 0
  for (const r of rows) {
    for (const a of extractAttachments(r.raw_text)) {
      let mtime = 0
      try { mtime = statSync(a.path).mtimeMs } catch { continue }
      const key = KEY(a.path, mtime)
      try { if (db.prepare("SELECT 1 FROM meta WHERE k=?").get(key)) continue } catch {}
      const d = describeAttachment(a.path, a.type)
      if (!d.ok) continue
      const text = `[${a.type === 'image' ? '图片' : a.type === 'audio' ? '语音' : '视频'}] ${d.text}`.slice(0, 600)
      items.push({ id: Number(r.id), path: a.path, type: a.type, text })
      if (!dryRun) {
        try {
          await insertMemory(db, {
            kind: 'episode', text, detail: a.path, importance: a.type === 'image' ? 0.45 : 0.5,
            speakerId: 'owner', sourceChannel: 'multimodal', sourceMsgId: `raw:${r.id}`,
            sourceTs: Number(r.at) || now, layer: 'auto', scopeType: 'owner', scopeId: '',
            confidence: 0.7, meta: { multimodal: true, path: a.path, type: a.type },
          })
          db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)").run(key, String(now))
          inserted++
        } catch (e) { try { log?.warn?.(`多模态归档失败：${e?.message ?? e}`) } catch {} }
      }
    }
  }
  return { ok: true, scanned: rows.length, found: items.length, inserted, dryRun, items: items.slice(0, 20) }
}
