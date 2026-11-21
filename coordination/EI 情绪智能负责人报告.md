# EI-REPORT-0002 · EI-1 修复分支隔离验收

> 会话：EI 情绪智能负责人（Persona 情绪/EI 领域专业智能体）
> 任务：EI-1 修复分支只读隔离验收
> 生成时间：2026-11-21 10:45 (Asia/Shanghai)
> 性质：只读/隔离验收；本报告不代表生产授权，不代表 EI-2 已批准或开始。

## 版本历史

| 版本 | 时间 | 内容 |
|---|---|---|
| EI-REPORT-0002 | 2026-11-21 10:45 | 本轮：`fix/ei1-source-ref-experiencer-contract` @ `b1cac0f` 隔离验收 |
| EI-REPORT-0001 | — | 未在本分支发现该文件；本轮按任务指定从 0002 起记录 |

---

## 0. 阅读导航

1. 基线
2. 执行命令与测试
3. EI-1 代码验收结果
4. 关键缺陷与根因
5. EI-2 设计文档复核
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
| **实际 HEAD** | **`b1cac0fa8eef6b267a4be94ef69772da6cff5c71`** |
| HEAD 时间/标题 | 2026-11-21 10:35:52 +0800 `docs(ei): define event experiencer columns for dedupe key` |
| 原验收目标 | `950eb423856663dd744cdd702f391527a4c36a6f` |
| 相对原目标 | 6 个提交 |
| 基线 main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`（未变） |
| 隔离 worktree | `/tmp/ei1-b1cac0f`，detached，`git status --short` 为空 |
| Node / npm | v24.19.0 / 11.17.0（满足 Persona `>=22`；未安装/升级依赖） |

### 文件 blob 核对（与 GPT 提供表一致）

| 文件 | 实测 blob |
|---|---|
| `lib/emotion-compose.js` | `7313c7cc08b85d0b917cfe8057e04e036c01c220` |
| `tests/emotion-compose.test.mjs` | `eb17cb0f2c67450a145f38d1a582bef6d90b07c8` |
| `EI-2-PERSISTENCE-DESIGN-01.md` | `f0a8055f0c6f87910129137521396e24f72c49ae` |

### 共享状态文件

- HANDOFF：`coordination/project-handoff` @ `5e0159b`，blob `f8ffa40d4c27c04d23ff74b123bf2b7044821976`（仍是 HANDOFF-0057，**无本轮记录**）
- REPORT：同分支，blob `e219f707cc4363c53704fbe389f786148142326e`（仍只有 REPORT-0013/0014）
- 本轮不修改 HANDOFF/REPORT/PROJECT.md；只新增本会话报告。

---

## 2. 执行命令与测试

| 命令 | 结果 | 退出码 | 日志 |
|---|---|---|---|
| `node --version` | `v24.19.0` | 0 | — |
| `node --test tests/emotion-compose.test.mjs` | **21 tests / 20 pass / 1 fail / 0 skip** | **1** | `/tmp/ei1-b1cac0f-target.log` |
| `npm test` | **324 tests / 323 pass / 1 fail / 0 skip** | **1** | `/tmp/ei1-b1cac0f-full.log` |
| `git status --short` | 空 | 0 | — |

**唯一失败**：`tests/emotion-compose.test.mjs:145`  
`preserves both episode and appraisal identifiers plus explicit sourceIds`

- 期望 `sourceIds`：`[12, 13, 14, 88, 89, 'event:5', 'raw:4']`
- 实际 `sourceIds`：`[12, 13, 88, 89, 'event:5', 'raw:4']`
- 失败断言：`:149`，缺少 `episode_id=14`
- `sourceRefs` 本身已包含 `episode 14`（探针确认），失败只在旧 `sourceIds` 兼容字段。

---

## 3. EI-1 代码验收结果

### 3.1 sourceRefs 完整性

| 检查 | 结果 | 状态 |
|---|---|---|
| episode `id` / `episodeId` / `episode_id` 全部进入 | 12、13、14 均存在 | **PASS** |
| appraisal `appraisalId` / `appraisal_id` 全部进入 | 89、88 均存在 | **PASS** |
| event / raw 等显式 sourceIds | event:5、raw:4 均存在 | **PASS** |
| 相同数字 ID 不同类型不碰撞 | episode:7 / appraisal:7 / event:7 → 3 条 | **PASS** |
| 同类型重复引用去重 | 重复 event:5、raw:4 去重 | **PASS** |
| 旧 `sourceIds` 兼容 | **缺 `episode_id=14`** | **FAIL** |
| 多 episode 合并来源 | 合并后 refs 保留 | **PASS** |
| 排序 | type/id/role codepoint 排序 | **PASS** |
| 类型白名单 | 仍无强校验（设计 §3.4 待定） | **PARTIAL** |

### 3.2 Experiencer 契约

| 检查 | 结果 | 状态 |
|---|---|---|
| 缺失 experiencer → unknown | `unknown`，`experiencerId=''` | **PASS** |
| 显式 self/owner/third_party/unknown | 原样保留 | **PASS** |
| 裸 ID：`owner` + `123` | `owner:123` | **PASS** |
| 已带同类型前缀：`owner` + `owner:456` | `owner:456`，无双重前缀 | **PASS** |
| 前缀冲突：`owner` + `self:123` | 整条被拒绝（total=0） | **PASS** |
| `unknown` + 非空 ID | 清空为 `unknown` | **PASS** |
| 旧式 `experiencer='self:1d2'` | type=self、id=1d2、输出 self:1d2 | **PASS** |
| target 与 experiencer 分离 | 独立保留 | **PASS** |

### 3.3 Self 投影隔离

| 检查 | 结果 | 状态 |
|---|---|---|
| unknown-only 输入 `primaryForSelf` | `null` | **PASS** |
| owner-only / third_party-only | 不进入 `selfEmotions` | **PASS** |
| self + owner 混合 | `primary` 可为 owner，`primaryForSelf` 为 self | **PASS** |
| 只有 self 且达阈值才 `injectable` | self 且 confidenceClass=active_candidate 才 true | **PASS** |
| 通用 `primary` 不被当作 self | 通用 primary 与 primaryForSelf 分离 | **PASS** |
| legacy self 低于阈值 | 仍在 `allEmotions` 可见，但 `injectable=false`、不进 selfEmotions | **PASS（按“门槛”口径）** |

### 3.4 回归

- 多情绪并存、正负并存、同 label 合并取最大衰减强度、不同 target 隔离、过期/衰减、确定性排序、displayLimit、confidence 边界、legacy：**全部通过**。
- 全量 323/324；唯一失败是新增 `sourceIds` 兼容断言，不是旧能力回归。
- 结论：**原有情绪组合能力回归 PASS**。

---

## 4. 关键缺陷与根因

### D1（阻断 PASS）：旧 `sourceIds` 未包含 `episode_id`

`lib/emotion-compose.js:121-122`：

```js
sourceIds: [...new Set([
  episode.id, episode.episodeId, episode.appraisalId, episode.appraisal_id,
  ...(Array.isArray(episode.sourceIds) ? episode.sourceIds : []),
].filter(...))]
```

缺少 `episode.episode_id`；但 `sourceRefs` 的 `addRef` 已包含它（`:93`）。因此：
- 新字段 `sourceRefs` 完整；
- 旧兼容字段 `sourceIds` 不完整；
- 目标测试 `:149` 失败。

最小修复：在 `sourceIds` 数组中加入 `episode.episode_id`（去重由 `new Set` 负责），不改其他行为。

### D2（设计/实现待收口）：sourceRefs 类型白名单

EI-1 现在会产生 `episode`、`appraisal`、`event`、`raw`、`legacy` 五类；设计 §3.4 的建议白名单是 `event`、`appraisal`、`raw_message`、`tool_call`、`memory`、`external`。缺少：
- `episode` → 是否允许作为 source_type？
- `raw` → 是否映射为 `raw_message`？
- `legacy` → 如何映射/是否拒绝？
设计 §12.2.3 已承认为未决项，但 EI-2A 前必须定稿。

---

## 5. EI-2 设计文档复核

基线：`EI-2-PERSISTENCE-DESIGN-01.md` @ `b1cac0f`，blob `f0a8055f0c6f87910129137521396e24f72c49ae`，299 行。仍是提案，未冻结。

| # | 检查项 | 结果 | 状态 |
|---|---|---|---|
| 1 | event 的 dedupe_key 与 experiencer 字段 | §3.1 已加 `experiencer_type/id`、`dedupe_key`、唯一约束 `(self_id,experiencer_type,experiencer_id,source_kind,dedupe_key)` | **PASS** |
| 2 | appraisal_version / supersedes_appraisal_id | §3.2 已加两字段，并说明重评链；但“同一 event 同一版本唯一”只有文字，无明确唯一索引 DDL | **PASS（字段）/ PARTIAL（约束）** |
| 3 | 一条 appraisal + 多条 appraisal_items | §3.2 明确统一为 items 子表，取消“一情绪一条 appraisal”新模型 | **PASS** |
| 4 | target_type 保留 tool | §2.2 白名单已含 `tool`，并说明不折叠为 object | **PASS** |
| 5 | `stateFor(target)` 与旧 `emotion_state` fallback | §9.8 明确只读投影；self 可 `legacyFallback:true`，owner/third_party/tool 不得复用单行状态 | **PASS** |
| 6 | outbox 的 event_id / idem_key / ack | §5 已区分 UUID event_id、独立 idem_key、ack_status/acked_at、payload_sha256 ack 校验 | **PASS（定义）/ FAIL（idem_key 依赖未定义字段）** |
| 7 | 旧 348 条避免未经证据批量认定 self | §6.3 给出四类迁移矩阵；明确“348 条不得批量转 self”，先 shadow | **PASS** |
| 8 | `ahead 9` 与“默认 self”旧描述 | 头部已改 ahead 13；§1.5 已改为 950eb4 默认 unknown、修复分支未验收 | **PASS（已修正）** |
| 9 | sourceRefs 类型白名单与 legacy 前缀映射 | 白名单仍未覆盖 `episode/raw/legacy`；§12.2.3 明确未决 | **FAIL/未决** |

### 5.1 额外设计不一致

1. **payload 示例与裸 ID 契约冲突**：§2.1/§12.1 规定 `experiencer_id` 是裸 ID，但 §5 示例（`:184`）写 `"id":"self:..."`，sourceRefs 示例（`:192`）写 `"id":"appraisal:88"`；会诱导实现者二次拼接/存入带前缀 ID。**FAIL（文档一致性）**。
2. **idem_key 依赖 `episode_revision`**：§5（`:145`）写 `episode_id + event_type + episode_revision`，但 §3.3 的 episode 新字段没有 `episode_revision`。**FAIL（字段缺失）**。
3. **`ended_at` 与 `expires_at` 优先级未定义**：§3.3/§11.7 只说都影响投影，没有规定显式结束与自然到期的先后/覆盖关系。**PARTIAL**。
4. **事务边界只在风险节**：§11.1 正确识别三连 INSERT 无事务，但 §3.1/§3.2 持久化模型未写明 event+appraisal+items+episode 的单事务边界；EI-2A 规格必须显式落。**PARTIAL**。
5. **`sourceRefs` 类型白名单无强校验**：EI-1 `addRef` 接受任意 `x:y`，与设计 §3.4 “写入层按 source_type 校验可访问性”不一致；设计已列为未决，但代码未校验。**PARTIAL**。

### 5.2 设计评审结论

- **可以进入下一轮评审**（结构已从“多个并行模型”收敛为：event 去重 + appraisal 修订 + items + episode + outbox/inbox；旧数据矩阵和 stateFor fallback 已明确）。
- **不能直接进入 EI-2A 实施/冻结**：sourceRefs 白名单映射、payload 裸 ID 示例、idem_key 的 `episode_revision`、appraisal_version 唯一约束、ended_at/expires_at 优先级仍需定稿。

---

## 6. 结论汇总

| 问题 | 结论 |
|---|---|
| EI-1 代码修复是否 PASS | **FAIL**：定向 20/21、全量 323/324；唯一阻断是 `sourceIds` 缺 `episode_id=14` |
| sourceRefs 新字段是否 PASS | **PASS**：全部 episode/appraisal 别名、碰撞、去重、合并均通过 |
| Experiencer 契约是否 PASS | **PASS**：缺失→unknown、裸 ID、匹配前缀、冲突拒绝、unknown 清空、旧式 self:id 全部通过 |
| Self 投影隔离是否 PASS | **PASS**：unknown-only `primaryForSelf=null`；owner/third_party 不进 selfEmotions；只有 self 且达阈值 injectable |
| 原有情绪组合能力是否回归 PASS | **PASS**：323/324；唯一失败是新 sourceIds 兼容断言，旧能力无回归 |
| EI-2 设计是否可以进入下一轮评审 | **PARTIAL PASS**：可以评审；不可直接实施/冻结；5 个不一致需先收口 |
| 本轮是否可标记 EI-1 PASS | **不可以**；等待 GPT 修复 D1 后重跑 21/21 + 全量全绿 |

---

## 7. 未决项与下一步

1. **GPT 修 D1**：`sourceIds` 加入 `episode.episode_id`；复跑 `node --test tests/emotion-compose.test.mjs`（应 21/21）与 `npm test`（应 324/324）。
2. **定 sourceRefs 白名单**：明确 `episode`、`raw`→`raw_message`、`legacy` 的映射/拒绝规则；EI-1 与 EI-2 共用。
3. **修设计文档**：payload 示例改裸 ID；补 `episode_revision` 或改 idem_key 组成；明确 appraisal_version 唯一索引；明确 ended_at/expires_at 优先级；把事务边界写进持久化模型节。
4. **EI-2A 前**：等待项目负责人明确授权；本轮不开始 schema/migration。
5. **HANDOFF/REPORT**：等 EI-1 修复 PASS 后由 GPT+DSH 按协议更新；当前仍是 HANDOFF-0057/REPORT-0014，无 b1cac0f 记录。

---

## 8. 边界声明

- 只读/隔离：独立 worktree `/tmp/ei1-b1cac0f`；未修改源码、测试、配置、数据库。
- 未安装/升级依赖；未合并 main；未接生产注入；未迁移生产 DB。
- 未启动 staging；未部署/重启。
- 未修改 Memory 仓库；未修改共享 HANDOFF/REPORT/PROJECT.md。
- 未触碰生产数据库。
- 未把未执行测试计为通过；Node 测试由本轮实际执行。

---

## 9. 证据索引

| 结论 | 证据 |
|---|---|
| 实际 HEAD | `git rev-parse HEAD` → `b1cac0fa8eef6b267a4be94ef69772da6cff5c71` |
| 三个 blob | `git hash-object` → `7313c7c…` / `eb17cb0…` / `f0a8055…` |
| 定向测试 | `/tmp/ei1-b1cac0f-target.log`：21 / 20 pass / 1 fail / exit 1 |
| 全量测试 | `/tmp/ei1-b1cac0f-full.log`：324 / 323 pass / 1 fail / exit 1 |
| 失败断言 | `tests/emotion-compose.test.mjs:149` 期望含 14，实际缺 14 |
| sourceIds 缺字段 | `lib/emotion-compose.js:121-122` 未含 `episode.episode_id` |
| sourceRefs 完整 | `lib/emotion-compose.js:93-94`；探针 7 条 refs 全含 |
| Experiencer | `lib/emotion-compose.js:39-70`；探针覆盖缺失/四种类型/裸 ID/前缀/冲突/未知 ID/旧式 |
| Self 投影 | `lib/emotion-compose.js:187-190`；探针 unknown-only / owner-only / self+owner |
| 设计 dedupe/experiencer | `EI-2-PERSISTENCE-DESIGN-01.md:61-63` |
| 设计 appraisal 修订/items | 同上 `:77-83` |
| 设计 target tool | 同上 `:43` |
| 设计 stateFor fallback | 同上 `:247` |
| 设计 outbox ack | 同上 `:143-161` |
| 设计旧数据矩阵 | 同上 `:203`、`:296` |
| 设计白名单缺口 | 同上 `:107`、`:294` |
| 设计 payload 前缀冲突 | 同上 `:184`、`:192` |
| 设计 idem_key 缺 revision | 同上 `:145`；§3.3 无 `episode_revision` |
