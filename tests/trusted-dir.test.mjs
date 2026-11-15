/**
 * 受信任目录（trustedDirs）单元测试 —— 2026-11-05
 *
 * 覆盖：
 *   ① 命中 trustedDirs → isOwner=true / via='trusted-dir'
 *   ② 未配置 → 与改动前完全一致（回归：home 仍非主人；ownerDir fallback 仍生效；binding 仍优先）
 *   ③ binding 明确绑给别人 + 目录在 trustedDirs → 仍拒绝（隐私优先）
 * 另有边界：前缀按目录边界（home2 不命中 home）、尾斜杠归一、单字符串容忍、群优先、空 cwd。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

process.env.DY_MEMORY_DIR = '/tmp/dy-trusted-unit-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })
mkdirSync(process.env.DY_MEMORY_DIR, { recursive: true })

const { classifyOwner, normalizeTrustedDirs, isTrustedDir } = await import('../lib/owner.js')
const { ensureContactsSchema, seedOwner, addContact, bindContact } = await import('../lib/store/contacts.js')

const dir = process.env.DY_MEMORY_DIR
const db = new DatabaseSync(join(dir, 'memory.db'))
db.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)')
ensureContactsSchema(db)
seedOwner(db, { ownerQQ: '1000000001' })
addContact(db, { id: 'contact:friend', displayName: '朋友', kind: 'friend' })
bindContact(db, { contactId: 'contact:friend', channel: 'qq', externalId: '1658735796' })

const OWNER_DIR = '/root/qq-agent/QQ会话/私聊_1000000001'
const FRIEND_DIR = '/root/qq-agent/QQ会话/私聊_1658735796'
const HOME = '/sdcard/DSHA/生活/数据/home'
const GROUP = '/root/qq-agent/QQ会话/群_707380948'
const owner = { ok: true, ownerQQ: '1000000001', ownerPrivateDir: OWNER_DIR }
const log = { info() {}, warn() {} }
const call = (cwd, extra = {}) => classifyOwner(cwd, { db, owner, log, now: () => 1793900000000, ...extra })

const out = { ok: true, test: 'trusted-dir' }

// ── ② 未配置（回归）：行为与改动前一致 ─────────────────────────────
assert.equal(call(HOME).isOwner, false, '未配置 trustedDirs 时 home 必须仍判非主人')
assert.equal(call(HOME).reason, 'no-external-id')
assert.equal(call(OWNER_DIR).isOwner, true, 'owner 私聊仍按 binding 认主人')
assert.equal(call(OWNER_DIR).via, 'binding')
const unboundOwner = { ok: true, ownerQQ: '1000000002', ownerPrivateDir: '/root/qq-agent/QQ会话/私聊_1000000002' }
const fb = classifyOwner(unboundOwner.ownerPrivateDir, { db, owner: unboundOwner, log, now: () => 1793900000000 })
assert.equal(fb.isOwner, true, 'ownerPrivateDir fallback 不受影响')
assert.equal(fb.via, 'fallback')
assert.equal(call(FRIEND_DIR).isOwner, false, '绑给别人的私聊仍非主人')
assert.equal(call(FRIEND_DIR).reason, 'bound-to-other')
assert.deepEqual(normalizeTrustedDirs(undefined), [], '缺省即空')
out.regression = 'ok'

// ── ① 命中 trustedDirs ────────────────────────────────────────────
const hit = call(HOME, { trustedDirs: [HOME] })
assert.equal(hit.isOwner, true)
assert.equal(hit.via, 'trusted-dir')
assert.equal(hit.reason, 'trusted-dir')
assert.equal(hit.contactId, 'contact:owner')
assert.equal(call(HOME + '/sub', { trustedDirs: [HOME] }).isOwner, true, '子目录也算（前缀）')
assert.equal(call(HOME, { trustedDirs: ['/sdcard/DSHA/生活/数据/home/'] }).isOwner, true, '尾斜杠归一')
assert.equal(call(HOME, { trustedDirs: HOME }).isOwner, true, '只配一个字符串也容忍')
out.hit = 'ok'

// ── 边界：按目录边界，不许误伤邻居 ────────────────────────────────
assert.equal(call(HOME + '2', { trustedDirs: [HOME] }).isOwner, false, 'home2 不能被 home 前缀命中')
assert.equal(isTrustedDir('/x/home2', ['/x/home']), false)
assert.equal(isTrustedDir('/x/home', ['/x/home']), true)
assert.equal(isTrustedDir('', ['/x/home']), false)
assert.equal(call('', { trustedDirs: [HOME] }).reason, 'no-cwd')
out.boundary = 'ok'

// ── ③ 隐私优先：绑给别人的目录即使配进 trustedDirs 也拒绝 ─────────
const friendTrusted = call(FRIEND_DIR, { trustedDirs: [FRIEND_DIR] })
assert.equal(friendTrusted.isOwner, false, 'binding 绑给别人优先于 trustedDirs')
assert.equal(friendTrusted.reason, 'bound-to-other')
assert.equal(friendTrusted.contactId, 'contact:friend')
out.privacy = 'ok'

// ── 群优先：群里永远不是主人，即使目录被误配 ──────────────────────
assert.equal(call(GROUP, { trustedDirs: [GROUP] }).isOwner, false)
assert.equal(call(GROUP, { trustedDirs: ['/root/qq-agent/QQ会话'] }).reason, 'group')
out.group = 'ok'

// ── trusted 命中不写 owner_fallback 统计（不是 fallback） ──────────
const fbBefore = Number(db.prepare("SELECT v FROM meta WHERE k='owner_fallback_count'").get()?.v ?? 0)
call(HOME, { trustedDirs: [HOME], track: true })
const fbAfter = Number(db.prepare("SELECT v FROM meta WHERE k='owner_fallback_count'").get()?.v ?? 0)
assert.equal(fbAfter, fbBefore, 'trusted-dir 不应计入 fallback 统计')
out.noFallbackNoise = 'ok'

console.log(JSON.stringify(out))
db.close()
