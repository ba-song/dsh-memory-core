# AUTONOMY-REPORT-0004 · Autonomy 自主系统负责人报告（恢复协议差异收口 v4）

> 会话：Autonomy 自主系统负责人
> 覆盖任务：`AUTO-ARCH-AUDIT-01`、`AUTONOMY-RECOVERY-SEMANTICS-DESIGN-01/02/03/04`
> 迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-22 01:35 (Asia/Shanghai) · v6（新增 §18 生产变更：关闭屏幕变化触发）
> 性质：只读设计修订。未改任何源码/DB/profile/配置；未创建实现分支；未启动 scheduler/executor/staging；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`；未修改 Android 报告

## 版本历史

| 版本 | 时间 | 变更摘要 |
|---|---|---|
| v1 | 2026-11-21 09:40 | 首次建档：基线、11 项矩阵、状态机、lease/verifier/接口、P0-a 拆分 |
| v2 | 2026-11-21 09:49 | 落实 GPT 12 项裁决：heartbeat、executor_started、fencing、错误分类、verifier 标准、取消、迁移、消费、nextWake |
| v3 | 2026-11-21 09:58 | 请求/回执持久性、recovery.lock 续租、runtime stale 与 lease 分离、nextWake、原子性、迁移补齐 |
| v4 | 2026-11-21 10:44 | 跨模块差异收口 A–H：未 ack 保留、ack 校验、nextWake reason、紧急唤醒 floor、hardlink 降级、队列背压、ledger 保留与 tombstone、merged 语义；初判 `PARTIAL` |
| v4-r2 | 2026-11-21 10:53 | 复核 Android v4（`3dd5d32`）：A–D、F–H 已书面确认；E 采用 Android 的 60s 观察窗，双方一致 → 改判 `DESIGN ALIGNED` |
| v5 | 2026-11-22 00:50 | 新增 §17 `AUTONOMY-PROFILE-READONLY-01`：设备实际 profile、22 个字段真实值、运行状态、6 条执行路径启用条件、冲突与 UNKNOWN |
| v6 | 2026-11-22 01:35 | §18 `AUTONOMY-DISABLE-SCREEN-TRIGGER-01`：生产 profile 关闭 `triggers.device.enabled`、插件重载、运行态验证；发现遗留定时器，结论 **BLOCKED**（需 DSH 进程重启） |

---

## 0. 结论（先看这一节）

**最新一轮（§17）：`AUTONOMY-PROFILE-READONLY-01` 只读核查完成，结论 `PASS`（核查）/ 风险 `MEDIUM`；协议设计结论仍为 `DESIGN ALIGNED`。**

**本轮结果：`DESIGN ALIGNED`。**

- Autonomy 侧 8 项（A–H）全部给出可执行单一口径，内部矛盾已消除；
- Android v4（`3dd5d32`）已书面确认 A–D、F–H；E 的"60s 观察窗"由 Autonomy v4-r2 采纳，**双方口径一致**；
- 无 `BLOCKED`；所有运行期项目仍是 NOT RUN，不阻塞设计定稿。

### 0.1 八项差异总表

| 项 | Android v3 口径 | Autonomy v3 口径 | GPT 裁决 | v4 统一口径 | 状态 |
|---|---|---|---|---|---|
| A 未 ack 回执 | §3.5 "未 ack 不得删除" 但 "或 7 天 TTL"；§3.12 "未 ack 7 天"（自相矛盾） | 未 ack 不自动删；7 天 TTL 前置条件苛刻 | 未 ack 不自动删除 | **不自动删除**；保留期无上限；仅人工审计清理 | ✅ Android v4 删除 7d TTL |
| B ack 校验 | `{schema,attemptId,readAt,result,receiptSha256}` | 同字段，未定义校验细节 | 字节级 SHA-256 必须相等 | 四条件全满足才算 ack；不等则保持未 ack 并记原因 | ✅ Android v4 确认字节级 |
| C nextWake reason | 枚举 `backoff|lease|budget|none` | 增加 `verifier_retry` | `verifier_retry` 合法 | 合法；`mode=recover`、`allowDefer=false`；旧版按 `fallbackReason=lease` | ✅ Android v4 接受枚举 |
| D allowDefer=false | 仍设 1min floor | 不得被普通 10min 推迟 | 普通下限不得介入；系统延迟必须记录 | 删除 1min 软件 floor；`effective=max(notBefore,now)`，系统延迟记 `DEFERRED_BY_SYSTEM+actualAt` | ✅ Android v4 删除软件 floor |
| E hardlink 降级 | link 失败→O_EXCL 直写 final，读取失败→隔离 | 允许短暂重试 | 统一安全方案，避免半文件误判 | **禁止直写 final**：link → renameat2(NOREPLACE) → 锁+rename；读取方 **60s 观察窗**后仍无效才 quarantine | ✅ 双方一致（Autonomy 采纳 60s） |
| F 队列背压 | inbox 500/80% 预警；outbox 500/BACKPRESSURE | 同 500/backpressure | 明确告警与恢复责任 | 双队列各 500、预留控制槽；80% 告警；满则拒绝新请求；不得删未 ack；修复 ack 优先于人工清理 | ✅ Android v4 确认 |
| G ledger 保留 | `recovery_requests` TTL **1h** | 30 天 + 未 ack 永久 | 统一；同 attemptId 不得因过期重执行 | 明细 30 天 + **永久 tombstone**；attemptId 永不复用；过期请求回执 expired | ✅ Android v4 不再定义 TTL |
| H merged | §3.4 排队 vs §3.7 "若必须合并"（模糊） | §8.3 排队 vs §8.2 merged（内部矛盾） | v1 默认不合并执行 | **v1 不合并执行**；仅同 intent 去重时返回 `merged`/`duplicate`；每个 ID 独立终态回执 | ✅ Android v4 确认默认排队 |

---

## 1. 基线（2026-11-21 10:41–10:50 重新核对）

| 对象 | 值 | 方式 |
|---|---|---|
| `ba-song/dsh-memory-core` `coordination/project-handoff` | `5e0159beff49e798101b11dc647030218f4fd4d6`（Memory 报告新增） | `git fetch` + `ls-remote` |
| 本报修订前 blob | `59b3b3b192c5e9f7be55b613a316372c22bcddff`（v3） | `git rev-parse` |
| Android v3 commit / blob | `a48fc33b89e9247b4cf282538d0a9ebc5c537c87` / `461a67d6e1fce877dbdeac2a3360830f66f6e594` | 原口径引用 |
| Android v4 commit / blob | `3dd5d321929b8f3e308663f48bc55292bce4de8a` / `76924c81f6b5b165e55dd797f3927408b84bfac9` | 10:43 复核，A–D/F–H 确认，E 待我确认 |
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

**对齐结果**：Android v4 §A 已删除 7 天 TTL（"未 ack 一律不自动清理"），并补"先解析→写 ack→才标记已读"顺序；双方一致。

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

**对齐结果**：Android v4 §B 已确认"一次读入字节→先 sha256→再解析"；双方一致。

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

**对齐结果**：Android v4 §C 已接受 `verifier_retry`；未知 reason 按 `lease` 同等紧急度处理并记 `UNKNOWN_REASON_FALLBACK`，不改写文件；双方一致。

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

**对齐结果**：Android v4 §D 已**删除 1min 软件 floor**，改为 `effective=max(notBefore,now)`，系统延迟必须记 `DEFERRED_BY_SYSTEM + actualAt + systemReason`；双方一致。

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
2. final 存在但解析失败 → 先重试 3×50ms；
3. 若文件 mtime 年龄 **<60s** → 视为"可能仍在写入"，本轮**不隔离**、下轮再试（Android v4 的 60s 观察窗，Autonomy 采纳）；
4. mtime 年龄 ≥60s 仍无效 → 才移入 `corrupt/<name>.corrupt-<ts>` + 事件 `WAKE_FILE_INVALID`；**保留原文件**；
4. 崩溃残留：`.tmp-*`/`.lock` >1h → 启动清理并记 `TMP_CLEANED`；final 永不预删；
5. 防覆盖：final 存在即视为已发布，读取方以 attemptId 幂等；writer 侧 EEXIST 必须换 seq，不得 rename 覆盖。

**f2fs / PRoot 适用性**：P1 link 与 P2 renameat2 在 f2fs 上"是否可用"**尚未实测（NOT RUN）**；P3 只依赖 POSIX rename（f2fs 支持、PRoot 转发），但**原子性仍未在本机实测**。若 P1–P3 全部不可用，P4 保证"不发布、不误判、不丢失"，但会退化为需要人工/后续版本修复——这是诚实的能力边界。

**对齐结果**：Android v4 §E 已采纳"禁止直写 final"与 60s 观察窗；**唯一差异（2s vs 60s）已由 Autonomy 采纳 60s 消除**。剩余仅为 f2fs/PRoot 三条发布路径未实测（NOT RUN）。

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

**对齐结果**：Android v4 §F 已确认 80% 告警、满载不删、退避（30min→2h，同 attemptId）、`BACKPRESSURE` 后 6h 只发紧急请求、连续 3 次提示 DSH；预留槽位数量在实现阶段联调，不阻塞设计。

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

**对齐结果**：Android v4 §G 已不再定义 ledger TTL，只依赖"同一 attemptId 不重复执行"契约；重试必须新 id + `RETRY_OF`，且须先收到旧 id 终态或确认 `latest` 已过；双方一致。

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

**对齐结果**：Android v4 §H 已确认"默认排队、禁止静默合并、merged 独立回执、请求数=回执数"；`intentKey` 内容 hash 口径留待与 Memory/channel 统一（不阻塞 v1，v1 默认不启用合并）。

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

1. **E 的 f2fs/PRoot 发布路径未实测**：link、`renameat2(NOREPLACE)`、锁+rename 三条路径的可用性与原子性均 NOT RUN；P4（不发布）是兜底。
2. **60s 观察窗的实际代价**：真损坏文件会延迟一轮才隔离；需 DSH 实测确认不影响唤醒时效。
3. `intentKey` 内容 hash 口径需与 Memory/channel 统一（v1 默认不启用合并，故不阻塞）。
4. 预留控制槽数量（10）与 outbox 满载时拒绝回执的写入原子性需联调。
5. `systemMinEmergency` 不再有软件 floor，但 Doze/JobScheduler 的真实延迟未实测（NOT RUN）。
6. 外部回执型 verifier（`send_qq`/`write_diary`）仍因缺 API 而 BLOCKED（不影响本轮 A–H）。
7. 生产 `user_version=4` 来源仍 INCONCLUSIVE（迁移 5 为纯增量，不依赖来源）。

## 14.1 复核补记（Android v4）

- 读取 `coordination/Android 平台负责人报告.md` @ `3dd5d32`（blob `76924c81…`）§3 A–H；
- A/B/C/D/F/G/H 与本报 v4 口径逐字段一致；
- E 唯一差异：Android 要求"final 解析失败且 mtime <60s 不隔离"，本报原为 2s；**已采纳 60s**（§6 第 3 条），差异消除；
- 因此改判 `DESIGN ALIGNED`；本轮不修改 Android 报告，仅记录对齐事实。

## 15. 结果与边界声明

**结果：`DESIGN ALIGNED`。**
- A–H 八项：Android v4（`3dd5d32`）与 Autonomy v4-r2 口径一致；E 的 60s 观察窗由 Autonomy 采纳；
- Autonomy 侧内部矛盾（未 ack 7 天、merged 排队、ledger 1h vs 30d、半文件隔离）已全部消除；
- 无 BLOCKED；剩余均为"实现/实测 NOT RUN"，不影响协议定稿。

**边界**：本轮只读设计修订；未改任何源码/DB/profile/配置；未创建实现分支；未启动 scheduler/executor/staging；未部署/重启；未改 `HANDOFF.md`/`REPORT.md`；未修改 Android 报告或替 Android 作设备权限决定；未开始 AUTO-R1…R7。

**设计通过 ≠ 代码实现；源码实现、DSH 实机、staging、生产迁移均 NOT RUN；生产数据库未修改。**


---

## 17. AUTONOMY-PROFILE-READONLY-01 · 设备配置只读核查

> 执行：Autonomy 自主系统负责人（应 DSH 任务）｜时间：2026-11-22 00:26–00:50 (+08)
> 性质：**严格只读**。未改 profile/配置/文件/DB；未执行 tick；未启动/停止任何 watcher；未调用 poll/send/write/execute；未发 QQ/抖音；未写记忆/日记；未重启任何进程；未读取/输出任何密钥、token、密码。
> 结论：**核查 `PASS`；风险等级 `MEDIUM`**（无自动外发，但有 1 条自动回复通道在线 + 2 个布尔开关即可激活真实执行器 + 通知触发空转）。

### 17.1 设备与版本（/app 只读接口，00:27）

| 项 | 值 | 证据 |
|---|---|---|
| 机型 / Android | vivo V2154A · Android 14 (SDK 34) | `/app/device` |
| 电量 / 网络 / 屏幕 | 89% 未充电 · wifi · screen on · app_foreground=true | 同上 |
| 存储 / 内存 | 101.43 GB 可用 / 222.76 GB；内存可用 2.94 GB / 11.10 GB | 同上 |
| DSHA | `0.2.1-rc.2-20261022.2100-dsh0.2.1-rc.2`，APP_CODE=190，BRIDGE_PROTOCOL=3 | `/app/version` |
| DSH | `0.2.1-rc.2` | `@deepseek-ai/dsh/package.json` |
| 运行环境 | Ubuntu 24.04.3 LTS arm64（proot），Node v24.19.0，uid=0（容器伪 root） | `/etc/os-release`、`node -v`、`id -u` |

### 17.2 实际使用的 profile

| 项 | 值 | 证据 |
|---|---|---|
| 启动方式 | `dsh web --no-open --host 127.0.0.1 --port 38105`（PID 20189） | `/proc/20189/cmdline` |
| profile 名 | **`web`**（`dsh web` ≡ `dsh --profile web`） | CLI 帮助文本；`DSHA_STARTUP_PROFILE=web` |
| DSH_HOME / profile 目录 | `/root/.dsh` / `/root/.dsh/profiles/web` | `/proc/20189/environ`、`dsh` 约定 |
| 加载时间 | 2026-11-21 09:52:55（进程 starttime） | `/proc/20189/stat` + `os.uptime()` |
| 配置层顺序 | bundles → `cordis.patch.yml` → `--patch`（无） | `cordis.yml` 注释；cmdline 无 `--patch` |
| 生效 patch | `/root/.dsh/profiles/web/cordis.patch.yml`（mtime 2026-11-21 09:39:58，**早于进程启动 13 分钟**） | `stat` |
| 其他 profile | `headless` 存在但**未加载**（无对应进程）；无第二个 profile 覆盖 | 进程扫描 |
| 覆盖情况 | 无其他 profile/overlay 覆盖；patch 覆盖 bundle 默认值（这是正常层级） | 同上 |

**结论**：当前生效配置 = `profiles/web/cordis.patch.yml`，且运行时与文件一致（关键布尔值与状态接口逐项吻合）。

### 17.3 字段实际值及来源

判定类别：`显式`=配置文件明确写；`默认`=字段缺失，取代码默认；`运行时`=状态接口/DB。

| 字段 | 实际值 | 来源 | 类别 |
|---|---|---|---|
| autonomy.enabled | **true** | patch L163；status.enabled=true | 显式 |
| autonomy.dryRun | **false** | patch L107；status.dryRun=false、reason=off | 显式 |
| autonomy.sendEnabled | **true** | patch L108；status.sendEnabled=true | 显式 |
| autonomy.tick.enabled | **false** | patch L105；status.tickEnabled=false | 显式 |
| autonomy.tick.realSafe | **false** | patch L106；真实执行器未注册 | 显式 |
| autonomy.allowedKinds | read_archive, organize_memory, find_sticker, write_diary, browse_douyin, send_qq | patch L133-139；status.allowedKinds 一致 | 显式 |
| autonomy.home.enabled | **true** | patch L156；home.lastWake/会话在跑 | 显式 |
| autonomy.home.dice.enabled | **true** | patch L147；dice.lastRoll 00:18 hit=true | 显式 |
| autonomy.homeArchiveMaintenance.enabled | **false** | 字段缺失 → `config.js:149-150` 默认 false；`index.js:498` 为挂载条件 | 默认 |
| autonomy.douyinInbox.enabled | **true** | patch L101；status.douyinInbox.enabled=true | 显式 |
| autonomy.douyinInbox.respectDryRun | **true** | 字段缺失 → `config.js:246` 默认 true（当前 dryRun=false，故不构成限制） | 默认 |
| autonomy.douyinInbox.notify.enabled | **true** | 字段缺失 → `config.js:256` 默认 true；status.douyinInbox.notify.enabled=true | 默认 + 运行时 |
| autonomy.triggers.enabled | **true** | patch L110 | 显式 |
| autonomy.triggers.device.enabled | **true** | patch L121；device-trigger.log 有 fired=514 | 显式 |
| autonomy.triggers.notification.enabled | **true** | patch L132；但 3091 不可达（见 §17.4） | 显式 |
| douyin.exposeService | **true** | patch L187；autonomy 能订阅 dyDouyin 事件 | 显式 |
| douyin.dmWatchEnabled | **true** | patch L215；source.running=true、attached=true | 显式 |
| douyin.notifyWatchEnabled | **true** | patch L190；notify.subscribed=true | 显式 |
| douyin.notifyWatchDeliver | **true** | 字段缺失 → `dsh-douyin/lib/config.js:267` 默认 true；运行时接口未直接暴露该值 | 默认 |
| channel-bridge.enabled | **true** | patch L167；`dy_bridge_status` ok=true | 显式 |
| channel-bridge.mode | **send** | patch L175；`dy_bridge_status.mode="send"` | 显式 |
| channel-bridge.groupMemory.enabled | **true** | 字段缺失 → `dsh-channel-bridge/lib/config.js:126-127` 默认 true；运行时未暴露，日志无 `groupMemory` 命中 | 默认 |

补充（与执行路径相关）：`home.minIntervalMin=40`、`maxIntervalMin=60`（L157-158）；`douyinInbox.mode=auto`（L102，运行时解析为 `subscribe`）；`douyinInbox.reply.enabled` 未配置 → 默认 **true**（`config.js:248`）。

### 17.4 当前运行状态（只读状态接口 + 只读 DB + 日志）

| 对象 | 状态 | 证据 |
|---|---|---|
| Autonomy | enabled=true，dryRun=false，stage=`offline-mock-only`，paused.all=false，6 个 kind 均未暂停 | `dy_life_status` 00:26 |
| tick | **无活动调度**；最后一条 tick 2026-11-16 01:11:28 `interval/skipped/PAUSED_KIND`；定时器因 `tick.enabled=false` 未挂 | `dy_life_status`；`index.js:530-535` |
| 真实执行器 | **0 个**：executors 列表 6 项全部 `mock:true`；真实注册需 `tick.realSafe=true`（`index.js:351-370`），当前 false | `dy_life_status.executors` |
| Home | **活动**：会话 `e755af98-…`，last_seen 2026-11-22 00:18:28，prompt 468,584 / window 1,048,576（44.7%）；lastWake 00:18:28 `AWAKENED`；dice 同刻 `hit=true`；14 个历史房间 | DB `meta`、`home_sessions`（只读） |
| Home 唤醒频率 | 近 6h21m 内 8 次 `AWAKENED`（09:57Z–16:18Z），间隔 21–139 分钟，**短于配置的 40–60 分钟** → 存在非骰子触发路径 | `autonomy.log` wake 行 |
| 聊天闸门 | 23:55:04 一次 `CHAT_ACTIVE` 跳过，`source=device`、idle 53.9s、剩余 246s | `meta.home.lastChatSkip` |
| Douyin inbox | enabled=true，started=true，attached=true，mode=`subscribe`，source.running=true、dmWatch=true、primed=true；notify.subscribed=true、primed=false、seen=11；replies.enabled=true、sent=0 | `dy_life_status.douyinInbox` |
| Douyin watcher 文件 | `dm-watch-seen.json` mtime 2026-11-20 09:01；`notify-seen.json` 2026-11-18 18:22；`notify-watch.log` 339KB（11-21 09:52）；`watch.lock` 存在 | `stat`（只读） |
| Channel Bridge | mode=send，health=OK，unified=true，outbound=tool，lastEvent 11s；历史 outSent=3125（非 Autonomy 产生） | `dy_bridge_status` |
| 通知触发 | enabled=true，但 `http://127.0.0.1:3091` **不可达**：`curl http=000 exit=7`；`notification-trigger.log` 每 5s 一条 `fetch failed`（6.5MB） | curl + 日志 tail |
| 邮件轮询 | enabled=true，60s 轮询；最近一次 `MAIL_POLL_FAILED`（socket EOF）于 2026-11-21 14:20 | `dy_life_status.mail` |
| Purpose 定时器 | 活动：最近刷新 2026-11-22 00:07（`purpose_hypotheses` 写入，seenCount 达 690） | status.purpose + DB |
| 设备触发 | 活动：device-trigger.log `fired`=514、`poll`=3418；3090 dump 可用 | 日志计数 |

> 工具权限说明：`dy_life_home_status` 与 `dy_douyin_*` 在工作会话返回 `E_PERMISSION`（仅主人/家/抖音渠道会话可用）。因此 Home/Douyin 状态改用**只读 DB + 日志 + Autonomy 状态接口**交叉取证，未调用任何写操作。

### 17.5 六条真实执行路径的启用条件

| # | 路径 | 成立条件 | 当前实际 | 判定 |
|---|---|---|---|---|
| 1 | Autonomy 自动写日记/记忆 | tick.enabled=true + tick.realSafe=true + 真实 executor + dryRun=false + 选中 write_diary；或手动 `dy_life_action_run` 带正文 | tick=false、realSafe=false、6 executor 全 mock → **自动路径不成立**；手动工具路径存在（owner/home 会话） | **不可自动发生** |
| 2 | Autonomy 自动浏览抖音 | 同上 + browse_douyin | executor mock；手动 `browse_douyin` 直接返回 `UNAVAILABLE` | **不可自动发生** |
| 3 | Autonomy 向 QQ 发送 | 同上 + send_qq（另需 evidence 门） | executor mock；手动 send_qq 返回 `UNAVAILABLE`；真实 executor 未注册 | **不可自动发生**（QQ 真实发送属于 channel-bridge 的会话内 `dy_say`，非 Autonomy） |
| 4 | 自动回复抖音私信 | douyinInbox.enabled + watcher 在跑 + reply.enabled + dryRun=false + servicesReady + 非主人私信 | **全部成立**：enabled、subscribed、replies.enabled、dryRun=false、persona/memory 可用；`dmReplyWindowMs=0`（不限时效）、`dmDailyLimit=0`（不限条数） | **在线，可自动发生**（当前 events=0） |
| 5 | 通知重复投递 | 3091 可用 + 抖音通知 watcher 同时投递同一事件 | 3091 不可达 → Autonomy 通知触发 0 投递；抖音主人通知由插件直投 home，非主人通知**委托**给 autonomy（不双投） | **当前不发生**（3091 修复后需复评） |
| 6 | Home 自动唤醒/自主调度 | enabled + home.enabled + (dice 或 triggers) | 全部成立；00:18 刚唤醒一次 | **正在发生** |

### 17.6 风险与配置冲突

**R1（中）两个布尔开关即可激活真实执行器。** `dryRun=false` 与 `sendEnabled=true` 已经满足高风险注册前提（`executors.js:32-34`），当前唯一阻断是 `tick.enabled=false` + `tick.realSafe=false`；两者同时置 true 后，`send_qq`/`write_diary`/`browse_douyin` 会立即注册真实实现。且 `antiSpam.perHour/perDay=0`、各 kind caps 为 null，只有 `sameKindMinGapMin=10`，**无全局速率上限**。

**R2（中）抖音私信自动回复通道在线且无时效/条数限制。** `dmReplyWindowMs=0` 在代码中表示"不限时效"（`dsh-douyin/lib/service.js:3684`），`dmDailyLimit=0` 表示无每日上限（`:3615`）。当前 0 事件，但一旦有新私信即会建会话并在回合结束自动回复（仅非主人）。这属于"自动对外发送"，与本项目"外发需授权/审计"原则需要负责人明确确认。

**R3（低）通知触发空转。** `triggers.notification.enabled=true`，3091 未监听 → 每 5s 失败一次，日志 6.5MB 持续增长；功能实际不可用。属"配置声称启用、运行无效"的不一致。

**R4（低）状态字段误导。** `dy_life_status.channel.supportsRealChannel=false`（adapter 写死，`lib/io/channel.js:14`），但 channel-bridge 实际 `mode=send` 且历史外发 3125 条。该字段只代表 Autonomy 内部 channel adapter，不代表全局外发能力，容易被误读。

**R5（低）schema 漂移。** 运行时 `db.schemaVersion=3`、`db.version=4`（迁移缺口已在此前报告记录）。

**R6（低）Home 在 dry-run 下仍会醒。** `home.respectDryRun=false`（patch L142）；若将来把 dryRun 打开，tick 会停但 home 唤醒不受影响。

**R7（低）夜间唤醒。** `home.dice.quietHours.enabled=false`（L152），00:18 已发生一次唤醒；`home.minIntervalMin=40` 但实测 21 分钟间隔（触发路径）。

**R8（低）日志污染。** `device-trigger.log` 18MB / 39k+ 行（`apply` 每次启动都写，`index.js:223`）；`notification-trigger.log` 6.5MB 全为失败行。不影响功能，但影响取证与磁盘。

**R9（低）邮件轮询失败。** 最近一次 `MAIL_POLL_FAILED`（socket EOF）14:20；邮件通道当前可能不可用，未自动重试风暴（60s 周期）。

**R10（信息）群记忆默认开启。** channel-bridge `groupMemory.enabled` 默认 true（无 profile 覆盖），代码会在群聊轮次后调用 `dyMemory.saveGroupTurn`；运行时未暴露该值，日志无命中，**是否已产生写入未确认**。

**配置冲突汇总**：无"同一字段被两个 profile 同时定义"；存在 3 处"配置声称启用但运行无效/误导"（R3/R4/R5）与 1 处"默认开启但未确认生效"（R10）。

### 17.7 无法确认（UNKNOWN）

| 项 | 原因 |
|---|---|
| 下一次 Home 唤醒的精确时间 | 只读状态工具在工作会话 E_PERMISSION；DB 只存 lastWake，不存 nextWakeAt |
| Home 会话可用工具清单 | 未枚举 preset/bundle 的实际 tool 集；只能确认会话为默认 preset，是否有日记/QQ 工具 UNKNOWN |
| `notifyWatchDeliver` 运行时有效值 | 状态接口未暴露；仅代码默认 true + 配置未覆盖 |
| `groupMemory.enabled` 运行时写入效果 | 状态未暴露；memory DB 未见 group 表；日志无命中 |
| 每次 wake 的具体触发源 | 日志只记 `wake AWAKENED`，不记 dice/device/notification 归因 |
| `homeArchiveMaintenance` 定时器确实未挂 | 由 config=false + 代码 gate 推断，无直接状态字段 |
| GUI 设置是否曾覆盖 volatile 字段 | 未找到独立 settings 存储；关键值与文件一致，但不能排除历史写入 |
| 抖音 `exposeService` 运行时值 | 由"autonomy 能订阅"反推 true，服务未暴露自身配置 |

### 17.8 边界声明

本任务**没有改变任何状态**：未写 profile/配置/文件/DB；未启动/停止任何 watcher 或 timer；未执行 tick；未调用 poll/send/write/execute/launch/tap；未发送 QQ/抖音/邮件；未写记忆/日记/档案；未重启 DSHA/DSH/插件；未输出任何密钥、token、密码、邮箱或私人正文（owner QQ/邮箱仅以数量/脱敏形式出现）。

证据均为 2026-11-22 00:26–00:50 实时读取；命令退出码：`curl /app/version` 200、`/app/device` 200、`curl 3091` exit 7、`dy_life_status` ok=true、`dy_bridge_status` ok=true、DB 只读查询成功。


---

## 18. AUTONOMY-DISABLE-SCREEN-TRIGGER-01 · 生产变更记录

> 执行：Autonomy 自主系统负责人（应 DSH 设备任务）｜时间：2026-11-22 01:12–01:35 (+08)
> 授权：项目负责人明确授权"只关闭屏幕变化触发"；未授权删除代码、扩大范围、重启 DSHA/设备
> 结论：**BLOCKED**（配置已改并已加载；但一个**遗留定时器**仍在轮询，插件重载无法清除，需要 DSH 进程重启）

### 18.1 基线与路径

| 项 | 值 |
|---|---|
| 设备 | vivo V2154A · Android 14 (SDK 34) · DSHA `0.2.1-rc.2` |
| 生产 profile | `web`（`dsh web` ≡ `--profile web`；`DSHA_STARTUP_PROFILE=web`） |
| 配置文件 | `/root/.dsh/profiles/web/cordis.patch.yml` |
| DSH 进程 | PID 20189，启动 2026-11-21 09:52:55，**变更期间未重启** |
| 变更前 mtime / sha256 | 2026-11-21 09:39:58 / `8de618086d1618a5fe8fc48415e3ae8c4a5e2cdc27a4a94b60bd0490032fcb0d` |
| 变更后 mtime / sha256 | 2026-11-22 01:29:35 / `e5a0290495b84618e75a04beaeb0e3366a67341ddfdf296ca5ecc5fe6d51decc` |

### 18.2 修改内容

```yaml
# id: autonomy · config.triggers.device（原第 114–121 行）
         excludeApps:
           - dsh.android.client
-        enabled: true
+        enabled: false
       notification:            # 未改，仍 enabled: true
```

- 仅一行变更；`triggers.enabled`（true）、`triggers.notification`（true）、`files`（[]）均未改。
- 备份：`/root/.dsh/profiles/web/cordis.patch.yml.bak-screen-trigger-20261122-011500`（sha256 同变更前）。
- 变更后完整 diff：**只有 `device.enabled: true → false` 一行**（插件管理器临时写入的 `disabled: false` 已在 01:29:35 移除，不移除不影响语义）。

### 18.3 重载过程（未重启 DSH）

1. 01:15:05 写文件后，等待 HMR 自动重载；`dy_life_status` 仍报 `device.enabled=true` → HMR 未使插件重启。
2. 原因（源码证据）：`triggers.device.enabled` 在 Config schema 标记 `.volatile()`，cordis 对"仅 volatile 字段变化"走 `updateVolatile` 不重启 fiber；而 `loadConfig` 在 `lib/config.js:321` 用 `bool(raw...)` **快照**该值，运行中不会随 volatile 引用变化。→ 必须重启插件实例。
3. 01:21:5x / 01:22:09、01:26:39 / 01:28:49 两次通过插件管理器把 `dsh-autonomy` 组件 **Off → On**（等价"重载插件"），未重启 DSH 进程、未重启 App/设备。
4. 重载后 `apply` 日志（`device-trigger.log`）：
   `2026-11-21T17:28:49.485Z {"ev":"apply",...,"device":{"enabled":false,...},"notification":{"enabled":true,...}}`
5. 组件 Off 期间 `dy_life_status` 不可用（`unknown tool`），证明插件实例确实停止；On 后恢复。

### 18.4 运行态验证

| 项 | 结果 | 证据 |
|---|---|---|
| `triggers.device.enabled` | **false** | `dy_life_status` 01:30:55；apply 日志 17:28:49Z |
| `triggers.enabled` | true（未改） | 同上 |
| `triggers.notification` | **true、endpoint 3091、interval 5s**（未改） | 同上；`notification-trigger.log` 仍在 5s 周期写 `fetch failed`（既有故障，未处理） |
| `home.enabled` / `home.dice.enabled` | true / true（未改） | status；`config.js` 启动路径 `startHomeLoop()` 仅在 `cfg.enabled && home.enabled` 时挂表 |
| `douyinInbox` | enabled/started/subscribed（未改） | status.douyinInbox |
| `tick.enabled` / `realSafe` | false / false（未改）；6 executor 仍全 mock | status |
| 其他触发（purpose/mail/file） | purpose 定时器活动（01:29 刷新）、mail 60s 轮询、files=[] | status.purpose/mail |
| DSH 进程 | PID 20189 未变 | `/root/.dsha-web.pid` |
| 变更后异常日志 | autonomy.log 17:22–17:30 无 error/warn；仅正常 mail_poll | 日志 |

### 18.5 异常：遗留定时器仍在轮询（BLOCKED 原因）

**事实**：`device-trigger.log` 在插件重载后仍每 60s 出现 `poll`：

```
17:23:05, 17:25:05, 17:26:05, 17:27:05, 17:28:05, 17:29:05, 17:30:05 (Z)
```

**判定为"非当前实例"的遗留定时器**：
- 01:26:39 组件 **Off**（`dy_life_status` 不可用），但 01:27:05、01:28:05 仍有 `poll`；
- 该日志文件只有 `dsh-autonomy/lib/run/device-triggers.js` 会写（全仓 grep 仅此一处）；
- 当前实例 `cfg.triggers.device.enabled=false`，`index.js:211` 的条件不会创建新触发器；
- ⇒ 定时器属于更早的插件实例（进程内遗留），`ctx.on('dispose')` 未能清掉，插件 disable/enable 也无法触达。

**影响**：
1. 屏幕变化触发仍会每 60s 轮询 `/app/ui/dump`，不符合验收"不再持续轮询"；
2. 该遗留实例的 `onTrigger` 仍可能在屏幕变化且距上次 fire ≥30min 时调用旧 `home.awake`，即**仍可能唤醒 Home**（上次 `fired` 为 01:14:05，下一次窗口 01:44 之后）；
3. 配置本身已正确，DSH 进程重启后新实例不会创建触发器，遗留定时器也会随进程消失。

**根因（待代码修复，本轮不改代码）**：疑似 `loadConfig` 对 volatile 字段做快照 + 重载路径未保证旧 fiber 的定时器全部 dispose；需要单独缺陷单与回归测试。

### 18.6 结论与所需动作

**结果：`BLOCKED`。**

- 已完成：配置修改、备份、插件重载、运行态 `device.enabled=false`、其他触发未改、无代码/DB/外发/重启；
- 未完成：停止遗留定时器轮询。**唯一安全方式 = 重启 DSH web 进程**（不是 DSHA App、不是设备）。本任务未授权重启 DSH，故停在门禁。
- 建议：负责人在维护窗口授权一次 DSH web 进程重启（App 的 HarnessService 会自动拉起）；重启后验证 `device-trigger.log` 不再新增 `poll`，并确认 Home 定时唤醒/骰子/通知触发仍在。
- 备选（不推荐）：保留现状，等下一次自然重启生效；期间遗留定时器可能继续轮询/唤醒。

### 18.7 边界声明

未删除/修改任何代码；未改 DB/记忆/日记；未改 Douyin/douyinInbox/Memory/Persona/EI/Channel Bridge/Tick；未修复通知触发；未执行真实外发；未重启 DSH/DSHA/设备；未改 `HANDOFF.md`/`REPORT.md`。
