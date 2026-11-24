/**
 * Host-observed live session registry.
 *
 * A session becomes trusted only after the host exposes it through a lifecycle
 * event or the host's existing agent list. Callers cannot register identities.
 * The bounded LRU prevents stale session IDs from accumulating indefinitely.
 */
export function createLiveSessionRegistry({ maxEntries = 512 } = {}) {
  const limit = Math.max(1, Math.trunc(Number(maxEntries) || 512))
  const sessions = new Map()

  function observe(session) {
    try {
      const header = session?.header ?? session ?? {}
      const id = String(header?.id ?? header?.sessionId ?? '').trim()
      const cwd = String(header?.cwd ?? '').trim()
      if (!id || !cwd) return false

      // Reinsert to refresh recency, including when a session changes cwd.
      sessions.delete(id)
      sessions.set(id, { cwd })
      while (sessions.size > limit) {
        const oldest = sessions.keys().next().value
        sessions.delete(oldest)
      }
      return true
    } catch {
      return false
    }
  }

  function matches(header) {
    try {
      const id = String(header?.id ?? header?.sessionId ?? '').trim()
      const cwd = String(header?.cwd ?? '').trim()
      if (!id || !cwd) return false
      const seen = sessions.get(id)
      if (!seen || seen.cwd !== cwd) return false
      // A successful check refreshes recency but does not create trust.
      sessions.delete(id)
      sessions.set(id, seen)
      return true
    } catch {
      return false
    }
  }

  return Object.freeze({
    observe,
    matches,
    get size() { return sessions.size },
  })
}
