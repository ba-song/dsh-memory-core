/**
 * Read-only RawArchive source adapter for Q149 recovery.
 *
 * Trust is derived from the host execution context and the host-observed
 * live-session registry. Caller arguments never supply session, cwd, scope,
 * access, lineage, or consent.
 */
import { createHash } from 'node:crypto'
import { bigrams } from '../store/fts.js'
import { decodeVector } from '../store/vector-codec.js'
import { scopeForSession } from '../scope.js'
import { normalizeRole, ROLE, roleSqlValues } from '../roles.js'

const DIALOG_ROLES = roleSqlValues().filter((r) =>
  ['user', 'self', '主人', '你', '汐', '她'].includes(String(r)),
)
const ROLE_SQL = DIALOG_ROLES.map(() => '?').join(',')
const MAX_RESULTS = 10
const MAX_EXCERPT = 600

function hostSession(exec) {
  const session = exec?.agent?.session ?? exec?.session
  const header = session?.header ?? session
  const id = String(header?.id ?? header?.sessionId ?? '')
  const cwd = String(header?.cwd ?? session?.cwd ?? '').trim()
  if (!id || !cwd) return null
  return { id, cwd, header: { id, cwd } }
}

function archiveLineageKey(row) {
  const cwd = String(row?.cwd ?? '')
  const file = String(row?.file ?? '')
  // RawArchive files are named s-<short-session-id>.md. Strip the date directory
  // so one session spanning midnight remains one asserted lineage. Other archive
  // file types use their own file as the source boundary; missing locators fall
  // back to the individual row and therefore cannot be merged by guesswork.
  const sessionFile = file.match(/(?:^|\\/)(s-[A-Za-z0-9_-]+\\.md)$/)
  const source = sessionFile?.[1] || file || `row:${Number(row?.id) || 0}`
  const digest = createHash('sha256').update(`${cwd}\\0${source}`).digest('hex').slice(0, 24)
  return `raw-archive:${digest}`
}

function queryExpression(question) {
  const grams = bigrams(String(question ?? '').trim()).split(' ').filter(Boolean)
  if (!grams.length) return ''
  return grams.map((g) => `"${g.replaceAll('"', '""')}"`).join(' OR ')
}

/**
 * @param {{db: import('node:sqlite').DatabaseSync, liveSessions: {matches(h:object):boolean}, isOwnerCwd:(cwd:string)=>boolean}} deps
 */
export function createRawArchiveRecoveryAdapter({ db, liveSessions, isOwnerCwd }) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('db is required')
  if (!liveSessions || typeof liveSessions.matches !== 'function') throw new TypeError('liveSessions is required')
  if (typeof isOwnerCwd !== 'function') throw new TypeError('isOwnerCwd is required')

  function authorize(exec) {
    const session = hostSession(exec)
    if (!session || !liveSessions.matches(session.header)) return null
    let owner = false
    try { owner = Boolean(isOwnerCwd(session.cwd)) } catch { owner = false }
    if (!owner) return null
    const scope = scopeForSession({ cwd: session.cwd, sessionId: session.id, isOwner: true })
    if (scope.level !== 'owner' || scope.raw !== 'all' || !scope.cwd) return null
    return Object.freeze({
      sessionId: session.id,
      cwd: session.cwd,
      purpose: 'memory_recovery',
      scope,
    })
  }

  function search(exec, { question = '', queryEmbed = null, limit = MAX_RESULTS } = {}) {
    const auth = authorize(exec)
    if (!auth) return { ok: false, error: 'E_RECOVERY_ACCESS_DENIED', evidence: [] }

    const expr = queryExpression(question)
    if (!expr) return { ok: true, evidence: [] }
    const max = Math.max(1, Math.min(Number(limit) || MAX_RESULTS, MAX_RESULTS))
    const candidates = new Map()

    // Keyword retrieval is scoped in SQL before any source text is read.
    try {
      const rows = db.prepare(`SELECT m.id
        FROM raw_fts f JOIN raw_meta m ON m.id=f.rowid
        WHERE raw_fts MATCH ? AND m.tombstone=0 AND m.cwd=?
          AND m.role IN (${ROLE_SQL})
        LIMIT 40`).all(expr, auth.cwd, ...DIALOG_ROLES)
      for (const row of rows) candidates.set(Number(row.id), 1)
    } catch {
      return { ok: false, error: 'E_RECOVERY_SOURCE_UNAVAILABLE', evidence: [] }
    }

    // Semantic candidates are also scope-filtered before vector data is loaded.
    if (queryEmbed && queryEmbed.length) {
      try {
        const qv = queryEmbed instanceof Float32Array ? queryEmbed : Float32Array.from(queryEmbed)
        const vectors = db.prepare(`SELECT v.raw_id,v.dim,v.vec
          FROM raw_vectors v JOIN raw_meta m ON m.id=v.raw_id
          WHERE m.tombstone=0 AND m.cwd=? AND m.role IN (${ROLE_SQL})`).all(auth.cwd, ...DIALOG_ROLES)
        for (const v of vectors) {
          const arr = decodeVector(Number(v.dim), v.vec)
          if (!arr || arr.length !== qv.length) continue
          let dot = 0
          for (let i = 0; i < qv.length; i++) dot += qv[i] * arr[i]
          if (dot >= 0.5) candidates.set(Number(v.raw_id), Math.max(candidates.get(Number(v.raw_id)) ?? 0, dot))
        }
      } catch {
        // Keyword evidence remains usable; a vector failure never widens scope.
      }
    }

    const ordered = [...candidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, max)
    const evidence = []
    const read = db.prepare(`SELECT id,file,line_no,day,at,role,raw_text,cwd,tombstone
      FROM raw_meta WHERE id=? AND cwd=? AND tombstone=0 AND role IN (${ROLE_SQL})`)
    for (const [id] of ordered) {
      const row = read.get(id, auth.cwd, ...DIALOG_ROLES)
      if (!row) continue
      const role = normalizeRole(row.role)
      if (role !== ROLE.USER && role !== ROLE.SELF) continue
      const excerpt = String(row.raw_text ?? '').slice(0, MAX_EXCERPT)
      if (!excerpt) continue
      evidence.push({
        id: `raw-archive:${Number(row.id)}`,
        kind: 'raw_archive',
        locator: `${String(row.file ?? '')}#${Number(row.line_no ?? 0)}`,
        at: Number(row.at) || null,
        excerpt,
        relation: 'unclear',
        access: 'allowed',
        independenceKey: archiveLineageKey(row),
        copiedFrom: null,
      })
    }
    return { ok: true, evidence }
  }

  return Object.freeze({ search })
}
