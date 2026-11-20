import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { RawArchive, shortSid } from '../lib/ingest/archive.js'
import { findAnchorRow, cleanRowBody } from '../lib/inject/anchors.js'
import { buildProvenanceBlock } from '../lib/inject/context-blocks.js'

const HOME = '/sdcard/DSHA/生活/数据/home'
const event = (type, seq, data, time) => ({ type, seq, time, data })

test('full session identity isolates same-shortSid provenance and tombstones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-session-id-isolation-'))
  const { db } = openDb(dir)
  const raw = new RawArchive({
    db, dir: join(dir, 'raw'), cwdPrefixes: [HOME],
    log: { info() {}, warn() {} },
  })
  const sidA = 'session-deadbeef-aaaa-1111-2222-333333333333'
  const sidB = 'session-deadbeef-bbbb-1111-2222-444444444444'
  const atA = Date.now() - 1000
  const atB = Date.now()
  try {
    assert.equal(shortSid(sidA), shortSid(sidB))
    raw.onEvent({ header: { id: sidA, cwd: HOME } }, event('user/message', 1, {
      message: { source: { kind: 'user' } },
      content: [{ type: 'text', text: '甲会话的独立原话内容' }],
    }, atA))
    raw.onEvent({ header: { id: sidB, cwd: HOME } }, event('user/message', 1, {
      message: { source: { kind: 'user' } },
      content: [{ type: 'text', text: '乙会话的独立原话内容' }],
    }, atB))

    const hitA = { id: 1, source_msg_id: `p4:${sidA}:1`, source_ts: atA, scope_type: 'owner', text: '甲会话的独立原话内容' }
    const hitB = { id: 2, source_msg_id: `p4:${sidB}:1`, source_ts: atB, scope_type: 'owner', text: '乙会话的独立原话内容' }
    const anchorA = findAnchorRow(db, hitA, { cwd: HOME })
    const rawIdA = Number(anchorA?.row?.id ?? 0)
    const anchorB = findAnchorRow(db, hitB, { cwd: HOME })
    assert.ok(anchorA && anchorB)
    assert.match(cleanRowBody(anchorA.row), /甲会话/)
    assert.match(cleanRowBody(anchorB.row), /乙会话/)

    const blockA = buildProvenanceBlock(db, { cwd: HOME, hits: [hitA], persona: {} })
    assert.match(blockA.block, /甲会话/)
    assert.doesNotMatch(blockA.block, /乙会话/)

    raw.onEvent({ header: { id: sidA, cwd: HOME } }, event('message/recall', 2, { seq: 1 }, atA + 2))
    const states = db.prepare('SELECT extra,tombstone FROM raw_meta WHERE seq=1 AND cwd=? ORDER BY id').all(HOME)
      .map((row) => ({ sessionId: JSON.parse(row.extra).sessionId, tombstone: Number(row.tombstone) }))
    assert.deepEqual(states, [
      { sessionId: sidA, tombstone: 1 },
      { sessionId: sidB, tombstone: 0 },
    ])
    assert.equal(findAnchorRow(db, hitA, { cwd: HOME }), null)
    assert.equal(findAnchorRow(db, {
      id: 3, source_msg_id: `raw:${rawIdA}`, source_ts: atA,
      scope_type: 'owner', text: '甲会话的独立原话内容',
    }, { cwd: HOME }), null, '精确 raw-id 撤回后不得降级到乙会话的邻近原话')
    assert.ok(findAnchorRow(db, hitB, { cwd: HOME }))
    // DB tombstone 与 FTS 删除必须同一事务：失败时不能留下半更新状态。
    db.exec("CREATE TRIGGER fail_tombstone BEFORE UPDATE OF tombstone ON raw_meta BEGIN SELECT RAISE(ABORT, 'test rollback'); END")
    const rawIdB = Number(anchorB.row.id)
    raw.onEvent({ header: { id: sidB, cwd: HOME } }, event('message/recall', 2, { seq: 1 }, atB + 2))
    assert.equal(Number(db.prepare('SELECT tombstone FROM raw_meta WHERE id=?').get(rawIdB).tombstone), 0)
    assert.equal(Number(db.prepare('SELECT count(*) c FROM raw_fts WHERE rowid=?').get(rawIdB).c), 1)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
