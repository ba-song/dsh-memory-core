# EI-REPORT-0003 · EI-1 修复分支最终隔离验收

> 会话：EI 情绪智能负责人（Persona 情绪/EI 领域专业智能体）
> 任务：EI-1 修复分支最终只读隔离验收
> 生成时间：2026-11-21 11:00 (Asia/Shanghai)
> 性质：只读/隔离验收；本报告不代表生产授权，不代表 EI-2 已批准或开始。

## 版本历史

| 版本 | 时间 | 内容 |
|---|---|---|
| EI-REPORT-0002 | 2026-11-21 10:45 | `b1cac0f` 验收：定向 20/21、全量 323/324，`sourceIds` 缺 `episode_id` |
| EI-REPORT-0003 | 2026-11-21 11:00 | `3a1376` 最终验收：定向 21/21、全量 324/324，代码隔离验收 PASS；EI-2 文档 PARTIAL |

---

## 0. 阅读导航

1. 基线
2. 执行命令与测试
3. EI-1 验收结果
4. 关键修复确认
5. EI-2 文档一致性核查
6. 结论汇总
7. 未决项与下一步
8. 边界声明
9. 证据索引

---

## 1. 基线

| 项 | 值 |
|---|---|
| 仓库 | `ba-song/dsh-persona-core` |
| 分支 | `fix/ei1-source-ref-experiencer-contract` |
| **实际 HEAD** | **`3a1376184491d94b02d4c3ad4990a957e85acb48`** |
| HEAD 时间/标题 | 2026-11-21 10:51:04 +0800 `docs(ei): specify episode revision and appraisal uniqueness` |
| 关键提交 | `b1cac0f`（上一轮仍失败）；`b8d598e`（补 `episode_id`）；`0030a88`（文档一致性）；`3a1376`（episode_revision/唯一约束） |
| 基线 main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`（未变） |
| 隔离 worktree | `/tmp/ei1-3a1376`，detached，`git status --short` 为空 |
| Node / npm | v24.19.0 / 11.17.0（满足 Persona `>=22`；未安装/升级依赖） |

### 文件 blob 核对（与 GPT 提供表一致）

| 文件 | 实测 blob |
|---|---|
| `lib/emotion-compose.js` | `cf033ec8400ea38e717481a46a5bfe834276a4a5` |
| `tests/emotion-compose.test.mjs` | `eb17cb0f2c67450a145f38d1a582bef6d90b07c8` |
| `EI-2-PERSISTENCE-DESIGN-01.md` | `761da05c5a04d3d3d894d09950b1f6f2a5783777` |

### 共享状态文件

- HANDOFF：`coordination/project-handoff` @ `6f1a3a9`，blob `f8ffa40d4c27c04d23ff74b123bf2b7044821976`（仍无 3a1376 记录）
- REPORT：同分支，blob `e219f707cc4363c53704fbe389f786148142326e`（仍只有 REPORT-0013/0014）
- 本轮只更新本会话报告，不改 HANDOFF/REPORT/PROJECT.md。

---

## 2. 执行命令与测试

| 命令 | 结果 | 退出码 | 日志 |
|---|---|---|---|
| `node --version` | `v24.19.0` | 0 | — |
| `npm --version` | `11.17.0` | 0 | — |
| `git rev-parse HEAD` | `3a1376184491d94b02d4c3ad4990a957e85acb48` | 0 | — |
| `node --test tests/emotion-compose.test.mjs` | **21 tests / 21 pass / 0 fail / 0 skip** | **0** | `/tmp/ei1-3a1376-target.log` |
| `npm test` | **324 tests / 324 pass / 0 fail / 0 skip** | **0** | `/tmp/ei1-3a1376-full.log` |
| `git status --short` | 空 | 0 | — |
| `git diff --check` | 无输出 | 0 | — |

结论：定向 21/21、全量 324/324，符合预期；工作区干净，无空白错误。

---

## 3. EI-1 验收结果

### 3.1 sourceIds / sourceRefs

| 检查 | 结果 | 状态 |
|---|---|---|
| `sourceIds` 同时保留 `id`、`episodeId`、`episode_id` | `[12,13,14,88,89,'event:5','raw:4']` | **PASS** |
| `sourceRefs` 保留全部 episode/appraisal/event/raw | 7 条：appraisal 88/89、episode 12/13/14、event 5、raw 4 | **PASS** |
| 相同数字 ID 不同类型不碰撞 | episode:7 / appraisal:7 / event:7 → 3 条 | **PASS** |
| 同类型重复引用去重 | 重复 event:5、raw:4 去重 | **PASS** |
| 多 episode 合并来源 | 合并后各 episode refs 均保留 | **PASS** |
| 旧 `sourceIds` 兼容 | 已含 `episode_id=14` | **PASS** |
| 类型白名单强校验 | EI-1 仍无强校验；设计 §3.4 已给规范 | **PARTIAL（实现层待 EI-2）** |

### 3.2 Experiencer

| 检查 | 结果 | 状态 |
|---|---|---|
| 缺失 → unknown | `unknown`，`experiencerId=''` | **PASS** |
| 显式 self/owner/third_party/unknown | 原样保留 | **PASS** |
| 裸 ID：`owner` + `123` | `owner:123` | **PASS** |
| 已带同类型前缀：`owner` + `owner:456` | `owner:456`，无双重拼接 | **PASS** |
| 冲突前缀：`owner` + `self:123` | 整条拒绝（total=0） | **PASS** |
| `unknown` + 非空 ID | 清空为 `unknown` | **PASS** |
| 旧式 `experiencer='self:1d2'` | type=self、id=1d2 | **PASS** |
| target 与 experiencer 分离 | 独立保留 | **PASS** |

### 3.3 Self 投影隔离

| 检查 | 结果 | 状态 |
|---|---|---|
| unknown-only `primaryForSelf` | `null` | **PASS** |
| owner-only / third_party-only | 不进入 `selfEmotions` | **PASS** |
| self + owner 混合 | `primary` 可为 owner；`primaryForSelf` 为 self | **PASS** |
| 只有 self 且达阈值才 `injectable` | self 且 confidenceClass=active_candidate 才 true | **PASS** |
| 通用 `primary` 不被当作 self | `primary` 与 `primaryForSelf` 分离 | **PASS** |
| legacy self 低于阈值 | 可见但 `injectable=false`，不进 `selfEmotions` | **PASS（按门槛口径）** |

### 3.4 回归

- 多情绪并存、正负并存、同 label 合并取最大衰减强度、不同 target 隔离、过期/衰减、确定性排序、displayLimit、confidence 边界、legacy：**全部通过**。
- 全量 324/324，0 fail、0 skip。
- 结论：**原有情绪组合能力回归 PASS**。

---

## 4. 关键修复确认

### D1 已修复：`sourceIds` 包含 `episode.episode_id`

- `b8d598e` 在 `lib/emotion-compose.js:122` 加入 `episode.episode_id`。
- 目标测试 `tests/emotion-compose.test.mjs:145` 通过，`sourceIds` 断言 `:149` 通过。
- `sourceRefs` 的 `addRef` 仍保留 `episode.id/episodeId/episode_id` 与 `appraisalId/appraisal_id`（`:93-94`）。
- 旧兼容字段与新类型化字段现在一致覆盖全部来源别名，且 `new Set` 去重。

### 2.1 之前失败原因已消除

上一轮 `b1cac0f` 唯一失败是 `sourceIds` 缺 `episode_id=14`；本轮 `3a1376` 已补入并复跑通过。

---

## 5. EI-2 文档一致性核查

基线：`EI-2-PERSISTENCE-DESIGN-01.md` @ `3a1376`，blob `761da05c5a04d3d3d894d09950b1f6f2a5783777`，仍为提案。

| # | 检查项 | 结果 | 状态 |
|---|---|---|---|
| 1 | `experiencer_id` 使用裸 ID | §2.1 `:29`、§12.1 `:288` 明确裸 ID；§5 示例已改为 `"id":"..."`（`:190`） | **PASS** |
| 2 | 多情绪 appraisal + appraisal_items | §3.2 `:81` 明确统一模型，取消“一情绪一条 appraisal”并行模型 | **PASS** |
| 3 | appraisal_version 唯一约束 | §3.2 `:83` 明确 `CREATE UNIQUE INDEX uq_emotion_appraisal_event_version ON emotion_appraisal(event_id, appraisal_version)`；§7 `:215` 要求 DDL 断言 | **PASS** |
| 4 | episode_revision 与 outbox idem_key | §3.3 `:97` 新增 `episode_revision`；§5 `:148` 明确 idem_key 使用该 revision | **PASS** |
| 5 | target_type=tool 保留 | §2.2 `:43` 白名单含 `tool`，明确不折叠为 object | **PASS** |
| 6 | sourceRefs 的 episode/raw/legacy 映射 | §3.4 `:110` 规范白名单含 `episode`、`raw_message`、`legacy`，并写明 `raw → raw_message`、`legacy` 仅兼容不可授权、未知 type 拒绝 | **PASS** |
| 7 | ended_at 与 expires_at 优先级 | §3.3 `:99` 明确 `ended_at` 优先，两者均存在时较早者退出投影；`ended_at <= at` 诊断不删行 | **PASS** |
| 8 | 旧数据归属只允许 shadow 分类 | §6.3 `:203` 四类迁移矩阵；§12.2.5 `:296` 明确 348 条不得批量转 self | **PASS** |
| 9 | stateFor fallback 边界 | §9.8 `:252` 明确只读投影；`stateFor('self')` 可 `legacyFallback:true`；owner/third_party/tool 不复用单行状态 | **PASS** |
| 10 | 事务、timeline、schema 探测、派生失败 | §11.1 `:262` 三连 INSERT 无事务；§11.3 `:264` timeline `session_key/self_id`；§11.6 `:267` schema 探测；§11.4 `:265` 派生失败可观察；§7 `:279` 真实 schema 断言 | **PASS（风险已记录）** |

### 5.1 仍需修的文档一致性问题

1. **头部基线过期**：`:4` 写“修复分支当前基线为 `b1cac0f`”，实际 HEAD 已是 `3a1376`；应更新为最终验收 commit 或明确“以实时 compare 为准”并去掉具体旧 commit。
2. **§1.5 状态过期**：`:19` 仍写“定向/全量测试尚未复跑，因此当前状态仍为 NOT RUN”；本轮已实测 **21/21 + 324/324**，应更新为“代码隔离验收 PASS，待 DSH/负责人复验”。
3. **§12.2.3 与 §3.4 冲突**：`:299` 仍把 source type 白名单/legacy 映射列为“尚未冻结”，但 `:110` 已给出规范白名单与映射；应删去或改成“已定稿，待 EI-2A fixture 验证”。
4. **§12.3 门禁**：`:303` 说“EI-1 修复分支必须先通过定向与全量测试，并完成 DSHA 隔离复验，方可将 EI-1 标记 PASS”；与本轮结论一致，但应补“代码隔离验收 PASS，DSHA 复验 NOT RUN”。

**设计评审结论：PARTIAL PASS——可以进入下一轮评审，但上述 3 处文档状态/冲突需修正；EI-2 仍是提案，不得进入 EI-2A 实施或冻结。**

---

## 6. 结论汇总

| 问题 | 结论 |
|---|---|
| EI-1 代码隔离验收 | **PASS（代码隔离）**：定向 21/21、全量 324/324、0 fail/skip、工作区干净、diff --check 通过 |
| 是否可标记“EI-1 PASS” | **只能标“代码隔离验收 PASS，待负责人/DSH 设备复验”**；不得标生产/集成 PASS |
| 原有情绪组合能力回归 | **PASS**：324/324 |
| Experiencer 契约 | **PASS**：缺失 unknown、裸 ID、匹配前缀、冲突拒绝、unknown 清空、旧式解析全部通过 |
| Self 投影隔离 | **PASS**：unknown-only `primaryForSelf=null`；owner/third_party 不进 selfEmotions；只有 self 且达阈值 injectable |
| sourceIds / sourceRefs | **PASS**：episode 12/13/14、appraisal 88/89、event 5、raw 4 全部保留；碰撞/去重/合并不回归 |
| EI-2 设计是否可进入下一轮评审 | **PARTIAL PASS**：10 项结构检查均覆盖；3 处文档状态/冲突需修；仍为提案 |
| EI-2A 实施 | **NOT RUN**；等待负责人明确授权 |
| DSHA 设备/运行时复验 | **NOT RUN**（本轮仅代码隔离） |

---

## 7. 未决项与下一步

1. **DSH/负责人设备复验**：本轮只证明 Node 代码隔离；生产安装未加载 EI-1，未做 DSHA 实机/运行时复验。
2. **GPT 修设计文档 3 处**：头部 b1cac0f、§1.5 NOT RUN、§12.2.3 与 §3.4 冲突；补 §12.3 的“代码隔离 PASS / DSHA NOT RUN”状态。
3. **EI-2A 门禁**：需负责人明确授权；本轮不开始 schema/migration。
4. **HANDOFF/REPORT**：仍无 3a1376 记录；由 GPT+DSH 按协议更新，不得覆盖并发。
5. **source type 强校验**：EI-1 目前仍接受任意 `x:y`；EI-2 写入层必须按 §3.4 白名单拒绝未知 type。

---

## 8. 边界声明

- 只读/隔离：独立 worktree `/tmp/ei1-3a1376`；未修改 EI-1 源码、测试、设计文档。
- 未安装/升级依赖；未合并 main；未接生产注入；未迁移生产 DB。
- 未启动 staging；未部署/重启。
- 未修改 Memory 仓库；未修改共享 HANDOFF/REPORT/PROJECT.md。
- 未触碰生产数据库。
- 未把未执行测试计为通过；Node 测试由本轮实际执行。

---

## 9. 证据索引

| 结论 | 证据 |
|---|---|
| 实际 HEAD | `git rev-parse HEAD` → `3a1376184491d94b02d4c3ad4990a957e85acb48` |
| 三个 blob | `git hash-object` → `cf033ec…` / `eb17cb0…` / `761da05…` |
| 定向测试 | `/tmp/ei1-3a1376-target.log`：21 / 21 pass / 0 fail / exit 0 |
| 全量测试 | `/tmp/ei1-3a1376-full.log`：324 / 324 pass / 0 fail / exit 0 |
| 工作区 | `git status --short` 空；`git diff --check` 空 |
| sourceIds 修复 | `lib/emotion-compose.js:122` 已含 `episode.episode_id`；测试 `:149` 通过 |
| sourceRefs 完整 | `lib/emotion-compose.js:93-94`；探针 7 条 refs 全含 |
| Experiencer | `lib/emotion-compose.js:39-70`；探针覆盖缺失/四类型/裸 ID/前缀/冲突/未知 ID/旧式 |
| Self 投影 | `lib/emotion-compose.js:187-190`；探针 unknown-only / owner-only / third-only / self+owner |
| 设计裸 ID | `EI-2-PERSISTENCE-DESIGN-01.md:29`、`:288`、`:190` |
| 设计 appraisal items/version | 同上 `:81`、`:83`；§7 `:215` |
| 设计 episode_revision | 同上 `:97`、`:148` |
| 设计 target tool | 同上 `:43` |
| 设计 sourceRefs 白名单 | 同上 `:110` |
| 设计 ended_at 优先级 | 同上 `:99` |
| 设计旧数据 shadow | 同上 `:203`、`:296` |
| 设计 stateFor fallback | 同上 `:252` |
| 设计事务/timeline/schema | 同上 `:262`、`:264`、`:267`、`:279` |
| 设计文档过期/冲突 | 同上 `:4`、`:19`、`:299`、`:303` |
