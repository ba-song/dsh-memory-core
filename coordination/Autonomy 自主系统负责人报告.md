# AUTONOMY-REPORT-0003 · Autonomy 自主系统负责人报告（恢复语义正式设计 v3）

> 会话：Autonomy 自主系统负责人
> 覆盖任务：`AUTO-ARCH-AUDIT-01`、`AUTONOMY-RECOVERY-SEMANTICS-DESIGN-01/02/03`
> 迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 09:58 (Asia/Shanghai) · v3
> 性质：只读设计修订。未改源码；未创建分支；未写生产 DB；未启动 scheduler/executor/staging；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`

## 版本历史

| 版本 | 时间 | 变更摘要 |
|---|---|---|
| v1 | 2026-11-21 09:40 | 首次建档：基线、11 项矩阵、状态机、lease/verifier/Android 接口、P0-a 拆分 |
| v2 | 2026-11-21 09:49 | 落实 GPT 12 项裁决：heartbeat、executor_started、fencing、错误分类、verifier 标准、取消、迁移、消费、nextWake |
| v3 | 2026-11-21 09:58 | 请求/回执持久性（inbox/outbox + ledger + ack）、recovery.lock 续租、runtime stale 与 lease 分离、nextWake 统一、文件原子性/磁盘满/清理、迁移补齐 v1 与 v4 副本、隔离演练证据 |

---

## 0. 给 GPT 的阅读导航

本轮只改 6 处，其余沿用 v2：

| 修订 | 章节 |
|---|---|
| 1 请求/回执持久性（A/B/C 选型） | §8.1–8.4 |
| 2 recovery.lock 续租与接管 | §4.6 |
| 3 runtime stale 与 action lease 分离 | §6.3 |
| 4 nextWake 与 Android 统一 | §8.6 |
| 5 文件持久性与原子性 | §8.9 |
| 6 迁移补齐 | §9.2–9.4 |

**一句话**：把"单文件覆盖"改成"**一请求一文件 + Autonomy 侧持久 ledger + 逐请求回执 + 显式 ack**"；doorbell 文件只做加速、不做真相；recovery.lock 与 action fencing 分成两把锁；runtime 心跳过期只给"查看资格"，执行权回收必须走 lease/进程死亡证据 + CAS + fencing。

**设计状态**：本报告为设计提案；代码实现、DSH 实机、staging 均 NOT RUN；生产 DB 未修改（§14 分三类列明）。

---

## 1. 基线（2026-11-21 09:55–10:00 复核）

| 对象 | 值 | 方式 |
|---|---|---|
| `ba-song/dsh-memory-core` `coordination/project-handoff` | `01afc56cd8067a089e26525cba276a5ed2abf262` | `git fetch` + `ls-remote` |
| 本报修订前 blob | `899528d74538d6033bc4128a906cfe486d7b7880`（v2） | `git rev-parse` |
| `coordination/HANDOFF.md` | `f8ffa40d4c27c04d23ff74b123bf2b7044821976`（未改） | 同上 |
| `coordination/REPORT.md` | `e219f707cc4363c53704fbe389f786148142326e`（未改） | 同上 |
| `ba-song/dsh-autonomy` main | `6c4a4753b4737060211955b1f022cab2f1d39521`（无新提交） | 双向核对 |
| 生产 autonomy | `/root/.dsh/plugin-src/dsh-autonomy`，无 `.git`，早于 GitHub HEAD | 目录/diff |
| 生产 profile | `tick.enabled=false`、`realSafe=false`、`dryRun=false`、`sendEnabled=true` | 只读 |
| 生产 DB | `user_version=4`；代码 `SCHEMA_VERSION=3` | 只读副本 |
| `/root` 文件系统 | **f2fs**（`/dev/block/dm-44`，223G，53% 使用） | `stat -f` / `df`（09:55） |

与 Android v2（`03edfd6`）无冲突；本报新增的 inbox/outbox/ack 目录需 Android 联合确认（§8.11）。

---

## 2. 状态机（沿用 v2，补充请求状态）

### 2.1 action 状态

物理值 `planned/leased/running/done/failed/aborted` + 新增 `unknown/cancelled`；对外 `done→succeeded` 走统一映射层（`lib/state-map.js`，待实现）。

### 2.2 action 转换（不变）

`planned→leased→running→done|failed|unknown`；`unknown→done|planned|cancelled`；终态不可回退；所有转换带 `state_version` CAS；无证据不得 `failed`。

### 2.3 新增：请求记录状态（`recovery_requests`）

```
received → queued → running → done | merged
                              ↘ rejected | expired | duplicate
done/merged → acked → purged
```

`merged` 是**该请求 ID 的终态**（不是丢失）：`leader_attempt_id` 指向真正执行的请求；leader 的回执 `mergedFrom[]` 列出全部被合并 ID。

---

## 3. lease 过期（不变）

过期唯一去向 `unknown`；CAS 置 `unknown_since/unknown_reason`；同事务写 `action_log` 与请求队列表；只有 `confirmed_succeeded` 才 `done`，`confirmed_not_executed` 才重排。

---

## 4. 心跳、租约与 recovery.lock

### 4.1 action lease 参数（不变）

`heartbeatMs = clamp(leaseMs/3, 15s, 60s)`；`leaseTtl=3×heartbeat`；`leaseMs=max(leaseSec*1000, timeoutMs*2+15s)`；grace 60s。

### 4.2 续租（不变，同一 UPDATE 写 heartbeat+lease）

```sql
UPDATE actions SET heartbeat_at=?, lease_until=?, state_version=state_version+1
 WHERE id=? AND status IN ('leased','running')
   AND lease_owner=? AND fencing_token=? AND state_version=?
```

`changes=0` → 所有权丢失 → 停止提交；迟到结果只作 verifier 低置信证据。

### 4.3 过期判定（v3 修订：与 runtime stale 分离，见 §6.3）

### 4.4 旧 runtime 识别（不变）

### 4.5 不变式（不变）

### 4.6 recovery.lock 完整规则（本轮新增）

**独立于 action 锁**：recovery.lock 保护"恢复流程的状态写入权"，action fencing 保护"执行结果的提交权"。

```
表 recovery_lock(id=1, owner TEXT, token INTEGER, heartbeat_at INTEGER,
                 expires_at INTEGER, epoch INTEGER)
参数：recoveryHeartbeatMs = 20s；recoveryTtlMs = 60s（3×）
```

- **获取**（CAS，新建或过期接管）：
  ```sql
  INSERT INTO recovery_lock(id,owner,token,heartbeat_at,expires_at,epoch)
  VALUES(1,?,1,?,?,1)
  ON CONFLICT(id) DO UPDATE SET
    owner=excluded.owner, token=recovery_lock.token+1,
    heartbeat_at=excluded.heartbeat_at, expires_at=excluded.expires_at,
    epoch=recovery_lock.epoch+1
  WHERE recovery_lock.owner IS NULL OR recovery_lock.expires_at < ?
  ```
  `changes=1` → 拿到锁；`0` → 别人持有。
- **续租**（CAS，只能 owner）：
  ```sql
  UPDATE recovery_lock SET heartbeat_at=?, expires_at=?
   WHERE id=1 AND owner=? AND token=?
  ```
  `changes=0` → **锁已丢失**。
- **长时间 verifier**：每个 action 处理前后各续租一次；单 verifier 超时 3s；若一批 50 条，最坏 150s，靠"每条续租"覆盖，不靠单次 TTL。
- **续租失败后的 worker 行为**：
  1. 立即停止**状态写入**（不再改任何 action 状态）；
  2. 允许完成当前只读 verifier（无副作用）；
  3. 写部分报告 + `RECOVERY_LOCK_LOST` 事件；
  4. 退出恢复，不清理、不回滚别人的工作。
- **旧 worker 迟到结果拒绝**：恢复期间的 action 状态更新必须带锁 token 谓词：
  ```sql
  UPDATE actions SET status=?, ..., state_version=state_version+1
   WHERE id=? AND state_version=?
     AND EXISTS(SELECT 1 FROM recovery_lock WHERE id=1 AND owner=? AND token=?)
  ```
  `changes=0` → `RECOVERY_FENCED_OUT`，旧 worker 不得重试该写入。
- **过期后第二个 worker 接管**：`expires_at < now` → 新 worker CAS 获取，`token+1`、`epoch+1`；旧 worker 的下一次续租与状态写入全部失败。
- **审计**：`recovery_lock_acquired / renewed / lost / takeover` 写 `action_log` 与 `dsha-autonomy-events.jsonl`。

---

## 5. executor attempt 与 fencing（沿用 v2）

顺序：`TX1 领取（attempt+fencing）→ TX2 executor_started → 执行 → 结果 CAS（owner+token+state_version）`。
边界：fencing 只阻止重复提交状态，不撤销已发出的外部请求（§5.3 v2）。
恢复期的状态写入额外受 recovery.lock token 约束（§4.6）。

---

## 6. 恢复入口与触发证据分离

### 6.1 入口（不变）

`dyAutonomy.recover({requestId, reason, bootId?, source?})`；`apply()` 无条件挂 `scheduleRecovery(10s)`，与 `tick.enabled` 无关；`tick({trigger:'resume'})` 不再承担恢复。

### 6.2 处理顺序（不变）

取锁 → 扫描 → CAS 认领 → 分类 → verifier → 落状态 → 回执。

### 6.3 runtime stale 与 action lease 分离（本轮修订）

**两个资格必须分开：**

| 证据 | 恢复扫描资格 | 执行权回收资格 | 说明 |
|---|---|---|---|
| runtime 心跳过期（>2 周期） | ✅ | ❌ | 只说明"可能出事"，不能证明执行权失效 |
| action lease 到期 + grace | ✅ | ✅ | 时间证据（中等强度） |
| `bootId` 改变 | ✅ | ✅ | 强证据：旧 boot 的进程必已死 |
| `runtimeId` 改变 + 旧 PID 不存在 + 心跳超 2 周期 | ✅ | ✅ | 进程确认退出 |
| host 显式 `stopping` 事件 | ✅ | ✅ | 主动退出 |
| `cancel_requested` | ✅ | ❌（取消走取消通道） | 不能替代回收 |
| action 已 `unknown` | ✅ | — | 直接进 verifier |

**规则**：
1. 只满足"扫描资格"时，只做**只读核查**（verifier/状态查询），**不得**改 action 状态、不得重排、不得判失败；
2. 满足"回收资格"才允许 `leased/running → unknown`，且必须 action CAS + `state_version`；
3. **lease 仍有效时，不得仅因 runtime heartbeat stale 重新执行**；即使 verifier 说"看起来没做"，也要等 lease 到期或拿到强证据（bootId/进程死亡）；
4. 重排只发生在 `confirmed_not_executed` 之后，并生成新 attempt（fencing+1）。

---

## 7. 错误、验证、取消（沿用 v2）

- 错误分类：`not_sent / sent_unconfirmed / rejected / internal / verification`；`sent_unconfirmed` 必须 `unknown`；unknown 不计失败率/熔断。
- verifier 四条成功标准；`read_only` 升级为 `result_binding`；仅格式正确不得 `succeeded`。
- 取消：副作用前可直转 `cancelled`；副作用后只置 `cancel_requested`，按真实结果落状态并标 `cancel_after_effect`。

---

## 8. 请求/回执持久性与 Android 契约（本轮重写）

### 8.1 选型：A + B 混合，C 只做加速

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| A 一请求一文件 | 无覆盖、天然幂等、重启可恢复 | 无 ack/合并状态，目录扫描成本 | **采纳为传输层** |
| B SQLite ledger + 文件通知 | 合并/ack/重启恢复最强，可追溯 | Android 不能共享 DB（违反所有权） | **采纳为 Autonomy 内部真相层** |
| C 单文件 + generation + ack watermark | 文件最少 | 覆盖即丢请求；watermark 无法恢复被覆盖 ID；合并不可追溯 | **只保留 generation 做 doorbell 加速** |

**最终结构**：

**路径与 Android v3 已对齐**（`03edfd6`→`a48fc33` 采用 `/root/.dsha-wake/`）：

```
/root/.dsha-wake/inbox/<attemptId>.json    Android 写 / Autonomy 读 / Android 清理
/root/.dsha-wake/outbox/<attemptId>.json   Autonomy 写 / Android 只读 / Autonomy 清理
/root/.dsha-wake/ack/<attemptId>.json      Android 写 / Autonomy 读 / Android 清理
/root/.dsha-wake/legacy/                   v2 单文件迁移备份（只读，1 个版本后删）
/root/.dsha-autonomy-events.jsonl          Autonomy 写
/root/.dsha-android-events.jsonl           Android 写
```

**权威性**：`outbox/<attemptId>.json` 的逐请求回执是权威；`recovery_requests` ledger 是合并/ack/重启恢复的权威；`generation` 在请求体内，**不再单独设 doorbell 文件**（目录 watch + 5s 轮询已足够，见 §8.7）。
**Android 复杂度**：写 1 个小请求文件 + 读 1 个回执文件 + 写 1 个 ack 标记；不读 DB、不加锁、不解释语义。

### 8.2 六条保证的落地

| 保证 | 机制 |
|---|---|
| 1 请求 ID 不静默丢失 | 请求先落盘为独立文件；Autonomy 先写 ledger 再删/归档 inbox 文件；解析失败进 quarantine，**绝不删除** |
| 2 重复请求幂等 | `attemptId` 为文件名 + ledger 主键；重复文件直接归档，返回同一回执（`duplicate:true`） |
| 3 合并请求全可追溯 | 每个 ID 都有独立回执：leader=`done + mergedFrom[]`，被合并者=`merged + mergedInto`；ledger 双字段落库 |
| 4 回执在 ack 前不清除 | 只有 `ack/<id>.json` 出现且保留期到才删 outbox 文件；未 ack 不自动删除；任何 TTL 清理必须先复制进 ledger 并记事件 |
| 5 重启可恢复 | 启动扫 inbox（未 ingest）+ ledger（未完成）+ outbox（已完成后丢失的回执重写） |
| 6 轮询兜底 | 5s 目录扫描（按文件名/mtime），不依赖 doorbell；doorbell 丢失也能全部找回 |

### 8.3 并发场景

| 场景 | 处理 |
|---|---|
| 多个不同 attemptId 消费前连续到达 | 一请求一文件，互不覆盖；ledger 逐条 `received` |
| 恢复期间多个请求覆盖 | 不合并执行；进 `queued` 队列，当前完成后逐条处理；回执各自独立 |
| Android 未读旧回执就有新回执 | 新回执是新文件，不覆盖旧文件 |
| 进程重启后未确认请求 | inbox 未 ingest 的重放；ledger `received/queued/running` 重新排队（`running` 先按恢复规则转 unknown 再验证）；`done/merged` 未 ack 的重写回执 |
| 合并请求的结果 | leader 回执带 `mergedFrom[]`；每个被合并 ID 单独回执 `merged + mergedInto`；ledger 记录 `leader_attempt_id` |

### 8.4 请求生命周期（ledger）

`received → queued → running → done|merged`；异常 `rejected|expired|duplicate`；`done|merged → acked → purged`。
TTL：`recovery_requests` 保留 30 天；未 ack 的 permanent；purged 仅标记不删审计。

### 8.5 pendingTasks 五分类（不变）

`pending / unknown / blocked / recovering / running`。

### 8.6 nextWake 统一（本轮修订）

```json
{ "schema":1, "notBefore":1795201800000, "latest":1795205400000,
  "reason":"lease|backoff|verifier_retry|budget|none", "mode":"check|recover",
  "allowDefer":false, "confidence":0.8, "at":1795201800000 }
```

- `at` = `notBefore` 的兼容别名；
- `allowDefer=false`（紧急核实，如 lease 到期/回执丢失）：**请求按 notBefore 调度，不得被普通 10min 周期下限无理由推迟**；Android 若因系统能力延后，必须记 `DEFERRED_BY_SYSTEM` + `actualAt`；
- `allowDefer=true`（budget/none）：受普通 10min 最小间隔约束；
- `latest` 是硬截止，`notBefore > latest` 时取 `latest`；
- **24h 只是最大兜底间隔**（无 nextWake 时的默认上限），不是任何任务的默认等待；
- `confidence` 表示"对紧急度的置信"，不是任务成功率。

### 8.7 消费机制（沿用 v2）

host 内部调用 + `fs.watch('/root/.dsha-wake/inbox')` 去抖 300ms + 5s 目录轮询；Autonomy 60s 维护循环再兜底一次。dir watch 失败自动退回纯轮询。**不依赖 doorbell**。

### 8.8 回执字段（沿用 v2）

`schema, attemptId, requestId, result, errorCode, runtimeId, bootId, startedAt, finishedAt, pendingTasks, recovery, nextWake`；新增 `mergedFrom[] | mergedInto | duplicate`。

### 8.9 文件持久性与原子性（本轮新增，与 Android v3 §3.6 对齐）

**写**（请求/回执/ack 统一）：

```
1) 同目录创建 .tmp-<attemptId>-<pid>-<rand>，O_CREAT|O_EXCL，0600
2) write 全量 → fsync(fd) → close
3) 发布：
   - 请求（不可覆盖）：link(tmp, final)；目标已存在则失败 → 换 attemptId/seq，绝不覆盖
   - 回执/ack（本模块独占文件名）：rename(tmp, final)
   - 不支持 link 时退化为 O_EXCL create final → write → fsync（读取方必须校验完整性）
4) fsync(dirfd)（目录项落盘）
5) unlink(tmp)；启动时清理 >1h 的 .tmp-*
```

**读**：整文件读（≤64KB）→ JSON 解析 → 校验 `schema=1` 且 `attemptId` 与文件名一致；失败重试 3×50ms；仍失败 → 移入 `<name>.corrupt-<ts>` + 事件，**绝不静默删除**。

**损坏恢复**：corrupt 文件保留供重放；ledger 中已 ingest 的请求不受影响；未 ingest 的请求由 Android 重试（同 attemptId 幂等）。

**磁盘空间不足**：
- 请求侧（Android）：写失败保留旧文件，记 `STORAGE_LOW` 并退避，不降级到 `/sdcard`；
- Autonomy：回执写失败 → ledger 保持 `done/merged` 未 ack，退避重写；**未落盘的回执不得标记 acked**；inbox 满（500）→ 新请求 `INBOX_FULL`，不删未 ack 条目；outbox 满（500）→ `rejected/BACKPRESSURE`，不丢旧回执。

**权限**：文件 `0600`、目录 `0700`；只用 `/root`（f2fs），不用 `/sdcard`（FUSE 不支持原子 rename）。

**保留/清理（与 Android v3 一致）**：
- inbox：Android 收到 ack 后 24h 清理；过期请求 7 天清理（记事件）；
- outbox：Autonomy 见到 ack 后 10min 清理；**未 ack 不自动删除**（GPT 硬要求）。若运维确需 7 天 TTL，只能在报告已完整复制进 ledger 后执行，并记 `OUTBOX_TTL_PURGED` 事件；Android 侧仍按 `UNCONFIRMED` 处理，不得据此重做；
- ack：Android 写入后 24h 清理；
- corrupt：30 天；
- ledger：30 天（未决/未 ack 除外）；
- 上限：inbox/outbox 各 500 条，80% 记 `INBOX_HIGH`。

### 8.10 与 Android v3 的一致性

| 项 | Android v3 | 本报 v3 | 状态 |
|---|---|---|---|
| 目录 | `/root/.dsha-wake/{inbox,outbox,ack,legacy}` | 同 | ✅ 已对齐 |
| 请求载体 | 一请求一文件，attemptId 文件名 | 同 | ✅ |
| 回执 | 逐请求 outbox，merged 两边可终态 | 同 | ✅ |
| ack | Android 写 `ack/<id>.json`（含 receiptSha256） | 同；Autonomy 校验 sha256 后再清理 | ✅ |
| 原子发布 | link 优先，rename 用于独占文件 | 同 | ✅ |
| 清理归属 | inbox/ack 由 Android；outbox 由 Autonomy | 同 | ✅ |
| 消费 | 目录 watch + 5s 轮询 + 60s 维护 | 同 | ✅ |
| nextWake reason | `backoff|lease|budget|none` | 增加 `verifier_retry` | ⚠ 需 Android 接受新增枚举 |

### 8.11 仍需 Android 确认的 3 点

1. `ack/<id>.json` 的 `receiptSha256` 必须与 outbox 文件字节一致（Autonomy 以此判定"已读且完整"，不一致则视为未 ack 并保留）。
2. `INBOX_FULL` / `BACKPRESSURE` 的退避与告警口径（Android 侧不得因满而删除未 ack 条目）。
3. nextWake 新增 `verifier_retry` reason 的接受（若拒绝，Autonomy 退回 `lease` + confidence）。

## 9. 迁移（本轮补齐）

### 9.1 版本链（不变）

v1 基础表 → v2 reflections → v3 purpose/home_activities（补显式）→ v4 no-op → v5 recovery 对象 + actions 新列。

### 9.2 迁移矩阵（本轮补 v1/v5/未来/逐级中断/v4 副本）

| 起点 | 步骤 | 结果 |
|---|---|---|
| 0（空库） | DDL + v1..v5 | v5 |
| 1 | 2,3,4,5 | v5 |
| 2 | 3,4,5（含补 v3） | v5 |
| 3 | 4,5 | v5 |
| 4 | 5 | v5 |
| 5 | 重复迁移 | 幂等，v5 |
| >5 | 拒绝 | `SCHEMA_TOO_NEW`，只读降级，禁止降级 |

### 9.3 中断与校验规则

- 每个版本一个 `BEGIN IMMEDIATE … COMMIT`；`user_version` 同事务更新；
- 失败 `ROLLBACK`，版本保持旧值，可重跑；
- 前：`PRAGMA quick_check` + 备份副本；后：期望表/列/索引 + `foreign_key_check` + `user_version`；
- 不接触生产 DB；只用隔离副本。

### 9.4 隔离演练结果（/tmp，已完成）

命令 `node /tmp/audit/mig-probe/probe2.mjs`（09:56，exit 0）：

```
from=0/1/2/3/4        → v5，表/列/外键全 PASS
每个起点重复迁移        → PASS
逐级中断（v2/v3/v4/v5 各注入一次）→ 版本保持旧值；重跑 → v5 PASS
future v6             → 设计为拒绝
v4 隔离副本升级        → before {v:4, actions:238, ticks:495, logs:1100}
                         after  {v:5, actions:238, ticks:495, logs:1100}  PASS
ALL PASS
```

> 这是**临时副本演练**，不是生产迁移，也不是 DSH 实机验证。

---

## 10. 故障场景

### 10.1 原 13 类（修订行）

| # | 场景 | 状态 | 恢复动作 | 自动重试 | 人工 |
|---|---|---|---|---|---|
| 1 | 执行前退出 | leased→unknown | 无 executor_started + 契约 → 判未执行 → planned | 是 | 否 |
| 2 | 执行中退出 | running→unknown | verifier | 否 | 视结论 |
| 3 | 外部完成未提交 | running→unknown | verifier=confirmed → done | 否 | 否 |
| 4 | 部分完成 | unknown | partial + compensating | 否 | 是 |
| 5 | verifier 不可用 | unknown | verification_error，退避重验 | 只重验 | 3 次后 |
| 6 | lease 重复领取 | 第二 CAS 失败 | LEASE_LOST | — | 否 |
| 7 | 双 worker 恢复 | 一把锁 + CAS | 输家 LOCK_LOST/TOKEN 失败 | — | 否 |
| 8 | Android 重复唤醒 | 无变化 | attemptId 幂等 + 同回执 | — | 否 |
| 9 | 时间变化 | — | 只影响"是否怀疑" | 否 | 否 |
| 10 | 手机重启 | leased/running→unknown | bootId 变 → 强证据回收 | 视结论 | 视结论 |
| 11 | DB 锁定 | — | BEGIN IMMEDIATE + busy 重试 | 是 | 否 |
| 12 | 网络不可用 | failed(not_sent)/unknown(sent_unconfirmed) | 分类处理 | 仅 not_sent | 否 |
| 13 | 取消与恢复并发 | cancelled 或保留 | state_version CAS | — | 副作用后可能 |

### 10.2 本轮新增 5 类

| # | 场景 | 处理 |
|---|---|---|
| 14 | 多请求连续到达 | 一文件一请求 + ledger 逐条，互不覆盖 |
| 15 | 合并请求 | 每个 ID 独立回执；leader 记 mergedFrom |
| 16 | 回执未 ack 就被新回执写入 | 新文件不覆盖；未 ack 永不清理 |
| 17 | recovery.lock 过期被接管 | token+1；旧 worker 续租/写入全部失败 |
| 18 | runtime stale 但 lease 有效 | 只读核查，不回收、不重跑 |

---

## 11. 验收矩阵（13 项 + 本轮 9 项）

| # | 验收点 | 层 | 断言 |
|---|---|---|---|
| 1–13 | v2 原 13 项 | 单元/集成 | 不变 |
| 14 | 连续请求不丢 | 集成 | 3 个请求 → 3 条 ledger + 3 个回执 |
| 15 | 合并全可追溯 | 集成 | 每个 ID 有回执；leader.mergedFrom 完整 |
| 16 | 未 ack 不清除 | 集成 | 无 ack 时 outbox 文件仍在 |
| 17 | 重启恢复未确认 | 集成 | 未 ingest/未完成/回执丢失三类均恢复 |
| 18 | 轮询兜底 | 集成 | 关 doorbell 仍能消费 |
| 19 | lock 续租失败停写 | 集成 | token 失效后 0 次状态写入 |
| 20 | lock 过期安全接管 | 集成 | 第二 worker 接管，旧 worker 写入被拒 |
| 21 | runtime stale 不越权 | 集成 | lease 有效时状态不变 |
| 22 | 回执写失败不丢 | 集成 | ENOSPC 模拟下 ledger 保持未 ack，恢复后重写 |
| 23 | 紧急唤醒不被普通下限推迟 | 集成 | allowDefer=false 时按 notBefore（系统延后需记录） |

隔离演练已覆盖：迁移矩阵、inbox/outbox 语义（3 请求 + 合并 + 重复 + 损坏 + 丢回执重写 + ack）。其余为设计/待测（§14）。

---

## 12. AUTO-R1…R7（更新）

| 编号 | 内容 | 依赖 | 验收 |
|---|---|---|---|
| R1 | 排序 + 连续失败纯函数 + 索引 | — | 11.#1–2 |
| R2 | 错误分类 + unknown 统计 | R1 | 11.#9/12 |
| R3 | verifier 框架 + verification 表 + result_binding | R2 | 11.#5/6/9 |
| R4 | lease + heartbeat + 过期→unknown | R1–R3 | 11.#2/3 |
| R5 | action attempt + fencing + 迟到拒绝 | R4 | 11.#4/7 |
| R6 | 恢复入口 + 请求持久性（inbox/outbox/ledger/ack）+ recovery.lock + nextWake | R4/R5 | 11.#1/6/7/8/10/11 + 14–23 |
| R7 | 迁移 v5 + 校验 + 中断演练 | R2/R3 | 11.#13 + §9.4 |
| R8/R9 | diary/send verifier（外部回执缺失） | R3 + Memory/channel | BLOCKED |

---

## 13. 未解决

1. **Android 联合确认**：inbox/outbox/ack 三目录与 doorbell 改动（§8.10/8.11）。
2. **`fs.watch` 目录监听**在 f2fs 与 PRoot 下的稳定性需实机验证（当前仅 Android 报告 `/root` 文件级 watch 可用）。
3. **fsync 成本**：f2fs 上每请求 2 次 fsync（文件+目录）的延迟未测。
4. **ENOSPC 行为**：Android 侧写失败的重试策略未定。
5. **清理保留期**（7/24h/30d）需负责人确认。
6. **生产 `user_version=4` 来源**仍 INCONCLUSIVE。
7. **外部回执缺失**：R8/R9 仍 BLOCKED。

---

## 14. 状态分类（GPT 要求）

### 14.1 已完成的隔离演练（/tmp，非生产）
- 迁移矩阵：from 0/1/2/3/4、重复、逐级中断重跑、v4 副本升级（数据量不变）——PASS。
- inbox/outbox：3 请求、合并、重复、损坏隔离、丢回执重写、ack 语义——PASS。
- fencing/lease：并发领取、非 owner 续租、迟到提交拒绝——PASS。

### 14.2 尚未执行的测试
- DSH 实机：kill/reboot、fs.watch 目录、fsync 延迟、ENOSPC。
- Android 侧：写请求/读回执/写 ack 的真实实现。
- 集成：双 worker 真并发、恢复锁接管、nextWake 调度。
- staging：全部 NOT RUN。

### 14.3 设计提案（未实现）
- 状态机映射层、inbox/outbox 目录协议、recovery.lock 表、runtime/lease 双资格、nextWake 契约、v5 迁移脚本。

---

## 15. 证据索引

| 证据 | 命令/位置 | 结果 |
|---|---|---|
| 基线 | `git ls-remote` / `rev-parse`（09:55） | handoff `01afc56`；v2 blob `899528d7` |
| `/root` fs | `stat -f -c %T /root`；`df -h /root` | f2fs；dm-44 223G |
| 迁移演练 | `node /tmp/audit/mig-probe/probe2.mjs` | ALL PASS（含 v4 副本 238/495/1100 不变） |
| inbox/outbox 演练 | `node /tmp/audit/mig-probe/inbox.mjs` | PASS（6 条保证） |
| fencing 演练 | `node /tmp/audit/mig-probe/fencing.mjs` | PASS |
| 代码事实 | `dsh-autonomy@6c4a475:lib/run/actions.js`、`lib/run/tick.js`、`lib/index.js` | 见 v2 §2 |

## 16. 边界声明

本轮只读设计修订：未改源码；未创建分支；未写生产 DB；未启动 scheduler/executor/staging；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`/`PROJECT.md`；未与 DSH 直接联系；未自行开始 AUTO-R1…R7。
