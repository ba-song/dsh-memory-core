# Host 工具执行 provenance · 架构调查报告

> 任务：为「Host 工具执行 provenance」改造确定**合法调用路径、插件加载顺序与可信初始化边界**。
> 性质：**只读源码调查**（未修改 `/tmp/harness-probe`、`/usr/local/lib/node_modules`、`/root/.dsh`；未重启进程；无网络/QQ 副作用）。
> 报告结论一律给 `file:line` + 短引用；找不到的写「未找到 + 搜索命令 + 已搜范围」。

## 0. 基线与环境核对

| 项 | 值 | 证据 |
|---|---|---|
| 源码基线 | tag `dsh-v0.2.1-rc.2`，commit `687f282e8625c6b8d11ff58211a90524be2e4317` | `git log -1`（`/tmp/harness-probe`） |
| 运行安装包 | `@deepseek-ai/dsh@0.2.1-rc.2` | `/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json` |
| 关键依赖版本 | `dsh-tools / dsh-app-boot / dsh-agent-loop / dsh-agent / dsh-session` 均 `0.2.1-rc.2`；`cordis 4.0.5` | 各包 `package.json`；目录 mtime 同为 `2026-11-04 20:55`，未见单包本地改写 |
| 运行进程 | `node /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js web --no-open --host 127.0.0.1 --port 38105`（PID 30172） | `ps -eo pid,ppid,cmd` |
| 运行 profile | `/root/.dsh/profiles/web`（`dsh.profile.bundles` 共 24 个 bundle：base、web-app 在前，随后 22 个用户/DSHA/实验 bundle） | `/root/.dsh/profiles/web/package.json` |
| 启动链路 | `apps/cli/src/bin.ts:35 runProfile` → `apps/cli/src/profile-boot.ts:271 runProfile` → `boot(...)` | 见 §1 |

**安装包与源码一致性**：`/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/*.js` 内可见 `let stage = "host preparation failed"`、`await prepare?.(ctx)`、`await mountRootInclude(...)`（编译产物行 4523/4536/4538），与源码 `packages/boot/app-boot/src/index.ts:1220/1230/1232` 对应。结论：**本报告的 app-boot / tools / agent-loop / agent / session 结论对运行安装包同样成立**。

---

## 1. 组合根：ToolRuntime / AgentLoop 挂在哪，宿主能否在插件前执行代码

### 1.1 ToolRuntime 与 AgentLoop 的挂载点

**没有**任何字面量 `ctx.plugin(ToolRuntime)` / `ctx.plugin(AgentLoop)`。二者是 **profile bundle 的 patch 行**，由 Loader 的 `cordis:include` 建 entry，再由 `Entry._init()` 调 `ctx.registry.plugin(...)` 挂载：

- `packages/bundle/base/cordis.patch.yml:499-501`
  ```yaml
  - id: tools
    name: '@deepseek-ai/dsh-tools'
  ```
- `packages/bundle/base/cordis.patch.yml:511-514`
  ```yaml
  - id: agent-loop
    name: '@deepseek-ai/dsh-agent-loop'
    config:
      agents: []
  ```
- 其他 bundle 的同类行：`packages/bundle/web-app/cordis.patch.yml:32-35`（重述 `tools.mode`）、`packages/bundle/headless/cordis.patch.yml:14-16`、`packages/bundle/sdk-minimal/cordis.patch.yml:120-121,135-136`。
- 实际挂载动作：`vendor/loader/src/config/entry.ts:236`
  ```ts
  this.fiber = this.ctx.registry.plugin(plugin, this.options.config, this.getOuterStack).ctx.fiber
  ```
- 服务本体：`packages/core/tools/src/index.ts:808`（`class ToolRuntime extends Service`）、`:851`（`super(ctx, 'tools')`）；`packages/core/agent-loop/src/index.ts:341`（`class AgentLoop extends Service implements AgentFactory`）、`:929`（`export default AgentLoop`）。

**激活依赖（隐式顺序）**：
- `packages/core/tools/src/index.ts:809` `static inject = ['systemPrompt']` → ToolRuntime 必须等 `system-prompt` 服务。
- `packages/core/agent-loop/src/index.ts:342` `static inject = ['agents','sessions','llm','tools','systemPrompt','sessionProjections']` → AgentLoop 必须等 ToolRuntime **已 ACTIVE**。这是"工具注册表先于 agent 循环"的唯一结构性保证，来自 cordis inject，不是行序。

### 1.2 宿主组合根：`boot()` 的 `prepare` 钩子（**唯一"插件前宿主代码"执行点**）

`packages/boot/app-boot/src/index.ts:1200-1232`：

```ts
export async function boot(binName, absoluteConfigPath, patches?, prepare?, bareModuleBaseUrl?) {
  const ctx = new Context()                       // :1207
  ...
  await ctx.plugin(Loader)                        // :1229  Loader 服务先装
  await prepare?.(ctx)                            // :1230  宿主代码：此时配置树 0 个 entry
  stage = 'plugin tree failed to load'            // :1231
  await mountRootInclude(ctx, ...)                // :1232  第一个 config-tree entry 从这里开始
```
文档注释明确（`:1188`）：
> `@param prepare - optional host setup run after Loader installation and before any config-tree entry mounts.`

调用方 `apps/cli/src/profile-boot.ts:323-338`：

```ts
const ctx = await boot(NAME, rootConfig, readProfilePatches(...), async (hostCtx) => {
  hostCtx.provide('profileContext', profileContext)                 // :325
  hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, options.environment)// :328
  await hostCtx.plugin(PluginPackages, { resolution: composed.resolution }) // :329
  provideCmdline(hostCtx, { args, exit, ready })                    // :334
})
```

结论：
- **存在宿主组合根，且可以在任何配置树插件挂载之前执行宿主代码**：`apps/cli/src/profile-boot.ts:323` 的 `prepare` 回调（底层由 `app-boot` 的 `boot()` 保证时序）。
- 它之前还有一段宿主代码：`apps/cli/src/profile-boot.ts:276 installProxyFromEnvironment`、`:292 composeProfile`、`:309 installFailLoud`；`boot()` 之前没有任何 profile 插件运行。
- **Loader 本身**（`:1229`）是宿主安装的插件，不是配置树插件；`prepare` 在它之后、配置树之前。

### 1.3 bundle **不是**组合根

`packages/bundle/base/src/index.ts:1-7` 全文只有 `export {}`，注释写明：
> "The package's substance is `cordis.patch.yml` … this module carries no runtime API."

所以 bundle 只是**配置补丁层**，不提供宿主运行时代码；宿主代码只在 `apps/cli` / `packages/boot/*` / `packages/host/*`。

### 1.4 宿主 `prepare` 边界内可做什么（能力与限制）

- 可以 `provide` 服务（如 `profileContext`、launch environment）；但这些服务**对所有插件可 `ctx.get()`**，不是私有通道（见 §6）。
- 可以 `ctx.plugin(...)` 挂宿主自有插件（如 `PluginPackages`，`apps/cli/src/profile-boot.ts:329`）；但插件同样可以 `ctx.root.plugin(...)`（实测见 §6.3），"只有宿主能 plugin"不成立。
- **不能**在 `prepare` 里直接拿到 `ToolRuntime` 实例：它此刻尚未创建。若要在 ToolRuntime 激活时注入逻辑，只能用 `ctx.inject(['tools'], cb)` / `ctx.on('internal/status', …)` 等**等它出现**的方式；这类回调的注册者身份在运行期不可区分。
- 另一个真实边界：`mountRootInclude` 内的 `prepareProfilePatches`（`packages/boot/app-boot/src/index.ts:774` → `packages/boot/app-boot/src/compatibility-preflight.ts:180`）会**在所有 patch 合成后、mount 前**改写 entry 行（不兼容行加 `disabled`）。它依赖 `ctx.get('profileContext')`（`compatibility-preflight.ts:183`），也证明 `prepare` 阶段提供的宿主事实确实先于树生效。

---

## 2. 插件加载顺序：有保证的只是「配置层顺序」，不是「激活顺序」

### 2.1 配置层顺序：确定

`packages/boot/app-boot/src/profile.ts:1-20` 文档：
> "the tree is composed by applying each bundle's patch lists in `dsh.profile.bundles` order over an empty entry list, then the profile's own patches, then any launcher layers"

实现：
- `packages/boot/app-boot/src/profile.ts:740-773` `loadProfileDirectory`：`for (const packageName of bundles)`（`:751`）按 **`dsh.profile.bundles` 顺序**取每个 bundle 的 patch 文件（`:762-764`）。
- `packages/boot/app-boot/src/profile-context.ts:63-65` `readBundlePatches` = `profile.layers.flatMap(layer => layer.patches)`。
- `packages/boot/app-boot/src/profile-context.ts:74-90` `readProfilePatches` 的顺序固定为：
  **bundle 层（按 bundles 数组序）→ profile `cordis.patch.yml` → home patch → `--patch` overlays → 遥测关闭补丁**。
- `vendor/include/src/index.ts:57-127` `applyEntryPatches`：`for (const patch of patches)`（`:76`），`insert` 时 `data.push(...insert)`（`:93`）并 `buildMap(insert)`（`:100`，后层可再 patch 前层插入的行）。
- `mountRootInclude` 最终把全部层压成**一个** insert 补丁（`compatibility-preflight.ts:180-190`）：`return rows.length === 0 ? [] : [{ insert: rows }]`。

> 命名注意：仓库里没有 `dsh.bundles` 字段；profile 清单在 `<profile>/package.json` 的 **`dsh.profile.bundles`**（字符串数组，见 `packages/boot/app-boot/src/profile.ts:45,747`），插件行本身在 `cordis.patch.yml`。`<profile>/cordis.yml` 只是空 entry 列表（运行中的 `cordis.yml` 内容就是 `[]`）。
> Loader 代码位置：`vendor/loader/src/index.ts:77`（`class Loader extends EntryTree`）、`vendor/loader/src/config/entry.ts`（单个 entry 的 import/挂载）、`vendor/loader/src/config/group.ts`（并发 update）、`vendor/loader/src/config/tree.ts`（树/await），`cordis:include` 这一"读配置 + 打补丁"的 entry 在 `vendor/include/src/index.ts:159`（`class Include extends EntryTree`）。

**运行中的证据**：`/root/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 是字符串数组，顺序为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`，随后是 `dsh-device-shell-guide`、…、`dsh-persona-core`、…、`dsh-lan-link`。用户插件（`/root/.dsh/plugin-src/*`）与内建 bundle **在同一数组、同一机制**里，只是排在后面（`dsh-persona-core` 等 `package.json` 都声明 `{"bundle":{"patch":"./cordis.patch.yml"}}`，实现见 `profile.ts:755-764`）。

### 2.2 激活顺序：**不保证**

- `vendor/loader/src/config/group.ts:50-63`：
  ```ts
  async update(config) {
    ...
    const ids = Reflect.ownKeys({ ...oldMap, ...newMap })
    await Promise.all(ids.map(async (id) => { ... await this.create(newMap[id]) ... }))  // :56
  }
  ```
  → 同一层的 entry **并发创建/挂载**。
- `vendor/loader/src/config/entry.ts:212-238` `_init()`：先 `await import(...)`，再 `ctx.registry.plugin(...)`；插件是否真正运行由 cordis `inject` 决定（`fiber.state` / `_checkImpl`）。
- 代码注释直接确认：`packages/boot/app-boot/src/index.ts:862`
  > "The Loader mounts entries concurrently, so a surface that owns the terminal can already hold it when a sibling entry rejects."
- 配置注释确认：`packages/bundle/base/cordis.patch.yml:12-13`
  > "Row order carries no load semantics (activation is service-availability driven); the grouping is for readers."

结论：
1. **patch 层的先后**（谁覆盖谁、谁 insert 在前）**确定**；
2. **插件 `apply()` 的执行先后不保证**（并发），只有声明了 `inject` 的依赖边会形成等待；
3. 因此**不能把"某插件一定晚于/早于另一插件运行"作为 provenance 安全假设**；宿主若要"先装检查再放插件跑"，只能用 §1.2 的 `prepare`（配置树之前）或 `inject`/服务可用性边。

---

## 3. 合法工具执行入口（全仓库，排除 tests）

> 搜索：`grep -rn "\.execute(\|TOOL_RUNTIME_SCHEDULER\|prepareScheduledExecution\|createExecution\|executeToolCalls" --include=*.ts packages apps vendor | grep -v "/tests/\|\.test\."`

| # | 入口 | 代码位置 | 发起者 | Host 内部路径？ | 插件可达？ | 说明 |
|---|---|---|---|---|---|---|
| E1 | 模型原生工具调用（唯一 `executeToolCalls`） | `packages/core/agent-loop/src/agent.ts:551` → `tool-calls.ts:60,68,131,170-174` | AgentLoop 驱动 | 是（框架内置插件） | 否（`executeToolCalls` 未从包入口导出，`dsh-agent-loop` 的 `package.json` exports 无 `./src/*`；仅 `agent.ts:551` 内部调用） | 走 `ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare/dispatch/finalize/finish`；`requireInitiator()` 提供 agent |
| E2 | PTC `run_code` SDK 子调用 | `packages/core/tools/src/ptc.ts:558,624-640` | `run_code` 工具 body | 是（ToolRuntime 自建 transport） | 间接（任何能用 `run_code` 的路径） | 同样走 scheduler 四段式；`parent: exec.token` 标记 nested |
| E3 | `ToolRuntime.execute(exec)` 公共 API | `packages/core/tools/src/index.ts:1377` | 任意持有 `ctx.tools` 的代码 | 否（通用入口） | **是** | 文档定位："Ordinary callers use `ToolRuntime.execute`"（`:462`）；仓库内非测试代码**无人调用**，仅测试调用 |
| E4 | `TOOL_RUNTIME_SCHEDULER` 符号直接调用 | 符号 `index.ts:481`；实例 `index.ts:817-822`；使用 `tool-calls.ts:153-174`、`ptc.ts:558+` | agent-loop / PTC | 是（内部调度视图） | **是**（符号公开导出，见 §5） | `prepare` 与 `execute` 汇合到同一个 `prepareExecution` |
| E5 | `claude-code-mods` 的 `$.tool.call` | `packages/experimental/claude-code-mods/src/host-ops.ts:359-373` | 动态 mod 包（插件代码） | 否（实验扩展） | **是**（mod JS） | `ctx.get('tools')` → `registry.execute({callId,name,arguments,agent?,signal})`；用 `callOrigins` Map 做"调用来源"标注（`:96,364,377`），`tools/execute` 监听器消费（`index.ts:382-431`）。DSHA web profile **未挂载**本扩展 |
| E6 | 直接调用原始 `ToolDefinition.execute` | 定义 `index.ts:237`；`get()` 返回活定义 `index.ts:1238` | 任意插件 | — | **是（旁路）** | 不经过 `ToolRuntime.execute`，因此**绕过** pre-policy/guard/around/post/结果规范化。仓库自己的沙箱已把它列为要防的逃逸面（`packages/extensions/cordis-host-runner/src/guard.ts:642-647`） |

**"所有非 `executeToolCalls` 的合法路径"= E2、E3、E4、E5。** E1 是唯一的模型原生路径；E6 不是"合法入口"，但它是同进程内真实可达的绕过面，威胁模型必须写入。

补充：`packages/core/tools/src/index.ts:478-479` 把 scheduler 注释为
> "Scheduler entry point omitted from the generated named service API. `@internal`"

但 `TOOL_RUNTIME_SCHEDULER` 仍是**公开导出**（`:481`），且 `tool-cordis` 生成的 API 目录里也带着该字段（`packages/extensions/tool-cordis/src/api-catalog.ts:8318`）。"omitted from generated service API" 是文档/目录层面的省略，**不是运行期不可达**。

---

## 4. 是否有内部代码直接调用 `tools.execute`

- 全仓库（排除 tests）**没有** `ctx.tools.execute(` / `tools.execute(` 的实际调用；只出现在注释/文档：
  - `packages/guard/repeat-tool-reminder/src/index.ts:197`（注释："A direct `ctx.tools.execute()` caller has no model to remind…"）
  - `packages/core/tools/src/index.ts:462`（文档）
- **唯一**的非测试、非 agent-loop 直接执行调用是 E5：`packages/experimental/claude-code-mods/src/host-ops.ts:359-373` 的 `registry.execute({...})`（变量名 `registry`，类型是 `tools` 服务）。它由 mod 包触发 → **属于"插件触达"**，不是 Host 内部。
- `ToolRuntime` 自己调 body：`packages/core/tools/src/index.ts:1589` `const returned = await tool.execute(exec.arguments, exec)` —— Host 内部唯一合法调用点。
- 测试把 `ctx.tools.execute` 当公共 API 用（仅作为"设计意图"证据，例如 `packages/core/tools/tests/tools.spec.ts:124`、`packages/core/agent-loop/tests/agent-initiator.spec.ts:315`），不在实现路径内。
- 已核对安装包：`grep -rn "tools\.execute" /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai` 只命中 `dsh-tools`/`dsh-agent-loop` 的编译产物与 `dsh-repeat-tool-reminder` 的 README；与源码一致。

**判断**：没有"内部隐藏的 Host 直调 `tools.execute`"；真正需要治理的是 E3/E4（公开 API，任何插件可用）与 E6（原始定义旁路）。

---

## 5. 插件是否依赖 `prepareExecution` / `createExecution` / `TOOL_RUNTIME_SCHEDULER`

搜索命令（已执行）：
```bash
grep -rn "prepareExecution\|prepareScheduledExecution\|createExecution\|TOOL_RUNTIME_SCHEDULER" \
  --include=*.js --include=*.ts --include=*.mjs /root/.dsh/plugin-src
grep -rn "prepareExecution\|createExecution\|TOOL_RUNTIME_SCHEDULER" --include=*.ts packages apps \
  --exclude-dir=tests --exclude=api-catalog.ts
```

结果：
- `/root/.dsh/plugin-src/*/lib/**`：**0 命中**（`dsh-persona-core`、`dsh-memory-core`、`dsh-autonomy`、`dsh-douyin`、`dsh-channel-bridge`、`dsh-hud`、`dsh-media`、`dsh-selfhost-boot` 全部）。
- 仓库非测试代码：仅
  - `packages/core/tools/src/index.ts`（定义/实现本体）
  - `packages/core/tools/src/ptc.ts:27,558,624-640`（PTC 子调用）
  - `packages/core/agent-loop/src/tool-calls.ts:17,153-174`（原生调度）
- `createExecution` / `prepareExecution` / `prepareScheduledExecution` 都是 `ToolRuntime` 的 **TS `private` 方法**（`index.ts:1399,1497,1501`），**没有导出**，也没有类型入口；插件无法按名字 import。
- `TOOL_RUNTIME_SCHEDULER` 则是**公开导出**：`index.ts:481`，运行时实测导出存在：
  ```text
  ['TOOL_ABORTED','TOOL_ABORTED_BEFORE_DISPATCH','TOOL_RUNTIME_SCHEDULER','ToolRuntime']
  symbol desc: Symbol(@deepseek-ai/dsh-tools.scheduler)
  ```
- `@deepseek-ai/dsh-tools` 的 `package.json` 还有 `"./src/*": "./src/*"` 导出（安装包同），即**包内 src 文件都可按子路径 import**；所以"不导出到主入口"并不是模块级封锁。

**结论**：现有插件不依赖这些内部名字；但 `TOOL_RUNTIME_SCHEDULER` 与 `ToolRuntime.execute` 一样，对插件是**公开可调 API**，不是私有通道。

---

## 6. cordis 服务隔离：**不能**作为"插件不可见的私有通道"

### 6.1 机制

- `vendor/cordis/src/context.ts:121-125`：
  ```ts
  isolate(name, label?) {
    const shadow = Object.create(this[symbols.isolate])
    shadow[name] = label ?? Symbol(name)
    return this.extend({ [symbols.isolate]: shadow })
  }
  ```
  隔离 = 给"服务名 → 作用域标签"做一层原型继承的映射，**只影响解析（get/provide）作用域**。
- `Context` 实例把 `reflect` / `registry` / `fiber` 作为**自有属性**暴露：`context.ts:72,77-79`。`ctx.reflect`、`ctx.registry` 不在 `isSpecialProperty` 的屏蔽名单（`reflect.ts:86-91`：只屏蔽 symbol/`prototype`/`then`/数字串/`_` 前缀）。

### 6.2 关键字段是 TS `public`，不是 ES `#private`

- `vendor/cordis/src/reflect.ts:209`：`public store: Dict<Impl, symbol> = Object.create(null)` —— **所有隔离标签的服务实现都在这一张表里**（key=label symbol，value=`Impl{name,fiber,value,check}`）。
- `vendor/cordis/src/reflect.ts:211`：`public props: Dict<Property>` —— 所有已声明属性名（含隔离服务名）。
- `vendor/cordis/src/fiber.ts:188,198`：`public readonly ctx: Context`、`public store: Dict<Impl> | undefined` —— fiber 的依赖快照（**值**可读）。
- `vendor/cordis/src/registry.ts:195,199,275`：`class RegistryService`、`constructor(public ctx: Context)`、`values()`（返回全部 plugin runtime → `.fibers` → `.ctx` / `.store`）。

### 6.3 实测（只读脚本，跑在安装包 `cordis@4.0.5` 上，无写盘）

探针：provider 用 `isolate('secret')` provide `{token:42}`；无 `inject` 的 spy 插件：

```json
{
  "storeKeys": ["Symbol(secret)", "Symbol(publicSvc)"],
  "storeImpls": [
    {"sym":"Symbol(secret)","name":"secret","hasValue":true,"value":{"token":42}},
    {"sym":"Symbol(publicSvc)","name":"publicSvc","hasValue":true,"value":{"hello":"world"}}
  ],
  "registryValues": [{"name":"provider","fibers":1},{"name":"consumer","fibers":1}],
  "fiberCtxViaRegistry": [{"name":"provider","storeKeys":["secret","publicSvc"],"ctxIsContext":true}],
  "reflectProps": ["get","set","provide","accessor","mixin","runtime","effect","inject","plugin","on","once","parallel","emit","serial","bail","waterfall","secret","publicSvc"]
}
```

第二个探针进一步确认隔离服务的**值**可直接取出：

```json
{"viaFiberStore":{"token":7},"viaReflectStore":[{"token":7}],"propsHasSecret":true}
```

并且普通插件可触达框架内部：`{"rootIsAccessible":true,"canPluginOnRoot":true,"hasFiber":true,"hasRegistry":true,"hasReflect":true,"hasExtend":true}`（`ctx.root.plugin(...)` 可用）。

### 6.4 结论

1. **隔离服务不能当私有通道**：`ctx.reflect.store` / `ctx.registry.values()` / `fiber.store` 能把所有隔离 label 下的服务**名字和值**枚举出来（`store` 是 TS `public`，运行时普通自有属性，非 `#private`）。
2. `isolate()` 的真实语义是**命名空间/遮蔽**（避免同名 provide 冲突、让依赖按标签解析），**不是机密性边界**。
3. 若要"插件不可见"的通道，只能靠**不在 cordis 反射面上**的载体：模块作用域 `#private` 字段、不导出的 `Symbol`、模块私有 `WeakMap`。但注意：
   - 同进程插件仍可按绝对路径/`file:` URL import 同一模块（`@deepseek-ai/dsh-tools` 甚至导出 `./src/*`），所以这是"提高门槛"，不是"密码学隔离"。
   - 真正隐藏框架内部的现成机制只有 **`cordis-host-runner` 的沙箱 façade**（`packages/extensions/cordis-host-runner/src/guard.ts:700-745`：拒绝把 `Context` 交给沙箱代码，withhold `root/fiber/registry/extend/plugin`，`tools` 只给 `register/schemas/get`（schema 视图），并明确拒绝把活的 `ToolDefinition` 交出去）。
   - 真正的进程级边界是 PTC 子进程/VM（`packages/ptc-runtime/*`、`packages/workflow/workflow-ptc`）。

---

## 7. agent 与 initiator

实现文件：`packages/core/agent/src/index.ts`。

### 7.1 语义（文档原文）

`packages/core/agent/src/index.ts:238-242`：
> "Initiator methods provide same-process causal attribution only. Ambient presence is neither liveness proof nor authorization; subjects and owners remain explicit, as does identity at worker, process, persistence, and wire boundaries."

- `currentInitiator()` `:297-300`：读 `AsyncLocalStorage<Agent|undefined>`；无边界返回 `undefined`；服务 disposed 后抛 `DISPOSED_INITIATOR_MESSAGE`。
- `requireInitiator()` `:310-314`：无 initiator 抛 `new Error('no initiating agent is active')`（`NO_INITIATOR_MESSAGE`，`:207`）。
- `withInitiator(agent, operation)` `:329-331` → `runWithInitiator` `:625-664`：在 ALS 里建立嵌套 run，返回原始同步值/Promise，并在 Promise settle 时释放 run；disposed/closing 抛错。
- `withoutInitiator(operation)` `:344-346`：显式清空 initiator（用于定时器/队列，避免继承第一个 agent）。

**驱动边界**：`packages/core/agent-loop/src/agent.ts:234`
```ts
this.loopCtx.agents.withInitiator(this, () => this.kick()).then(...)
```
→ 整个 turn/step/tool 执行链都在该 ALS 内，所以 `executeToolCalls` 里 `requireInitiator()`（`tool-calls.ts:68,131`）拿到的就是发起 turn 的 agent。

### 7.2 对插件暴露的 `ctx.agents.*` 方法清单

`class AgentRegistry`（`:245`，`super(ctx,'agents')` `:256`）的 public 面：

| 方法 | 行 | 语义 |
|---|---|---|
| `currentInitiator()` | 297 | 可选读当前 initiator |
| `requireInitiator()` | 310 | 必须有 initiator |
| `withInitiator(agent, op)` | 329 | **任何持有 `agents` 的插件都能调用**，建立 initiator 边界 |
| `withoutInitiator(op)` | 344 | 清空 initiator |
| `setFactory(factory)` | 360 | 注册 agent 工厂（已注册再注册抛错） |
| `create(options)` | 393 | 走工厂创建 agent |
| `resume(options)` | 412 | 恢复持久 session |
| `register(agent)` | 439 | 注册已构造 agent |
| `enter(agent, owner)` | 461 | 未 announce 插入（高级顺序生命周期） |
| `announce(agent, source, signal?)` | 539 | 发布 `agent/created` |
| `get(id)` | 568 | 查活 agent |
| `isOwnedBy(id, owner)` | 580 | 运行期所有权判断 |
| `list()` | 588 | 所有活 agent |
| `roots()` | 598 | 无 owner 的活 agent |

**关键安全结论**：`withInitiator` 是 public，**initiator 不是不可伪造的信任位**。任何插件都可以 `ctx.agents.withInitiator(某个活 agent, () => ctx.tools.execute({agent: 该 agent, ...}))`，从而让 `exec.agent` 与 `currentInitiator()` 一致。所以 provenance 若只校验 `currentInitiator() === exec.agent`，只能挡"随手乱调"，挡不住有意的插件。

### 7.3 既有先例：goal 工具的 authority 检查

`packages/goal/tool-goal/src/authority.ts:48-61`：
```ts
const agent = exec.agent
if (agent === undefined) reject('goal tools require a calling agent', 'GOAL_TOOL_AGENT_REQUIRED')
if (ctx.agents.get(agent.id) !== agent || agent.status !== 'running'
  || ctx.agents.currentInitiator() !== agent) {
  return reject('goal tools require the exact live calling agent inside its active driver', 'GOAL_TOOL_DRIVER_REQUIRED')
}
```
再叠加 open-turn 投影（`:32-40`）。这是仓库里最接近"tool 执行 provenance"的现成模式：**agent 身份 + 存活 + 驱动边界 + 回合边界**；但它同样依赖 public 的 `currentInitiator()`，属于"归因/一致性校验"，不是抗伪造授权。

---

## 8. session

### 8.1 `agent.session.header`

- 类型：`packages/core/session/src/types.ts:95-133` `interface SessionHeader`，字段：`version/id/createdAt/cwd/parentSession/isSeeded/origin/delegationDepth/agentPreset`。
- 实例：`packages/core/session/src/index.ts:540` `readonly header: SessionHeader`，文档："Detached, deep-frozen creation metadata … Kept out of the event log"。
- 构造：`snapshotSessionHeader`（`:149-155`）先 `snapshotJsonValue`（纯 JSON 快照）再 `validateSessionHeader`，最终 `deepFreeze`（`:134`）。
- 结论：**普通（plain）对象、深冻结、插件可读**（`ctx.sessions.get(id)?.header` 或 `agent.session.header`）；**不可写**（frozen + readonly）。把 trust 标记塞进 header 是行不通的（既改不了，也不是本会话可变状态）。

### 8.2 `ctx.sessions.*`（`SessionStore`，`packages/core/session/src/index.ts:1049`，`super(ctx,'sessions')` `:1077`）

读写方法（public）：

| 方法 | 行 | 说明 |
|---|---|---|
| `create(id?, options?)` | 1111 | 创建并 enter+announce（调用方 fiber 拥有生命周期） |
| `prepare(id?, options?)` | 1143 | 只构造、不进 store |
| `enter(session)` | 1210 | 进 store，返回 detach（不 announce） |
| `announce(session)` | 1265 | 发布 `session/created` |
| `flush(session)` | 1319 | 持久化 |
| `get(id)` | 1352 | 读活 session |
| `list()` | 1360 | 所有活 session |
| `fork(source, boundary?, childSessionId?)` | 1380 | 派生 |
| `registerMessageProjection(projection)` | 1066 | 注册事件解释器 |
| `messageProjections`（getter） | 1055 | 借出的解释器列表 |

`Session` 实例的 public 面：`header`(540)、`id`(546)、`surface`(528)、`seq`(757)、`eventAt`(711)、`snapshotEvents`(725)、`ownEvents`(742)、`isOwnSeq`(752)、**`append`(798)**、`requestHeader`(912)、`requestContext`(933)、`toolHistory`(953)、`deriveMessages`(984)、`deriveEventMessage`(1013)。

**安全含义**：任何注入 `sessions` 的插件都能 `list()`/`get()` 读全部 session，并 `session.append('plugin:…', data)` 写日志。因此**不能把 provenance 只写进 session 事件并事后信任它**——写入者不可区分。

---

## 9. 错误码规范 与 `E_TOOL_EXEC_UNTRUSTED` 建议

### 9.1 现有规范

- 基类：`packages/llm/llm/src/error.ts:13-24`
  ```ts
  export class HarnessError extends Error {
    readonly code: string   // "Stable machine-routable failure class … route on this, never by parsing message"
    constructor(message: string, code: string, options?: ErrorOptions) { ... this.name = new.target.name }
  }
  ```
- 代码风格：**UPPER_SNAKE，无 `E_` 前缀**，路由靠 `code`，`name` 默认类名。实例：
  - `packages/core/tools/src/index.ts:511-527` `ToolNotFoundError` → `'UNKNOWN_TOOL'`
  - `packages/core/tools/src/index.ts:530-538` `ToolOutputError` → `'INVALID_TOOL_OUTPUT'`
  - `packages/core/tools/src/schema.ts:461-469` `ToolArgsError` → `'INVALID_ARGS'`
  - `packages/core/tools/src/ptc.ts:168-171` `CodeRunFailedError` → `'CODE_RUN_FAILED'`
  - `packages/fs/fs-sandbox/src/index.ts:127,141` `FsError(..., 'FS_SANDBOX_DENIED')`
  - `packages/goal/tool-goal/src/authority.ts:24-26` 直接 `throw new HarnessError(message, 'GOAL_TOOL_AUTHORITY_REQUIRED')`，另有 `'GOAL_TOOL_AGENT_REQUIRED'` / `'GOAL_TOOL_DRIVER_REQUIRED'`（`:37,51,57`）
  - 取消常量：`packages/core/tools/src/index.ts:484,487` `TOOL_ABORTED='ABORTED'`、`TOOL_ABORTED_BEFORE_DISPATCH='ABORTED_BEFORE_DISPATCH'`
- 错误如何落到模型/日志：`packages/core/tools/src/index.ts:663-668` `errorInfo()` 只对 `HarnessError` 取 `{name, code}`；`toolErrorResult()` `:1917-1925` 生成 `{isError, content:[{text:'Error: …'}], error:{message, info}}`；测试从 `result.error?.info?.code` 断言（`packages/goal/tool-goal/tests/tool-goal.spec.ts:246`）。
- pre-policy 拒绝也可以带结构化身份：`PreToolDecision` `packages/core/tools/src/index.ts:608-612`
  ```ts
  | { kind: 'deny'; reason: string; info?: ToolErrorInfo }
  ```
  但 `createExecution` 里的"确定性拒绝"走的是更早的 `final-result`（`index.ts:1461-1484`），注释（`:1408-1414`）明确要求这类拒绝发生在**可扩展策略管线之前**，避免 pre-execute/approval/guard "看见甚至批准一个注定失败的调用"。

### 9.2 `E_` 前缀是否存在？

- 全仓库精确搜索 `'E_[A-Z][A-Z0-9_]*'`（`packages apps vendor`，`--include=*.ts`）**仅 1 处**，且是测试里的假错误：`packages/session-query/session-query/tests/search-helpers.spec.ts:84` `error: { name: 'Oops', code: 'E_OOPS' }`。
- 结论：**仓库没有 `E_` 错误码约定**；新增 `E_TOOL_EXEC_UNTRUSTED` 会与全部现有 code 风格不一致。

### 9.3 建议（与现有风格一致）

1. 代码值用 `TOOL_EXEC_UNTRUSTED`（备选 `UNTRUSTED_TOOL_EXECUTION` / `TOOL_PROVENANCE_REQUIRED`），**不要 `E_` 前缀**；常量可与现有 `TOOL_ABORTED` 并列导出：
   ```ts
   /** Canonical code for a tool execution that has no host-minted provenance. */
   export const TOOL_EXEC_UNTRUSTED = 'TOOL_EXEC_UNTRUSTED'
   ```
2. 错误类放在 `packages/core/tools/src/index.ts` 的 `ToolNotFoundError` / `ToolOutputError` 旁（同文件、同风格）：
   ```ts
   export class ToolExecUntrustedError extends HarnessError {
     constructor(toolName: string, detail?: string) {
       super(detail === undefined
         ? `tool "${toolName}" execution is not host-initiated`
         : `tool "${toolName}" execution is not host-initiated: ${detail}`,
         TOOL_EXEC_UNTRUSTED)
       this.name = 'ToolExecUntrustedError'
     }
   }
   ```
   并加入该包导出列表（`packages/core/tools/src/index.ts:67-108` 的 `export { ... }` 区）。
3. 拒绝位置建议与 PTC collapse 对齐：在 `createExecution`（`index.ts:1399`）完成 `visible`/`collapsed` 判定后、`tools/pre-execute`/`ask`/guards 之前返回 `final-result`：
   ```ts
   return { kind: 'final-result', exec: execution, result: toolErrorResult(new ToolExecUntrustedError(name)) }
   ```
   这样 `execute`（`:1377`）与 scheduler `prepare`（`:1497`）**两条路都覆盖**，且 policy 监听器不会看到/批准它（沿用 `:1408-1414` 的既定理由）。
4. 若坚持用 `tools/pre-execute`/`guard` 拒绝（不推荐做"可信判定"的主闸），需带 `info: { name: 'ToolExecUntrustedError', code: TOOL_EXEC_UNTRUSTED }`，否则 `toolErrorResult` 只会得到普通 Error（无 code）。
5. 文案用中文/英文均可，但 message 描述"为什么"与"如何改用合法路径"，与 `ToolNotFoundError` 的 `reachableFrom` 风格一致（`index.ts:511-527`）。

---

## 10. 对 provenance 改造的架构含义（供 lead 决策）

### 10.1 可信初始化边界（按强度排序）

| 边界 | 位置 | 能保证什么 | 不能保证什么 |
|---|---|---|---|
| B1 宿主 `prepare` 回调 | `apps/cli/src/profile-boot.ts:323`；`packages/boot/app-boot/src/index.ts:1230` | 在任何 **config-tree** 插件挂载前执行；可 provide 宿主事实、挂宿主插件、注册 `ctx.inject` 等激活回调 | Loader 已先挂载；无法直接拿到未来的 `ToolRuntime` 实例；provide 的服务对插件可读 |
| B2 `mountRootInclude` / `prepareProfilePatches` | `packages/boot/app-boot/src/index.ts:774-790`；`compatibility-preflight.ts:180` | 在所有 patch 合成后、mount 前做确定性改写（禁用不兼容行） | 只改 entry 配置，不进入运行期调用链 |
| B3 服务激活回调 | `ctx.inject(['tools'], cb)` / `internal/status` 监听 | 在 ToolRuntime 创建的那一刻拿到实例，可安装 guard/包装器（monkey-patch 可行，Service 未冻结，`service.ts:42-57`） | 同进程插件也能做同样的事（`ctx.root.plugin` 实测可用） |
| B4 进程/沙箱边界 | `ptc-runtime-node` 子进程；`cordis-host-runner` façade（`guard.ts:700-745`） | 真正的隔离：子进程/沙箱内看不到宿主 Context、拿不到原始 `ToolDefinition.execute` | 需要把工具执行搬到边界另一侧；不是纯代码开关 |

### 10.2 必须写进威胁模型的同进程绕过面

1. `ctx.tools.execute({ ... })` —— 公开 API（E3）。
2. `ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(...)` —— 公开符号（E4，`index.ts:481`）。
3. `ctx.tools.get(name, scope)?.execute(args, fakeExec)` —— 原始定义旁路（E6，`index.ts:237,1238`）。`exec` 只需带 `arguments`/`signal`/`deferContext`/`concludeTurn` 等结构，工具 body 通常不校验 `token`。
4. `ctx.agents.withInitiator(agent, ...)` —— 伪造 initiator 归因（§7.2）。
5. `ctx.agents.get(id)` / `sessions.get(id)` 拿到活 agent/session 后伪造 `exec.agent`。
6. `ctx.reflect.store` / `ctx.registry.values()` —— 枚举所有服务（含"隔离"服务）与 fiber（§6）。
7. 直接改写服务实例方法（`Service` 实例未冻结，`vendor/cordis/src/service.ts:42-57`）：`ctx.tools.execute = ...`、`ctx.tools.get = ...`。
8. `ctx.root.plugin(...)` / `ctx.plugin(...)` —— 绕过 Loader 往根上下文挂插件。

**因此**：在"插件与宿主同进程"的前提下，provenance 只能做到**归因与一致性校验**（用于审计、UI、错用拦截），**不能作为对抗恶意插件的安全边界**。若目标是对抗任意插件，唯一可靠做法是 B4（子进程/沙箱），或至少把 `tools` 服务从普通插件可 inject 的面上移走（但 §6 表明 isolate 不足以防枚举）。

### 10.3 与现有机制的衔接点（不涉及实现）

- 单点闸门：`ToolRuntime.createExecution`（`index.ts:1399`）是所有合法路径（`execute` + scheduler）的共同入口；在它之前 `visible = this.get(name, agent)`（`:1415`）已能拿到 scope。
- 可复用的"来源"信号：`exec.agent`、`exec.parent`（PTC nested 标记）、`exec.callId`、`exec.token`；其中 `token` 由 registry 每条 execution 新铸（`:1399,1913`），但 `tools/pre-execute` 监听器能看到它，见 §10.2。
- 已有"来源标注"先例：`claude-code-mods` 的 `callOrigins: Map<callId, LoadedMod>`（`host-ops.ts:96,364,377`；消费 `index.ts:382-431`）——说明"按 callId 标注来源"在仓库内可行，但它依赖调用方主动登记，不是不可伪造的。
- 已有"拒绝发生在策略管线之前"的先例：PTC collapse（`index.ts:1408-1414,1461-1484`）。
- 已有"authority 检查"先例：goal `authority.ts:48-61`（agent 活、driver 边界、open turn）。

---

## 11. 未找到 / 不确定性

| 项 | 结论 | 搜索 / 范围 |
|---|---|---|
| `ctx.plugin(ToolRuntime)` / `ctx.plugin(AgentLoop)` 字面量 | **未找到** | `grep -rn "ctx.plugin(" --include=*.ts packages apps \| grep -v test`：仅 `Loader`(`app-boot:1229`)、`FrontendStatic`(`web-app:206`)、`scope`(`core/scope:139`)、desktop 两处 |
| 插件侧对 `prepareExecution`/`createExecution`/`TOOL_RUNTIME_SCHEDULER` 的依赖 | **未找到** | `/root/.dsh/plugin-src` 全部 `lib/**`；仓库 `packages/**` 排除 tests |
| `E_` 错误码约定 | **未找到**（仅 1 处测试假码） | `grep -rn "'E_[A-Z][A-Z0-9_]*'" --include=*.ts packages apps vendor` |
| `tools.execute` 的 Host 内部直调 | **未找到**（除 E5 实验扩展与测试） | 见 §4 |
| 运行中 profile 是否挂载 `claude-code-mods` | **未挂载**（`package.json`/`cordis.patch.yml` 无引用；仓库 bundle 也无该行） | `/root/.dsh/profiles/web/*`；`packages/bundle/*/cordis.patch.yml` |
| bundle 提供的宿主运行时代码 | **无**（`export {}`） | `packages/bundle/base/src/index.ts` |
| `tools/execute` waterfall 能否被多次 `next()` 重入（潜在重复执行） | **未验证**（超出本次范围；仅记录 `ctx.waterfall` 的监听器可调用 `next()`，如 `claude-code-mods`、`timeout-policy`） | 需另行运行时验证 |

---

## 12. 证据索引（可直接复跑）

```bash
cd /tmp/harness-probe

# 1) 组合根 / prepare
grep -n "export async function boot\|await ctx.plugin(Loader)\|await prepare?.(\|await mountRootInclude" \
  packages/boot/app-boot/src/index.ts
grep -n "const ctx = await boot\|hostCtx.provide('profileContext'\|await hostCtx.plugin(PluginPackages" \
  apps/cli/src/profile-boot.ts

# 2) bundle 行与加载顺序
grep -n "id: tools\|id: agent-loop" packages/bundle/base/cordis.patch.yml
grep -n "await Promise.all(ids.map" vendor/loader/src/config/group.ts
grep -n "this.ctx.registry.plugin" vendor/loader/src/config/entry.ts
grep -n "for (const packageName of bundles)" packages/boot/app-boot/src/profile.ts

# 3) 工具执行入口
grep -rn "TOOL_RUNTIME_SCHEDULER\|prepareScheduledExecution\|createExecution\|executeToolCalls" \
  --include=*.ts packages apps | grep -v "/tests/\|\.test\."
grep -rn "ctx\.get('tools')\|registry\.execute(" --include=*.ts packages
grep -rn "tools\.execute" --include=*.ts packages apps vendor | grep -v "/tests/\|\.test\."

# 4) cordis 可见性
grep -n "public store\|public props" vendor/cordis/src/reflect.ts
grep -n "public store\|public readonly ctx" vendor/cordis/src/fiber.ts
grep -n "  values()" vendor/cordis/src/registry.ts

# 5) initiator / session
grep -n "currentInitiator()\|requireInitiator()\|withInitiator<T>\|withoutInitiator<T>" \
  packages/core/agent/src/index.ts
grep -n "readonly header: SessionHeader\|export class SessionStore\|super(ctx, 'sessions')" \
  packages/core/session/src/index.ts

# 6) 错误码
grep -rn "new HarnessError(\|super(.*'" --include=*.ts packages/core/tools packages/goal/tool-goal packages/fs/fs-sandbox
```

### 附：本次只读实测记录（cordis 4.0.5，安装包路径）

- 探针 A（隔离服务枚举）：无 inject 的 spy 插件读到 `ctx.reflect.store` 中 `secret` 的 `{token:42}`、`ctx.registry.values()` 中 provider fiber 的 `store`/`ctx`、`ctx.reflect.props` 中的 `secret`。
- 探针 B（隔离值直取）：`fiber.store['secret'].value === {token:7}`、`reflect.store` 同值、`props` 含 `secret`。
- 探针 C（框架内部可见）：`ctx.root !== undefined`、`typeof ctx.root.plugin === 'function'`、`ctx.fiber/ctx.registry/ctx.reflect/ctx.extend` 均可用。
- 以上均在 `/tmp` 下用 `node --input-type=module` 执行，未写任何文件、未触碰生产进程。

---

### 一句话结论

- **组合根：有**——`boot()` 的 `prepare`（`app-boot/src/index.ts:1188/1230`，由 `apps/cli/src/profile-boot.ts:323` 传入）是唯一能在任何配置树插件之前执行宿主代码的边界。
- **加载顺序：配置层顺序有保证，插件激活顺序没有**（`group.ts:56` 并发 + `inject` 驱动）。
- **合法工具执行入口**：E1 原生调度、E2 PTC 子调用、E3 `ToolRuntime.execute`、E4 `TOOL_RUNTIME_SCHEDULER`、E5 claude-code-mods（未挂载）；E6 原始 `ToolDefinition.execute` 是必须写进威胁模型的旁路。
- **cordis 隔离不能作私有通道**（`reflect.store` 是 public 且可枚举，已实测）。
- **错误码**：UPPER_SNAKE、无 `E_` 前缀；新码建议 `TOOL_EXEC_UNTRUSTED` + `ToolExecUntrustedError extends HarnessError`，在 `createExecution` 里以 `final-result` 拒绝（对齐 PTC collapse 先例）。
