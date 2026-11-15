import { openDb } from '../lib/store/db.js'
import { DATA_DIR } from '../lib/config.js'
import { loadVectors } from '../lib/store/memories.js'

const { db } = openDb(DATA_DIR)
const vectors = loadVectors(db)
const ids = [...vectors.keys()]
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
const pairs = []
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const a = vectors.get(ids[i]); const b = vectors.get(ids[j])
  if (a?.length && b?.length && a.length === b.length) pairs.push(dot(a, b))
}
pairs.sort((x, y) => x - y)
const q = (p) => pairs[Math.floor((pairs.length - 1) * p)]?.toFixed(3)
const buckets = { '<0.45': 0, '0.45–0.75': 0, '0.75–0.92': 0, '≥0.92': 0 }
for (const v of pairs) {
  if (v < 0.45) buckets['<0.45']++
  else if (v < 0.75) buckets['0.45–0.75']++
  else if (v < 0.92) buckets['0.75–0.92']++
  else buckets['≥0.92']++
}
console.log(JSON.stringify({ total: ids.length, pairs: pairs.length,
  p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9), min: q(0), max: q(1), buckets }, null, 2))
