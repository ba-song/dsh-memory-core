<!-- Focused readiness audit (v2), same round as the archived full session report at commit 30e1d01.
     The prior archived copy is retained in git history and at coordination/project-handoff 163fd58.
     This file adds explicit evidence grading, test results, blockers and NOT RUN items. -->

# LIFE-READINESS-AUDIT-2026-11-24

> 范围：Autonomy / Life（汐的生活、自主性、目标与行动系统）
> 执行：Autonomy 自主系统负责人｜时间：2026-11-24 13:22–14:05 (+08)
> 性质：只读审计。未启用自动行动；未触发主动联系；未发送 QQ/邮件/抖音；未改目标/驱动力/权限；未部署/重启；未改生产 DB/配置/设备状态。
> **结论：`READY WITH CONDITIONS`**（条件 C1–C3 不满足则改判 `BLOCKED`）

## 0. 证据分级约定

| 标签 | 含义 |
|---|---|
| `[SRC]` | 源码直接证据（仓库/文件/行号） |
| `[RUNTIME]` | 本机运行时证据（状态接口/日志/只读 DB 查询） |
| `[DEVICE]` | Android 设备证据（`/app/*`、设备文件） |
| `[TEST]` | 隔离测试证据（/tmp 临时库，非生产） |
| `[INFER]` | 从上述证据推断，未单独验证 |
| `[NOT RUN]` | 未执行 |

## 1. 基线

| 项 | 值 | 证据 |
|---|---|---|
| `ba-song/dsh-autonomy` main | `6c4a4753b4737060211955b1f022cab2f1d39521`（v0.4.0） | `[SRC]` git ls-remote |
| 生产安装 | `/root/.dsh/plugin-src/dsh-autonomy`（软链，无 `.git`） | `[RUNTIME]` |
| 生产代码差异 | 与 GitHub HEAD 有 **10 个文件**差异；缺 `lib/run/home-archive-maintenance.js`；`lib/index.js` mtime 2026-11-15 | `[RUNTIME]` `diff -rq` |
| Host | DSH `0.2.1-rc.2`；profile `web`；PID 30172（2026-11-22 09:06:37 启动） | `[RUNTIME]` `/proc`、`/root/.dsha-web.pid` |
| 设备 | vivo V2154A · Android 14 (SDK 34)；DSHA `0.2.1-rc.2` | `[DEVICE]` `/app/device`、`/app/version` |
| 配置 | `/root/.dsh/profiles/web/cordis.patch.yml`；sha256 `e5a0290495b84618e75a04beaeb0e3366a67341ddfdf296ca5ecc5fe6d51decc` | `[RUNTIME]` |
| 配置差异 | 相对 2026-11-22 备份仅 `triggers.device.enabled: true→false` 一行 | `[RUNTIME]` `diff` |

## 2. 运行状态（实测）

| 对象 | 实际状态 | 证据 |
|---|---|---|
| enabled / dryRun | true / **false**（dryRunReason=off） | `[RUNTIME]` `dy_life_status` 13:22 |
| tick | **关闭**：`tickEnabled=false`，无定时器；最后 tick 2026-11-16 01:11:28（PAUSED_KIND）；tick_runs 495 | `[RUNTIME]` status + DB `meta.last_tick_at` |
| 执行器 | 6 个全部 `mock:true`；真实注册需 `tick.realSafe=true`（当前 false） | `[RUNTIME]` status.executors；`[SRC]` `lib/index.js:351` |
| actions | 238 条；最近 2026-11-15 23:02；此后无新增 | `[RUNTIME]` DB 只读 |
| Home | **运行中**：会话 `e755af98…`；24h 内 14 次 `AWAKENED`；最近 2026-11-24 13:10:16.871（dice hit） | `[RUNTIME]` autonomy.log + DB meta |
| Home 工具使用 | 累计 801 条：`dy_say` 564、`bash` 97、`dy_life_diary_append` 7、`dy_memory_fact_add` 4、`dy_douyin_open` 9、`edit` 6、`dy_send_image` 8；24h 内 23 条 | `[RUNTIME]` `home_activities` |
| 主动联系实证 | 13:10:16 唤醒 → **13:10:25 出站 QQ**；首条 `user` 13:10:36、bridge 入站 13:10:35/39；上次入站 10:57:26 | `[RUNTIME]` `home_activities` + `channel_events` + `raw_meta` |
| 目的引擎 | 运行中；`purpose_hypotheses` 13:08 刷新（seenCount 960） | `[RUNTIME]` status/DB |
| 触发 | triggers.enabled=true；**device=false**；notification=true 但 3091 不可达；files=[] | `[RUNTIME]` status；`[SRC]` `lib/index.js:211` |
| device 日志 | mtime 2026-11-22 09:06:57；最后 poll 2026-11-21 17:52:05；此后无 poll | `[RUNTIME]` `device-trigger.log` |
| 通知触发 | 每 5s `fetch failed`；`curl 127.0.0.1:3091` → http=000/exit 7 | `[RUNTIME]` 日志 + curl |
| Douyin inbox | enabled/started/subscribed；events=1（owner，2026-11-23 17:20）；replies.enabled=true；sent=0；`dmReplyWindowMs=0`、`dmDailyLimit=0` | `[RUNTIME]` status |
| Channel Bridge | mode=**send**、health=OK、outSent=3238；reconnects 188 / hardResets 92 | `[RUNTIME]` `dy_bridge_status` |
| Mail | 60s 轮询（13:28）；最近发送 2026-11-07；最近入站 2026-11-17；最近错误 2026-11-22（connection reset） | `[RUNTIME]` status + DB meta |
| 全局暂停 / dry-run 覆盖 | `pause.all=false`、`pause.kinds` 全 false、无 `dry_run` meta | `[RUNTIME]` status/DB |

## 3. 可能触发行动的入口

| # | 入口 | 当前 | 真实副作用 | 证据 |
|---|---|---|---|---|
| 1 | tick 定时器 | 关 | 否 | `[SRC]` `lib/index.js:530-535`；`[RUNTIME]` status |
| 2 | Home 唤醒循环 | **开** | **是**（LLM 回合 + 工具） | `[SRC]` `lib/run/home.js:557-575`；`[RUNTIME]` 14 次/24h |
| 3 | device 屏幕触发 | 关 | 否 | `[SRC]` `lib/index.js:211`；`[RUNTIME]` 52h 无 poll |
| 4 | notification 触发 | 开但不可达 | 当前否 | `[RUNTIME]` 3091 http=000 |
| 5 | file 触发 | 开，files=[] | 否 | `[RUNTIME]` status |
| 6 | mail 轮询 | 开 | 条件性（入站→Home） | `[SRC]` mail/service；`[RUNTIME]` lastPoll |
| 7 | douyin inbox | 开 | **是**（非主人私信自动回复） | `[SRC]` `lib/run/douyin-inbox.js:534-550`；`[RUNTIME]` replies.enabled |
| 8 | 手动工具（任意 session） | 全局注册 | **是**（`dy_say`/bash/edit） | `[SRC]` channel-bridge `lib/tools.js:74`；`[RUNTIME]` 本工作会话可见 dy_say |
| 9 | channel bridge | mode=send | **是** | `[RUNTIME]` outSent 3238 |
| 10 | purpose 定时器 | 开 | 否（仅 DB 写） | `[RUNTIME]` purpose 13:08 |

## 4. 独立 session 隔离评估

**能做，但只覆盖“生活记录/人格注入”，不覆盖全局工具副作用。**

| 层 | 是否隔离 | 证据 |
|---|---|---|
| persona 注入 / 情绪 ingest | **是**（cwd 不在 `inject.sessionDirs` → `resolveScope` not-allowlisted） | `[SRC]` `dsh-persona-core/lib/scope.js:111-125`；profile sessionDirs=home/渠道/douyin |
| memory 原话 / episode | **是**（`RawArchive.onEvent` 先 `isUnderPrefix(cwd, archivePrefixes)`） | `[SRC]` `dsh-memory-core/lib/ingest/archive.js:104,373-378` |
| memory 实证 | 现有 `raw_meta` cwd 仅 home/渠道/douyin/email（home 54440 行）；`/sdcard/DSHA/工作区` 无归档行 | `[RUNTIME]` 只读 DB 聚合（无正文） |
| autonomy 唤醒 | **是**（只唤醒 home session） | `[RUNTIME]` `home_sessions` 仅 e755af98 |
| autonomy dy_life_* 工具 | **是**（owner 上下文校验，测试 session 拒绝） | `[SRC]` `dsh-autonomy/lib/tools.js:22-39`；`[RUNTIME]` 工作会话 E_PERMISSION |
| douyin 工具 | **是**（仅 owner/home/douyin 会话；工作会话实测 E_PERMISSION） | `[RUNTIME]` 本轮工具返回 |
| **全局 dy_say / bash / edit** | **否**（插件工具全局注册；dy_say 无 owner 门禁；bash/edit 为 danger-full-access） | `[SRC]` `dsh-channel-bridge/lib/tools.js:74`、`lib/say.js:57-84`；`[RUNTIME]` 本工作会话可见 dy_say |

**建议测试 session**：cwd `/sdcard/DSHA/测试/autonomy-round1`（不得位于 `渠道/`、`生活/数据/home`、`douyin/` 前缀下；persona 的 `cwdInDir` 存在宽松前缀兼容，目录名不要以这些前缀开头）；**不要使用 Home session**。

## 5. 控制机制（暂停 / 白名单 / dry-run / 确认）

| 机制 | 证据 | 覆盖与缺口 |
|---|---|---|
| `pause.all` | `[SRC]` `home.js:200-208`、tick 门 2；`[RUNTIME]` 当前 false | 可冻结 Home/tick/douyin owner 路由；**不阻止全局 dy_say/bash**；写 DB，需 owner 授权 |
| 按 kind 暂停 | `[RUNTIME]` 6 kind 全 false | 只影响 tick 候选，不影响 Home |
| 行动白名单 | `[RUNTIME]` allowedKinds 6 类；`[SRC]` `KINDS` | Home 会话不受白名单限制 |
| dry-run | `[SRC]` `tick.js:301`；`[TEST]` F21 PASS；`[RUNTIME]` 当前 false | **`home.respectDryRun=false`（profile L142）→ dry-run 不能停止 Home 唤醒** |
| 真实执行器门 | `[SRC]` `executors.js:32-34`、`index.js:351` | 当前 mock；`dryRun=false`+`sendEnabled=true` 已满足高风险注册前提，仅剩 tick.enabled/realSafe |
| 人工确认 | `[SRC]` autonomy 工具 owner 校验；dy_say 无 confirm；douyin 写工具有 confirm | 测试期无统一确认层 |
| 隔离测试 | `[TEST]` `node --test tests/tick.test.mjs`：**18/18 pass**（F4 暂停、F5 持久化、F21 dry-run、F6 熔断） | 代码级，非生产实跑 |

## 6. Host / Bridge / Android 依赖

| 依赖 | 现状 | 影响 |
|---|---|---|
| Host：dyPersona/dyMemory/timer/tools | 全部就绪 | 缺失会强制 dry_run/降级 |
| Bridge 3090（设备触发） | 可用，触发已关 | 无当前依赖 |
| Bridge 3091（通知） | 不可达（http=000） | 通知触发空转、日志增长 |
| Channel Bridge WS/NapCat | mode=send、health=OK；reconnects 188 / hardResets 92 | dy_say 真发通道；不稳定但可用 |
| Douyin CDP/SSH | source.running/subscribed | 私信/通知 watcher |
| Mail IMAP | 轮询中，偶发连接错误 | 入站→Home |
| Android/proot | 共享存储/后台；无前台服务 | 进程冻结会暂停定时器且不补跑 |

## 7. 风险与阻断

- **R1 高**：Home 可自主发 QQ（13:10:25 早于任何 user 入站）；测试期无法排除主动联系。`[RUNTIME]`
- **R2 高**：测试 session 仍可用全局 dy_say/bash；不改 bridge mode/不限制工具即可外部发送或写文件。`[SRC]+[RUNTIME]`
- **R3 中**：Douyin 非主人私信自动回复开启且窗口/条数不限。`[SRC]+[RUNTIME]`
- **R4 中**：QQ/邮件/抖音 owner 入站会进 Home 并写 raw/情绪，测试消息会变成真实经历。`[INFER]`（基于调用链与 raw 归档范围）
- **R5 中**：dry-run 不覆盖 Home（respectDryRun=false）。`[SRC]`
- **R6 低**：通知触发 dead 但 enabled；3091 恢复会新增唤醒源。`[INFER]`
- **R7 低**：tick 虽关，但 `dryRun=false`+`sendEnabled=true` 已满足高风险注册前提。`[SRC]`
- **R8 信息**：`DELIVERY-BOARD.md` 仍写“Autonomy 默认 disabled/dryRun、不得启动 Home”，与现状不符，建议更新。`[RUNTIME]`

**阻断条件（非技术）**：C1–C3 不满足时，第一轮测试应判 `BLOCKED`：
- C1 独立 session（cwd 非 allowlist，不用 Home）；
- C2 不向她的 QQ/邮箱/抖音发真实消息；
- C3 外发闸：owner 授权 channel-bridge `mode=observe/deliver`，或 harness 禁用 dy_say/bash 写并全程监控。

## 8. 未验证 / NOT RUN

| 项 | 状态 | 原因 |
|---|---|---|
| 第一轮测试具体计划/用例 | `[NOT RUN]` | 未提供测试脚本与步骤 |
| 独立测试 session 实际创建 | `[NOT RUN]` | 本轮只读，未创建 |
| 生产 `pause.all` 实跑 | `[NOT RUN]` | 写 DB，需 owner 授权 |
| 3091 修复后通知链路 | `[NOT RUN]` | 未修、未启动 |
| Douyin 非主人私信自动回复实跑 | `[NOT RUN]` | 无真实测试私信，未触发 |
| Home 未来一次唤醒的具体工具选择 | `[NOT RUN]` | 模型决策，不可预知 |
| GitHub HEAD 与生产代码一致性 | `[NOT RUN]` | 生产无 .git，仅静态 diff |
| 完整 411 测试本轮重跑 | `[NOT RUN]` | 本轮只跑 tick 18 项；历史 411 为旧轮证据 |

## 9. 测试结果

- 命令：`cd /tmp/audit/dsh-autonomy && node --import /tmp/audit/findings/register-hooks.mjs --test tests/tick.test.mjs`
- 结果：**tests 18 / pass 18 / fail 0 / skipped 0 / exit 0**（2026-11-24 13:31）
- 覆盖：F1/F1b 冷却、F2/F2b 外发门、F4 暂停、F5 暂停持久化、F6 熔断、F16 单飞、F18 不补跑、F20 异常、F21/F21b 降级 dry-run、工具注册。
- 性质：隔离测试（/tmp 临时库 + 本机依赖 hook），**非生产实跑**。

## 10. 结论

**`READY WITH CONDITIONS`**

- tick 与真实执行器不可用，自动任务路径关闭；
- 但 Home 是活的，已发生自主 QQ 外发；测试 session 只能隔离 persona/memory/情绪，不能隔离全局 dy_say/bash；
- 满足 C1–C3 可进行第一轮测试；否则应暂停 Home（`dy_life_pause scope=all`，需 owner 授权）并改判 `BLOCKED`。

## 11. 边界声明

本报告只读审计：未启用自动行动；未触发主动联系；未发送消息/邮件/抖音；未写生产 DB/记忆/日记；未改目标/驱动力/权限；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`。报告归档仅新增本文件，不改变生产代码、配置、数据库或设备状态。
