# Host Runtime Tool Execution Provenance · 实施报告

- 任务：Host Runtime Tool Execution Provenance 安全改造（P0-1 Host 阶段）
- 执行角色：临时工程任务智能体（一次性；不注册为汐的长期角色）
- 日期：2026-11-23 (Asia/Shanghai)
- 自评状态：**PARTIAL**（实现与 T01–T14 全部通过；仍存在两条已量化的残余伪造路径，见 §9；不满足"绝对不可伪造"的 PASS 条件，PASS 由 GPT 独立验收判定）

---

## 0. 结论先行

1. **基线已确认**：上游源码仓库 `deepseek-ai/deepseek-harness`，tag `dsh-v0.2.1-rc.2`，commit `687f282e8625c6b8d11ff58211a90524be2e4317`，tree `f127f0f96a815eac4dea336a2ae0d9cd0f2aa82d`。运行中的 Host 是 npm `@deepseek-ai/dsh@0.2.1-rc.2` **加上 41 个包的 DSHA 本地补丁**（`dsh-tools` 5 处、`dsh-agent-loop` 2 处），与上游 tag 源码**不完全一致**；本任务的实现位于上游源码分支，不触碰安装目录。
2. **原报告的 Symbol 方案未被采用**。实测证明：`Symbol`、`WeakSet 标记`、`session header`、`currentInitiator`、`cordis isolate` 都不能作为信任根；并且 `ctx.tools` 是 cordis 追踪代理，给 exec 打"私有 Symbol"或给 service 加 ES `#private` 成员都会被代理调用打穿（`TypeError: Receiver must be an instance of class ToolRuntime`）。这直接推翻了最初"打标记 + 校验标记"的建议。
3. **采用的信任根**：**App 级、由工具注册表在闭包内一次性铸造的 dispatch capability**（`ToolDispatchAuthority`）。它由 `dsh-agent-loop` 在构造时首次取得，按 root context 复用；注册表把它保存在 ES `#private` 字段里，**不出现在服务实例、服务原型、raw cordis target、包导出或任何 exec/事件对象上**。公共入口 `tools.execute()` 在宿主 dispatcher 存在后**对任何调用者一律拒绝**（`E_TOOL_EXEC_UNTRUSTED`），因此"自己构造 exec / 复制 handler 里的 exec / 改 agent 后复用 / `withInitiator` 伪造"全部被挡在 policy 与 tool body 之前。
4. **正常 Host dispatch 不受影响**：`dsh-agent-loop` 通过该 authority 走原有 prepare→dispatch→finalize/finish 流水线；`packages/core/tools` 与 `packages/core/agent-loop` 共 **891 个用例全部通过**，`tsc -b` 退出码 0，catalog `--check` 通过。
5. **残余风险（未关闭）**：
   - **启动竞态（fail-closed）**：cordis 并发激活插件，`claimDispatchAuthority()` 先到先得。普通插件若抢在 loop 之前 claim，会取得 capability 对象，但 loop 构造失败、**不会注册 agent factory**，进程内不存在可借用的真实宿主 agent。是 DoS 级残余，不是身份借用。已由 T06b 实证。
   - **直接调用 handler**：`ctx.tools.get(name).execute(args, fakeExec)` 绕过注册表（`get()` 按现有契约返回活定义）。这不是 `tools.execute` 入口，但确实是"用伪造 exec 调用工具实现"的路径；关闭它需要改变 `get()` 契约（全仓 20+ 处依赖其对象身份比较），列为最小架构改造项。
   - 因此本报告**不自报 PASS**。

---

## 1. 代码位置与提交

| 项 | 值 |
|---|---|
| 代码仓库 | `ba-song/dsh-harness-host-provenance`（**private**，上游只读，无法直推） |
| 分支 | `fix/host-tool-exec-provenance` |
| 基线 ref | `refs/tags/dsh-v0.2.1-rc.2` → `687f282e8625c6b8d11ff58211a90524be2e4317`（分支父提交即该 commit） |
| 分支 HEAD | `a6e438fa`（完整 SHA 见 GitHub） |
| 提交历史 | `5b9ade93` fix(tools) → `c05bd550` fix(agent-loop) → `63b7749e` test → `7d87d659` chore(catalog) → `a6e438fa` test(provenance): strict types |
| patch | `evidence/host-tool-exec-provenance.patch`（`687f282e..HEAD` 全量 diff） |

> 说明：因为不能向 `deepseek-ai/deepseek-harness` 推送，代码提交到一个 **private** 镜像仓库；基线 tag 一并推送，`git diff 687f282e..HEAD` 即本任务全部改动，父提交与上游完全一致。

---

## 2. 基线与运行环境（实际核实）

| 项 | 值 / 证据 |
|---|---|
| 源码仓库 | `https://github.com/deepseek-ai/deepseek-harness` |
| 基线 tag | `dsh-v0.2.1-rc.2` |
| 基线 commit | `687f282e8625c6b8d11ff58211a90524be2e4317`（merge PR #6408） |
| 基线 tree | `f127f0f96a815eac4dea336a2ae0d9cd0f2aa82d` |
| 本地工作树 | 浅克隆 `--depth 1 --branch dsh-v0.2.1-rc.2`（`git rev-parse HEAD` 与 tag 一致） |
| 运行中的 Host | `/usr/local/lib/node_modules/@deepseek-ai/dsh`，version `0.2.1-rc.2`，`package.json` **无 `gitHead`**；安装目录非 git 仓库 |
| 安装包与 tag 的差异 | DSHA 补丁构建：`dsh-tools` 首行 `import "dsha-destructive-policy"`，5 处挂钩；`dsh-agent-loop` 有 `DSHA_TOOL_DISPATCH_IDENTITY_RC2_V1` / `DSHA_TOOL_FINISH_IDENTITY_RC2_V1`；整棵安装树 41 个包带 `DSHA_` 标记 |
| Node / pnpm / vitest | v24.19.0 / 11.28.5 / 4.1.11 |
| 机器 | DSHA Android proot Ubuntu，aarch64，8 核 |
| 原生前置 | `native/system/packages/linux-arm64/bin/glibc/system.node`（flock）；缺失时 agent-loop 精确挂 41 个用例，构建后 450/450 |

> 结论：**不能**把 npm 版本等同于某个 Git commit；本报告引用的所有实现与测试都在上游 tag 源码树上真实执行，安装目录全程只读比对。

---

## 3. 威胁模型与可达性事实

### 3.1 普通插件实际能触达什么（实测，`evidence/REACHABILITY.md`）

| 通道 | 可达 | 证据要点 |
|---|---|---|
| `ctx.tools.execute(input)` | 是（本改造前） | 公开方法；本改造后关闭 |
| 包导出 `TOOL_RUNTIME_SCHEDULER` | 是（本改造前） | 安装版 `dsh-tools/lib/index.js:2624,3817` 导出；`prepare` 即签发 token |
| bare import `@deepseek-ai/dsh-tools` | **是** | `/root/.dsh/node_modules` 是 DSHA 托管软链场（`.runtime-links-cache.json`），解析到 host 同一 realpath、同一模块实例、同一 symbol；生产插件早已 `import '@deepseek-ai/schemastery'`（memory-core `lib/index.js:59`） |
| `ctx.tools.get(name).execute(fakeArgs, fakeExec)` | 是 | 拿到活定义；绕过 pre-policy / guard / post-policy |
| `tools/pre-execute` / `tools/execute` / `tools/result` 事件对象 | 是 | 活的 `ToolRunContext` + 参数 + token |
| handler 的 `exec.token` | 是 | `ToolExecutionInput.parent` 仅判 `!== undefined`，任意值可绕过 PTC 折叠 |
| `ctx.agents.list()` + 真实 agent 作为 `agent` | 是 | `AgentRegistry extends Service`，`get/list/create/withInitiator` 全部公开 |
| `withInitiator` / `currentInitiator` | 是 | 文档明确 "presence is neither liveness proof nor authorization" |
| cordis 隔离服务 | **不可作私有通道** | `ReflectService.store` / `Fiber.store` 是 TS `public` 而非 ES `#private`；`ctx.reflect.store` 可枚举到 `isolate('secret')` 的实例 |

### 3.2 被否证的信任根候选

| 候选 | 否证 |
|---|---|
| 给 exec 加模块私有 `Symbol` | 插件可 import 同一 realpath 模块（同一 symbol），或直接 `Object.getOwnPropertySymbols(exec)` 复制 |
| 给 exec 加 `WeakSet` 标记 | 标记随 exec 在 handler/事件中暴露；复制对象即复制标记 |
| `session.header` 作为凭证 | 普通 JSON，`agents.list()` 可读；复制即伪造 |
| `agents.currentInitiator` | 公开 `withInitiator` 可任意设置 |
| cordis `isolate` 私有服务 | store 可枚举，隔离只是解析作用域 |
| TS `private` 方法 | 运行时就是 prototype/own property；安装版 `prepareScheduledExecution` / `createExecution` 直接可调（本改造前） |
| ES `#private` + 服务代理 | 代理调用把 `this` 换成 shadow context → brand check 抛 `TypeError`（实测）；必须把公共入口改成能解析 raw instance 的普通方法或闭包字段 |

### 3.3 实现约束

`ctx.tools` 是 cordis 追踪代理（`vendor/cordis/src/utils.ts:150-205`）。本实现的做法：

- dispatch 状态全部放在 ES `#private` 字段（`#dispatchAuthority`、`#authorizedExecutions`、`#dispatchedExecutions`、`#settledExecutions`、`#scheduler`）；
- 公共入口 `execute` / `claimDispatchAuthority` / `requirePtcTransport` 保持**普通原型方法**（因此 catalog 与文档仍能描述它们），方法内用 `rawService(this)` 解析代理背后的真实实例，再访问 `#` 状态；
- 内部流水线方法（`#prepareScheduledExecution`、`#dispatchScheduledExecution`、`#finalizeScheduledExecution`、`#finishScheduledExecution`、`#dispatchToolBody`、`#createExecution`）全部 ES `#private`：不在原型、raw target 或包命名空间上。

---

## 4. 信任根设计

### 4.1 结构

```
ToolRuntime (dsh-tools)                       AgentLoop (dsh-agent-loop)
┌──────────────────────────────────┐          ┌─────────────────────────────────┐
│ #dispatchAuthority (ES private)  │◄─────────│ claimDispatchAuthority()        │
│ #authorizedExecutions (WeakSet)  │  one-shot│   ↑ 仅当 hostDispatchers 无记录  │
│ #dispatchedExecutions (WeakSet)  │          │ hostDispatchers: WeakMap<root,   │
│ #settledExecutions (WeakSet)     │          │   {registry, authority}>         │
│ #scheduler (ES private)          │          │ (module-private, 未导出)          │
│ async execute(input) {...}       │          └─────────────────────────────────┘
│ claimDispatchAuthority() {...}   │                       │
└──────────────────────────────────┘                       │ prepare/dispatch/
          ▲                                                │ finalize/finish
          │ 公共入口：无 authority 时 legacy 可用；            │
          │ 一旦 host dispatcher 存在 → 一律拒绝               │
     ctx.tools.execute(input)                                 ▼
                                                     tool-calls.ts (executeToolCalls)
```

### 4.2 签发 / 传递 / 验证 / 失效

| 阶段 | 机制 |
|---|---|
| 签发 | `ToolRuntime.claimDispatchAuthority()` 在闭包内创建普通对象，方法闭包捕获真实 registry；同一 registry **只能签发一次**，第二次抛 `ToolExecutionUntrustedError` |
| 传递 | `dsh-agent-loop` 构造时读 `hostDispatchers.get(ctx.root)`；无记录才 claim，并记录 `{registry: rawTools, authority}`；loop reload（同 fiber 重跑或 drain 后新 fiber）复用；tool registry 独立重启（raw 实例变化）才重新 claim |
| 验证 | ① 公共 `execute`：对象形状 → registry-minted 标记（`token`/`deferContext`/`concludeTurn`）→ 是否存在 host dispatcher，任一不满足即 `E_TOOL_EXEC_UNTRUSTED` / `E_TOOL_EXEC_INVALID`，不进入 policy/body；② authority 内部：prepare 写入 `#authorizedExecutions`，dispatch 一次性消费，`#settledExecutions` 终态；③ `lockExecutionIdentity()` 把 `agent/name/token/callId/rootCallId/arguments/...` 设为 non-writable，`signal` 保留可写以支持 wrapper 替换 |
| 失效 | authority 与 WeakSet 全部是进程内内存；Host 重启 = 新 `Context`/新 registry → 无记录；旧 exec 只是普通对象，`execute` 拒绝。无持久化、无签名密钥、无跨进程令牌 |

### 4.3 为什么比"Symbol 标记"强（以及边界）

- 签发能力**不是数据**（不可复制的 symbol/header/字段），而是**对象身份 + 闭包**：插件即使 import 同一模块，也拿不到另一个实例的 `#dispatchAuthority`；`new ToolRuntime()` 得到的是它自己的、未被宿主信任的 registry。
- 公共入口在宿主存在后**完全关闭**，因此不存在"合法 exec 被复制后重放"的输入面；handler/事件里的 `ToolRunContext` 只会被识别为 registry-minted，直接拒绝。
- **边界**：前提是"插件通过正常插件面（ctx 服务、包导出、事件、对象）访问"。插件若枚举 `ctx.registry` / `ctx.reflect.store`、monkey-patch 原型、或抢在 loop 之前 claim，则进入 §9 的残余风险，需要架构级改造才能根治。

---

## 5. 变更清单

| 文件 | 改动目的 |
|---|---|
| `packages/core/tools/src/index.ts` | 新增 `ToolDispatchAuthority`、`TOOL_EXEC_UNTRUSTED`/`TOOL_EXEC_INVALID`、`ToolExecutionUntrustedError`；删除 `TOOL_RUNTIME_SCHEDULER` 导出与实例字段；流水线方法改 ES `#private`；公共入口保持方法形状并解析 raw instance；新增一次性 prepare/dispatch/settle 校验与 `lockExecutionIdentity` |
| `packages/core/tools/src/ptc.ts` | 不再从 `index.ts` 导入调度 symbol；`run_code` nested dispatch 改为接收 registry 私有 `scheduler` 构造参数 |
| `packages/core/agent-loop/src/internal.ts`（新） | 模块私有 `hostDispatchers: WeakMap<root, {registry, authority}>`，不导出到包命名空间 |
| `packages/core/agent-loop/src/index.ts` | 构造时按 root 复用/首次 claim authority（reload 安全、registry 重启可重签） |
| `packages/core/agent-loop/src/tool-calls.ts` | 用 authority 替换 `ctx.tools[TOOL_RUNTIME_SCHEDULER]`；缺失即视为非 loop 调用并抛错 |
| `packages/core/tools/tests/exec-provenance.spec.ts`（新） | T01–T14 + T06b 负向/正向安全用例（460 行） |
| `packages/core/tools/tests/tools.spec.ts` | approval 用例改走 authority（host 组合下公共入口已关闭） |
| `packages/core/agent-loop/tests/{tool-calls,resume,agent-initiator,resource-lifecycle}.spec.ts` | 调度器/execute 改走包内 authority；不改变被测语义 |
| `packages/extensions/tool-cordis/src/api-catalog.ts`、`docs/subsystems/tools.{md,zh.md}`、`scripts/gen-cordis-catalog.ts` | 重新生成 catalog（移除 symbol 字段、加入 `claimDispatchAuthority`、`ToolDispatchAuthority` 类型链接） |

未修改：Memory、Persona、Autonomy、Channel Bridge、Android、GUI、任何插件配置、生产 DB、设备状态。

---

## 6. 测试证据

环境：Node v24.19.0 / pnpm 11.28.5 / vitest 4.1.11；命令与完整日志见 `logs/`：

```bash
cd <harness-checkout>
NODE_OPTIONS=--max-old-space-size=3072 ./node_modules/.bin/vitest run \
  packages/core/tools/tests packages/core/agent-loop/tests --maxWorkers=2
```

| 套件 | 基线（改造前） | 改造后 |
|---|---|---|
| `packages/core/tools/tests`（13 文件，含新增） | 426 passed | **441 passed**（426 + 15 新增 provenance） |
| `packages/core/agent-loop/tests`（25 文件） | 450 passed | **450 passed** |
| 合计 | 876 | **891 passed / 0 failed**，38 files，exit 0，105.6s |

其它检查：

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型（目标包） | `tsc -b packages/core/tools packages/core/agent-loop` | exit 0（`logs/tsc.log`） |
| 类型（全 Host 聚合） | `tsc -b tsconfig.host.json` | exit 0（`logs/full-typecheck.log`；pre-push hook 同一命令，首次失败根因是新增测试用例的 exactOptionalPropertyTypes，已修复） |
| Catalog 生成 | `tsx scripts/gen-cordis-catalog.ts` | 125 artifacts，3 written（`logs/catalog-gen.log`） |
| Catalog 校验 | `tsx scripts/gen-cordis-catalog.ts --check` | "125 generated file(s)/region(s) are up to date"，exit 0（`logs/catalog-verify.log`） |

### 6.1 T01–T14 对照

| # | 场景 | 断言 | 结果 |
|---|---|---|---|
| T01 | 插件自建 exec（含/不含 agent） | `E_TOOL_EXEC_UNTRUSTED`，body 未调用 | PASS |
| T02 | 伪造 exec + `ctx.agents.list()` 真 owner agent | 拒绝，body 未调用 | PASS |
| T03 | 从 handler 复制真 exec（原对象 / spread / JSON 往返） | 全部拒绝，body 只执行 1 次 | PASS |
| T04 | 修改合法 exec 的 agent/name 后复用 | 赋值抛 `TypeError`；重写副本被拒 | PASS |
| T05 | `withInitiator(realAgent, () => tools.execute(forged))` | 拒绝 | PASS |
| T06 | 再次 `claimDispatchAuthority()` | 抛 "already been claimed"，拿不到第二个 capability | PASS |
| T06b | 抢在 loop 前 claim | loop 装载失败（`E_TOOL_EXEC_UNTRUSTED`），`agents.create` 报 "no agent factory"（fail-closed） | PASS（并记录残余风险） |
| T07 | 命名空间/服务代理/raw target/symbol 枚举 | 无 scheduler、无 `prepare*/create*/dispatch*`、无 `dispatchAuthority`/`scheduler` | PASS |
| T08 | 子会话借用父会话 exec | 拒绝 | PASS |
| T09 | 跨 session 复用 exec | 拒绝 | PASS |
| T10 | Host 正常 dispatch（MockAdapter → tool/result） | 成功，agent/name/结果正确 | PASS |
| T11 | 两 agent 并发 dispatch | 2 次执行各自携带自己的 agent；各自 session 各 1 条 tool/result | PASS |
| T12 | 已 dispatch / 已 settle 的 exec 重放 | `E_TOOL_EXEC_UNTRUSTED` / "already settled"，body 不再执行 | PASS |
| T13 | `null` / `{}` / 空 name / 非 signal / 非对象 agent | 无 host 时 `E_TOOL_EXEC_INVALID`；有 host 时 `E_TOOL_EXEC_UNTRUSTED`（非对象先判 invalid） | PASS |
| T14 | 新 Context（模拟重启）接受旧 exec | 拒绝；新 authority 与旧的不同；新 host 自身 dispatch 正常 | PASS |

---

## 7. 兼容性调查

合法的工具执行入口（全仓搜索，排除 tests）：

| 入口 | 是否合法 Host 路径 | 处理 |
|---|---|---|
| `dsh-agent-loop/src/tool-calls.ts` `executeToolCalls` | 是（唯一 model-driven dispatch） | 改为 authority，正常 |
| `dsh-tools/src/ptc.ts` nested dispatch | 是（`run_code` 包内） | 改为包内 scheduler 参数，正常 |
| `ToolRuntime.execute` | 改造前无生产调用（仅测试） | 宿主存在时关闭；agent 绑定调用必须走 authority |
| `claude-code-mods/src/host-ops.ts` `$.tool.call` | DSHA profile 未挂载的 experimental 包 | 语义上是"插件代为调用工具"，本改造后会被拒绝；需要未来改为宿主中介能力。已记录 |
| `ctx.tools.get(name).execute(...)` | **不是**合法入口（旁路） | 未关闭，列入 §9 |

内部/测试影响：

- `packages/core/tools/tests` 13 文件、`packages/core/agent-loop/tests` 25 文件全绿；
- 其它 package 的测试若在"组合了 AgentLoop 的 ctx"里直接调 `ctx.tools.execute`，需要同样迁移（本次未运行那些包，属于已知迁移面）；
- 安装版 DSHA 的 7 处本地补丁需要在本分支上 rebase 后才能部署（本任务未部署）。

---

## 8. 生命周期、并发与源码证据

- **单次执行**：prepare 记录 → dispatch 一次性消费 → finalize/finish 终态；重复 dispatch/settle 直接拒绝。
- **复制/转交**：`ToolRunContext` 一旦作为输入传入（`token` own property）即拒；`agent/name/callId/...` non-writable。
- **父子/跨 session**：authority 是 app 级而非 agent 级；但任何"借用"都要求 registry-minted exec 作为输入，而该输入一律被拒，因此跨 agent/session 的 exec 复用不可达。
- **取消**：沿用原 `AbortSignal` 融合逻辑；authority 路径不改变取消语义（tool-calls 24 个用例通过）。
- **并发**：authority 无共享可变游标；每次 prepare 生成独立 exec，WeakSet 一次性状态按对象区分（T11）。
- **重启**：全部状态在内存；新 Context/registry 无记录（T14）。
- **reload**：cordis 会在同一 fiber 上重跑构造函数；authority 记录在 root 上复用，不重复 claim（`config-session-id` 4 个 reload 用例通过）。

插件无法取得签发能力的源码证据：

1. `grep -rn "TOOL_RUNTIME_SCHEDULER" packages/core/tools/src packages/core/agent-loop/src` → **无结果**（导出与字段已删除）。
2. dispatch 状态全部 ES `#private`：`#dispatchAuthority`、`#authorizedExecutions`、`#dispatchedExecutions`、`#settledExecutions`、`#scheduler`；不是 own property、不可枚举、raw target 上也取不到。
3. `#prepareScheduledExecution` / `#dispatchScheduledExecution` / `#finalizeScheduledExecution` / `#finishScheduledExecution` / `#dispatchToolBody` / `#createExecution` 均为 ES `#private`（T07 断言 raw target 与代理上都不存在）。
4. `TOOL_RUNTIME_SCHEDULER` 不再出现在 `api-catalog.ts`；命名空间断言 `'TOOL_RUNTIME_SCHEDULER' in namespace === false`。
5. `hostDispatchers` 只在 `dsh-agent-loop/src/internal.ts` 定义，`index.ts` 不 re-export；`package.json` 的 `files` 只发布 `lib/`，安装态无法 import `src/internal.ts`；构建产物把 `internal.ts` 内联进 `lib/index.js` 的模块作用域，不导出。
6. `claimDispatchAuthority()` 是唯一签发入口且一次性；T06 断言第二次抛错。

---

## 9. 未解决 / 残余风险（必须由 GPT 与 Owner 决策）

1. **启动竞态（fail-closed）**：cordis 并发激活插件（`vendor/loader/src/config/group.ts:56` 用 `Promise.all`，`app-boot:862` 明说 concurrent），任何 callable 的 `claimDispatchAuthority()` 都是"先到先得"。普通插件若抢在 loop 之前调用，会取得 authority，但 loop 装载失败 → `agents.setFactory` 不会注册 → 进程内没有真实宿主 agent 可供借用（T06b）。这是 **DoS** 级残余，不是身份借用。根治需要**两阶段挂载**（core bundle 全部 await 完成后才挂用户插件）或子进程隔离。
2. **直接 handler 调用**：`ctx.tools.get(name).execute(args, fakeExec)` 绕过注册表。关闭它需要改变 `get()` 契约（不再返回活定义），影响全仓 20+ 处"对象身份比较"的调用点；或给 `register()` 包装 handler 并要求"exec 处于 registry 活跃 dispatch 中 + args 与 exec.arguments 同一对象"。本任务未实施，建议作为下一个 Host 安全项。
3. **进程内同权限**：插件可 import 宿主模块、写宿主文件、monkey-patch 原型。任何"进程内信任根"都无法对抗"插件已获得宿主代码执行权"这一前提；真正的边界只能是子进程/沙箱（`cordis-host-runner` 已存在类似机制）。
4. **Session 信任边界**：`agents.create` / `session.header` / `cwd` 的身份问题属于 Memory 阶段（原 REVIEW 报告 5.1/5.2），本任务未涉及。
5. **DSHA 本地补丁**：安装版的 7 处补丁（含 destructive policy）需要 rebase；本任务的代码不能直接替换生产安装包。

---

## 10. 边界声明

- 未修改 Memory 的 `dyMemory.carryover` 或任何业务接口；未修改 Memory 数据/Schema/DB/记忆策略/自动注入。
- 未修改 Persona、Autonomy、Channel Bridge、Android、GUI 的业务行为。
- 未修改插件权限配置、生产配置、真实设备状态。
- 未合并到任何默认分支、未发布 npm、未部署、未升级运行 Host、未重启汐。
- 未做生产数据库迁移或写入；未执行真实 QQ 操作。
- 所有测试运行于 `/tmp` 下的独立浅克隆；安装目录 `/usr/local/lib/node_modules/@deepseek-ai/dsh` 与 `/root/.dsh` 全程只读。

---

## 11. 复现

```bash
git clone --depth 1 --branch dsh-v0.2.1-rc.2 https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout -b fix/host-tool-exec-provenance
pnpm install --frozen-lockfile
tsx native/system/scripts/build.ts --host-addon-only      # flock 原生模块
NODE_OPTIONS=--max-old-space-size=3072 ./node_modules/.bin/vitest run \
  packages/core/tools/tests packages/core/agent-loop/tests --maxWorkers=2
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc -b \
  packages/core/tools packages/core/agent-loop
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsx scripts/gen-cordis-catalog.ts --check
```

## 12. 附件

- `evidence/host-tool-exec-provenance.patch`：`687f282e..a6e438fa` 全量 diff
- `evidence/REACHABILITY.md`：插件可达性/伪造通道实测（499 行，含命令、退出码、原始输出）
- `evidence/COMPOSITION.md`：组合根、加载顺序、合法执行入口、cordis 隔离调查（517 行）
- `evidence/BUILD-NOTES.md`：构建/测试环境、安装包 vs tag 差异、41 个基线失败根因（283 行）
- `logs/tests-tools-agentloop.log`：891/891
- `logs/tsc.log`：exit 0
- `logs/catalog-gen.log` / `logs/catalog-verify.log`：生成与校验
- `logs/diffstat.txt`：改动统计
- `logs/full-typecheck.log`：全 Host 聚合 typecheck（exit 0）
