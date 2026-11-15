import { mkdirSync, writeFileSync, renameSync, existsSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function ensureDir(p) { mkdirSync(p, { recursive: true }); return p }
export function writeAtomic(file, data) {
  ensureDir(dirname(file))
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}
export function readJson(file, dflt) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return dflt }
}
export function readText(file) { try { return readFileSync(file, 'utf8') } catch { return '' } }

// O_EXCL 锁 + 心跳；心跳超时（默认 120s）视为陈旧锁
function procStart(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const close = stat.lastIndexOf(')')
    const rest = stat.slice(close + 2).split(' ')
    return rest[19] ?? ''   // starttime 在 comm 之后的第 20 个字段
  } catch { return '' }
}

export function acquireLock(dir, { staleMs = 120000 } = {}) {
  ensureDir(dir)
  const file = join(dir, '.lock')
  for (let i = 0; i < 2; i++) {
    try {
      writeFileSync(file, JSON.stringify({ pid: process.pid, start: procStart(process.pid), at: Date.now() }), { flag: 'wx' })
      return { release() { try { unlinkSync(file) } catch {} }, beat() { try { writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now() })) } catch {} }, file }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let age = Infinity
      try { age = Date.now() - statSync(file).mtimeMs } catch {}
      let ownerAlive = false
      try {
        const info = JSON.parse(readFileSync(file, 'utf8'))
        const pid = Number(info?.pid)
        if (pid && existsSync(`/proc/${pid}`)) {
          ownerAlive = true
          // PID 复用防护：对比进程启动时间（/proc/<pid>/stat 第 22 列）
          if (info.start && procStart(pid) && String(info.start) !== String(procStart(pid))) ownerAlive = false
        }
      } catch {}
      // 同一进程重复挂载（热重载）：认领这把锁，不算冲突
      try {
        const info = JSON.parse(readFileSync(file, 'utf8'))
        if (Number(info?.pid) === process.pid) {
          return { release() { try { unlinkSync(file) } catch {} }, beat() {}, file, adopted: true }
        }
      } catch {}
      // 持有者进程已死，或心跳过期 → 回收
      if (!ownerAlive || age > staleMs) { try { unlinkSync(file) } catch {} ; continue }
      return null
    }
  }
  return null
}
