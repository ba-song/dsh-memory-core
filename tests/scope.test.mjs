/**
 * P0 scope 地基（2026-11-06）
 * 覆盖：scopeForSession 四档 / SQL 过滤放检索前 / external 只 public+自己 contact /
 *       group 只 core+public / 语义向量只对允许 id 算 / 便签+事实卡 scope / 写入 scope。
 */
import assert from 'node:assert'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '/tmp/dy-scope-' + process.pid
const ROOM = join(DIR, 'room')
rmSync(DIR, { recursive: true, force: true })
mkdirSync(ROOM, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory, saveVector, loadVectors } = await import('../lib/store/memories.js')
const { recall } = await import('../lib/recall/recall.js')
const { scopeForSession, scopeWhere, scopeAllows, rawAllowsCwd } = await import('../lib/scope.js')
const { pickRemembered } = await import('../lib/inject/remembered.js')
const { buildStable } = await import('../lib/inject/stable.js')
const { ingestWithLlmFallback } = await import('../lib/extract/pipeline.js')
const { loadEmbed, embedTexts, embedAvailable } = await import('../lib/embed/onnx.mjs')

const { db } = openDb(DIR)
const out = { ok: true, test: 'scope' }

// 1) 四档映射
const home = scopeForSession({ cwd: '/sdcard/DSHA/生活/数据/home', sessionId: 's-home', isOwner: true })
const ext = scopeForSession({ cwd: '/sdcard/DSHA/渠道/douyin/123', sessionId: 's-ext', isOwner: false })
const grp = scopeForSession({ cwd: '/root/qq-agent/QQ会话/群_123456', sessionId: 's-grp', isOwner: false })
const unk = scopeForSession({ cwd: '/sdcard/DSHA/工作区', sessionId: 's-unk', isOwner: false })
assert.equal(home.level, 'owner'); assert.equal(home.raw, 'all'); assert.deepEqual(home.scopeTypes, ['core', 'owner', 'contact', 'group', 'public'])
assert.equal(ext.level, 'external'); assert.equal(ext.contactId, 'douyin:123'); assert.equal(ext.raw, 'own')
assert.equal(grp.level, 'group'); assert.deepEqual(grp.scopeTypes, ['core', 'public', 'group']); assert.equal(grp.raw, 'none'); assert.equal(grp.groupId, 'qq:123456')
assert.equal(unk.level, 'unknown'); assert.deepEqual(unk.scopeTypes, ['core', 'public']); assert.equal(unk.raw, 'none')
assert.equal(scopeAllows(ext, { scope_type: 'contact', scope_id: 'douyin:123' }), true)
assert.equal(scopeAllows(ext, { scope_type: 'contact', scope_id: 'douyin:456' }), false)
assert.equal(scopeAllows(ext, { scope_type: 'owner' }), false)
assert.equal(scopeAllows(ext, { scope_type: 'public' }), true)
assert.equal(scopeAllows(grp, { scope_type: 'owner' }), false)
assert.equal(rawAllowsCwd(ext, '/sdcard/DSHA/渠道/douyin/123'), true)
assert.equal(rawAllowsCwd(ext, '/sdcard/DSHA/渠道/douyin/456'), false)
assert.equal(rawAllowsCwd(grp, '/root/qq-agent/QQ会话/群_1'), false)
assert.match(scopeWhere(ext).sql, /scope_type='contact' AND scope_id=\?/)
out.mapping = 'ok'

// 2) 写入默认 owner；显式 contact 会落 scope
const ids = {}
ids.owner = await insertMemory(db, { kind: 'fact', text: '鲸落私藏：主人的生日' })
ids.public = await insertMemory(db, { kind: 'fact', text: '海王公开：规则事实', scopeType: 'public' })
ids.contact = await insertMemory(db, { kind: 'fact', text: '本会独有：只给123', scopeType: 'contact', scopeId: 'douyin:123' })
ids.other = await insertMemory(db, { kind: 'fact', text: '别人专属：只给456', scopeType: 'contact', scopeId: 'douyin:456' })
ids.core = await insertMemory(db, { kind: 'fact', text: '汐核人格：稳定规则', scopeType: 'core' })
for (const id of Object.values(ids)) db.prepare('UPDATE memories SET status=? WHERE id=?').run('active', id)
const row = (id) => db.prepare('SELECT scope_type,scope_id FROM memories WHERE id=?').get(id)
assert.deepEqual(row(ids.owner), { scope_type: 'owner', scope_id: '' })
assert.deepEqual(row(ids.contact), { scope_type: 'contact', scope_id: 'douyin:123' })
out.insert = 'ok'

// 3) 检索：SQL scope 过滤（无 embedding 时走关键词臂）
const recallOne = (q, scope) => recall(db, q, { vectors: null, gate: { semantic: 0.55, keyword: 0.1 }, limit: 10, scope })
assert.deepEqual((await recallOne('本会独有', ext)).map((r) => r.id), [ids.contact])
assert.deepEqual((await recallOne('海王公开', ext)).map((r) => r.id), [ids.public])
assert.deepEqual((await recallOne('汐核人格', ext)).map((r) => r.id), [ids.core])
assert.deepEqual((await recallOne('鲸落私藏', ext)).map((r) => r.id), [], 'external 不命中 owner')
assert.deepEqual((await recallOne('别人专属', ext)).map((r) => r.id), [], 'external 不命中别人的 contact')
assert.deepEqual((await recallOne('海王公开', grp)).map((r) => r.id), [ids.public])
assert.deepEqual((await recallOne('汐核人格', grp)).map((r) => r.id), [ids.core])
assert.deepEqual((await recallOne('本会独有', grp)).map((r) => r.id), [], 'group 不命中 contact')
for (const q of ['鲸落私藏', '海王公开', '本会独有', '别人专属', '汐核人格']) {
  assert.equal((await recallOne(q, home)).length, 1, `owner 应看到 ${q}`)
}
out.recall = 'ok'

if (existsSync('/opt/qqai/models/bge-small-zh/tokenizer.json')) {
// 4) 语义臂：只对 scope 内 id 算 cosine（owner 高相似也不给 external）
{
  await loadEmbed('/opt/qqai/models/bge-small-zh')
  assert.equal(embedAvailable(), true, 'embedding 应可用')
  const ownerText = '主人的生日是12月2号'
  const pubText = '发图前先把图片压缩成 JPG'
  const [ov, pv, qv] = [await embedTexts([ownerText]), await embedTexts([pubText]), await embedTexts(['生日是几号'], { query: true })]
  const oid = await insertMemory(db, { kind: 'fact', text: ownerText })
  const pid = await insertMemory(db, { kind: 'fact', text: pubText, scopeType: 'public' })
  await saveVector(db, oid, ov[0]); await saveVector(db, pid, pv[0])
  const vectors = loadVectors(db)
  const scoped = await recall(db, '生日是几号', { vectors, gate: { semantic: 0.35, keyword: 0.35 }, scope: ext })
  assert.ok(!scoped.some((r) => r.id === oid), 'external 语义检索不得命中 owner（过滤在 cosine 前）')
  const all = await recall(db, '生日是几号', { vectors, gate: { semantic: 0.35, keyword: 0.35 } })
  assert.ok(all.some((r) => r.id === oid), '对照组：无 scope 时 owner 应命中')
  out.semantic = { scoped: scoped.map((r) => r.id), all: all.map((r) => r.id) }
}

} else {
  out.semantic = 'skipped-no-model'
}
// 5) 便签/事实卡按 scope 过滤
{
  await insertMemory(db, { kind: 'relation', text: '主人喜欢喝冰美式' })
  await insertMemory(db, { kind: 'relation', text: '汐喜欢看海', scopeType: 'public' })
  await insertMemory(db, { kind: 'relation', text: '123 喜欢猫', scopeType: 'contact', scopeId: 'douyin:123' })
  const notesExt = pickRemembered(db, { scope: ext }).block
  assert.ok(notesExt.includes('汐喜欢看海')); assert.ok(notesExt.includes('123 喜欢猫'))
  assert.ok(!notesExt.includes('主人喜欢喝冰美式'), 'external 便签不含 owner')
  assert.ok(!pickRemembered(db, { scope: grp }).block.includes('123 喜欢猫'), 'group 便签不含 contact')
  assert.ok(pickRemembered(db, { scope: home }).block.includes('主人喜欢喝冰美式'))

  const card = join(DIR, '事实卡.md')
  writeFileSync(card, '# 事实卡\n## 全局\n- 全局规则\n## 主人\n- 主人隐私\n## 群\n- 群规则\n## 人\n- 某人\n')
  const extBlock = buildStable(ROOM, { factsPath: card, scope: ext })
  assert.ok(extBlock.includes('全局规则')); assert.ok(!extBlock.includes('主人隐私')); assert.ok(!extBlock.includes('群规则'))
  const grpBlock = buildStable(ROOM, { factsPath: card, scope: grp })
  assert.ok(grpBlock.includes('群规则')); assert.ok(!grpBlock.includes('主人隐私'))
  const homeBlock = buildStable(ROOM, { factsPath: card, scope: home })
  assert.ok(homeBlock.includes('主人隐私'))
  out.inject = 'ok'
}

// 6) 写路径沿用 scope（外部会话 → contact:该联系人）
{
  const r = await ingestWithLlmFallback(db, {
    ctx: null,
    text: '主人喜欢吃海鲜大餐',
    sourceKey: 'scope:write',
    speaker: '1000000001',
    vectors: new Map(),
    autoExtract: { enabled: true, minChars: 8, requireSubject: true, maxPerTurn: 1 },
    writeScope: ext.write,
  })
  assert.equal(r.action, 'insert')
  const w = db.prepare('SELECT scope_type,scope_id FROM memories WHERE id=?').get(r.id)
  assert.deepEqual(w, { scope_type: 'contact', scope_id: 'douyin:123' })
  out.writeScope = 'ok'
}

console.log(JSON.stringify(out))
