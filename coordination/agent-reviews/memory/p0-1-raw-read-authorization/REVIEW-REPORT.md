# P0-1 原始对话读取授权修复 · Memory Core 报告

- 任务：P0-1 Memory Core 原始对话读取授权修复
- 时间：2026-11-22 23:4x–00:2x (Asia/Shanghai)
- 性质：开发分支安全修复 + 合成数据测试；未合并/部署/重启；未改生产 data/DB。
- 状态：**PARTIAL**（两个指定缺口均已修复并有测试；但 in-process header 信任链仍非密码学可信，见 §7）

## 1. 基线与最终状态

| 项 | 值 |
|---|---|
| 仓库/分支 | `ba-song/dsh-memory-core` / `fix/p0-1-cross-conversation-memory-outputs` |
| 修复前基线 HEAD | `16020381656986e0cea585928e7009ef5341b70d`（任务已知；与 4bcfc1d 差异仅 tests） |
| **最终 HEAD** | **`d376a157d9307b34efb7af482a89f40fbe6c8061`** |
| tree | `848674b0b3c2277bef2ee34bf8f339675b5949c9` |
| 修复 commit | `d376a157d9307b34efb7af482a89f40fbe6c8061`（`fix(memory): require trusted session for raw reads (P0-1)`） |
| 环境 | Node v24.19.0 / npm 11.17.0；隔离 worktree `/tmp/p0-1-verify` |
| 测试 | **139 tests / 139 pass / 0 fail / 0 skip / exit 0**（全量） |

## 2. 修改文件

| 文件 | 变更 |
|---|---|
| `lib/service.js` | carryover 服务改为只接受 `opts.header`/`opts.session.header`；要求 session id；要求 `isTrustedHeader` 校验；cwd 必须与 header.cwd 一致；owner-only；传 sid 排除当前会话 |
| `lib/index.js` | 新增 `liveSessions` 注册表（仅由宿主 `session/event`、`agent/created`、启动 `agents.list` 写入）；注入 `isTrustedHeader`；`dy_memory_person_archive` 改为 `sessionOf` 授权 + 仅当前 cwd；工具描述同步 |
| `tests/p0-1-raw-read-auth.test.mjs` | 新增 2 个测试（carryover 授权矩阵、person_archive 授权矩阵） |

**未修改**：`dy_memory_group_archive`、`saveGroupTranscript`、`dy_archive_read`/`research`、`resolveHeader` 全局行为、Schema、DB、合同。

## 3. 修复证据

### 3.1 carryover（`lib/service.js:675-696`）

- 身份来源改为 `resolveHeader(opts?.header, opts?.session?.header)`，**不再读取 `input`**；`input.cwd` 只作为目标 cwd。
- 缺少 header / 缺少 id → `E_PERMISSION`（`service.js:677-679`）。
- `guard` 拒绝 subagent/plugin（`service.js:680`）。
- `isTrustedHeader` 必须存在且返回 true（`service.js:681-683`）；由 index 注入，校验 id+cwd 与宿主观测到的 live session 一致。
- 非 owner → `E_PERMISSION`（`service.js:686-688`）。
- `input.cwd`（或默认 header.cwd）必须严格等于 header.cwd，否则 `E_PERMISSION`（`service.js:689-693`）。
- 读取时传 `sid`，继续排除当前 session 文件（`service.js:694-695`）。
- 自动注入路径未改：`lib/index.js:1106` 仍使用 session cwd + sid。

### 3.2 可信 session 来源

- `liveSessions`（`lib/index.js:163-170`）只由宿主事件写入：
  - `session/event`（`index.js:278`）
  - `agent/created`（`index.js:1295`）
  - 启动时 `agents.list()`（`index.js:1191`）
- 注入 `isTrustedHeader`（`index.js:1071-1077`）：`liveSessions.get(id).cwd === header.cwd`。
- **限制**：这是“宿主观测过的 session id+cwd”注册表，不是密码学凭证；能构造 `opts.header` 且知道某个 live id/cwd 的 in-process 插件仍可能伪造。完整方案需宿主注入不可伪造 capability/签名 token（见 §7）。

### 3.3 person_archive（`lib/index.js:726-752`）

- `execute(args, exec)` 先从宿主 `exec.agent.session` 取 `sessionOf`（`index.js:732`）；
- 无 id/cwd 或非 owner-private → `E_PERMISSION` + `auditScopeDenied`，返回空 items/persons（`index.js:733-736`）；
- 查询强制 `cwd = 当前 session cwd`（`index.js:740`），不再跨房间；
- 无 personId/空 personId → 只列当前会话 person，不返回 raw（`index.js:744-746`）；
- personId + 当前 cwd → 返回该人最近 N 条（`index.js:748`）；
- 工具描述同步为“仅当前 Conversation”（`index.js:727`）。

## 4. 测试与结果

| 命令 | 目录 | 结果 |
|---|---|---|
| `npm ci` | `/tmp/p0-1-verify` | exit 0（onnxruntime postinstall allow-scripts 警告，不阻断） |
| `node --test tests/p0-1-raw-read-auth.test.mjs` | 同上 | 2/2 pass，exit 0 |
| `npm test` | 同上 | **139/139 pass，0 fail，0 skip，exit 0** |

完整日志：`/tmp/p0-1-raw-auth-final.log`（本机临时；关键输出：`ℹ tests 139 / pass 139 / fail 0 / skipped 0 / EXIT=0`）。

## 5. 关键测试覆盖

**carryover**
1. 无 header/session、仅 owner home cwd → `E_PERMISSION`；
2. 伪造 `{cwd,id}` 未注册 header → `E_PERMISSION`；
3. 联系人 header 请求 owner home → `E_PERMISSION`；
4. 群聊 header 请求 owner home → `E_PERMISSION`；
5. owner `input.cwd` 与 header.cwd 不一致 → `E_PERMISSION`；
6. owner cwd 一致 → 返回当前授权范围内容（home sentinel，不含 contact/group）；
7. 缺 session id → `E_PERMISSION`；
8. subagent header → `E_PERMISSION`；
9. 自动注入路径保持（未改 `index.js:1106`；既有 carryover 测试通过）；
10. 当前 session 文件仍被 sid 排除（测试 `CURRENT_SESSION_RAW` 不出现，`PREV_SESSION_RAW` 出现）。

**person_archive**
1. 群聊调用 → `E_PERMISSION`，items 空；
2. 联系人调用 → `E_PERMISSION`，items 空；
3. 无 exec/无 session → `E_PERMISSION`；
4. 伪造 header 无宿主 exec → `E_PERMISSION`；
5. 缺少/空 personId → 只列当前 cwd person，不返回 raw；
6. owner 调用 → 仅当前 cwd 的 raw（home sentinel；contact/group sentinel 不出现）；
7. 拒绝时不返回部分敏感原文；
8. 审计只记录 scope/工具/结果，不包含 raw 内容（`auditScopeDenied`）。

## 6. 修复前/后对照

| 场景 | 修复前 | 修复后 |
|---|---|---|
| `carryover({cwd:home})` 无 header | 返回 home raw | `E_PERMISSION` |
| `carryover({cwd:home}, {header:{cwd:home,id:'fake'}})` | 通过（id 未验证） | `E_PERMISSION`（未注册） |
| 联系人/群请求 owner home | 视 header/cwd 可能读取 | `E_PERMISSION` |
| owner `input.cwd` 与 header 不一致 | 读 input.cwd | `E_PERMISSION` |
| `person_archive` 群/联系人调用 | 跨房间 raw | `E_PERMISSION`，空 |
| `person_archive` owner 无 pid | 全量 persons/raw | 仅当前 cwd persons，无 raw |

## 7. 未解决的信任链问题

- `opts.header` 由 **service 消费方**（autonomy/GUI/其他插件）传入，不是宿主自动注入；普通插件可以构造该对象。
- 当前修复用 `liveSessions`（宿主观测到的 id+cwd）拒绝未注册/伪造 header；但**不能阻止**知道真实 live session id+cwd 的 in-process 代码伪造 header。
- 因此严格意义上“header 可信来源”仍为 **PARTIAL**；建议后续最小方案：
  1. 宿主向 Memory 注入不可伪造的 session capability（如 WeakSet 中的真实 header 对象、或签名的 per-session token），service 校验 capability 而非字符串；
  2. 或由宿主在调用 service 时注入 `opts.session` 引用，service 用对象身份/签名验证；
  3. 该变更会改变 service 调用协议，需 GPT/Owner 批准，未在本任务实施。
- 兼容性：`dyMemory.carryover` 现在要求 `opts.header`/`opts.session.header`；只传 `{cwd}` 的调用方会 `E_PERMISSION`（安全预期）。GUI/autonomy 需传真实 header；未经 `session/event`/`agent/created`/启动列表观测的 session 会被 fail closed。

## 8. 未解决/范围外

- `dy_memory_group_archive` 的跨群/`GROUP_CWD` 混合、`group_id` schema 未改（任务明确排除）。
- `dy_archive_read`/`dy_archive_research` 的 owner 跨房间策略未改（任务明确排除）。
- `resolveHeader` 全局行为未重构（任务要求除非必要）；carryover 使用本地 `opts` 解析。
- 群归档/其他 raw 入口的修复建议见 carryover 审查报告 `0741984…`。

## 9. 是否需要合同/Schema 变更

- carryover 修复：实现层，**不需要**合同或 Schema 变更；建议合同补“service 身份来自可信 header，不能用业务参数 cwd 充当身份”。
- person_archive：工具权限实现，**不需要** Schema；owner 跨房间若要恢复，需 Owner 明确授权策略（本轮默认关闭）。
- `group_archive` 的 group_id 归档需 Schema 变更，属范围外、需单独授权。

## 10. 边界声明

未修改生产行为/Schema/DB/配置；未合并 PR、未部署、未重启；未连接生产 DB/真实 QQ/NapCat/设备；未执行迁移；未运行 Memory v6/Persona v3/EI-2A。所有测试使用合成数据与 `/tmp` 临时 DB。

## 11. 状态

**PARTIAL**：两个指定问题均已修复并有测试证据；carryover 的完整“可信 header 来源”仍依赖宿主 capability，当前注册表方案不能抵御知道真实 live id/cwd 的 in-process 伪造。
