# REPORT-0005 · Emotion Intelligence EI-0 契约复核
## 2026-11-20 23:30 · 只读 · HANDOFF-0048

> 依据：HANDOFF-0047（commit `0ceb934...`，实际 header 仍 0046，§45 为 0047）、REPORT-0004（blob `9d3ec42b...`）
> Persona 基线：`a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`
> Memory 基线：`7548e49ed0b8d8673818464325d8e72ec7704b27`
> 本轮只读；未改源码/DB/profile；未运行测试/staging/host；未部署/重启。

## 1. 结论

**EI-0 契约复核：BLOCKED（需修订后再进入 EI-1）。**

方向和原则基本正确，但当前契约有 4 个会导致后续 schema/实现返工的结构性歧义：
1. EmotionEvent 与 EmotionAppraisal 的边界冲突；
2. EmotionEpisode 只能关联一个 event，无法表达“多个事件推动一个 episode”；
3. EmotionMemoryLink 跨 Persona DB / Memory DB / task 系统，未定义归属和 ID 生命周期；
4. EmotionState 的 `emotions[]` 未定义 target 维度，会把“对主人/工具/事件”的情绪混成一个全局状态。

另有多情绪合成、幂等、时间精度、API 能力协商等需要补的细节。

## 2. 现有代码事实（证据）

### Persona schema
- `emotion_event`：`id,self_id,at,kind,actor,subject,target,goal,goal_congruence,certainty,novelty,source_ref,excerpt,payload_json,confidence`（`lib/db.js:186`）。
- `emotion_appraisal`：`event_id,self_id,at,rule_id,emotion,intensity,valence,arousal,cause,target,confidence,accepted,source,...`；**一行一个 emotion**，一个 event 可有多行 appraisal（`lib/db.js:203`）。
- `emotion_episodes`：`id,self_id,at,emotion,intensity,cause,target,half_life_s,expires_at,appraisal_id,msg_ref`；**一个 episode 只关联一个 appraisal_id**（`lib/db.js:173`）。
- `emotion_state`：每个 `self_id` 一行当前聚合状态；没有 target 列。

### Persona API
- `emotion.state()` 返回单个 `label/intensity/episode`，由 `composeEmotionView()` 取**最强一个** active episode（`lib/emotion.js:774-812`；`lib/service.js:220`）。
- `emotionAt(at,{windowMs})` 返回单条 timeline 行（`lib/service.js:159`）。
- `emotionTimeline({from,to,limit})` 返回 timeline 行数组（`lib/service.js:185`）。
- `_emotionLine/_emotionLineFor/_emotionActFor` 都消费单 label（`lib/service.js:275-360`）。
- `dyPersona.emotion.why()` 返回 points（`lib/service.js:262`）。

### Memory 消费
- `lib/ingest/archive.js:244` `snapshotEmotion` 写 `raw_emotion_archive`；`:494` 仅 assistant/message 触发。
- `lib/service.js:311` `addEpisode` meta 无 emotion。
- `lib/inject/anchors.js:569` `emotionAtTime` 从 Persona timeline/emotionAt 取历史近似值；`:581` 可退化本地 `emotion_timeline`。
- `lib/inject/context-blocks.js:70-81` 用情绪给上下文附文字。
- `lib/maintain/factors.js` 读 `meta.emotionIntensity`，但 episode 未写入。
- 生产只读：raw_emotion_archive 1,957；episode 69；episode meta emotion 0；memory 遗留 emotion_timeline 10。

## 3. 契约结构性问题

### 3.1 EmotionEvent 与 EmotionAppraisal 边界冲突
草案的 EmotionEvent 保存 `emotions[]` + `appraisal_version`，但现有模型已经把“事件触发”与“评价结果”分开，且一个 event 可有多条 appraisal。
- 若 event 固定 emotions[]，后续重新评价就要修改“不可变事件”，与不可变原则冲突；
- 若 appraisal 可多版本，event 只能保存初始 proposal，不能代表最终判断。

建议：**Event = 不可变触发事实**（who/when/source/cause/target/evidence），不放 emotions[]；**Appraisal = 不可变判断**，带 `event_id`、`appraisal_version`、`emotions[]`；重新评价=追加新 appraisal，不改旧 event/appraisal。Event 可记录 `initial_appraisal_id` 仅作索引。

### 3.2 Episode 单 event_id 无法表达多事件
草案 `episode.emotion_event_id` 单值；现有 `emotion_episodes.appraisal_id` 也是单值。但需求明确“一个 episode 可由多个事件共同推动”。
建议：
- 增加 `emotion_episode_sources(episode_id, appraisal_id, weight, added_at)` 关联表；或 `source_appraisal_ids` JSON（不推荐，难索引）；
- episode 保留 `primary_appraisal_id` 作为兼容/主因；
- 迁移时把现有 appraisal_id 填入 junction，保证旧数据可用。

### 3.3 EmotionMemoryLink 跨库归属未定义
Persona DB、Memory DB、task 系统是不同 SQLite/服务；`raw_id/memory_id/task_id` 不能在同一表做真实外键。
建议二选一：
1. Link 表归 Persona DB，只存 `event_id` + `target_kind/target_id`（字符串命名空间），由 Memory/task 服务校验存在性；不做跨库 FK；
2. Link 表归 Memory DB，存 `emotion_event_id` + raw/memory id；Persona 不直接读。
必须定义：
- ID 命名空间（persona:self、memory:memories.id、raw:raw_meta.id、task:...）；
- memory 删除/撤回时的 link 处理（保留历史 link，标记 dangling/invalidated，不物理删 event）；
- episode 合并/拆分时 link 迁移规则。

### 3.4 State 缺 target 维度
现有 emotion_state 是 self 全局单行；episode 有 target。若 `emotions[]` 只是全局数组，会把“担心主人”“对工具烦”“对自己难过”混成一个 current state，`emotionLineFor` 无法选对目标。
建议：
- `EmotionState` 按 `experiencer + target` 分区（至少 owner/tool/self/event），或 `emotions[]` 每项带 `target`，并提供 `stateFor(target)`；
- 全局 primary label 仅作展示，不覆盖分目标状态；
- 明确 owner 情绪与汐自身情绪不能混写。

## 4. 还需补齐的契约细节

### 4.1 幂等/迟到/补收
- 草案无 event 幂等键；`source_ref` 不保证唯一。
- 建议 event 增加 `dedupe_key`，唯一约束 `(experiencer, source_kind, dedupe_key)`；无 dedupe 时用 `source_kind+source_ref+occurred_at+actor+target` 的哈希。
- 迟到消息：`occurred_at` 与 `recorded_at` 分开；补收可产生 event，但 link 的 `temporal_precision` 标 `window_fallback`，不能伪装 exact。
- 禁止用当前 state 回填旧 event；没有历史 timeline 时 link 可 null/uncertain，不强行匹配。

### 4.2 多情绪合成
- 明确同 label 合并规则（取最大强度还是加权和）、正负并存的展示顺序、primary label 选取（强度/置信度/目标优先级）；
- 低置信/冲突不合成“复杂情绪”，允许 `uncertain` 或空数组；
- 过期 episode 只影响 active 投影，不删 event/link；
- 每个 emotion 保留 source episode/appraisal id，便于 why/追溯；
- 多情绪上限/排序/预算，避免注入膨胀。

### 4.3 API 兼容
必须保留旧字段并增加能力协商：
- `state()` 继续返回 `label,intensity,episode`；新增 `emotions[]`、`schema_version`、`capabilities`。
- `emotionAt()` 继续返回单行 `label/intensity/...`；新增 `emotions[]`；旧 Memory 不读新字段。
- `emotionTimeline()` 行新增 `emotions[]`；旧调用方不受影响。
- `emotionLine/emotionLineFor/emotionActHint` 继续用 primary label；多情绪只作为可选附加，不能改变旧注入格式。
- `dyPersona` 服务增加 `capabilities.emotionV2`（或 schema_version）；Memory 先探测再调用，避免 Persona/Memory 版本错配。
- `why()` 返回 points 兼容；新增 event/appraisal id 可选。

### 4.4 事务/性能/索引
- Appraisal+emotions+episode+link 应在一个事务；failure 全回滚。
- 新表索引：event(self_id,occurred_at)、appraisal(event_id,at)、episode(self_id,status,expires_at)、link(raw_id/memory_id/event_id)。
- 每轮最多 N 个 emotion；低置信不写 episode；避免每 token 写库。
- SQLite JSON 字段仅作 payload，不把 `emotions[]` 只塞 JSON 后依赖 JSON1 查询；需要可检索字段/子表。

### 4.5 安全/关系/成长
- 低置信 appraisal 不得直接 `advanceRelationship` 或写长期人格；EI-4 先 suggest-only。
- 用户情绪（主人难过）不能被写成汐自己的情绪；`experiencer` 必须显式。
- 情绪不能改变事实判断/权限/scope/tombstone；recall 只做低权重、可解释加分。
- 安全区/消散区只影响激活/检索/摘要细节，不删除 raw/永久档案/event/link。

## 5. 建议修订后的最小对象

```
EmotionEvent: event_id, occurred_at, recorded_at, experiencer, actor,
  source_kind, source_ref, dedupe_key, cause, target, evidence_ref, confidence
EmotionAppraisal: appraisal_id, event_id, appraised_at, appraisal_version,
  emotions[] {label,intensity,confidence,valence,arousal,target,evidence_ref}
EmotionEpisode: episode_id, primary_appraisal_id, started_at, updated_at,
  status, half_life, intensity, target
EmotionEpisodeSource: episode_id, appraisal_id, weight, added_at
EmotionState: per experiencer+target projection; emotions[] + primary label
EmotionMemoryLink: link_id, appraisal_id/event_id, target_kind, target_id,
  association_kind, temporal_precision, confidence, created_at, invalidated_at
EmotionRecallSignal: shadow score, reasons[], no direct rank mutation first
```

## 6. 状态

| 项 | 状态 |
|---|---|
| 现有 Persona 数据结构/API 核对 | PASS（源码证据） |
| Memory 消费链核对 | PASS（源码+只读计数） |
| EI-0 原则（不可变/不删除/不操控） | PASS（方向） |
| Event/Appraisal 边界 | **BLOCKED**（需拆分） |
| Episode 多事件 | **BLOCKED**（需 junction） |
| 跨库 MemoryLink | **BLOCKED**（需定归属） |
| State target 维度 | **BLOCKED**（需分目标） |
| 幂等/迟到/时间精度 | 需补充 |
| API 兼容/能力协商 | 需补充 |
| 事务/索引/性能 | 需补充 |
| EI-1 实施 | NOT RUN（本轮不实施） |
| 生产写入/部署 | NOT RUN/禁止 |

## 7. 需要 GPT 决策

1. Event/Appraisal 是否按“事件不可变 + 判断多版本”拆分；
2. Episode 多事件用 junction 表还是 JSON；
3. Link 归 Persona 还是 Memory（跨库不能 FK）；
4. State 是否按 target 分区，primary label 如何选；
5. 多情绪上限/合并规则/低置信阈值；
6. 旧 API 能力协商字段名（emotionV2/schema_version）。

## 8. 副作用

只读源码/DB；未改 Persona/Memory 源码、DB、profile/config；未运行测试/staging/host；未部署/重启。
