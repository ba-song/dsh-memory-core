import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../lib/store/db.js'
import { RawArchive } from '../lib/ingest/archive.js'

test('RawArchive tombstone only marks matching file+seq within the requested cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tombstone-cwd-'))
  const { db } = openDb(dir)
  const raw = new RawArchive({ db, dir: join(dir, 'raw'), cwdPrefixes: ['/sdcard/DSHA'], log: { warn() {}, info() {} } })
  try {
    const file = '2026-11-20/s-12345678.md'
    const insert = db.prepare('INSERT INTO raw_meta(day,file,line_no,seq,role,speaker,channel,tombstone,chars,raw_text,at,extra,cwd) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const aCwd = '/sdcard/DSHA/生活/数据/home'
    const bCwd = '/sdcard/DSHA/渠道/qq/私聊_1000000001'
    const aId = Number(insert.run('2026-11-20',file,1,7,'user','user','qq',0,8,'A 需要撤回',1,JSON.stringify({sessionId:'session-12345678-A'}),aCwd).lastInsertRowid)
    const bId = Number(insert.run('2026-11-20',file,1,7,'user','user','qq',0,8,'B 必须保留',2,JSON.stringify({sessionId:'session-12345678-B'}),bCwd).lastInsertRowid)
    db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(aId,'A 需要撤回')
    db.prepare('INSERT INTO raw_fts(rowid,text) VALUES(?,?)').run(bId,'B 必须保留')
    raw.tombstone('session-12345678-A', 7, aCwd, 3)
    assert.equal(Number(db.prepare('SELECT tombstone FROM raw_meta WHERE id=?').get(aId).tombstone),1)
    assert.equal(Number(db.prepare('SELECT tombstone FROM raw_meta WHERE id=?').get(bId).tombstone),0)
    assert.equal(Number(db.prepare('SELECT count(*) c FROM raw_fts WHERE rowid=?').get(aId).c),0)
    assert.equal(Number(db.prepare('SELECT count(*) c FROM raw_fts WHERE rowid=?').get(bId).c),1)
    raw.tombstone('session-12345678-A', 7, aCwd, 4)
    assert.equal(Number(db.prepare('SELECT count(*) c FROM raw_meta WHERE id=? AND tombstone=1').get(aId).c),1)
  } finally { db.close(); rmSync(dir,{recursive:true,force:true}) }
})
