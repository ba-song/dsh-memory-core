# DSHA「汐」Memory–Persona 联合数据契约 v1.1.1（审查草案）

- 状态：**OWNER-DECISIONS INCORPORATED / READ-ONLY REVIEW REQUIRED**
- 版本：v1.1.1-draft
- 维护仓库：`ba-song/dsh-memory-core`
- 配套实现仓库：`ba-song/dsh-persona-core`
- 负责人：项目负责人（用户）；协调与架构整理：GPT
- 本文性质：联合数据语义与边界草案；不是实施授权，不是生产配置，不代表当前实现已经符合。

> 本文以项目负责人已明确确认的决定为最高依据；将已确认语义与待审查的字段/实现建议分开。若本文与现有代码冲突，以本文作为审查目标，不得为了迁就代码而改写已确认的用户决定。

## 0. 范围与权限

本契约统一 Memory、Persona/EI 与 Channel Bridge 在身份、会话、经历归属、历史记忆、有效性、证据可信度及自主补全方面的语义。

本轮仅进行文档审查和只读一致性核对：
- 不启动 Memory v6、Persona v3 或 EI-2A。
- 不修改业务源码、测试、数据库、插件配置或生产数据。
- 不部署、不重启、不合并任何实现分支。
- 审查报告只能写入各自审查分支/PR，不得直接写 main。
- 没有源码/测试/运行证据，不得标记 PASS。
- 生产默认只读；未来任何生产状态变化仍须项目负责人单独明确授权。

## 1. 核心概念必须分离

### 1.1 发言者、经历归属、会话归属

三者回答不同问题，禁止互相推导：

- `speaker_id`：谁说了这句话。
- `experiencer_type` / `experiencer_id`：这段经历、感受或事实属于谁。
- `conversation_id` / `session_id`：这条消息发生在哪个会话容器/运行会话中。

会话归属不能自动决定经历归属；发言者也不必然是经历主体。例如，群成员发言“我今天很难过”，speaker 是该成员，经历主体也是该成员，会话属于群聊；不能把经历归给群本身或汐。

### 1.2 经历主体类型

项目负责人已确认严格区分：
- `self`：汐自身真实发生的经历。
- `owner`：主人本人的经历。
- `third_party`：其他个人或群体的经历。
- `unknown`：证据不足，暂时不能确定。

不得因消息由汐接收、整理、摘要或保存，就将经历归为 `self`。不得因会话属于主人而将其中所有经历归为 `owner`。

建议 ID 命名空间（待跨仓库核对）：
- 汐：`self:<uuid>`，必须是已验证的 canonical ID。
- 主人：`person:owner`（实际 owner 主体 ID 尚待项目负责人提供/确认；不得擅自猜测）。
- 第三方个人：`person:<stable-id>`。
- QQ 群实体：继续作为 `third_party`，ID 前缀 `person:contact:qq:group:<gid>`；不新增 `group` experiencer_type。
- 无稳定成员 ID 的群成员：`unknown`，不能以群 ID 代替成员 ID。
- 空值/无法识别：`unknown`，不得伪造稳定 ID。

`subject` 若保留，只能作为显示文本，不得作为身份主键、身份过滤条件或可信证据。

## 2. 会话层：每个私聊对象、每个群聊独立会话窗口

项目负责人已明确确认：会话隔离不仅是记忆字段要求，必须扩展到会话层。

### 2.1 私聊
- 每一个人的私聊对应一个专属、可持续识别的会话窗口。
- 不同联系人不得共享同一个对话上下文。
- 会话必须有稳定的会话身份；单次运行/连接的 session 实例 ID 与长期会话容器 ID 应区分。
- 私聊消息必须保留实际 speaker 身份；不得因私聊上下文而把第三方经历归给主人。
- 同一自然人在不同平台的账号是否自动合并为同一人，**本版不擅自决定**；默认按平台/账号隔离，只有存在可信身份映射或负责人明确授权时才合并。

### 2.2 群聊
- 每一个群聊对应独立会话窗口；不同群聊之间不得共享上下文。
- 群实体作为会话容器/third_party 实体，不等于群内成员。
- 每条群消息应尽可能保存实际发言成员 ID；成员无稳定 ID 时标记 unknown。
- 群内不同成员的经历分别归属个人；群聊会话本身不成为成员个人经历的 experiencer。
- 群成员加入、退出、昵称变化不应改变群会话的稳定身份；成员身份历史应保留。

### 2.3 会话隔离和检索
- 默认只将当前会话及经明确授权/相关性判定的长期记忆用于当前回复。
- 不得把联系人 A 的私聊原文直接注入联系人 B 的私聊。
- 群聊记忆不能无条件注入其他群聊或私聊。
- 跨会话长期记忆可按主体、权限、相关性检索，但必须保留来源会话与可见性/访问范围。
- 会话上下文隔离不等于所有长期记忆都永久隔离；长期记忆跨会话复用必须经过主体与权限判断。

### 2.4 需要审查但不得擅自冻结的实现细节
请审查并提出兼容建议：稳定 conversation key 的字段组合、channel/account/chat_type/peer_id/group_id 的约束、运行 session 与长期 conversation 的映射、Channel Bridge 的读写责任、群成员身份历史、跨平台账号合并策略。不得在只读审查中修改实现。

## 3. 汐自身身份与 self 写入门禁

- 汐的唯一身份必须是可信、稳定、canonical 的 `self:<uuid>`。
- `selfId()` 只允许返回合法 canonical ID 或 null/明确错误；禁止以 `self:unknown` 作为可写身份。
- DB 不可用、self 缺失、多个 active self、格式非法、证据冲突时，均不得自动创造/猜测身份；应 fail closed。
- `ensureSelf` 不得在无法证明身份时自动生成一个看似有效的新 self。
- `bindingOf(sessionId)` 只有在 binding 已验证、其 persona_id 与 canonical selfId 同源且相等时，才可证明该会话属于汐。
- `roleOf` 的 persona/work 角色、会话类型 private/group/subagent、消息来源 source 均不能单独证明 experiencer=self。
- Memory 写入 self episode 前必须校验 canonical self ID；拒绝哨兵、空值、任意非空字符串及非法格式，建议错误码 `E_PERSONA_IDENTITY_UNKNOWN` / `E_PERSONA_IDENTITY_INVALID`。
- 不得仅凭可被普通 PATCH 修改的 `meta.serviceVersion`、`meta.origin` 或类似字段证明经历属于汐。

### 3.1 可信身份依据
建议由可信写入路径产生专用证据（候选名 `experiencer_evidence`），普通 Memory PATCH 不可修改。证据应可追溯到受信任的运行事件/写入入口，包含来源、产生者、时间及必要的完整性校验。具体存储位置和签名/权限实现待 Memory、Persona 只读评审提出方案。

## 4. 历史记忆保护与新旧规则分界

项目负责人明确要求：不能因过去插件记录功能不完善，让既有历史记忆失去作用。

### 4.1 历史记忆
- 新规则启用前已经保存的历史原始记忆，必须保留原文、历史价值和可回忆/参考能力。
- 不得仅因旧记录缺少新字段（speaker、experiencer、confidence、valid_from_kind 等）而删除、丢弃、整体降级为不可用或从检索中一律排除。
- 历史原始记录可作为可信的历史记忆资料；当原始记录本身可访问且未损坏时，至少可以确认“该原文确实被保存”。其来源类型可标记为 `historical_record`。
- 原文记载的事实、作者身份、精确发生时间、当前是否仍然适用，仍应分别判断；不能从“原文存在”自动推导出“内容永远为真”或“作者/日期已知”。
- 对历史记录缺失的字段，允许汐通过可访问的原始记忆、历史对话、事件关联和其他可靠证据自主补全；无证据时保留 unknown，不得编造。
- 旧记忆的原始正文必须不可被自动补全过程覆盖；补全字段与原文分开保存。

### 4.2 新旧分界
- 必须记录一个明确、可审计的 contract cutover 时间/版本。
- cutover 前历史记录按历史兼容策略保留原有作用；cutover 后新记录严格遵守本契约。
- cutover 的实际时间、数据范围、是否分阶段启用，需在实施前由负责人另行确认；本草案不虚构具体日期。
- 历史记忆缺少精确 valid_from 时，不得编造精确日期。可保留历史可用性，同时将时间精度标注为 legacy/approximated/unknown（具体字段映射待审查）。

## 5. 记忆有效性与时间语义

有效性、可信度、主体归属是不同维度：
- 有效性回答“在某个时间点是否适用”。
- 可信度回答“证据和判断有多可靠”。
- experiencer 回答“经历属于谁”。

建议统一三态判断：`VALID` / `INVALID` / `UNCERTAIN`，由统一 helper/SQL 规则支撑所有注入、检索、合并、摘要与决策入口。

候选 `valid_from_kind`：
- `exact`：有可靠精确起始时间。
- `implicit`：新记录未提供 valid_from，但有合法 created_at，按 created_at 起效。
- `legacy`：旧记录的起始时间精度不足，按经审计的历史近似规则处理。
- `unknown`：无法建立可信时间边界，时间判断为 UNCERTAIN。

候选 `superseded_at`：
- 只有具备可靠替代时间证据时才填写。
- 无替代时间证据不得伪造；应为 UNCERTAIN。
- 被替代的旧记忆应保留，当前视图与 as-of 历史视图必须分别正确。
- 所有实际注入入口统一使用同一有效性语义；不能只修 recall 而遗漏 preference、remembered、session-index、handoff、rules、stable、graph、merge、P4 邻居、daily/weekly 等入口。

### 5.1 历史兼容特别规则
不能将旧记录中曾因插件缺陷被清洗为 NULL/非法的时间简单等同于“无下限、永远有效”。同时也不能因此把原始记忆整体废弃。需通过 cutover、created_at 近似边界和 approximated 标记保留历史可用性，并把时间不确定性如实呈现。具体映射由审查给出建议，实施另行授权。

## 6. 证据来源、验证状态、判断把握：三维分离

项目负责人已确认采用三维分离体系，并确认不确定记忆按用途决定使用范围。

### 6.1 三个维度分别回答的问题
1. `evidence_source`：信息/记忆来自哪里？
2. `verification_status`：目前有何证据支持、确认或反驳它？
3. `confidence_level`：汐对当前判断的把握程度如何？

三者不得合并成一个数值或一个枚举；不得互相自动推导。

### 6.2 候选枚举（语义已定方向，物理字段/精确枚举待审查）
证据来源候选：
- `direct_statement`：当事人直接表达。
- `direct_observation`：可信系统直接观察。
- `historical_record`：历史原始记忆/记录。
- `external_source`：外部资料或第三方来源。
- `inference`：汐根据上下文推断。
- `unknown`：来源无法确定。

验证状态候选：
- `unverified`：尚未验证。
- `supported`：有可追溯证据支持。
- `confirmed`：命题已由适当的直接证据/当事人明确确认。
- `disputed`：存在未解决的冲突证据。
- `retracted`：原命题被明确撤回或纠正；原历史记录仍保留。

判断把握候选：
- `unknown`：无法评估。
- `low`：把握较低。
- `medium`：有一定依据但仍有明显不确定性。
- `high`：证据充分且判断把握较高。

说明：
- `cross_verified` 不是证据来源类型，而是多个独立证据相互印证的验证方式/证据关系；重复拷贝同一原始来源不构成独立交叉验证。
- `retracted` 不等于物理删除；需保留原记录及纠正关系。
- “直接表达”可以确认“当事人这样表达过”，但不必然证明其陈述涉及的所有客观事实。
- 现有数值 confidence 若未经校准，不得解释为真实概率；禁止默认 `0.5` 被当作中等可信度。
- 情绪模型原始识别分数、intensity、certainty 与记忆可信度分开存储；原始模型分数不能直接充当记忆可信度。

### 6.3 防止自我强化
- 重复检索、重复引用、摘要转述或汐再次回忆，不构成新证据，不得提高 confidence_level 或 verification_status。
- 只有新增、可追溯、相对独立的证据，才可推动状态变化。
- 证据需要保留 source ID/关联关系；同一原文的副本不得被计为多份独立证据。
- 存在冲突时保留冲突，不允许自动抹去不利证据或只挑选符合当前推断的记录。

### 6.4 按用途控制不确定记忆的使用
项目负责人选择：不确定记忆可以用于回忆和参考，但不能单独作为重要决策依据。

- 回忆/历史参考：允许使用；必须保留不确定标记，不能把推断表述为确认事实。
- 一般建议：可以结合其他证据使用；应考虑来源、冲突、时间和适用性。
- 重要决策/不可逆操作：不确定记忆不得单独作为依据；必须有额外可靠证据。涉及授权的操作还必须满足独立授权规则。
- 不确定记忆不能因 confidence 较高而绕过权限、身份、有效性或授权检查。

## 7. 汐自主整理与历史记忆补全

项目负责人原则上同意支持汐自主补全历史记忆，但必须受证据和权限边界约束。

允许汐自主：
- 扫描可访问的历史记忆，识别缺失字段、冲突、重复、时间不明和关联断裂。
- 检索可访问的原始对话、历史事件和来源记录。
- 对有明确、可追溯证据支持的字段进行补全。
- 对只能推测的内容标记为待确认/unknown，不将推测写成事实。
- 生成补全清单、证据链、冲突报告、无法补全清单。
- 记录补全时间、补全来源、补全方法、原值/新值和操作者（汐自动流程）。

不得自主：
- 编造身份、精确时间、作者、事实或证据。
- 覆盖/改写原始记忆正文。
- 删除历史记忆或抹除冲突证据。
- 把推断自动升级为直接表达或 confirmed。
- 因汐“拥有全部记忆”的假设而跳过访问权限和数据可用性检查；只允许使用实际可访问且可追溯的数据。
- 执行生产迁移、批量写入、不可逆删除、权限更改或部署，除非项目负责人另行授权。

推荐分级：
- 只读扫描与证据整理：可自主。
- 有明确证据的元数据补全：设计上可允许，但实施前需明确事务、审计、回滚与范围。
- 推测性补全：只写候选/待确认，不写成事实。
- 删除、覆盖原文、改变身份归属、不可逆操作：禁止自动执行。

## 8. Persona、Memory、Channel Bridge 职责边界

- Persona 提供 canonical self identity、可信身份查询、会话绑定主体信息与可追溯来源；不得把普通 role 或会话分类当作身份凭据。
- Memory 负责长期记忆存储、speaker/experiencer 语义、第三方 people/contact 映射、有效性判断、历史兼容、证据关联和按用途检索。
- Channel Bridge 负责把渠道消息映射到稳定 conversation/session 身份，提供真实 speaker、chat type、peer/group ID 与原始来源；不得把群聊消息统一伪装成主人发言。
- 三方需要定义一致的写入协议、字段缺失语义、失败关闭行为与幂等规则。
- Persona 当前 `session_bindings` 是否扩展 `subject_type/subject_id/subject_updated_at/subject_source`，以及由谁写入，作为跨仓库审查重点；本版不预先决定最终物理 schema。

## 9. Persona 数据一致性与时间线

基于现有只读报告，需审查并给出独立修复建议：
- timeline 写入列名 `session_key` 与 schema `self_id` 不一致的问题。
- event/appraisal/episode 多表写入的事务原子性。
- self identity 变化时历史 timeline 的归属和审计。
- session binding 的主体新鲜度、更新、失效、解绑与历史。
这些属于基础一致性问题，不等同于 EI-2A；本轮只读，不实施。

## 10. 迁移与审计原则（仅设计）
- 所有 schema migration 应在单事务内完成；版本号最后写。
- 任一校验失败整体回滚；不得留下半迁移 schema。
- 只按证据回填；未知数据保留 unknown/uncertain。
- 原始记忆正文与原始来源不可被迁移覆盖。
- 迁移前后应有计数、校验、快照/回滚证据。
- `raw_meta` 若有独立迁移边界，应明确 schema 标记、幂等 ALTER 和失败语义。
- 本草案不授权实施任何 migration。

## 11. 既有审查证据（不得误读为当前实现 PASS）

### Memory
- 报告：`coordination/Memory 智能体报告.md`，MEMORY-REPORT-0028 §19。
- 审查提交：`8956f1c3a62c522e83527add8d37c26c50b2e657`。
- 基线：`feat/m1-preference-memory` @ `7548e49ed0b8d8673818464325d8e72ec7704b27`。
- 测试：258/258 pass，仅证明该基线现有测试通过，不代表 C1–C8 合规。
- 结论：v1.1.1 当时因无权威文本而 BLOCKED；C1/C6 未实现，C2/C4/C5/C7 失败，C3/C8 部分；多入口有效性泄漏已由合成数据探针复现。
- 入口泄漏至少涉及 preference、remembered、session-index、handoff、episodeRecent、rules、stable group、graph、merge、P4 邻居等，详见 MEMORY-REPORT-0028 §19.3。

### Persona
- 报告：`ba-song/dsh-persona-core/EI-REPORT-0009.md`。
- 审查提交：`0af140785d89c3806c6f834195f820bac3808819`。
- 审查基线：main `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；EI 修复分支 `8ccb8a922a789d8d15157b9d99f9de0c20c8807b`；报告分支 HEAD `695413c353183dfbed26bbc155796fc1c0b32f4c`。
- 测试：21/21 与 324/324 pass，仅证明现有测试通过，不代表 C1–C8 合规。
- 结论：v1.1.1 当时因无权威文本而 BLOCKED；C1/C2/C4/C5/C7/C8 REJECT，C3/C6 BLOCKED；selfId 哨兵、binding 校验缺失、timeline 错列、非原子写入已由代码/临时 DB 复现。
- EI-2A：NOT_STARTED。

以上是历史审查快照。复审必须重新记录实际 HEAD，不得把旧分支结果冒充 main 或最新实现。

## 12. 本轮只读复审要求（C1–C8 + 新增会话层）

复审必须给每项标记：
- `PASS`：当前准确 HEAD 上有直接源码与测试证据证明符合。
- `PARTIAL`：部分实现，指出缺口。
- `REJECT`：与契约明确冲突。
- `NOT_IMPLEMENTED`：接口/行为不存在。
- `BLOCKED`：缺少基线、权威定义、依赖或访问条件。
- `NOT_RUN`：没有执行相关验证。

最低审查矩阵：
1. speaker_id 与 experiencer_type/id 分离。
2. private conversation 独立窗口、稳定 ID、隔离策略。
3. group conversation 独立窗口、成员 speaker 身份、群实体与成员身份分离。
4. Persona canonical self ID、identityOf、bindingOf 同源校验、fail closed。
5. owner/third_party/unknown、群实体前缀、无稳定成员 ID 语义。
6. experiencer_evidence 是否可信且不可由普通 PATCH 篡改。
7. 历史记忆 cutover 前后兼容、旧原文保留、unknown 不被误删。
8. validityState 三态与所有实际注入/合并/摘要入口一致。
9. valid_from_kind、superseded_at、legacy 近似时间与 as-of 历史。
10. evidence_source / verification_status / confidence_level 三维是否真正分离。
11. 原始 emotion score、intensity、certainty 与记忆可信度是否分离。
12. 重复引用是否会错误提升可信度；证据独立性是否可追溯。
13. 不确定记忆按用途使用，不能单独触发重要决策。
14. 自主补全的证据来源、审计、原文保护、权限与回滚边界。
15. Persona timeline 列名与多表事务一致性。
16. migration 单事务、验证、version-last、rollback 设计。

每项必须提供文件路径、行号/符号、准确 HEAD、测试命令与结果。没有测试覆盖时明确写未覆盖，不得以现有全量测试通过替代契约验证。

## 13. 明确未决事项（只提出方案，不代替负责人决定）

- canonical owner ID（D1）及 owner episode 写入策略。
- 各平台私聊 conversation key 的稳定字段组合；跨平台同一人账号是否合并。
- 运行 session 与长期 conversation 的精确映射。
- Channel Bridge、Persona 对 session_bindings 的写入责任及字段协议。
- 群成员 ID 不可用时的补录/身份合并策略。
- experiencer_evidence 的物理存储、可信生成、不可 PATCH 机制。
- 三维可信度的最终物理字段名、枚举扩展策略、旧 numeric confidence 兼容方案。
- legacy 记忆的精确时间近似规则、cutover 时间和 approximated 审计格式。
- 对“历史原文可信”的检索/决策策略如何在不抹掉历史价值的前提下防止将原文存在误当作事实已验证。
- 自主补全元数据写入是否允许在未来自动执行，以及其审计、事务、回滚设计。
- `subject` 是否在未来版本 deprecated。
- rules 等特殊表如何适配统一有效性 helper。

审查人不得自行将上述未决事项写成已获负责人批准的决定。

## 14. 验收条件

共同契约审查完成的条件：
- Memory 与 Persona 分别给出逐项审查报告，使用相同契约版本与同一 commit/PR 内容。
- 两份报告记录准确 HEAD、审查范围、证据、测试、差异、风险、未决问题。
- 两位负责人对字段语义、会话层边界、迁移边界没有未披露的冲突；如有冲突必须列出，不能强行宣称一致。
- 所有未决事项清楚列出并交项目负责人决定。
- 只读审查不改业务源码、测试、DB、生产配置，不启动 EI-2A/Memory v6/Persona v3。
- GPT 汇总后再交项目负责人确认是否冻结契约；在确认前本文保持 DRAFT，不是实施授权。

---
