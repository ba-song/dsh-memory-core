# REPORT-0007 · EI-0 修订契约第二轮复核
## 2026-11-20 23:55 · 只读 · HANDOFF-0050

> 依据：HANDOFF-0049（commit `2ed8d84...`，blob `7e3c573d...`）、REPORT-0006（blob `1ba38b58...`）
> Persona `a84c7ba`；Memory `7548e49`。只读；未改源码/DB/profile；未运行测试/staging/host；未部署。

## 1. 结论

**EI-0 REVIEW PASS（有条件），可作为 EI-1 纯函数层开发依据。**

四项结构性裁决已解决上一轮 BLOCKED：Event/Appraisal 分离、Episode junction、Link 归 Memory、State 按 experiencer+target 分区。

但以下条件必须在 EI-2/EI-3 前落实；不影响先做 EI-1 纯函数：
1. 旧 episode 的 confidence 阈值迁移/兼容规则；
2. `emotions[]` 的物理存储（子表或 JSON）与迁移；
3. outbox/inbox 的归属、顺序、幂等 ack；
4. target namespace 的规范化与 fallback 标记；
5. `schema_version=2` 命名冲突；
6. Legacy Link 的 FK/失效策略。

## 2. 现有数据证据（只读）

Persona DB（`/sdcard/DSHA/人格/数据/persona.db`）：

| 项 | 数量 |
|---|---:|
| emotion_episodes | 345 |
| episode appraisal_id=0 | **0** |
| emotion_event | 345 |
| emotion_appraisal | 345 |
| 一个 event 多条 appraisal | **0** |

- 当前旧数据是一对一：每个 episode 有一个有效 appraisal；junction 回填可直接一对一，但仍需幂等/唯一约束。
- 现有 appraisal confidence 默认 0.5；新阈值 `>=0.65` 若直接回溯，会把大量旧 episode 排除出 active，造成行为回归。必须定义：
  - 旧数据 grandfathering（保留旧 active 规则）；或
  - 只对新 appraisal 应用阈值；或
  - 迁移时重新标定 confidence 并记录来源。
- 345 条旧 episode 没有多来源；junction 迁移简单，但必须处理 appraisal_id 为 0/无效（当前生产 0 条，仍要测试）。

## 3. 四项裁决复核

### 3.1 Event/Appraisal 分离 — PASS
Event 只存触发事实，Appraisal 存 `emotions[]` 和版本；重新评价追加，不改旧记录。与现有 `emotion_event`/`emotion_appraisal` 表方向一致。

条件：
- Event 的 `dedupe_key` 唯一约束需处理空值/旧数据；
- `initial/latest_appraisal_id` 只能做缓存，不能当事实来源；
- 旧 appraisal 的 `emotion` 单列保留为 primary，`emotions[]` 需要子表（建议 `emotion_appraisal_items`），不要只塞 JSON。

### 3.2 Episode junction — PASS
`emotion_episode_sources(episode_id,appraisal_id,weight,added_at,source_role)` 能表达多来源；保留 `emotion_episodes.appraisal_id` 作为 primary 兼容字段。
条件：
- 加 `UNIQUE(episode_id,appraisal_id)`；`weight` 0..1；`source_role` 枚举/校验；
- 旧数据回填：`appraisal_id>0` 才写 source；0/无效跳过并记录；
- 合并保留全部 source 并去重；拆分保留历史 source，旧 episode 标 superseded，不删除；
- 需要保证 primary_appraisal_id 始终是 junction 之一（或明确可为空）。

### 3.3 Memory Link — PASS（归属正确）
Link 归 Memory DB，raw/memory 可本地 FK，task 外部命名空间；不跨库 FK，删除/撤回只标 invalidated/dangling，不删 Persona 历史。方向正确。

条件（EI-3 前必须解决）：
- 表结构：`link_id, emotion_event_id, appraisal_id, source_system, target_kind, target_id, association_kind, temporal_precision, confidence, created_at, invalidated_at, invalidation_reason, status pending/resolved/invalidated`；
- `target_id` 字符串命名空间；raw/memory FK 不得 `ON DELETE CASCADE` 删除历史 link；task 只存外部 ID；
- **outbox/inbox 归属未定**：Persona 写 event/appraisal 后，谁保存待投递事件？建议 Persona DB 持 outbox，Memory DB 持 inbox/link；ack 幂等键 `(source_system,event_id,appraisal_id,target_kind,target_id)`；重试/去重/部分成功/Persona/Memory 不可用都要定义；
- tombstone 只影响 link 状态，不删除 event/appraisal；
- memory hard delete 时 link 标 dangling，保留审计；是否允许重建待定。

### 3.4 target-aware State — PASS
State 按 experiencer+target 分区，stateFor(target) 新增；旧 state() 保留 global primary。方向正确。

条件：
- target namespace 需规范化：`self`、`owner`、`owner:<peer_id>`、`tool:<name>`、`event:<id>`；不能把 owner 情绪写成 self；
- `stateFor(target)` 缺数据时返回明确 `missing/fallback`，不能伪装精确；
- `emotionLineFor(target)` 只有精确 target 才用；global fallback 必须标注；
- 现有 `emotion_state` 单行只作 global 兼容缓存，不能作为所有 target 的事实来源。

## 4. 阈值/上限评审

GPT 初值：
- `confidence >= 0.65` active episode 候选；
- 0.45–0.65 仅 appraisal；
- <0.45 uncertain/abstain；
- 单次最多12个 emotion items；State 默认展示8项。

判断：
- 作为工程初值可落地，但 **0.65 与现有默认 0.5 冲突**；直接启用会让旧/现有 episode 失效。必须做 legacy 兼容/迁移，否则 EI-2 一上线就会改变注入行为。
- 12/8 是资源保护，不是能力上限；必须明确超限返回 validation error/分页，不得静默截断；长期历史不设总量上限。
- 阈值需隔离评测/影子对比校准；不能把初值当心理学真值。
- State 默认8项不应删除其余；完整集合可分页。

## 5. API 兼容

现有：
- `state()` 返回单 `label/intensity/episode`；新增 `emotions[]` 兼容。
- `emotionAt()` 单行；新增 `emotions[]/precision`；旧字段保留。
- `emotionTimeline()` 行数组；新增可选 `emotions[]`。
- `emotionLine/emotionLineFor/emotionActHint` 用 primary label；旧文本不变。
- `why()` points 兼容。

风险：
1. `schema_version=2` 与 Persona DB schema v2 **同名冲突**；建议改名 `emotion_contract_version=1` 或 `api_version`，不要复用 DB schema_version。
2. `capabilities.emotionV2` 放在 `dyPersona` 服务根；Memory 需 feature-detect，不能假设。
3. 新 Memory 读旧 Persona（无 emotions[]）时必须回退；旧 Memory 读新 Persona 必须忽略新字段。
4. `emotionAt` 的 precision/置信度不能改变旧调用方语义；旧字段保持旧值。

## 6. 状态

| 项 | 状态 |
|---|---|
| Event/Appraisal 分离 | PASS |
| Episode junction | PASS（需 unique/回填规则） |
| Memory Link 归属 | PASS（outbox 未定） |
| target State | PASS（namespace/fallback 需定） |
| 阈值/上限 | PASS（需 legacy 兼容/校准） |
| API 兼容 | PASS（schema_version 命名需改） |
| `emotions[]` 存储 | 待定（建议子表） |
| outbox/inbox | 待定（EI-3 前） |
| EI-1 纯函数 | 可以开始（NOT RUN） |
| EI-2/EI-3 | 待上述条件 |
| 生产写入/部署 | NOT RUN/禁止 |

## 7. 可冻结 / 待校准

可冻结：
- Event 不可变、Appraisal 多版本；
- Episode 多来源 junction + primary 兼容；
- Link 归 Memory、外部 ID、不跨库 FK；
- State 按 experiencer+target；
- 旧 API 保留、V2 增量；
- 历史不删除、情绪不替代事实/权限。

待校准/实现前定：
- confidence 阈值与旧数据兼容；
- `emotions[]` 子表/JSON；
- outbox/inbox 归属与 ack；
- target namespace 规范；
- `schema_version` 命名；
- Link FK/失效策略。

## 8. 副作用

只读源码/DB；未改 Persona/Memory 源码、DB、profile/config；未运行测试/staging/host；未部署/重启。
