# Memory Core Trusted Session Capability · 只读架构设计报告

- 任务：Memory Core Trusted Session Capability — Read-only Architecture Design
- 时间：2026-11-23 12:0x–12:5x (Asia/Shanghai)
- 性质：只读调查与设计；未改业务代码/测试/Schema/DB/配置/调用协议；未部署/重启/连接真实设备。
- **状态：BLOCKED** —— 当前 Host/DSH 插件 API 没有可验证的“调用者持有某 Runtime Session 身份”的不可伪造凭证；仅靠 `id+cwd` 或 session header 无法闭合信任链，需要 Host 侧变更。

## 1. 基线与仓库状态

| 项 | 值 |
|---|---|
| Memory 仓库/分支 | `ba-song/dsh-memory-core` / `fix/p0-1-cross-conversation-memory-outputs` |
| **代码基线** | **`d376a157d9307b34efb7af482a89f40fbe6c8061`**（父 `16020381656986e0cea585928e7009ef5341b70d`） |
| tree | `848674b0b3c2277bef2ee34bf8f339675b5949c9` |
| Host/DSH | `/usr/local/lib/node_modules/@deepseek-ai/dsh`（cli 0.2.1-rc.2）；关键实现包 `@deepseek-ai/dsh-agent`、`dsh-session`、`dsh-api-session-controller`、`dsh-agent-loop` |
| 契约 | R4.1 CANDIDATE（未冻结），不作为实施授权 |
| 审查 | 只读；本报告只新增文档 |

## 2. Host/DSH Session 生命周期证据

### 2.1 创建与 Session ID

- `dsh-api-session-controller/lib/index.js:509`：
  `this.createAgent(brandString(\`session-${randomUUID()}\`), cwd, composition)`
  → 由 API/会话控制器生成 `session-<uuid>`。
- `dsh-api-session-controller/lib/index.js:879`：子会话同样 `session-${randomUUID()}`。
- `dsh-agent/lib/index.js:447-460`：`AgentRegistry.create(options)` 通过已注册 factory 创建 agent/session；`dsh-agent-loop/lib/index.js:1902-1907` 把 `options.sessionId`/`options.meta` 交给 `SessionPreparation`。
- `dsh-session/lib/index.js:1818-1830`：session header 由 `{version,id,createdAt,cwd?,parentSession?,isSeeded,origin?,delegationDepth?,agentPreset?}` 组成；`Session` 的 `header` 是普通对象（`dsh-session/lib/index.js:1324-1345`），无签名/无秘密字段。

### 2.2 Session/Agent 暴露给插件

- `AgentRegistry` 是 Cordis 服务 `agents`（`dsh-agent/lib/index.js:331-332` `super(ctx, "agents")`）。
- 公开方法：`get(id)`（`:593`）、`list()`（`:615`）、`create(options)`（`:458`）、`withInitiator(agent, op)`（`:414` 附近）等。
- `agent/created` 事件携带 `{agent, source, signal}`（`dsh-agent/lib/index.js:581`）；`session/event` 的第一参数是 session（`dsh-agent-loop/lib/index.js:319`）。
- Memory 自己就通过 `ctx.agents.list()` 获取所有 live agent（`lib/index.js:1185`）——**任何插件同样可以**。
- `agents.currentInitiator()/withInitiator()`（`dsh-agent/lib/index.js:366-419`）明确注明：**presence is neither liveness proof nor authorization**；`withInitiator` 可被插件调用并传入任意 live agent，不能作为授权凭据。

### 2.3 结论（Host 能力）

- Host **没有**向插件暴露“签名凭证 / 私有 capability / 调用者-会话绑定”的现有机制（源码中无签名、无 per-plugin ACL、无 service capability token）。
- session header 是普通 JSON，且通过 `agents.get/list` 可被任何插件读取；插件也能创建一个携带任意 `meta.cwd` 的新 session（`dsh-agent-loop` 把 `options.meta` 传给 `SessionPreparation`，`dsh-session` 从 `meta.cwd` 建 header）。
- 因此“Host 曾观察到某 session”不等于“调用者持有该 session 的可信凭证”。

## 3. Memory 当前身份链（d376a15）

| 位置 | 作用 | 证据 |
|---|---|---|
| `lib/index.js:163-170` | `liveSessions` Map + `noteSession` | 只由宿主事件写入 |
| `lib/index.js:278` | `session/event` → `noteSession(session)` | host event |
| `lib/index.js:1295` | `agent/created` → `noteSession(agent.session)` | host event |
| `lib/index.js:1191` | 启动 `agents.list()` → `noteSession` | host registry |
| `lib/index.js:1071-1077` | `isTrustedHeader(h)`：`liveSessions.get(id).cwd === h.cwd` | 仅 id+cwd 匹配 |
| `lib/service.js:675-696` | carryover 只从 `opts.header`/`opts.session.header` 取身份；要求 id；`isTrustedHeader`；cwd 一致；owner-only；传 sid | 当前实现 |
| `lib/service.js:77-85` | `resolveHeader` 仍是形状匹配（供其他方法使用；carryover 已不使用 input） | 全局行为未改 |
| `lib/index.js:726-752` | `dy_memory_person_archive` 使用 `exec.agent.session`（宿主工具上下文） | 比 service 更可信 |
| `lib/index.js:1106` | 自动注入 `carryoverFor(db, cwd,{sid})` | 当前 session |

**信任边界**：
- 自动路径：cwd/sid 来自 agent session（host 注入）——相对可信。
- Service 路径：`opts.header` 由 **consume 方**传入；`isTrustedHeader` 只证明“id+cwd 曾在宿主观测表中”，不能证明“调用方持有该 session”。
- 工具路径：`exec.agent` 由宿主注入，是当前最可信的上下文。

## 4. 可伪造输入与信任提升

| 输入 | 来源 | 是否可伪造 | 说明 |
|---|---|---|---|
| `input.cwd` | 调用方参数 | 是 | 修复后不再当 header；仅目标 cwd，必须与 header 一致 |
| `opts.header` | service 消费方 | 是 | 普通对象；可复制 live session 的 id/cwd |
| `opts.session.header` | service 消费方 | 是 | 同上 |
| `liveSessions` 内容 | 宿主事件 | 否（写入路径） | 但插件可 `agents.list()` 读取真实 agent/header，或 `agents.create()` 创建 owner-cwd session，从而进入表 |
| `agents.get/list` | Host 服务 | 插件可读 | 暴露所有 live agent/session.header |
| `agents.withInitiator` | Host 服务 | 插件可调用 | 源码明确不是授权 |
| `exec.agent.session` | 宿主工具执行上下文 | 不能由 args 注入 | 工具路径的信任根 |
| `session.header` | Host 构造 | 普通 JSON | 无签名/秘密；deep-freeze 只防改，不防读/复制 |

**信任提升点**：
1. 插件 `agents.list()` 复制真实 session.header → 通过 id+cwd 检查；
2. 插件 `agents.create({sessionId, meta:{cwd:home}})` 创建一个 owner-cwd 的新 session（若 factory 允许）→ `agent/created` 注册 → 通过检查；
3. 插件用 `withInitiator(realAgent)` 包裹调用 → 若 Memory 未来用 initiator，仍可被伪造；
4. service 调用方自造 `opts.header` 与目标 cwd 一致。

## 5. 消费者兼容性

| 消费者 | 调用 API | 当前 context/header | 来源 | 能否取得可信 capability |
|---|---|---|---|---|
| Autonomy `lib/io/memory.js` | `recall` / `episodeRecent` / `addEpisode` / `saveDiary` | 读：**不带 header**（降级空）；写：`{origin:'plugin',plugin:'dsh-autonomy'}` | 插件自行组装 | 不能（无 Host capability）；写身份是白名单，不是 session |
| Autonomy `lib/run/home.js:803-815` | `handoffBrief` | `header:{cwd:row.cwd,id:row.home_session_id}` | **插件自行组装** | 不能；当前 header 是自述字符串 |
| HUD `lib/index.js:969-974` | `resolveConflict` | `header:{id:'dsh-hud',cwd:home}` | 插件自行组装 | 不能；`resolveConflict` 非 raw 读取，但同样暴露问题 |
| GUI / DSH API | 未发现直接 `dyMemory` 调用；GUI 走 API session controller / 工具 | `exec.agent.session`（工具）或 host API | Host | **UNKNOWN**：未在 DSH 包中找到 `dyMemory` 直接调用；GUI 通过工具时 `exec.agent` 可信 |
| 其他 plugin-src | `grep dyMemory` 仅 autonomy/hud/memory 自身 | — | — | 无更多消费者 |

**后台/定时任务**：Autonomy tick 没有 agent session；应使用 **plugin write identity** 或显式 owner 授权，不得使用 owner raw capability。当前读路径无 header，降级为空——这是正确方向，不应为了“能读”而伪造 header。

## 6. 候选方案比较

| 方案 | 安全根 | 伪造难度 | 跨插件冒用 | 生命周期 | 兼容/成本 | 需 Host 改 | 需 Memory 改 |
|---|---|---|---|---|---|---|---|
| A. Host 注入不可伪造 capability 对象 | Host 私有 WeakMap/对象身份 | 高（若对象不经 agents 暴露） | 低（需对象引用） | Host 创建/销毁 | 消费者需 host 注入；现有 service 调用需改 | **是** | 是 |
| B. Host 签发短期签名 token | Host 密钥 | 高（若密钥不暴露） | 中（token 可被持有者转交） | 签发/过期/撤销 | 需 token 传输/校验/密钥管理 | **是** | 是 |
| C. Host 受控验证 API | Host 内部 session 状态 | 中（验证 API 需认证调用方） | 取决于 caller 绑定 | Host 管理 | 每次调用 Host；兼容需新 API | **是** | 是 |
| D. 仅工具 `exec.agent` 路径 | 宿主工具 dispatch | 高（args 不能注入 exec） | 低 | 随 session | 需 Autonomy/GUI 改走工具/宿主中介 | 可能（工具调用中介） | 是（移除/收窄 service raw 读取） |

**评估**：
- A/B/C 都要求 Host 新增能力；当前 Host 无签名/ACL/私有 capability 证据（§2）。
- D 不要求新密码学，但要求消费方改走工具/宿主中介；对 Autonomy 现有 `dyMemory` service 调用是破坏性变更。
- 仅靠 Memory 的 `liveSessions`/id+cwd 无法防 §4 的 1/2/3。

## 7. 推荐架构（PROPOSAL，需 Host 修改）

### 7.1 推荐：Host-minted opaque Session Capability（方案 A）+ 工具路径作为兼容入口

1. **Host 私有 capability**：Host 为每个 Runtime Session 创建不可伪造对象（或私有 WeakMap 记录），只通过 **受控 API** 发给该 session 的合法持有者；不进入 `session.header`、不被 `agents.list/get` 返回。
2. **Memory 验证**：service 接受 `opts.capability`；Memory 调 Host 的 `verifyCapability(capability, sessionId?)`（Host 内部校验对象身份/生命周期/绑定），返回 `{ok, sessionId, scope, issuedAt, expiresAt}`。
3. **绑定范围**：capability 至少绑定 session id、cwd/conversation、主体类型（owner/contact/group）；Memory 读取 cwd 必须与 capability 一致。
4. **生命周期**：session 创建时签发；切换/轮换重新签发；销毁/归档/撤销立即失效；重启不持久化（或使用 Host 重启密钥轮换）。
5. **工具路径**：`exec.agent.session` 由 Host 直接注入，继续作为可信根；`person_archive` 已按此实现。

### 7.2 备选（若 Host 短期不能改）：D — 仅工具/宿主中介

- 移除/收窄 `dyMemory.carryover` 的 raw 读取，只保留工具（`exec.agent`）或 Host 中介调用；
- Autonomy/GUI 若需 raw，必须由 Host 提供带 `exec.agent` 的中介 API；
- 优点：不依赖新密码学；缺点：消费者改造，且无服务级能力。

### 7.3 为什么不推荐 B/C 单独使用

- B：token 若存于 session.header/agent 对象，会被 `agents.list` 读取；若存于 Host 私有映射，则需要先解决“谁能取 token”的调用者绑定，回到 A/C 的 caller 认证问题。
- C：验证 API 若只回答“session 是否存在/cwd”，插件创建 owner-cwd session 仍通过；若回答“调用者是否有权”，仍需 caller 身份（Host 目前只有 initiator，且明确非授权）。

## 8. Capability 生命周期设计（PROPOSAL）

| 阶段 | 行为 |
|---|---|
| 创建 | Host 在 session/agent 创建后签发；绑定 `sessionId`, `cwd`, `conversationId`(若有), `subjectType`, `issuedAt`, `version` |
| 使用 | 消费方每次受保护读取传 capability；Memory 调 Host verify；不匹配/过期/撤销 → `E_CAPABILITY_*` |
| 轮换 | session 切换/重连/轮换 → 旧 capability 标记 revoked，签发新；旧请求 fail closed |
| 销毁 | session disposed/archived → Host 标记 capability 无效；Memory 不缓存有效结果 |
| 重启 | 不持久化 capability；Host 重启后旧 capability 一律无效（或按 Host 密钥轮换） |
| 审计 | 记录 sessionId、capability id、consumer、scope、result；不记录 raw |

## 9. 负向测试矩阵（设计，不修改测试）

| # | 攻击/误用 | 预期拒绝 | 错误码/审计 | 测试位置建议 |
|---|---|---|---|---|
| 1 | 插件自造同 id+cwd header | 拒绝 | `E_CAPABILITY_MISSING`；审计 caller | `tests/trusted-session-capability.test.mjs` |
| 2 | 复制真实 session.header | 拒绝（header 不是 capability） | 同上 | 同上 |
| 3 | session 销毁后旧能力 | 拒绝 | `E_CAPABILITY_REVOKED` | 同上 |
| 4 | capability 过期 | 拒绝 | `E_CAPABILITY_EXPIRED` | 同上 |
| 5 | capability 被撤销 | 拒绝 | `E_CAPABILITY_REVOKED` | 同上 |
| 6 | A 的 capability 用于 B | 拒绝 | `E_CAPABILITY_SESSION_MISMATCH` | 同上 |
| 7 | owner capability 用于非 owner scope | 拒绝 | `E_CAPABILITY_SCOPE_MISMATCH` | 同上 |
| 8 | 子代理/GUI 借用主会话 | 拒绝 | `E_CAPABILITY_BINDING_MISMATCH` | 同上 |
| 9 | 后台任务无 capability | 拒绝 raw；仅 plugin 写入 | `E_BACKGROUND_UNAUTHORIZED` | 同上 |
| 10 | 缺失/类型错误/伪造 capability | 拒绝 | `E_CAPABILITY_INVALID` | 同上 |
| 11 | Host 重启后旧 capability | 拒绝 | `E_CAPABILITY_EXPIRED/REVOKED` | 同上 |
| 12 | 插件注入伪造验证结果 | 拒绝（Memory 只信 Host verify 返回） | `E_CAPABILITY_INVALID` | 同上 |

每个用例需观察：错误码、审计（sessionId/caller/scope/result，不含 raw）、无部分敏感内容返回。

## 10. 对现有调用协议的影响

- `dyMemory.carryover`：新增/改为 `opts.capability`；现有 `opts.header` 仅保留兼容诊断（或拒绝）；Autonomy/HUD 需适配。
- `dyMemory.person_archive`（工具）：已用 `exec.agent`；保持。
- `dyMemory` 其他 raw/sensitive 方法（未来）：同样需 capability。
- 无 Schema/DB 变更；需 Host 新 API 与消费者适配。
- **本任务未修改任何协议**；以上为实施建议。

## 11. 后续实施任务拆分

1. Host：实现 private capability/verify API（`session` 创建/销毁/轮换钩子；拒绝 `agents.list` 暴露 capability）。
2. Memory：`carryover` 改用 `opts.capability` + Host verify；保留 fail closed；删除/降级 id+cwd 注册表作为唯一依据。
3. Autonomy/HUD/GUI：接入 Host capability；后台任务使用 plugin identity，不伪造 owner。
4. Tests：§9 矩阵；合成 session/capability；审计断言。
5. 契约：补充“service 身份必须来自 Host capability，不得用 header/cwd 声明”。

## 12. 未能确认的事项

1. DSH GUI 是否存在直接 `dyMemory` service 调用（在 DSH 包中未找到；GUI 可能走 API/tools）——**UNKNOWN**。
2. Host 是否愿意/能够新增 private capability API（当前源码无证据）——**BLOCKED 需 GPT/Owner 决策**。
3. `agents.create` 是否对所有插件开放 owner-cwd session（源码显示 public service + meta.cwd；实际调用权限未验证）——**源码可证明接口存在，运行时可达性 UNKNOWN**。
4. `session.header` 是否 deep-frozen（防改）；已读代码显示 header 对象，冻结细节未完全验证。
5. session `origin` 是否由 Host 强制（非调用方）——**UNKNOWN**。

## 13. 边界声明

本任务未修改任何业务代码、测试、Schema、数据库、配置、权限或调用协议；未部署/重启/连接真实设备/真实 QQ；未合并 PR；未启动 Memory v6/Persona v3/EI-2A。报告中的方案均为 PROPOSAL，不代表已批准或已实现。

## 14. 状态

**BLOCKED**：当前 Host/DSH 插件 API 无法证明“调用者持有某 Runtime Session 的可信身份”；Memory 侧 `id+cwd`/liveSessions 只能证明“该 session 曾被宿主观察”，不能防复制 header 或插件创建 owner-cwd session。需 GPT/Owner 决定 Host capability API 或工具/宿主中介方案后再实施。
