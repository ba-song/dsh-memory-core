#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { recall } from '../lib/recall/recall.js'
import { loadVectors } from '../lib/store/memories.js'
import { loadEmbed } from '../lib/embed/onnx.mjs'
import { keywordOverlapRatio, filterInjectionHits, buildHitsBlock, relevanceOf } from '../lib/inject/hits.js'
import { buildStable } from '../lib/inject/stable.js'
import { buildQuotesBlock } from '../lib/inject/quotes.js'
import { scopeForSession } from '../lib/scope.js'
import { evaluateRankedResults, explainRrf } from '../lib/recall/eval-metrics.js'
import { eventChainCandidates } from '../lib/recall/event-chain.js'
import { assertOfflineSnapshotPath, sha256File, validateAnnotationDataset, verifySnapshotFingerprint, verifyCodeCommit } from '../lib/recall/eval-dataset.js'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : ''
}
const dbArgument = valueAfter('--db')
const actualCodeCommit = valueAfter('--code-commit')
if (!dbArgument) throw new Error('必须显式提供 --db 指向独立、一致的离线数据库快照；禁止使用默认生产数据库路径')
const dbPath = resolve(dbArgument)
if (!existsSync(dbPath)) throw new Error(`数据库快照不存在：${dbPath}`)
const productionDbPath = resolve(join(process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据', 'memory.db'))
assertOfflineSnapshotPath(dbPath, productionDbPath)
if (existsSync(`${dbPath}-wal`) && statSync(`${dbPath}-wal`).size > 0) {
  throw new Error('数据库快照存在非空 WAL；请先在隔离副本上完成一致性快照/检查点，再运行评测')
}
const cwd = valueAfter('--cwd') || '/sdcard/DSHA/生活/数据/home'
const factsPath = valueAfter('--facts') || '/sdcard/DSHA/记忆/数据/事实卡.md'
const ownerQQ = valueAfter('--owner-qq') || ''
const ownerDir = valueAfter('--owner-dir') || ''
const annotationsPath = valueAfter('--annotations') || new URL('./m3-eval-annotations.template.json', import.meta.url)
const stablePath = valueAfter('--stable')
const jsonOnly = args.includes('--json')
const eventChainEnabled = args.includes('--event-chain')
const asOfOf = (value, queryId) => {
  if (value == null || value === '') return null
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(String(value))
  if (Number.isFinite(parsed)) return parsed
  throw new Error(`评测查询 ${queryId} 的 asOf 无法解析：${value}`)
}
const queryPath = new URL('./m3-eval-queries.json', import.meta.url)
const queries = JSON.parse(readFileSync(queryPath, 'utf8'))
const annotationDataset = JSON.parse(readFileSync(annotationsPath, 'utf8'))
const annotationValidation = validateAnnotationDataset(annotationDataset, queries)
const codeCommitVerification = verifyCodeCommit(annotationDataset.codeCommit, actualCodeCommit, { required: annotationValidation.positiveLabels > 0 })
const actualDatabaseSnapshotSha256 = await sha256File(dbPath)
const snapshotFingerprint = verifySnapshotFingerprint(annotationDataset.databaseSnapshotSha256, actualDatabaseSnapshotSha256)
const annotationsById = new Map((annotationDataset.queries ?? []).map((item) => [String(item.id), item]))
const runParameters = annotationDataset.runParameters
const db = new DatabaseSync(dbPath, { readOnly: true })
let vectors = new Map()
try { vectors = loadVectors(db) } catch {}
try { await loadEmbed(process.env.DY_EMBED_MODEL || '/opt/qqai/models/bge-small-zh') } catch {}

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
  const gradedRows = []
  let forbiddenReturnedTotal = 0
  for (const item of queries) {
    const annotation = annotationsById.get(String(item.id)) ?? null
    const queryCwd = String(annotation?.scope?.cwd ?? cwd)
    const asOfAt = asOfOf(annotation?.asOf, item.id)
    const expectedLevel = String(annotation?.scope?.level ?? 'owner')
    const queryScope = scopeForSession({
      cwd: queryCwd, sessionId: `eval:${item.id}`,
      isOwner: expectedLevel === 'owner',
    })
    if (annotation?.scope?.level && queryScope.level !== expectedLevel) {
      throw new Error(`评测查询 ${item.id} 的标注 scope 与 cwd 推导不一致：标注=${expectedLevel}，推导=${queryScope.level}`)
    }
    if (expectedLevel === 'external' && annotation?.scope?.contactId
      && String(annotation.scope.contactId) !== String(queryScope.contactId)) {
      throw new Error(`评测查询 ${item.id} 的 contactId 与 cwd 推导不一致`)
    }
    if (expectedLevel === 'group' && annotation?.scope?.groupId
      && String(annotation.scope.groupId) !== String(queryScope.groupId)) {
      throw new Error(`评测查询 ${item.id} 的 groupId 与 cwd 推导不一致`)
    }
    let armSnapshot = {}
    const monitor = { record(value) { armSnapshot = value?.arms ?? {} } }
    const found = await recall(db, item.query, {
      vectors, gate: { semantic: runParameters.recallGateSemantic, keyword: runParameters.recallGateKeyword }, limit: runParameters.recallLimit,
      scope: queryScope, asOf: asOfAt, monitor, trackAccess: false,
    })
    const graded = evaluateRankedResults(
      found,
      annotation?.relevant ?? [],
      { forbiddenMemoryIds: annotation?.forbiddenMemoryIds ?? [] },
    )
    forbiddenReturnedTotal += graded.forbiddenReturnedCount ?? 0
    if (graded.labelled) gradedRows.push(graded)
    const rrfExplanation = explainRrf(armSnapshot, found.slice(0, 5).map((hit) => Number(hit.id)))
    const chainMap = new Map()
    if (eventChainEnabled && queryScope.level === 'owner') {
      for (const seedHit of found.slice(0, 3)) {
        const seed = db.prepare('SELECT * FROM memories WHERE id=?').get(Number(seedHit.id))
        if (!seed) continue
        for (const candidate of eventChainCandidates(db, seed, { cwd: queryCwd, asOf: asOfAt, limit: 5 })) {
          const existing = chainMap.get(candidate.id)
          if (existing) existing.seedIds.push(Number(seed.id))
          else chainMap.set(candidate.id, { ...candidate, seedIds: [Number(seed.id)] })
        }
      }
    }
    const eventChainDiagnostic = [...chainMap.values()].slice(0, 10)
    let queryStableText = ''
    if (queryScope.level === 'owner') {
      if (queryCwd === cwd) queryStableText = stableText
      else {
        try {
          queryStableText = buildStable(queryCwd, {
            db, factsPath, ownerQQ, ownerDir, isOwner: true, scope: queryScope,
          })
        } catch {}
      }
    }
    const top = found.slice(0, 3).map((hit) => ({
      id: Number(hit.id), kind: hit.kind, text: String(hit.text ?? '').slice(0, 160),
      sourceMsgId: String(hit.source_msg_id ?? ''), sourceTs: Number(hit.source_ts ?? 0),
      scopeType: String(hit.scope_type ?? ''), quote: String(hit.quote ?? ''),
      scores: hit.scores ?? {},
      overlap: keywordOverlapRatio(item.query, hit.text),
    }))
    const injectedHits = filterInjectionHits(found, item.query, { minSemantic: runParameters.injectionMinSemantic, minKeywordOverlap: runParameters.injectionMinKeywordOverlap })
      .filter((hit) => relevanceOf(hit) >= 0.55)
    const hitsBlock = buildHitsBlock(injectedHits, { maxItems: runParameters.injectionMaxItems, maxChars: runParameters.injectionMaxChars, minScore: runParameters.injectionMinSemantic })
    const injectedCount = hitsBlock ? (hitsBlock.match(/^- \[/gm) ?? []).length : 0
    const quotesBlock = queryScope.raw === 'none' || asOfAt !== null ? '' : buildQuotesBlock(db, { cwd: queryCwd, hits: [], query: item.query, maxHits: 2 }).block
    if (String(item.id).startsWith('g')) generalizedInjectionCount += injectedCount
    if (item.placeholder === true) placeholderInjectionCount += injectedCount
    const expected = Array.isArray(item.expectedContains) ? item.expectedContains : []
    const matches = (text) => expected.some((needle) => String(text ?? '').includes(needle))
    const matching = expected.length
      ? top.filter((hit) => matches(hit.text)).length
      : null
    const stableHit = asOfAt === null && expected.length > 0 && matches(queryStableText)
    const quotesHit = asOfAt === null && expected.length > 0 && matches(quotesBlock)
    const hitsBlockOnly = expected.length > 0 && matches(hitsBlock)
    const hitsOnly = expected.length > 0 && found.slice(0, 3).some((hit) => matches(hit.text))
    // Coverage measures what the agent can actually see, not retrieval-only candidates.
    const coverage = expected.length > 0 && (stableHit || quotesHit || hitsBlockOnly)
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
      id: item.id, query: item.query, placeholder: item.placeholder === true, scope: queryScope.level, asOf: asOfAt,
      legacyStringHeuristicLabelled: expected.length > 0,
      legacyStringHeuristicHitAt3: expected.length ? matching > 0 : null,
      injectedCount,
      legacyStringHeuristicPrecisionAt3: expected.length ? matching / 3 : null,
      top1Score: top[0] ? Math.max(Number(top[0].scores.semantic ?? 0), Number(top[0].scores.keyword ?? 0), Number(top[0].scores.graph ?? 0)) : 0,
      top1Overlap: top[0]?.overlap ?? 0, top,
      stableHit, hitsBlock, hitsInjected: injectedCount, rrfExplanation, eventChainDiagnostic, gradedMetrics: graded,
      quotesBlock, quotesHit, coverage, hitsOnly, hitsBlockOnly,
    })
  }
  const report = {
    ok: true, dbPath, readOnly: true, trackAccess: false,
    queryCount: queries.length, eventChainDiagnosticEnabled: eventChainEnabled,
    annotationDatasetVersion: annotationDataset.datasetVersion ?? null,
    annotationValidation,
    codeCommit: annotationDataset.codeCommit ?? null,
    actualCodeCommit: codeCommitVerification.actual,
    codeCommitVerification,
    databaseSnapshotSha256: annotationDataset.databaseSnapshotSha256 ?? null,
    actualDatabaseSnapshotSha256,
    snapshotFingerprint,
    embeddingModel: annotationDataset.embeddingModel ?? null,
    runParameters,
    gradedQueryCount: gradedRows.length,
    gradedMetrics: {
      judgedNoRelevantCount: gradedRows.filter((row) => row.relevantCount === 0).length,
      recallAt1: gradedRows.some((row) => row.relevantCount > 0) ? gradedRows.filter((row) => row.relevantCount > 0).reduce((sum, row) => sum + row.recall[1], 0) / gradedRows.filter((row) => row.relevantCount > 0).length : null,
      recallAt3: gradedRows.some((row) => row.relevantCount > 0) ? gradedRows.filter((row) => row.relevantCount > 0).reduce((sum, row) => sum + row.recall[3], 0) / gradedRows.filter((row) => row.relevantCount > 0).length : null,
      recallAt5: gradedRows.some((row) => row.relevantCount > 0) ? gradedRows.filter((row) => row.relevantCount > 0).reduce((sum, row) => sum + row.recall[5], 0) / gradedRows.filter((row) => row.relevantCount > 0).length : null,
      precisionAt1: gradedRows.length ? gradedRows.reduce((sum, row) => sum + row.precision[1], 0) / gradedRows.length : null,
      precisionAt3: gradedRows.length ? gradedRows.reduce((sum, row) => sum + row.precision[3], 0) / gradedRows.length : null,
      precisionAt5: gradedRows.length ? gradedRows.reduce((sum, row) => sum + row.precision[5], 0) / gradedRows.length : null,
      mrr: gradedRows.some((row) => row.relevantCount > 0) ? gradedRows.filter((row) => row.relevantCount > 0).reduce((sum, row) => sum + row.mrr, 0) / gradedRows.filter((row) => row.relevantCount > 0).length : null,
      ndcgAt5: gradedRows.some((row) => row.relevantCount > 0) ? gradedRows.filter((row) => row.relevantCount > 0).reduce((sum, row) => sum + row.ndcgAt5, 0) / gradedRows.filter((row) => row.relevantCount > 0).length : null,
      evidenceCoverage: gradedRows.some((row) => row.relevantCount > 0) ? gradedRows.filter((row) => row.relevantCount > 0).reduce((sum, row) => sum + row.evidenceCoverage, 0) / gradedRows.filter((row) => row.relevantCount > 0).length : null,
      forbiddenReturnedCount: forbiddenReturnedTotal,
    },
    legacyStringHeuristic: {
      queryCount: queries.length,
      labelledCount: labelled,
      hitAt3: labelled ? hitsAt3 / labelled : null,
      precisionAt3: precisionDenominator ? precisionNumerator / precisionDenominator : null,
      stableCoveredCount,
      coverageAt3: labelled ? coverageCount / labelled : null,
      hitsOnlyAt3: labelled ? hitsOnlyCount / labelled : null,
      hitsBlockOnlyAt3: labelled ? hitsBlockOnlyCount / labelled : null,
      generalizedInjectionCount, placeholderInjectionCount,
      note: 'expectedContains 字符串包含启发式，不是人工相关性 ground truth；不得用于正式 Recall@K / Precision@K。',
    },
    stableError,
    rows,
  }
  process.stdout.write(jsonOnly ? JSON.stringify(report) + '\n' : JSON.stringify(report, null, 2) + '\n')
} finally {
  db.close()
}
