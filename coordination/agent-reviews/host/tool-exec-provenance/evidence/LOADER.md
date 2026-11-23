# 插件加载器层「宿主核心先初始化」顺序屏障 · 只读取证

- 任务：判断能否在**插件加载器层**建立"宿主核心先初始化、普通插件后激活"的**真实顺序屏障**，给出落点与证据。
- 结论标签：**PASS（首次挂载可建立真实屏障）/ FAIL（作为运行时不变式不成立）**；证据完整度 PASS；未执行项见 §9。§5.4 给精确边界。
- 基线：
  - 源码 `/tmp/build-infra/harness`，分支 `fix/host-tool-exec-provenance`，HEAD `98f0b832`（上游 `dsh-v0.2.1-rc.2` = `687f282e`，`git describe` = `base-upstream-tree-5-g98f0b832`）。**未修改任何源码。**
  - 安装版 `/usr/local/lib/node_modules/@deepseek-ai/dsh`（`0.2.1-rc.2`，只读比对）。
  - 只读范围：`/tmp/build-infra/harness`、安装版；实验脚本与产物只在 `/tmp/recon-loader/`。**未读取 `/root/.dsh`，未启动 web，未触碰 38105 进程。**
- 运行环境说明（证据可信度）：`/tmp/node_modules` 是指向安装版 `@deepseek-ai/*` 的符号链接农场（`ls -la /tmp/node_modules/@deepseek-ai/cordis` → `.../dsh/node_modules/@deepseek-ai/cordis`）。因此实验 import 到的是**安装版运行时**。已核对工作区 HEAD 与安装版的 `vendor/{cordis,loader,group,include}/src` **逐字节相同**：
  ```
  $ for p in cordis-plugin-loader cordis-plugin-group cordis-plugin-include cordis; do diff -rq \
      /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/$p/src \
      /tmp/build-infra/harness/vendor/${p#cordis-plugin-}/src; done
  （无输出 = 无差异）
  $ grep -n "Promise.all" /usr/local/.../cordis-plugin-loader/lib/index.js
  87: await Promise.all(ids.map(async (id) => {        # 与 src 行 56 同义
  ```
  `dsh-app-boot` 安装版只有 `lib/index.js`，已核对等价实现：`lib/index.js:2401` = `return rows.length === 0 ? [] : [{ insert: rows }]`；`lib/index.js:4125` = `async function mountRootInclude(...)`。下文行号引用**工作区 src**。
- 实验目录：`/tmp/recon-loader/{e1..e8}*.mjs`、`plugins/`、`gen/`、`root/`。全部可重跑：`cd /tmp/recon-loader && node eN-*.mjs`。

---

## 1. 配置树如何 mount：完整调用链与串/并行

### 1.1 调用链（全部给行号）

| # | 位置 | 代码 | 串/并 |
|---|---|---|---|
| 1 | `packages/boot/app-boot/src/index.ts:1200` | `export async function boot(...)` | — |
| 2 | `index.ts:1207` | `const ctx = new Context()` | 同步 |
| 3 | `index.ts:1229` | `await ctx.plugin(Loader)` | **串行**（`ctx.plugin` 返回 PromiseLike，`await` 等 apply 完成；见 E8） |
| 4 | `index.ts:1230` | `await prepare?.(ctx)` | **串行**：`profile-boot.ts:323-339` 在此 `provide('profileContext')`、`provide(DSH_LAUNCH_ENVIRONMENT_KEY)`、`await hostCtx.plugin(PluginPackages, …)`、`provideCmdline(…, appReady)` |
| 5 | `index.ts:1232` | `await mountRootInclude(ctx, absoluteConfigPath, patches, …)` | **串行** |
| 6 | `index.ts:743-790` | `mountRootInclude`：`builtins.include/group`（750/768）→ `prepareProfilePatches`（774）→ `rootInclude`（779-783）→ `await ctx.loader.create(rootInclude)`（784） | 串行 |
| 7 | `vendor/loader/src/config/tree.ts:82-87` | `EntryTree.create`：`group.data.splice(...)`（84）→ `tree.write()`（85）→ `return group.create(options)`（86） | 串行 |
| 8 | `vendor/loader/src/config/group.ts:20-29` | `EntryGroup.create`：`entry.parent = this`（25）→ `await entry.update(options, true, true)`（27） | 每行串行内部 |
| 9 | `vendor/loader/src/config/entry.ts:118-157` | `Entry.update`；无 fiber 时 `await this.init()`（155） | 串行 |
| 10 | `entry.ts:210-221` | `Entry.init`：`await this._initTask`（212）→ 只 `this.fiber?.await().then(notify, notify)`（220，**不 await**） | — |
| 11 | `entry.ts:223-238` | `_init`：`await this.parent.tree.import(name, …)`（226）→ `this.fiber = this.ctx.registry.plugin(plugin, config, …).ctx.fiber`（236） | 导入串行，**注册后立即返回** |
| 12 | `vendor/cordis/src/registry.ts:316-336` | `RegistryService.plugin`：`new Fiber(...)`（330）；返回 `wrapped.then = … fiber.await()`（331-335） | — |
| 13 | `vendor/cordis/src/fiber.ts:234-319` | Fiber 构造：`uid`（235）、`ctx`（236）、`internal/plugin` 发布（302）、`_refresh()`（318） | 同步 |
| 14 | `fiber.ts:625-639` | `_setEpoch`：`this.inertia = this._reload()` + `LOADING`（632-633） | **不 await** |
| 15 | `fiber.ts:646-673` | `_reload`：`await Promise.resolve()`（650）→ `_execute`（656，运行 apply）→ 结束置 `inertia=undefined`（667） | 异步 |
| 16 | `vendor/include/src/index.ts:245-263` | `Include[Service.init]`：读文件 → `yield () => this.stop()`（261）→ **`await this.root.update(this.applyPatches(this.data!))`**（262） | 串行等"注册完" |
| 17 | `vendor/loader/src/config/group.ts:48-65` | `EntryGroup.update`：**`await Promise.all(ids.map(...))`（56）** | **全部行并发** |
| 18 | `group.ts:86-89` | `Group[Service.init]`：`await this.update(this.config)`（88） | 嵌套组同样并发 |
| 19 | `index.ts:1238` | `await ctx.get('loader')?.await()` | **串行收口** |
| 20 | `tree.ts:36-49` | `getTasks()` = `entry._initTask \|\| entry.fiber?.inertia`；`await()` 循环 `Promise.allSettled` | 串行收口 |
| 21 | `index.ts:1240` | `await auditStartupEntries(ctx, binName)`（`1153-1167`） | 串行（事后审计） |

### 1.2 串/并结论

- **串行**：`boot` 的五段（Loader → prepare → mountRootInclude → loader.await → audit），以及每个 entry 内部的 `import → registry.plugin`。
- **并发**：`EntryGroup.update` 的第 56 行 `Promise.all` 让**同一组内所有行同时创建**；各行的 `import()` 并行完成，**apply 顺序 = 模块导入完成顺序**，与配置行顺序无关。
- **关键缝隙**：`Entry.init` 在第 220 行只挂 `.then`、不 await；`EntryGroup.update` 的 `Promise.all` 解析时，行**通常连 fiber 都还没有**（E10：三行 `hasFiber:false, hasInitTask:true`；E3 里同一时刻读到的 "PENDING" 其实是 `fiber===undefined` 的默认值）。真正的"全部 apply 完成"只由第 1238 行 `loader.await()` 收口，且 `loader.await()` 不因 apply 失败而抛（E10 里三行 `FAILED` 时 await 正常返回，失败由 `auditStartupEntries` 事后判定）。
- **第一方文档旁证**：`packages/bundle/base/cordis.patch.yml:10-11` 注释原文：`Row order carries no load semantics (activation is service-availability driven); the grouping is for readers.`

### 1.3 最小实验 E1（并发 + 顺序）

`/tmp/recon-loader/e1-order.mjs`：一个 group，行顺序 `a, b, c`；`a.mjs` 顶层 `await 120ms` 再导出。

```
$ node e1-order.mjs
root fiber state at new Context(): 2 uid: 0 runtime: null
loader.create(group) resolved after ms: 22 log so far: []
groupEntry.fiber.state right after create: 1 subgroup: true
loader.await() returned after ms: 124 groupEntry.fiber.state: 2
event log: [{"at":192,"apply","who":"B","state":1},{"at":193,"apply","who":"C","state":1},{"at":311,"apply","who":"A","state":1}]
```
→ 配置顺序 a,b,c；**实际 apply 顺序 B,C,A**；三者在 apply 时 `state=1 (LOADING)`；`loader.create(group)` 解析时 **没有任何 apply 开始**。

---

## 2. entry provenance：有哪些字段可区分来源？能否伪造？

### 2.1 `EntryOptions` 只有 6 个字段，没有来源字段

`vendor/loader/src/config/entry.ts:10-23`：
```ts
export interface EntryOptions {
  id: string          // 树内稳定 id
  name: string        // 模块 specifier
  config?: any
  group?: boolean | null
  disabled?: boolean | null
  inject?: Inject | null
}
```
`Entry` 实例字段 `entry.ts:43-56`：`loader`、`ctx`、`fiber?`、`moduleNamespace`、`parent: EntryGroup`、`options`、`subgroup?`、`subtree?`、`_initTask?`。**没有 bundle/source/packageRoot/origin/phase/core 字段。**
`vendor/loader/src/index.ts` 与 `config/*.ts` 里 `bundle/source/origin` 只以局部变量出现（`entry.ts:182-184` 的 volatile `source`、`tree.ts:99-107` 的 group `source`），**没有任何来源字段或 API**。

### 2.2 来源信息在组合阶段就丢失了

- `ProfileLayer` 本来带来源：`packages/boot/app-boot/src/profile.ts:78-87`（`packageName`、`packageDir`、`patchPaths`、`patches`）；`loadProfileDirectory` 逐 bundle 产出 layers（`profile.ts:751-768`）。
- `readProfilePatches` 立即摊平：`packages/boot/app-boot/src/profile-context.ts:75-80`
  ```ts
  const patches = structuredClone([
    ...readBundlePatches(binName, context, initialProfile),   // 各 bundle 层
    ...(initialProfile?.patches ?? loadOptionalPatches(...)), // profile 用户层
    ...(loadOptionalPatches(binName, join(context.home, PROFILE_PATCH_FILENAME)) ?? []), // home 用户层
    ...context.overlays,                                      // --patch
  ])
  ```
- `prepareProfilePatches` 再把**全部层压成唯一一条 insert patch**：`compatibility-preflight.ts:180-187`
  ```ts
  const entries = applyEntryPatches([], patches, patchWarning(ctx))
  const rows = prepareProfileEntries(ctx, entries, parentURL, binName)
  return rows.length === 0 ? [] : [{ insert: rows }]
  ```
- 挂载时根 Include 的 `config.patches` 就只有这一条 `{insert: rows}`（`index.ts:774-783`；安装版 `lib/index.js:2401` 同）。**Loader 层拿到的行是匿名平铺列表。**
- 唯一保留"哪个文件贡献了哪些行"的代码是**离线 dump**：`index.ts:678-697`（`entryOrigins` 逐层快照 + 顶层下标 diff），`groupedDump`（`700-729`）只用于 `--dump-config` 注释，**不回灌挂载链路**。
- 因此 `options.bundle`、`options.source`、`subgroup`、`parent` 都**不是来源**：
  - `parent`/`subgroup` 是运行时挂载位置（`entry.ts:50`、`group.ts:12-15`）；profile 顶层行全部挂在根 Include 的 root `EntryGroup` 下，用户行与 bundle 行同父。
  - `entry.parent.tree.ctx.baseUrl` 是**配置文件所在目录**（同一个 profile 目录），不区分层。
  - `entry.options.name` 是 specifier：bundle 行多为裸包名（`packages/bundle/base/cordis.patch.yml:499-512` 的 `name: '@deepseek-ai/dsh-tools'`），用户行可能是 `file:///…/plugin-src/…`（`anchorInsertedPluginNames`，`index.ts:551-561` 只把相对/绝对路径改成 file URL），但裸包名两者都可能出现（用户包也装进 profile 的 node_modules），**名字不是可信来源**。

### 2.3 能否伪造/影响 provenance：**能**

1. **未知字段原样穿透到 `entry.options`**（E7 实测）：
   ```
   mounted entry.options: {"id":"x","name":"file:///…","core":true,"phase":1}
   unknown key visible to the plugin via entry.options: true 1
   after a later id-targeted patch, options.core = "user-says-true"
   root config file content after write:  - id: x / name: … / core: user-says-true / phase: 1
   ```
   机制：`PatchOptions` 有 `[key: string]: any`（`vendor/include/src/index.ts:130-141`）；`insert` 行按引用 push（`index.ts:93`）；id 覆盖 `target[key] = value`（`index.ts:120-123`）；`sortKeys` 保留未知键（`entry.ts:25-40`）；`preflight` 的 `structuredClone` 保留（`compatibility-preflight.ts:92`）。**用户层一条 `{id:'tools', core:false}` 就能覆盖任何带内字段（in-band field），且会被 `tree.write()` 写回配置文件。**
2. **运行时任意插件可改任意 entry 的 options**（E1 实测）：B 的 apply 里 `globalThis.__A_ENTRY.options.injectedByB = true` 成功；`ctx.registry.values()` 可枚举全部 runtime → `fiber.entry`/`fiber.ctx`。E4 更证明可借别的 fiber 的 ctx 调用服务。
3. 因此：**用在带字段（`options.core`/`phase`）做安全判定不可信**；只能作为"组合期一次性排序提示"，且判定必须发生在任何插件代码运行之前，并把结果放在插件不可写的闭包里。

---

## 3. fiber 与 plugin identity

| 属性 | 定义 | 值如何产生 | 是否对所有插件可读 |
|---|---|---|---|
| `ctx.fiber` | `fiber.ts:184-227`（`Fiber` 实例） | `new Fiber(parentCtx, …)`（`registry.ts:330`）；`ctx = parent.extend({fiber:this})`（`fiber.ts:236`） | 是 |
| `fiber.entry` | loader 的模块增强 `vendor/loader/src/index.ts:52-54` | `internal/plugin` 监听器 `index.ts:129-135`：`if (fiber.parent[Entry.key] && !fiber.entry) fiber.entry = fiber.parent[Entry.key]`；该事件在 `fiber.ts:302` 于 apply 之前同步发出 | **是**；且子孙 fiber 通过 `ctx.extend` 原型链也拿到同一 entry（`index.ts:147` 的 case 3 表明子孙 fiber 共享 entry） |
| `fiber.runtime` | `Plugin.Runtime`，`registry.ts:136-145`：`{ name?, fibers, callback, Config? }` | `registry.ts:322-328`：`name = plugin.name`（对象插件的 `apply` 会被清成 `undefined`，`324-325`）；`callback` 是 `plugin.apply` 或函数本身 | 是 |
| `runtime.name` | 同上 | 插件对象/类/函数的 `name`（**不是**包名、不是 entry id） | 是 |
| `runtime.plugin` | **不存在** | E1 实测 `keys: ['name','callback','fibers','Config']`，`plugin: undefined` | — |
| `ctx.registry` | `context.ts:31-32`、构造 `context.ts:79` | 根上下文的自身属性，子上下文原型继承 | 是 |
| `ctx.registry.values()` | `registry.ts:274-277` | 遍历 `_internal`（`Map<callback, Runtime>`）；`runtime.fibers` 是 `DisposableList<Fiber>`，`Fiber.ctx` 公开 | **是**（E1/E4 实测可遍历并拿到每个 fiber 的 `entry.options.id`、`entry.options.name`、`ctx`） |
| `ctx.loader` | `Loader` 是注册在根上的服务（`loader/src/index.ts:102`） | 程序内只有一份（`ctx.plugin(Loader)`，`app-boot:1229`） | 是（`ctx.loader.entries()/create()/resolve()/await()` 全可用） |

补充（对"身份"很关键）：
- 插件拿到的 `ctx.loader` 是 cordis 的 **traceable proxy**，不是实例本身；E9 实测 `ctx.loader === ctx.loader` 为 **false**、`[Symbol.for('cordis.original')]` 才是实例。`entry.loader` 也是带 `ctx` 阴影的代理（`entry.loader === 根实例` 为 false，但 `entries()` 等方法可用）；**`entry.parent.tree` 才是裸 Loader 实例**（E9：`entry.parent.tree === entry.loader[original]` 为 true）。做同一性判断用 `entry.parent.tree`、`entry.loader[symbols.original]` 或 `ctx.reflect.get('loader')`。
- plugin 的 `entry.loader` 功能上就是 Loader（`entry.ts:58` 构造参数；E9 实测是代理但方法齐全），所以**任何插件都能拿到整棵 entry 树并调用 `loader.create()`**。E1 实测：B 的 apply 里 `ctx.loader.create({id:'late',…})` 成功，返回时 fiber 已 ACTIVE。
- `entry.options.id` 在嵌套树里带前缀（`entry.ts:67-73`，`EntryTree.sep=':'` → `include:x`），顶层 profile 行 id 就是 YAML 里的 id。

---

## 4. 两阶段挂载的最小改法：方案 A / B

### 4.1 方案 A（改 loader：给 entry 加 `core`/`phase`，`EntryGroup.update` 两趟）

落点：
- `vendor/loader/src/config/entry.ts:10-23` 增加 `core?: boolean` / `phase?: 1|2`；
- `vendor/loader/src/config/group.ts:48-65` 把 `Promise.all(ids…)` 拆成 `await Promise.all(phase1)` → `await settle` → `await Promise.all(phase2)`。**必须有 settle**：仅 `await create()` 不够（E3：create 解析时全 PENDING）。settle 只能用 `await this.tree.await()`（`tree.ts:43-49`），不能 `fiber.await()`（PENDING fiber 会挂死或漏判，见 §5.1）。

影响面：所有 `cordis:group`/嵌套组/Include 行（包括非 profile 的嵌入方）；`vendor/loader` 是公开包（安装版 1.0.6），改它等于改第三方语义；`config` 写回会把新字段持久化（E7 已证）。
**致命缺陷**：A 的 phase 标记只能来自 `EntryOptions`，而用户 patch 层可以写同一字段（§2.3），组合期可伪造；运行时任何插件也能改（E1）。要做安全语义还得在组合器里**剥离/覆写**该字段，那就等于把判定搬回了 app-boot——A 的收益消失。
另外 A 对**已存在 entry 的 remount 无效**：`Entry.update` 走 `_patchContext` → `fiber.update()`（`entry.ts:101-109`、`fiber.ts:736-753`），`EntryGroup.update` 不 await 它（E3：`group.update` 返回瞬间 P 已 `UNLOADING`、`inertia=true`，apply 日志为空）。只有新建行才受两趟顺序约束。

### 4.2 方案 B（不改 loader：app-boot 两次 update；**推荐**）

形态（已用真实 `cordis:include` 端到端验证，E6）：
1. 组合期算出最终行 + 每行"首次插入层"来源；`phase1 = bundle 层首次插入的行`（**用最终值**，含用户层对这些行的 config 覆盖/disable），`phase2 = 其余行`（profile 用户层、home 用户层、`--patch`、telemetry patch）。
2. `mountRootInclude` 只带 `[{insert: phase1Rows}]` 挂载（`index.ts:774-784`）。
3. `await ctx.get('loader')?.await()`（已在 `boot:1238`）+ 只对 required 集合做一次 `auditStartupEntries`（`index.ts:1153-1167`）→ 核心不活就**在用户行挂载前**抛 `StartupError`。实现上需给 `auditStartupEntries` 加一个 `requiredOnly` 模式：否则 phase1 里暂时 PENDING 的可选行会在这里先 warning 一次、末尾再 warning 一次（`index.ts:1166`），诊断重复。
4. 对根 Include 执行第二次 `entry.update({config:{path, patches:[{insert: phase1Rows},{insert: phase2Rows}]}})`；phase1 行值完全一致 → 不重挂（E6/E3 实测 uid 不变）。注意 `Include` 的 `internal/update` 监听器（`include:190-201`）**不 await** `this.root.update(...)` 且不调 `next()`，所以这次 update 返回不代表 phase2 已创建；必须紧接 `await ctx.loader.await()`。
5. `await loader.await()` → 最后一次 `auditStartupEntries`（保持现有"可选插件失败只告警"语义，`index.ts:1166`）。之所以 `loader.await()` 不会漏掉刚创建的 phase2 行：`root.update` 的同步段已为每行写入 `tree.store[id]` 并赋值 `_initTask`（`group.ts:20-27`、`entry.ts:212`），`getTasks()` 因此能看到它们（E6 实测 phase2 全部 ACTIVE 后 await 才返回）。

改动文件（最小集）：
- `packages/boot/app-boot/src/index.ts`：`mountRootInclude` 增加 `deferredPatches`（或 `boot` 增加 `{deferredPatches}` 参数），`boot` 在 1238 前后插入 phase1 审计与第二次 update。
- `packages/boot/app-boot/src/compatibility-preflight.ts:180-187`：不要先摊平；新增 `composePhasedPatches(patches, layers) → {phase1, phase2}`（先按层求 origin，再各自走 `prepareProfileEntries`）。
- `packages/boot/app-boot/src/profile-context.ts:74-85` / `profile.ts:78-87`：暴露分层（`readProfilePatchLayers()`），或直接新增 origin 计算（复用 `renderConfigDump` 的逐层 diff 思路，`index.ts:667-697`）。
- `apps/cli/src/profile-boot.ts:323`：把分层结果传给 `boot`。
- **不改 DSHA 生产 profile / manifest / cordis.patch.yml**：来源由 `dsh.profile.bundles` 的层序自动判定，无需新字段。
- 测试影响：`grep -rlE "boot\(" --include=*.spec.ts --include=*.e2e.ts packages apps` 命中 53 个文件（含客户端 bootstrap 等同名调用，不全是 app-boot）；若新行为只在"提供了 deferred 层"时启用（只有 `runProfile` 提供），则绝大多数测试不受影响。必改/应补：`packages/boot/app-boot/tests/{app-boot,user-patches,config-reload,compatibility-preflight}.spec.ts`、`packages/boot/hmr/tests/{profile,reconciliation}.spec.ts`、`packages/boot/plugin-manager/tests/{manager,package-reload}.spec.ts`、`packages/bundle/web-app/tests/*`；新增一个"phase1 未 claim 前 phase2 不 apply"的断言（§7）。

### 4.3 "不改生产 profile，仅凭 entry 来自 bundle 自动判定 core"是否可行？

**可行**，但判定必须发生在组合器（app-boot）里，且用"首次插入该 id 的层"：
- 层来源现成：`Profile.layers[i].packageName/patches`（`profile.ts:78-87,751-768`）；用户三层与 overlays 在 `profile-context.ts:75-80` 已按序拼接。
- 逐层 `applyEntryPatches` 前后取 id 差集即可（与 `renderConfigDump` 同一算法，`index.ts:667-697`）；注意 `insert` 到 group 内部的行是嵌套新 id，要递归收集（`applyEntryPatches` 的 `buildMap` 递归，`include:66-73`）。
- 判定结果放在 launcher 闭包/`ProfileContext` 里（插件拿不到），**不要**写回 `EntryOptions`。
- 边界：`cordis:group`/`cordis:include` 这类树载体行本身也来自 bundle，属 phase1；`disabled` 行跳过；`telemetry` patch 属 phase2（它只改 bundle 行的 disabled，不新增行）。

---

## 5. 顺序证明：phase1 完成前没有任何用户插件 apply？

### 5.1 能保证的部分（首次挂载）：**是**

判据（可证明的精确形式）：
> 在 phase2 的第一次 `loader.create` 之前，`await ctx.loader.await()`（`tree.ts:43-49`）已返回，且 phase1 中所有 inject 已满足的 entry 都 `state === ACTIVE`、`inertia === undefined`；phase1 中 inject 未满足的 entry 处于 PENDING（且不得依赖 phase2 提供的服务，见 5.2）。

证据：
- E5（控制组 vs 处理组，同一份行、同一进程）：
```
CONTROL (single concurrent group update):
[["core-apply-start",914],["user-apply",915,"claimed=false"],["user-apply",915,"claimed=false"],["core-CLAIMED",995]]
TREATMENT (phase1 → loader.await → phase2):
[["core-apply-start",15],["core-CLAIMED",95],["phase1-settled",96,"claimed=true"],["user-apply",119,"claimed=true"],["user-apply",119,"claimed=true"]]
```
→ 现行挂载（控制组）用户插件在 915ms apply，`claimed=false`，核心 995ms 才 claim；两阶段（处理组）用户插件只在 `claimed=true` 后 apply。
- E6（**真实 `cordis:include` + 真实 include patch 语义**，最接近生产）：
```
[["core-start",47],["core-CLAIMED",107],["phase1-done",109,"claimed=true","coreUid=4"],["user-apply",133,"claimed=true"],["user-apply",133,"claimed=true"]]
core uid stable across phases: 4 ; include entry state: 2
idempotent replay keeps fibers: true  include:3,core:4,user1:5,user2:6
```
→ 第二次 update 不会重挂 phase1 行；连做两次也稳定。

### 5.2 cordis `inject` 刷新会不会破坏顺序：**会，且已有实测**

- `inject` 依赖由 `ReflectService.notify`（`reflect.ts:314-343`）驱动 `fiber._checkImpl` + `_refresh`；`_refresh`（`fiber.ts:611-623`）在依赖 epoch 变化时 `_setEpoch` → `_reload` 重跑 apply。
- E3 实测：phase1 语义的行 Q `inject:['lateSvc']`，服务由"phase2"行 P 提供：
```
group.create() resolved after ms: 24 states then: {Q:PENDING,R:PENDING,P:PENDING}
[{"at":142,"apply-R-start"},{"at":143,"apply-P-start","state":1},
 {"at":224,"apply-P-provided"},{"at":225,"apply-Q","state":1,"svc":"object"}]
```
→ **`await create()` 返回时三行都还没 apply**；Q 的 apply 在 P 之后（225ms）。所以"await 阶段完成"绝不能等同于"apply 完成"，且**依赖 phase2 服务的 phase1 行必然晚于 phase2**。
- 推论：屏障必须定义为"phase1 **settled**"，并要求 phase1 行不 inject 任何仅由 phase2 提供的服务；否则只是把倒置藏起来。

### 5.3 `internal/update` / HMR / plugin-manager 动态重载：**运行时会破坏**

- `internal/update`：`Fiber.update`（`fiber.ts:736-753`）→ `_resolveConfig` → waterfall → `restart()`；`restart()` 返回的 promise 被丢弃（`fiber.ts:751`）。E3 实测配置变更后 `group.update` 返回瞬间：`P state: UNLOADING P inertia: true`，apply 日志空；随后 `loader.await()` 才等到 P 重启、Q 因依赖重建而**再次 apply**（`[{"at":89,apply-P-provided},{"at":90,apply-Q}]`）。→ 任何"核心行改配置"的重挂都不受两趟顺序约束。
- HMR：`vendor/hmr/src/index.ts:353-359`
  ```ts
  const reload = (plugin, runtime) => {
    if (!runtime) return
    for (const oldFiber of runtime.fibers) {
      const fiber = oldFiber.parent.registry.plugin(plugin, oldFiber._config, this.getOuterStack)
      fiber.entry = oldFiber.entry
      if (fiber.entry) fiber.entry.fiber = fiber
    }
  }
  ```
  在 `partialReload`（`vendor/hmr/src/index.ts:251` 起）里直接 `registry.delete(plugin)`（`368`）+ 重注册（`363-378`），**完全绕过 entry/phase**；命中条件是文件在 watcher `root` 下且非 `/node_modules/`（`index.ts:58-66` 的 `loadDependencies` 跳过 node_modules；`isExcluded` 同）。所以：安装目录里的 bundle 核心不参与 HMR（好消息）；被 `root` 覆盖的 profile 本地核心/用户插件都参与（坏消息）。另：bundle 默认 `hmr.config.root: []`（`packages/bundle/base/cordis.patch.yml` 的 `id: hmr` 行），默认不监听 → 默认关闭。
- plugin-manager：`packages/boot/plugin-manager/src/index.ts:886-895` `reload()` → `hmr.reconcileProfile(requiredIds)` → `packages/boot/hmr/src/index.ts:925,969` → `recomposeProfile`（`app-boot:307-311`）→ 单次 `entry.update({config:{...patches}})`（`app-boot:392`）→ Include 的 `internal/update`（`include:190-201`）→ `this.root.update(...)`（**未 await，`.catch` 记日志**）→ `EntryGroup.update` 的 `Promise.all`。随后 `finally { await resume(ctx, retried) }`（`app-boot:393-395`，`resume:501-507`）把"之前被停掉的核心行"在**用户新行注册之后**重启 → 明确倒置窗口。`recomposeProfile` 自身在 397 行 `await ctx.loader.await()`，但那时用户行已注册。
- 直通通道：任何插件在任何时刻都能 `ctx.loader.create()`（E1 实测成功）或 `ctx.plugin()`（`registry.ts:316`）。这不是"绕过屏障去提前 apply 自己"，但意味着屏障只是**启动期**性质，不能当作运行时不变式。

### 5.4 结论

- **首次挂载：PASS（带前提）**——用方案 B（两次 update + `loader.await()` + phase1 required 审计）可证明"没有任何 phase2 行的 apply 早于 phase1 settle"。
- **运行时：FAIL**——`internal/update`/HMR/plugin-manager 的重挂与 `resume` 都不经过该顺序；`inject` 刷新会让 phase1 行在 phase2 之后重跑。
- **必须附带的两个前提**：(a) phase1 = 全部 bundle 层行且其 inject 不依赖 phase2；(b) 安全判定只认"启动期一次性的 composition 决策"，运行时不重读 `EntryOptions`。

---

## 6. 替代通道：更小的、可证明的顺序/身份通道

### 6.1 `prepare` 里 `await hostCtx.plugin(Core)`（**最小的"主机先行"通道，已存在先例**）

- `boot` 在 `1229` 装好 Loader、`1230` 执行 `prepare`、`1232` 才挂配置树；`profile-boot.ts:323-339` 已经这么做（`await hostCtx.plugin(PluginPackages, …)`、`provideCmdline`）。
- E8 实测 `await ctx.plugin(X)` 是**真串行屏障**：
```
$ node e8-await-plugin.mjs
["apply-start","apply-end","after await ctx.plugin; state=2 provide-visible=true"]
```
（`registry.ts:331-335` 的 `wrapped.then → fiber.await()`。）
- 适用：把"宿主权威/闸门"做成 launcher 直接 import 的插件，在 `prepare` 中 `await` 激活 → 任何配置树行（含 bundle 行）都不可能早于它。
- 限制：该插件不属于 profile 组合，不能被 profile patch/disable；若同时保留 profile 里的同名行会重复挂载。适合"新增一个闸门服务"，不适合"把 agent-loop 提前"。

### 6.2 服务方法里的 `this.ctx` 是**调用者** context（但可被冒充）

- 机制：服务经 `ctx` 代理访问时 `getTraceable(ctx, value)`（`reflect.ts:141`、`utils.ts:165-224`），tracker 的 `property='ctx'` 返回**访问者 ctx**。
- E2 实测（provider fiber uid=6，caller uid=7）：
```
[{"tag":"direct","thisCtxIsProvider":false,"ctxFiberName":"Caller","ctxUid":7},
 {"tag":"via ctx.get","ctxFiberName":"Caller","ctxUid":7},
 {"tag":"destructured","error":"Cannot read properties of undefined (reading 'ctx')"},
 {"tag":"loader.locate()","located":"prov"},
 {"tag":"loader.ctx identity","loaderCtxIsCaller":true}]
svc proxy underlying ctx is provider ctx: true
```
→ `this.ctx.fiber` / `this.ctx.fiber.uid` 能标识"这次调用是从谁的 ctx 发出的"；解构调用会丢 `this`。
- **但不可信**（E4）：
```
"foundVictimCtx": true,
"whoWhenCalledThroughVictimCtx": {"isProviderCtx":false,"fiberName":"Victim","uid":6},
"plantedInVictimCtx": {"uid":8,"parentName":"Victim"}
```
→ 任何插件可 `ctx.registry.values()` 拿到别人的 `fiber.ctx`，用 `victimCtx.svc.who()` 让服务**以为**调用者是 Victim；还能 `victimCtx.registry.plugin(...)` 把插件挂到别人的 fiber 名下。故 `this.ctx` 只能做"防误用/审计提示"，**不能做安全身份**。

### 6.3 `fiber.state` 在 boot 各阶段的值（E1/E3 实测）

| 时点 | 值 |
|---|---|
| `new Context()` 后（root fiber，uid=0，runtime=null） | **2 ACTIVE**（`fiber.ts:320-324` 直接构造为 ACTIVE；**root fiber 从不经历 LOADING→ACTIVE**） |
| `ctx.plugin(Loader)` 后 | 2 ACTIVE（同步 apply） |
| `loader.create(group)` 解析时 | 子行**尚无 fiber**（`entry.fiber===undefined`、`_initTask` 存在；E10）；group entry 1 LOADING |
| 行的 apply 内部 | 1 LOADING（`fiber.ts:632-633` 在 `_execute` 前置 LOADING） |
| apply 返回后 | 2 ACTIVE（`_reload` 末尾 `_updateState`，`fiber.ts:665-672`） |
| 配置变更后瞬间 | 5 UNLOADING（E3） |

→ `fiber.state` 可用于**测试断言**，不能用于"核心是否已初始化"的通用判据（PENDING 与"还没轮到"不可区分）。

### 6.4 `ctx.on('ready')` / `AppReady`

- cordis **没有** `'ready'` 事件（`vendor/cordis/src/events.ts:329-352` 的 `Events` 接口里没有；`vendor/hmr` 里的 `ready` 是 chokidar watcher 的事件）。
- 真正的就绪信号是 launcher 的 `AppReady` 服务：`packages/boot/cmdline/src/index.ts:45-62`（接口）、`84-88`（`provideCmdline` 在**树挂载前** provide `appReady`）、`apps/cli/src/profile-boot.ts:341-345` 在 `boot()` 返回后、`ctx.fiber.state === ACTIVE && ctx.get('loader') !== undefined` 时 `appReady.commit()`。
- 语义：**所有 apply 都结束之后**。所以它不能当"用户插件前的屏障"，只能当"全程结束"的测试锚点（HMR 也用它推迟操作，`packages/boot/hmr/src/index.ts:372-373`）。

### 6.5 其他

- `ctx.registry` / `registry.values()` 是**可达性通道**（E1/E4），不是顺序通道。
- `ctx.reflect.get(name, false)`（`reflect.ts:233`，strict=false）可读"已 provide 但尚未 ACTIVE"的服务，可做探针但同样不防伪造。

---

## 7. 证明该屏障所需的可测试断言

建议按"实现无关的行为断言"写，全部放 `/tmp` 或测试 harness，不依赖生产 profile：

1. **基础顺序（核心 claim 先于用户 apply）**
   - 探针插件作为**用户行**（`origin=user`）在 apply 第一行记录 `globalThis.__t_user = Date.now()`；核心探针在 apply 末尾 `await 80ms` 后 `globalThis.__hostClaimed = true; __t_host = Date.now()`。
   - 断言：`__t_host < __t_user` 且 `__hostClaimed === true`。控制组（单次并发 update）必须失败（E5 已给出反例）。
2. **phase2 在 phase1 settle 之前根本未被 import**
   - 用户行模块顶层写 `globalThis.__userModuleLoaded = true`；在 phase1 结束回调（launcher 侧）检查 `__userModuleLoaded === false`。比"apply 晚"更强：`Entry._init` 的 import（`entry.ts:226`）都没发生。
3. **核心失败 → 用户行永不 import**
   - phase1 放一个必失败的核心行（apply throw / import 失败），用户行是 canary；断言 `boot` 抛 `StartupError`、canary 文件不存在（`auditStartupEntries` 在 phase2 之前，`app-boot:1153-1167`）。前提：该核心行必须在 `requiredStartupEntryIds`（`app-boot:951-960`，目前是 `agent-loop/webserver/web-runtime/modules/connection/headless-runner/acp/sdk-jsonrpc-server`）内，否则按现有语义只告警（`app-boot:1166`）→ 需要把「host core」清单加入该集合或单独判定。
4. **真实安全效果（工具闸门）**
   - 用户行 apply 里：`const tools = ctx.get('tools'); assert(tools !== undefined)`；构造伪造 `ToolExecutionInput` 调 `await tools.execute(fake)`，断言返回 `E_TOOL_EXEC_UNTRUSTED`（`packages/core/tools/src/index.ts:1509-1523` 文档 + `markHostActive` 在 `packages/core/agent-loop/src/index.ts:376`）。同时断言 `ctx.get('agentLoop')` 在用户 apply 时已定义。
5. **phase1 不重挂**
   - 阶段 2 update 前后比较每个 phase1 `entry.fiber.uid` 不变、apply 计数不变（E6/E3 已证：`core:4` 稳定；幂等 replay 五个 uid 全不变）。
6. **依赖刷新不得造成"用户先于核心"**
   - phase1 核心行提供 `svc`，phase2 用户行 inject `svc`；断言用户行 apply 时 `svc` 可用。反向用例（phase1 行 inject 仅由 phase2 提供的服务）应被**禁止**：断言 launch 阶段直接报配置错误，而不是允许倒置。
7. **provenance 不可伪造**
   - 恶意用户行写 `core: true` / `phase: 1`；断言它仍被编排为 phase2（composer 丢弃未知字段）。运行时插件改 `ctx.fiber.entry.options.core` 后再触发 recompose；断言 phase 判定不变。
8. **动态重载的边界（预期失败，作为已知缺口）**
   - 用 `recomposeProfile`/plugin-manager 先 disable 一个 phase1 核心行，再加一个用户行，断言"用户行 apply 时核心必已重新 ACTIVE"。当前代码预期 **FAIL**（`resume` 在 update 之后，`app-boot:394`、`resume:501-507`）→ 该断言应标记为 xfail/known-gap，除非同时改 `recompose` 的 resume 顺序。
9. **测试脚手架建议**
   - 在 `prepare` 里注册 `ctx.on('internal/plugin', fiber => record(fiber.entry?.options.id, fiber.state, fiber.runtime?.name))`；Loader 自己的监听器先注册（`loader/src/index.ts:129`），所以探针能看到 `entry`。不要用 `internal/status` 判顺序（ACTIVE 是异步尾态）。

---

## 8. 命令与产物索引（可重跑）

| 文件 | 用途 | 关键输出 |
|---|---|---|
| `/tmp/recon-loader/e1-order.mjs` | 组内并发/顺序；registry 可达性；运行时改 options；运行时 create | apply 顺序 B,C,A；`create(group)` 22ms 时无 apply；`late` fiber ACTIVE |
| `/tmp/recon-loader/e2-service-ctx.mjs` | 服务方法内 `this.ctx` 是否调用者 | `ctxFiberName=Caller`、uid=7（provider=6）；解构调用抛错；`loader.ctx === caller` |
| `/tmp/recon-loader/e3-phase.mjs` | create 不等待 apply；inject 刷新；已存在行 remount 不 await | create 24ms 时全 PENDING；Q 在 P 之后 apply；`group.update` 返回时 P 仍 UNLOADING |
| `/tmp/recon-loader/e4-identity.mjs` | 冒充调用者；跨 fiber 挂载 | `whoWhenCalledThroughVictimCtx.fiberName=Victim`；`plantedInVictimCtx.parentName=Victim` |
| `/tmp/recon-loader/e5-barrier.mjs` | 控制组 vs 两阶段对照 | 控制组 `claimed=false`；两阶段 `claimed=true` |
| `/tmp/recon-loader/e6-include-phased.mjs` | 真实 `cordis:include` 两阶段 + 幂等 | core uid 稳定；幂等 replay 全 uid 不变 |
| `/tmp/recon-loader/e7-extra-fields.mjs` | 未知字段穿透/可覆盖/落盘 | `core:true` → 被后一条 patch 改成 `"user-says-true"` → 写入 yml |
| `/tmp/recon-loader/e8-await-plugin.mjs` | `await ctx.plugin()` 是否等 apply | `apply-start → apply-end → state=2` |
| `/tmp/recon-loader/e9-identity-shapes.mjs` | `ctx.loader`/`entry.loader` 代理与实例 | `ctx.loader===ctx.loader` false；`entry.parent.tree` 是裸实例 |
| `/tmp/recon-loader/e10-create-timing.mjs` | `create()` 解析时行的真实状态 | `hasFiber:false, hasInitTask:true`；`loader.await()` 不抛 FAILED |

## 9. 未执行 / 限制

- **NOT RUN**：DSHA 生产 profile 的真实行集合与真实 boot 顺序（硬约束禁止触碰 `/root/.dsh`；未启动 web/未触碰 38105）。§4 的"phase1 = bundle 行"判定依据源码层序，真实 profile 的 `dsh.profile.bundles` 内容未读取。
- **NOT RUN**：修改后代码的构建与全量测试（只读任务，未改源码）。
- 实验运行的是安装版运行时（`/tmp/node_modules` 链接到安装版）；已核对四个 vendor 包 src 与工作区 HEAD 逐字节一致，`dsh-app-boot` 安装版 lib 的等价行已列出。
- 本报告所有"能/不能"结论都标注了证据类型：源码行号（静态）或 E1–E8（运行时最小实验）；未把静态推断写成设备实测。
