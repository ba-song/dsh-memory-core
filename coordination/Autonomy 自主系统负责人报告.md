# AUTONOMY-REPORT-0004 · Autonomy 自主系统负责人报告（恢复协议差异收口 v4）

> 会话：Autonomy 自主系统负责人
> 覆盖任务：`AUTO-ARCH-AUDIT-01`、`AUTONOMY-RECOVERY-SEMANTICS-DESIGN-01/02/03/04`
> 迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 10:44 (Asia/Shanghai) · v4
> 性质：只读设计修订。未改任何源码/DB/profile/配置；未创建实现分支；未启动 scheduler/executor/staging；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`；未修改 Android 报告

## 版本历史

| 版本 | 时间 | 变更摘要 |
|---|---|---|
| v1 | 2026-11-21 09:40 | 首次建档：基线、11 项矩阵、状态机、lease/verifier/接口、P0-a 拆分 |
| v2 | 2026-11-21 09:49 | 落实 GPT 12 项裁决：heartbeat、executor_started、fencing、错误分类、verifier 标准、取消、迁移、消费、nextWake |
| v3 | 2026-11-21 09:58 | 请求/回执持久性、recovery.lock 续租、runtime stale 与 lease 分离、nextWake、原子性、迁移补齐 |
| v4 | 2026-11-21 10:44 | 跨模块差异收口 A–H：未 ack 保留、ack 校验、nextWake reason、紧急唤醒 floor、hardlink 降级、队列背压、ledger 保留与 tombstone、merged 语义；给出 `PARTIAL` 结论与 4 项 Android 待确认 |

---

## 0. 结论（先看这一节）

**本轮结果：`PARTIAL`。**

- Autonomy 侧 8 项（A–H）全部给出可执行的单一口径，内部矛盾已消除；
- 其中 **4 项需要 Android v4 书面确认**（未 ack 不删、`verifier_retry`、紧急 floor、hardlink 降级协议），确认后即为 `DESIGN ALIGNED`；
- 无 `BLOCKED` 项；无需要负责人授权的技术前提（仅代码实现阶段需要）。

### 0.1 八项差异总表

| 项 | Android v3 口径 | Autonomy v3 口径 | GPT 裁决 | v4 统一口径 | 状态 |
|---|---|---|---|---|---|
| A 未 ack 回执 | §3.5 "未 ack 不得删除" 但 "或 7 天 TTL"；§3.12 "未 ack 7 天"（自相矛盾） | 未 ack 不自动删；7 天 TTL 前置条件苛刻 | 未 ack 不自动删除 | **不自动删除**；保留期无上限；仅人工审计清理 | Autonomy 已收口；Android 需删 TTL |
| B ack 校验 | `{schema,attemptId,readAt,result,receiptSha256}` | 同字段，未定义校验细节 | 字节级 SHA-256 必须相等 | 四条件全满足才算 ack；不等则保持未 ack 并记原因 | Autonomy 已收口；Android 需按字节写入 |
| C nextWake reason | 枚举 `backoff|lease|budget|none` | 增加 `verifier_retry` | `verifier_retry` 合法 | 合法；`mode=recover`、`allowDefer=false`；带 `fallbackReason=lease` 兼容旧版 | Autonomy 已收口；Android 需接受 |
| D allowDefer=false | 仍设 1min floor | 不得被普通 10min 推迟 | 普通下限不得介入；系统延迟必须记录 | 无普通 floor；紧急 floor 仅为系统能力下限（≤1min）且必须记 `DEFERRED_BY_SYSTEM+actualAt` | 需 Android 明确 1min 是系统下限 |
| E hardlink 降级 | link 失败→O_EXCL 直写 final，读取失败→隔离 | 允许短暂重试 | 统一安全方案，避免半文件误判 | **禁止直写 final**：link → renameat2(NOREPLACE) → 锁+rename；读取方 2s 重试窗后才 quarantine | 需 Android 采纳 |
| F 队列背压 | inbox 500/80% 预警；outbox 500/BACKPRESSURE | 同 500/backpressure | 明确告警与恢复责任 | 双队列各 500、预留 10 控制槽；80% 告警；满则拒绝新请求；不得删未 ack；修复 ack 优先于人工清理 | Autonomy 已收口 |
| G ledger 保留 | `recovery_requests` TTL **1h** | 30 天 + 未 ack 永久 | 统一；同 attemptId 不得因过期重执行 | 明细 30 天 + **永久 tombstone**；attemptId 永不复用；过期请求回执 expired | Autonomy 已收口；Android 需删除 1h 假设 |
| H merged | §3.4 排队 vs §3.7 "若必须合并"（模糊） | §8.3 排队 vs §8.2 merged（内部矛盾） | v1 默认不合并执行 | **v1 不合并执行**；仅同 intent 去重时返回 `merged`/`duplicate`；每个 ID 独立终态回执 | Autonomy 已收口 |

---

## 1. 基线（2026-11-21 10:41–10:50 重新核对）

| 对象 | 值 | 方式 |
|---|---|---|
| `ba-song/dsh-memory-core` `coordination/project-handoff` | `5e0159beff49e798101b11dc647030218f4fd4d6`（Memory 报告新增） | `git fetch` + `ls-remote` |
| 本报修订前 blob | `59b3b3b192c5e9f7be55b613a316372c22bcddff`（v3） | `git rev-parse` |
| Android v3 commit / blob | `a48fc33b89e9247b4cf282538d0a9ebc5c537c87` / `461a67d6e1fce877dbdeac2a3360830f66f6e594` | 同上（本轮未改） |
| `HANDOFF.md` / `REPORT.md` | `f8ffa40d…` / `e219f707…` | 未改 |
| `ba-song/dsh-autonomy` main | `6c4a4753b4737060211955b1f022cab2f1d39521` | 双向核对，无新提交 |
| `/root` 文件系统 | f2fs（`/dev/block/dm-44`） | `stat -f` |

---

## 2. A · 未 ack 回执的保留策略

**Android v3 原口径**：§3.5 "未 ack 的回执不得删除" 与 "Autonomy 见到 ack（或 7 天 TTL）才清理 outbox" 并存；§3.12 又写 "未 ack 回执 7 天"——**同一份文档内自相矛盾**。

**Autonomy v3 原口径**：未 ack 不自动删；7 天 TTL 只能在"完整复制进 ledger + 记审计事件"后执行。

**GPT 裁决**：未 ack outbox 不自动删除；不得因未收到 ack 静默丢失回执。

**v4 统一口径**：

1. **正常自动路径只有一条**：`ack` 通过校验 → 10 分钟后删除 outbox 文件（先写 `OUTBOX_ACKED_CLEANED` 事件）。**不存在 TTL 自动删除路径。**
2. 保留期：未 ack 回执**无上限保留**；ledger 明细 30 天，但 tombstone 永久（§G）。
3. 500 条上限与告警：
   - ≥400（80%）→ 每次恢复写 `OUTBOX_HIGH {count}`，并出现在回执 `queue.outboxHigh=true`；Android/HUD 展示黄条；
   - =500 → 停止**新恢复**，回执 `rejected/BACKPRESSURE`（占用预留控制槽，见 §F）；已有请求继续处理；**不删除任何未 ack 回执**。
4. 防永久堵塞（三层，按优先级）：
   - **第一层 ack 修复**：每次恢复与 60s 维护循环执行 `ACK_REPAIR`——对 `finished` 且 10 分钟未 ack 的 attempt，用**完全相同字节**重写 outbox 文件（sha 不变），触发 Android §3.7 #9 的"补读未 ack"路径；记录 `ACK_REPAIR_REWRITTEN`。多数未 ack 由此自愈。
   - **第二层背压降级**：outbox 满时仅停"新恢复"，健康检查、ack 校验、清理、修复继续运行；恢复完成后回执 `backpressure=true`，Android 侧退避并延迟新唤醒（不丢请求）。
   - **第三层人工清理**（最后手段，非自动）：见下。
5. **人工清理流程**（owner-only，需 HUD/工具显式操作）：
   1. 查 `outbox/<id>.json` 与 `ack/`，确认缺失原因（`ACK_WRITE_FAILED` / `RECEIPT_INVALID` / 设备丢失）；
   2. 先执行一次 `ACK_REPAIR` 并等待至少一次唤醒；仍无 ack 才进入下一步；
   3. 操作员输入 `reason`、`operatorId`，系统校验 outbox 文件的 `sha256` 与 ledger 记录一致；
   4. 把回执原文（≤64KB）写入 ledger `report_json`（若尚未写入）；
   5. 删除 outbox 文件，写不可歧义审计：`OUTBOX_PURGED_BY_OPERATOR {attemptId, sha256, operatorId, reason, purgedAt, priorAckState:'never'}` 到 `action_log` 与 `dsha-autonomy-events.jsonl`；
   6. tombstone 置 `purged_by_operator`，保留 attemptId 与 sha。
6. **禁止**：用 TTL、磁盘清理脚本、`find -delete`、inbox 清理顺带删除 outbox；任何删除未 ack 回执且无上述审计的行为视为数据丢失缺陷。

**仍未解决**：Android v3 的 7 天 TTL 必须由 Android v4 删除；否则以 Autonomy 侧"不读不删"为准，但 Android 可能先删（需联合确认）。

**章节**：§2、§5、§7。**验收**：T-A1 无 ack 时 30 天不删；T-A2 400 条出 `OUTBOX_HIGH`；T-A3 500 条时新恢复得 `BACKPRESSURE` 且旧回执仍在；T-A4 `ACK_REPAIR` 重写字节 sha 不变；T-A5 人工清理产生完整审计 6 字段。

---

## 3. B · ack 校验

**Android v3 原口径**：`ack/<attemptId>.json = {schema, attemptId, readAt, result, receiptSha256}`；写失败下次重试。

**Autonomy v3 原口径**：字段一致，未定义校验顺序与失败原因码。

**GPT 裁决**：`ack.receiptSha256` 必须等于 outbox 文件**原始字节**的 SHA-256；四条件全满足才可认定 ack。

**v4 统一口径**：

```
认定 ack 当且仅当：
1) attemptId 匹配：ack.attemptId == 文件名 == ledger.attempt_id
2) schema/version 合法：schema == 1
3) receiptSha256 匹配：sha256(outbox 原始字节) == ack.receiptSha256 == ledger.receipt_sha256
4) ack 完整可解析：JSON 合法、字段齐全、readAt >= outbox mtime
```

- 失败码：`ACK_ATTEMPT_MISMATCH` / `ACK_SCHEMA_INVALID` / `ACK_SHA_MISMATCH` / `ACK_INVALID` / `ACK_STALE`；
- 失败处理：**保持未 ack**、outbox 不删、写事件（含期望 sha 与实际 sha 前 8 位），下次维护重试；
- **哈希对象是原始字节**，不是重新序列化的 JSON；Autonomy 在写回执时把 `receipt_sha256` 记入 ledger，避免二次读取差异；
- ack 文件本身也必须原子写（Android 侧 tmp+rename/link）；半写 ack 视为 `ACK_INVALID`。

**仍未解决**：Android 必须以字节级方式计算（不能 JSON 序列化后再哈希）；需在 Android v4 明确。

**章节**：§3、§7。**验收**：T-B1 篡改一个字节 → 不认 ack；T-B2 attemptId 不符 → 不认；T-B3 schema=2 → 不认；T-B4 合法 ack → 10min 后清理并留事件。

---

## 4. C · nextWake reason：`verifier_retry`

**Android v3 原口径**：枚举 `backoff|lease|budget|none`。

**Autonomy v3 原口径**：新增 `verifier_retry`，未定义兼容策略。

**GPT 裁决**：`verifier_retry` 是合法 reason；Android 不得降级成普通 budget 周期；旧版本需兼容。

**v4 统一口径**：

```json
{ "notBefore": 0, "latest": 0, "reason": "verifier_retry",
  "fallbackReason": "lease", "mode": "recover",
  "allowDefer": false, "confidence": 0.85, "at": 0 }
```

- 语义：某 action 处于 `unknown`，verifier 需在退避点重跑（1m/5m/30m/2h/6h）；
- `mode=recover`（必须走恢复入口，不是普通 check）；
- `allowDefer=false`（紧急核实，见 §D）；
- `confidence`：首次重验 0.9，连续失败递减，最低 0.5；
- **兼容**：同时输出 `fallbackReason:"lease"`；Android 旧版本不认识 `verifier_retry` 时按 `fallbackReason` 处理（lease 属紧急类，不会被降级为 budget）；Android 新版本忽略 `fallbackReason`；
- 旧版本若既不认识 reason 又无 fallback（异常情况）→ 必须按 `lease` 处理并记 `NEXT_WAKE_UNKNOWN_REASON`，**禁止**按 `budget` 处理。

**仍未解决**：Android v4 需把 `verifier_retry` 加入枚举并声明忽略 `fallbackReason`。

**章节**：§4、§6。**验收**：T-C1 reason 合法被接受；T-C2 旧解析器用 fallback=lease；T-C3 不得出现 budget 降级；T-C4 mode=recover 且 allowDefer=false。

---

## 5. D · `allowDefer=false` 的调度下限

**Android v3 原口径**：普通周期 10min；`allowDefer=false` 仍设 **1min floor**；受 Doze/JobScheduler 限制。

**Autonomy v3 原口径**：紧急核实不得被普通 10min 下限无理由推迟。

**GPT 裁决**：不允许普通周期下限介入；notBefore 已到尽快调度；系统原因延迟必须写 `DEFERRED_BY_SYSTEM` 与实际时间；不得把系统延迟伪装成 Autonomy 主动 defer。

**v4 统一口径**：

```
effective = clamp( max(notBefore, now + systemFloor), latest, now + 24h )
systemFloor:
  allowDefer=false → systemMinEmergency（Android 声明，必须 ≤ 1min；0 也可）
  allowDefer=true  → 10min（普通周期下限）
```

- **1min 只能是"系统能力下限"，不是策略下限**：Android 必须把该值写入事件 `SCHED_POLICY {systemMinEmergency: 60000}`，并可被 Autonomy 读取（事件日志或回执能力声明）；
- `notBefore <= now` 时立即调度（在系统能力内），不得再叠加 10min；
- 任何 >systemFloor 的延迟都必须是系统原因，写 `DEFERRED_BY_SYSTEM {requestedAt, actualAt, delayMs, systemReason: doze|job|alarm|oem}`；
- **禁止**：把 `DEFERRED_BY_SYSTEM` 写成 Autonomy 的 `deferred` 回执；`deferred` 只能由 Autonomy 自己产生；
- `latest` 是硬上界：错过记 `MISSED_WINDOW`，下一次唤醒立即执行；
- 24h 仅是最大兜底，不是默认等待。

**仍未解决**：Android v4 需声明 `systemMinEmergency ≤ 1min` 且可被观测；若设备实测必须 >1min（如 Doze 深睡），需在事件里说明，不改变契约。

**章节**：§5、§6。**验收**：T-D1 allowDefer=false 时无 10min 叠加；T-D2 系统延迟产生 `DEFERRED_BY_SYSTEM` 且不产生 Autonomy `deferred`；T-D3 latest 错过 → `MISSED_WINDOW` 后立即执行。

---

## 6. E · hardlink 不可用时的降级发布

**Android v3 原口径**：link 优先；不可用时 `O_EXCL create final → write → fsync`；读取失败 → 移入 corrupt。

**Autonomy v3 原口径**：请求用 link，回执用 rename；读取失败允许 3×50ms 重试。

**GPT 裁决**：统一安全方案，避免读取方把"写入中的半文件"误判为损坏。

**问题本质**：`O_EXCL create final → 写` 会让 final 在写完成前就可见；读取方无法区分"半写"与"损坏"。

**v4 统一口径（禁止直写 final）**：

```
发布（按可用性顺序，逐级降级）：
P1  link(tmp, final)                        # 不覆盖；目标存在 → EEXIST → 换 seq
P2  renameat2(tmp, final, RENAME_NOREPLACE) # 原子且不覆盖
P3  lock(final.lock, O_EXCL) → 检查 final 不存在 → rename(tmp, final) → unlink lock
    # 仅当 P1/P2 都不可用（ENOSYS/EOPNOTSUPP/EPERM）
    # 持锁期间其他 writer 失败；崩溃遗留 lock 由启动清理（>1h）
P4  以上全部失败 → 不发布，保留 tmp + 写 .pending 标记 + 事件 `PUBLISH_UNSUPPORTED`
    读取方把 .pending 视为"未发布"，绝不解析 tmp
```

**读取方规则**：

1. 只处理匹配 `^[a-z0-9-]{1,96}\.json$` 的 final 文件；忽略 `.tmp-*`、`.part-*`、`.lock`、`.pending`；
2. final 存在但解析失败 → **不立即隔离**：在 `readRetryWindowMs=2000` 内重试 4×500ms；
3. 重试窗后仍失败 → 移入 `corrupt/<name>.corrupt-<ts>` + 事件 `WAKE_FILE_INVALID`；**保留原文件**；
4. 崩溃残留：`.tmp-*`/`.lock` >1h → 启动清理并记 `TMP_CLEANED`；final 永不预删；
5. 防覆盖：final 存在即视为已发布，读取方以 attemptId 幂等；writer 侧 EEXIST 必须换 seq，不得 rename 覆盖。

**f2fs / PRoot 适用性**：P1 link 与 P2 renameat2 在 f2fs 上"是否可用"**尚未实测（NOT RUN）**；P3 只依赖 POSIX rename（f2fs 支持、PRoot 转发），但**原子性仍未在本机实测**。若 P1–P3 全部不可用，P4 保证"不发布、不误判、不丢失"，但会退化为需要人工/后续版本修复——这是诚实的能力边界。

**仍未解决**：Android 需采纳"禁止直写 final"；DSH 需实测 link/renameat2/P3 三条路径（NOT RUN）。

**章节**：§6、§9。**验收**：T-E1 模拟 link 失败 → 走 P2/P3，final 始终完整；T-E2 读取方在 2s 窗口内不隔离；T-E3 崩溃残留 lock/tmp 被清理且 final 不动；T-E4 P4 时请求不丢失、不误判。

---

## 7. F · INBOX_FULL / BACKPRESSURE

**Android v3 原口径**：inbox 500、80% `INBOX_HIGH`、满则 `INBOX_FULL` 不删未 ack；outbox 500、满则 `BACKPRESSURE`。

**Autonomy v3 原口径**：同上限，未明确责任与恢复。

**GPT 裁决**：明确预警、拒绝、退避、保护旧回执、责任归属；不得删未 ack 腾空间。

**v4 统一口径**：

| 项 | 规则 |
|---|---|
| 容量 | inbox 500（其中 10 个预留控制槽）；outbox 500（10 个预留控制槽，用于 `BACKPRESSURE/rejected` 回执） |
| 80% | 双方各写 `INBOX_HIGH` / `OUTBOX_HIGH`；回执 `queue` 字段带计数；HUD 黄条 |
| 满 | inbox：Android 拒绝新请求 `INBOX_FULL`，退避 1/2/4/8/16/32/60min（日封顶 48 次）；outbox：Autonomy 停新恢复，回执 `BACKPRESSURE` |
| 禁止 | 删除未 ack 条目、把旧回执移到 `/sdcard`、用"清理"腾空间 |
| 告警责任 | inbox：Android 主责（写 `dsha-android-events.jsonl`）；outbox：Autonomy 主责（写 `dsha-autonomy-events.jsonl` + 回执） |
| 恢复责任 | 先 `ACK_REPAIR`（§A 第一层）→ 再 ack 校验 → 再清理；人工清理仅最后手段（§A 第三层） |
| 观测 | 回执 `queue: {inbox, outbox, ackPending, inboxHigh, outboxHigh}`；Android 不解释语义，只展示 |

**仍未解决**：预留控制槽数量（10）需与 Android 对齐；inbox 由 Android 清理、outbox 由 Autonomy 清理的归属不变。

**章节**：§7、§8。**验收**：T-F1 80% 出告警；T-F2 满时拒绝新请求且旧条目仍在；T-F3 `ACK_REPAIR` 后可继续处理；T-F4 任何路径都不删未 ack。

---

## 8. G · `recovery_requests` 保留时间与 attemptId 幂等

**Android v3 原口径**：§3.7 #5 `recovery_requests(attempt_id PK)` **TTL 1h**，命中返回缓存回执。

**Autonomy v3 原口径**：§8.4 30 天；未 ack 永久。

**GPT 裁决**：统一；同 attemptId 不得因记录过期而重新执行。

**v4 统一口径**：

| 对象 | 保留 | 说明 |
|---|---|---|
| ledger 明细 `recovery_requests` | **30 天** | 含 report_json、merged 关系、ack 状态 |
| **tombstone** `attempt_tombstones` | **永久**（极小行） | `attempt_id PK, first_seen_at, finished_at, final_state, receipt_sha256, purged_by, purged_at` |
| 幂等判定 | attemptId 永不重用 | 新请求命中 tombstone → 直接返回终态（`duplicate=true`），不执行；若 receipt 已删则回执 `duplicate/EXPIRED_TOMBSTONE` |
| 过期请求 | `requestedAt + 10min < now` 或 `now > deadline` | 回执 `expired/REQUEST_EXPIRED`，不恢复；仍写 tombstone |
| 清理顺序 | 先写 tombstone，再删明细 | 中断也不会出现"明细没了、tombstone 没写" |

- Android 的 1h TTL 只是"热缓存"口径，**不能作为幂等依据**；跨 1h 后的重复 attemptId 必须由 Autonomy tombstone 拦截；
- tombstone 行大小 <200B，按 10 万条估算 <20MB，可长期保留；
- tombstone 清理只在负责人明确授权下进行（当前不设计自动清理）。

**仍未解决**：Android 需删除"1h 后即可重发同 attemptId"的假设；重发必须使用新 attemptId（`seq+1`）。

**章节**：§8、§11。**验收**：T-G1 31 天后同 attemptId 不执行；T-G2 明细删后仍返回终态；T-G3 中断在"写 tombstone 前"可重跑且不重复执行；T-G4 过期请求回执 expired。

---

## 9. H · merged 语义

**矛盾核对**：
- Autonomy v3 §8.3 写"不合并执行；进 queued 队列逐条处理"；§8.2 又定义 leader/`mergedFrom`/`mergedInto` → **内部矛盾**。
- Android v3 §3.4 "一次一个 inflight" 与 §3.7 #7 "不合并执行…若必须合并（同 kind 且当前 inflight）" → **模糊**。

**GPT 裁决**：v1 默认不合并不同 attemptId 的实际执行，只允许显式去重/合并策略；所有 attemptId 仍须有独立终态回执。

**v4 统一口径**：

1. **v1 不合并执行**：所有不同 attemptId 一律排队，按 `requestedAt` 升序逐条处理，一次一个。
2. `merged` 只允许一种情形：**同一 intent 的去重**——新请求的 `intentKey`（kind+target+content hash）与当前 inflight 的 leader 相同，且在去重窗口（默认 10min）内。此时新请求不执行，回执 `merged` + `mergedInto=leader`；leader 回执 `mergedFrom[]`（≤5）。
3. leader 已结束但仍在去重窗口内 → 回执 `duplicate` + `duplicateOf=leader` + 复制 leader.result；不执行。
4. 超出窗口 / intent 不同 → **独立执行**（新 attemptId），不得 merged。
5. 每个 attemptId 必须有且仅有一个终态回执（`done|rejected|expired|failed|merged|duplicate`），不存在"被合并后没有回执"的 ID。
6. `mergedFrom` 超过 5 个时，多余请求回执 `duplicate`（不再进入 leader 列表）。

**仍未解决**：`intentKey` 的规范（kind+target+content hash）需与 Memory/channel 统一内容 hash 口径；v1 可先只对 `send_qq`/`write_diary` 启用去重，其余不启用。

**章节**：§9、§11。**验收**：T-H1 不同 intent 不 merged 且各自执行；T-H2 同 intent 10min 内 merged 且两 ID 都有回执；T-H3 leader 结束后 duplicate；T-H4 超窗独立执行；T-H5 每个 ID 终态唯一。

---

## 10. 已冻结基线（v2/v3 摘要，不再改动）

- 状态：`planned/leased/running/done/failed/aborted` + `unknown/cancelled`；`done→succeeded` 映射层；
- lease：`heartbeat=clamp(lease/3,15s,60s)`、`ttl=3×heartbeat`、同一条 UPDATE 写 heartbeat+lease、CAS；
- executor：`TX1 领取+fencing → TX2 executor_started → 执行 → 结果 CAS`；
- recovery.lock：owner/token/20s/60s、CAS 续租、失败停写、token+1 接管、状态写入带锁 token 谓词；
- 双资格：runtime stale 只给扫描资格；回收需 lease 到期/bootId 变更/进程确认退出；
- 错误分类：`not_sent / sent_unconfirmed(unknown) / rejected / internal / verification`；unknown 不计失败率/熔断；
- verifier：四条成功标准；`read_only` 用 `result_binding`；
- 取消：副作用后只置 `cancel_requested`，按真实结果落状态并标 `cancel_after_effect`；
- 迁移：v1..v5 版本链、逐级/重复/中断/拒绝降级。

---

## 11. 队列、回执与保留（v4 汇总表）

| 对象 | 写入方 | 清理方 | 保留 | 备注 |
|---|---|---|---|---|
| inbox/<id>.json | Android | Android | ack 后 24h；过期 7d（记事件） | 满 500 → `INBOX_FULL` |
| outbox/<id>.json | Autonomy | Autonomy | ack 后 10min；**未 ack 永久** | 满 500 → `BACKPRESSURE` |
| ack/<id>.json | Android | Android | 24h | 字节级 sha 校验 |
| corrupt/ | Autonomy | Autonomy | 30d | 不丢原件 |
| recovery_requests | Autonomy | Autonomy | 30d | 明细 |
| attempt_tombstones | Autonomy | 不自动清理 | 永久 | 幂等根 |

---

## 12. 演练与证据（保留 v3 结果，标明性质）

**已完成的隔离演练（/tmp 临时库/文件，非实机）**：
- 迁移 `probe2.mjs`（09:56，exit 0）：from 0/1/2/3/4、重复、逐级中断重跑、v4 副本（238 actions/495 ticks/1100 logs 不变）全 PASS；
- inbox/outbox `inbox.mjs`：3 请求、合并/重复/损坏/丢回执重写/单 ack 全 PASS；
- fencing `fencing.mjs`：并发领取、非 owner 续租、迟到提交拒绝 PASS。

**NOT RUN**：DSH kill/reboot、`fs.watch` 目录长稳、`fsync` 延迟、ENOSPC、link/renameat2 在 f2fs 的可用性、Android 侧真实实现、双 worker 真并发、staging、生产迁移。

---

## 13. 验收测试汇总（本轮新增）

| ID | 断言 |
|---|---|
| T-A1–A5 | 未 ack 不删/告警/背压/修复/人工审计 |
| T-B1–B4 | ack 四条件与失败码 |
| T-C1–C4 | `verifier_retry` 合法与兼容 |
| T-D1–D3 | 紧急 floor 与系统延迟记录 |
| T-E1–E4 | 降级发布不产生半文件误判 |
| T-F1–F4 | 队列背压不丢数据 |
| T-G1–G4 | tombstone 幂等 |
| T-H1–H5 | merged/duplicate/排队边界 |

---

## 14. 仍未解决的问题（按优先级）

1. **Android v4 需确认 4 项**：未 ack 不删（删 7d TTL）、`verifier_retry`（删旧枚举假设）、紧急 floor 属系统下限、hardlink 降级（禁止直写 final）。
2. Android 需删除 `recovery_requests` 1h TTL 作为幂等依据的假设（改 tombstone）。
3. `intentKey` 内容 hash 口径需与 Memory/channel 统一（v1 可仅对两类外发启用）。
4. f2fs 上 link/renameat2/P3 锁+rename 三条路径未实测（NOT RUN）。
5. 预留控制槽数量（10）与 outbox 满时回执写入的原子性需联调。
6. `systemMinEmergency` 的设备实测值（Doze 深睡可能 >1min）。
7. 外部回执型 verifier（`send_qq`/`write_diary`）仍因缺 API 而 BLOCKED（不影响本轮 A–H）。

---

## 15. 结果与边界声明

**结果：`PARTIAL`。**
- Autonomy 侧 A–H 全部收口，内部矛盾（未 ack 7 天、merged 排队、ledger 1h vs 30d、半文件隔离）已消除；
- 剩余 4 项为 Android v4 书面确认，不涉及 Autonomy 再设计；
- 无 BLOCKED 项。

**边界**：本轮只读设计修订；未改任何源码/DB/profile/配置；未创建实现分支；未启动 scheduler/executor/staging；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`；未修改 Android 报告或替 Android 作设备权限决定；未开始 AUTO-R1…R7。

**设计通过 ≠ 代码实现；源码实现、DSH 实机、staging、生产迁移均 NOT RUN；生产数据库未修改。**
