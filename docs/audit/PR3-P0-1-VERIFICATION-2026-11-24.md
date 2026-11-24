# PR3-P0-1-VERIFICATION-2026-11-24 · dsh-memory-core PR #3 实机验证

- 归档路径：`ba-song/dsh-memory-core` → `docs/audit/PR3-P0-1-VERIFICATION-2026-11-24.md`
- 仓库 / PR：`ba-song/dsh-memory-core` **PR #3**（Draft）· `P0-1: require trusted owner session for handoff briefs`
- 分支：`fix/p0-1-trusted-handoff-continuity`
- PR head：`56765116fea90d505a1d28d9c1a27c3abde5c6f6`（30 files，+2258/−128）
- base：`main` `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`
- 验证时间：2026-11-24 18:07–18:25（Asia/Shanghai）
- 性质：**只读 + 隔离 Host + 合成数据**。未合并、未部署、未改生产配置/插件/记忆；未读无关私人会话正文；未输出真实用户敏感数据。
- 结论：**不建议现在合并**；P0-1 的会话信任在 service 层基本成立，但 **tool 层原话读取、复制 header、关闭会话未撤销** 三个缺口使原始目标未闭合。先修复 B1–B3 再进入合并评审。

证据标签：**[S] 源码证实**、**[T] 隔离测试证实**、**[D] 设备/生产只读证实**、**[I] 推断**。

---

## 0. 结论摘要

| 项 | 结论 |
|---|---|
| PR 自动化测试 | **PASS**：155 tests / 155 pass / 0 fail / 0 skip，exit 0（本机实跑 head） |
| GitHub CI（head） | **PASS**：2 个 `test` run success |
| 宿主新建会话 → handoff | **PASS**（真实 owner 会话生成简报） |
| 伪造 session ID / 缺失 ID / cwd 不匹配 | **PASS**（service 返回空 / E_PERMISSION） |
| 复制可信 header | **FAIL**：`handoffBrief` 接受；`carryover` 仍能读取 owner 原话 |
| 关闭会话后信任 | **FAIL**：`session/disposed` 未观察；关闭后仍可 handoff/carryover |
| 原话读取 tool（`dy_archive_read` 等） | **FAIL**：只按 cwd 判断，伪造 owner header 直接读到 owner 原话 |
| 跨 Conversation 项目/决策/待办 | **PASS**（PR 测试 + 源码：handoff 只保留当前 recent，sections 为空） |
| 语义检索/上下文扩展 cwd 隔离 | **PASS**（PR 测试 `archive-semantic-scope`） |
| 普通记忆写入/召回 | **PASS**（隔离 Host：add id=1，recall 1 条合成命中；PR 测试全过） |
| 情绪/日记 | 测试 **PASS**；生产插件已加载；**运行时行为未执行**（只读边界） |

---

## 1. 设备与 DSHA 版本信息（不含敏感标识）

| 项 | 值 | 证据 |
|---|---|---|
| 设备 | vivo V2154A | [D] `/app/device` |
| Android | 14（SDK 34） | [D] `/app/device` |
| 内存/存储 | RAM 11.10 GB（free 2.93 GB）；存储 222.76 GB（free 94.85 GB） | [D] `/app/device` |
| 网络 | WiFi | [D] |
| DSHA App | `0.2.1-rc.2-20261022.2100-dsh0.2.1-rc.2`，APP_CODE=190 | [D] `/app/version` |
| Host | `@deepseek-ai/dsh` **0.2.1-rc.2** | [D] `package.json` |
| Node | v24.19.0 | [D] |
| 生产 Host | PID 30172，`web --host 127.0.0.1 --port 38105`，未停止/未重启 | [D] `/proc/30172/cmdline` |
| 运行环境 | `DSH_HOME=/root/.dsh`，`DSH_PERMISSION_MODE=danger-full-access` | [D] `/proc/30172/environ` |

> 未读取/输出序列号、IMEI、手机号、QQ 号、bridge token、真实会话正文。

---

## 2. 实际加载的插件版本与 commit

| 插件 | 安装版本 | commit/gitHead | 实际加载 | 证据 |
|---|---|---|---|---|
| `dsh-memory-core`（生产） | **0.1.0** | **无**（非 git 工作树，`gitHead` 缺失） | 是（profile bundle） | [D] `package.json`；[D] startup log `loaded` |
| `dsh-memory-core`（PR head） | 0.1.0 | `56765116fea90d505a1d28d9c1a27c3abde5c6f6` | **否**（仅在 `/tmp` 隔离验证） | [D] `/tmp/mem-pr3` |
| `dsh-persona-core` | 0.2.0 | 无 gitHead | 是 | [D] `package.json`；startup log `loaded` |

- 生产 `lib/index.js` sha256 前缀 `ed56b72be91ea4a34748d33a…`；PR head `ab07051b7378366de5bc7109…` → **PR 未部署到生产**。
- 生产 Host 启动观察：`dsh-memory-core` / `dsh-persona-core` 均 `loaded`；`[DSHA_STARTUP]` **issue 数 0**。
- `plugin-activations.json` 仅记录 `dsh-qq-onebot`（DSHA Python 写）；memory/persona 是 profile bundle，不在此清单。

---

## 3. 宿主事件字段及可信来源

### 3.1 PR 观察的宿主面（源码）

`lib/index.js`：
- `ctx.on('session/event', (session, event) => noteSession(session))`（:272）
- 启动时 `ctx.agents.list()` → `noteSession(agent.session)`（:1180）
- `ctx.on('agent/created', ({agent}) => noteSession(agent.session))`（:1284）
- `lib/session-trust.js`：只有 `observe(session)` 能登记；要求 **id + cwd 都非空**；`matches(header)` 只比对 **id + cwd**（无对象身份、无签名）；LRU 512。

### 3.2 字段

| 事件 | 字段 | 来源 | 可信程度 |
|---|---|---|---|
| `session/created` | `session.header`：`version,id,createdAt,cwd?,parentSession?,isSeeded,origin?,delegationDepth?,agentPreset?` | 创建调用方（API `sessionId`/`cwd` 或 `agents.create({sessionId,meta})`），header 深冻结 | **结构可信，身份不可信**（Host 审计已证：id/cwd 可由调用方构造）[S]+[D] |
| `session/event` | `(session, event{type,seq,time,data})` | 宿主 append；插件可 `ctx.emit` 尝试伪造 | 事件对象非签名；`seq/time` 由宿主 append 分配 [S] |
| `agent/created` | `{agent}`，`agent.session.header` | 宿主 Agent 创建 | 同上；payload 由宿主发出，但 session 字段来自创建方 [S] |
| `session/disposed` / `agent/disposed` | 会话/Agent 关闭 | 宿主 | **PR 未监听** → 信任不撤销 [S]+[T] |

### 3.3 关键边界

1. **registry 只证明"该 id+cwd 在本进程被宿主事件/列表见过"**，不证明"它属于主人"、也不证明"调用者就是该 session"。
2. **cwd 缺失 = 不可信**：`observe` 要求 cwd 非空；而 Host 的 session header 允许无 cwd（`meta.cwd` 可选）。生产里无 cwd 的 owner 会话将无法生成 handoff/carryover。
3. **关闭不撤销**：`session/disposed`/`agent/disposed` 没有 `noteSession`/`remove`；关闭后 header 仍 `matches`，直到 LRU 淘汰或同 id 重新 observe 覆盖 cwd。
4. **"callers cannot register identities" 仅对 registry API 成立**；任何能创建真实 session 的插件都能让宿主事件把它登记（Host 审计：插件可 `agents.create({sessionId, meta:{cwd}})`）。这是设计边界，不是 P0-1 能单独闭合的。

---

## 4. 各项测试结果

### 4.1 宿主会话身份

| 场景 | 结果 | 证据 |
|---|---|---|
| 新建真实 owner 会话 → handoff | **通过**（生成 `【交接简报】`） | [T] 隔离 Host |
| 切换（新会话）→ handoff | **通过**（新会话被宿主事件/列表 observe；本次以 `real-owner` 验证） | [T] |
| 关闭会话（`handle.dispose()`）→ handoff | **失败**：仍生成简报 | [T] 关闭后 `after-close-handoff` 非空 |
| 关闭后 `carryover` | **失败**：仍读到 owner 原话 | [T] `after-close-carry` 含合成 sentinel |
| 伪造 session ID（id=forged, cwd=owner）→ handoff | **通过**（空） | [T] |
| 伪造 session ID → carryover | **通过**（`E_PERMISSION: header 非受信运行时会话`） | [T] |
| 缺失 ID | **通过**（空） | [T] |
| cwd 不匹配（id 真, cwd=/other） | **通过**（空） | [T] |
| 缺失 cwd | **通过**（空；但合法无 cwd 会话会被误拒） | [T]+[S] |
| 同 ID 重建 / cwd 变更 | **部分**：registry 单测覆盖 observe 覆盖 cwd；Host 层同 ID 重建**未执行** | [S] `session-trust.test.mjs` |
| 伪造 `session/event` | **未执行/不确定**：尝试 emit 缺 seq 的假事件，Host `session-projection` 先抛 `SessionLogOffset must be ...`；无法判定完整伪造事件是否被 registry 接受 | [T] 尝试失败 |

### 4.2 原话归档读取

| 场景 | 结果 | 证据 |
|---|---|---|
| 当前可信 owner 会话读自己 cwd | **通过**（`carry-real` 返回合成 sentinel） | [T] |
| 其他会话/群聊/联系人不能越权 | **通过（PR 测试）**：`p0-1-raw-read-auth.test.mjs` 覆盖 owner/群/联系人/无上下文；设备端未逐房间重跑 | [T] PR suite |
| 语义检索按 cwd 过滤 | **通过**：`archive-semantic-scope.test.mjs`（命中/上下文/墓碑 3 项） | [T] PR suite |
| 上下文扩展不跨 cwd | **通过**（同上） | [T] PR suite |
| 复制可信 header → `carryover` | **失败**：读到了 owner 合成原话 | [T] `carry-copy` |
| 伪造 owner header → `dy_archive_read` tool | **失败**：`ctx.tools.get('dy_archive_read').execute` 用 `{id:'forged-tool',cwd:owner}` 读到 owner 合成原话 | [T] `tool-forged` |
| 关闭会话 → `carryover` | **失败**（见 4.1） | [T] |

> 根因：`sessionOf(exec)` 只从 `exec.agent.session.header` 取 cwd/id，**不查 `isTrustedHeader`**（`lib/index.js:86-96`；`dy_archive_read` :556-575，`person_archive` :726-745 等）。`carryover` 查 trust，但对 **header 副本** 不分辨对象身份。

### 4.3 交接简报

| 场景 | 结果 | 证据 |
|---|---|---|
| 可信 owner 当前会话 | **通过**（text 非空，含最后没回/最近话题） | [T] |
| 伪造会话 / cwd 不匹配 / 无身份 | **通过**（空） | [T] |
| 复制可信 header | **失败**：接受副本并生成简报（只含调用方提供的 recent，不读 owner 原话） | [T] `copy` |
| 关闭会话 | **失败**：仍生成 | [T] |
| 跨 Conversation 项目/决策/待办 | **通过**（sections.project/decisions/todos 为空；PR `handoff-brief` 测试） | [T]+[S] |
| 群聊/陌生人 | **通过（PR 测试）**：不泄漏项目/决策/待办；设备端未逐 cwd 重跑 | [T] PR suite |

### 4.4 现有功能回归

| 场景 | 结果 | 证据 |
|---|---|---|
| PR 全量测试 | **PASS** 155/155，0 fail，0 skip，exit 0（26.7s） | [T] `node --test tests/*.test.mjs` |
| GitHub CI（head） | **PASS**：2 个 test run success | [D] Actions |
| 记忆写入 `dy_memory_add` | **通过**：返回 `{ok:true,id:1}`（合成文本，临时 DB） | [T] 隔离 Host |
| 记忆召回 `recall('看海')` | **通过**：1 条 `合成记忆：测试偏好是看海` | [T] |
| 情绪测试 `emotion.test.mjs` | **通过**（在全量 155 内） | [T] |
| 日记测试 `diary-service.test.mjs` | **通过**（在全量 155 内） | [T] |
| 生产情绪/日记运行时行为 | **未执行**（只读边界；未调用生产记忆/情绪/日记） | [D] 仅加载观察 |
| 生产插件加载 | `dsh-memory-core` / `dsh-persona-core` loaded；startup issue=0 | [D] startup log |

---

## 5. 关键日志证据（脱敏）

### 5.1 PR 全量测试

```
ℹ tests 155
ℹ pass 155
ℹ fail 0
ℹ skipped 0
EXIT=0
```

### 5.2 隔离 Host 探针（PR head 插件；合成 owner `/tmp/pr3-host/owner`；合成数据）

```json
["real",  {"ok":true,"text":"【交接简报】…"}]
["forged",{"ok":true,"text":""}]
["mismatch",{"ok":true,"text":""}]
["missing-id",{"ok":true,"text":""}]
["missing-cwd",{"ok":true,"text":""}]
["copy",  {"ok":true,"text":"【交接简报】…"}]
["add",   {"ok":true,"id":1}]
["recall",{"count":1,"texts":["合成记忆：测试偏好是看海"]}]
["carry-real", {"ok":true,"text":"【上次聊到】…【上次聊到结束】"}]
["carry-copy", {"ok":true,"text":"【上次聊到】…【上次聊到结束】"}]
["carry-forged", {"ok":false,"code":"E_PERMISSION","msg":"carryover：header 非受信运行时会话"}]
["tool-get-type", {"defined":true,"execute":"function"}]
["tool-forged", {"ok":true,"count":1,"text":"18:17:08 [主人] 【上次聊到】合成原话测试"}]
["after-close-handoff", {"ok":true,"text":"【交接简报】…"}]
["after-close-carry", {"ok":true,"text":"【上次聊到】…"}]
```

- 合成 sentinel：`【上次聊到】合成原话测试`；无真实用户正文。
- 隔离环境：`DSH_HOME=/tmp/pr3-host/home`、`DY_MEMORY_DIR=/tmp/pr3-host/data`、独立端口 39136；未连接生产 profile/38105/记忆目录。

### 5.3 启动与加载（生产只读）

```
[DSHA_STARTUP] {"type":"loaded","plugin":"dsh-memory-core",...}
[DSHA_STARTUP] {"type":"loaded","plugin":"dsh-persona-core",...}
issue_count=0
```

### 5.4 CI（PR head）

- https://github.com/ba-song/dsh-memory-core/actions/runs/45351955525/job/138300321545 — success
- https://github.com/ba-song/dsh-memory-core/actions/runs/45351963276/job/138300348045 — success

---

## 6. 对汐当前行为的潜在影响

1. **当前无影响**：PR 未部署；生产 memory-core 仍是 0.1.0（`ed56b72b…`），不包含本轮信任代码。
2. **若部署后**：
   - **handoff/carryover 会对无 cwd 的 owner 会话返回空**（生产 GUI 会话若没有 `meta.cwd`，会被 `observe` 拒绝）。这是可见的行为变化。
   - **关闭会话仍可用**：已关闭会话的 header 在进程内继续被信任，直到 LRU 淘汰/重启；重启后 registry 清空（`agents.list` 重新登记活会话）。
   - **原话读取仍可被伪造 header 绕过**：`dy_archive_read`/`person_archive` 等 tool 只按 cwd 判断，安全声明与实际不一致。
   - **复制 header**：任何能读到 owner live header 的插件可调用 `dyMemory.carryover` 读 owner 原话；`handoffBrief` 只泄露调用方自己的 recent，影响较小。
   - **跨 Conversation**：项目/决策/待办被刻意 fail-closed；交接简报信息量下降（预期设计，但用户可感知）。
   - **情绪/日记**：PR 测试通过，代码未改生产；运行时行为未验证。
3. **性能**：`noteSession` 在每条 `session/event` 上执行，Map LRU O(1)；影响可忽略。

---

## 7. 阻断部署的问题

| ID | 问题 | 等级 | 证据 |
|---|---|---|---|
| B1 | **tool 层原话读取不查 trust**：`sessionOf` 只取 cwd；`dy_archive_read`/`person_archive` 等用伪造 owner header 即可读 owner 原话 | **BLOCKER** | [S] `lib/index.js:86-96,556-575,726-745`；[T] `tool-forged` |
| B2 | **复制 header 通过**：`carryover`/`handoffBrief` 只比对 id+cwd，没有对象身份/nonce；`carry-copy` 读到 owner 原话 | **BLOCKER** | [T] `carry-copy`；[S] `lib/session-trust.js` |
| B3 | **关闭不撤销**：未监听 `session/disposed`/`agent/disposed`；关闭后 handoff/carryover 仍成功 | **BLOCKER** | [S]+[T] `after-close-*` |
| B4 | **无 cwd 会话不可信**：`observe` 要求 cwd；合法 owner 会话若没有 cwd 会被静默拒绝（可用性/兼容） | **HIGH** | [S] `session-trust.js`；[D] Host 审计 cwd 可选 |
| B5 | **"host-observed" 依赖未认证的会话创建**：插件可 `agents.create({sessionId,meta.cwd})` 创建 owner-cwd 会话并成为 trusted；Host 不签名/不校验创建者 | **HIGH（跨模块）** | [S]+[D] Host 审计 |
| B6 | `session/event` 事件是否可被完整伪造未验证；本次只证明缺字段假事件被 projection 拒绝 | **MEDIUM（未验证）** | [T] 尝试 |

---

## 8. 建议修复项

1. **对象身份，而不是 header 副本**：`handoffBrief`/`carryover` 接受 `opts.session` 或 `exec.agent.session` 的 **live 对象**，校验 `observedSessions.has(session)`（WeakSet）且 `session === agent.session`；拒绝纯 `input.header`。`handoffBrief` 当前 `input.header` 回退必须移除或仅限受信内部调用。
2. **关闭撤销**：监听 `session/disposed`/`agent/disposed`，从 registry 删除；`observe` 记录 session 对象（WeakRef/WeakSet），不只 header；LRU 仅作上限。
3. **tool 层统一 trust gate**：所有 raw read 工具（`dy_archive_read`、`dy_memory_person_archive`、`dy_memory_quote_search`、`dy_memory_raw_verify`、`dy_archive_tools_overview`、`dy_archive_research`）在 `sessionOf` 后加 `isTrustedHeader`/live 对象校验；失败返回 `E_PERMISSION`。
4. **cwd 策略**：明确 owner 会话无 cwd 时是 fail-closed 还是从 workspace 派生；若 fail-closed，需在 UI/配置保证 owner 会话有 cwd，并加告警。
5. **事件来源加固**：`noteSession` 只在 `session` 对象确实是 loader/agents 的 live session 时登记；不要仅凭 `ctx.emit` payload；或要求 session 对象带 registry token。
6. **补测试**：
   - tool forged header（owner/group/contact）；
   - copied header（service + tool）；
   - closed session（handoff/carryover/tool）；
   - no-cwd owner session（可用性）；
   - plugin-created session（设计边界）；
   - full fake `session/event`（完整字段）是否被接受。
7. **文档**：`docs/CROSS-CONVERSATION-AUTHORIZATION.md` 的 fail-closed 结论可保留；但需在 PR 描述中明确 "tool 层 raw read 仍未覆盖"，不要用 service 证据外推。

---

## 9. 是否建议 PR #3 进入合并评审

**不建议现在合并；建议先修复 B1–B3（并处理 B4/B5 的设计说明），补测试后再进入合并评审。**

- 可以进入**代码评审**：改动方向正确（服务层 trust、跨 Conversation fail-closed、语义 cwd 隔离、LRU），155/155 测试与 CI 绿。
- 不应直接合并：P0-1 的核心声明 "raw archive reads require trusted host session" 在 **tool 层不成立**；"live session" 在 **关闭后不成立**；复制 header 仍可读 owner 原话。
- 修复后建议复审：重跑 155 测试 + 本报告的隔离探针（tool/copy/close），并由 GPT/负责人确认 "对象身份 + 撤销 + tool gate" 三项均有负向测试。

---

## 10. 证据分级、未执行与副作用

| 项 | 状态 |
|---|---|
| 源码证实 | PR head `56765116` 的 `lib/session-trust.js`、`lib/index.js`、`lib/service.js`、`lib/recovery/raw-archive.js` |
| 测试证实 | PR 全量 155/155；隔离 Host 探针（合成数据） |
| 设备证实 | Android 14/vivo、DSHA App 版本、生产 PID、startup loaded、只读 `/app/device` |
| 推断 | 群/联系人 tool 读取、未测试的事件伪造、生产无 cwd 会话比例 |

**未执行（NOT RUN）**：
- 生产部署/合并；生产 GUI 新建会话；真实 owner 数据读写；真实情绪/日记运行时；群/联系人房间的 tool 逐项实测；同 ID 重建 Host 级；完整伪造 `session/event`；PR 的 recovery planner 运行时（只读模块，测试已过）。

**副作用**：未改生产代码/配置/DB/设备；未写生产记忆；隔离 Host 只写 `/tmp/pr3-host`、`/tmp/mem-pr3`（合成数据），进程已退出；生产 PID 30172 未重启。
