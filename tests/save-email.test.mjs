/**
 * saveEmail：邮件进记忆（2026-11-07）
 * - 原话档案独立房间 /sdcard/DSHA/渠道/email，role=user/channel=email/speaker=from
 * - memories episode owner scope，source_channel=email、source_msg_id=messageId
 * - messageId 去重；失败不抛
 */
import assert from 'node:assert'
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

process.env.DY_MEMORY_DIR = '/tmp/dy-save-email-' + process.pid
const DIR = process.env.DY_MEMORY_DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const OWNER_QQ = '1000000001'
const ownerDir = `/root/qq-agent/QQ会话/私聊_${OWNER_QQ}`

const { openDb } = await import('../lib/store/db.js')
const { dayOf } = await import('../lib/adapter/timefmt.js')
const { db } = openDb(DIR)

const registered = {}
const services = new Map()
const ctx = {
  get(n) {
    if (n === 'tools') return { register: (d) => { registered[d.name] = d } }
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
const svc = services.get('dyMemory')
assert.ok(svc && typeof svc.saveEmail === 'function', 'dyMemory.saveEmail 必须公开')

const header = { cwd: ownerDir, id: 'sess-email' }
const out = { ok: true, test: 'save-email' }
const at = 1794000000000
const messageId = 'email-test-message-1'

// 1) 主人会话写入
{
  const r = await svc.saveEmail({
    from: 'yangen2001@qq.com', to: '1000000001@qq.com',
    subject: '测试主题', text: '第一行\n第二行', at, messageId,
  }, { header })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.archived, true, '原话档案应写入')
  assert.ok(Number.isInteger(r.id))

  const m = db.prepare('SELECT * FROM memories WHERE id=?').get(r.id)
  assert.equal(m.kind, 'episode')
  assert.equal(m.layer, 'auto')
  assert.equal(m.scope_type, 'owner')
  assert.equal(m.scope_id, '')
  assert.equal(m.source_msg_id, messageId)
  assert.equal(m.source_channel, 'email', 'source_channel=email')
  assert.equal(m.privacy, 'owner')
  assert.ok(m.text.startsWith('[邮件] 主题：测试主题 正文：'))
  assert.ok(m.text.length <= 800)

  const raw = db.prepare("SELECT * FROM raw_meta WHERE channel='email' AND json_extract(extra,'$.messageId')=?").get(messageId)
  assert.ok(raw, '原话档案应有 email 行')
  assert.equal(raw.cwd, '/sdcard/DSHA/渠道/email')
  assert.equal(raw.role, 'user')
  assert.equal(raw.speaker, 'yangen2001@qq.com')
  assert.ok(String(raw.raw_text).includes('测试主题'))
  const fts = db.prepare('SELECT count(*) c FROM raw_fts WHERE rowid=?').get(raw.id)
  assert.equal(fts.c, 1, 'raw_fts 应可检索')
  const md = join(DIR, 'raw', dayOf(at), 's-email.md')
  assert.equal(existsSync(md), true, 'md 档案应存在')
  assert.match(readFileSync(md, 'utf8'), /测试主题/)
  out.insert = { id: r.id, rawId: raw.id }
}

// 2) messageId 去重
{
  const before = db.prepare('SELECT count(*) c FROM memories').get().c
  const r = await svc.saveEmail({ from: 'yangen2001@qq.com', subject: '重复', text: '重复正文', at, messageId }, { header })
  assert.equal(r.ok, true)
  assert.equal(r.duplicate, true)
  assert.equal(r.archived, false)
  assert.equal(db.prepare('SELECT count(*) c FROM memories').get().c, before, '重复 messageId 不新增记忆')
  const rawN = db.prepare("SELECT count(*) c FROM raw_meta WHERE json_extract(extra,'$.messageId')=?").get(messageId).c
  assert.equal(rawN, 1, '重复 messageId 不重复写原话')
  out.duplicate = 'ok'
}

// 3) 白名单插件身份可写
{
  const r = await svc.saveEmail({ from: 'x@example.com', subject: '插件', text: '插件正文', at, messageId: 'email-test-message-2' }, { header: { origin: 'plugin', plugin: 'dsh-autonomy' } })
  assert.equal(r.ok, true)
  assert.equal(r.archived, true)
  out.plugin = 'ok'
}

// 4) 失败不抛：无 header / 空正文 / 非白名单插件
{
  const a = await svc.saveEmail({ from: 'a@x', text: 'x' }, {})
  assert.equal(a.ok, false)
  assert.equal(a.error, 'E_PERMISSION')
  const b = await svc.saveEmail({ from: 'a@x', text: '' }, { header })
  assert.equal(b.ok, false)
  assert.equal(b.error, 'E_INVALID_ARG')
  const c = await svc.saveEmail({ from: 'a@x', text: 'x' }, { header: { origin: 'plugin', plugin: 'other-plugin' } })
  assert.equal(c.ok, false)
  assert.equal(c.error, 'E_PERMISSION')
  out.failClosed = 'ok'
}

console.log(JSON.stringify(out))
process.exit(0)
