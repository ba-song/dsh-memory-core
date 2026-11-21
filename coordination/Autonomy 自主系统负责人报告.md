# AUTONOMY-REPORT-0001 · Autonomy 自主系统负责人报告（任务恢复、状态语义与结果核实设计）

> 会话：Autonomy 自主系统负责人（Autonomy 领域专业智能体）
> 覆盖任务：`AUTO-ARCH-AUDIT-01`（自主能力只读审计，2026-11-21 01:25–02:05）、`AUTONOMY-RECOVERY-SEMANTICS-DESIGN-01`（恢复语义设计，2026-11-21 02:20–02:50）
> 迭代规则：本文件覆盖式更新、版本号递增（AUTONOMY-REPORT-0002…），不新增同类文件；与 `coordination/HANDOFF.md`、`coordination/REPORT.md` 同目录
> 最近更新：2026-11-21 09:40 (Asia/Shanghai) · v1 首次建档
> 性质：只读审计 + 只读设计。未改 Autonomy/Persona/Memory 源码；未写生产 DB/profile；未启动 tick/scheduler/executor/staging；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`/`PROJECT.md`

## 版本历史

| 版本 | 时间 | 覆盖任务 | 变更摘要 |
|---|---|---|---|
| v1 (AUTONOMY-REPORT-0001) | 2026-11-21 09:40 | AUTO-ARCH-AUDIT-01 + AUTONOMY-RECOVERY-SEMANTICS-DESIGN-01 | 首次建档：Autonomy 真实基线、11 项自主闭环矩阵、恢复语义与状态机、lease/verifier/Android 接口设计、P0-a 三项缺陷修复拆分 |

---

## 0. 给 GPT 的阅读导航（先看这一节）

**结论一句话**：Autonomy 现在是「一个会按时醒来的单步行动器 + 一套审计/暂停/配额骨架」；它没有多步计划、没有执行后验证、没有把失败变成经验；生产 tick 已关 5 天，恢复逻辑随 tick 一起停摆。任务恢复的正确语义是 **lease 过期 → `unknown` → 先 verify → 再决定**，`failed` 只能由有证据的失败产生。

**需要 GPT 裁决（§6.1）**
1. 状态命名兼容策略：物理值保留 `done/failed/aborted`、新增 `unknown/cancelled/leased`（本报告建议）。
2. 历史 `failed(error='stale_lease')` 共 1 行是否一次性重分类为 `unknown`（改历史状态，需授权）。
3. `action_ledger` 归属 Autonomy 还是 task-core（建议 Autonomy）。
4. 与 Android 报告的接口统一：传输层用文件契约（Android 已提案），语义层用本报告状态机；`dyAutonomy.recover` 作为 host 进程内入口。
5. 更正 Android 报告 §3.3 步骤⑦：恢复不应走 `tick({trigger:'resume'})`（tick 关闭时不执行），应走独立 recovery 入口。

**需要负责人授权（§6.2）**
1. 写 `dsh-autonomy` 开发分支（AUTO-R1…R5）。
2. 一次性数据重分类（上述第 2 条）。
3. 后续 DSHA 实机重启/崩溃注入演练（由 DSH 执行）。
4. 恢复接口冻结后的跨模块联调。

---

## 1. 基线（本轮核对值）

| 对象 | 值 | 核对方式 |
|---|---|---|
| `ba-song/dsh-autonomy` main | `6c4a4753b4737060211955b1f022cab2f1d39521` | `git fetch` + `git ls-remote` 双向一致，2026-11-21 09:31 |
| autonomy tag | `v0.4.0` = `84cf56b1`（Release 后 10 commits） | `git tag` / `ls-remote --tags` |
| autonomy 工作区 | clean（`git status --porcelain` 空） | 本地克隆 |
| `coordination/project-handoff` 建档前 HEAD | `232b73e2962c162b59475b63841fa461ec5c78fe` | `git log` |
| `coordination/HANDOFF.md` blob | `f8ffa40d4c27c04d23ff74b123bf2b7044821976`（3317 行） | `git rev-parse HEAD:...` |
| `coordination/REPORT.md` blob | `e219f707cc4363c53704fbe389f786148142326e`（172 行） | 同上 |
| `dsh-persona-core` main / EI-1 | `a84c7bad` / `92a763bf` | `ls-remote --heads` |
| 生产 autonomy | `/root/.dsh/plugin-src/dsh-autonomy`（软链，无 `.git`，早于 GitHub HEAD） | 目录与 diff |
| 生产 profile | `tick.enabled=false`、`realSafe=false`、`dryRun=false`、`sendEnabled=true` | `cordis.patch.yml` 只读 |
| 生产 DB | `user_version=4`；代码 `SCHEMA_VERSION=3`（漂移未解释） | 只读快照 |

---

## 2. 事实核查（AUTO-ARCH-AUDIT-01 结论 + 本轮复核）

### 2.1 状态枚举与生命周期

| 项 | 事实 | 证据 |
|---|---|---|
| 物理状态值 | 仅 `planned/running/done/failed/aborted`，无 CHECK 约束 | `lib/store/schema.js:54` |
| 领取 | `markRunning` 写 `running/started_at/lease_until`，带 CAS | `lib/run/actions.js:52-56` |
| 结束 | `finishAction` → `done`/`failed` | `lib/run/actions.js:62-74` |
| 策略中止 | `abortAction` → `aborted` | `lib/run/actions.js:78` |
| 租约回收 | 过期 → **`failed`**（`error='stale_lease'`） | `lib/run/actions.js:86-94` |

### 2.2 lease

| 项 | 事实 | 证据 |
|---|---|---|
| 时长 | tick 用 `leaseSec=90`；手动行动写死 60s | `lib/config.js:165`；`lib/run/tick.js:303,312`；`lib/run/manual-actions.js:172` |
| 续期/心跳 | **无**（全库 `heartbeat` 0 命中） | `grep -rni heartbeat lib/` → 0 |
| 单飞判定 | `lease_until IS NULL OR lease_until >= now` 视为活着（NULL 永久阻塞） | `lib/run/actions.js:97-103` |

### 2.3 调度与恢复入口

| 项 | 事实 | 证据 |
|---|---|---|
| 定时器 | `tick.enabled=false` 时直接 return，不挂定时器 | `lib/index.js:530-535` |
| 启动 resume | 延迟 60s 跑 `tick({trigger:'resume'})`，同一分支内，tick 关则不跑 | `lib/index.js:537-545` |
| 悬挂回收 | 仅 `tick.runOnce` 内调用 `recoverStale` | `lib/run/tick.js:144-149` |
| 重启后恢复 | **不存在**（生产 tick 关 5 天，无任何扫描） | 组合上述三点 |

### 2.4 审计、结果与验证

| 项 | 事实 | 证据 |
|---|---|---|
| 审计先行 | `select/skip/dry_run` 先写 `action_log` | `lib/run/tick.js:284,289,296,305` |
| 缺少开始事件 | 无 `executor_started`；无法区分"领了租约"与"已调外部" | `grep` 无命中 |
| 结果结构 | `{ok, code, evidence, result}`；`code` 被丢弃 | `lib/run/tick.js:371-379` |
| 错误文案 | 生产 67 条 failed 文案完全相同（"executor 未返回 ok"） | 生产只读 DB 聚合 |
| 外发证据 | 本地 `hash(text)`，不是回执 | `lib/run/real-executors.js:127` |
| 验证字段 | **不存在**（`actions` 无 verified 列；全库 `verifier` 0 命中） | `lib/store/schema.js:49-73` |
| `attempt` | 列存在但**从不递增** | `lib/run/actions.js:62` |

### 2.5 排序（生产已致害）

`lib/run/actions.js:166` 用 `ORDER BY id DESC`，而 `id = 'act_' + randomUUID()`（`:14-16`）→ `consecutiveFails` 随机。生产实证：`browse_douyin` 连续失败 **55 次**、间隔 9–20 分钟，熔断（`lib/core/policy.js:88-97`）从未打开。

### 2.6 幂等

只有 kind 级时间窗（`lib/run/actions.js:114`），无幂等键、无执行账本、无执行前外部状态检查。

### 2.7 自主闭环矩阵（11 项）

| # | 能力 | 状态 | 关键证据 | 生产 |
|---|---|---|---|---|
| 1 | 自主发现 | PARTIAL | 驱力/目的/触发，`NEED_TO_KIND` 硬映射 6 kind（`lib/core/purpose.js:8`） | ON（home） |
| 2 | 判断是否行动 | PARTIAL | `select/score/policy` 齐全，但 `urge.thetaLow=0`（`lib/config.js:173`） | NOT RUN |
| 3 | 可追踪目标 | PARTIAL | `goals` 表 + CRUD；`due_at` 从不参与选择 | 半开（2 条） |
| 4 | 多步计划 | MISSING | 无 plan/step/checkpoint；一次 tick 单 action | NOT RUN |
| 5 | 能力/工具选择 | PARTIAL | 注册表 + 6 kind；无能力元数据 | mock only |
| 6 | 执行并记录 | PASS | 三表 + 状态机 + 租约 | 238 条 |
| 7 | 执行后验证 | MISSING | 无 verified 字段/流程 | — |
| 8 | 识别失败 | PARTIAL | code 被丢 + 排序错 | 91 条失败 |
| 9 | 恢复/调整 | PARTIAL | 退避/熔断/租约回收；无重规划/取消 | 失效 |
| 10 | 复盘 | PARTIAL | 只自动记 pending，正文手动；反思不参与打分 | 4 consumed/7 manual |
| 11 | 经验→能力 | MISSING | 无建议队列/技能草案通道 | 按设计未建 |

---

## 3. 任务状态机（冻结提案）

### 3.1 状态与兼容映射

| 目标状态 | 物理值 | 与现状 | 说明 |
|---|---|---|---|
| pending | `planned` | 已有 | 待领取 |
| leased | `leased` | 新增 | 已领取、未开始执行 |
| running | `running` | 已有 | 执行器已开始（写 `executor_started`） |
| succeeded | `done` | 已有，语义收紧 | 必须有 `verified_ok`；旧行标 `legacy_unverified` |
| failed | `failed` | 已有，语义收紧 | 必须有失败证据 |
| unknown | `unknown` | 新增 | 无法判断，等待 verifier |
| cancelled | `cancelled` | 新增 | 取消，不得写成 failed |
| blocked | `planned`+`blocked_reason` | 新增列 | 前置不满足 |
| （策略未执行） | `aborted` | 已有 | 保留，不等同取消 |

### 3.2 转换表

| From | 事件 | To | 副作用 |
|---|---|---|---|
| — | 政策通过 | planned | `action_log:select` |
| planned | 前置不满足 | planned+blocked | `blocked_reason` |
| planned | CAS 认领 | leased | `lease_owner=runtime#attempt`、`attempt+=1` |
| leased | executor 开始 | running | `started_at`、首心跳 |
| running | ok + verifier=confirmed_succeeded | succeeded | 写验证记录 |
| running | ok + verifier=indeterminate | unknown | `unknown_reason` |
| running | 明确失败+证据 | failed | `error_code`、`failure_class=execution` |
| leased/running | 超时/崩溃/心跳中断/租约过期 | unknown | **不得 failed** |
| unknown | confirmed_succeeded | succeeded | |
| unknown | confirmed_not_executed + retryPermitted | planned | 保留 attempt |
| unknown | confirmed_not_executed + 不重试 | cancelled | |
| unknown | partially_completed | unknown + compensating | human_required |
| unknown | indeterminate/verification_error | unknown（保持） | 退避重验 |
| planned/leased/running | 取消 | cancelled | 记取消者/时间；running 先 abort |
| succeeded/failed/cancelled | 任何事件 | 不可转换 | 重做=新 action |

**禁止**：`running→failed`（无证据）、`unknown→failed`、`leased/running→planned`（跳过验证）、`cancelled→failed`、终态回退。

### 3.3 正交轴与不变式

- `verify_state`：`not_required/pending/verified_ok/verified_not_executed/verified_partial/indeterminate/verification_error/legacy_unverified`
- `resolution`：`null/requeued/compensating/waiting_owner/abandoned`
- `failure_class`：`execution/verification/unknown/policy/timeout`
- 不变式：`done` ⇒ 存在 `confirmed_succeeded` 验证行；`failed` ⇒ `failure_class=execution` 且 `error_code` 非空；`unknown` ⇒ `unknown_since` 非空且 `ended_at` 为空；`leased/running` ⇒ `lease_owner` 非空。

---

## 4. lease 过期规则

```
lease_owner  = runtimeId#attempt
leaseMs      = max(leaseSec*1000, timeoutMs*2 + 15_000)   // 默认 max(90s,135s)=135s
heartbeat    = leaseMs/3；写 actions + action_attempts
graceMs      = 60s
过期判定     = lease_until < now-grace
             OR 心跳超过 2 个周期未更新且 runtime 已不在
             OR lease_owner 的 runtimeId != current（跨重启最可靠）
```

- 过期 → CAS 置 `unknown`（`unknown_reason='lease_expired'`），**绝不 failed**，同事务投递验证任务。
- 不允许"过期即重排"；重排只允许在 `confirmed_not_executed` 之后。
- 墙钟回拨 → 延迟但安全；前跳 → 进 unknown → 先验证，不盲重试。
- `lease_until IS NULL` 的 running 视为异常行，进恢复队列并记 `ORPHAN_LEASE`，不得永久阻塞单飞。
- 双 worker：每 action CAS 认领 + 全局 `recovery.lock`（TTL 120s）。

---

## 5. 重启恢复流程

### 5.1 runtime 身份

```
bootId    = /proc/sys/kernel/random/boot_id        （实测可用）
pidStart  = /proc/self/stat 第 22 字段             （实测可用）
runtimeId = rt_<bootId8>_<pidStart>_<rand6>
表 runtimes(runtime_id PK, boot_id, pid, started_at, last_heartbeat_at, state, plugin_version, schema_version)
```

### 5.2 启动入口（关键修复：与 tick 解耦）

```
apply() → openDb/migrate → registerRuntime()
        → scheduleRecovery(10s)          // 无条件挂载，即使 tick.enabled=false
        → 其余（tick 定时器/home/mail）按原开关
```

恢复是"账本对账"，不是"新的自主行动"，必须有独立单飞与审计事件（`recovery_started/finished`）。

### 5.3 扫描与处理

scanned = `status IN ('leased','running','unknown')` 且（owner 非当前 runtime 或租约过期）；CAS 认领 `recovery_owner`；分类（有 `executor_started`/`started_at` → 需 verify；仅 leased 且无开始痕 → 可判未执行）；调 verifier；按结论落状态；写报告。

### 5.4 13 类故障场景

| # | 场景 | 状态 | 恢复动作 | 自动重试 | 人工 |
|---|---|---|---|---|---|
| 1 | 执行前退出 | leased→unknown | 无开始痕+契约保证 → 判未执行 → planned | 是（满足门槛） | 否 |
| 2 | 执行中退出 | running→unknown | verify；成功→succeeded；不可判→unknown | 否 | 视结论 |
| 3 | 外部完成、写库前退出 | running→unknown | verify=confirmed_succeeded → succeeded | 否（不重做） | 否 |
| 4 | 部分完成 | running→unknown | partially_completed → 补偿队列 | 否 | 是 |
| 5 | verifier 不可用 | unknown 保持 | verification_error，退避重验 | 不重试执行 | 连续 3 次→是 |
| 6 | lease 重复领取 | 第二 CAS 失败 | 记 LEASE_LOST，不执行 | — | 否 |
| 7 | 双 worker 恢复 | 一个拿锁+CAS | 输家跳过并记录 | — | 否 |
| 8 | Android 重复唤醒 | 无变化 | requestId 幂等+全局锁 → 同一报告 | — | 否 |
| 9 | 系统时间变化 | 见 §4 | 只影响"是否怀疑"，验证兜底 | 否 | 否 |
| 10 | 手机重启 | leased/running→unknown | bootId 变 → 全部进恢复 | 视结论 | 视结论 |
| 11 | DB 短暂锁定 | 无变化 | BEGIN IMMEDIATE + busy 重试 + 流程重试 | 是（事务） | 否 |
| 12 | 网络不可用 | failed(TRANSIENT) 或 unknown | 网络类标 TRANSIENT 退避；外发中断=unknown | 仅 TRANSIENT | 否 |
| 13 | 取消与恢复并发 | cancelled 优先 | CAS 时检查 cancel_requested_at，直接 cancelled | — | 否 |

---

## 6. Verifier 体系

### 6.1 注册与强制

```js
reg.register('write_diary', {name:'diary_file', version:'1', timeoutMs:3000,
  class:'local_write', verify: async (ctx) => ({conclusion, evidenceRefs, retryPermitted, humanRequired})})
```

- 非 `read_only` 且未提供 verifier → **executor 注册失败**；read_only 挂默认 `result_shape` verifier。
- verifier 只读、无副作用、3s 超时；超时/抛错 → `verification_error`。

### 6.2 结论与证据

结论：`confirmed_succeeded | confirmed_not_executed | partially_completed | indeterminate | verification_error`。
证据：`{type, ref, sha256, at, observed, source}`；落 `action_verifications`（追加式，含 verifier 名称/版本/时间/结论/错误码/retry_permitted/human_required/confidence/duration/runtime_id）。

**`confirmed_not_executed` 的严格门槛**：权威否定回执，或"本地产物不存在且时间窗内无任何写入痕迹"，或"executor 契约保证副作用在 `executor_started` 之后且该 action 无开始痕"。否则一律 `indeterminate`（没找到 ≠ 没发生）。

### 6.3 按 kind 的 verifier 清单

| kind | class | verifier | 现状 |
|---|---|---|---|
| read_archive / organize_memory / find_sticker / browse_douyin | read_only | result_shape | 可立即实现 |
| write_diary | local_write | file_artifact（stat+sha256+mtime+当日唯一） | 部分 BLOCKED：需 Memory 按 id 读回或明确落盘路径 |
| send_qq | external_send | channel_receipt | **BLOCKED**：dyChannel 无发送查询 API；现证据是本地 hash |
| Android UI 类（未来） | ui_action | ui_post_state（操作后 ui/dump 节点变化） | NOT RUN（需授权） |
| 文件写（未来） | local_write | fs_artifact | 可立即实现 |

---

## 7. Android ↔ Autonomy 接口（与 Android 报告对齐）

### 7.1 传输层：沿用 Android 已提案的文件契约（不另造通道）

- `/root/.dsha-wake.json`：`{schema, attemptId, bootId, reason, requestedAt, notBefore, deadline, generation, mode}`
- `/root/.dsha-wake-result.json`：`{schema, attemptId, result, errorCode, at, autonomy:{runtimeId, resumeTick, pendingTasks, recovery}}`
- `/root/.dsha-runtime-events.jsonl`：追加式
- 扩展 `/root/.dsha-web-activity.json`：只加 `runtimeId` / `autonomy` 字段
- `attemptId`（Android）= `requestId`（Autonomy）；同窗口只一次；Autonomy 幂等表 `recovery_requests(attempt_id PK, at, report_json)` TTL 1h

### 7.2 语义层：本报告状态机

- Android **不得**直接读写 `autonomy.db` 的 `actions`；任务判定权在 Autonomy。
- Autonomy 读 `wake.json` 或由 host 调 `dyAutonomy.recover({requestId, reason, bootId})` → 返回 `RecoveryReport` → 由 Autonomy 原子写 `wake-result.json`（`/root` 为 ext4，rename 原子；`/sdcard` 不用 rename）。
- 报告结构：`{ok, requestId, runtimeId, bootId, startedAt, finishedAt, scanned, claimed, counts{succeeded,requeued,compensating,stillUnknown,cancelled,humanRequired}, results[], errors[]}`

### 7.3 接口提案（进程内）

```ts
dyAutonomy.runtimeInfo() → {runtimeId, bootId, startedAt, state, lastHeartbeatAt, recovery:{inflight,lastAt,lastRequestId,lastReport}}
dyAutonomy.recover({requestId, reason:'boot'|'wake'|'android_resume'|'manual', bootId?, source?}) → RecoveryReport
dyAutonomy.heartbeat() → {ok, runtimeId, at, state}
```

### 7.4 与 Android 报告的两处差异（需 GPT 统一）

1. **步骤⑦**：Android 报告写"Autonomy 启动后读取 → `tick({trigger:'resume'})` → 检查未完成任务"。**必须改为独立 recovery 入口**：tick 可被 `tick.enabled=false` 整体关闭，恢复不能依赖它。
2. **结果落盘**：Android 报告未写清 `wake-result.json` 的写入方。本报告建议由 Autonomy 写（语义单一来源），Android 只读。

---

## 8. P0-a 三项缺陷修复设计

### 8.1 F1 排序

- 根因：`lib/run/actions.js:166` 按随机 uuid 排序。
- 修复：`ORDER BY COALESCE(ended_at, created_at) DESC, rowid DESC`；新增索引 `idx_actions_kind_terminal(self_id, kind, ended_at DESC)`；抽纯函数 `countConsecutiveFails(rows)`。
- 回归：乱序 id 下断言 3 连败；生产副本重放 `browse_douyin` 序列，计数应与实际一致。

### 8.2 F2 错误码

- 根因：`lib/run/tick.js:372` 只取 `out.error`；executor 返回 code-only。
- 修复：契约 v2 `{ok:false, code, message?, retryable?, evidence?}`；`finishAction` 接收 `code`；新增 `error_code`/`failure_class`。
- 区分：`execution`（明确失败）/`verification`（验证失败）/`unknown`（超时/崩溃/租约）/`policy`/`timeout`。

### 8.3 F3 验证字段

- 根因：`actions` 无验证列；`out.ok===true` 即终态。
- 修复：`action_verifications` 表 + `actions.verify_state/verified_at/verified_by/verification_id`；`markSucceeded` 内部断言 `confirmed_succeeded`；未验证的成功只能落 `unknown`。
- 证明链：`succeeded → verification_id → action_verifications → evidenceRefs → 外部可复核对象`。

### 8.4 任务拆分

| 编号 | 内容 | 依赖 |
|---|---|---|
| AUTO-R1 | F1 排序 + 索引 + 回归 | — |
| AUTO-R2 | F2 契约 v2 + 错误码 + 迁移骨架 | R1 |
| AUTO-R3 | F3 验证字段 + verifier registry + read_only verifier | R2 |
| AUTO-R4 | lease→unknown + recoverExpiredLeases + runtime 身份 | R1–R3 |
| AUTO-R5 | 启动恢复入口 + 全局锁 + RecoveryReport + Android 接口 | R4 |
| AUTO-R6 | write_diary verifier | R3 + Memory 读回 |
| AUTO-R7 | send_qq verifier | R3 + channel 回执 |

迁移：`SCHEMA_VERSION=5`；补 `MIGRATIONS[3]`（purpose/home_activities 显式化，修当前 `MIGRATIONS` 无 3 的缺口）；`[4]` no-op（生产已 4）；`[5]` 新增 recovery 表与列。不修生产 `user_version`。

---

## 9. 测试矩阵

| 层 | 编号 | 内容 | 断言 |
|---|---|---|---|
| 单元 | U1–U8 | 排序/错误码/转换矩阵/lease/verifier 映射/幂等/时间跳变/未执行门槛 | 见设计正文 §8.1 |
| 集成 | I1–I8 | 6 个 kill 点、部分完成、verifier 不可用、双 worker、重复唤醒、DB 锁、取消并发 | 0 重复外部动作；succeeded 必有验证行；unknown 不落 failed |
| 故障注入 | — | 100 次/场景 | 同上 |

验收判据：`succeeded` 可追溯验证行；`failed` 有 error_code+failure_class；lease 过期产生 0 条 failed；同 action 执行 ≤1 次；unknown 可长期存在且不计失败。

---

## 10. 分阶段与授权门槛

D0 设计（本轮）→ D1 F1（授权写分支）→ D2 F2 → D3 F3+verifier 骨架 → D4 lease/unknown+恢复入口 → D5 Android 接口+实机重启 → D6 diary verifier → D7 send verifier。
每阶段：GPT 评审 → DSH 隔离实跑 → 证据 → 下一阶段。**任何阶段不得自动开启 tick。**

---

## 11. 未执行（NOT RUN）与边界声明

- 未改任何源码/DB/profile/配置；未启动 tick/scheduler/executor/staging；未部署/重启/切插件。
- 未执行迁移 v5、未做重启/崩溃演练、未调用 Android 接口、未做 verifier 真实回读。
- 未修改 `HANDOFF.md`/`REPORT.md`/`PROJECT.md`；未与 DSH 直接联系；未单方面冻结跨模块接口。
- 本报告所有源码结论基于 `dsh-autonomy@6c4a475`；运行时结论均为 NOT RUN / INCONCLUSIVE，不得当作实机结果。

## 12. 证据索引

| 证据 | 位置 |
|---|---|
| Autonomy 14 项矩阵全文 | `/tmp/audit/findings/autonomy-code.md`（本地，本轮未随报告上传） |
| Persona/Memory 接口全文 | `/tmp/audit/findings/persona-memory-iface.md`（同上） |
| Android 台账全文 | `/tmp/audit/findings/android-platform.md`（同上） |
| 测试日志 411/411 | `/tmp/audit/findings/test-run.log`（同上） |
| 生产 DB 只读快照 | `/tmp/audit/db/`（同上，非生产路径） |
| 关键命令 | `git ls-remote`（09:31）、`grep -rni heartbeat lib/`=0、`grep verifier`=0、生产 `GROUP BY kind,error` |

> 说明：本地 `/tmp` 证据 GPT 不可见，已在本报告内转为结论摘要；如需原始日志，由 DSH 按项目协议提供。
