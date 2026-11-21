# AUTONOMY-REPORT-0002 · Autonomy 自主系统负责人报告（恢复语义正式设计 v2）

> 会话：Autonomy 自主系统负责人（Autonomy 领域专业智能体）
> 覆盖任务：`AUTO-ARCH-AUDIT-01`（自主能力只读审计）、`AUTONOMY-RECOVERY-SEMANTICS-DESIGN-01`（v1 设计）、`AUTONOMY-RECOVERY-SEMANTICS-DESIGN-02`（按 GPT 裁决修订）
> 迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 09:49 (Asia/Shanghai) · v2
> 性质：只读设计修订。未改 Autonomy/Persona/Memory 源码；未创建开发分支；未写生产 DB；未启动 tick/scheduler/executor/staging；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`

## 版本历史

| 版本 | 时间 | 覆盖任务 | 变更摘要 |
|---|---|---|---|
| v1 (AUTONOMY-REPORT-0001) | 2026-11-21 09:40 | AUTO-ARCH-AUDIT-01 + DESIGN-01 | 首次建档：基线、11 项矩阵、状态机、lease/verifier/Android 接口、P0-a 拆分 |
| v2 (AUTONOMY-REPORT-0002) | 2026-11-21 09:49 | DESIGN-02 | 落实 GPT 12 项裁决；补齐 heartbeat 续租、executor_started 顺序、fencing token、错误分类、verifier 成功标准、取消并发、迁移方案、请求消费与 nextWake；与 Android v2 对齐并修正 v1 三处不一致 |

---

## 0. 给 GPT 的阅读导航

**一句话**：v2 把"租约过期→unknown→先验证"从原则落成了可实现的机制链：**claim CAS → attempt/fencing → executor_started 提交 → 执行 → 结果 CAS 提交 → 验证**；并给出与 Android v2 完全对齐的单向文件契约。

**GPT 12 项裁决落实位置**

| 裁决 | 落实章节 |
|---|---|
| 1 物理状态兼容 + 映射层 | §2 |
| 2 过期→unknown | §3、§4 |
| 3 ledger 归 Autonomy | §5.4、§7 |
| 4 单向文件契约 | §8.1 |
| 5 恢复独立入口 | §6.1 |
| 6 wake-result 由 Autonomy 写 | §8.1 |
| 7 pendingTasks 五分类 | §8.5 |
| 8 Android 不解释语义 | §8.1、§8.6 |
| A 心跳与租约 | §4 |
| B executor_started 顺序 | §5.1 |
| C fencing token | §5.2–5.3 |
| D 错误码与 unknown | §7.2 |
| E verifier 成功标准 | §7.3 |
| F 取消并发 | §7.4 |
| G 迁移 | §9 |

**仍需 GPT/负责人决定（§10）**：消费触发落点（watch+poll）、nextWake 钳制范围、生产 v4 溯源、外部回执型 verifier 的阻塞解除顺序。

**同一句话再强调一次**：本报告通过 ≠ 代码实现。所有实现 NOT RUN，DSH 实机 NOT RUN，staging NOT RUN，生产 DB 未修改（见 §12）。

---

## 1. 基线（2026-11-21 09:47–10:00 重新核对）

| 对象 | 值 | 核对方式 |
|---|---|---|
| `ba-song/dsh-memory-core` `coordination/project-handoff` | `03edfd6257e5f058859ad0aec53b2c1677f4745f`（Android v2 报告） | `git fetch` + `git ls-remote` |
| 本报修订前 blob | `58b40bf8334c3d59918504deeaf10a74e941cd5b`（v1） | `git rev-parse` |
| `coordination/HANDOFF.md` | `f8ffa40d4c27c04d23ff74b123bf2b7044821976`（3317 行） | 同上 |
| `coordination/REPORT.md` | `e219f707cc4363c53704fbe389f786148142326e`（172 行） | 同上 |
| `ba-song/dsh-autonomy` main | `6c4a4753b4737060211955b1f022cab2f1d39521`（tag v0.4.0 = `84cf56b1`） | 双向核对，无新提交 |
| `dsh-persona-core` main / EI-1 | `a84c7bad` / `92a763bf` | `ls-remote --heads` |
| 生产 autonomy | `/root/.dsh/plugin-src/dsh-autonomy`（无 `.git`，早于 GitHub HEAD） | 目录/diff |
| 生产 profile | `tick.enabled=false`、`realSafe=false`、`dryRun=false`、`sendEnabled=true` | `cordis.patch.yml` 只读 |
| 生产 DB | `user_version=4`；代码 `SCHEMA_VERSION=3` | 只读快照 |

**与 Android v2 的一致性**：Android 报告 v2（`03edfd6`）§3.3–3.7 已冻结文件所有权、请求消费 8 问、回执与 nextWake 骨架、pendingTasks 五分类。本报§8 与之逐字段对齐，并修正 v1 的三处不一致（§8.7）。

---

## 2. 状态机 v2（裁决 1、2）

### 2.1 物理值与语义映射层（不混用）

| 物理值（DB） | 对外语义 | 说明 |
|---|---|---|
| `planned` | `pending` | 待领取 |
| `leased` | `leased` | 已领取、未开始执行 |
| `running` | `running` | 已写 `executor_started` 并提交 |
| `done` | `succeeded` | **新数据**必须 `verify_state='verified_ok'`；旧数据 `legacy_unverified` |
| `failed` | `failed` | 必须有失败证据（`error_class` 非 unknown 类） |
| `unknown` | `unknown` | 新增；待核实 |
| `cancelled` | `cancelled` | 新增；取消 |
| `aborted` | `blocked`（策略/未执行） | 保留旧值，语义为"策略拦下/未执行"，**不是取消** |

**映射层约定**：DB 读写只用物理值；对外 API/回执/工具输出映射为语义值，映射表集中在 `lib/state-map.js`（待实现），任何地方不得混用。`done` 在对外 JSON 中一律输出 `succeeded`。

### 2.2 转换表（权威，含 CAS 条件）

| # | From | 事件 | To | CAS / 条件 |
|---|---|---|---|---|
| T1 | — | 政策通过 | planned | — |
| T2 | planned | 前置不满足 | planned+blocked_reason | `state_version` CAS |
| T3 | planned | 领取 | leased | `WHERE id=? AND status='planned' AND state_version=?`；同时 `attempt+=1`、`fencing_token+=1`、写 attempt 行 |
| T4 | leased | executor_started 提交 | running | `WHERE status='leased' AND lease_owner=? AND fencing_token=?` |
| T5 | running | 结果 ok + verifier=confirmed | done | `WHERE status='running' AND fencing_token=? AND lease_owner=?` |
| T6 | running | 结果 ok + verifier=indeterminate | unknown | 同上 |
| T7 | running | 明确失败 | failed | 同上 |
| T8 | leased/running | 租约过期/心跳丢失 | unknown | recovery CAS（§4.4） |
| T9 | unknown | confirmed_succeeded | done | `WHERE status='unknown' AND state_version=?` |
| T10 | unknown | confirmed_not_executed + retry | planned | 同上；`attempt` 保留 |
| T11 | unknown | confirmed_not_executed + 不重试 | cancelled | 同上 |
| T12 | unknown | partially_completed | unknown + compensating | `partial_json`、`human_required=1` |
| T13 | unknown | indeterminate/verification_error | unknown | 退避重验 |
| T14 | planned/leased（无开始） | 取消 | cancelled | §7.4 |
| T15 | running（已开始） | 取消请求 | 不变 + cancel_requested | §7.4，**不能抹掉已发生事实** |
| T16 | 终态 | 任何事件 | 不可转换 | 重做=新 action |

**禁止**：无证据 `running→failed`、`unknown→failed`、跳过验证的重排、`cancelled→failed`、终态回退。

---

## 3. lease 过期处理（裁决 2）

过期后的唯一合法去向是 `unknown`，**绝不 `failed`**：

```
1) 检测（§4.4）
2) CAS：UPDATE actions SET status='unknown', unknown_since=?, unknown_reason='lease_expired',
        ended_at=NULL, state_version=state_version+1
     WHERE id=? AND status IN ('leased','running') AND state_version=?
3) 同一事务写 action_log(event='lease_expired') 与 recovery 队列行
4) 投递 verifier（§7）
5) 只有 confirmed_succeeded 才 done；confirmed_not_executed 才重排；
   indeterminate 保持 unknown；partially_completed 进补偿
```

`unknown` 是**非终态**：`ended_at` 必须为空，`unknown_since` 必须非空。

---

## 4. 心跳与租约完整规则（A）

### 4.1 参数（一处定义，禁止散落）

```
heartbeatMs = clamp(floor(leaseMs/3), 15_000, 60_000)
leaseTtlMs  = 3 * heartbeatMs
leaseMs     = max(leaseSec*1000, timeoutMs*2 + 15_000)     // 默认 max(90s,135s)=135s
graceMs     = 60_000
```

默认：`heartbeatMs=45s`、`leaseTtlMs=135s`。**tick 与手动行动共用同一套计算**（修正 v1 指出的手动行动写死 60s）。

### 4.2 续租（CAS，且必须与心跳同一 UPDATE）

```sql
UPDATE actions
   SET heartbeat_at=?, lease_until=?, state_version=state_version+1
 WHERE id=? AND status IN ('leased','running')
   AND lease_owner=? AND fencing_token=? AND state_version=?
```

- `changes===1` → 续租成功；
- `changes===0` → **所有权已丢失**（被恢复/取消/抢占）→ worker 本地置 `leaseLost=true`，通过 `AbortSignal` 请求停止，**不得再提交任何结果**；
- 只有当前合法 owner（`lease_owner` + `fencing_token` 双匹配）可以续租；
- `heartbeat_at` 与 `lease_until` **永远在同一条 UPDATE 写入** ⇒ 不变式 `lease_until = heartbeat_at + leaseTtlMs` 恒成立。

**"心跳还在写、租约已过期"的矛盾状态在机制上不可能出现**：两者同写同改。若观测到（时钟跳变/人工改库），按不变式破坏处理：置 `unknown` + `unknown_reason='invariant_clock'`，交 verifier，不判 failed。

### 4.3 续租失败后的 worker 义务

1. 立即停止提交结果（含 success/failure）；
2. 若已拿到外部结果，只允许写 `late_result` 诊断事件（`action_log`，不改 status）；
3. 该结果可作为 verifier 的低置信证据（`source='late_worker'`、`confidence=low`），不能单独证明成功。

### 4.4 心跳丢失与过期判定

```
deadline = heartbeat_at + leaseTtlMs
过期     = now > deadline + graceMs
```

三个独立信号，任一成立即进入待恢复队列：

1. `now > deadline + graceMs`；
2. `lease_owner` 的 `runtimeId != 当前 runtimeId`（跨重启最可靠）；
3. `runtimes` 中该 runtime 已 `state='stale'`（`last_heartbeat_at < now - 2*heartbeatMs`）。

### 4.5 旧 runtime 识别

启动时 `registerRuntime()`：写 `runtimes`，把 `last_heartbeat_at` 超过 2 个心跳周期的旧 runtime 标 `stale`；扫描 `lease_owner LIKE '旧runtimeId#%'` 的 leased/running 全部进恢复队列。

---

## 5. executor attempt 与 fencing（B、C）

### 5.1 执行前的持久化顺序（强制）

```
TX1: planned→leased（CAS）
     写 action_attempts(action_id, attempt_no, fencing_token, runtime_id, lease_until)
     写 actions.attempt / fencing_token / lease_owner / lease_until / state_version+1
     COMMIT
TX2: leased→running（CAS on owner+token）
     写 actions.started_at、action_log(event='executor_started')
     COMMIT
—— 以上两次提交成功后，才允许调用 executor 产生外部副作用 ——
```

- **禁止**在 TX2 提交前产生任何外部副作用；违反者记 `EARLY_SIDE_EFFECT` 事件，action 直接置 `unknown` + 人工复核。
- 例外：`class='read_only'` 的 executor 无副作用，可跳过 TX2 的顺序约束，但**仍须先写 `executor_started` 再返回结果**（保证审计完整）。
- 若进程在 TX2 提交后、结果写回前退出 → `running` → 过期后 `unknown` → verifier（这是正常路径）。

### 5.2 fencing token 规则

- `fencing_token`：每个 action 每次领取 `+1`（单调递增，不复用）；
- `attempt_no`：`actions.attempt` 同步 `+1`，`UNIQUE(action_id, attempt_no)`；
- `state_version`：每次状态变更 `+1`，用于所有 CAS；
- **结果提交 CAS**：

```sql
UPDATE actions SET status=?, ..., state_version=state_version+1
 WHERE id=? AND status='running' AND lease_owner=? AND fencing_token=? AND state_version=?
```

`changes===0` → `FENCED_OUT`：旧 worker 的迟到结果被拒绝，**但结果不丢弃**，转 verifier 作为低置信证据（因为外部副作用可能已发生）。

### 5.3 边界（必须如实说明）

- fencing token **只能阻止重复提交状态**，**不能撤销已经发出的外部请求**；
- 外部副作用去重只能依赖：目标系统的幂等键、执行前查证、以及"unknown 不自动重试"；
- 因此：**未知结果一律先验证**，不因 fencing 成功就重试。

### 5.4 单次执行的证明链

`claim CAS（status='planned'）` + `UNIQUE(action_id, attempt_no)` + `fencing_token` 单调 + `action_ledger(idempotency_key)` 唯一 + 结果 CAS。
→ 可证明"同一 action 至多一个 attempt 能提交终态"；**不能证明"外部副作用只发生一次"**（见 5.3）。

### 5.5 verifier 如何识别执行尝试

verifier 入参必须含 `{action_id, attempt_no, fencing_token, action_kind, idempotency_key}`；`action_verifications` 行记录 `attempt_no`；证据必须能绑定到 attempt（回执 id / 文件 mtime 落在该 attempt 窗口 / 目标系统按幂等键可查）。

---

## 6. 恢复入口（裁决 5）

### 6.1 入口

```ts
dyAutonomy.recover({ requestId, reason:'boot'|'wake'|'android_resume'|'manual', bootId?, source? })
  → RecoveryReport
```

- **不依赖 tick**：`apply()` 中无条件 `scheduleRecovery({delay:10s})`，即使 `tick.enabled=false` 也执行；
- `tick({trigger:'resume'})` 保留但**不承担恢复**，只做常规 tick；
- 单飞：`recovery.lock`（meta，TTL 120s，CAS）+ 每 action `recovery_owner` CAS；
- 审计：`recovery_started` / `recovery_finished` 事件写 `action_log` 与 `dsha-autonomy-events.jsonl`。

### 6.2 处理顺序

```
取锁 → 扫描 → 逐条 CAS 认领 → 分类（有 executor_started?）→ verifier → 落状态 → 写回执
```

---

## 7. 错误分类、验证与取消（D、E、F）

### 7.1 错误分类（`error_class` 与 status 解耦）

| 情形 | error_class | status | retry_class |
|---|---|---|---|
| 未发出请求（连接拒绝/DNS/策略拒绝） | `not_sent` | `failed`（明确） | auto（transient） |
| 已发出、无权威结果（超时/进程死/回执丢） | `sent_unconfirmed` | **`unknown`** | none（先验证） |
| 远端明确拒绝（4xx/业务码） | `rejected` | `failed` | none / manual |
| 本地内部错误（序列化/DB） | `internal` | `failed` | auto once |
| verifier 失败/超时 | `verification` | `unknown` | 只重验 |

- `TRANSIENT` 是 **retry_class**，不是 status；`failed` 只用于"确认失败"。
- **unknown 不计入失败率、连续失败、熔断**（统计 SQL 排除 `status='unknown'`）。
- verifier 错误绝不写成执行失败（`failure_class='verification'`）。

### 7.2 unknown 的统计与处置

- `unknown` 单列统计（`unknownCount` / `unknownByKind`）；
- 连续失败只数 `status='failed' AND failure_class='execution'`；
- `unknown` 不阻塞同 kind 新行动？——**软阻塞**：同 `idempotency_key` 未决时禁止再领取；不同 key 允许，但同 kind 的 `unknown` 超过 3 条时降权（不硬停）。

### 7.3 verifier 成功标准（E）

`succeeded` 必须同时满足四条：

1. **确实执行**：attempt 行存在 + `executor_started` 已提交 +（副作用类）产物/回执绑定该 attempt；
2. **符合目标**：kind 级 postcondition 谓词成立（不是"对象格式正确"）；
3. **可绑定**：证据含 `action_id/attempt_no/fencing_token/idempotency_key`；
4. **可追溯**：`ref + sha256 + at + source(verifier@version)`。

**默认 `read_only` verifier 升级为 `result_binding`**：

- 必须校验 attempt 绑定与 payload hash；
- 本地可重读（`read_archive`/`organize_memory`/`find_sticker`）：重读源并比 hash → `confirmed_succeeded(high)`；
- 远端不可重读（`browse_douyin`）：只有拿到稳定外部 id 且与证据一致 → `confirmed_succeeded(medium)`；否则 `indeterminate`；
- **禁止**仅凭"返回对象字段齐全"判成功。

### 7.4 取消与并发（F）

| 时点 | 取消行为 |
|---|---|
| planned / leased（无 started） | CAS → `cancelled`，立即生效 |
| running（已 started） | 只置 `cancel_requested_at/by`，**status 不变**；发 AbortSignal；结果到达后按真实结果落 `done/failed/unknown`，并标 `cancel_after_effect=1` |
| unknown | 置 cancel_requested；verifier=`confirmed_not_executed` → `cancelled`；`confirmed_succeeded` → `done`（事实优先）；indeterminate → 保持 unknown |
| 终态 | 拒绝取消（返回 409 语义），不再改状态 |

- 取消与恢复的 CAS：两者都带 `state_version` + `WHERE status IN (...)`；先提交者赢，输家重读；
- 恢复认领时若发现 `cancel_requested_at` 非空 → 记录 `RECOVERY_ABORTED_BY_CANCEL`，不恢复；
- 部分完成：`verify_state='verified_partial'` + `partial_json`（已完成/未完成清单）+ `resolution='compensating'`，status 保持 unknown；
- `unknown` 可长期保留；连续 5 次重验仍 indeterminate → `resolution='waiting_owner'`（status 仍 unknown）。

---

## 8. Android ↔ Autonomy 文件契约（裁决 4、6、7、8）

### 8.1 所有权（与 Android v2 §3.3 完全一致）

| 文件 | 写入方 | 读取方 |
|---|---|---|
| `/root/.dsha-wake.json` | Android | Autonomy |
| `/root/.dsha-wake-result.json` | **Autonomy** | Android 只读 |
| `/root/.dsha-web-activity.json` | DSH Host | Android |
| `/root/.dsha-android-events.jsonl` | Android | 诊断工具 |
| `/root/.dsha-autonomy-events.jsonl` | Autonomy | 诊断工具 |

禁止：Android 读写 `autonomy.db`；Autonomy 写 `wake.json`；两模块共写同一 JSONL。

### 8.2 请求字段（Android 写）

`schema, attemptId, bootId, reason(boot|alarm|job|user_open|recovery), requestedAt, notBefore, deadline, generation, mode(check|recover)`。
`attemptId` 即 Autonomy 的 `requestId`。

### 8.3 回执字段（Autonomy 写）

`schema, attemptId, requestId, result(accepted|rejected|deferred|done|expired|failed), errorCode, runtimeId, bootId, startedAt, finishedAt, pendingTasks{5 类}, recovery{scanned,claimed,counts,results,errors}, nextWake`。

### 8.4 请求消费机制（关键：不能只靠启动读一次）

**三通道分工**：

1. **Host 内部调用**（boot/DSH 启动）：host 读 `wake.json` 后直接 `dyAutonomy.recover(...)`；
2. **文件变化通知**：`fs.watch('/root', {persistent:false})`，只关心 `dsha-wake.json`，去抖 300ms（Android v2 已实测可用）；
3. **5s mtime 轮询兜底**（inotify 丢失/溢出/不可用）。

**为什么不是单一方案**：纯轮询延迟与 IO 成本高；纯 watch 可能丢事件；纯 host 调用无法覆盖 Android 跨进程写文件。三者组合，任一路径成功即可，幂等由 `attemptId` 保证。
**Autonomy 自己的兜底**：每 60s 维护循环顺带比对一次 `wake.json` 的 `attemptId`，确保 DSH host 适配器缺失时也能消费。

### 8.5 pendingTasks 五分类（裁决 7）

| 字段 | 定义 |
|---|---|
| `pending` | `planned` 且无 blocked_reason |
| `unknown` | `unknown` |
| `blocked` | `planned` 且 `blocked_reason` 非空 |
| `recovering` | 当前被 recovery 认领（`recovery_owner` 非空） |
| `running` | `leased` 或 `running` |

### 8.6 nextWake 契约（裁决：至少 notBefore/reason/mode/窗口/可否推迟）

```json
{ "notBefore": 1795201800000, "latest": 1795205400000, "reason": "backoff|lease|budget|none",
  "mode": "check|recover", "allowDefer": true, "confidence": 0.8, "at": 1795201800000 }
```

- `at` 保留为 `notBefore` 的兼容别名；
- Android 钳制 `[10min, 24h]`，缺失用 30min 默认；Autonomy 只给建议，不调度；
- `allowDefer=false` 表示"尽快验证"，仍受 Android 硬下限约束。

### 8.7 与 Android v2 的三处修正（v1 遗留）

1. 事件日志拆分：`dsha-android-events.jsonl` / `dsha-autonomy-events.jsonl`（不再用共享 `runtime-events.jsonl`）；
2. 回执删除 `resumeTick` 字段（恢复不依赖 tick；如需观测另设诊断字段）；
3. `/root` 为 **f2fs**（Android 实测），rename 原子性结论不变，仅描述更正。

### 8.8 原子写、权限、半写、过期、幂等、覆盖、并发

| 问题 | 规则 |
|---|---|
| 原子写 | 同目录 `tmp + rename`，`0600`，`fsync` 文件与目录 |
| 半写入 | 只消费"JSON 完整 + schema=1 + attemptId 非空"的请求；解析失败记 `WAKE_FILE_INVALID`，等下次变化/轮询；连续 3 次无效 → 回执 `rejected/INVALID_WAKE_FILE` |
| 旧请求过期 | `now > deadline` 或 `requestedAt+10min < now` → 回执 `expired/REQUEST_EXPIRED`，不恢复 |
| 重复请求 | `recovery_requests(attempt_id PK)` TTL 1h，命中直接回缓存报告，`duplicate=true` |
| 覆盖 | 单飞；恢复中最多挂 1 个 pending（新覆盖旧），完成后处理；回执 `mergedFrom[]`（≤5） |
| 并发读取 | Android 只读完整文件；校验 schema+attemptId；解析失败重试；保留最近 1 条回执 |

---

## 9. 数据库迁移（G）

### 9.1 版本链

| 版本 | 内容 | 说明 |
|---|---|---|
| 1 | meta/drives/goals/actions/action_log/tick_runs | 现有 DDL |
| 2 | reflections | 现有 MIGRATIONS[2] |
| 3 | purpose_hypotheses + home_activities | **补显式迁移**（修当前 `SCHEMA_VERSION=3` 但 `MIGRATIONS` 无 3 的缺口） |
| 4 | no-op 标记 | 生产已有；不得 drop；不猜测来源（INCONCLUSIVE） |
| 5 | runtimes / action_attempts / action_verifications / action_ledger / recovery_requests + actions 新列 | 本设计 |

### 9.2 规则

1. **全新库**：执行完整 DDL 后按 2..5 走一遍迁移（保证 DDL 与迁移一致），最后 `PRAGMA user_version=5`；
2. **逐级**：`from=2 → 3,4,5`；`from=3 → 4,5`；`from=4 → 5`；
3. **重复迁移**：所有 DDL `IF NOT EXISTS`；列用 `PRAGMA table_info` 判断后再 `ALTER`（SQLite 不支持 `ADD COLUMN IF NOT EXISTS`）；
4. **中断恢复**：每个版本一个 `BEGIN IMMEDIATE … COMMIT`，`user_version` 在同一事务内更新；失败 `ROLLBACK`，版本保持旧值，可重跑；
5. **未来版本**：`from > 5` → 拒绝迁移，进入只读降级，错误码 `SCHEMA_TOO_NEW`，**禁止降级**；
6. **前后校验**：前 `PRAGMA quick_check` + 备份文件；后检查期望表/列/索引集合 + `PRAGMA foreign_key_check` + `user_version`；
7. **不修改生产 DB**：本设计只在隔离临时库演练。

### 9.3 隔离演练证据（/tmp，非生产）

命令：`node /tmp/audit/mig-probe/probe.mjs`（2026-11-21 09:48，exit 0）

```
from=0 / 2 / 3 / 4  → version=5, tables_missing=[], cols_missing=[], fk=0  PASS
每个 from 重复迁移一次  → PASS
中断（事务内抛错后 ROLLBACK）→ version 3->3, runtimes_created=0  PASS
中断后重跑 → version=5, 全项 PASS
from=6（未来版本）→ 迁移器必须拒绝（设计约束）
ALL PASS
```

> 这是**临时库演练**，不是生产迁移，也不是 DSH 实机验证。

---

## 10. 13 类故障场景（修订版）

| # | 场景 | 状态 | 恢复动作 | 自动重试 | 人工 |
|---|---|---|---|---|---|
| 1 | 执行前退出（TX1 后、TX2 前） | leased→unknown | 无 executor_started + 契约保证 → 判未执行 → planned | 是（满足门槛） | 否 |
| 2 | 执行中退出（TX2 后） | running→unknown | verifier；成功→done；不可判→unknown | 否 | 视结论 |
| 3 | 外部完成、结果未提交 | running→unknown | verifier=confirmed_succeeded → done | 否 | 否 |
| 4 | 部分完成 | running→unknown | partial_json + compensating | 否 | 是 |
| 5 | verifier 不可用 | unknown | verification_error，退避重验 | 只重验 | 3 次后是 |
| 6 | lease 重复领取 | 第二 CAS 失败 | LEASE_LOST，不执行 | — | 否 |
| 7 | 双 worker 恢复 | 一个拿锁+CAS | 输家 RECOVERY_LOCK_LOST | — | 否 |
| 8 | Android 重复唤醒 | 无变化 | attemptId 幂等 + 单飞 → 同报告 | — | 否 |
| 9 | 系统时间变化 | 见 §4.2 | 只影响"是否怀疑"；验证兜底 | 否 | 否 |
| 10 | 手机重启 | leased/running→unknown | bootId 变 → 全部恢复 | 视结论 | 视结论 |
| 11 | DB 短暂锁定 | 无变化 | BEGIN IMMEDIATE + busy 重试 + 流程重试 | 是（事务） | 否 |
| 12 | 网络不可用 | failed(not_sent) 或 unknown(sent_unconfirmed) | 按 §7.1 分类 | 仅 not_sent | 否 |
| 13 | 取消与恢复并发 | cancelled 或保留 running/unknown | state_version CAS；先提交者赢 | — | 副作用已发生时可能需要 |

---

## 11. 验收矩阵（GPT 指定 13 项）

| # | 验收点 | 测试层 | 断言 |
|---|---|---|---|
| 1 | tick.enabled=false 仍恢复 | 集成 | 无 tick 定时器时 `recover()` 仍扫描并处理 |
| 2 | lease 过期不产生 failed | 单元/集成 | `failed` 计数增量 = 0 |
| 3 | 心跳续租不能被旧 owner 执行 | 单元 | 非当前 owner 续租 changes=0 |
| 4 | 旧 worker 迟到提交被 fencing 拒绝 | 单元 | 结果 CAS changes=0，记 FENCED_OUT |
| 5 | 副作用已发生、DB 未提交 → verifier | 集成（kill 注入） | 进 `unknown` 并调用 verifier |
| 6 | verifier 不可用保持 unknown | 集成 | 无终态变更、无重试执行 |
| 7 | 双 worker 同时恢复不重复领取 | 集成 | 仅 1 条 attempt、1 次状态转换 |
| 8 | 重复 Android 请求不重复恢复 | 集成 | 同一 attemptId 返回缓存报告 |
| 9 | succeeded 必须有验证证据 | 单元 | 无 verification 行则拒绝 done |
| 10 | cancelled 与恢复并发不覆盖真实结果 | 集成 | 取消后 succeeded 仍记事实（cancel_after_effect=1） |
| 11 | 请求已发出、回执丢失不盲重试 | 集成 | `sent_unconfirmed` → unknown，不重排 |
| 12 | unknown 不计入 failed 熔断 | 单元 | 连续 failed 计数不受 unknown 影响 |
| 13 | 迁移中断可安全恢复 | 隔离演练 | 已 PASS（§9.3）；需补 v5 生产副本演练（NOT RUN） |

---

## 12. AUTO-R1…R7（更新后）

| 编号 | 内容 | 依赖 | 验收标准 |
|---|---|---|---|
| AUTO-R1 | F1 排序 + 连续失败纯函数 + 索引 | — | 乱序 id 下 3 连败计数正确；生产副本重放一致 |
| AUTO-R2 | F2 错误分类（error_class/failure_class/retry_class）+ unknown 语义 | R1 | 6 种错误断言分类正确；unknown 不进失败统计 |
| AUTO-R3 | verifier 框架 + `action_verifications` + read_only 升级为 result_binding | R2 | 无 verifier 不得注册副作用类 executor；仅格式正确不得 succeeded |
| AUTO-R4 | lease + heartbeat 续租 + 过期→unknown | R1–R3 | 验收 2/3/12；矛盾状态不可构造 |
| AUTO-R5 | attempt + fencing token + 迟到结果拒绝 | R4 | 验收 4/7；UNIQUE(action_id,attempt_no) 生效 |
| AUTO-R6 | 恢复独立入口 + Android 文件消费/回执/nextWake | R4、R5 | 验收 1/6/8/10/11 |
| AUTO-R7 | 迁移 v5 + 前后校验 + 中断演练 | R2、R3 | 验收 13；迁移器拒绝降级 |
| （R8） | `write_diary` verifier | R3 + Memory 读回 | 目前 BLOCKED |
| （R9） | `send_qq` verifier | R3 + 通道回执 | 目前 BLOCKED |

---

## 13. 仍未解决的问题

1. **外部回执能力缺失**：`send_qq` 无发送查询 API，`write_diary` 无按 id 读回；R8/R9 需 Memory 与 channel-bridge 先提供读接口。当前这类行动的诚实终态是 `unknown`。
2. **消费触发落点**：`fs.watch('/root')` + 5s 轮询需 GPT 确认（Android v2 §5.1 也列为待裁决）。
3. **nextWake 钳制范围**：Android 提议 `[10min,24h]`，需统一。
4. **生产 `user_version=4` 来源**：无法从现有证据判定（INCONCLUSIVE）；迁移 5 设计为纯增量，不依赖来源，但溯源仍缺证据。
5. **跨进程时钟**：墙钟只作提示；monotonic 仅进程内。跨重启的时间判定依赖 `boot_id` + 心跳，需 DSH 实机验证时钟行为。
6. **unknown 与同 kind 新行动的软阻塞阈值**（建议 3 条）需产品侧确认。
7. **DSH host 适配器归属**：谁实现 `wake.json` 的宿主侧调用与事件转发（Autonomy 自身的 60s 兜底可应急，但不是长期方案）。

---

## 14. 实现状态声明（必须原样保留）

- **设计通过 ≠ 代码实现**；本报告全部为设计。
- 所有源码实现 **NOT RUN**（未创建分支、未改 `dsh-autonomy`）。
- DSH 实机验证 **NOT RUN**（未做 kill/reboot/崩溃注入）。
- staging **NOT RUN**。
- **生产数据库未修改**；未修 `user_version` 漂移。
- 迁移演练仅在 `/tmp` 临时库完成（§9.3），不代表生产可安全迁移。

## 15. 证据索引

| 证据 | 位置/命令 | 结果 |
|---|---|---|
| 基线 | `git ls-remote`、`git rev-parse`（09:47） | autonomy `6c4a4753`；handoff `03edfd62`；v1 blob `58b40bf8` |
| 心跳缺失 | `grep -rni heartbeat lib/` | 0 命中 |
| 验证缺失 | `grep -rni verifier lib/`；`schema.js:49-73` | 0 命中；无 verified 列 |
| 排序缺陷 | `actions.js:14-16,166` | uuid 当时间轴 |
| 迁移演练 | `node /tmp/audit/mig-probe/probe.mjs` | from 0/2/3/4、重复、中断、重跑 全 PASS，exit 0 |
| fencing 演练 | `node /tmp/audit/mig-probe/fencing.mjs` | claimB=0、renewB=0、lateA=0、verified=1，PASS |
| Android 对齐 | `coordination/Android 平台负责人报告.md` @ `03edfd6` §3.3–3.7 | 文件所有权/消费/回执/nextWake 一致 |

## 16. 边界声明

本轮只读设计修订：未改任何源码/DB/profile/配置；未创建分支；未启动 tick/scheduler/executor/staging；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`/`PROJECT.md`；未与 DSH 直接联系；未单方面冻结跨模块接口（§8 为与 Android v2 对齐后的提案，仍待 GPT 冻结）。
