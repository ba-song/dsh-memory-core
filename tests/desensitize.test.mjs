/**
 * D1 脱敏回归（阶段 2.5a）
 *
 * 1. 源码/脚本/测试/README/package.json 里不含真实主人 QQ 号（分片拼接，避免测试自己写死）
 * 2. resolveOwner：ownerPrivateDir 解析、ownerQQ 拼目录、两者都缺 → ok:false
 * 3. 主人身份缺失时插件**不崩**：不注入、不写主人记忆，工具明确拒绝
 */
import assert from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'

process.env.DY_MEMORY_DIR = '/tmp/dy-desens-' + process.pid
rmSync(process.env.DY_MEMORY_DIR, { recursive: true, force: true })

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
// 真实号只以分片形式存在于测试内，避免测试文件本身成为泄露源
const NEEDLE = ['297', '103', '0080'].join('')
const SKIP_DIRS = new Set(['node_modules', 'ort', 'logs', 'raw', '.git'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(mjs|js|json|md|yml|py)$/.test(name) || /\.bak\.\d+$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(ROOT)
assert.ok(files.length > 20, `扫描文件太少，可能路径不对：${files.length}`)
const hits = files.filter((f) => readFileSync(f, 'utf8').includes(NEEDLE))
assert.deepEqual(hits.map((f) => f.replace(ROOT + '/', '')), [], '源码/脚本/测试/README 不得包含真实主人 QQ 号')

// 扫描器自检：能发现拼接后的真实号
const probe = `x${['297', '103', '0080'].join('')}y`
assert.ok(probe.includes(NEEDLE), '扫描器自检失败：拼接后应能被检测到')

// ── resolveOwner ────────────────────────────────────────────────
const { resolveOwner, DEFAULTS } = await import('../lib/config.js')
const a = resolveOwner({ chatlogDir: DEFAULTS.chatlogDir, ownerPrivateDir: '/root/qq-agent/QQ会话/私聊_1000000001' })
assert.equal(a.ok, true)
assert.equal(a.ownerQQ, '1000000001', '应从私聊目录解析出 QQ')
assert.equal(a.ownerPrivateDir, '/root/qq-agent/QQ会话/私聊_1000000001')

const b = resolveOwner({ chatlogDir: DEFAULTS.chatlogDir, ownerQQ: '1000000001' })
assert.equal(b.ok, true)
assert.equal(b.ownerPrivateDir, '/root/qq-agent/QQ会话/私聊_1000000001', '应由 QQ 拼出私聊目录')

const c = resolveOwner({ chatlogDir: DEFAULTS.chatlogDir })
assert.equal(c.ok, false, '两者都没有时应 ok:false')

// ownerPrivateDir 优先于 ownerQQ
const d = resolveOwner({ chatlogDir: DEFAULTS.chatlogDir, ownerQQ: '1999999999', ownerPrivateDir: '/root/qq-agent/QQ会话/私聊_1000000001' })
assert.equal(d.ownerQQ, '1000000001', '目录优先：目录里的号覆盖 ownerQQ')

// ── 缺配置时插件不崩、不注入、不写 ──────────────────────────────
const handlers = {}
const registered = {}
const ctx = {
  get(n) {
    if (n === 'tools') return { register: (def) => { registered[def.name] = def } }
    if (n === 'systemPrompt') return { context: () => () => {} }
    if (n === 'agents') return { list: () => [] }
    return undefined
  },
  provide() { return () => {} },
  on(evt, fn) { handlers[evt] = fn },
  logger: { info() {}, warn() {} },
}

const mod = await import('../lib/index.js')
mod.apply(ctx, {}) // 故意不配 owner

const fakeOwnerDir = '/root/qq-agent/QQ会话/私聊_1000000001'
assert.ok(registered.dy_memory_add, '工具仍应注册，插件不能因缺配置挂掉')

const exec = { agent: { session: { header: { cwd: fakeOwnerDir, id: 's1' } } } }
const addRes = await registered.dy_memory_add.execute({ text: '缺配置时不该写' }, exec)
assert.equal(JSON.parse(addRes.detail).ok, false, '缺配置时写记忆必须拒绝')

// 即使 cwd 看起来像主人私聊，也不能注入（OWNER_DIR 为空）
const agent = { session: { header: { cwd: fakeOwnerDir, id: 's1' } } }
const messages = [{ source: { kind: 'user' }, content: [{ type: 'text', text: '我喜欢看海' }] }]
const decision = await handlers['agent/pre-step']({ agent, messages, step: 1, turn: 1 }, async () => ({ kind: 'enter', messages }))
assert.equal(decision.messages.length, 1, '缺配置时不得注入任何块')

console.log(JSON.stringify({
  ok: true,
  test: 'desensitize',
  scanned: files.length,
  ownerParsedFromDir: a.ownerQQ,
  ownerMissing: c.ok,
  wrote: JSON.parse(addRes.detail).ok,
  injected: decision.messages.length - 1,
}))
process.exit(0)
