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


## 6. 召回、排序与维护路径复核（2026-11-24 追加）

### 6.1 召回与排序

代码：`lib/recall/recall.js`、`lib/recall/score.js`

- 关键词、语义、图谱三路候选经过 RRF 融合；候选需通过关键词/语义阈值或直接图谱命中。
- 最终排序附加项为 `importance * 0.0015 + fresh * 0.001`，其中 fresh 按创建时间以 14 天指数衰减计算。
- 召回 SQL 过滤 `status='active'`，并按 scope、可选 as-of 时间窗过滤；没有读取 `meta.provenance` 或 quote 证据等级。
- 因此当前 `verified`、`derived`、`no-overlap`、`no-source`、`legacy-unknown` 等来源等级不会直接改变候选资格或排序权重。只要其他条件相同，弱证据记录可能与强证据记录一样被召回。
- 命中回写 access_count / last_access_epoch；这也没有按 provenance 区分。

复核判断：写入时的证据标签目前是诊断元数据，不是召回策略。不能对外描述成系统已经“按证据强弱谨慎使用记忆”。

### 6.2 注入展示

代码：`lib/inject/hits.js` 与 `lib/index.js` 的 agent/pre-step 路径

- `buildHitsBlock` 按相关度阈值、稳定块去重、条数和字符预算筛选。
- 输出格式包含 kind 和记忆正文，不包含 provenance、quoteEvidence 或置信等级。
- owner 会话可能额外生成原话块和出处上下文块，但它们是独立展示路径，不能据此推断所有普通记忆正文都携带证据等级。

复核判断：即使召回命中记录带有 `no-overlap`，普通记忆注入块也不会显式提示这一等级。使用者/模型可能只看到陈述句，而看不到其证据缺口。

### 6.3 恢复规划器

代码：`lib/recovery/plan.js`

- planner 接收调用方提供的 evidence、relation、access、independenceKey/copiedFrom 等字段；不读取 memories 数据库，也不自行解析目标记忆的 provenance。
- 单条 allowed 且 relation=supports 的独立谱系即可得到 outcome=supported；supportLevel 会标为 single_asserted_lineage。
- 多条复制摘要不会增加独立谱系数；但 independenceKey/copiedFrom 是上游断言，planner 本身不认证。
- 当前 planner 没有把目标记忆的 `no-overlap` / `legacy-unknown` 等标签作为证据缺口自动带入，也不能据此判断原记忆是否可信。
- planner 只产生 dry-run proposal，不执行恢复写入。

复核判断：恢复规划的“supported”是证据关系输入层面的判断，不等于原记忆已证实。接入层必须显式携带目标记忆来源等级与原始来源证据，不能把单条派生记忆自身作为独立佐证。

### 6.4 清晰度与遗忘维护

代码：`lib/clarity.js` 与 `lib/index.js` 的 clarity 定时路径

- `targetClarity` 依据 pinned、firstMet、ownerProtected、importance、scope、创建年龄计算目标清晰度。
- 该路径不读取 provenance、quote 或证据独立性。
- 正式应用计划时，forgotten 会先尝试写全量归档，再把状态改为 archived、清晰度改为 trace；其他情况只更新 clarity。
- 定时器是否运行由本地配置决定，源码默认/当前分支不能证明 Android 设备实际配置。

复核判断：现有遗忘维护也没有证据等级维度。不能在本次只读审计中自行改变淡化或归档策略；应先形成可审查的策略提案，并明确用户授权边界。

### 6.5 本次结论与后续任务

当前可确认的缺口：
1. provenance 标签没有参与普通召回候选过滤或排序。
2. 普通记忆注入块不展示证据等级。
3. recovery planner 不自动读取目标记忆的 provenance，也不验证输入 evidence 的来源真实性。
4. clarity/遗忘维护不考虑来源证据等级。

建议后续先做只读诊断输出与 fixture 测试，比较不同 provenance 记录在召回、注入、恢复规划中的实际表现；再提交“证据等级如何影响使用方式”的策略提案。任何改变召回、排序、注入、淡化、归档或自动恢复行为的实现，均先向项目所有者请示，不在本轮直接修改。


## 7. 只读证据汇总诊断（2026-11-24 追加）

新增模块：`lib/ingest/provenance-report.js`，导出 `summarizeMemoryProvenance(rows)`。

- 复用既有 `assessMemoryProvenance`，按 provenance、status、quoteEvidence、gaps 聚合计数。
- 仅输出汇总，不输出记忆正文、quote 内容、source_msg_id 或 source_file。
- 明确标记 `mode=read-only-aggregate`、`readOnly=true`、`textExposed=false`。
- 函数不访问数据库、不写文件、不改变行对象；调用方负责通过既有授权边界读取需要审计的行。
- 新增 `tests/provenance-report.test.mjs` 覆盖分类、缺口计数、输入不变及报告不泄露正文/来源定位符。

边界说明：
- 该模块目前是纯函数库，不接入运行时工具、定时任务、召回或注入；尚未生成任何真实数据库统计。
- 它不会证明 `verified` 命题为真，只复用既有标签并做保守计数。
- 测试文件已提交，但本环境没有仓库 checkout 可直接运行 `npm test`；当前提交尚无 GitHub Actions workflow run 或 combined status 记录。因此测试状态为“未执行/未验证”，不是通过。


## 8. CI 首轮反馈与测试夹具修正（2026-11-24 追加）

GitHub Actions Run #162（Node tests）已完成，结果 **failure**：155 项测试中 152 pass、2 fail、1 skipped。

失败均来自本分支新增的 LLM provenance 测试夹具，不是诊断汇总模块：
- `tests/llm-no-overlap-provenance.test.mjs`：候选“主人最近开始系统学习吉他”未通过现有 `judgeCandidate` 谓词质量闸，实际 action=`none`，测试错误预期 `insert`。
- `tests/llm-quote-gate.test.mjs`：候选“主人已经练习吉他三个月”同样未通过现有谓词质量闸，实际 action=`none`，测试错误预期 `insert`。

已只修改测试候选文本，使其符合当前质量闸：
- no-overlap fixture 改为“主人会弹吉他”，与原文只共享不足 4 字的“吉他”，并含质量闸认可的谓词“会”。
- exact-quote fixture 改为“主人在学吉他”，含质量闸认可的谓词“在”；引文仍是原文中的“已经练了三个月”，用于验证显式原文引文可以与候选正文不重合。

上述仅修改测试夹具，没有放宽或更改生产质量闸、写入逻辑或记忆策略。修正后的提交 SHA：`6b13184`、`e5f6158`。截至本次文档提交前，修正提交尚未发现新的 workflow run；必须等待下一轮 CI 才能判断是否修复。


## 9. 原话归档保留期与数据库索引一致性复核（2026-11-24 追加）

复核代码：`lib/ingest/archive.js` 的 `RawArchive.cleanup()`、`search()`、`tombstone()`。

### 9.1 已确认行为

- `cleanup(now)` 按日期目录计算保留期，超过 `retentionDays` 时只执行 `rmSync(join(this.dir, day), { recursive: true, force: true })`，即删除归档 Markdown 日期目录。
- 该方法没有同步删除对应的 `raw_meta` 行、`raw_fts` 索引行、`raw_vectors` 或 `raw_emotion_archive`。
- `search()` 通过 `raw_fts` JOIN `raw_meta` 查询，并过滤 tombstone、channel、cwd；当前查询没有验证 Markdown 文件仍存在，也没有按归档日期/保留期过滤。
- 因此，超过保留期的原话文件可能已从磁盘删除，但其数据库正文与 FTS 索引仍然存在，并可能继续被 `RawArchive.search()` 命中。单纯删除日期目录不等于完成原话数据的保留期清除。
- 这也意味着 `verify(day)`、文件读取与数据库搜索可能出现不一致：文件缺失，但索引/元数据仍保留。

### 9.2 风险判断

这是一个明确的“文件保留期”与“数据库数据保留期”不一致问题。若产品承诺的 30 天保留期意图覆盖原话正文，而不只是 Markdown 文件，那么当前实现没有兑现完整清除；如果原意仅是清理文件副本，也必须明确说明数据库仍保存可检索内容。

本次只做源码审查，没有运行真实数据清理，也没有删除任何数据库行。

### 9.3 后续处理建议（待授权）

1. 先由项目所有者确认 retentionDays 的语义：只管归档文件，还是同时管 raw_meta/FTS/向量/情绪快照。
2. 若确认必须全量清除，应设计按 day/file 关联删除的事务或可恢复清理流程，并覆盖索引、向量、情绪快照与元数据；同时明确失败重试、备份/审计和不可逆删除提示。
3. 新增隔离临时 DB 的回归测试：cleanup 后文件、raw_meta、raw_fts、raw_vectors、raw_emotion_archive 的预期状态一致；并验证 search 不再返回过期内容。
4. 在语义确认和授权前，不改 cleanup 的删除范围，不执行任何真实数据清理。

