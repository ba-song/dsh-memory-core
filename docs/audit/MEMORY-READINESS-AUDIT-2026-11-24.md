<!-- Archived from coordination/agent-reviews/memory/first-device-test-readiness/REVIEW-REPORT.md at commit 54084e75aa8d01d0b52a5d8524ad2e08dce50054; source blob 29686bb49cd26963ce2cb37fd1f859099d300517. Original source retained. -->

# 第一轮实机测试准备审计 · Memory 专项报告

- 任务：DSHA「汐」第一轮 Android 实机测试准备审计（Memory）
- 时间：2026-11-24 13:2x–14:0x (Asia/Shanghai)
- 性质：只读审计；未写真实记忆、未改策略、未改行为、未部署/操作设备。
- **结论：BLOCKED**（当前部署版本无法满足测试约束；需先部署隔离测试构建并完成 Host 配套）

## 1. 当前版本与部署状态

| 项 | 值 | 证据等级 |
|---|---|---|
| 运行 Host | `/usr/local/bin/node /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js web --no-open --host 127.0.0.1 --port 38105`（PID 30172） | 设备只读已证实（`/proc/30172/cmdline`） |
| DSH 版本 | `@deepseek-ai/dsh@0.2.1-rc.2` | 设备只读已证实（`package.json`） |
| Memory 部署版本 | **`dsh-memory-core@0.1.0`，无 git、无 `gitHead`**；mtime 2026-11-18/19 | 设备只读已证实 |
| 部署路径 | `/root/.dsh/plugin-src/dsh-memory-core`；profile `web` 通过 `link:` 引用 | 设备只读已证实（`/root/.dsh/profiles/web/package.json`） |
| 部署代码与修复分支 | **不一致**：`lib/service.js` sha256 `a93ed60e…` vs 修复分支 `371f2cda…`；`lib/index.js` `ed56b72b…` vs `8d2577d0…`；`lib/handoff/brief.js` `3089f32d…` vs `9db391cf…` | 源码已证实 |
| 修复分支 | `fix/p0-1-cross-conversation-memory-outputs` @ **`d376a157d9307b34efb7af482a89f40fbe6c8061`**（未部署） | 源码已证实 |
| 生产数据 | `/sdcard/DSHA/记忆/数据/memory.db` 约 95.7 MB；运行进程 env 无 `DY_MEMORY_DIR`（使用默认 DATA_DIR） | 设备只读已证实（仅大小/路径，未读内容） |
| profile 关键项 | `consolidate.dryRun:false`、`runOnStart:true`；`weekly.dryRun:true`；`archiveDirs` 指向 `/sdcard/DSHA/渠道`、`/sdcard/DSHA/生活/数据/douyin` | 设备只读已证实 |

## 2. 实际宿主接入路径（源码证据）

- profile：`/root/.dsh/profiles/web/cordis.patch.yml:40-41` → `id: memory-core` / `name: dsh-memory-core`；`package.json` 用 `link:/root/.dsh/plugin-src/dsh-memory-core`。
- 插件入口：`lib/index.js` `apply(ctx)`；
  - `ctx.provide('dyMemory', memoryService)`（部署 `lib/index.js:1111-1112`）；
  - 工具注册 `tools.register`（如 `dy_memory_*`，部署 `lib/index.js:358+`）；
  - `session/event`（部署 `lib/index.js:274`）；
  - `agent/created`（部署 `lib/index.js:1389`）；
  - 自动注入 `systemPrompt.context`（stable/carryover/digest；部署 `lib/index.js:1247+`）。
- Session/cwd/owner：
  - `sessionOf(exec,isOwnerCwd)` / `scopeForSession`（部署 `lib/index.js` 工具路径）；
  - `ctx.agents.list()` 启动扫描（部署 `lib/index.js:1247` 注释+实现）；
  - owner 判定 `classifyOwner`（`lib/owner.js`）。
- 数据目录：`lib/config.js:5` `DATA_DIR = process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据'`；raw 归档在 `DATA_DIR/raw`。

## 3. 读取/写入/原话/handoff 实际路径

| 路径 | 部署代码位置 | 现状 |
|---|---|---|
| recall / preference / remembered | `lib/recall/recall.js`、`lib/inject/*` | 可用；无统一 `valid_from_kind`/三态 |
| episode 写入 | `lib/service.js addEpisode` | 可用；会写 `memories`/raw |
| raw 原话归档 | `lib/ingest/archive.js` | `raw_meta` + fts；tombstone 支持 |
| carryover | `lib/service.js:689-696`（旧版） | **旧越权实现**：`input.cwd` 直接决定读取房间；已在修复分支 d376a15 修改但未部署 |
| handoff | `lib/handoff/brief.js`（旧版） | **会注入 pins/项目/决策/待办/标签**；修复分支已移除，未部署 |
| publicBrief | `lib/service.js:530-548`（旧版） | **非 fail-closed**；返回 public 行 |
| person_archive | `lib/index.js:761-776`（旧版） | **无 owner/session 授权**，跨房间 raw |
| digest | 部署 `lib/index.js:1162-1177` | **仍注入跨渠道摘要**（home+QQ+群+email） |
| 群归档 | `saveGroupTranscript` → `GROUP_CWD` | 群全文共享目录，无 group_id |

## 4. 来源证据/置信度/不确定性

- `memories` 有：`source_msg_id`、`source_ts`、`source_file`、`source_channel`、`source_ref`、`quote`、`confidence`、`meta.provenance`（部署 `lib/store/memories.js:35-50`）。
- provenance 门禁：`provenanceMode` + `resolveQuote`（quote 必须逐字子串，否则拒写）；`manual/degraded` 会写 `meta.provenance` 并降 confidence。
- **缺少**：`conversation_id`/`session_id`（`conversation_scope` 恒空）、`valid_from_kind`、`verification_status`、`confidence_level`、`experiencer_*`、`speaker_type`。
- 不确定性目前只有 `confidence` 数值 + `temporal_kind`，无独立“未验证/冲突/撤回”三态；不能支撑 R4.1 的 current/history 隔离。

## 5. 撤回/审计/恢复

- 撤回：`lib/ingest/archive.js:468-473` `tombstone()` 标 `raw_meta.tombstone=1` 并删 raw_fts；原行保留。
- 审计：`auditScopeDenied`（scope 拒绝审计）、`lib/audit/pending.js`、`memory_revisions`（update 前快照）、`dy_memory_raw_verify`（按天行数+哈希）。
- 恢复：`memory_revisions` 可回滚 update；raw tombstone 不删原文；无统一的 memory 级“恢复/回收站”工具；`scripts/` 有迁移/修复脚本，但没有面向实机测试的恢复流程。
- 结论：撤回/审计基础存在；**无完整测试期恢复/一键回滚方案**。

## 6. 第一轮可测试的记忆功能（以隔离测试构建为前提）

- 只读：`recall`、`episodeRecent`、`preference/remembered` 注入（需关闭 handoff 旧路径）、`dy_memory_stats`、`dy_memory_quote_search`（scope 内）、`dy_memory_raw_verify`（temp DB）。
- 写入：`addEpisode`、`dy_memory_add`（仅 temp DB）、provenance quote 门禁（合法/不合法 quote）。
- 原话：raw 归档 + tombstone + `raw_verify`（temp DB）。
- 不可测试：fail-closed `publicBrief`、安全 `carryover`、授权 `person_archive`、无 pins/项目/决策/待办的 handoff、digest 隔离、群成员 speaker、跨会话能力——这些只在修复分支，未部署。

## 7. 隔离测试数据准备方法（需平台配合）

1. **独立测试 profile**（如 `DSH_HOME=/tmp/dsha-test-home`，独立端口）；不要复用生产 `web` profile。
2. **独立数据目录**：`DY_MEMORY_DIR=/tmp/dsha-test-memory`；确认运行时 env 覆盖（当前进程无该 env）。
3. **测试配置**：`consolidate.dryRun:true`、`weekly.dryRun:true`、`digestEnabled:false`、`autoShare:false`、`archiveDirs` 仅指向测试目录、`autonomy.tick.enabled:false`。
4. **合成消息**：用测试 agent/session 注入 `session/event` 或调用工具，不接真实 QQ/NapCat；不写真实 `/sdcard/DSHA/渠道`。
5. **隔离校验**：启动后打印 `DATA_DIR`/DB 路径；查询 `memory.db` 为新建空库；生产 `memory.db` 大小/ mtime 不变。
6. **清理**：测试结束删除 `/tmp/dsha-test-*`；不触碰生产目录。

## 8. 需要 Host/Android 平台配合

- 提供独立测试 DSH 实例/profile 与端口（不改生产 profile）。
- 支持 `DY_MEMORY_DIR`/`DSH_HOME` 隔离并确认插件从测试构建加载。
- 提供合成 session/event 注入入口（不接真实渠道）。
- 后续 Host exec provenance / trusted session capability（见 Host 报告 `04`）；本轮未实现。
- 设备侧确认测试实例不共享生产 `memory.db`/raw。

## 9. 已发现风险/阻断项

| # | 风险 | 等级 | 证据 |
|---|---|---|---|
| 1 | 部署 Memory 0.1.0 早于 P0-1 修复，carryover 旧越权 | **P0** | 部署 `service.js:689-696`；修复分支 d376a15 |
| 2 | `person_archive` 无授权跨房间 raw | **P0** | 部署 `index.js:761-776` |
| 3 | `digest` 仍跨渠道注入 | **P0** | 部署 `index.js:1162-1177` |
| 4 | `publicBrief` 非 fail-closed | P1 | 部署 `service.js:530-548` |
| 5 | handoff 注入 pins/项目/决策/待办/标签 | **P0（违反本任务约束）** | 部署 `brief.js:18-50` |
| 6 | 运行实例使用生产 DATA_DIR；profile `consolidate.dryRun:false` | **P0（污染风险）** | `/proc/30172/environ` 无 `DY_MEMORY_DIR`；profile 配置 |
| 7 | 无 trusted session capability；工具 exec 可伪造 | P0（Host） | Host 报告 `review/runtime-session-trust` |
| 8 | 无 valid_from_kind/三维/experiencer；旧记忆不确定性无法表达 | P1 | 部署 schema/源码 |
| 9 | 群归档 GROUP_CWD 混合、无 group_id | P1 | `saveGroupTranscript` |
| 10 | 无测试期恢复/一键回滚 | P2 | 仅 revisions/raw tombstone |

## 10. 结论：**BLOCKED**

**当前部署版本不能进行符合约束的实机测试**：

- 部署的 Memory 0.1.0 不具备 P0-1 修复（carryover/person_archive/publicBrief/digest/handoff），违反“不启用跨会话 pins/项目/决策/待办”“不解除 publicBrief fail-closed”等约束。
- 运行实例直接使用生产 `DATA_DIR`（`/sdcard/DSHA/记忆/数据`，memory.db 95.7MB），且 `consolidate.dryRun:false`；测试写入/归纳会污染真实记忆。
- 修复分支 d376a15 仅通过临时 DB 测试（139/139），**未在 DSHA 宿主/设备验证**；Host 可信 session 能力仍未解决。

**转 READY WITH CONDITIONS 的前置条件**：

1. 平台将修复分支构建部署到**独立测试 profile/实例**（非生产），并确认 `DY_MEMORY_DIR` 指向 `/tmp/...`。
2. 测试配置：`digestEnabled:false`、`consolidate.dryRun:true`、`weekly.dryRun:true`、`autoShare:false`、`archiveDirs` 仅测试目录、autonomy tick 关闭。
3. 部署包含 P0-1 修复（至少 d376a15）的 Memory；或明确只测修复分支、不测部署旧版。
4. Host 侧先完成 exec provenance/trusted session（或 Memory 停用 raw service 读取）。
5. 平台确认合成 session/event 注入方式，不接真实 QQ/渠道。
6. 执行 §7 隔离校验（生产 DB 大小/mtime 不变）。

## 11. 证据等级与未验证

- **源码已证实**：部署版本/路径/hash、旧 carryover/person_archive/publicBrief/digest/handoff 行为、DATA_DIR 默认值。
- **设备只读已证实**：运行进程、profile link、生产 DB 路径/大小、env 无 DY_MEMORY_DIR。
- **测试已证实（临时 DB）**：修复分支 139/139；**不是设备/宿主实测**。
- **尚未验证**：修复分支在真实 DSH 宿主加载；真实 session/owner 路径；隔离 profile 启动；Android 端行为；恢复流程。

## 12. 边界声明

本任务未写入真实记忆、未改策略/代码/Schema/DB/配置、未部署/重启/操作设备；仅只读检查。报告为准备审计，不构成测试或部署授权。

## 13. 状态

**BLOCKED**（当前部署版本/数据隔离不满足实机测试约束；需平台先提供隔离测试实例与修复构建）。
