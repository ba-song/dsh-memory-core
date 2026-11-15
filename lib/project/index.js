/** 项目/决策卡（2026-11-08）：换会话后知道「为什么这么定、下一步、坑」 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const WORKSPACE_ROOT = '/sdcard/DSHA/工作区'
const NOT_PROJECT = ['/sdcard/DSHA/生活/数据/home', '/sdcard/DSHA/渠道']

export function ensureProjectSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', root TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)`)
  db.exec(`CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
    context TEXT NOT NULL DEFAULT '', options_json TEXT NOT NULL DEFAULT '[]', choice TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'decided',
    decided_at INTEGER NOT NULL DEFAULT 0, decided_by TEXT NOT NULL DEFAULT '',
    source_memory_id INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)`)
  db.exec('CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_decisions_time ON decisions(decided_at)')
  try { db.exec("ALTER TABLE memories ADD COLUMN project_id TEXT DEFAULT ''") } catch {}
}

const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 10)
const under = (p, root) => p === root || p.startsWith(root.replace(/\/+$/, '') + '/')

/** cwd → 项目；home/渠道不算项目；工作区内取含 AGENTS.md/.git 的最近目录，否则工作区根 */
export function resolveProject(cwd) {
  const p = String(cwd ?? '').trim().replace(/\/+$/, '')
  if (!p) return null
  if (NOT_PROJECT.some((x) => under(p, x))) return null
  if (!under(p, WORKSPACE_ROOT)) return null
  let dir = p
  let root = WORKSPACE_ROOT
  while (true) {
    if (existsSync(join(dir, 'AGENTS.md')) || existsSync(join(dir, '.git'))) { root = dir; break }
    if (dir === WORKSPACE_ROOT) break
    const parent = dir.replace(/\/[^/]+$/, '')
    if (parent === dir || !under(parent, WORKSPACE_ROOT)) break
    dir = parent
  }
  const name = root === WORKSPACE_ROOT ? '工作区' : root.split('/').pop()
  return { id: `proj:${hash(root)}`, name, root }
}

export function upsertProject(db, { id = '', name = '', root = '' } = {}) {
  ensureProjectSchema(db)
  const now = Date.now()
  let pid = String(id ?? '').trim()
  let r = String(root ?? '').trim().replace(/\/+$/, '')
  if (!pid && r) pid = `proj:${hash(r)}`
  if (!pid) return { ok: false, error: '需要 id 或 root' }
  const old = db.prepare('SELECT * FROM projects WHERE id=?').get(pid)
  if (!old && !r) return { ok: false, error: '新项目需要 root' }
  const nm = String(name ?? '').trim() || (r ? r.split('/').pop() : old?.name ?? '')
  db.prepare(`INSERT INTO projects(id,name,root,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, root=excluded.root, updated_at=excluded.updated_at`).run(pid, nm, r || old?.root || '', old?.created_at ?? now, now)
  return { ok: true, project: db.prepare('SELECT * FROM projects WHERE id=?').get(pid) }
}

export function addDecision(db, { id = '', project = '', title = '', context = '', options = [], choice = '', reason = '', status = 'decided', decidedAt = 0, decidedBy = '', sourceMemoryId = 0 } = {}) {
  ensureProjectSchema(db)
  const pid = String(project ?? '').trim()
  const t = String(title ?? '').trim()
  if (!pid) return { ok: false, error: '需要 project' }
  if (!db.prepare('SELECT 1 FROM projects WHERE id=?').get(pid)) return { ok: false, error: '项目不存在' }
  if (!t || !String(choice ?? '').trim()) return { ok: false, error: 'title/choice 必填' }
  const did = String(id ?? '').trim() || `dec:${hash(`${pid}|${t}|${Date.now()}`)}`
  if (db.prepare('SELECT 1 FROM decisions WHERE id=?').get(did)) return { ok: false, error: 'decision 已存在' }
  const now = Date.now()
  db.prepare(`INSERT INTO decisions(id,project_id,title,context,options_json,choice,reason,status,decided_at,decided_by,source_memory_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(did, pid, t, String(context ?? ''), JSON.stringify(Array.isArray(options) ? options : []), String(choice), String(reason ?? ''), String(status), Number(decidedAt) || now, String(decidedBy), Number(sourceMemoryId) || 0, now, now)
  return { ok: true, decision: db.prepare('SELECT * FROM decisions WHERE id=?').get(did) }
}

export function listDecisions(db, { project = '', status = '', query = '', limit = 10 } = {}) {
  ensureProjectSchema(db)
  const where = []; const args = []
  if (project) { where.push('project_id=?'); args.push(String(project)) }
  if (status) { where.push('status=?'); args.push(String(status)) }
  if (query) { where.push('(title LIKE ? OR choice LIKE ? OR reason LIKE ?)'); const q = `%${query}%`; args.push(q, q, q) }
  const n = Math.max(1, Math.min(Number(limit) || 10, 50))
  const rows = db.prepare(`SELECT * FROM decisions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY decided_at DESC LIMIT ?`).all(...args, n)
  return { ok: true, count: rows.length, decisions: rows }
}

/** 常驻注入用的短块（≤3 条，每条 ≤120 字） */
export function decisionsBlock(db, projectId, { limit = 3, maxLen = 120 } = {}) {
  if (!projectId) return ''
  const { decisions } = listDecisions(db, { project: projectId, status: 'decided', limit })
  if (!decisions.length) return ''
  const lines = decisions.map((d) => `- ${String(d.title).slice(0, 40)} → ${String(d.choice).slice(0, 50)}${d.reason ? `（${String(d.reason).slice(0, 30)}）` : ''}`.slice(0, maxLen))
  return ['【项目决策】', ...lines, '【项目决策结束】'].join('\n')
}
