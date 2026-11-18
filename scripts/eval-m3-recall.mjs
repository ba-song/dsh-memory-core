#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { recall } from '../lib/recall/recall.js'
import { loadVectors } from '../lib/store/memories.js'
import { loadEmbed } from '../lib/embed/onnx.mjs'
import { keywordOverlapRatio, filterInjectionHits, buildHitsBlock, relevanceOf } from '../lib/inject/hits.js'
import { buildStable } from '../lib/inject/stable.js'
import { buildQuotesBlock } from '../lib/inject/quotes.js'
import { scopeForSession } from '../lib/scope.js'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : ''
}
const dbPath = resolve(valueAfter('--db') || join(process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据', 'memory.db'))
const cwd = valueAfter('--cwd') || '/sdcard/DSHA/生活/数据/home'
const factsPath = valueAfter('--facts') || '/sdcard/DSHA/记忆/数据/事实卡.md'
const ownerQQ = valueAfter('--owner-qq') || ''
const ownerDir = valueAfter('--owner-dir') || ''
const stablePath = valueAfter('--stable')
const jsonOnly = args.includes('--json')
const queryPath = new URL('./m3-eval-queries.json', import.meta.url)
const queries = JSON.parse(readFileSync(queryPath, 'utf8'))
const db = new DatabaseSync(dbPath, { readOnly: true })
let vectors = new Map()
try { vectors = loadVectors(db) } catch {}
try { await loadEmbed('/opt/qqai/models/bge-small-zh') } catch {}

let stableText = ''
let stableError = ''
try {
  if (stablePath) {
    stableText = readFileSync(resolve(stablePath), 'utf8')
  } else {
    stableText = buildStable(cwd, {
      db, factsPath, ownerQQ, ownerDir, isOwner: true,
      scope: scopeForSession({ cwd, sessionId: 'eval', isOwner: true }),
    })
  }
} catch (err) {
  stableText = ''
  stableError = String(err?.message ?? err)
}

const rows = []
let labelled = 0, hitsAt3 = 0, precisionNumerator = 0, precisionDenominator = 0
let generalizedInjectionCount = 0, placeholderInjectionCount = 0
let stableCoveredCount = 0, coverageCount = 0, hitsOnlyCount = 0, hitsBlockOnlyCount = 0
try {
  for (const item of queries) {
    const found = await recall(db, item.query, {
      vectors, gate: { semantic: 0.55, keyword: 0.35 }, limit: 5,
      trackAccess: false,
    })
    const top = found.slice(0, 3).map((hit) => ({
      kind: hit.kind, text: String(hit.text ?? '').slice(0, 160),
      scores: hit.scores ?? {},
      overlap: keywordOverlapRatio(item.query, hit.text),
    }))
    const injectedHits = filterInjectionHits(found, item.query, { minSemantic: 0.55, minKeywordOverlap: 0.35 })
      .filter((hit) => relevanceOf(hit) >= 0.55)
    const hitsBlock = buildHitsBlock(injectedHits, { maxItems: 3, maxChars: 200, minScore: 0.55 })
    const injectedCount = hitsBlock ? (hitsBlock.match(/^- \[/gm) ?? []).length : 0
    const quotesBlock = buildQuotesBlock(db, { cwd, hits: [], query: item.query, maxHits: 2 }).block
    if (String(item.id).startsWith('g')) generalizedInjectionCount += injectedCount
    if (item.placeholder === true) placeholderInjectionCount += injectedCount
    const expected = Array.isArray(item.expectedContains) ? item.expectedContains : []
    const matches = (text) => expected.some((needle) => String(text ?? '').includes(needle))
    const matching = expected.length
      ? top.filter((hit) => matches(hit.text)).length
      : null
    const stableHit = expected.length > 0 && matches(stableText)
    const quotesHit = expected.length > 0 && matches(quotesBlock)
    const hitsBlockOnly = expected.length > 0 && matches(hitsBlock)
    const hitsOnly = expected.length > 0 && found.slice(0, 3).some((hit) => matches(hit.text))
    const coverage = expected.length > 0 && (
      stableHit || quotesHit || found.slice(0, 3).some((hit) => matches(hit.text))
    )
    if (expected.length) {
      labelled++
      if (matching > 0) hitsAt3++
      precisionNumerator += matching
      precisionDenominator += 3
      if (stableHit) stableCoveredCount++
      if (coverage) coverageCount++
      if (hitsOnly) hitsOnlyCount++
      if (hitsBlockOnly) hitsBlockOnlyCount++
    }
    rows.push({
      id: item.id, query: item.query, placeholder: item.placeholder === true,
      labelled: expected.length > 0, hitAt3: expected.length ? matching > 0 : null,
      injectedCount,
      precisionAt3: expected.length ? matching / 3 : null,
      top1Score: top[0] ? Math.max(Number(top[0].scores.semantic ?? 0), Number(top[0].scores.keyword ?? 0), Number(top[0].scores.graph ?? 0)) : 0,
      top1Overlap: top[0]?.overlap ?? 0, top,
      stableHit, hitsBlock, hitsInjected: injectedCount,
      quotesBlock, quotesHit, coverage, hitsOnly, hitsBlockOnly,
    })
  }
  const report = {
    ok: true, dbPath, readOnly: true, trackAccess: false,
    queryCount: queries.length, labelledCount: labelled,
    hitAt3: labelled ? hitsAt3 / labelled : null,
    precisionAt3: precisionDenominator ? precisionNumerator / precisionDenominator : null,
    generalizedInjectionCount, placeholderInjectionCount,
    stableCoveredCount,
    coverageAt3: labelled ? coverageCount / labelled : null,
    hitsOnlyAt3: labelled ? hitsOnlyCount / labelled : null,
    hitsBlockOnlyAt3: labelled ? hitsBlockOnlyCount / labelled : null,
    stableError,
    rows,
  }
  process.stdout.write(jsonOnly ? JSON.stringify(report) + '\n' : JSON.stringify(report, null, 2) + '\n')
} finally {
  db.close()
}
