# Host Runtime Session Trust Boundary Verification · 报告

- 任务：Host Runtime Session Trust Boundary Verification
- 时间：2026-11-23 12:0x–12:5x (Asia/Shanghai)
- 性质：只读源码核验 + 接口可行性 + 最小实施路径设计；未改代码/测试/Schema/DB/配置/协议；未部署/重启/连接真实设备。
- **状态：PARTIAL（工程决策 B：Host 需要最小改造）**

## 1. 结论先行

1. **Host 现有能力不足**：当前 Host/DSH 插件 API 没有“调用者持有某 Runtime Session”的不可伪造身份能力。
2. `agents` 服务对所有插件公开 `get/list/create`；`session.header` 是普通 JSON；`agent/created`/`session/event` 暴露 agent/session；`tools.execute(exec)` 接受任意 `exec`，无 provenance 校验。
3. 因此普通插件可以：复制真实 session header、创建携带 owner cwd 的新 session、或用伪造 `exec` 调用工具；`liveSessions`/`id+cwd` 不能作为 capability。
4. **工程决策 B（最小改造）**：Host 增加“host-created tool exec” provenance（私有符号/WeakSet），并让 Memory 的 raw 读取只走工具（`exec.agent`）或后续 Host capability API；不接受 service 参数自述 header。
5. Memory 侧最小适配：停用/收窄 `dyMemory.carryover` 的 raw 读取（服务不再返回 raw），raw 仅经工具/宿主中介；`person_archive` 已有 `exec` 路径，待 Host provenance 生效后可信。

## 2. 实际运行 Host 定位

| 项 | 证据 |
|---|---|
| 运行进程 | `/usr/local/bin/node /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js web --no-open --host 127.0.0.1 --port 38105`（`/proc/30172/cmdline`） |
| 运行包 | `@deepseek-ai/dsh` **0.2.1-rc.2**（`/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json`） |
| 源码来源 | package `repository` 字段：`github.com/deepseek-ai/deepseek-harness`（`apps/cli`） |
| **精确源码 commit** | **UNKNOWN**：安装包无 `gitHead`，本地安装目录非 git 仓库；不能把 npm 版本等同某个 commit |
| Android 关系 | 进程由 `/data/app/.../libproot.so` 启动，rootfs `/data/.../files/linux/ubuntu`；即 DSHA Android App + proot Ubuntu；Host 是 Ubuntu 内的 DSH CLI，不是 Android 原生 Service |
| 插件目录 | `/root/.dsh/plugin-src/`（memory/persona/autonomy/channel/douyin/hud/media/selfhost-boot） |
| 关键包 | `dsh-agent`、`dsh-session`、`dsh-agent-loop`、`dsh-tools`、`dsh-api-session-controller` |

> 由于精确 commit 无法确认，本报告行号均对应实际安装包 `0.2.1-rc.2` 文件；跨仓库证据注明包名与版本。

## 3. Runtime Session 生命周期源码链

### 3.1 创建与 ID

- `dsh-api-session-controller/lib/index.js:509`：
  `createAgent(brandString(\`session-${randomUUID()}\`), cwd, composition)`。
- `dsh-api-session-controller/lib/index.js:879`：子会话同样 `session-${randomUUID()}`。
- `dsh-agent/lib/index.js:447-460`：`AgentRegistry.create(options)` → factory `createAgent`；`dsh-agent-loop/lib/index.js:1902-1907` 把 `options.sessionId`/`meta` 交给 `SessionPreparation`。
- `dsh-session/lib/index.js:1818-1830`：header = `{version,id,createdAt,cwd?,parentSession?,isSeeded,origin?,delegationDepth?,agentPreset?}`；`Session.header` 普通对象（`dsh-session/lib/index.js:1324-1345`），无签名/秘密。

### 3.2 暴露给插件

- `AgentRegistry extends Service`，服务名 `agents`（`dsh-agent/lib/index.js:331-332`）；公开 `get(id)`（`:593`）、`list()`（`:615`）、`create(options)`（`:458`）、`withInitiator`（`:414`）。
- `agent/created` 事件携带 `agent`（`dsh-agent/lib/index.js:581`）；`session/event` 第一参数是 session（`dsh-agent-loop/lib/index.js:319`）。
- **Memory 自己**就通过 `ctx.agents.list()` 读取所有 live agent（`lib/index.js:1185`）→ 证明该服务对普通插件可达。
- `dsh-tools` 服务 `super(ctx,"tools")`（`dsh-tools/lib/index.js:2799`）；公开 `execute(exec)`（`:3214`）、`prepareExecution`（`:3314`）、`createExecution`（`:3229`）。
- 工具执行上下文：`dsh-agent-loop/lib/index.js:507-519` 在 `executeToolCalls` 中用 `ctx.agents.requireInitiator()` 取 agent，构造 `exec = {callId,name,arguments,agent,signal}`；工具 handler 拿到 `exec.agent`。

### 3.3 销毁/重启

- `dsh-agent` 的 `agents.register/enter/detach` 管理 live registry；`agent/disposed` 在 detach（`dsh-agent/lib/index.js:474,509` 注释与实现）。
- Session store 的 `session/disposed`（`dsh-session/lib/index.js:1930`）存在；header 不含过期/撤销凭证。
- Host 重启后 agent registry 为空；session 可 resume（`agents.resume`，`dsh-agent/lib/index.js:460`），header 持久化；旧“header”仍会存在。

## 4. 插件可见数据 vs Host 私有数据

| 数据 | 可见性 | 证据 |
|---|---|---|
| `AgentRegistry.store` | Host 私有（Map 字段） | `dsh-agent/lib/index.js:322-323` |
| `agents.get/list` 返回的 agent/session/header | **所有插件可见** | `dsh-agent/lib/index.js:593,615`；Memory 自身使用 |
| `agent/created` 的 agent | 所有监听插件可见 | `dsh-agent/lib/index.js:581` |
| `session.header` | 普通 JSON，无秘密 | `dsh-session/lib/index.js:1818-1830` |
| `session/event` 的 session | 所有监听插件可见 | `dsh-agent-loop/lib/index.js:319` |
| `tools.execute(exec)` 的 exec | 公开方法；**无 provenance 校验** | `dsh-tools/lib/index.js:3214,3314` |
| `agents.currentInitiator/withInitiator` | 公开；**明确不是授权** | `dsh-agent/lib/index.js:366-419` |

## 5. 伪造/复制/借用分析

### 5.1 复制真实 session header —— **源码可证明可行**
- 插件 `ctx.agents.list()` 得到真实 agent；`agent.session.header` 可直接读取（`dsh-agent/lib/index.js:615`；`dsh-session` header 普通对象）。
- 把该 header 传给 Memory service，即可满足当前 `liveSessions` 的 id+cwd 匹配（Memory d376a15 `lib/index.js:1071-1077`）。
- 结论：**id+cwd 只能证明“该 session 曾被宿主观察”，不能证明调用者持有它**。

### 5.2 插件创建 owner-cwd 新 session —— **接口可证明，运行时可达性 UNKNOWN**
- `agents.create(options)` 公开；`dsh-agent-loop` 把 `options.meta` 传给 `SessionPreparation`；`dsh-session` 从 `meta.cwd` 建 header（`dsh-agent-loop/lib/index.js:1902-1907`；`dsh-session/lib/index.js:1818-1830`）。
- 插件可生成新 `sessionId`、`meta:{cwd:ownerHome}`，随后 `agent/created` 注册，Memory 会把它当 live/owner。
- 是否所有插件实际有 `agents` 注入/可调用：**接口存在，运行时调用权限 UNKNOWN**（未在真实插件中执行）。

### 5.3 伪造 tools exec 调用 `dy_memory_person_archive` —— **源码可证明可行**
- `tools.execute(exec)` 接受任意 `exec`，`createExecution` 直接读 `exec.agent`（`dsh-tools/lib/index.js:3214-3235`）。
- 插件可传 `{name:'dy_memory_person_archive', args:{...}, agent: <real owner agent>}`，绕过“工具由宿主 dispatch”的假设。
- 结论：**“工具上下文可信”目前只对宿主自己 dispatch 成立；对直接调用 `tools.execute` 的插件不成立**。

### 5.4 伪造 `withInitiator` —— **源码明确**
- `withInitiator(agent, operation)` 可被插件调用；JSDoc 明确 `presence is neither liveness proof nor authorization`（`dsh-agent/lib/index.js:414` 附近）。
- 任何基于 `currentInitiator` 的授权都会被打穿。

### 5.5 结论
- 当前 Host **没有**不可伪造的 session 身份；`agents` 服务是读/写同一入口，session header 是普通数据，tools exec 无 provenance。
- 普通插件至少可通过 5.1（复制 header）与 5.3（伪造 exec）绕过；5.2 取决于 `agents.create` 实际注入/权限，标记 UNKNOWN 但接口存在。

## 6. 现有可信身份能力清单

| 能力 | 是否存在 | 信任根 | 限制 |
|---|---|---|---|
| `agents.currentInitiator` | 是 | Host AsyncLocalStorage | 明确不是授权；插件可 `withInitiator` |
| `agents.isOwnedBy(id, owner)` | 是 | Host 私有 owner 关系 | 只回答父子运行时归属，不是 session capability；插件可传任意 real owner |
| `sessions` 服务 | 是（`dsh-session/lib/index.js:1739`） | Host 内部 store | 公开服务；插件可按 id 读取，无 callers 校验 |
| `tools.execute` | 是 | 无 provenance | 插件可伪造 exec |
| Host 签名 token / capability | **否** | — | 源码无签名/密钥/ACL |
| 插件 API 受信调用上下文 | **否** | — | `ctx` 是全局服务上下文，无 per-plugin ACL |

## 7. 对 Memory 设计报告三种方案的 Host 可行性

| 方案 | Host 可行性 | 说明 |
|---|---|---|
| A. Host 注入不可伪造 Capability 对象 | **需 Host 改造** | 当前无私有 capability 服务；若对象经 `ctx.get` 暴露，普通插件同样可取；需私有 WeakMap + 受控下发 |
| B. Host 短期签名凭证 | **需 Host 改造** | 无密钥管理/签发/撤销/传输；若 token 放 session.header 会被 `agents.list` 读取 |
| C. Host 受控验证 API | **需 Host 改造** | 需 caller 认证；当前 `withInitiator` 非授权、`tools.execute` 可伪造 |
| D. 工具 `exec.agent` 路径 | **可最小落地，但需 provenance 修复** | 当前 `tools.execute` 可被插件伪造 exec；修 provenance 后可用 |

## 8. 工程决策：**B — Host 需要最小改造**

### 8.1 最小改造（推荐）

**Host 侧（2 个文件 + 测试）**
1. `dsh-agent-loop/lib/index.js`：在 `executeToolCalls` 创建 `exec` 时打上**模块私有 Symbol**（`HOST_EXEC`），只有 loop 能设置。
2. `dsh-tools/lib/index.js`：`prepareExecution`/`execute` 校验 `exec[HOST_EXEC] === true`；缺失/伪造 → `E_TOOL_EXEC_UNTRUSTED`，不 dispatch。
3. 可选：`dsh-agent`/`dsh-session` 不新增 capability；先靠“只有 Host dispatch 的 exec 可信”解决工具路径。

**Memory 侧（1 个方法 + 测试）**
- `dyMemory.carryover` 不再作为 raw 读取出口：停用/返回 `E_PERMISSION`（或仅保留非 raw 的会话摘要）；raw 读取只经工具（`dy_memory_person_archive`）或未来 Host capability。
- `dy_memory_person_archive` 继续用 `exec.agent.session`；Host provenance 生效后，伪造 exec 无法进入。
- 自动注入路径不变（当前 session cwd+sid 由 Memory 内部使用）。

**消费者侧**
- Autonomy 当前不调用 carryover；`recall/episodeRecent` 非 raw；`addEpisode/saveDiary` 用 plugin 写身份 —— 无需 raw capability。
- HUD `resolveConflict` 非 raw；不受影响。
- GUI：未发现直接 `dyMemory.carryover`；若未来需要 raw，走 Host 工具/中介。

### 8.2 为什么不是 A/C 直接可用
- A/C 都需要“调用者身份”根；当前 Host 只有 `currentInitiator`（非授权）和公开 `agents` 服务；新增签名/权限会牵涉 `dsh-agent`/`dsh-tools`/插件 SDK，工作量和兼容性大于“exec provenance + 工具路径”。
- B（本决策）先建立**工具路径可信根**，再视需要做 A/C 的长期能力。

### 8.3 安全验收条件
- 伪造 exec 调用 `dy_memory_person_archive` → `E_TOOL_EXEC_UNTRUSTED`；
- 插件复制 header 调用 `dyMemory.carryover` → `E_PERMISSION`（服务已停用 raw）；
- 插件创建 owner-cwd session 后调用工具 → 失败（exec provenance）；
- Host dispatch 的真实工具调用仍可用（person_archive 当前 cwd/owner 规则）；
- 自动注入 carryover 正常。

## 9. 兼容性矩阵

| 消费者 | 当前身份来源 | 能否取得可信能力 | 需要适配 | 风险 |
|---|---|---|---|---|
| Memory Core | session header / exec.agent | 工具路径：修 provenance 后可以；service 路径：无 | 停用 carryover raw；tool 保留 | 服务 API 行为变更 |
| Autonomy | `dyMemory` 无 header 读；plugin 写身份；handoffBrief 自造 header | 不需要 raw；写身份已白名单 | 无（不调用 carryover） | handoffBrief 自造 header 仍不被视为可信；该接口无 raw |
| GUI / DSH API | API session controller / tools | 工具路径可；service 直调 UNKNOWN | 若调用 carryover 需改走工具/中介 | 调用链未证实 |
| Android Host / Plugin Runtime | proot + DSH CLI | 无额外 capability | Host 升级（exec provenance） | 需发布/重启（本任务未做） |

## 10. 负向测试场景

| # | 场景 | 预期 |
|---|---|---|
| 1 | 插件伪造 `{cwd,id}` header 调 carryover | `E_PERMISSION`（service raw 已停用） |
| 2 | 插件复制真实 session.header 调 carryover | `E_PERMISSION` |
| 3 | 插件 `tools.execute` 传伪造 exec 调 person_archive | `E_TOOL_EXEC_UNTRUSTED` |
| 4 | 插件 `tools.execute` 传真实 owner agent 但非 Host dispatch | 拒绝（provenance） |
| 5 | Host dispatch 正常调用 person_archive | 仅当前 cwd/owner |
| 6 | 插件创建 owner-cwd session 后调用工具 | 拒绝（exec provenance；session 创建本身不赋权） |
| 7 | 子代理/GUI 借用主会话 exec | 拒绝（exec 不属于该调用） |
| 8 | 缺失/类型错误 exec | 拒绝 |
| 9 | Host 重启/旧 exec | 拒绝（无持久化） |
| 10 | 插件注入验证结果 | 拒绝（无验证服务可伪造） |

## 11. 后续实施拆分

1. **Host 任务**：`dsh-agent-loop` 私有 exec Symbol + `dsh-tools` provenance 校验 + 单元测试（伪造 exec、真实 dispatch）。
2. **Memory 任务**：停用/收窄 `dyMemory.carryover` raw；保留 `person_archive` 工具；补测试（服务拒绝、工具假 exec 拒绝）。
3. **消费者任务**：确认 GUI 是否调用 carryover；Autonomy/HUD 无需改；若 GUI 需要 raw，改走 Host 工具/中介。
4. **Owner 授权**：Host 行为变更 + Memory service API 变更需单独批准；本任务未实施。

## 12. 未确认事项

1. 实际安装包的精确 git commit：**UNKNOWN**（无 gitHead，安装目录非 git）。
2. `agents.create` 对所有插件的运行时可达性：接口存在，实际注入/权限 **UNKNOWN**。
3. GUI 是否直接调用 `dyMemory.carryover`：未在 DSH 包中找到，**UNKNOWN**。
4. Host `tools.execute` 是否有未公开的 provenance 校验：当前源码无，**UNKNOWN** 是否被其他层拦截。
5. `session.header` 的 deep-freeze 细节：对象存在，冻结实现未逐行验证。

## 13. 边界声明

本任务未修改 Host/Memory/Autonomy/GUI 业务代码、测试、Schema、DB、配置或调用协议；未部署/重启；未连接真实设备/QQ；未合并/发布。所有结论为只读源码证据；方案为 PROPOSAL，未获 Owner 批准。

## 14. 状态

**PARTIAL**：Host 当前能力不足；工程决策 **B（最小改造）** 已给出，需 GPT/Owner 批准 Host exec provenance 与 Memory service 行为变更后再实施。
