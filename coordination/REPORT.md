# REPORT-0006 · EI-0 契约决策与修订版
## 2026-11-20 · GPT 架构决策 · 基于 HANDOFF-0048 / REPORT-0005

> Persona 基线：ba-song/dsh-persona-core@a84c7badd1e6c971a66b6c39dd4f7ab795df4b90
> Memory 基线：ba-song/dsh-memory-core@7548e49ed0b8d8673818464325d8e72ec7704b27
> DSH 复核结论：EI-0 REVIEW BLOCKED；本报告对六项决策作出明确选择，形成修订契约，待 DSH 再次只读复核。
> 本轮仅更新协调文档；未修改插件源码、未运行测试、未连接/修改生产 DB、未启动 staging、未部署/重启。

## 1. 四项结构性裁决

### 1.1 Event 与 Appraisal：明确拆分
决定：Event 是不可变触发事实；Appraisal 是不可变判断版本。
- EmotionEvent 不包含 emotions[]，不保存 appraisal_version。保存 occurred_at、recorded_at、experiencer、actor、source_kind/source_ref、target、cause、evidence_ref、dedupe_key。
- EmotionAppraisal 通过 event_id 关联 Event，保存 appraised_at、appraisal_version、来源、confidence、emotions[]。
- 同一 Event 可有多个 Appraisal；重新评价只能追加新 appraisal，不能覆盖旧 event/appraisal。
- 可保存 initial/latest appraisal ID 作为可重建缓存指针，不作为唯一事实来源。
- 每个 emotion item 保存 label、intensity、confidence、valence、arousal、target、evidence_ref。

### 1.2 Episode 多事件：使用 junction 表
决定：采用 emotion_episode_sources(episode_id, appraisal_id, weight, added_at, source_role)，不使用 JSON 数组。
- 保留现有 emotion_episodes.appraisal_id 作为 primary_appraisal_id 兼容字段。
- 新建 episode 时同时写 primary 字段和 junction source。
- 旧数据迁移时将有效 appraisal_id 幂等回填为一条 source。
- episode 合并保留所有 source 并去重；拆分按事件/目标/情绪归属分配 source，旧 episode 标记 superseded，不删除历史 source。
- weight 范围 0..1，表示来源贡献，不等于情绪强度。

### 1.3 EmotionMemoryLink：归 Memory DB
决定：关联边由 Memory 持有。raw_id、memory_id、recall、tombstone 生命周期属于 Memory。
- 字段：link_id、emotion_event_id（opaque 外部 ID）、appraisal_id（opaque 外部 ID，可空）、target_kind(raw|memory|task)、target_id（命名空间 ID）、association_kind、temporal_precision、confidence、created_at、invalidated_at、invalidation_reason。
- raw/memory 可在 Memory DB 内建立本地 FK（需先核对现有 schema）；task ID 是外部命名空间，不设跨库 FK。
- 删除/撤回/tombstone 不删除 Persona Event/Appraisal；Link 标记 invalidated/dangling，保留审计历史。
- episode 合并/拆分不改 Link 指向的原始 event/appraisal；episode 映射如有需要另建可重建关系。
- Memory 通过 Persona service API 读取事件/评价详情，不直接打开 Persona DB 文件。

### 1.4 EmotionState：按 experiencer + target 分区
决定：目标维度必需。
- 每条 State projection 对应 experiencer + target namespace；每个 emotion item 也携带 target。
- 新增 stateFor(target)；旧 state() 保留 global primary 兼容视图。
- emotionLineFor(target) 优先精确目标分区；目标未知时可回退 global primary，但必须标记 fallback。
- “主人难过”是关于 owner 的识别，不等于“汐自己难过”；experiencer 必须显式。

## 2. 多情绪计算契约
- 不建立封闭 enum；六基础情绪和图中组合只是可扩展 ontology 参考。正负情绪并存，不相互抵消。
- 同 experiencer + target + projection window 内，同 label 展示合并；effective_intensity 取来源衰减后强度最大值，避免重复事件简单相加；confidence 取最高有效来源，并保留全部 source IDs。
- 不同 target 不合并；相反情绪分别保留。
- primary label 仅用于旧 API/简短展示。先按 target 过滤，再按 effective_intensity × confidence 排序；平局按强度、置信度、最近有效更新时间、稳定 label 顺序处理。
- 低置信 shadow 初值：confidence >= 0.65 可进入 active episode 候选；0.45–0.65 只保留 appraisal；低于 0.45 或无法解析则 uncertain/abstain。阈值仅为待隔离评测校准的工程初值，不是心理学真值。
- 低置信不得改变关系轴、长期人格或记忆权重；缺失 confidence 不得默认为 1。
- 不限制 ontology、组合数或长期历史数。单次 appraisal 暂定最多 12 个有效 emotion items，超限须明确 validation error，不得静默丢弃后宣称完整。此为单次资源保护，不是情绪能力上限。
- State API 默认最多展示 8 项；完整集合可分页/limit 读取，不删除其余历史。

## 3. 幂等、时间与历史
- Event 增加 dedupe_key；唯一约束建议 (experiencer, source_kind, dedupe_key)。优先使用来源稳定事件 ID；否则用 source_kind、source_ref、occurred_at、actor、target 规范化哈希，不用纯文本去重。
- occurred_at 是事件发生时间；recorded_at 是系统接收/持久化时间；appraised_at 是判断生成时间。
- 迟到/补收保留真实 occurred_at 与 recorded_at；不得用当前 state 回填历史。
- Link temporal_precision 必填 exact、nearest、window_fallback 或 unknown。nearest/window_fallback 保存偏差/窗口；无历史证据可 unknown/unlinked。

## 4. API 能力协商与兼容
决定：使用 capabilities.emotionV2=true，并同时提供 schema_version=2。
- 旧签名与字段保留：state() 的 label/intensity/episode；emotionAt() 单行字段；emotionTimeline() 旧行字段；emotionLine/emotionLineFor/emotionActHint 旧文本行为。
- V2 新增 emotions[]、schema_version、capabilities 与 stateFor(target)。
- 旧 Memory 不读取新字段；新 Memory 先探测 capabilities.emotionV2，探测失败回退旧 API。
- emotionAt(time) 的 emotions[] 只表示该时刻可证明的历史集合；无精确证据返回 precision，不静默回退当前 state。

## 5. 事务、索引与失败策略
- Persona DB 内 Event/Appraisal/emotion items/Episode/EpisodeSource 单事务，失败整体回滚。
- MemoryLink 在 Memory DB 独立事务；两库不伪装成一个原子事务。用幂等 outbox/inbox 重试，状态 pending/resolved/invalidated。
- 索引至少覆盖 event(experiencer,occurred_at)、event(source_kind,dedupe_key)、appraisal(event_id,appraisal_version)、episode(experiencer,target,status,expires_at)、episode_sources(episode_id,appraisal_id)、link(target_kind,target_id)、link(emotion_event_id)。先核对现有索引与 EXPLAIN QUERY PLAN，避免重复。
- 不每 token 写库；在完整消息、工具事件或自主任务阶段边界生成 appraisal。情绪关联失败不得阻塞 raw 原始记录。

## 6. 状态与边界
- 四项结构决策已由 GPT 作出；EI-0 修订契约待 DSH 只读复核。
- EI-1 NOT STARTED，必须等待 EI-0 review PASS。
- Persona/Memory 源码修改、测试、迁移、DSHA E2E：NOT RUN。
- P0 staging：NOT RUN；生产写入/部署未授权、未执行。