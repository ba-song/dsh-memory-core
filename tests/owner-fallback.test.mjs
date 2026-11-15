/**
 * owner fallback（阶段 4，P1 §6.5）
 * - 目标态：只认 contact_bindings
 * - binding 未命中且 cwd 命中 ownerPrivateDir → 临时 fallback + 告警（10 分钟节流）
 * - binding 命中但属于别人 → 不是主人，且不走 fallback
 * - 7 天无 fallback → 可退出该分支
 */
import assert from 'node:assert'
import { rmSync } from 'node:fs'

process.env.DY_MEMORY_DIR = '/tmp/dy-owner-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })

const { openDb } = await import('../lib/store/db.js')
const { classifyOwner, ownerFallbackStatus, shouldRetireFallback, parsePrivateExternalId, isGroupCwd } = await import('../lib/owner.js')
const { ensureContactsSchema, seedOwner, bindContact, addContact } = await import('../lib/store/contacts.js')

const OWNER_QQ = '1000000001'
const ownerDir = `/root/qq-agent/QQ会话/私聊_${OWNER_QQ}`
const otherDir = '/root/qq-agent/QQ会话/私聊_1000000002'
const groupDir = '/root/qq-agent/QQ会话/群_123456'
const owner = { ok: true, ownerQQ: OWNER_QQ, ownerPrivateDir: ownerDir }
const { db } = openDb(process.env.DY_MEMORY_DIR)
const warns = []
const log = { info() {}, warn: (m) => warns.push(m) }
const now = () => 1793500000000

assert.equal(parsePrivateExternalId(ownerDir), OWNER_QQ)
assert.equal(parsePrivateExternalId(groupDir), '')
assert.equal(isGroupCwd(groupDir), true)

// ── 1. 没有 contacts 表：owner 目录走 fallback ─────────────────
const f1 = classifyOwner(ownerDir, { db, owner, log, now })
assert.equal(f1.isOwner, true)
assert.equal(f1.via, 'fallback')
assert.equal(warns.length, 1, 'fallback 必须告警')

// 节流：同一时间窗再判一次，不重复告警
classifyOwner(ownerDir, { db, owner, log, now })
assert.equal(warns.length, 1, '告警 10 分钟节流')
const st = ownerFallbackStatus(db, { now })
assert.equal(st.count, 2, 'fallback 次数照常累计')
assert.equal(st.retireCandidate, false)

// 其他私聊/群聊：不是主人
assert.equal(classifyOwner(otherDir, { db, owner, log, now }).isOwner, false)
assert.equal(classifyOwner(groupDir, { db, owner, log, now }).isOwner, false)

// ── 2. binding 命中 owner：走 binding，不再 fallback ───────────
ensureContactsSchema(db)
seedOwner(db, { ownerQQ: OWNER_QQ, displayName: '主人' })
const countBefore = ownerFallbackStatus(db, { now }).count
const b1 = classifyOwner(ownerDir, { db, owner, log, now })
assert.equal(b1.isOwner, true)
assert.equal(b1.via, 'binding')
assert.equal(ownerFallbackStatus(db, { now }).count, countBefore, 'binding 命中不增加 fallback 计数')

// ── 3. binding 命中别人：不是主人，且不走 fallback ─────────────
addContact(db, { id: 'contact:x', displayName: '朋友甲' })
// 把 ownerDir 对应的号绑给 contact:x 会与 owner 冲突（唯一约束），这里用另一个号 + 把它伪装成 ownerDir
const otherQQ = '1000000003'
bindContact(db, { contactId: 'contact:x', channel: 'qq', externalId: otherQQ })
const fakeOwnerDir = `/root/qq-agent/QQ会话/私聊_${otherQQ}`
const b2 = classifyOwner(fakeOwnerDir, { db, owner: { ...owner, ownerPrivateDir: fakeOwnerDir }, log, now })
assert.equal(b2.isOwner, false, '明确绑给别人时不能当主人')
assert.equal(b2.reason, 'bound-to-other')
assert.equal(ownerFallbackStatus(db, { now }).count, countBefore, '这种情况下不得触发 fallback')

// 目录名像主人、但没绑定 → 不是主人（禁止靠目录/昵称长期判定）
const strangerDir = '/root/qq-agent/QQ会话/私聊_1000000009'
assert.equal(classifyOwner(strangerDir, { db, owner, log, now }).isOwner, false)

// ── 4. 7 天退出判据 ───────────────────────────────────────────
const day = 86400000
assert.equal(shouldRetireFallback(db, { now: () => now() + 1 * day }), false, '1 天内还不能退')
assert.equal(shouldRetireFallback(db, { now: () => now() + 8 * day }), true, '≥7 天无 fallback 后可退出')

// ── 5. 插件侧：fallback 可用；绑定后写记忆走 binding ──────────
const services = new Map()
const ctx = {
  get(n) {
    if (n === 'tools') return { register: () => {} }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    return services.get(n)
  },
  provide(n, v) { services.set(n, v); return () => services.delete(n) },
  on() {},
  logger: { info() {}, warn() {} },
}
const mod = await import('../lib/index.js')
mod.apply(ctx, { ownerQQ: OWNER_QQ })

// 用 service.recall 的 owner 判定验证：非 owner 只给 public
const svc = ctx.get('dyMemory')
const { insertMemory } = await import('../lib/store/memories.js')
await insertMemory(db, { kind: 'fact', text: '关于主人的私密事实', privacy: 'owner', importance: 0.9 })
await insertMemory(db, { kind: 'fact', text: '公开的规则事实', privacy: 'public', importance: 0.9 })

const asOwner = await svc.recall('事实', { header: { cwd: ownerDir, id: 's1' }, limit: 10 })
const asStranger = await svc.recall('事实', { header: { cwd: strangerDir, id: 's2' }, limit: 10 })
assert.ok(asOwner.length >= 1, '主人可看到 owner 记忆')
assert.ok(asStranger.every((h) => h.text.includes('公开')), '非主人只看到 public fact/skill')

console.log(JSON.stringify({
  ok: true, test: 'owner-fallback',
  fallbackVia: f1.via,
  warnThrottled: warns.length === 1,
  bindingVia: b1.via,
  boundToOther: b2.reason,
  retire1d: false, retire8d: true,
  ownerHits: asOwner.length, strangerHits: asStranger.length,
}))
process.exit(0)
