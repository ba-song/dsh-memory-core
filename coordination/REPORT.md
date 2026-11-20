# REPORT-0004 · Emotion Intelligence 第二轮源码审查与 EI-0 契约草案
## 2026-11-20 · GPT GitHub 静态审查 · 基于 HANDOFF-0046 / REPORT-0003

> Persona 基线：`ba-song/dsh-persona-core@a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`
> Memory 基线：`ba-song/dsh-memory-core@7548e49ed0b8d8673818464325d8e72ec7704b27`
> 本轮只读源码审查与协调文档更新；未改插件源码、未运行测试、未连接/修改生产 DB、未启动 staging、未部署/重启。

## 1. 核对 DSH 的 HANDOFF-0046 / REPORT-0003

DSH 报告与 GPT 复核的源码一致：
- Persona 本地安装路径 `/root/.dsh/plugin-src/dsh-persona-core`，package 0.2.0；无 `.git`，但本地 71/71 文件 SHA256 与 GitHub 基线完全一致。准确表述为“文件级一致”，不声称 Git 工作树 clean。
- Memory raw 情绪快照已存在；episode meta 尚无 emotion；情绪用于上下文展示而非主召回排序。
- 用户消息、工具结果、自主行动结果尚未形成统一快照关联路径。
- 24h 近似取值可能把非精确时间的状态关联到历史 raw。
- P0 staging plan v5 仅静态复核 PASS；staging NOT RUN；生产操作未授权。

## 2. Persona 第二轮源码审查

### 2.1 当前状态不是单一维度
`lib/emotion.js` 已包含：
- valence / arousal / certainty / intensity；
- mood 慢层、dominance、energy/social；
- 规则打分、平滑、惰性衰减、单条变化限幅；
- emotion episodes、appraisal、timeline、event；
- 关系轴与目标对象概念。

`lib/db.js` 的 persona schema v2 已有 `emotion_state`、`emotion_timeline`、`emotion_points`、`emotion_episodes`、`emotion_event`、`emotion_appraisal` 等表。说明当前基础是“状态维度 + 事件/appraisal + 有限 episode”，并非只有一个标签。

### 2.2 复合情绪视图仍被压成单标签
`lib/emotion.js:774-812` 的 `composeEmotionView()`：
- 先按强度排序的 active episodes 只取第一个有效 episode；
- 返回单个 `label` / `intensity` / `episode`；
- 无有效 episode 才回落到 valence/mood 合成标签。

因此多个 episode 虽可并存，但服务层没有提供完整的多情绪集合。建议新增 `emotions[]` 作为权威复合视图，并保留 `label` 作为兼容 primary label，不删除旧字段。

### 2.3 Appraisal 仍为单情绪
`lib/appraisal.js`：
- system prompt 定义单个 `emotion(...)`；
- `parseAppraisal()` 只校验并返回一个 `emotion`；
- 单一 `intensity/valence/arousal/target/cause`；
- LLM 超时/失败回 null，由调用方规则回退。

建议未来兼容旧 `emotion`，新增 `emotions[]`；解析器必须对数组长度、标签、数值范围、重复项、置信度和未知标签做严格归一化。低置信/无把握允许输出空数组或 uncertain，不应强造复合情绪。

### 2.4 状态、事件和 episode 的语义边界需明确
目前：
- `emotion_state` 是当前聚合状态；
- `emotion_timeline` 是带时间的状态采样；
- `emotion_event` 是触发事件及上下文；
- `emotion_appraisal` 是对事件的评价结果；
- `emotion_episodes` 是带半衰期的活跃情绪。

EI-0 必须把“发生过的不可变情绪事件”“当前衰减后的状态投影”“短期活跃 episode”“对记忆的关联”分开，不能让当前 state 反写历史 event，也不能把 episode 衰减当成删除历史。

### 2.5 关系与人格成长边界
`lib/relationship.js` 将情绪类型/强度映射到 trust/warmth/disclosure/tension 等关系轴，并有限幅和日衰减。EI-4 应复用现有关系轴，但必须避免一次低置信 appraisal 直接长期改变关系；先 shadow/suggest-only，保留来源、置信度和可解释依据。

## 3. Memory 情绪链路复核

基于开发 commit `7548e49...`：
- `lib/ingest/archive.js:244-260`：`snapshotEmotion(rawId, at)` 查询 Persona timeline/emotionAt，并写 `raw_emotion_archive`。
- `lib/ingest/archive.js:494`：只在 `assistant/message` 且存在 `_firstSelfId` 时触发。
- `lib/service.js:311`：`addEpisode` meta 目前包含 source/actionId/channel/ref/dedupeKey 等，不含 emotion。
- `lib/inject/anchors.js:569+`：`emotionAtTime` 从 Persona 时间线或 Memory 旧表取近似情绪。
- `lib/inject/context-blocks.js:70-81`：相关上下文可附加情绪文字。
- `lib/maintain/factors.js: emotionFactorOf()` 已读取 `meta.emotionIntensity` 并产生最多 15% 的记忆权重乘数，但 DSH 生产统计显示 episode meta 中该字段缺失，因此目前该因子没有真实情绪值可用。
- DSH 生产只读统计：raw_emotion_archive 1,957；episode 69；episode meta emotion 0。

注意：24h 时间窗口并非“事件时刻精确状态”。EI-0 要求时间关联必须明确标记 exact / nearest / window_fallback 等精度，不允许把近似匹配伪装成 exact。

## 4. EI-0 逻辑契约草案（供后续开发）

### 4.1 核心对象分层
1. **EmotionEvent（不可变历史事件）**：记录一次情绪判断发生的时间、体验者、触发来源、目标、情绪集合、置信度及证据引用。
2. **EmotionEpisode（短期活跃状态）**：由一个或多个事件推动，带独立强度/半衰期/状态；衰减只改变有效强度/激活，不删除事件。
3. **EmotionState（当前投影）**：由多个活跃 episode 合成的当前多情绪视图；不是历史事实。
4. **EmotionMemoryLink（关联边）**：将 event 与 raw_id / memory_id / task_id 关联，支持一对多、多对多和来源追踪；不能把情绪全文复制进 memory 正文。
5. **EmotionRecallSignal（可选召回信号）**：仅作为低权重、可解释的辅助因子；不得覆盖事实相关性、时间、权限、scope、tombstone 等硬约束。

### 4.2 推荐字段（逻辑契约，不是已实施 schema）
- event：`schema_version, event_id, occurred_at, recorded_at, experiencer=self, actor, source_kind, source_ref, cause, target, confidence, appraisal_version`
- emotions[]：`emotion_id, label, family(optional), intensity(0..1), confidence(0..1), valence(-1..1), arousal(0..1), target, evidence_ref(optional)`
- episode：`episode_id, emotion_event_id, started_at, updated_at, intensity, half_life, status, target`
- link：`emotion_event_id, raw_id?, memory_id?, task_id?, association_kind, temporal_precision(exact|nearest|window_fallback), confidence, created_at`

所有时间统一毫秒 epoch；所有数值在边界处校验；保留原始来源引用；schema_version 版本化。字段可在实现审查后调整。

### 4.3 兼容原则
- 保留现有 `emotion`、`label`、`intensity` 等单值 API；旧调用方继续可用。
- 新增 `emotions[]` 权威字段；primary label 仅为兼容展示，不代表其他情绪被丢弃。
- 六基础情绪、图中组合是参考 ontology，不是封闭 enum；允许新情绪、混合情绪和正负并存。
- 区分“汐自己的情绪”与“汐对主人/工具/事件的情绪目标”；不能把用户情绪直接写成汐的情绪。
- LLM 评估必须区分模型推断与明确自述；低置信结果保留不确定性。
- 情绪不参与事实真伪判断，不得作为操控用户的筹码。

### 4.4 记忆生命周期
- “安全区/消散区”定义为保留/激活/检索状态，不是物理删除机制。
- 原始对话、永久档案、历史 EmotionEvent 不因衰减而删除或改写。
- 消散可以降低摘要细节、激活度或召回优先级；不得破坏 source raw 或不可变事件。
- 再次调用记忆可更新激活状态/产生新事件，但不得覆盖旧情绪快照。
- 历史情绪按 event occurred_at 查询；禁止用当前 state 覆盖历史。

### 4.5 召回与注入
- 第一阶段只做 shadow 计算/日志，不改变召回结果或注入。
- 后续可在满足 scope、权限、tombstone、事实相关性门槛后，加入小幅、可解释的辅助权重。
- 情绪匹配不得单独使无关记忆进入 top-k；不得突破注入字符预算。
- 对照评测必须证明事实准确率不下降，且情绪匹配带来可测收益后才可考虑启用。

## 5. EI-0..EI-5 阶段路线

| 阶段 | 内容 | 验收门槛 |
|---|---|---|
| EI-0 | 逻辑契约、兼容矩阵、事件/episode/link/state 边界 | GPT/DSH审查通过；无 schema/行为歧义 |
| EI-1 | 纯函数多情绪合成；多 episode 不再丢失 | 单测覆盖正负并存、重复标签、过期、低置信、确定性 |
| EI-2 | Appraisal 多标签输出和解析 | shadow 对照旧单标签；无效输出安全回退 |
| EI-3 | Persona↔Memory 情绪事件关联 | raw/episode/task 可追溯；时间精度可区分；无历史污染 |
| EI-4 | 关系与成长反思 | suggest-only；低置信不写长期人格 |
| EI-5 | 隔离测试、渐进启用与回滚 | fixture/兼容/迁移/回滚全通过；生产启用另行授权 |

## 6. 建议优先级与尚待决定
1. 先完成 EI-0 契约复核，不立即改源码或 DB。
2. EI-1 先纯函数、零迁移、保留旧 API。
3. EI-2 先 shadow mode，不改变表达/注入策略。
4. EI-3 先只读关联设计，再做隔离 fixture。
5. 不把 P0 staging 与 EI 开发互相阻塞；P0 plan v5 PASS，但 staging 仍等待负责人单独决定。

## 7. 本轮验证边界
- GitHub 静态源码审查：已完成（上述指定文件/行段）。
- Persona tests：NOT RUN。
- Memory tests：NOT RUN。
- DSHA runtime / E2E：NOT RUN。
- 生产 DB：未连接；无写入。
- staging / host / exporter：NOT RUN。
- 生产部署/重启：NOT RUN。
