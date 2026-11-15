/**
 * 事实卡标准格式（2026-11-05）
 *
 * 格式（11-02《事实卡分节》）：
 *   # 事实卡
 *   ## 全局
 *   - 所有会话都能看到的
 *   ## 会话 私聊 主人(1000000001)
 *   - 只有这个 QQ 的会话能看到
 *
 * 本测试钉住：全局节可见、主人/他人节按 QQ 精确筛选、空卡不抛、含 {{ 的行被丢、扁平卡兼容。
 */
import assert from 'node:assert'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = '/tmp/dy-facts-format-' + process.pid
process.env.DY_MEMORY_DIR = DATA_DIR
rmSync(DATA_DIR, { recursive: true, force: true })
mkdirSync(DATA_DIR, { recursive: true })

const { buildStable, pickFacts } = await import('../lib/inject/stable.js')

const CARD = [
  '# 事实卡',
  '',
  '## 全局',
  '',
  '- 全局：她喜欢鲸鱼',
  '',
  '## 会话 私聊 主人(1000000001)',
  '',
  '- 主人节：主人怕辣',
  '',
  '## 会话 私聊 朋友(1999999999)',
  '',
  '- 别人的节：朋友欠钱',
  '',
].join('\n')
const cardPath = join(DATA_DIR, '事实卡.md')
writeFileSync(cardPath, CARD)
const out = { ok: true, test: 'facts-format' }

// ── 全局节必须可见（旧实现会丢） ────────────────────────────────
assert.deepEqual(pickFacts(CARD, { ownerQQ: '1000000001', isOwner: true }), ['- 全局：她喜欢鲸鱼', '- 主人节：主人怕辣'])
out.global = 'ok'

// ── 按 QQ 精确筛选：主人 / 别人 / 未知会话 ───────────────────────
assert.deepEqual(pickFacts(CARD, { ownerQQ: '1999999999', isOwner: true }), ['- 全局：她喜欢鲸鱼', '- 别人的节：朋友欠钱'])
assert.deepEqual(pickFacts(CARD, { ownerQQ: '', isOwner: true }), ['- 全局：她喜欢鲸鱼', '- 主人节：主人怕辣'], '可信会话但没配 ownerQQ → 全局 + 主人节')
assert.deepEqual(pickFacts(CARD, { ownerQQ: '1000000001', label: '朋友', isOwner: true }), ['- 全局：她喜欢鲸鱼', '- 主人节：主人怕辣', '- 别人的节：朋友欠钱'], 'label 命中另一节')
out.sections = 'ok'

// ── 空卡 / 只有标题 ─────────────────────────────────────────────
assert.deepEqual(pickFacts('# 事实卡\n', { ownerQQ: '1000000001', isOwner: true }), [])
assert.deepEqual(pickFacts('', { ownerQQ: '1000000001', isOwner: true }), [])
out.empty = 'ok'

// ── 空主人节：只拿全局，不许把节标题当内容 ───────────────────────
const emptyMaster = '# 事实卡\n\n## 全局\n- 只有全局\n\n## 会话 私聊 主人(1000000001)\n'
assert.deepEqual(pickFacts(emptyMaster, { ownerQQ: '1000000001', isOwner: true }), ['- 只有全局'])
out.emptySection = 'ok'

// ── 扁平卡（无 ##）：整张取（兼容旧卡） ─────────────────────────
const flat = '# 事实卡\n- 旧卡一行\n- 旧卡两行\n'
assert.deepEqual(pickFacts(flat, { ownerQQ: '1000000001', isOwner: true }), ['- 旧卡一行', '- 旧卡两行'])
out.flat = 'ok'

// ── P0：非主人会话（群/工作区）只拿全局，哪怕标题里有 ownerQQ/label ──
assert.deepEqual(pickFacts(CARD, { ownerQQ: '1000000001', label: '群_707380948' }), ['- 全局：她喜欢鲸鱼'], '群：isOwner 未传 → fail-closed，只给全局')
assert.deepEqual(pickFacts(CARD, { ownerQQ: '1000000001', label: '群_707380948', isOwner: false }), ['- 全局：她喜欢鲸鱼'], '群：显式非主人')
assert.deepEqual(pickFacts(CARD, { ownerQQ: '1000000001', isOwner: false }), ['- 全局：她喜欢鲸鱼'], '工作区：非主人')
assert.deepEqual(pickFacts(CARD, { ownerQQ: '1000000001', isOwner: true }), ['- 全局：她喜欢鲸鱼', '- 主人节：主人怕辣'], 'home/主人：全局+主人节')
out.p0Gating = 'ok'

// ── buildStable：标准卡 + factsPath；含 {{ 行被丢、不抛 ──────────
const card2 = CARD.replace('- 全局：她喜欢鲸鱼', '- 全局：她喜欢鲸鱼\n- 名字：{{display_name}}')
const p2 = join(DATA_DIR, 'card2.md')
writeFileSync(p2, card2)
const block = buildStable('/any/cwd', { factsPath: p2, ownerQQ: '1000000001', isOwner: true })
assert.ok(block.includes('全局：她喜欢鲸鱼'))
assert.ok(block.includes('主人节：主人怕辣'))
assert.ok(!block.includes('别人的节'), '不许串到别人的节')
assert.ok(!block.includes('{{'), '含占位符的行已被丢')
assert.ok(!block.includes('名字：'))
out.buildStable = 'ok'

// ── 空卡（factsPath 指向空文件）不抛、返回空块 ──────────────────
const p3 = join(DATA_DIR, 'card3.md')
writeFileSync(p3, '# 事实卡\n')
assert.equal(buildStable('/any/cwd', { factsPath: p3, ownerQQ: '1000000001', isOwner: true }), '')
out.emptyCard = 'ok'

console.log(JSON.stringify(out))
