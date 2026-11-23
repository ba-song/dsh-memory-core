# BUILD-NOTES — 上游 DSH tag `dsh-v0.2.1-rc.2` 在本机跑 vitest 单元测试

任务：一次性安全工程任务的构建/测试基础设施子智能体（owner: build-infra）。
结论标签：**PASS**（`@deepseek-ai/dsh-tools` 426/426、`@deepseek-ai/dsh-agent-loop` 450/450 全部通过，退出码 0）。
生成时间：2026-11-23 12:30–12:56 +08:00。所有下载/安装/构建均在 `/tmp/build-infra` 下，未触碰生产。

---

## 0. 一句话结论

- **能跑**：`cd /tmp/build-infra/harness && ./node_modules/.bin/vitest run <spec 路径>`，**不需要 build 源码**，单文件约 12–17s。
- 唯一的原生前置是 `flock` 附加模块（`system.node`），已构建完成（3s）。**缺它会挂 41 个 agent-loop 持久化用例**——已修复并复验 450/450 全绿。
- 安装包 **不等于** 上游 tag：API 表面/调度器契约完全一致，但存在成体系的 DSHA 本地补丁（这两个包含 7 处补丁点；整棵安装树有 **41 个包**带 `DSHA_` 标记，且补丁依赖非上游模块 `dsha-destructive-policy`）。

---

## 1. 环境基线

| 项 | 实测值 |
|---|---|
| 用户 / 宿主 | `uid=0(root)`，Android 5.4.281-qgki aarch64（proot Ubuntu 24.04） |
| Node | **v24.19.0**（`/usr/local/bin/node`），Node 头文件在 `/usr/local/include/node`（存在） |
| pnpm | 包装脚本 `/root/dsh-bin/pnpm` 的 `--version` 打印 `10.34.5`，但安装日志实际为 **pnpm v11.28.5**（与 `package.json` 的 `packageManager: pnpm@11.28.5` 一致；包装脚本会委派到 workspace 固定的 pnpm） |
| CPU | `nproc=5`（**不是 8**），`availableParallelism()=5` |
| 内存 | 11Gi 总，开工时 available ≈ 3.4Gi，swap 8Gi 已用 6.4Gi；跑测时 available 维持 2.8–3.2Gi |
| 磁盘 | `/` 223G，开工 avail 100G，装完 96G（node_modules **2.0G**） |
| vitest | **4.1.11**（vite 8.2.2 / typescript 6.0.3 / tsx） |
| 网络 | registry.npmjs.org 可达但慢（单请求常 10–33s） |

---

## 2. 工作副本与安装

### 2.1 克隆（PASS）

```bash
git clone --depth 1 --branch dsh-v0.2.1-rc.2 \
  https://github.com/deepseek-ai/deepseek-harness.git /tmp/build-infra/harness
```
- 校验：`git rev-parse HEAD` = `687f282e8625c6b8d11ff58211a90524be2e4317` ✔；`git describe --tags` = `dsh-v0.2.1-rc.2` ✔
- 克隆后 `git status` 干净（`.agents/notes/*` 曾短暂显示为 staged deletion，实际文件齐全、状态为 0 项改动）
- `/tmp/harness-probe` 仅作只读参考，未在其中装依赖

### 2.2 依赖安装（PASS）

```bash
cd /tmp/build-infra/harness
NODE_OPTIONS=--max-old-space-size=3072 pnpm install --frozen-lockfile --reporter=append-only
```
| 项 | 值 |
|---|---|
| 退出码 | **0** |
| 耗时 | **297s 墙钟**（pnpm 自报 `Done in 4m 29.3s using pnpm v11.28.5`） |
| 体量 | `.pnpm` **1402 个包**，`node_modules` **2.0G** |
| 锁文件 | `pnpm-lock.yaml` lockfileVersion 9.0，`--frozen-lockfile` 未报漂移 |

警告（均不影响结果）：
- `[WARN] There are cyclic workspace dependencies` —— 上游仓库自身结构，正常；
- 大量 `Request took 10–33s` —— registry 慢；
- `[WARN] Unsupported platform` for `native/system/packages/{darwin-*,linux-x64}` —— 非本机平台包，正常；
- 若干 `[WARN] An error occurred while uploading .../esbuild` —— pnpm store 上传告警；esbuild/koffi/node-pty 的 postinstall 最终均 `Done`，vitest 正常运行，可忽略。

### 2.3 原生附加模块（PASS，**agent-loop 持久化用例的硬前置**）

```bash
cd /tmp/build-infra/harness
./node_modules/.bin/tsx native/system/scripts/build.ts --host-addon-only   # == pnpm run build:native-system
```
- 退出码 **0**，耗时 **3s**，gcc 13.3.0 + `/usr/local/include/node`
- 产物：`native/system/packages/linux-arm64/bin/glibc/system.node`（71,488 B，NAPI 8）
- 作用：`packages/session/session-persistence-jsonl/src/lease.ts` 通过 `@deepseek-ai/node-addon-system/flock` → `native/system/packages/entry/src/flock.ts` 加载它（文件写租约/flock）。**缺失时** `loadBinding` 抛 `Cannot find module .../system.node`，并连带 41 个用例失败（见 §4）。
- 说明：根 `pnpm test` = `pnpm run build:native-system && vitest run`，这条 addon 构建正是它原因所在；我们只单独跑了 addon 构建，没有跑全仓 `vitest run`。

---

## 3. 测试结果（Node v24.19.0 / vitest 4.1.11 / pnpm 11.28.5）

统一形式：`cd /tmp/build-infra/harness && NODE_OPTIONS=--max-old-space-size=3072 ./node_modules/.bin/vitest run <paths> --maxWorkers=2`

| # | 命令（路径部分） | 文件 | 用例 | 通过 | 失败 | 跳过 | 退出码 | vitest 耗时 | 墙钟 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `packages/core/tools/tests/tools.spec.ts` | 1 | 140 | 140 | 0 | 0 | 0 | 11.22s | 17s |
| 2 | `packages/core/tools`（整包 12 个 spec） | 12 | 426 | 426 | 0 | 0 | 0 | 58.06s | 63s |
| 3 | `packages/core/agent-loop/tests/tool-calls.spec.ts` | 1 | 24 | 24 | 0 | 0 | 0 | 11.6s | 18s |
| 4 | `packages/core/agent-loop`（整包 25 个 spec） | 25 | 450 | 450 | 0 | 0 | 0 | 94.96s | 101s |

- 说明：`tools.spec.ts` 里 `it(` 共 134 处，含 `it.each` 展开后 vitest 计 **140**；`tool-calls.spec.ts` `it(` 21 处，展开后 **24**。
- 未跑、也不需要跑全仓：`pnpm test` 会跑整个 monorepo（含 GUI/脚本/网络相关套件），与本任务无关且耗时不可控。
- 覆盖率的 100%/文件门槛（`test:coverage`）未跑，与"能不能跑单测"无关。

### 3.1 每次运行前的内存/并行度建议
- `--maxWorkers=2` 是本次实测的稳妥值（本机 5 核、可用内存 2.8–3.4Gi）。默认 `maxWorkers=min(availableParallelism,48)=5`，单文件运行时实际只起 1 个 fork，也安全。
- `NODE_OPTIONS=--max-old-space-size=3072` 非必需但推荐（内存紧）。

---

## 4. 基线失败清单与原因（**已全部修复，当前 0 失败**）

### 4.1 现象
首次跑整包 `packages/core/agent-loop`（在构建 `system.node` **之前**）：
`Test Files 25 (24 pass, 1 fail 文件级)` → 实际 **41 failed | 409 passed (450)**，`EXIT=1`，耗时 80.79s。

### 4.2 唯一根因（已定位并消除）
```
Error: Cannot find module '/tmp/build-infra/harness/native/system/packages/linux-arm64/bin/glibc/system.node'
Require stack:
- /tmp/build-infra/harness/native/system/packages/entry/src/flock.ts
 ❯ loadBinding native/system/packages/entry/src/flock.ts:30:13
 ❯ errno native/system/packages/entry/src/flock.ts:48:5
```
即 §2.3 的原生 flock 附加模块未构建。所有 41 个失败都是**下游表现**（JSONL 写租约拿不到 errno/flock）：

| 文件 | 失败数 | 表面现象 |
|---|---|---|
| `packages/core/agent-loop/tests/resume.spec.ts` | 31 | 恢复/持久化断言失败（句柄、durable 后缀、publication 顺序等） |
| `packages/core/agent-loop/tests/config-session-id.spec.ts` | 5 | `AssertionError: expected '[]' to contain 'remember me'`（载入的历史为空） |
| `packages/core/agent-loop/tests/resource-lifecycle.spec.ts` | 2 | `AssertionError: expected true to be false`（子 agent 启动被判为 error） |
| `packages/core/agent-loop/tests/shutdown-drain.spec.ts` | 2 | `SessionPersistenceNotFoundError: session "shutdown-drain" not found` |
| `packages/core/agent-loop/tests/serial-listener-review.spec.ts` | 1 | 同 flock 加载错误直接冒泡 |

### 4.3 修复与复验（PASS）
构建 `system.node` 后**原样重跑同一条命令**：`Test Files 25 passed (25)`、`Tests 450 passed (450)`、`EXIT=0`、94.96s。
→ **agent-loop 基线失败 = 0**。`packages/core/tools` 从来不需要该 addon（构建前后均 426/426）。
→ 未删除、未跳过、未修改任何测试。

### 4.4 41 个失败用例完整清单（构建 addon 前的现场，供对照）
1	packages/core/agent-loop/tests/config-session-id.spec.ts > config-driven session id > restores a materialized exact id across an AgentLoop-only reload
2	packages/core/agent-loop/tests/config-session-id.spec.ts > config-driven session id > waits for a draining exact-id lifecycle during an overlapping reload
3	packages/core/agent-loop/tests/config-session-id.spec.ts > config-driven session id > cancels an exact-id reload while the prior lifecycle is still draining
4	packages/core/agent-loop/tests/config-session-id.spec.ts > config-driven session id > config-driven create uses a fresh ${id}-session-<uuid> per run (restart-safe)
5	packages/core/agent-loop/tests/config-session-id.spec.ts > config-driven session id > config-driven resumeSessionId continues a persisted session
6	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > normalizes a non-Error resume publication failure for rollback and releases the write handle
7	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > a created agent stores its seed and live turn durably through its handle
8	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > agent dispose releases write ownership of its stored session
9	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > a setup failure before publication leaves no stored residue; the id creates again
10	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > a resume read failure swallows a rejecting handle close during rollback
11	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume cannot crash-repair a turn owned by a live agent
12	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume appends interrupted-turn closers durably through the handle
13	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume closes an interrupted tool call durably: tool/result, step/end, turn/end
14	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume over a torn physical tail continues from the committed prefix
15	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume of a session with no cwd carries an undefined cwd header
16	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > agent/created fires "startup" for createAgent and "resume" for resume()
17	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume awaits setup while unpublished, then publishes a fully composed world in order
18	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > a resumed session stores its repair suffix durably before publication
19	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > successful resume disposal retires its caller-owned transaction effects
20	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume setup rejection publishes nothing, unwinds, and releases the identity
21	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume setup commit rejection publishes nothing and releases the identity
22	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > owner unload aborts resume setup and cannot publish after the callback settles
23	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > owner unload aborts a never-settling persistence open, releases the identity, and blocks late publication
24	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > AgentLoop unload aborts a never-settling persistence open and awaits wrapper settlement
25	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume of a forked session preserves the lineage, seed boundary, and delegation depth in the header
26	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > a pending idle inject() survives persist + resume without a synthetic turn
27	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume continues persisted history after a live scheduler failure
28	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > fork continues persisted history after a live scheduler failure
29	packages/core/agent-loop/tests/resume.spec.ts > the session-persistence Agent Note: AgentLoop factory create/resume > resume reloads a persisted session: history + turn numbering continue, no duplicate seqs
30	packages/core/agent-loop/tests/resume.spec.ts > creation and resume cancellation edges > resume with a pre-aborted caller signal rejects out of the load race
31	packages/core/agent-loop/tests/resume.spec.ts > creation and resume cancellation edges > an abort landing between crash repair and publication refuses resume, normalized
32	packages/core/agent-loop/tests/resume.spec.ts > creation and resume cancellation edges > closes the resume write handle when the loop becomes inactive before setup
33	packages/core/agent-loop/tests/resume.spec.ts > creation and resume cancellation edges > factory teardown during a hung resume open rejects promptly and closes the late handle
34	packages/core/agent-loop/tests/resume.spec.ts > configured-start failure edges > a non-Error mid-open abort reason is wrapped for the resume caller
35	packages/core/agent-loop/tests/resume.spec.ts > configured-start failure edges > a failing exact-id restore over an existing artifact stays loud
36	packages/core/agent-loop/tests/resume.spec.ts > configured-start failure edges > suppresses a configured-resume failure that lands after teardown
37	packages/core/agent-loop/tests/serial-listener-review.spec.ts > serial creation listener integrations > starts due plugin work only after every creation listener finishes
38	packages/core/agent-loop/tests/resource-lifecycle.spec.ts > unloads loop while a background child is stopping
39	packages/core/agent-loop/tests/resource-lifecycle.spec.ts > unloads root while a background child is stopping
40	packages/core/agent-loop/tests/shutdown-drain.spec.ts > root shutdown drain (backend-first) > persists buffered turn events without an explicit flush before dispose
41	packages/core/agent-loop/tests/shutdown-drain.spec.ts > root shutdown drain (loop-first) > persists buffered turn events without an explicit flush before dispose

（以上 41 条在补构建 `system.node` 之后**全部转绿**，见 §4.3。）

---

## 5. 安装包（`/usr/local/lib/node_modules/@deepseek-ai/dsh`）vs 上游 tag 源码

> 结论：**代码不一致**。安装包是"上游 0.2.1-rc.2 的构建产物 + DSHA 本地补丁"，不是 tag 源码的等价物。
> 但"关键语义一致"可以证明：导出符号、调度器契约、执行管线结构完全相同，差异全部落在可枚举的补丁点上。

### 5.1 元数据：无法从 npm 包反查 commit
- `@deepseek-ai/dsh`、`dsh-tools`、`dsh-agent-loop` 的 `package.json` **都没有 `gitHead`**，也没有任何 `_resolved/_integrity` 等 provenance 字段；三者版本号均为 `0.2.1-rc.2`。
- → 只能用源码结构比对来证明一致性，不能靠包元数据。

### 5.2 结构等价性（证据：运行时导入两侧对象后比对）
| 比对项 | 上游 tag 源码 | 已安装 lib | 结果 |
|---|---|---|---|
| `dsh-tools` 导出符号集 | 23 | 23 | **集合完全相同**（无独有项） |
| `dsh-agent-loop` 导出符号集 | 5 | 5 | **集合完全相同** |
| `ToolRuntime.prototype` 成员集 | 40 | 40 | **集合完全相同** |
| `TOOL_RUNTIME_SCHEDULER` | `Symbol(@deepseek-ai/dsh-tools.scheduler)` | 同 | 一致 |
| `createExecutionToken()` | 存在（src:1913） | 存在（lib 内 2 处引用） | 一致 |
| `class ToolRuntime` / `execute` / `createExecution` | 存在 | 存在 | 一致 |

**Token 多重集比对**（把整个 `ToolRuntime` 类归一化后比标识符/字符串字面量）：
唯一非格式性差异 = 补丁标识符（`attachPolicy` `captureExecution` `prepareOperation` `verifyGlobalConsent` `verifyDispatch` `Object.defineProperties`）＋构建产物差异（`RUN_CODE_NAME`→`"run_code"` 常量折叠、`const detached` 内联、em-dash 编码）。其余差异均为 esbuild 打印风格（`(layer) =>` vs `layer =>`、`if (x) throw` vs `if (x) { throw }`、`__name()` keepNames 包装、分号）。

### 5.3 `@deepseek-ai/dsh-tools` 的 5 处 DSHA 补丁（标记 `DSHA_REQUIRED_POLICY_V1`）

上游对应文件：`packages/core/tools/src/index.ts`（tag 全文件 5,782 行中该文件 91,160 B）。

| # | 位置（上游行号） | 上游代码 | 已安装 lib 追加 |
|---|---|---|---|
| 1 | 文件首行 import | 无 | `import { attachPolicy, captureExecution, prepareOperation, verifyGlobalConsent, verifyDispatch } from "dsha-destructive-policy"; // DSHA_REQUIRED_POLICY_V1` |
| 2 | `constructor`（src:850） | `super(ctx, "tools"); this.ptcContext = ctx; ...` | `constructor` 内 `super()` 之后插入 **`attachPolicy(this, ctx);`** |
| 3 | `private createExecution`（src:1399） | `const execution = { ...base, arguments: deepFreeze(detached) }` | 追加 **`Object.defineProperties(execution, …)`**（把 `name/arguments/token/callId/rootCallId/agent/parent` 设为 `writable:false, configurable:false, enumerable:true` 的**身份指纹冻结**）＋ **`captureExecution(this, execution, visible)`** |
| 4 | `private async prepareExecution`（src:1501） | `const denialReason = decision.kind === "allow" ? this.guardReason(exec) : decision.reason` | 在两者之间插入 **`if (decision.kind === "allow") await prepareOperation(this, exec)`** |
| 5 | `private async dispatchToolBody`（src:1572） | `const tool = this.resolveExecution(...); if (!tool) throw new ToolNotFoundError(...); state.bodyInvoked = true` | `resolveExecution` **之前** `await verifyGlobalConsent(exec)`；**之后**、`bodyInvoked` 之前 `verifyDispatch(this, exec, tool)` |

补充：`dsha-destructive-policy` 只存在于安装树 `.../dsh/node_modules/dsha-destructive-policy/index.js`（**本地模块，不在 npm 上**，同一目录还有 `dsha-client-combo-cache`、`dsha-runtime-fs`、`dsha-session-compat`）。→ 上游 tag 源码**无法**直接替换安装包运行。

### 5.4 `@deepseek-ai/dsh-agent-loop` 的 2 处 DSHA 补丁

| # | 位置 | 上游 tag 源码 | 已安装 lib |
|---|---|---|---|
| 1 | `packages/core/agent-loop/src/tool-calls.ts:60` `executeToolCalls` | `const { session } = agent` 之后**直接** `const planned = toolCalls.map(...)`，无任何身份校验 | 标记 **`DSHA_TOOL_DISPATCH_IDENTITY_RC2_V1`**：在**任何副作用之前**整组预检，`if (toolCalls.some(block => !(typeof block.id === 'string' && block.id.trim() !== '' && typeof block.name === 'string' && block.name.trim() !== ''))) throw new LlmError('DSHA_INVALID_TOOL_CALL: missing name/id; this step was not dispatched. No automatic replay.', 'INVALID_RESPONSE')` |
| 2 | `packages/core/agent-loop/src/agent.ts:529` 组装 assistant message | `content: live.blocks()`；`source: { …replayState !== undefined ? {replayState} : {} }`；随后 `const toolCalls = message.content.filter(...)`；**无** invalidIdentity 概念 | 标记 **`DSHA_TOOL_FINISH_IDENTITY_RC2_V1`**：`const assembledBlocks = live.blocks(); const invalidIdentity = assembledBlocks.some(block => block.type === 'tool-call' && !(合法 id/name))`；把非法 tool-call 块**改写为文本诊断** `[DSHA_INVALID_TOOL_CALL] Missing tool name/id in this step. No tool in this step was executed; no automatic replay.`；`invalidIdentity` 时**不写 replayState**；append 之后对每个残留 tool-call 调上游已有的 `appendSkippedToolCall`（tool-calls.ts:250），最后 `throw new LlmError('DSHA_INVALID_TOOL_CALL: …', 'INVALID_RESPONSE')` |

注：`appendSkippedToolCall` 本身是上游函数（tool-calls.ts:250），补丁只是复用它。

### 5.5 补丁范围不止这两个包
对安装树 `.../dsh/node_modules/@deepseek-ai/*/lib/index.js` 做 `DSHA_` 扫描：**41 个包**含 DSHA 标记，例如
`dsh-tools`、`dsh-agent-loop`、`dsh-tool-bash`、`dsh-tool-fs`、`dsh-tool-str-replace-editor`、`dsh-persona`、`dsh-llm-deepseek`、`dsh-llm-pi-ai`、`dsh-session-persistence-jsonl`、`dsh-session-format-v2-to-v3`、`dsh-settings`、`dsh-config-editor`、`dsh-fs-local`、`dsh-app-boot`、`dsh-timeout`、`dsh-permission-presets`、`dsh-storage-json`、`dsh-plugin-manager` 等（含多个 client UI 包）。
→ "已安装 0.2.1-rc.2 = 上游 tag" 的说法**不成立**；只能表述为"上游语义基线 + 本地补丁"。

---

## 6. 最快跑"新增测试文件"的确定配方（已实测）

### 6.1 结论
**不需要 build**（源码面测试）；不需要重新 install；不需要动原生 addon（已构建好）。

### 6.2 三步
1) 把 `*.spec.ts` 放到包内测试目录（**必须**命中 include glob）：
   ```
   /tmp/build-infra/harness/packages/core/tools/tests/<你的用例>.spec.ts
   /tmp/build-infra/harness/packages/core/agent-loop/tests/<你的用例>.spec.ts
   ```
   命中规则：`packages/*/*/tests/**/*.spec.{ts,tsx}`；**放在仓库根目录或包外，即使显式传路径也会被过滤掉**（实测输出 "No test files found"）。
2) 直接 import workspace 源：`import ToolRuntime from '@deepseek-ai/dsh-tools'`（`vite-tsconfig-paths` 按 `tsconfig.base.json` 的 512 条 `paths` 映射到 `packages/*/*/src`，**不读** `lib/`）。
3) 运行：
   ```bash
   cd /tmp/build-infra/harness && \
   NODE_OPTIONS=--max-old-space-size=3072 \
   ./node_modules/.bin/vitest run packages/core/tools/tests/<你的用例>.spec.ts --maxWorkers=2
   ```
   等价写法（多约 5–9s pnpm 开销）：`pnpm exec vitest run <path>`。

### 6.3 耗时
- 单文件冷启动：**12–17s 墙钟**（transform ≈4–6s、import ≈4–8s、setup ≈0.5s、实际断言几十 ms）。
- 加一个用例不会显著增加时间；改动源码后 vitest 无缓存复用，仍是这个量级。
- 两个包一起跑 ≈ 65s + 101s；整包 tools 63s。

### 6.4 已验证的探针（已删除，可照抄结构）
在 `packages/core/tools/tests/` 建过 2 个用例的探针：`import ToolRuntime, { defineTool, TOOL_RUNTIME_SCHEDULER } from '@deepseek-ai/dsh-tools'` + `new Context()` → `ctx.plugin(SystemPrompt, { personaPrefix: '' })` → `ctx.plugin(ToolRuntime)` → `expect(ctx.tools).toBeDefined()`，**2 passed / EXIT=0 / 12s**。
注意：`ToolRuntime` 依赖 `ctx.systemPrompt`，裸 `Context` 只挂 ToolRuntime 会拿不到 `ctx.tools`（必须先挂 `@deepseek-ai/dsh-system-prompt`）；`tool-calls.spec.ts` 顶部 `harness()` 是完整装配样板（LlmRuntime/SessionStore/SessionProjectionRegistry/SystemPrompt/ToolRuntime/AgentRegistry/AgentLoop）。

### 6.5 注意事项
- vitest **只转译不做类型检查**；要类型校验需另跑 `pnpm run typecheck`（全仓 `tsc -b`，重，未在本任务验证）。
- 根 `pnpm test` = `build:native-system && vitest run`（全仓），不要用它跑单文件。
- **陷阱（已实测）**：`pnpm --filter @deepseek-ai/dsh-tools test` **静默退出 0 但什么都没跑** —— `packages/` 和 `apps/` 下**没有任何包**定义 `test` 脚本（只有 `native/system` 有）。不要把这个当"测试通过"。

---

## 7. 交给 lead 的接管说明

- `/tmp/build-infra/harness` **可以接管**：clone 干净（HEAD 687f282…、tag 正确、`git status` 0 项改动）、依赖已装（2.0G）、原生 addon 已构建。
- 接管后可直接 `git checkout -b <branch>` 改源码；`node_modules/` 与 `native/system/packages/linux-arm64/bin/` 都是构建产物（**不要 `git clean -xdf`**，会连 node_modules 一起删）。
- 未做任何 commit / push / 发布；未执行 `npm install -g`。
- 禁止触碰：`/usr/local/lib/node_modules/**`（只读比对过）、`/root/.dsh/**`、38105 端口 web 进程。
- 本子智能体自检副作用：仅 `/tmp/build-infra` 下的克隆、安装、native addon 构建、日志与探针（探针已删）。

---

## 8. 附件索引（原始输出）

| 文件 | 内容 |
|---|---|
| `/tmp/build-infra/install.log` | 安装全过程（含 `Done in 4m 29.3s using pnpm v11.28.5`） |
| `/tmp/build-infra/test-tools.log` | tools 整包（修复前，426/426） |
| `/tmp/build-infra/test-tools2.log` | tools 整包（最终，426/426，58.06s） |
| `/tmp/build-infra/test-toolcalls.log` | tool-calls.spec.ts（24/24） |
| `/tmp/build-infra/test-agentloop-full.log` | agent-loop 整包**修复前**：41 failed / 409 passed |
| `/tmp/build-infra/test-agentloop-full2.log` | agent-loop 整包**修复后**：450/450 passed |
| `/tmp/build-infra/filter-test.log` | `pnpm --filter … test` 静默空跑的证据 |
| `/tmp/build-infra/failures.txt` | 41 个失败用例清单 |
