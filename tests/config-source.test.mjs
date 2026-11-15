/**
 * Config 声明（2026-11-10）
 *
 * 设置页只认识插件 Config schema 里标了 `.volatile()` 的字段（dsh-settings 的
 * `volatileForm`/`isVolatilePath`）。本测试覆盖：
 *   ① Config 能解析 DEFAULTS（3 个字段带默认值，volatile 路径正好 3 个）
 *   ② Config 能解析 profile 里 memory-core 现有的 config（autoShare/trustedDirs/factsPath，
 *      未声明键必须原样保留，loadConfig 清洗后值不变）
 *   ③ loadConfig 入口把 volatile `{get()}` 引用还原成普通值（手写裸引用 + 真 schema 引用）
 *
 * 用临时 DY_MEMORY_DIR（/tmp），不读也不写生产库 /sdcard/DSHA/记忆/数据/config.json。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs'

const DIR = '/tmp/dy-config-source-' + process.pid
process.env.DY_MEMORY_DIR = DIR
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const { Config } = await import('../lib/index.js')
const { DEFAULTS, loadConfig, unwrapVolatile, groupMemoryConfig } = await import('../lib/config.js')

const PROFILE_PATCH = process.env.DSH_PROFILE_PATCH ?? '/root/.dsh/profiles/web/cordis.patch.yml'

/** 读 profile 里 memory-core 的 config 片段；拿不到就返回 undefined（测试可跳过）。 */
async function readProfileMemoryConfig() {
  if (!existsSync(PROFILE_PATCH)) return undefined
  const { parse } = await import('yaml')
  const entries = parse(readFileSync(PROFILE_PATCH, 'utf8'))
  const entry = Array.isArray(entries) ? entries.find((row) => row?.id === 'memory-core') : undefined
  return entry?.config
}

/** 把 schema 的 dict 树里标了 volatile 的路径全找出来（排序后返回）。 */
function volatilePaths(schema, path = []) {
  const out = []
  for (const [key, child] of Object.entries(schema.dict ?? {})) {
    const target = [...path, key]
    if (child.meta?.volatile) out.push(target.join('.'))
    out.push(...volatilePaths(child, target))
  }
  return out.sort()
}

test('Config：导出的 schemastery schema 能解析 DEFAULTS', () => {
  assert.equal(typeof Config?.['~standard']?.validate, 'function')
  const result = Config['~standard'].validate(structuredClone(DEFAULTS))
  assert.equal(result.issues, undefined)
  assert.equal(result.value.memoryRecordEnabled.get(), DEFAULTS.memoryRecordEnabled)
  assert.equal(result.value.memoryInjectEnabled.get(), DEFAULTS.memoryInjectEnabled)
  assert.equal(result.value.groupMemory.ttlDays.get(), DEFAULTS.groupMemory.ttlDays)
  // 解析后跑 loadConfig / groupMemoryConfig，运行时配置与解析前一致（未知键/缺省键不丢）
  assert.deepEqual(groupMemoryConfig(loadConfig(result.value)), groupMemoryConfig(loadConfig(structuredClone(DEFAULTS))))
})

test('Config：volatile 只标在设置页要读写的 3 个字段上', () => {
  assert.deepEqual(volatilePaths(Config), ['clarity.enabled', 'groupMemory.ttlDays', 'memoryInjectEnabled', 'memoryRecordEnabled'])
})

test('Config：能解析 profile 里现有的 memory-core 配置（未声明键原样保留）', async (t) => {
  const profileConfig = await readProfileMemoryConfig()
  if (profileConfig === undefined) {
    t.skip(`profile patch 不存在或没有 memory-core 条目：${PROFILE_PATCH}`)
    return
  }
  // 先确认 profile 里确实有这三个键（防止测试因为片段变了而空转）
  assert.equal(typeof profileConfig.autoShare, 'boolean')
  assert.ok(Array.isArray(profileConfig.trustedDirs))
  assert.equal(typeof profileConfig.factsPath, 'string')

  const result = Config['~standard'].validate(structuredClone(profileConfig))
  assert.equal(result.issues, undefined)
  const value = result.value
  // 未声明的键必须原样保留
  assert.equal(value.autoShare, profileConfig.autoShare)
  assert.deepEqual(value.trustedDirs, profileConfig.trustedDirs)
  assert.equal(value.factsPath, profileConfig.factsPath)
  // 声明的键带默认值且是 volatile 引用
  assert.equal(value.memoryRecordEnabled.get(), DEFAULTS.memoryRecordEnabled)
  assert.equal(value.memoryInjectEnabled.get(), DEFAULTS.memoryInjectEnabled)
  assert.equal(value.groupMemory.ttlDays.get(), DEFAULTS.groupMemory.ttlDays)
  // 解析后的配置跑 loadConfig，三个 profile 键的值不变
  const cleaned = loadConfig(value)
  assert.equal(cleaned.autoShare, profileConfig.autoShare)
  assert.deepEqual(cleaned.trustedDirs, profileConfig.trustedDirs)
  assert.equal(cleaned.factsPath, profileConfig.factsPath)
  assert.equal(cleaned.memoryRecordEnabled, DEFAULTS.memoryRecordEnabled)
  assert.equal(cleaned.memoryInjectEnabled, DEFAULTS.memoryInjectEnabled)
  assert.equal(groupMemoryConfig(cleaned).ttlDays, DEFAULTS.groupMemory.ttlDays)
})

test('loadConfig：解开 volatile `{get()}` 引用（裸引用 / 真 schema 引用）', () => {
  // 手写裸引用：loadConfig 是唯一读入口，必须先还原成普通值
  assert.equal(loadConfig({ memoryInjectEnabled: { get: () => false } }).memoryInjectEnabled, false)
  assert.equal(loadConfig({ memoryRecordEnabled: { get: () => false } }).memoryRecordEnabled, false)
  assert.equal(loadConfig({ groupMemory: { ttlDays: { get: () => 30 } } }).groupMemory.ttlDays, 30)

  // 真 schema 解析出来的引用（带 cosmokit.volatile.write Symbol）
  const resolved = Config['~standard'].validate({ memoryInjectEnabled: false, groupMemory: { ttlDays: 30 } }).value
  assert.equal(typeof resolved.memoryInjectEnabled.get, 'function')
  assert.equal(loadConfig({ memoryInjectEnabled: resolved.memoryInjectEnabled }).memoryInjectEnabled, false)
  assert.equal(loadConfig({ groupMemory: resolved.groupMemory }).groupMemory.ttlDays, 30)

  // 普通配置对象不受影响（no-op）
  assert.deepEqual(unwrapVolatile({ groupMemory: { ttlDays: 90 }, factsPath: '/x' }), { groupMemory: { ttlDays: 90 }, factsPath: '/x' })
})
