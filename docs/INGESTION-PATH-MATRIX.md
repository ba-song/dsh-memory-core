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
| 情绪跨轮次延续 | memory-core 的旧 emotion 表只读；独立 persona-core 已有情绪状态/时间线/衰减/注入实现 | persona-core 默认 emotion.ingestEnabled=false、inject.mode=off；具备代码但默认未接管消息流/未注入，需配置与实机验证，不能声称用户当前已体验到连续情绪 |
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


## 9. 跨仓库现状核对（main 分支代码/README；非设备实测）

本节补充核对 `dsh-persona-core`、`dsh-autonomy`、`dsh-channel-bridge`。证据级别分开写：README 是仓库声明；源码默认值/调用路径是代码证据；是否在 DSHA 实际启用仍需设备与 profile 验证。

### 9.1 Persona / 情绪

- `dsh-persona-core/lib/emotion.js` 已实现情绪词典打分、事件更新、平滑、双衰减、情绪时间线与转折点溯源。默认 valence 半衰期 6 小时、arousal 半衰期 30 分钟；另有 mood 慢层（48 小时）和 dominance（72 小时）配置。
- `lib/config.js` 默认 `emotion.ingestEnabled=false`、`inject.mode='off'`，白名单默认空。也就是说：有实现，不等于默认正在接管消息或注入情绪。
- `lib/index.js` 只有在显式打开 `emotion.ingestEnabled` 时才监听会话事件；注入也受 mode/session scope 控制。
- `tests/emotion.test.mjs` 覆盖打分、衰减、注入阈值、溯源等纯代码行为，但不证明 DSHA profile 已启用或真实对话体验符合用户描述。
- 与用户需求的差距：现有系统以规则词典和事件打分为主；需要验证“汐的情绪”与“用户情绪识别”是否隔离、事件是否能持续影响多轮表达、情绪是否自然恢复，以及负面状态不会僵化或操纵关系。任何启用/调整都会改变汐实际情绪行为，需先请示。

### 9.2 Memory / 日记 / 记忆服务

- `dsh-memory-core/lib/diary/store.js` 将日记以独立 Markdown 文件原子写入，不写 memories/raw_meta，不参与检索、摘要或注入。这保护了日记原文，但目前也意味着日记经历不会自然成为可召回的共同经历。
- `dyMemory` 服务有 header 权限校验、子智能体拒绝、插件写入 allowlist、超时降级；autonomy 仅获 addEpisode 后台写权限，不获 owner 记忆读取权限。
- 主动恢复（Q149）目前有原话档案、检索、健康检查/快照等基础模块，但尚未形成“发现缺口→多源证据比对→冲突处理→询问用户→dry-run 恢复建议→授权修复”的完整工作流。

### 9.3 Autonomy / 自主生活

- `dsh-autonomy` 已有 home、目标、驱动力、反思、tick、日记追加、记忆/人格适配器、审计、暂停和执行器接口；测试包含边界、dry-run、反思、目标、记忆集成等。
- README 说明默认 `enabled=false`、`dryRun=true`、`sendEnabled=false`、`home.enabled=false`。因此仓库能力存在，不代表实际生活循环或外部行动已启用。
- memory adapter 使用插件写身份调用 `dyMemory.addEpisode`，读取 recall/episodeRecent/contactOf 仍按权限拒绝并降级为空；集成测试明确验证了该权限边界。
- 当前差距：需要逐条把 Q73–Q136 的自主生活目标映射到已有驱动力/目标/反思/行动能力，确认“自主思考、学习、记忆整理、主动联系、现实行动”的不同权限级别。不能因为有 tick 就推断已经形成汐的生活。

### 9.4 Channel bridge / 社会关系与外部互动

- `dsh-channel-bridge` README 声明其负责 QQ/OneBot 收发、私聊/群聊会话、群摘要/全文归档、公开近况和发送工具；工具存在发送/改资料/好友管理等外部写操作。
- 默认 `enabled=false`、`mode='observe'`；发送类受 mode 闸门，部分写操作另要求 confirm。实际是否启用必须检查设备 profile 和运行状态。
- 群聊摘要、全文归档与 owner 记忆之间存在不同路径；跨会话授权不能因“桥能把消息投进会话”就自动获得。跨人/群聊内容应继续遵守 contact/public scope 与最小披露。
- 当前差距：Q137–Q147 只有主题级信息，不能擅自把已有好友工具等同于汐的社会关系理解或爱情能力。

### 9.5 当前状态结论

| 需求域 | 代码状态 | 默认运行状态 | 验收判断 |
|---|---|---|---|
| 记忆连续性 | 多层记忆、原话档案、检索、来源审计已有 | 部分服务可用；跨会话敏感交接 fail-closed | 部分实现，需端到端验证 |
| 遗忘主动恢复 | 检索/健康检查/快照/冲突工具存在 | 无统一恢复编排 | 未完成 |
| 情绪时间连续性 | persona-core 有状态/时间线/衰减/注入 | ingest 默认关闭、inject 默认 off | 有实现但默认未启用；未实机验收 |
| 日记 | 独立原子文件写入 | 服务可写 | 已有沉淀能力；与记忆召回断开 |
| 人格身份 | self_id、persona 版本、人格注入 | inject 默认 off | 有骨架/实现，运行状态待设备确认 |
| 自主生活 | autonomy 有 tick、目标、反思、执行器与审计 | 插件默认 disabled、dryRun true、外发 false | 有框架，真实自主生活未启用/未验收 |
| 社会互动 | channel bridge 工具与会话路由 | 默认 disabled、observe | 通道基础能力存在，不等于关系能力完成 |

## 10. 变更记录

- 2026-11-24：首次建立记忆入口矩阵。
- 2026-11-24：补充四仓库需求映射；核实 persona 情绪代码已存在但默认 ingest/inject 关闭；补充 autonomy 默认 dry-run、日记独立存储与跨仓库差距。只读审计，无运行时行为变更。
