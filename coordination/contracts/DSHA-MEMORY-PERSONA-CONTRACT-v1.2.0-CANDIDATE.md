# DSHA「汐」跨模块身份、会话与记忆数据契约 v1.2.0（Owner 审阅候选稿）

- 状态：**CANDIDATE / OWNER REVIEW REQUIRED / NOT FROZEN**
- 版本：v1.2.0-candidate
- 维护仓库：`ba-song/dsh-memory-core`
- 配套模块：Channel Bridge、Persona/EI、Memory
- Owner：项目负责人（用户）；架构协调：GPT
- 本文性质：跨模块逻辑接口与数据语义候选合同。**不是实施授权、迁移授权、生产配置或当前实现合规证明。**
- 基础合同：v1.1.1-draft，commit `006bb5bfce5d031b49a60271fe0406b228b43e00`
- 本版依据：Owner 已批准的五项决策，以及三份 `OWNER-APPROVED-CONTRACT-COORDINATION-03` 专项只读报告。

> 解释规则：Owner 已明确批准的原则属于本合同的固定约束；字段、表名、API、索引和物理迁移方案如未被 Owner 明确批准，均标记为 PROPOSAL/OPEN。任何实现与固定约束冲突时，不得以迁就现有代码为由修改 Owner 决策。

---

## 0. 版本目标、范围与权限

### 0.1 v1.2.0 目标

本版将三个模块的职责统一为三个互不混淆的关系域：

1. **Conversation ↔ Runtime Session**：Channel Bridge 唯一负责。
2. **Runtime Session ↔ Persona Self**：Persona 唯一负责。
3. **Message ↔ Speaker / Experiencer**：Memory 唯一负责。

同时明确：

- QQ Conversation ID 的规范格式和缺字段行为；
- Runtime Session ID 的权威生成方；
- Owner 永久身份及账号关联原则；
- 消息级原始发言者事实与 canonical 身份的边界；
- 群聊成员、群实体、转发者、原作者的区分；
- 跨会话隔离、证据三维、有效性和旧记忆保护；
- P0 修复顺序与跨模块验收要求。

### 0.2 本轮授权范围

本轮只允许：

- 阅读和核对已有代码、Schema、测试及专项审查报告；
- 编写、讨论、修订本候选合同；
- 提出逻辑接口、字段和验收建议；
- 生成只读审查清单和后续 Owner 决策清单。

本轮不允许：

- 修改业务源码、测试、Schema、数据库或生产数据；
- 执行迁移、回填、批量写入或删除；
- 启动 Memory v6、Persona v3 或 EI-2A；
- 修改生产配置、权限、部署、运行状态或设备；
- 连接真实 QQ/NapCat 生产环境或发送真实消息；
- 创建真实 Owner ID、绑定真实平台账号或写入 Self/Owner/Speaker/Experiencer；
- 合并 PR、冻结合同或宣布整体实现 PASS。

任何上述操作都必须由 Owner 在后续另行明确授权。

### 0.3 状态用语

- `NOT_STARTED`：尚未开始。
- `IN_PROGRESS`：正在进行。
- `BLOCKED`：存在明确阻塞。
- `READY_FOR_REVIEW`：交付物已提交，等待审阅。
- `PASS`：有当前准确基线上的直接证据证明验收通过。
- `FAILED`：验收未通过。

专项报告的 READY_FOR_REVIEW 不代表合同 PASS；测试通过不代表契约语义已实现。

---

## 1. Owner 已批准的五项固定决策

以下五项为 Owner 明确批准的决定，不得在后续技术讨论中重新标记为待决事项。

### D1. 三层关系拆分

1. Conversation ↔ Runtime Session：Channel Bridge 管理并唯一写入。
2. Runtime Session ↔ Persona Self：Persona 管理并唯一写入。
3. Message ↔ Speaker / Experiencer：Memory 管理并唯一写入。

三层关系不可混成一个含义模糊的通用绑定关系。不得引入没有独立业务语义和 Owner 授权的通用 `session_subjects` 表。

### D2. Conversation ID 统一格式

QQ 私聊：

`conv:qq:<account_id>:private:<peer_id>`

QQ 群聊：

`conv:qq:<account_id>:group:<group_id>`

约束：

- `account_id` 必须存在。
- 私聊必须有 `peer_id`。
- 群聊必须有 `group_id`。
- 缺少任何必要字段时 fail closed，不得生成 `unknown` 会话 ID，不得猜测或复用其他会话。
- 旧格式保留为 `legacy_unmapped`，不得自动猜测映射、合并或改写。
- Host/DSH 负责权威生成 Runtime Session ID；Channel Bridge 负责记录 Conversation 与 Runtime Session 的映射。

### D3. Owner 独立永久身份

Owner ID 使用独立命名空间：

`owner:<uuid>`

约束：

- Owner ID 不等同于 QQ 号、昵称、头像、手机号或任何单个平台账号。
- Persona 身份域负责 Owner 身份和账号关联管理。
- Channel Bridge 只提供平台原始账号事实，不签发 Owner 身份。
- Memory 只引用已经验证的 Owner ID，不自行生成或绑定 Owner。
- 跨平台账号关联必须有 Owner 明确同意；无回复、含糊回复、无法确认均不构成同意。

### D4. 旧记忆保护

- 保留旧记忆原始文本和历史价值。
- 保留已有数值 confidence，不得擅自重算、覆盖或映射成新的 high/medium/low。
- 缺失的来源、时间、身份、证据等信息保持 unknown，不得编造。
- 不得仅因旧数据缺少新字段而批量删除、排除、整体降级或从检索中一律剔除。
- 旧记忆可以带明确不确定性标签用于回忆和参考。
- 不确定旧记忆不得单独作为重要或不可逆决策依据。
- 迁移流程必须是：只读扫描 → 证据与候选项 → 审查 → Owner 单独授权 → 独立迁移执行。
- 实际 cutover 由获批的迁移版本确定；本合同不虚构 cutover 日期。

### D5. P0 修复顺序

1. 跨 Conversation 上下文、原文及摘要泄漏。
2. 群聊发言者归属错误。
3. Self 身份门禁。
4. 有效性过滤。
5. 重复证据导致 confidence 虚高。
6. Persona 时间线与事务完整性。

此顺序是 Owner 批准的优先级，不代表问题已修复，也不构成实施授权。

---

## 2. 核心概念与身份命名空间

### 2.1 三个不可互相推导的关系维度

- `speaker_id`：谁说了这条消息。
- `experiencer_type` / `experiencer_id`：消息或记忆描述的经历属于谁。
- `conversation_id` / `runtime_session_id`：消息发生在哪个会话容器和运行会话中。

禁止从会话归属推断经历归属；禁止从消息由汐接收、转述、整理或保存推断经历属于汐；禁止从 Owner 私聊推断所有消息均由 Owner 发言或经历均属于 Owner。

### 2.2 主体类型

`experiencer_type` 的语义：

- `self`：汐自身真实发生的经历。
- `owner`：Owner 本人的经历。
- `third_party`：其他个人或群体的经历。
- `unknown`：证据不足，暂时无法确定。

`speaker_type` 如需保留，建议使用相同的主体分类语义，但它只描述发言者身份，不替代 experiencer。

### 2.3 身份命名空间

规范身份：

- 汐：`self:<uuid>`。
- Owner：`owner:<uuid>`。
- 第三方个人：建议 `person:contact:<platform>:<external_id>` 或其他经三方确认的稳定 canonical ID。
- QQ 群实体：保留为第三方群实体，例如 `person:contact:qq:group:<group_id>`。
- 无法确认的身份：null/空值 + `unknown` 状态，不伪造稳定 ID。

`person:owner` 只允许作为历史兼容别名或显示层别名，不作为新数据的 canonical Owner ID，不得自动改写旧数据而丢失原值。

### 2.4 Self 身份门禁

固定要求：

- Canonical Self 必须为合法 `self:<uuid>`。
- Self 查询只允许返回合法 canonical ID 或 null/明确错误。
- DB 不可用、Self 缺失、多个 active Self、格式非法或身份冲突时 fail closed。
- 不得以 `self:unknown` 作为合法身份或可写身份。
- 不得因首次启动无 Self 而自动创建一个未经 Owner 确认的 Self。
- Memory 写入 experiencer=self 的记忆前必须验证 canonical Self。
- `role`、`cwd`、`persona/work` 角色、private/group/subagent 会话类型、显示名或普通可 PATCH 元数据均不能单独证明 Self 身份。

建议错误码（PROPOSAL）：

- `E_PERSONA_IDENTITY_UNKNOWN`
- `E_PERSONA_IDENTITY_INVALID`
- `E_PERSONA_IDENTITY_MISSING`
- `E_PERSONA_SELF_CONFLICT`
- `E_PERSONA_UNAVAILABLE`

### 2.5 Owner 身份门禁

固定要求：

- 新 Owner 身份必须使用 `owner:<uuid>`。
- Owner 身份与平台账号分离。
- Persona 身份域是 Owner identity 和 owner account link 的唯一管理方。
- 未完成可信 bootstrap 时，Owner 身份保持 absent/unknown；不得把平台白名单或昵称命中当成 canonical Owner 身份。
- 未经明确同意不得确认跨平台账号关联。
- Memory 不得自行签发、推断或合并 Owner ID。

**Bootstrap 技术方案仍为 OPEN/PROPOSAL**：Persona 报告建议使用 DSHA 本地受信入口、一次性 challenge 和审计记录；恢复码、设备确认、轮换等具体机制尚未获得 Owner 对方案细节的批准。方案不得被实现成既成事实。

Owner episode 的写入政策仍为 OPEN；未获明确授权前，不得因存在 Owner ID 就推断所有 Owner 相关记忆均可自动写入。

---

## 3. 会话域：Conversation 与 Runtime Session

### 3.1 Conversation ID 生成与校验

Channel Bridge 是 Conversation ID 的唯一权威生成和管理方。

QQ 格式固定为：

```text
conv:qq:<account_id>:private:<peer_id>
conv:qq:<account_id>:group:<group_id>
```

规则：

- 采用原始、稳定的平台账号和会话对象标识，不得通过删除非数字字符等有损归一化造成碰撞。
- `account_id` 用于区分不同机器人/登录账号。
- 私聊对象标识和群标识必须严格区分。
- 缺少 `account_id`、`peer_id` 或 `group_id` 时，不得构造新 Conversation ID。
- 不得以昵称、群名、显示名、消息内容、随机数或默认字符串替代缺失 ID。
- 未映射的新消息不得进入普通会话上下文、长期记忆写入或跨会话摘要注入；必须记录可审计的拒绝/缺失原因。
- 历史旧 key（如 `group:<gid>`、`private:<peer>` 或更早的 `group`/`private`）保留为 `legacy_unmapped`，不自动迁移、不参与新会话上下文。

建议错误码（PROPOSAL）：`E_CONVERSATION_MAPPING_MISSING`、`E_CONVERSATION_ID_INVALID`。

### 3.2 Runtime Session ID 权威来源

- Host/DSH 是 Runtime Session ID 的权威 mint/generation 方。
- Channel Bridge 不得自行生成一个随机 UUID 并将其宣称为 Host 权威 Runtime Session ID。
- Bridge 在获得 Host/DSH 生成的 ID 后，负责记录 Conversation ↔ Runtime Session 映射。
- 如果 Bridge 插件上下文无法调用 Host/DSH 权威 mint 接口，相关新会话创建流程必须 BLOCKED；不得悄悄回退到 Bridge 自建 ID。
- 具体 Host API 调用方式、上下文注入和失败重试属于实现设计，必须在实施前验证。

### 3.3 Conversation ↔ Runtime Session 逻辑记录

关系 1 的唯一写入方：Channel Bridge。

以下为逻辑字段建议（PROPOSAL，不冻结物理表名）：

- `conversation_id`：规范 Conversation ID。
- `runtime_session_id`：Host/DSH mint 的权威 ID。
- `platform`：平台类型，例如 qq。
- `account_id`：平台账号 ID。
- `chat_type`：private/group。
- `peer_id`：私聊对象 ID；private 时使用。
- `group_id`：群 ID；group 时使用。
- `created_at`、`updated_at`、`rotated_at`。
- `mapping_version` / `record_version`。
- `source` / `audit_ref`。
- `status`：active、legacy_unmapped、retired 等候选状态。

物理实现可以扩展现有 `channel_sessions`，也可以采用独立映射表；三方尚未证明哪一种更合适。本合同只固定逻辑关系、唯一写入方、字段语义和约束，不在此冻结表名。

唯一性至少应保证：同一规范 Conversation 在同一有效版本下不得同时指向多个互相冲突的 active Runtime Session；具体轮换历史模型须在实施设计中明确。

### 3.4 旧会话兼容

- 旧记录保留原始 key、原始 session ID 和可用审计字段。
- 无法无歧义证明 account/peer/group 的旧行标记 `legacy_unmapped`。
- 不得通过“最近一条同 kind 记录”、相似昵称、群名或消息内容推断映射。
- 旧映射只读，不参与新上下文注入。
- 任何迁移必须先只读盘点，再形成候选映射，Owner 单独授权后才能执行。

---

## 4. Persona 域：Runtime Session ↔ Persona Self

### 4.1 唯一写入责任

关系 2 的唯一写入方为 Persona。

- Channel Bridge 提供权威 Conversation/Runtime Session 映射事实。
- Persona 读取并校验这些事实，负责 Runtime Session ↔ canonical Self 的绑定。
- Memory 只读取必要的验证结果或证据引用，不写 Persona Self binding。
- Channel Bridge 不写 Persona 数据库。
- Persona 不写 Channel Bridge 的 Conversation 映射。

### 4.2 Persona Self Binding 逻辑

建议逻辑实体名：`persona_self_bindings`（PROPOSAL）。

候选字段：

- `runtime_session_id`
- `conversation_id`（只作关联引用，不由 Persona 生成或修改）
- `self_id`（合法 canonical `self:<uuid>`）
- `evidence_id`
- `status`（active、expired、revoked、conflict 等候选值）
- `verified_at`
- `expires_at`
- `version`

上述物理表名和字段仍需 Persona/Channel 联合技术审查；Owner 已批准的是唯一写入职责和关系拆分，不是该 SQL schema 的逐字段冻结。

### 4.3 绑定验证

建议 `bindingOf(runtime_session_id)` 只有在以下条件全部成立时才返回有效绑定：

- binding 明确存在且 active；
- `self_id` 是合法 canonical Self；
- `self_id` 与 Persona 当前可信 canonical Self 一致；
- Conversation 映射存在且与当前 header 相符；
- evidence 存在、来源可信且未撤销/过期；
- 不存在未解决的 identity conflict。

任一条件失败时返回 null/明确 reason，不得降级为 `self:unknown`，不得猜测。

### 4.4 旧 session_bindings

- 旧 `session_bindings` 不再承担三层关系的共同权威职责。
- 建议先作为只读 legacy 数据保留；不得双写。
- 缺少 conversation、证据或可信 self 信息的旧行不得自动升级为有效 Self binding。
- 不得仅凭 role、cwd、persona 名称或旧 session 归属证明当前消息主体。
- 旧表是否迁移、退役或建立只读视图，需另行提出技术方案并取得 Owner 迁移授权。

---

## 5. Channel Bridge → Memory 消息 Envelope

### 5.1 责任原则

Channel Bridge 负责采集并传递平台原始事实；Memory 负责 canonical speaker、experiencer 和记忆证据语义；Persona 负责验证 Self/Owner 身份。

Bridge 不得自行生成 canonical `speaker_id`、`experiencer_id` 或 Owner 身份。

### 5.2 Envelope 逻辑字段（PROPOSAL）

建议最小 Envelope 包含：

- `platform`
- `account_id`
- `conversation_id`
- `runtime_session_id`
- `chat_type`
- `peer_id`（private）
- `group_id`（group）
- `external_speaker_id`（平台原始实际发言者 ID）
- `forwarder_id`（如有）
- `original_author_id`（如平台/引用/转发结构可提供）
- `message_id`
- `event_time` / `timestamp`
- `raw_content` 或受控原文引用
- `source` / `source_id`
- `speaker_evidence`（平台原始字段、来源、缺失字段等）
- `missing_fields`
- `envelope_version`

传输协议、字段类型、签名、幂等键、原文存储位置和隐私访问控制仍需实现设计确认。

### 5.3 发言者字段语义

- `external_speaker_id`：Channel Bridge 从平台事件取得的原始实际发言者 ID。
- `speaker_id`：Memory 解析/映射后的 canonical person ID。
- `group_id`：群聊空间 ID，不是群成员 ID。
- `forwarder_id`：转发链中的转发者，不自动等于原作者或当前消息发言者。
- `original_author_id`：原始内容作者，平台未提供时保持 unknown。
- `display_name_snapshot`：昵称/显示名快照，只用于展示和审计，不作为身份主键。
- `experiencer_type/id`：Memory 根据消息事实和可信身份证据判断的经历主体，不由 Bridge 直接决定。

### 5.4 群聊规则

- 群实体是会话空间/第三方实体，不是群内实际发言者。
- 群成员的实际发言者 ID 应尽可能来自平台稳定 sender ID。
- 若 sender ID 缺失或无法验证：`external_speaker_id=null`，Memory 的 `speaker_id` 和 `experiencer_id` 保持 unknown/null。
- 禁止使用群号、群名、昵称、显示名或群实体 ID 填充成员 speaker ID。
- 可保留群级消息事实，但不得把它归给群主、Owner、汐或任一具体成员。
- 转发者、原作者和当前发言者必须分开；平台未提供的字段保持 unknown。

### 5.5 Memory 的唯一写入责任

关系 3 的唯一写入方为 Memory：

- canonical `speaker_id`；
- `speaker_type`（如采用）；
- `experiencer_type` / `experiencer_id`；
- 消息级 evidence 关系；
- 记忆有效性、冲突、撤回和审计。

Memory 不得伪造 Bridge 未提供的平台原始事实，也不得从 Persona 的 Session Self binding 推断每条消息的 speaker 或 experiencer。

### 5.6 Bridge 与 Memory 的写入边界（补充约束）

- Channel Bridge 可以维护自身的渠道事件、投递状态、会话内临时上下文或受控原文引用；这些不等于它可以直接写入 Memory 所拥有的记忆记录。
- 任何需要进入 Memory 记忆库的消息、群聊 turn、transcript、digest 或 handover 内容，都必须通过 Memory 提供的受控 ingestion/interface 进入；Bridge 不得绕过接口直接写 Memory 数据表或代替 Memory 决定 speaker、experiencer、证据和有效性字段。
- Bridge 可以生成仅供自身会话运行使用的临时摘要；若摘要要成为长期记忆或被跨会话检索/注入，必须经过 Memory 的来源、主体、有效性和权限校验。
- 群聊 transcript/turn 必须保留 group_id 与可得的 external_speaker_id；缺失成员 ID 时保持 unknown，不得以昵称或群名补齐。
- 上述规则不改变 D1 的三层唯一写入责任，也不授权改动现有代码。

---

## 6. 三方接口责任矩阵

| 事实/关系 | Channel Bridge | Persona/EI | Memory |
|---|---|---|---|
| 平台原始消息事实 | 唯一采集/提供 | 只读消费 | 只读引用 |
| platform/account/chat_type/peer/group | 唯一采集/提供 | 只读消费 | 只读引用 |
| Conversation ID | 唯一生成/管理 | 只读消费 | 只读引用 |
| Conversation ↔ Runtime Session | 唯一写入 | 只读消费/校验 | 只读引用 |
| Runtime Session ID mint | Host/DSH 权威生成；Bridge 调用并记录 | 消费 | 引用 |
| Runtime Session ↔ Persona Self | 不写 | 唯一写入 | 只读验证结果/证据引用 |
| external_speaker_id | 采集/提供 | 不负责 canonical 映射 | 只读原始事实 |
| canonical speaker_id | 不生成 | 只验证 Self/Owner 身份 | 唯一写入 |
| Owner ID / Owner account link | 只提供平台事实 | 唯一身份管理方 | 只引用已验证 Owner ID |
| experiencer_type/id | 提供消息事实，不裁定 | 提供可信 Self/Owner identity evidence | 唯一写入 |
| memory evidence | 提供来源事实 | 提供身份验证证据 | 唯一写入/维护 |
| validity / supersession | 不写 | 不写 | 唯一写入/判断 |
| 历史记忆补全候选 | 提供可访问原始事实 | 提供身份验证证据 | 组织候选、证据与审计 |
| 生产迁移 | 不得自行执行 | 不得自行执行 | 不得自行执行 |

任何接口缺失或冲突时，应返回明确错误/unknown 并审计，不得通过双写、猜测或静默回退掩盖问题。

---

## 7. Memory 域：证据、验证、把握度与有效性

### 7.1 三维证据模型

三个维度必须分开：

1. `evidence_source`：信息来自哪里。
2. `verification_status`：目前有何证据支持、确认、争议或撤回。
3. `confidence_level`：对当前判断的把握程度。

候选枚举（语义建议，物理命名需实现审查）：

`evidence_source`：
- `direct_statement`
- `direct_observation`
- `historical_record`
- `external_source`
- `inference`
- `unknown`

`verification_status`：
- `unverified`
- `supported`
- `confirmed`
- `disputed`
- `retracted`

`confidence_level`：
- `unknown`
- `low`
- `medium`
- `high`

三者不得互相自动推导，不得合并成一个数值或单一枚举。

### 7.2 证据解释边界

- `direct_statement` 可证明当事人表达过某内容，但不自动证明其陈述中的所有客观事实。
- `direct_observation` 必须能追溯到可信观察入口。
- `historical_record` 表示原始历史记录存在且可访问，不自动代表其每个命题已验证。
- `inference` 必须明确标为推断，不得伪装成直接表达。
- `cross_verified` 是独立证据之间的验证关系/方法，不是 evidence_source 枚举。
- 同一来源的副本、重复读取、引用、摘要或再次回忆不是独立证据。
- 原始 emotion model score、intensity、certainty 与 memory confidence 分开保存；不得互相替代。
- 未校准的旧 numeric confidence 保留原值，不得解释为真实概率，也不得擅自映射为新等级。

### 7.3 防止证据自我强化

- 重复检索、引用、摘要转述或汐再次回忆同一来源，不得提高 confidence 或 verification status。
- 只有新增、可追溯且相对独立的证据才能推动验证状态变化。
- 应保存 source ID、evidence relationship 和重复/派生关系。
- 证据冲突时保留冲突，不得静默丢弃不利证据。
- 撤回不等于物理删除；原始记录与撤回/纠正关系都应保留。

### 7.4 Experiencer evidence

建议采用专用、可审计且不可由普通 Memory PATCH 篡改的身份/经历证据记录（例如 `experiencer_evidence`，名称 PROPOSAL）。

至少需要能追溯：

- 证据 ID；
- 关联消息/记忆及 source ID；
- Conversation/Runtime Session 引用；
- external speaker 与 canonical speaker；
- experiencer type/id；
- 证据来源、验证状态、把握度；
- 产生模块/可信入口；
- 产生时间、版本和完整性信息；
- 撤回、替代或冲突关系。

具体物理存储、签名/权限机制、是否单表或多表仍需技术设计确认。Memory 是证据记录的唯一写入方；Bridge/Persona 通过来源证据引用提供各自事实。

### 7.5 有效性与时间语义

有效性、可信度、主体归属是三个独立维度。

建议统一有效性结果：

- `VALID`
- `INVALID`
- `UNCERTAIN`

候选 `valid_from_kind`：

- `exact`：有可靠精确起始时间。
- `implicit`：新记录未提供 valid_from，但合法 created_at 可作为起效时间。
- `legacy`：旧记录时间精度不足，按经审计的历史近似规则处理。
- `unknown`：无法建立可信时间边界。

候选 `superseded_at`：

- 只有存在可靠替代时间证据时才填写。
- 不得伪造替代时间。
- 被替代的旧记忆保留；当前视图与 as-of 历史视图分别正确。

所有实际检索、注入、合并、摘要和决策入口必须遵守统一有效性语义。不得只修复单一 recall 路径而遗漏 preference、remembered、session-index、handoff、rules、stable、graph、merge、P4 邻居、daily/weekly 等入口。

### 7.5.1 未知时间、历史近似与普通注入边界（Owner 已批准原则）

本节所列旧记忆保护原则已由 Owner 明确同意；它们是合同约束，不代表当前代码已经实现，也不构成迁移授权。

- **旧记忆整体保留**：不得因缺少新字段、时间不明或尚未完成迁移而批量删除、整体排除或统一降级旧记忆。原始文本及已有 numeric confidence 原值必须保留，不得把旧 numeric confidence 直接映射成新的 `confidence_level`。
- **历史近似记录**：旧记录具有一定历史参考价值、但时间精度不足时，可进入带有“历史近似/时间不确定”明确标记的历史回忆与参考通道。该标记不等于 `confirmed`，也不代表记录仍是当前事实；不得仅凭此类记录作出重要决策。
- **时间完全未知的记录**：`valid_from_kind='unknown'` 表示无法建立可信时间边界。记录必须保留，但只能进入专门的不确定历史回忆/参考通道，并显式返回不确定性标记；不得进入普通 current-fact 注入，也不得单独支撑重要决策。
- **legacy**：`valid_from_kind='legacy'` 表示旧记录待按获批规则进行历史近似处理。它既不自动等于 INVALID，也不自动等于当前 VALID；可用于历史回忆/参考，但不得冒充已确认事实。具体哪些数据类别可按何种时间依据近似，须另行形成迁移设计。
- **implicit**：仅适用于新记录，且只有在 `created_at` 经校验可信、记录类型允许时才可采用；不得将 implicit 规则追溯套用于旧记录。
- **证据状态独立处理**：`unverified`、`supported`、`confirmed`、`disputed`、`retracted` 与时间类型是不同维度。历史近似或时间未知不能自动提升验证状态；`retracted` 不得普通注入，`disputed` 不得静默选边。
- **禁止伪造**：来源、时间、身份或证据缺失时继续保持 unknown；不得为填充新字段而推测或编造。

上述原则不决定具体 cutover 时间/版本，也不授权扫描后的元数据写入、批量回填、迁移、部署或生产变更。旧数据类别映射、时间近似算法、历史通道的物理实现及验收测试仍须单独设计、只读验证并取得相应授权。当前实现与本节要求不一致的部分应登记为待修复差距，不得将合同要求描述成已经实现。

### 7.6 不确定记忆的用途控制

- 回忆/历史参考：允许使用，但必须保留不确定性标记。
- 一般建议：可与其他证据结合，考虑来源、冲突、时间和适用性。
- 重要决策/不可逆操作：不确定记忆不得单独作为依据，必须有额外可靠证据。
- 涉及授权的操作还必须满足独立授权规则；高 confidence 不得绕过权限或授权。

---

## 8. 旧记忆保护、历史补全与迁移边界

### 8.1 旧记忆保护

- 保留旧记忆原文、原始来源和历史价值。
- 保留原有数值 confidence。
- 缺失字段保持 unknown，不推造作者、时间、身份或来源。
- 不得仅因缺少新字段而批量删除、排除、整体降级或从检索中一律剔除。
- 可在带不确定性标记的条件下用于回忆和参考。
- “已保存”只能证明记录存在，不能自动证明其中所有事实、身份、时间和当前有效性。
- 补全字段必须与原始正文分开保存；不得覆盖原文。

### 8.2 自主只读整理

可在实际访问权限范围内进行：

- 只读扫描历史记忆；
- 检索可访问的原始对话和来源；
- 识别缺失字段、冲突、重复、时间不明和关联断裂；
- 形成候选补全、证据链、冲突报告和无法补全清单。

不得：

- 编造事实、身份、时间或证据；
- 将推断升级为 direct_statement/confirmed；
- 覆盖原始正文；
- 删除历史记录或抹除冲突；
- 因假设“汐拥有全部记忆”而跳过访问权限检查。

有证据支持的元数据写入仍需单独明确写入范围、事务、审计和回滚机制，并取得实施授权。

### 8.3 迁移流程

迁移必须按以下顺序：

1. **只读扫描**：记录当前 Schema/数据版本、行数、空值、异常和版本差异。
2. **证据与候选项**：只对有证据的字段生成补全候选；无法确认的保留 unknown。
3. **审查**：由相关模块负责人交叉核验，Owner 审阅范围、风险和 cutover。
4. **单独授权**：Owner 对明确版本、范围、时间窗口、执行方和回滚方案作出独立授权。
5. **独立执行**：事务化迁移、验证、审计、回滚准备。
6. **切换确认**：只有满足批准的验收条件后，才使用获批迁移版本作为 cutover。

### 8.4 迁移技术约束（实施设计要求）

- Schema migration 应具备事务原子性；版本号最后写入。
- 任一校验失败整体回滚。
- 不得留下半迁移 Schema。
- 保留原文、原始来源、旧 confidence 和旧身份值。
- 对 fresh DB 与旧/部分迁移 DB 分别验证。
- 迁移前后有计数、校验、快照和回滚证据。
- 迁移不得自动把 `self:unknown`、非法 ID 或旧 binding 升级为可信身份。
- 本节仅定义未来迁移的设计约束，不授权执行任何迁移。

---

## 9. P0 修复与跨模块验收矩阵

以下顺序固定遵循 Owner D5。每个 P0 项必须有正向和负向测试、当前准确基线、源码/Schema 证据及独立验收记录。

### P0-1：跨会话上下文、原文及摘要泄漏

主要责任：Channel Bridge + Memory。

最低验收：

- 私聊 A 的上下文不得包含私聊 B 的原文。
- 私聊不得无授权注入群聊原文。
- 群 A 的上下文、摘要、归档和查询不得包含群 B 的内容。
- Owner home/unified 不得自动接收其他私聊/群聊原文。
- 新会话只按规范 conversation_id 取上下文，不按 channel 全量取历史。
- 缺少 Conversation ID/account_id 时 fail closed，不回退到全渠道查询。
- 跨会话长期记忆检索必须经过主体、权限、用途、来源和审计判断。
- 摘要共享不等于原文共享；未经授权不得注入其他会话原文。

负向测试必须放入其他会话独有哨兵文本并断言命中数为 0。

### P0-2：群聊发言者归属

主要责任：Channel Bridge + Memory。

最低验收：

- group_id 与 external_speaker_id 分开。
- 实际成员 speaker 不得被群实体替代。
- 缺少稳定 sender ID 时 speaker/experiencer unknown。
- 昵称、群名、显示名只作展示快照。
- forwarder、original author、actual speaker 分离。
- 不得默认归给 Owner 或汐。
- 群消息可保留为群级事实，但不得伪造个人归属。

### P0-3：Self 身份门禁

主要责任：Persona；Memory 配合。

最低验收：

- selfId 只返回合法 `self:<uuid>` 或 null。
- DB 不可用、Self 缺失、多个 active Self、非法 seed 均 fail closed。
- 首次启动不得自动创建未确认 Self。
- 旧 sentinel 不可作为合法 Self。
- binding 必须验证 canonical self 与 evidence。
- Memory 拒绝 null、sentinel、非法 Self 及未经验证的 self episode。

### P0-4：有效性过滤

主要责任：Memory。

最低验收：

- 使用统一 VALID/INVALID/UNCERTAIN 语义。
- 所有实际注入、检索、摘要、合并和决策入口一致。
- 覆盖 preference、remembered、session-index、handoff、episodeRecent、rules、stable、graph、merge、P4 neighbors、daily/weekly 等适用入口。
- 对 as-of 查询和被替代记录有明确测试。
- 缺失时间不能默认解释为永远有效。

### P0-5：重复证据与 confidence

主要责任：Memory。

最低验收：

- 同一 source 的副本、重复读取、引用、摘要不增加 evidence count 或 confidence。
- 只有新增、可追溯、相对独立证据才允许改变验证状态/把握度。
- 原 numeric confidence 保留；新旧模型不可无依据混算。
- 冲突证据保留并可审计。

### P0-6：Persona 时间线与事务完整性

主要责任：Persona。

最低验收：

- Timeline INSERT 列名与实际 Schema 一致。
- 不允许空 catch 静默吞掉关键持久化失败。
- event/appraisal/episode 需要原子性时在同一事务提交或全部回滚。
- 状态更新与 timeline 不得出现无法审计的部分成功。
- 成功测试验证预期行数和 self_id。
- 故障注入测试验证失败后 0/0/0 或合同明确的完整原子状态。
- 身份切换历史有明确审计规则。
- 不把基础事务修复混入 EI-2A。

### 9.1 统一验收报告

每个 P0 报告必须包含：

- 当前准确 commit/branch；
- 相关文件路径、行号/符号；
- Schema 版本与 fresh/legacy DB 区别；
- 测试命令、正向结果、负向结果；
- 未覆盖范围与 NOT_RUN 项；
- 是否依赖其他模块；
- 状态和证据链接。

已有 562/562、303/303、258/258 的测试结果仅说明对应历史基线的现有测试通过，不等于本合同的 P0 验收通过。

---

## 10. 专项报告所确认的当前基线（历史审查快照）

以下仅为三份专项审查所记录的基线快照，不代表当前远端 HEAD 永远不变；后续实施前必须重新核验准确 HEAD。

### 10.1 Channel Bridge

- 代码基线：`bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13`。
- 版本：`dsh-channel-bridge@0.18.0`。
- 测试：562/562 pass，fake transport。
- 报告 commit：`665f19c35f5e10128ecd0014ff89d25a4e17ae09`。
- 当前发现：旧 `group:<gid>`/`private:<qq>` key，无 account_id；缺字段回退 unknown；Bridge randomUUID 自建 session；Envelope 缺少多项身份/会话字段；上下文、群 fallback、群归档、handover 有跨会话风险；Host mint 接口插件上下文可用性未验证。

### 10.2 Persona/EI

- 代码基线：`a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`。
- Schema：v2。
- 测试：303/303 pass。
- 报告 commit：`8eaed1a4fe5beb465e1f71c8e30bfbd2281f615c`。
- 当前发现：selfId 可返回 sentinel；ensureSelf 自动创建/接受非法 seed；binding 缺同源验证；Owner identity/link/bootstrap 未实现；旧 session_bindings 未拆；Timeline 错列并吞错；多表写入非原子。

### 10.3 Memory

- 代码基线：`7548e49ed0b8d8673818464325d8e72ec7704b27`。
- Schema：v5。
- 测试：258/258 pass。
- 报告 commit：`612bd885e66d0d01478b25846f7abe0c95b4ede0`。
- 当前发现：缺少 experiencer/conversation/session/三维证据/validity 新字段；群消息 speaker 退化为群实体；conversation_scope 为空；digest 跨会话注入；self sentinel/非法 ID 可写；多个有效性入口泄漏；同源重复提升 confidence；fresh 与 legacy raw_meta 路径存在版本差异。

### 10.4 专项报告原文

- Channel Bridge：`coordination/agent-reviews/channel-bridge/owner-approved-contract-coordination-03/REVIEW-REPORT.md`，commit `665f19c35f5e10128ecd0014ff89d25a4e17ae09`。
- Persona：`coordination/agent-reviews/persona/owner-approved-contract-coordination-03/REVIEW-REPORT.md`，commit `8eaed1a4fe5beb465e1f71c8e30bfbd2281f615c`。
- Memory：`coordination/agent-reviews/memory/owner-approved-contract-coordination-03/REVIEW-REPORT.md`，commit `612bd885e66d0d01478b25846f7abe0c95b4ede0`。

---

## 11. 尚未冻结的技术细节与 Owner 决策边界

以下事项不能被误写为已批准的物理实现决定：

| 事项 | 当前建议/状态 | 说明 |
|---|---|---|
| Bridge 映射表物理方案 | OPEN / PROPOSAL | 扩展 `channel_sessions` 或独立映射表尚未定 |
| Persona Self binding 物理表 | OPEN / PROPOSAL | `persona_self_bindings` 为建议名 |
| Memory 消息级字段及 evidence schema | OPEN / PROPOSAL | 逻辑责任已定，物理字段/表/索引仍需技术评审 |
| Envelope 精确 JSON schema | OPEN / PROPOSAL | 逻辑字段已列，类型/签名/幂等/原文引用待定 |
| Host mint API 插件上下文可用性 | BLOCKED / NOT RUN | Host 有 mint 方向证据，Bridge 插件上下文可用性未验证 |
| Owner bootstrap 可信入口 | OPEN / PROPOSAL | Persona 建议本地受信入口；设备确认/口令/恢复码需另审 |
| Owner 恢复与轮换 | OPEN | 未批准具体流程 |
| Owner episode 写入政策 | OPEN / FAIL CLOSED | Owner ID 决策不自动授权 Owner 记忆写入 |
| role_only 语义 | OPEN | 不得作为稳定身份；仅展示的建议尚未冻结 |
| 旧 session_bindings 处置 | OPEN | 保留只读；迁移/退役另行授权 |
| legacy 时间近似规则 | OPEN | 不虚构精确时间；created_at 是否可作近似需逐类审查 |
| cutover 版本/日期 | OPEN / OWNER APPROVAL REQUIRED | 必须由获批迁移版本确定 |
| 三维字段物理命名 | OPEN | 语义已定方向，最终物理字段名需三方一致 |
| experiencer_evidence 可信存储 | OPEN | 需要权限、完整性、审计和 PATCH 防护设计 |
| 跨平台账号关联撤销/恢复 | OPEN | Persona 管理；具体授权流程需 Owner 审阅 |

如新证据显示某项 Owner 固定决策与技术约束冲突，必须先报告冲突并请求 Owner 裁定，不得自行改变固定决策。

---

## 12. v1.2.0 候选合同审阅验收

在 Owner 审阅前，本文件保持 CANDIDATE。提交正式审阅前至少确认：

1. 五项 Owner 决策逐字/逐义一致，无被弱化或重解释。
2. 三层关系只有各自唯一写入方，不存在共享写入。
3. Conversation ID 格式、account_id 必填和 fail-closed 行为一致。
4. Runtime Session ID 权威生成方为 Host/DSH。
5. Owner ID 为 `owner:<uuid>`，Persona 管理身份/link，Memory 只引用。
6. Speaker、Experiencer、Conversation 三者严格分离。
7. 群实体、实际成员、转发者、原作者分离。
8. 证据三维与有效性独立。
9. 旧记忆保护不被误解为“旧记录所有事实已验证”。
10. P0 顺序严格遵循 D5。
11. 未决物理 schema/实现方案明确标记 PROPOSAL/OPEN。
12. 无任何实施、迁移、部署或生产授权暗示。

Owner 可对本候选稿提出修改。只有 Owner 明确确认后，才能将其升级为正式合同版本或冻结；即便合同获批，代码实施仍需单独授权。

---

## 13. 当前状态

- 三方专项报告：**READY_FOR_REVIEW**。
- 本文件：**v1.2.0 CANDIDATE / OWNER REVIEW REQUIRED**。
- 联合合同：**NOT FROZEN**。
- Memory v6：**NOT_STARTED**。
- Persona v3：**NOT_STARTED**。
- EI-2A：**NOT_STARTED**。
- 迁移/生产写入/部署：**NOT AUTHORIZED**。

本候选稿不改变任何代码、Schema、数据库、生产配置或运行状态。
