/**
 * 日记保存（契约 v1.3 §3 `dyMemory.saveDiary` 的落盘实现）
 *
 * 边界（写死）：
 * - **只写** `${dataDir}/diary/YYYY-MM-DD/HHMMSS-seq.md`；不写 memories / raw_meta，不读、不检索、不摘要、不注入。
 * - **原子 + 不覆盖**：先写 tmp 并 fsync，再用 hardlink 发布；`/sdcard` 这类不支持 hardlink 的 FS
 *   回退为 `open(final,'wx')` 占名 + rename（不会写穿已有文件）。
 * - **无幂等键**：同一秒多篇 seq+1；调用方在结果未知时不得盲目重试（重试会多一篇）。
 * - 失败抛 `DiaryError`（服务层转 `E_BUSY`），**不假成功**。
 */
import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export const MAX_DIARY_CHARS = 20000
const NO_LINK = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EINVAL'])

export class DiaryError extends Error {
  constructor(message, code = 'E_BUSY', extra = {}) {
    super(message)
    this.name = 'DiaryError'
    this.code = code
    Object.assign(this, extra)
  }
}

const pad = (n) => String(n).padStart(2, '0')
function dayOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function clockOf(d) { return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` }
function oneLine(v, max) { return String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max) }

function render({ id, date, at, seq, mood, tags, title, text }) {
  const head = ['---', `id: ${id}`, `date: ${date}`, `at: ${at}`, `seq: ${seq}`, 'author: self']
  if (mood) head.push(`mood: ${oneLine(mood, 20)}`)
  if (tags) head.push(`tags: ${tags}`)
  if (title) head.push(`title: ${oneLine(title, 80)}`)
  head.push('schema: 1', '---')
  return head.join('\n') + '\n\n' + text + '\n'
}

function fsyncDir(dir) {
  try { const fd = openSync(dir, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) } } catch {}
}

/**
 * @param {object} input
 * @param {string} input.text      正文（必填，≤20000 字，首尾空白会被 trim）
 * @param {number} [input.at]      时间戳（默认 now；非法/非有限值退回 now）
 * @param {string} [input.title]   标题（可选，≤80 字）
 * @param {string} [input.mood]    心情（可选，≤20 字）
 * @param {string[]|string} [input.tags] 标签（可选）
 * @param {string} input.dataDir   数据根目录（必填；diary/ 在其下）
 * @returns {{id:string, date:string, seq:number, path:string, bytes:number}}
 */
export function saveDiary({ text, at, title, mood, tags, dataDir } = {}) {
  const dir = String(dataDir ?? '').trim()
  if (!dir) throw new DiaryError('saveDiary：缺少 dataDir', 'E_INVALID_ARG')
  const body = String(text ?? '').trim()
  if (!body) throw new DiaryError('saveDiary：text 不能为空', 'E_INVALID_ARG')
  if (body.length > MAX_DIARY_CHARS) throw new DiaryError(`saveDiary：text 超过 ${MAX_DIARY_CHARS} 字`, 'E_INVALID_ARG')

  const n = Number(at)
  const t = Number.isFinite(n) && n > 0 ? n : Date.now()
  const d = new Date(t)
  const date = dayOf(d)
  const clock = clockOf(d)
  const tagStr = Array.isArray(tags)
    ? tags.map((x) => oneLine(x, 20)).filter(Boolean).join(',')
    : oneLine(tags, 120)
  const dayDir = join(dir, 'diary', date)
  mkdirSync(dayDir, { recursive: true })

  let lastErr = null
  for (let seq = 1; seq <= 999; seq++) {
    const id = `${date.replaceAll('-', '')}-${clock}-${pad(seq)}`
    const target = join(dayDir, `${clock}-${pad(seq)}.md`)
    const content = render({ id, date, at: t, seq, mood, tags: tagStr, title, text: body })
    const tmp = `${target}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`
    let fd = null
    try {
      fd = openSync(tmp, 'wx')
      writeSync(fd, content)
      fsyncSync(fd)
      closeSync(fd)
      fd = null
      let published = false
      try {
        linkSync(tmp, target)          // 支持 hardlink 的 FS：原子、天然不覆盖
        published = true
      } catch (e) {
        if (e?.code === 'EEXIST') continue
        if (!NO_LINK.has(e?.code)) throw e
        // 回退：先 wx 占名（已存在 → EEXIST 换序号），再 rename 覆盖自己刚占的空文件
        let rfd = null
        try { rfd = openSync(target, 'wx') } catch (e2) {
          if (e2?.code === 'EEXIST') continue
          throw e2
        } finally { if (rfd !== null) closeSync(rfd) }
        try {
          renameSync(tmp, target)
          published = true
        } catch (e3) {
          try { unlinkSync(target) } catch {}
          throw e3
        }
      }
      if (!published) continue
      fsyncDir(dayDir)
      const bytes = Number(statSync(target).size)
      return { id, date, seq, path: target, bytes }
    } catch (e) {
      lastErr = e
      if (e?.code === 'EEXIST') continue
      throw new DiaryError(`saveDiary：写入失败 ${e?.message ?? e}`, 'E_BUSY')
    } finally {
      try { if (fd !== null) closeSync(fd) } catch {}
      try { unlinkSync(tmp) } catch {}
    }
  }
  throw new DiaryError(`saveDiary：同一秒超过 999 篇（${lastErr?.message ?? ''}）`, 'E_BUSY')
}
