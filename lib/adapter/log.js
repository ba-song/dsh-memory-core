import { appendFileSync, statSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { ensureDir } from './fs.js'

export function makeLog(dir, name = 'memory.log', { maxBytes = 5 * 1024 * 1024, keep = 3 } = {}) {
  const file = join(dir, name)
  ensureDir(dirname(file))
  const rotate = () => {
    try {
      if (!existsSync(file) || statSync(file).size < maxBytes) return
      for (let i = keep - 1; i >= 1; i--) {
        try { renameSync(`${file}.${i}`, `${file}.${i + 1}`) } catch {}
      }
      renameSync(file, `${file}.1`)
    } catch {}
  }
  return {
    info: (m) => { rotate(); try { appendFileSync(file, `${new Date().toISOString()} [dy-memory] ${m}\n`) } catch {} },
    warn: (m) => { rotate(); try { appendFileSync(file, `${new Date().toISOString()} [dy-memory][warn] ${m}\n`) } catch {} },
    file,
  }
}
