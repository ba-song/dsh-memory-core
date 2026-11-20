import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'

test('raw group and person archive tools never return tombstoned messages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-raw-tools-tombstone-'))
  const previousMemoryDir = process.env.DY_MEMORY_DIR
  process.env.DY_MEMORY_DIR = dir
  const registered = {}
  const ctx = {
    get(name) {
      if (name === 'tools') return { register: (tool) => { registered[tool.name] = tool } }
      if (name === 'systemPrompt') return { context: () => () => {} }
      if (name === 'agents') return { list: () => [] }
      return undefined
    },
    on() {},
    logger: { info() {}, warn() {}, error() {} },
  }
  let db
  try {
    const mod = await import('../lib/index.js')
    mod.apply(ctx, { ownerQQ: '1000000001' })
    ;({ db } = openDb(dir))
    new RawArchive({ db, dir: join(dir, 'raw'), cwdPrefixes: ['/sdcard/DSHA/渠道/qq-群'], log: { info() {}, warn() {} } })
    const insert = db.prepare(`INSERT INTO raw_meta
      (day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd,person_id,speaker_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const groupCwd = '/sdcard/DSHA/渠道/qq-群'
    const at = Date.now()
    const add = (line, cwd, personId, text, tombstone = 0) => insert.run(
      '2026-11-20', '2026-11-20/s-test.md', line, line, 'user', 'user', 'qq',
      tombstone, text.length, text, at + line, '{}', cwd, personId, personId,
    )
    add(1, groupCwd, 'person-1', '群 g-test 的有效消息')
    add(2, groupCwd, 'person-1', '群 g-test 的撤回消息', 1)
    add(3, groupCwd, 'person-2', '另一个人的有效消息')
    add(4, groupCwd, 'person-2', '另一个人的撤回消息', 1)

    const ownerExec = { agent: { session: { header: { cwd: '/root/qq-agent/QQ会话/私聊_1000000001', id: 'raw-tools-owner' } } } }
    const group = JSON.parse((await registered.dy_memory_group_archive.execute({ groupId: 'g-test' }, ownerExec)).detail)
    assert.equal(group.count, 1)
    assert.match(group.items[0].text, /有效消息/)
    assert.doesNotMatch(JSON.stringify(group), /撤回消息/)

    const person = JSON.parse((await registered.dy_memory_person_archive.execute({ personId: 'person-1' })).detail)
    assert.equal(person.count, 1)
    assert.match(person.items[0].text, /有效消息/)
    assert.doesNotMatch(JSON.stringify(person), /撤回消息/)

    const people = JSON.parse((await registered.dy_memory_person_archive.execute({ limit: 20 })).detail)
    assert.equal(people.persons.find((row) => row.person_id === 'person-1').c, 1)
  } finally {
    try { db?.close() } catch {}
    rmSync(dir, { recursive: true, force: true })
    if (previousMemoryDir === undefined) delete process.env.DY_MEMORY_DIR
    else process.env.DY_MEMORY_DIR = previousMemoryDir
  }
})
