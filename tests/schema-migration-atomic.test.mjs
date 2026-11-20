import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { DDL, SCHEMA_VERSION } from '../lib/store/schema.js'
import { openDb } from '../lib/store/db.js'

function makeSchema4Fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-schema4-'))
  const file = join(dir, 'memory.db')
  const db = new DatabaseSync(file)
  // Schema v4 is the checked-in bb77de2 DDL: identical to the candidate DDL
  // except for the v5 episode_rewrite_snapshots table and its index.
  for (const sql of DDL) {
    if (/episode_rewrite_snapshots|idx_ers_memory/.test(sql)) continue
    db.exec(sql)
  }
  db.prepare("INSERT INTO meta(k,v) VALUES('schema_version','4')").run()
  db.prepare("INSERT INTO memories(id,kind,text,created_at_epoch,scope_type,scope_id,quote,revision,updated_at,temporal_kind) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(41, 'fact', 'synthetic-memory-no-private-content', 1700000000, 'owner', '', 'synthetic-quote', 3, 1700000001, 'point')
  db.prepare('INSERT INTO fts_bigram(rowid,text) VALUES(?,?)').run(41, 'synthetic-memory-no-private-content')
  db.prepare('INSERT INTO fts_trigram(rowid,text) VALUES(?,?)').run(41, 'synthetic-memory-no-private-content')
  db.prepare('INSERT INTO vectors(memory_id,dim,vec) VALUES(?,?,?)').run(41, 2, Buffer.from(new Float32Array([0.25, 0.75]).buffer))
  db.prepare("INSERT INTO entities(id,name,type) VALUES(7,'synthetic-entity','thing')").run()
  db.prepare('INSERT INTO memory_entities(memory_id,entity_id,weight) VALUES(?,?,?)').run(41, 7, 0.8)
  db.prepare('INSERT INTO relations(src,dst,relation,weight,memory_id,created_at) VALUES(?,?,?,?,?,?)').run(7, 7, 'synthetic-self-link-fixture', 0.5, 41, 1700000002)
  db.prepare('INSERT INTO memory_revisions(memory_id,revision,previous_json,changed_at,invalidation) VALUES(?,?,?,?,?)')
    .run(41, 2, '{"text":"synthetic-previous"}', 1700000003, '')
  // raw tables are deliberately represented too: the migration must not touch them.
  db.exec(`CREATE TABLE raw_meta(id INTEGER PRIMARY KEY, role TEXT NOT NULL, raw_text TEXT NOT NULL, tombstone INTEGER NOT NULL DEFAULT 0)`)
  db.exec('CREATE TABLE raw_fts(raw_id INTEGER PRIMARY KEY, text TEXT NOT NULL)')
  db.exec('CREATE TABLE raw_vectors(raw_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL)')
  const raw = db.prepare('INSERT INTO raw_meta(id,role,raw_text,tombstone) VALUES(?,?,?,?)')
  raw.run(1, 'user', 'synthetic user fixture', 0)
  raw.run(2, 'self', 'synthetic self fixture', 0)
  raw.run(3, 'tool', 'synthetic tool fixture', 0)
  raw.run(4, 'user', 'synthetic tombstone fixture', 1)
  db.prepare('INSERT INTO raw_fts(raw_id,text) VALUES(?,?)').run(1, 'synthetic raw fts')
  db.prepare('INSERT INTO raw_vectors(raw_id,dim,vec) VALUES(?,?,?)').run(1, 2, Buffer.from(new Float32Array([1, 0]).buffer))
  db.close()
  return { dir, file }
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

function indexExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(name))
}

function counts(db) {
  return {
    memories: db.prepare('SELECT count(*) AS n FROM memories').get().n,
    ftsBigram: db.prepare('SELECT count(*) AS n FROM fts_bigram').get().n,
    ftsTrigram: db.prepare('SELECT count(*) AS n FROM fts_trigram').get().n,
    vectors: db.prepare('SELECT count(*) AS n FROM vectors').get().n,
    entities: db.prepare('SELECT count(*) AS n FROM entities').get().n,
    memoryEntities: db.prepare('SELECT count(*) AS n FROM memory_entities').get().n,
    relations: db.prepare('SELECT count(*) AS n FROM relations').get().n,
    revisions: db.prepare('SELECT count(*) AS n FROM memory_revisions').get().n,
    rawMeta: db.prepare('SELECT count(*) AS n FROM raw_meta').get().n,
    rawFts: db.prepare('SELECT count(*) AS n FROM raw_fts').get().n,
    rawVectors: db.prepare('SELECT count(*) AS n FROM raw_vectors').get().n,
  }
}

test('schema v4 fixture migrates atomically to v5 and preserves synthetic data', () => {
  const fixture = makeSchema4Fixture()
  try {
    const before = new DatabaseSync(fixture.file, { readOnly: true })
    assert.equal(before.prepare("SELECT v FROM meta WHERE k='schema_version'").get().v, '4')
    assert.deepEqual(counts(before), {
      memories: 1, ftsBigram: 1, ftsTrigram: 1, vectors: 1, entities: 1,
      memoryEntities: 1, relations: 1, revisions: 1, rawMeta: 4, rawFts: 1, rawVectors: 1,
    })
    assert.equal(before.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    before.close()

    const { db } = openDb(fixture.dir)
    assert.equal(db.prepare("SELECT v FROM meta WHERE k='schema_version'").get().v, String(SCHEMA_VERSION))
    assert.equal(SCHEMA_VERSION, 5)
    assert.equal(tableExists(db, 'episode_rewrite_snapshots'), true)
    assert.equal(indexExists(db, 'idx_ers_memory'), true)
    assert.deepEqual(counts(db), {
      memories: 1, ftsBigram: 1, ftsTrigram: 1, vectors: 1, entities: 1,
      memoryEntities: 1, relations: 1, revisions: 1, rawMeta: 4, rawFts: 1, rawVectors: 1,
    })
    assert.deepEqual(db.prepare('SELECT id FROM memories ORDER BY id').all().map((r) => r.id), [41])
    assert.deepEqual(db.prepare('SELECT id FROM raw_meta ORDER BY id').all().map((r) => r.id), [1, 2, 3, 4])
    assert.equal(db.prepare('SELECT tombstone FROM raw_meta WHERE id=4').get().tombstone, 1)
    assert.equal(db.prepare('SELECT count(*) AS n FROM episode_rewrite_snapshots').get().n, 0)
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    db.close()
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true })
  }
})

test('schema v4 migration failure rolls back DDL and never marks version 5', () => {
  const fixture = makeSchema4Fixture()
  try {
    const inject = new DatabaseSync(fixture.file)
    inject.exec(`CREATE TRIGGER fail_schema_version_update
      BEFORE UPDATE ON meta WHEN OLD.k='schema_version'
      BEGIN SELECT RAISE(ABORT, 'injected schema-version write failure'); END`)
    inject.close()

    assert.throws(() => openDb(fixture.dir), /injected schema-version write failure/)

    const after = new DatabaseSync(fixture.file, { readOnly: true })
    assert.equal(after.prepare("SELECT v FROM meta WHERE k='schema_version'").get().v, '4')
    assert.equal(tableExists(after, 'episode_rewrite_snapshots'), false)
    assert.equal(indexExists(after, 'idx_ers_memory'), false)
    assert.equal(indexExists(after, 'idx_mem_scope_key'), false)
    assert.equal(indexExists(after, 'idx_mem_valid'), false)
    assert.deepEqual(counts(after), {
      memories: 1, ftsBigram: 1, ftsTrigram: 1, vectors: 1, entities: 1,
      memoryEntities: 1, relations: 1, revisions: 1, rawMeta: 4, rawFts: 1, rawVectors: 1,
    })
    assert.deepEqual(after.prepare('SELECT id FROM memories ORDER BY id').all().map((r) => r.id), [41])
    assert.equal(after.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    after.close()
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true })
  }
})
