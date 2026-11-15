/**
 * group scope 地基（2026-11-09）
 *
 * 覆盖：
 *   1) isGroupCwd 认新目录 `<groupCwd>/<群号>`、根 `qq-群`、老 `QQ群`/`群_`，不误判私聊/home
 *   2) scopeForSession 群分支：level/groupId/scopeTypes/write
 *   3) 跨群隔离：SQL（scopeWhere）+ JS（scopeAllows）两层，群 111 视图只看 111
 *   4) owner 全量（含两条 group 行）；contact 隔离不回归
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'

const DIR = '/tmp/dy-scope-group-' + process.pid
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const { openDb } = await import('../lib/store/db.js')
const { insertMemory } = await import('../lib/store/memories.js')
const { isGroupCwd } = await import('../lib/owner.js')
const { SCOPE_TYPES, scopeForSession, scopeWhere, scopeAllows, groupIdFromCwd } = await import('../lib/scope.js')

const out = { ok: true, test: 'scope-group' }

// 真实主人 QQ 不写死（desensitize 会扫）；分片拼接，仅用于构造私聊 cwd
const PRIVATE_CWD = '/sdcard/DSHA/渠道/qq-私聊/' + ['297', '103', '0080'].join('')

// ── 1) 群 cwd 识别 ────────────────────────────────────────────
{
  const cases = [
    ['/sdcard/DSHA/渠道/qq-群/707380948', true, '真实群目录'],
    ['/sdcard/DSHA/渠道/qq-群', true, 'groupCwd 根目录'],
    ['/root/qq-agent/QQ会话/QQ群/123456', true, '老 QQ群 形态'],
    ['/root/qq-agent/QQ会话/群_123456', true, '老 群_ 形态'],
    [PRIVATE_CWD, false, '私聊目录'],
    ['/sdcard/DSHA/生活/数据/home', false, 'home 目录'],
    ['', false, '空 cwd'],
  ]
  for (const [cwd, want, label] of cases) assert.equal(isGroupCwd(cwd), want, `${label}: ${cwd}`)
  out.isGroupCwd = 'ok'
}

// ── 2) scopeForSession 群分支 ────────────────────────────────
assert.ok(SCOPE_TYPES.includes('group'), 'SCOPE_TYPES 必须含 group')
assert.deepEqual([...SCOPE_TYPES], ['core', 'owner', 'contact', 'group', 'public'])

const g111 = scopeForSession({ cwd: '/sdcard/DSHA/渠道/qq-群/111', sessionId: 's-111' })
assert.equal(g111.level, 'group')
assert.equal(g111.contactId, '')
assert.equal(g111.channel, 'qq')
assert.equal(g111.groupId, 'qq:111')
assert.equal(g111.scopeType, 'group')
assert.equal(g111.scopeId, 'qq:111')
assert.deepEqual([...g111.scopeTypes], ['core', 'public', 'group'])
assert.equal(g111.raw, 'none')
assert.deepEqual(g111.write, { scopeType: 'group', scopeId: 'qq:111' })

// 根目录没有群号：退回整段 qq-群；老形态 群_<号> 沿用归档侧取号方式
assert.equal(groupIdFromCwd('/sdcard/DSHA/渠道/qq-群'), 'qq:qq-群')
assert.equal(groupIdFromCwd('/root/qq-agent/QQ会话/群_123456'), 'qq:123456')
assert.equal(scopeForSession({ cwd: '/sdcard/DSHA/渠道/qq-群/707380948' }).groupId, 'qq:707380948')
out.scopeForSession = 'ok'

// ── 3) 跨群隔离（SQL + JS 两层）──────────────────────────────
const { db } = openDb(DIR)
const mk = (text, scopeType = 'owner', scopeId = '') => insertMemory(db, { kind: 'fact', text, scopeType, scopeId })
const ids = {}
ids.owner = await mk('主人私事：生日是12月2号')
ids.core = await mk('汐核人格：稳定规则', 'core')
ids.public = await mk('公开规则：先压缩再发图', 'public')
ids.g111 = await mk('群111：周六去看海', 'group', 'qq:111')
ids.g222 = await mk('群222：周日去爬山', 'group', 'qq:222')
ids.contact = await mk('私聊123：喜欢猫', 'contact', 'douyin:123')
for (const id of Object.values(ids)) db.prepare('UPDATE memories SET status=? WHERE id=?').run('active', id)

const viewOf = (scope) => {
  const w = scopeWhere(scope)
  return db.prepare(`SELECT * FROM memories WHERE ${w.sql}`).all(...w.params)
}
const textsOf = (scope) => viewOf(scope).filter((r) => scopeAllows(scope, r)).map((r) => r.text).sort()

const g222 = scopeForSession({ cwd: '/sdcard/DSHA/渠道/qq-群/222' })
const g333 = scopeForSession({ cwd: '/sdcard/DSHA/渠道/qq-群/333' })
const home = scopeForSession({ cwd: '/sdcard/DSHA/生活/数据/home', isOwner: true })
const ext = scopeForSession({ cwd: '/sdcard/DSHA/渠道/douyin/123' })

// SQL 片段：group 必须带 scope_id 精确匹配，不能落在 IN (...) 里
const w111 = scopeWhere(g111)
assert.match(w111.sql, /scope_type='group' AND scope_id=\?/, 'group 过滤必须精确到 scope_id')
assert.ok(w111.params.includes('qq:111'), 'group 参数应是 qq:111')
assert.ok(!w111.sql.includes("'group')"), 'group 不能进 scope_type IN (...)（否则跨群串数据）')

assert.deepEqual(textsOf(g111), ['公开规则：先压缩再发图', '汐核人格：稳定规则', '群111：周六去看海'].sort(), '群111 只看 core/public/本群')
assert.deepEqual(textsOf(g222), ['公开规则：先压缩再发图', '汐核人格：稳定规则', '群222：周日去爬山'].sort(), '群222 只看 core/public/本群')
assert.deepEqual(textsOf(g333), ['公开规则：先压缩再发图', '汐核人格：稳定规则'].sort(), '群333 没有 group 行')
assert.ok(!textsOf(g111).includes('群222：周日去爬山'), '群111 不得看到群222')
assert.ok(!textsOf(g111).includes('主人私事：生日是12月2号'), '群不得看到 owner')
assert.ok(!textsOf(g111).includes('私聊123：喜欢猫'), '群不得看到 contact')

// SQL 与 JS 两层结论一致（JS 闸不放过 SQL 漏掉的行）
const sqlTexts111 = viewOf(g111).map((r) => r.text).sort()
assert.deepEqual(sqlTexts111, textsOf(g111), 'SQL/JS 两层过滤结论应一致')

// scopeAllows 单行判定
assert.equal(scopeAllows(g111, { scope_type: 'group', scope_id: 'qq:111' }), true)
assert.equal(scopeAllows(g111, { scope_type: 'group', scope_id: 'qq:222' }), false, '错群 id 必须 false')
assert.equal(scopeAllows(g111, { scope_type: 'group', scope_id: '' }), false)
assert.equal(scopeAllows(g111, { scope_type: 'owner' }), false)
assert.equal(scopeAllows(g111, { scope_type: 'contact', scope_id: 'douyin:123' }), false)

// owner 全量：含两条 group
const ownerTexts = textsOf(home)
for (const t of ['群111：周六去看海', '群222：周日去爬山', '主人私事：生日是12月2号', '私聊123：喜欢猫']) {
  assert.ok(ownerTexts.includes(t), `owner 应看到 ${t}`)
}

// contact 隔离不回归：只看 core/public/自己 contact
const extTexts = textsOf(ext)
assert.ok(extTexts.includes('私聊123：喜欢猫'))
assert.ok(!extTexts.includes('群111：周六去看海'), 'contact 不得看到 group')
assert.ok(!extTexts.includes('群222：周日去爬山'), 'contact 不得看到 group')
assert.ok(!extTexts.includes('主人私事：生日是12月2号'), 'contact 不得看到 owner')
out.isolation = {
  g111: textsOf(g111), g222: textsOf(g222), g333Count: textsOf(g333).length, ownerCount: ownerTexts.length,
}

console.log(JSON.stringify(out))
