# P0-1 carryover 读取范围与越权面 · Memory 专项只读审查

- 任务：P0-1 Memory Core carryover 读取范围与越权面审查
- 时间：2026-11-22 23:5x–00:3x (Asia/Shanghai)
- 性质：只读安全审查；未改代码/测试/schema/DB/合同/配置；未部署/重启/合并。
- 结论：**PARTIAL / 发现 1 个已复现越权面 + 2 个源码可证明的跨会话输出缺口**

## 1. 基线

| 项 | 值 |
|---|---|
| 仓库/分支 | `ba-song/dsh-memory-core` / `fix/p0-1-cross-conversation-memory-outputs` |
| 任务已知基线 | `4bcfc1d4e2544d643ae689e7fcc62f1ad786ef20` |
| **实际 HEAD** | **`16020381656986e0cea585928e7009ef5341b70d`**（P0-1 测试基线修复提交） |
| 与已知基线差异 | 仅 `tests/pins.test.mjs`（`git diff --name-only 4bcfc1d..1602038`）；生产代码与 4bcfc1d 相同 |
| 环境 | Node v24.19.0 / npm 11.17.0；隔离 worktree `/tmp/p0-1-verify` |
| 测试 | 本轮未新增/修改测试；引用已通过的全量 137/137（测试修复提交） |

## 2. carryover 完整调用链

### 2.1 自动注入路径
`lib/index.js:1096`（`const cwd = String(header.cwd ?? '')`）→ `lib/index.js:1106` `carryoverFor(db, cwd, { sid })` → `lib/inject/carryover.js:6-16` SQL `WHERE cwd=? AND tombstone=0 AND role IN (...)`（并排除当前 sid 文件）。cwd 来自当前 agent session header，sid 来自当前 session；自动路径与请求 cwd 绑定。

### 2.2 显式 service 路径
`dyMemory.carryover`（`lib/service.js:673-681`）：
1. `guard('carryover', resolveHeader(input, opts))`（`service.js:674`）
2. `resolveHeader`（`service.js:77-85`）：按候选顺序取 header；`looksLikeHeader` 仅检查任一 `HEADER_KEYS` 存在（`service.js:63-69`），**`input.cwd` 本身即被视为 header**。
3. `scopeForHeader`（`lib/index.js:1050`）：`scopeForSession({cwd: h.cwd, sessionId: h.id, isOwner: isOwnerCwd(h.cwd)})`；owner 判定来自 `classifyOwner`（`lib/owner.js:86-115`，ownerPrivateDir/binding/trustedDirs）。
4. `cwd = String(input?.cwd ?? '').trim()`（`service.js:678`）；`input.cwd` 与 header 可同一字段。
5. `carryoverFor(db, cwd, { limit })`（`service.js:680`）→ `carryover.js` SQL。
6. `dyMemory` 通过 `ctx.provide('dyMemory', memoryService)` 暴露给插件/GUI/其他消费方（`lib/index.js:1061`）。

**关键**：`guard` 不做调用方身份认证（只拦 subagent/plugin origin），`scopeForHeader` 用**请求中的 cwd**判定 owner；因此“owner 权限”与“目标房间”由同一个 `input.cwd` 决定，而不是由调用方真实 session 决定。

## 3. 攻击/误用场景

### 场景 1（**已复现**）：无真实 session/header，传 `cwd=owner home` 读取 owner 原始对话
调用：
```js
dyMemory.carryover({ cwd: '/sdcard/DSHA/生活/数据/home', limit: 5 })
```
- `resolveHeader` 把 `{cwd:home}` 当 header；`guard` 通过；`classifyOwner(home)` 判 owner；`carryoverFor` 返回 home 的 raw。
- 临时库探针（`/tmp/p0-1-carryover-probe.mjs`，合成数据）输出：
  `no_header_cwd_home.hasHome = true`，返回 `【上次聊到】…HOME_SECRET_SENTINEL…`。
- 影响：任何能调用 `dyMemory` service 的插件/GUI/消费方（即使不是 owner 会话）都能读取 owner home 原始对话。
- 说明：这是“owner 数据越权读取”，不是跨联系人房间读取（见场景 4）。

### 场景 2（**源码可证明**）：`dy_memory_person_archive` 无 owner/会话授权检查，跨房间返回 raw
- `lib/index.js:715-728`：`execute: async (args) => { ... SELECT ... FROM raw_meta WHERE person_id=? ... }`，**没有 `sessionOf`/`isOwner`/scope 检查**；不给 personId 时还返回所有有原话的人。
- 工具注册为全局 `reg`（`lib/index.js:348`），无 owner 限定；任何能调用该工具的会话（群/联系人）都可跨房间/渠道读取 raw（每条 300 字）。
- 影响：P0 级跨会话原文泄漏（工具描述“跨房间/渠道”本身即风险）。

### 场景 3（**源码可证明**）：`dy_memory_group_archive` 的群原文归档共享 `GROUP_CWD`，可跨群
- `lib/service.js:551-576` `saveGroupTranscript` 把群全文写入 `cwd=GROUP_CWD`（`/sdcard/DSHA/渠道/qq-群`），**不写 group_id 列**；
- `lib/index.js:679-697` 的归档工具查询 `WHERE cwd=GROUP_CWD`；有 `groupId` 时仅 `raw_text LIKE %gid%`，无 gid 时返回**全部群**最近 raw；
- 授权为 owner/trustedDir（`sessionOf(exec,isOwnerCwd)` + `trustedDirs`）；但内容层面是跨群混合；且 `trustedDirs` 命中即可读。
- 影响：owner/受信会话可跨群读取原文；群归档无法按群精确隔离（与 P0-1 目标相关）。

### 场景 4（**未复现**）：任意 `input.cwd` 读取其他联系人私聊
- 探针结果：`no_header_cwd_contact`、`forged_header_plus_contact_cwd`、`contact_with_owner_opts_header` 均返回 `''`（`hasContact=false`）。
- 原因：`resolveHeader` 先看 `input`；`input.cwd` 是 HEADER_KEY，故 header 与读取 cwd 相同；`scopeForSession(contact)` = external → `if (scope.level !== 'owner') return ''`。
- 因此“owner header + 任意 contact cwd”在 carryover 上被同字段绑定阻断；但这是**偶然耦合**，不是明确授权设计，不能作为安全保证。

### 场景 5（**推测/未验证**）：伪造 header 形状调用其他 service
- `guard` 只做形状检查；`resolveHeader` 接受 `input.header`/`input.session.header`；`scopeForHeader` 只信 `header.cwd`。对于 `recall`/`episodeRecent`/`shorttermRecent`/`publicBrief`/`handoffBrief` 等，若消费方有 service 访问权，可构造 `{header:{cwd:ownerHome}}` 获得 owner scope（具体可读内容受各方法限制）。
- 本轮只验证 carryover；其他方法未逐一复现，标 **未验证**。

### 路径别名/规范化
- `carryoverFor` 使用 `WHERE cwd=?` 精确匹配；`home/` 尾斜杠探针返回空（无 DB 行匹配）；`..` 遍历未发现可命中 DB 的路径；未复现别名绕过。
- 但 `classifyOwner` 对 `ownerPrivateDir` 是精确匹配、对 `trustedDirs` 是前缀匹配（`isTrustedDir`），若配置把宽目录列入 trustedDirs，scope 扩张风险存在（配置未验证）。

## 4. 权限模型问题

| 维度 | 现状 | 问题 |
|---|---|---|
| owner 身份 | `isOwnerCwd(cwd)` 基于请求 cwd 路径/绑定 | 请求方可影响“自己是不是 owner” |
| 当前会话身份 | 自动路径用 session header；显式 service 可传 `input.cwd` 当 header | 会话身份未与 header 绑定校验 |
| 房间访问范围 | 由同一个 `cwd` 推导并读取 | 授权与目标耦合，无法表达“当前会话可读范围” |
| 自动 vs 显式 | 自动：当前 session cwd+sid；显式：请求 cwd | 规则不一致（显式缺 sid，且 cwd 可请求） |

**结论**：owner 身份、当前会话身份、房间范围被错误地压成“请求 cwd”一个维度；`carryover` 的显式 API 尤其明显。

## 5. 其他 raw 输出入口

| 入口 | 授权 | 读取范围 | 风险 |
|---|---|---|---|
| `dy_memory_carryover`（service） | 仅 `guard` 形状 + 请求 cwd 判 owner | 请求 cwd 的 raw | **已复现 owner home 泄漏** |
| `dy_memory_person_archive`（tool） | **无** | 按 person_id 跨房间 raw | **P0 跨会话泄漏** |
| `dy_memory_group_archive`（tool） | owner/trusted | `GROUP_CWD` 全部群 raw | P1 跨群混合 |
| `dy_archive_read`（tool） | scope（owner 可 `raw=all`，external `raw=own`，group `raw=none`） | owner 读所有房间 | owner 显式工具；是否允许跨房间需 Owner/契约决定（未验证） |
| `dy_archive_research` | 同上 | 同上 | 同上 |
| `dy_memory_recall`/`episodeRecent`/`shorttermRecent` | scope 过滤 | 长期记忆/shortterm，非 raw 原文 | 需单独评估（本任务聚焦 raw） |

## 6. 推荐最小修复

1. **carryover 服务改为“会话绑定”**：
   - 只接受运行时注入的 `opts.header`/`session.header`（含 `id`），**忽略/拒绝 `input.cwd`**；`input.cwd` 与 `header.cwd` 不一致 → `E_PERMISSION`（fail closed）。
   - `guard` 增加“header 必须来自受信调用路径”的约束（至少要求 `id` 且与当前 agent session 一致；不能在 service 内部验证时，由宿主注入可信 header）。
   - 自动路径保持 `cwd+sid`。
2. **person_archive**：加 `sessionOf(exec,isOwnerCwd)`；非 owner private → 拒绝（返回空 + 审计）；owner 跨房间需显式授权参数/审计；默认按当前 scope 过滤。
3. **group_archive**：要求 `groupId`；群 transcript 增加 `group_id` 列（或按群分目录），按 `group_id=` 查询，禁止 `raw_text LIKE` 与无 gid 全量返回；owner/trusted 检查保留。
4. **dy_archive_read**：owner 跨房间读取改为显式“跨会话”开关 + 审计，或默认当前 cwd；由 Owner/契约决定。
5. **通用**：`resolveHeader` 不应把 `input.cwd` 当 header；service 方法统一从 `opts.header` 取，禁止把业务参数（cwd）混入身份。

## 7. 建议测试

| # | 测试 | 预期 |
|---|---|---|
| 1 | 非 owner/无 session 调 `carryover({cwd:home})` | `E_PERMISSION`/空；不得返回 home raw |
| 2 | owner 调 `carryover({cwd:contact})` | 空/拒绝；不得读 contact raw |
| 3 | `input.cwd` 与 header.cwd 不一致 | `E_PERMISSION`，无输出 |
| 4 | `carryover` 无 sid 排除 | 自动路径仍排除当前会话；显式路径不返回当前会话 |
| 5 | person_archive 群/联系人会话调用 | 拒绝/空 + 审计；owner 调用受 scope 限制 |
| 6 | group_archive 无 groupId | 拒绝/空；有 gid 只返回该群 |
| 7 | group transcript 按 group_id 存储 | 群 A 查不到群 B |
| 8 | archive_read 非 owner | 只读 own；group 空 |
| 9 | 伪造 header 形状 | 拒绝（无真实 session） |
| 10 | 路径尾斜杠/`..`/别名 | 不扩大读取范围 |

## 8. 修复后 fail-closed 行为

- 无可信 header/session → `E_PERMISSION`（不返回 raw）。
- `input.cwd` 与 header.cwd 不一致 → `E_PERMISSION`（不忽略、不猜测）。
- 非 owner 请求 owner 房间/其他房间 → 空 + 审计。
- 缺 groupId/无 group_id 列 → 空/拒绝，不返回全群混合。
- 任何无法验证的 scope → `E_SCOPE`/空，不回退到“全房间”。

## 9. 契约/迁移

- **carryover 修复**：属于实现安全修复，不需要改合同；但建议在接口契约中明确“服务身份来自可信 header，不得用业务参数充当身份”。
- **person_archive/group_archive**：涉及工具权限与群归档 schema（group_id 列/分目录），需要 **单独授权**；当前未授权 Schema/迁移。
- **不涉及** Owner ID、有效性、confidence 等合同字段。

## 10. 分类结论

| 项 | 分类 |
|---|---|
| carryover 无 session 读 owner home | **已复现** |
| carryover 任意 cwd 读其他联系人 | **未复现（同字段 scope 阻断）** |
| person_archive 无授权跨房间 | **源码可证明**（未运行工具） |
| group_archive 跨群混合 | **源码可证明** |
| 伪造 header 其他 service | **推测/未验证** |
| 路径别名绕过 | **未复现** |
| 生产实际可达性 | **未验证**（未连接生产/真实插件调用链） |

## 11. 状态

**READY_FOR_REVIEW**（只读审查完成；等待 GPT 决定是否安排修复）。
