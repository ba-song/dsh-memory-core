# Host Tool Dispatch Authority Claim Boundary & Handler Bypass Closure · 修复报告

- 任务：Host Runtime 安全改造第二阶段（P0-1 Host 修复）
- 执行角色：临时 Host Runtime Security Engineer（一次性；不注册为汐的长期角色）
- 日期：2026-11-23 (Asia/Shanghai)
- 自评状态：**PASS**（本轮两个阻断项已关闭；残余风险与威胁模型限制见 §9；Host 阶段最终验收由 GPT 独立判定）

---

## 0. 结论先行

1. **问题 A（签发边界）已从根上移除，而不是"加校验"**：本分支删除了公开的 `claimDispatchAuthority()`，也**不存在任何全局 dispatch capability**。宿主每一轮工具调用由**该轮真实 Agent 自己铸造的一次性 batch proof** 换取 `beginToolBatch()` 返回的**单次 batch**；proof 的铸造函数是 `dsh-agent-loop` 模块闭包里的 `mintToolBatchProof`，既不在 Agent 实例上、也不在其原型上、也不从包命名空间导出。普通插件拿不到 proof，因此拿不到 batch。
2. **问题 B（handler 旁路）已在运行时关闭**：`get()` 现在返回**冻结、无 `execute` 的 `ToolDescriptor`**；注册表内部（layers / view / run_code transport）**只存 descriptor**，live handler 只存在于模块私有 `WeakMap` 的反向映射里；`register()` 拒绝没有 `execute` 的定义。插件从 `get()`、raw target、`layers`、`view()`、事件对象或复制对象都拿不到真实 handler。
3. **验证**：`tools` + `agent-loop` 核心 895/895；扩展兼容面（fs / mcp / schedule / bash / pwsh / subagent / fs-search / skill / timeout-policy）**1435/1435**；全 Host 聚合 `tsc -b tsconfig.host.json` exit 0；catalog 生成/校验通过。
4. **不依赖"先到先得"**：不存在可抢先的 issuance 入口；`markHostActive()` 是**只写标记**（插件调用它只会关闭 legacy 入口，不能获得任何能力）。`beginToolBatch` 需要 `agents.get(agent.id) === agent` 且该 agent 自己验证 proof。
5. **边界**：插件若已获得宿主代码执行权（monkey-patch 原型、写宿主文件、在源码树中 import 未发布的 `src/*`），则超出进程内信任模型；`agents.register()` 伪造 Agent 属 Memory 阶段的 session 信任边界（原 REVIEW 5.2）。见 §9。

---

## 1. 基线与提交

| 项 | 值 |
|---|---|
| 上一轮基线 | `98f0b832e8a09c277ee4d9f4b36a3706780f786d`（`fix/host-tool-exec-provenance`） |
| 源码上游 | tag `dsh-v0.2.1-rc.2` = `687f282e8625c6b8d11ff58211a90524be2e4317`，tree `f127f0f96a815eac4dea336a2ae0d9cd0f2aa82d` |
| 代码仓库 | `ba-song/dsh-harness-host-provenance`（private 镜像；上游无推送权限） |
| 分支 | `fix/host-tool-exec-provenance`（从 `98f0b832` 续做） |
| 本轮 HEAD | `dcc32a132ad16a62f85b27cbbf39fae1bbe51e8c` |
| 本轮提交 | `5c1e8f7a` fix(tools) → `ba6eb48e` fix(agent-loop) → `3267be9a` fix(compat) → `20bc0d0b` test → `dcc32a13` chore(catalog) |
| 基线等价性 | 镜像基线 tag `base-upstream-tree` = `2b96ab8b…`，tree 与上游只差 `.github/**`（token 无 workflow scope） |

---

## 2. 问题 A：签发边界

### 2.1 原实现的缺陷

上一轮 `ToolRuntime.claimDispatchAuthority()` 是**公开实例方法**，先到先得；T06b 只能证明"抢先 claim 会让 AgentLoop 启动失败"，不能证明"抢到 authority 的插件不能执行工具"。GPT 验收正确指出：这仍是可被插件触发的签发入口。

### 2.2 新机制（无全局 capability）

```
AgentLoop 的一轮 turn（tool-calls.ts）
  ├─ agent = ctx.agents.requireInitiator()            // 该轮真实 Agent
  ├─ proof = mintToolBatchProof(agent, toolCalls)     // 模块闭包 WeakMap，插件不可达
  └─ batch = ctx.tools.beginToolBatch(agent, proof, toolCalls)
                 │
                 ├─ 校验 agents.get(agent.id) === agent      // 必须是活着的注册 Agent
                 ├─ 校验 agent.verifyToolBatch(proof, calls)  // 该 Agent 消费自己铸的 proof
                 └─ 返回单次 batch（prepare/dispatch/finalize/finish）
```

- **签发**：`mintToolBatchProof(agent, calls)` 在 `dsh-agent-loop/src/internal.ts` 的**模块闭包**里，未从 `index.ts` 导出；发布包只含 `lib/`，安装态无法 import `src/internal.ts`。proof 是 `Object.freeze({ calls })`，绑定该轮**确切的 calls 数组**。
- **验证**：`ReactLoopAgent.verifyToolBatch()` 是公开的**只消费**方法（`dsh-tools` 跨包调用它），proof 一经验证即从闭包 WeakSet 删除；公开方法既不能创建 proof，也不能泄露 proof。
- **batch 能力**：`beginToolBatch` 返回的对象只交给调用者（loop 的局部变量）；`prepare` 只接受**本 batch 的 agent + 该轮 calls 中的 callId/name**，每个 callId 最多一次；`dispatch/finalize/finish` 沿用上一轮的一次性状态。
- **legacy 入口**：`markHostActive()` 由 loop 构造时调用，**只写布尔标记**；之后公共 `execute` 对所有调用者返回 `E_TOOL_EXEC_UNTRUSTED`。插件提前调用它只会关闭入口（DoS），不能获得任何能力。
- **无先到先得**：没有全局对象可抢；proof 只能由 loop 在真实 turn 中铸。

### 2.3 插件可达面逐项

| 通道 | 结果 | 证据 |
|---|---|---|
| `ctx.tools.claimDispatchAuthority` | **不存在**（原型/实例/raw target 都是 undefined） | T06 |
| `ctx.tools.beginToolBatch(realAgent, 伪造/缺失 proof)` | 抛 `ToolExecutionUntrustedError`（proof 校验失败） | T06 |
| `ctx.tools.markHostActive()` | 返回 void，仅关闭 legacy 入口 | T06b |
| `ctx.registry` / `ctx.reflect.store` | 只能拿到服务实例；无 proof/batch/全局 authority | T07 |
| Agent 实例/原型 symbol 枚举 | 无铸造方法；`verifyToolBatch` 只消费 | T06 |
| 包命名空间 | 无 `claimDispatchAuthority`、无 `mintToolBatchProof` | T07 |
| 事件对象 | 只有 `ToolRunContext`/result，无 proof/batch/handler | T18 |

---

## 3. 问题 B：handler 旁路

### 3.1 原实现的缺陷

`get()` 返回**注册时的原始 `ToolDefinition` 引用**（含 `execute`），`layers`/`view()`/`resolveExecution()` 是 TS-private 但运行时可达；PTC 下 `get('run_code').execute` 还是嵌套 dispatch 网关。

### 3.2 新机制（运行时对象分离）

- **`ToolDescriptor = Omit<ToolDefinition, 'execute'>`**，`get()` 返回按注册记忆化的**冻结** view：
  - 无 `execute` 属性；尝试 `view.execute = ...` 抛 `TypeError`；
  - 保留 accessor（`run_code` 的懒 `description/parameters`），避免冻结成旧 schema；
  - `parameters` 与 `output.schema` 是**深拷贝 + 深冻结**，篡改 view 不会影响校验用声明；
  - 保留 symbol 标记（如 subagent 的 `adjacentAgentSendMessageTool`）与纯展示/变换回调。
- **layers 只存 descriptor**：`ToolLayer.tools` / `ToolView.visible` 都是 `ToolDescriptor`；`#rawGet()` 通过**模块私有** `WeakMap<ToolDescriptor, ToolDefinition>` 反查 live 定义。即使插件拿到 raw target 上的 `layers` / `view()`，得到的也只有 descriptor。
- **`register()` 校验 handler**：没有 `execute` 的定义直接 `TypeError`，不能再注册"半定义"。
- **run_code transport**：内部保留 `#ptcTransport: ToolDescriptor` 与模块私有反向映射；raw 定义不可达。
- **`isVisible(definition, scope)`**：替代"`get(name,scope) === registered`"的对象身份比较（descriptor 与 raw 身份不同），语义是"这个**确切注册**在该 scope 可见"。
- **`resolveExecution` 改为 ES `#private`**：raw target 上不再可达。

### 3.3 全仓 `get()` 调用点兼容

| 位置 | 原用途 | 处理 |
|---|---|---|
| `fs/tool-fs-search/src/direct-call.ts:26` | `get(...) === tool` 身份比较 | 改为 `tools.isVisible(tool, exec.agent)` |
| `skill/tool-skill/src/index.ts:222` | `=== skillTool` | `isVisible(skillTool, agent)` |
| `subagent/tool-subagent/src/index.ts:374/387` | 与原始 definition 比较 | `isVisible(...)` |
| `subagent/subagent/src/internal.ts:32` | 读取 symbol 标记 | 参数放宽为 `object`；descriptor 保留 symbol |
| `browser-use-runtime/src/mcp.ts:143` | 两次 `get()` 结果比较 | descriptor 按注册记忆化，语义不变 |
| `guard/timeout-policy`、`fs/*` 提示、`tool-skill`、`subagent` 等 | 只读存在性/`timeoutMs`/description/parameters/output/presenters | descriptor 保留这些字段 |
| 测试：schedule / persistent bash / pwsh / mcp-client / fs / depth-context | 直接调用 body、spy handler、重注册 | 改为注册时捕获 raw 定义 / 事件计数 / 元数据 stub（见提交） |

调查明细见 `evidence/GET-SURVEY.md`（499 行，含 HEAD 行号与逐文件改法）。

---

## 4. 可达面复核

| 面 | 结论 |
|---|---|
| `ctx.tools`（追踪代理） | 无全局签发入口；`get` 返回 descriptor；`beginToolBatch` 需 proof |
| raw target `ctx.tools[Symbol.for('cordis.original')]` | `#dispatchAuthority`/`#scheduler`/`#rawGet`/`#resolveExecution` 均不可达；`layers`/`view()` 只含 descriptor；`ptcTransport` 已 `#`；无 `claimDispatchAuthority` |
| `ctx.registry` / `ctx.reflect.store` | 可枚举服务实例，但无可签发对象/无 handler |
| 包导出 / `lib/types/*` | 只导出 index 的公开面；`lib/types/index.js` 是**另一模块实例**，其 layers 同样只含 descriptor；`src/internal.ts` 已删除 |
| 事件对象 | `tools/pre-execute`/`execute`/`result` 只给 exec/result；无 handler/proof |
| Agent 实例/原型 | 无铸造方法；`verifyToolBatch` 只消费 |
| `run_code` bindings | 只给 schema 闭包，嵌套 dispatch 走包内 scheduler |

---

## 5. 测试证据

环境：Node v24.19.0 / pnpm 11.28.5 / vitest 4.1.11；日志见 `logs/`。

| 套件 | 用例 | 结果 |
|---|---|---|
| `packages/core/tools/tests` + `packages/core/agent-loop/tests` | 895 | 全过（38 files） |
| 扩展兼容面：fs / mcp / schedule / bash / pwsh / subagent / fs-search / skill / timeout-policy | 1435（含核心） | 全过（48 files） |
| 全 Host typecheck `tsc -b tsconfig.host.json` | — | exit 0 |
| `gen-cordis-catalog --check` | — | 125 artifacts up to date |

### 5.1 原 T01–T14 / T06b

| # | 场景 | 结果 |
|---|---|---|
| T01 | 插件自建 exec（含/不含 agent） | 拒绝（host active） |
| T02 | 伪造 exec + 真实 owner agent | 拒绝 |
| T03 | 复制 handler 真 exec / spread / JSON 往返 | 拒绝 |
| T04 | 修改合法 exec 的 agent/name | 赋值抛 TypeError；副本拒绝 |
| T05 | `withInitiator` 伪造 | 拒绝 |
| T06 | **重写**：无签发入口；伪造/缺失 proof 无法换 batch；Agent 原型无 symbol 铸造方法 | 通过 |
| T06b | **重写**：`markHostActive` 只写、无竞态可抢；之后 loop 正常初始化 | 通过 |
| T07 | 命名空间/代理/raw target/layers.view/symbol 枚举 | 无 handler/无调度面；`layers` view 值无 execute；无 handler 的定义注册被拒 |
| T08/T09 | 借用/跨 session | 拒绝 |
| T10/T11 | 正常 dispatch / 并发身份隔离 | 通过 |
| T12 | 已 dispatch / 已 settle / 重复 callId | 拒绝 |
| T13 | 结构伪造输入 | 拒绝 |
| T14 | 重启后旧 exec | 拒绝；新 host 无签发入口 |

### 5.2 新增（handler 旁路）

| # | 场景 | 结果 |
|---|---|---|
| T15 | `get()` 冻结、无 execute、稳定身份、raw target 同 view、无 raw 反向引用 | 通过 |
| T16 | spread / assign / JSON 复制都拿不到 handler | 通过 |
| T17 | `isVisible` 精确注册身份语义 | 通过 |
| T18 | 事件 payload 无 handler | 通过 |
| T19（并入 T07） | `layers.view()` 只含 descriptor；无 handler 定义注册被拒 | 通过 |

---

## 6. 兼容性与调用路径

- 唯一 Host model-driven 入口 `executeToolCalls` 走 proof→batch，正常；
- `run_code` 嵌套 dispatch 走包内 `#scheduler`，正常；
- CLI/API/子代理创建 Agent 后的 turn 均走同一路径；
- 上一轮 T01–T14 保留并适配新机制；
- 变更只涉及 `packages/core/{tools,agent-loop}` 与三处 descriptor 兼容调用点 + 测试；未改 Memory/Persona/Autonomy/Channel Bridge/Android/GUI。

---

## 7. 延期/迁移说明

- `claude-code-mods` 的 `$.tool.call` 仍会在宿主中用 `registry.execute`（DSHA profile 未挂载）；它现在会被 host-active 拒绝。这是"插件代调用工具"的语义，需要未来改为宿主中介能力，已记录。
- 其它包若在组合了 AgentLoop 的 ctx 里直接 `ctx.tools.execute`，需要迁移到 `beginToolBatch`（生产代码目前只有 `claude-code-mods`；测试已迁移）。

---

## 8. 边界声明

未修改 Memory 的 `dyMemory.carryover` 或任何业务接口；未修改 Memory 数据/Schema/DB/策略/注入；未修改 Persona、Autonomy、Channel Bridge、Android、GUI；未改插件配置、生产配置、真实设备状态；未合并默认分支、未发布、未部署、未升级/重启 Host；未做生产 DB 迁移/写入；未执行真实 QQ 操作。测试全部在 `/tmp` 独立浅克隆；安装目录与 `/root/.dsh` 只读。

---

## 9. 残余风险与威胁模型限制

1. **伪造 Agent（session 信任，非本任务范围）**：`agents.register()` 是公开的，插件可以注册自己构造的 Agent（含伪造 session header/cwd），并为它实现 `verifyToolBatch`，从而 `beginToolBatch` 拿到**属于该伪造 Agent** 的 batch。这不是借用真实宿主 Agent，也不是取得全局签发能力；它等价于"插件驱动自己创建的 Agent"，与原 REVIEW 5.2 的 session 信任边界同一问题，需 Memory 阶段一并关闭（例如 owner 判定改用不可伪造的宿主身份）。
2. **monkey-patch（任意代码执行）**：插件可在自身激活时替换 `verifyToolBatch` 原型方法或 `beginToolBatch`，从而捕获/伪造 batch。进程内信任模型无法抵御已获得宿主代码执行权的插件；真正的边界是子进程/沙箱隔离。本轮已删除所有"可枚举/可导入"的铸造入口，但不声称能抵御 monkey-patch。
3. **源码树中的 `./src/*` 子路径**：`dsh-tools` 的 exports 含 `./src/*`（monorepo 测试便利）；发布 tarball 只含 `lib/`，安装态无法 import。`dsh-agent-loop` 不含该子路径。本轮已删除 `src/internal.ts`，不存在 raw-handler 访问器。
4. **DSHA 本地补丁**：安装版有 7 处本地补丁（含 destructive policy），需在本分支上 rebase 后才能部署；本任务未部署。
5. **动态重载**：loader 的运行时 inject 刷新、HMR、plugin-manager resume 不保证核心先于插件；但本轮不依赖加载顺序——proof 由真实 turn 铸造，伪造/抢先没有任何入口。

---

## 10. 复现

```bash
git clone --depth 1 --branch dsh-v0.2.1-rc.2 https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness && git checkout -b fix/host-tool-exec-provenance
pnpm install --frozen-lockfile
tsx native/system/scripts/build.ts --host-addon-only
NODE_OPTIONS=--max-old-space-size=3072 ./node_modules/.bin/vitest run \
  packages/core/tools/tests packages/core/agent-loop/tests --maxWorkers=2
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc -b tsconfig.host.json
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsx scripts/gen-cordis-catalog.ts --check
```

## 11. 附件

- `evidence/PHASE2.patch`：本轮全量 diff（`98f0b832..HEAD`）
- `evidence/GET-SURVEY.md`：`get()`/handler 暴露面全仓清单（499 行）
- `evidence/LOADER.md`：加载顺序调查（说明为何本轮**不依赖**加载屏障）
- `logs/`：核心+兼容 1435 用例、全 Host typecheck、catalog 生成/校验
