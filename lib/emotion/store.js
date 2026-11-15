import { scoreText, nextState, decayState, labelOf, intensityOf } from './core.js'

export const DEFAULT_KEY = 'global'

export function loadState(db, key = DEFAULT_KEY) {
  const row = db.prepare('SELECT * FROM emotion_state WHERE session_key=?').get(key)
  if (!row) return { session_key: key, valence: 0, arousal: 0.2, label: '平静', intensity: 0.2, confidence: 0.5, source: 'init', updatedAt: 0 }
  return { ...row, updatedAt: row.updated_at }
}

export function saveState(db, key, st) {
  db.prepare(`INSERT INTO emotion_state(session_key,valence,arousal,label,intensity,confidence,source,updated_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(session_key) DO UPDATE SET valence=excluded.valence, arousal=excluded.arousal,
      label=excluded.label, intensity=excluded.intensity, confidence=excluded.confidence,
      source=excluded.source, updated_at=excluded.updated_at`)
    .run(key, st.valence, st.arousal, st.label, st.intensity, st.confidence ?? 0.5, st.source ?? 'rule', Number(st.updatedAt ?? Date.now()))
}

export function currentView(db, key = DEFAULT_KEY, now = Date.now()) {
  return decayState(loadState(db, key), now)
}

export function series(db, key = DEFAULT_KEY, since = Date.now() - 86400000) {
  return db.prepare('SELECT at,valence,arousal,label,intensity,trigger FROM emotion_timeline WHERE session_key=? AND at>=? ORDER BY at').all(key, since)
}

export function points(db, key = DEFAULT_KEY, since = Date.now() - 86400000) {
  return db.prepare('SELECT id,dimension,at,delta,value_after,trigger,msg_ref FROM emotion_points WHERE session_key=? AND at>=? ORDER BY at').all(key, since)
}

/** 一条用户消息 → 更新状态、写时间线、记转折点、记审计 */
export function ingestEmotion(db, { key = DEFAULT_KEY, text = '', trigger = '', msgRef = '', at = Date.now(), threshold = 0.15 } = {}) {
  const score = scoreText(text)
  const prevRaw = loadState(db, key)
  const prev = decayState(prevRaw, at)
  // 低置信且无命中：不更新（避免无意义抖动）
  if (score.hits === 0) {
    db.prepare('INSERT INTO emotion_audit(session_key,source,payload,at) VALUES(?,?,?,?)')
      .run(key, 'rule-none', JSON.stringify({ text: String(text).slice(0, 80) }), at)
    return { state: prev, points: [] }
  }
  const next = nextState(prev, score, at)
  saveState(db, key, next)
  db.prepare('INSERT INTO emotion_timeline(session_key,valence,arousal,label,intensity,trigger,at) VALUES(?,?,?,?,?,?,?)')
    .run(key, next.valence, next.arousal, next.label, next.intensity, String(trigger || text).slice(0, 60), at)
  const made = []
  const dims = [
    ['valence', prev.valence, next.valence],
    ['arousal', prev.arousal, next.arousal],
  ]
  for (const [dim, before, after] of dims) {
    const delta = after - before
    if (Math.abs(delta) >= threshold) {
      db.prepare('INSERT INTO emotion_points(session_key,dimension,at,delta,value_after,trigger,msg_ref) VALUES(?,?,?,?,?,?,?)')
        .run(key, dim, at, delta, after, String(trigger || text).slice(0, 60), String(msgRef))
      made.push({ dimension: dim, delta, value_after: after })
    }
  }
  db.prepare('INSERT INTO emotion_audit(session_key,source,payload,at) VALUES(?,?,?,?)')
    .run(key, 'rule', JSON.stringify({ score, next }), at)
  return { state: next, points: made }
}
