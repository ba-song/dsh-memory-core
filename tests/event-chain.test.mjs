import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'
import { insertMemory } from '../lib/store/memories.js'
import { linkMemory } from '../lib/store/graph.js'
import { eventChainCandidates } from '../lib/recall/event-chain.js'

const HOME = '/sdcard/DSHA/生活/数据/home'
const OTHER = '/sdcard/DSHA/渠道/qq-群/123456'
const event = (type, seq, text, time, data = {}) => ({
  type, seq, time,
  data: type === 'message/recall'
    ? data
    : { message: { source: { kind: 'user' } }, content: [{ type: 'text', text }] },
})

test('event chain only returns same-session, same-scope, anchored shared-entity events', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-event-chain-'))
  const { db } = openDb(dir)
  const raw = new RawArchive({ db, dir: join(dir, 'raw'), cwdPrefixes: [HOME, OTHER], log: { info() {}, warn() {} } })
  const sid = 'session-chain1234-aaaa-1111-2222-333333333333'
  const otherSid = 'session-other1234-bbbb-1111-2222-444444444444'
  const at = Date.now() - 120000
  try {
    const emit = (sessionId, seq, text, cwd = HOME) => raw.onEvent(
      { header: { id: sessionId, cwd } },
      event('user/message', seq, text, at + seq * 1000),
    )
    emit(sid, 1, '主人和鲸鱼讨论海边旅行')
    emit(sid, 2, '主人后来补充了海边旅行安排')
    emit(sid, 3, '主人提到另一件没有关联的事情')
    emit(sid, 4, '主人说过一条后来撤回的海边信息')
    emit(sid, 5, '主人谈过一件没有原话锚点的海边计划')
    emit(otherSid, 1, '主人也讨论了海边旅行')
    emit(sid, 6, '主人讨论了一件工资方面的事情')
    emit(sid, 7, '主人和鲸鱼继续讨论海边旅行', OTHER)

    const add = async (seq, text, opts = {}) => {
      const id = await insertMemory(db, {
        kind: 'episode', text, scopeType: opts.scopeType ?? 'owner',
        scopeId: opts.scopeId ?? '', sourceMsgId: `p4:${opts.sid ?? sid}:${seq}`,
        sourceTs: at + seq * 1000, validFrom: opts.validFrom ?? at - 1000,
        validTo: opts.validTo ?? null, temporalKind: opts.temporalKind ?? 'current',
        status: opts.status ?? 'active',
      })
      linkMemory(db, id, text, at)
      return db.prepare('SELECT * FROM memories WHERE id=?').get(id)
    }
    const seed = await add(1, '主人和鲸鱼讨论海边旅行')
    const neighbor = await add(2, '主人后来补充了海边旅行安排')
    await add(3, '猫咪喜欢在阳光下睡觉')
    await add(4, '主人说过一条后来撤回的海边信息')
    const missing = await add(5, '主人谈过一件没有原话锚点的海边计划', { validFrom: at - 1000 })
    const wrongScope = await add(2, '主人后来补充海边旅行', { scopeType: 'contact', scopeId: 'friend-1' })
    const otherSession = await add(1, '主人也讨论了海边旅行', { sid: otherSid })
    const genericOnly = await add(6, '主人讨论了一件工资方面的事情')
    const sameSessionOtherCwd = await add(7, '主人和鲸鱼继续讨论海边旅行')

    // 撤回 seq=4；它必须从链中消失。
    raw.onEvent({ header: { id: sid, cwd: HOME } }, event('message/recall', 8, '', at + 8000, { seq: 4 }))
    const missingRaw = db.prepare("SELECT id FROM raw_meta WHERE seq=5 AND cwd=? AND tombstone=0").get(HOME)
    db.prepare('DELETE FROM raw_meta WHERE id=?').run(Number(missingRaw.id))

    const rows = eventChainCandidates(db, seed, { cwd: HOME })
    assert.deepEqual(rows.map((row) => row.id), [neighbor.id])
    assert.equal(rows[0].relation, 'same-session+shared-entity')
    assert.equal(rows[0].sourceSeq, 2)
    assert.ok(rows[0].sharedEntities.length > 0)
    assert.notEqual(rows[0].anchorRawId, 0)
    assert.equal(rows[0].scopeType, 'owner')
    assert.equal(rows[0].scopeId, '')
    assert.ok(!rows.some((row) => [wrongScope.id, otherSession.id, missing.id, genericOnly.id, sameSessionOtherCwd.id].includes(row.id)))
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('as-of event chain excludes unknown-validity and expired events', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-event-chain-asof-'))
  const { db } = openDb(dir)
  const raw = new RawArchive({ db, dir: join(dir, 'raw'), cwdPrefixes: [HOME], log: { info() {}, warn() {} } })
  const sid = 'session-chain5678-aaaa-1111-2222-333333333333'
  const at = Date.now() - 60000
  try {
    const emit = (seq, text) => raw.onEvent({ header: { id: sid, cwd: HOME } }, event('user/message', seq, text, at + seq * 1000))
    emit(1, '主人和鲸鱼讨论海边旅行')
    emit(2, '主人后来补充海边旅行')
    emit(3, '主人还有一条时间不明确的海边往事')
    const add = async (seq, text, opts = {}) => {
      const id = await insertMemory(db, {
        kind: 'episode', text, scopeType: 'owner',
        sourceMsgId: `p4:${sid}:${seq}`, sourceTs: at + seq * 1000,
        validFrom: opts.validFrom ?? null, validTo: opts.validTo ?? null,
        temporalKind: opts.temporalKind ?? 'unknown',
      })
      linkMemory(db, id, text, at)
      return db.prepare('SELECT * FROM memories WHERE id=?').get(id)
    }
    const seed = await add(1, '主人和鲸鱼讨论海边旅行', { validFrom: at - 1000, temporalKind: 'current' })
    await add(2, '主人后来补充海边旅行', { validFrom: at - 1000, temporalKind: 'current' })
    await add(3, '主人还有一条时间不明确的海边往事')
    const asOf = at + 10000
    const rows = eventChainCandidates(db, seed, { cwd: HOME, asOf })
    assert.deepEqual(rows.map((row) => row.sourceMsgId), [`p4:${sid}:2`])
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
