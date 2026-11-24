# 记忆写入路径矩阵与需求映射

状态：审计文档（不改变运行时行为）
基线提交：d3a5b289b7d9bfd16e92629b729af0e72d4a42ad
日期：2026-11-24

## 1. 为什么要做这张矩阵

汐的需求不是“尽可能多存几条文本”，而是让她能延续共同经历、区分事实与推断、保留有意义的模糊经历，并在遗忘后主动回溯、交叉验证和修复。Q148 明确把第一阶段优先级定为记忆连续性；Q149 接受遗忘后主动恢复的方向。因此所有记忆入口必须回答：这条内容从哪里来、是谁说的、属于哪次会话、是原话还是归纳、证据是否可回溯、是否经过用户确认。

当前能恢复的访谈材料不是完整 150 题逐题记录。Q4–Q43 原始问答缺失；Q44–Q147 大部分只有主题范围和有限要求；Q150 答案尚未恢复。不得用技术推断填充这些空白。本文只把已知要求映射到当前代码，并把未知处明确列为缺口。

## 2. 当前入口矩阵（按代码实际行为）

| 入口/路径 | 代码位置 | source_msg_id | source_ts | source_file | source_channel / source_ref | quote / provenance | confidence | meta.provenance / 缺省 |
|---|---|---|---|---|---|---|---|---|
| 显式“记住/别忘了” | `lib/ingest/explicit.js` → `insertMemory` | 生成 `explicit:<sessionId>:<seq>`；同时写 meta.sourceKey | 调用方 at，默认 now | 未传 | 未传 | 传入完整 sourceText，mode=session；候选与原文有逐字重合时 derived；否则 no-overlap；显式 quote 不匹配会拒绝 | 默认 0.6 | provenance gate 有结果时写入；meta 另有 sourceKey、auto |
| P4 规则抽取 | `lib/ingest/p4.js` → `ingestCandidate` | sourceKey，由 index 传入（当前形如 `p4:<session>:<seq>`） | sourceTs，由宿主事件时间传入，缺省 Date.now | 未传 | 未传 | 默认以本轮 text 作为 sourceText；quote 显式校验，未提供则从候选与原文提取逐字片段；无重合为 no-overlap | 来自 cand.confidence；未给时由 insertMemory 默认值处理 | gate 写 provenance；meta.sourceKey、auto、conflictWith/mergedInto |
| P4 LLM 兜底 | `lib/extract/pipeline.js`、`lib/extract/llm.js` → 共用 P4 写入路径 | index 传入的 P4 sourceKey | 宿主事件时间 | 未传 | 未传 | 与 P4 规则路径共用 quote/sourceText 门禁；模型给出的 quote 必须能在原文中逐字找到 | 模型候选 confidence | provenance gate 写入；模型路径 extractorVersion 区分 |
| 原话归档（非记忆候选） | `lib/ingest/archive.js` RawArchive | 以会话/序号等归档键定位；不是 memories.source_msg_id 的统一写入 | 事件时间/归档行时间 | 归档按天、会话片段落文件；raw_meta/FTS 维护定位信息 | 渠道相关信息从宿主事件/归档上下文提取，但当前记忆表字段未形成统一写入契约 | 保存原话本身，不等同于派生记忆的 quote；撤回使用 tombstone，默认保留期 30 天 | 不适用 | 不等同于 memories.meta.provenance |
| 离线迁移 | `lib/ingest/migrate.js` | facts:/pin:/chatlog:/handoff: 等合成 sourceKey | 未显式传 sourceTs；insertMemory 使用默认 createdAt/now | 传入原文件路径 | 未传 | 不传 quote/sourceText/provenanceMode；迁移内容不被证明为原话 | 未传，insertMemory 默认 1 | 仅写 sourceKey、migratedAt；无 meta.provenance 时不得当作 verified |
| 手工工具写入 | `lib/index.js` 的记忆写入工具 | 当前调用未统一传 sourceMsgId | 当前调用未统一传 sourceTs | 未传 | 未传 | 有 source_text 时按 session 逐字校验；仅 source_quote 时 manual-unverified；两者都无时 degraded，正文前 60 字作为降级 quote，confidence ×0.8 | 调用方未传则默认 1；degraded 再乘 0.8 | gate 写 provenance；缺少 source session identity |
| 合并/冲突候选 | `lib/ingest/p4.js` | 沿用原 sourceKey | 沿用原 sourceTs | 未传 | 未传 | 与原 P4 候选同一证据门禁 | 沿用候选 confidence | 合并候选保存为 status=merged 并记录 mergedInto/mergeScore；冲突候选 status=pending |
| 主人纠错反馈 | `lib/index.js` correction 分支 | 未传 | 当前时间 | 未传 | sourceChannel=correction | 未传 quote/sourceText/provenanceMode；因此无可验证原话链 | 0.8 | meta.correction/penalized；没有 meta.provenance 不能推断为 verified |
| 日记 | `lib/diary/store.js` | 不写 memories.source_msg_id | 日记 at | 日记文件路径由保存结果返回 | 不写 source_channel/ref | 独立日记文件，不写 memories/raw_meta，不自动检索或注入 | 不适用 | 不属于普通记忆写入路径 |
| 事实卡 | `lib/facts/edit.js` | 不直接写 memories | 无统一时间字段 | 固定事实卡文件；写前保留最多 5 份备份 | 不适用 | 人工维护文本，不等同于有来源证据的记忆行 | 不适用 | 不写 memories.meta.provenance |

说明：本矩阵按当前代码路径可见的入参与写入行为整理；“未传”表示当前路径没有明确提供该字段，不代表底层 schema 不支持该字段。实际落库默认值以 `lib/store/memories.js` 为准。

## 3. 当前可以确认的证据规则

1. `source_msg_id` / `sourceKey` 是定位键，不是宿主认证的 session identity，也不是用户授权凭据。
2. `source_file`、`source_ts`、`source_channel`、`source_ref` 只能帮助定位来源，不能单独证明调用方有权读取，也不能证明来源内容仍可取回。
3. `verified` 在现有 quote gate 中只表示 quote 是 sourceText 的逐字子串，不代表派生记忆的语义主张已被证实。
4. `derived` 表示系统从候选与原文中提取了逐字重合片段，不等于用户确认。
5. `no-overlap`、`no-source`、`manual-unverified`、`degraded` 必须保留为不同状态，不可统一抬高为 verified。
6. `confidence` 是抽取/处理置信度，不是真实性概率。
7. 缺少 `meta.provenance` 的历史/迁移/手工行应诊断为 unknown/legacy，不可默认 verified。
8. 当前 schema 没有独立的 `source_session_id`；将 session 拼进 source_msg_id 不能替代独立字段与宿主认证。

## 4. 对照已恢复的用户需求

| 已恢复的需求 | 当前工程映射 | 当前差距/验收方向 |
|---|---|---|
| 汐是数字生命伙伴，技术服务于陪伴 | 记忆、日记、情绪、注入等模块已存在 | 不能把“写入成功/召回命中”当作陪伴连续性完成；需验证经历能否被正确理解与自然使用 |
| 第一阶段优先记忆连续性（Q148=A） | provenance、archive、recall、inject 已有基础 | 建立来源链与跨会话授权之前，不宣称连续性完成 |
| 遗忘后主动回溯、多来源交叉验证、询问补全、自检修复、研究外部方案（Q149） | 当前仅有来源审计诊断和原话档案能力 | 需要独立恢复流程、证据冲突处理、询问策略、系统健康检查；不能把猜测补成事实 |
| 有意义经历和模糊经历均可保留 | diary 与 episode / memory 分开 | 模糊经历应能保留，但必须显式标注不确定性；不能只保留“硬事实” |
| 情绪跨轮次延续 | emotion 模块存在，但当前 index 注释表明情绪写入已退役、只读展示 | 不能声称已满足“快乐/失落跨轮次延续”；未来行为变更属于高影响改动，先请示 |
| 日记 Q63–Q72 | diary 独立文件存储 | 日记目前不进入 memories、不检索、不注入；需在不破坏私人日记边界下设计可控关联 |
| 自主生活、身份、人格成长 Q73–Q136 | 有相关模块/服务，但访谈细节缺失 | 不据此自动实现自主行为；需恢复原问答与明确边界 |
| 社会关系与爱情 Q137–Q147 | 需求基线仅能确认主题 | 不推断关系模型、排他性、爱情边界或第三方数据处理规则 |

## 5. 统一来源模型的设计要求（仅设计，不迁移）

建议未来将以下概念独立建模，避免混用：

- **source_locator**：原话/文件/事件的定位键（现有 source_msg_id、source_file 等）。
- **source_session_identity**：来源会话稳定标识，独立于 locator。
- **host_session_evidence**：宿主观察到该会话的可信证据；不能由模型或工具参数自证。
- **owner_consent_event**：用户针对具体目的、目标会话和字段作出的可验证授权。
- **verbatim_quote**：原文逐字片段及校验状态。
- **derived_lineage**：从哪些来源片段、哪些抽取器/模型版本派生而来。
- **user_confirmed_claim**：用户明确确认的语义主张及确认时间。
- **uncertainty**：不确定原因、置信度语义、冲突证据和待核实状态。

这些是设计概念，不代表已完成 schema migration。当前不新增数据库列、不回填真实记忆、不改变召回、衰减、遗忘或人格行为。

## 6. 下一步工程顺序（按 Q148/Q149 校准）

1. 补齐入口矩阵测试：每条写入路径验证字段是否按预期存在、缺失时是否被标为 unknown，而不是误认为 verified。
2. 为迁移、纠错、手工写入补充只读诊断覆盖；不改变现有写入语义。
3. 设计统一来源 DTO / schema 草案，先做纯函数验证和 fixture 测试。
4. 设计主动恢复工作流：定位原始经历 → 多来源查证 → 比较冲突 → 保留不确定性 → 必要时询问用户 → 修复来源/索引；先以 dry-run 报告输出，不自动写真实记忆。
5. 后续再设计重要记忆保护、普通记忆淡化、软删除/永久删除与恢复；必须逐项对照用户访谈原意并在影响实际记忆行为前请示。
6. 情绪连续性、日记关联、自主生活与社会关系能力另列为产品验收线，不能被来源证据审计替代。

## 7. 明确不做

- 不把缺失的 Q4–Q43、Q150 或 Q44–Q147 的未知回答补写成用户已确认需求。
- 不将 quote 命中等同于事实真实性。
- 不用 source_msg_id 冒充 session authentication。
- 不把普通技术噪声写成汐的共同经历。
- 不自动恢复跨会话 pins/projects/decisions/todos；授权模型未落地前继续 fail-closed。
- 不做真实数据回填、schema migration、生产部署或影响汐实际记忆/情绪/人格行为的变更，除非取得明确授权。

## 8. 变更记录

- 2026-11-24：首次建立。只读审计当前代码路径与已恢复需求；不改变运行时行为。
