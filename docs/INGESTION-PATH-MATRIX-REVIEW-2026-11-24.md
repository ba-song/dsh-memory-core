# 记忆写入路径矩阵复核记录

日期：2026-11-24 UTC  
仓库：`ba-song/dsh-memory-core`  
分支：`fix/p0-1-trusted-handoff-continuity`  
复核对象：`docs/INGESTION-PATH-MATRIX.md` 及对应当前分支源码  
性质：只读代码复核记录；不改变运行时行为

## 1. 结论

现有《记忆写入路径矩阵》与本次抽查的主要代码路径总体一致。当前最重要的风险不是某个字段完全缺失，而是不同路径的“来源定位”“原话证据”“派生关系”“用户纠错”和“会话身份”容易被混为一谈。

本次复核没有发现足以支持把现有来源标记提升为“事实已证实”的依据。继续保持以下边界：

- `source_msg_id` / `sourceKey` 是定位键，不是宿主认证的会话身份或用户授权。
- quote gate 证明的是引文与给定 sourceText 的字面关系，不证明派生命题真实。
- `confidence` 不是真实性概率。
- 缺失 `meta.provenance` 的历史、迁移和手工记录保持 unknown/legacy。
- 不因本次复核执行 schema migration、真实数据回填、召回/衰减/遗忘调整或运行时接入。

## 2. 已核对的实现行为

### 2.1 显式“记住”入口

代码：`lib/ingest/explicit.js` → `insertMemory`

- 生成 `explicit:<sessionId>:<seq>` 作为 sourceKey，并写入 `meta.sourceKey`。
- 将调用方提供的 `at` 作为 sourceTs；sourceText 使用本轮原始 text。
- 使用 `provenanceMode: 'session'`，由统一写入入口执行 quote 解析。
- 当前没有把独立的 `source_session_id` 传入 memories 行；sessionId 只是被编码进 sourceKey。

复核判断：矩阵对此描述准确。测试应明确断言 sourceKey 不等于独立 session identity。

### 2.2 P4 规则抽取与 LLM 兜底

代码：`lib/ingest/p4.js`、`lib/extract/pipeline.js`、`lib/extract/llm.js`

- 规则路径和 LLM 兜底共用 `ingestCandidate`，不会由 LLM 直接绕过质量门、查重/冲突流程写库。
- P4 sourceTs 默认使用调用时间；sourceText 未显式传入时回退到本轮 text。
- LLM 只有在候选通过后置检查后才进入共用写入路径；候选 quote 被传入逐字校验。
- P4 的 sourceKey 由上游传入。当前可见调用链没有因此建立独立的 source_session_id。
- 合并候选以 `status='merged'` 保存；待核实冲突候选为 `pending`，不应在诊断中归一为 active。

复核判断：矩阵的共用写入路径描述成立。测试需覆盖规则/LLM 两个入口最终遵守同一 quote gate，以及 merged/pending 状态不会被误报为 active。

### 2.3 统一写入入口

代码：`lib/store/memories.js`

- `insertMemory` 是 memories 表写入入口，并在同一事务内更新 FTS。
- 只有调用方传入 `provenanceMode` 时才执行 quote gate；既有未传该参数的写入路径不自动获得 provenance 标签。
- gate 通过后，provenance 被写入 `meta.provenance`；confidence 可能按 gate 的 confidenceFactor 调整。
- 表写入字段包含 source_msg_id、source_ts、source_file、extractor_version、source_channel、source_ref，但当前列定义没有独立 source_session_id。
- `updateMemory` 有 revision CAS 与历史修订保存；这属于记忆修订路径，不会自动补齐原始来源身份。

复核判断：统一写入入口本身不能替上游补证据。任何后续 DTO/schema 设计都应把“调用方未提供”与“经验证为空”区分开。

### 2.4 离线迁移

代码：`lib/ingest/migrate.js`

- 事实卡、便签、聊天流水摘要和 handoff 内容通过合成 sourceKey 与 sourceFile 进入迁移候选。
- `applyAll` 写入 sourceFile、sourceMsgId、extractorVersion 和 `meta.migratedAt` / `meta.sourceKey`。
- 当前迁移调用没有传 sourceText、quote 或 provenanceMode，因此不会由本次 quote gate 证明这些迁移内容是原话。
- 未传 confidence 时，统一写入入口采用默认值；该默认数值不能解释为事实真实性概率。
- 聊天流水迁移写入的是摘要/选取句组合，不应描述成完整原话逐字记忆。

复核判断：矩阵对迁移路径的弱证据判断成立。迁移记录应保持 legacy/unknown 语义，不得因有 sourceFile 或 sourceKey 就升级为 verified。

### 2.5 原话归档

代码：`lib/ingest/archive.js`

- 原话归档与 memories 派生记忆是两条不同的数据路径。
- 归档事件会写入按日期/会话片段组织的 Markdown 文件，并维护 raw_meta / raw_fts 等索引数据。
- 撤回通过 tombstone 使原话不再被召回；不能把归档行存在等同于当前可读取或可授权读取。
- 归档中可记录用户、自身、工具、错误、上下文等多类事件；并非每一行都是用户原话或可作为记忆事实的证据。
- 归档保留期清理会删除超出保留期的日期目录；旧 locator 不保证原文仍可取回。

复核判断：恢复工作流必须按角色、事件类型、撤回状态、保留状态和访问权限过滤归档证据；不得把 raw archive 全量视为用户确认事实。

### 2.6 日记与事实卡

代码：`lib/diary/store.js`、`lib/facts/edit.js`

- 日记是独立 Markdown 文件，具备原子、不覆盖写入语义；当前不写 memories/raw_meta，也不自动参与普通记忆检索、摘要或注入。
- 事实卡是人工维护文本文件，写入前保留有限备份；它不是带逐条原话证据的 memories 行。
- 日记作者标记为 self，日记内容属于汐的自我叙述；不能直接等同于用户陈述或用户确认的共同经历。

复核判断：矩阵把二者列为独立路径是正确的。未来如需用于恢复，必须通过明确授权的只读适配器接入，并保留其证据类型，不得把日记叙述改标为用户原话。

## 3. 本轮应加入的测试覆盖

以下是下一轮测试任务清单，不代表这些测试已经新增或通过：

1. 显式入口：验证 sourceKey、sourceTs、quote/provenance 写入结果；确认不存在独立 source_session_id 时诊断为缺口。
2. P4 规则入口：验证默认 sourceText 回退、本轮 quote gate、sourceKey/sourceTs 传递。
3. LLM 入口：验证模型候选不能绕过 P4 共用写入路径，错误 quote 被拒绝。
4. 合并/冲突：分别验证 merged、pending、active 状态被原样保留，不把非 active 行当作当前有效事实。
5. 迁移入口：验证 sourceFile/sourceKey/migratedAt 存在时，缺少 provenance 仍诊断为 legacy-unknown；不得误报 verified。
6. 手工工具写入：分别覆盖 source_text、仅 source_quote、两者皆无三种输入，验证对应 provenance 等级与 confidence 调整。
7. 主人纠错：验证 correction 标记本身不构成原始消息引文或用户确认来源链。
8. 原话归档：验证用户/汐/工具/系统事件角色区分、tombstone 过滤、过期/缺失来源分类。
9. 日记与事实卡：验证它们不被当作 memories 表写入行；未来只读适配器必须保留 diary/self 与人工事实卡的来源类型。
10. 统一写入入口：验证未传 provenanceMode 的旧路径不会因写入成功而被隐式标成 verified。
11. 诊断器：验证 source_session_id 的存在也不能单独证明宿主认证或用户授权。
12. 恢复规划器：验证 denied/expired/missing 证据不进入可读证据列表，且 planner 不执行 I/O 或写入。

## 4. 继续推进顺序

1. 先实现上述测试中不需要设备、真实数据库或真实用户数据的部分，优先覆盖显式、P4/LLM、迁移、手工写入和 correction。
2. 再补 archive 的 fixture 测试，验证角色、撤回和过期边界。
3. 在测试稳定后，形成统一来源 DTO/schema 草案；先纯函数和 fixture，不做迁移。
4. 最后才设计只读 archive/diary adapters 与 dry-run recovery 的连接；仍然遵守现有 owner/session 授权边界。
5. 真实数据回填、schema migration、自动恢复写入、召回/衰减/遗忘行为变更、生产部署和设备操作仍需另行授权。

## 5. 本轮范围与未做事项

本轮仅复核当前分支可见源码与现有矩阵，并记录测试缺口。没有运行本地测试，没有扫描真实用户数据库，没有读取或修改 DSHA 设备数据，没有写入真实记忆，没有改动运行时配置，也没有合并或部署 PR。
