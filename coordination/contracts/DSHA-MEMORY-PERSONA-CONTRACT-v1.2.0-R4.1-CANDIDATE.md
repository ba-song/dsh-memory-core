# DSHA「汐」跨模块身份、会话与记忆数据契约 v1.2.0 R4.1（Owner 审阅候选稿）

- 状态：**R4.1 CANDIDATE / OWNER REVIEW REQUIRED / NOT FROZEN**
- 版本：v1.2.0-r4.1-candidate
- R4 基线：`cf20a50f0bfca8b9182a9e699e223b2359c00319`
- 维护仓库：`ba-song/dsh-memory-core`
- 配套模块：Channel Bridge、Persona/EI、Memory
- Owner：项目负责人（用户）；架构协调：GPT
- 本文性质：跨模块逻辑接口与数据语义候选合同。**不是实施授权、迁移授权、生产配置或当前实现合规证明。**
- 基础合同：v1.1.1-draft，commit `006bb5bfce5d031b49a60271fe0406b228b43e00`
- 本版依据：R3（commit `571b9d0a466e33b0dccb4b4542e0f8b6539670bc`）、三份 audit-07 专项只读报告，以及 Owner 对 R4 四项修订方向的明确批准。
- R4 性质：只补强逻辑边界与验收要求；不代表任何实现、Schema、数据库或生产状态已改变。

> 解释规则：Owner 已明确批准的原则属于本合同的固定约束；字段、表名、API、索引和物理迁移方案如未被 Owner 明确批准，均标记为 PROPOSAL/OPEN。任何实现与固定约束冲突时，不得以迁就现有代码为由修改 Owner 决策。

---

## 0. 版本目标、范围与权限

### 0.1 v1.2.0 R4 目标

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
- P0 修复顺序与跨模块验收要求；
- `publicBrief` / `handoffBrief` 等摘要出口的 current/history 边界；
- Memory `created_at`、Bridge `received_at` 与平台 `event_time` 的严格区分；
- 未校准 numeric confidence 的禁止写入条件；
- Persona 历史情绪与当前状态隔离、Owner consent 生命周期验收。

### 0.2 本轮授权范围

本轮只允许：

- 阅读和核对已有代码、Schema、测试及专项审查报告；
- 编写、讨论、修订本候选合同；
- 将 audit-07 已指出的跨模块接口缺口转化为明确逻辑约束和负向验收项；
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
- `event_time`：平台事件发生时间；缺失或非法时必须为 null，不得用接收时间或当前时间填充。
- `time_precision`：平台时间精度/可信程度；缺失或无法判断时为 `unknown`。
- `received_at`：Bridge 实际接收事件的时间，与 `event_time` 分开保存；不得被 Memory 当作 `valid_from` 的替代值。
- `raw_content` 或受控原文引用
- `source` / `source_id`：Bridge 来源/事件标识；不得与 Memory 内部 evidence source ID 混为一谈。
- `platform_speaker_fact`（原始平台发言者字段、来源及缺失字段；不代表 Memory 验证结论）
- `missing_fields`
- `envelope_version`

缺失的时间/身份字段必须显式保留为 null/unknown，不得以 `Date.now()`、群名、昵称或其他展示字段补齐。传输协议、字段类型、签名、幂等键、原文存储位置和隐私访问控制仍需实现设计确认。

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
- Bridge 的临时上下文、临时摘要和 handover 注入只能使用当前规范 `conversation_id` 范围内获准的数据；不得按 channel、群类型、昵称或共享目录回退到其他 conversation。缺少/无法确认 conversation_id 时必须 fail closed。
- Bridge 临时摘要必须标明来源 conversation 范围，并受会话范围与生命周期约束；具体 TTL、存储位置和审计字段仍为技术设计 OPEN。临时摘要/handover 不等于 Memory 历史回忆/参考通道。
- Memory 的历史回忆/参考通道由 Memory 负责提供和执行有效性、来源、主体及权限判断。Bridge 不得自行建立该通道、不得自行读取/拼接 legacy 或 unknown 历史记录，也不得把历史通道结果自动注入当前会话；任何跨会话读取必须经明确授权的受控接口。
- turn/transcript 进入 Memory 时，至少须保留 `conversation_id`、适用时的 `group_id`、可得的 `external_speaker_id`（缺失则 null）、Bridge `source_id`、`event_time`/`time_precision`、`received_at` 与 `missing_fields`。缺失字段不得伪造。
- digest 进入 Memory 时，必须可追溯其来源 conversation 范围、群范围（如适用）、生成时间、摘要是否包含原文及其授权/审计依据；不得把跨会话混合摘要当作单会话原文。
- handover 若仅用于当前会话运行，必须限定在当前 `conversation_id`；若拟进入 Memory 或跨会话使用，须经 Memory 受控接口，并记录来源范围、用途、创建者、授权依据及生命周期。不得默认包含其他会话原文。
- Bridge 不得决定 Memory 的 `valid_from_kind`、`verification_status` 或 `confidence_level`。平台事件时间缺失不得用 `received_at` 或当前时间伪造。
- 群聊 transcript/turn 必须保留 group_id 与可得的 external_speaker_id；缺失成员 ID 时保持 unknown，不得以昵称或群名补齐。
- `publicBrief`、`handoffBrief` 及任何面向当前运行会话的摘要出口，均视为 **current-summary API**，不得因其名称是 brief、handoff、摘要或 Owner todo/decision 而绕过 Memory current/history 边界。
- 这些 current-summary API 只能返回经 Memory 当前有效性、验证状态、主体/Conversation 范围、用途权限及来源检查确认可用于 current 的内容；`legacy`、`unknown`、未完成逐类批准的历史近似记录不得进入其结果。不得只在最终注入层过滤而允许其先进入摘要缓存、handoff payload 或下游合并。
- Owner todo/decision 的 Owner 归属本身不构成跨 Conversation 自动读取或注入授权；必须另有明确用途、范围和授权依据。缺少来源 Conversation、权限或有效性信息时 fail closed。
- History 结果只能由 Memory 的显式 history/历史参考接口返回，必须保留 typed channel 与不确定性标记；不得被 `publicBrief`、`handoffBrief`、普通 current 摘要、current merge 或当前会话注入消费。物理 API 名称/载荷字段仍为 PROPOSAL，须经接口设计审查。
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

**新记录默认值（Owner 已批准）：**
- 新写入的 Memory 记录，若没有足以支持明确把握度的独立证据与获批判断规则，必须设置 `confidence_level='unknown'`。
- 新记录的 numeric `confidence` 默认必须为 `NULL`；不得以 `1.0`、`0` 或其他数值伪装未知把握度。若未来确需写入 numeric confidence，必须先有明确、可审计的语义、校准规则及单独批准。
- 旧记录已有 numeric confidence 必须原值保留，不回填、不重算、不映射为 `confidence_level`；旧值的存在不代表已校准概率或新的等级判断。
- `confidence_level='unknown'` 与 numeric `confidence=NULL` 表示信息不足，不等于低置信度，也不得被调用方转换为默认高置信度。
- 未经单独批准的校准规则，不得由任何调用方显式或隐式写入 numeric `confidence`；包括固定常数、LLM/规则模型输出、合并加分和默认回填。此类新记录必须保持 `confidence_level='unknown'` 且 numeric `confidence=NULL`。
- `NULL` 默认要求物理 Schema 允许 NULL。当前审查基线存在 `NOT NULL DEFAULT 1.0` 冲突；nullable 列/新增字段/数据迁移均属于独立实施事项，必须另行取得 Owner 明确授权。未获授权或物理条件不满足时，相关实现验收为 BLOCKED，不得以 1.0、0、0.5 或其他替代数值绕过。
- 上述规则是数据语义合同，不授权修改现有 Schema/代码/数据库或执行迁移。

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

**时间字段语义补充（R4 固定逻辑约束）：**

- Memory `created_at` 仅表示该 Memory 记录被写入/创建的时间，不表示事件发生时间、接收时间或事实起效时间。
- Bridge `received_at` 仅表示 Bridge 接收平台事件的时间；不得被复制或解释为 Memory `created_at`、`event_time` 或 `valid_from` 的替代事实。
- `event_time` 仅表示平台/来源可支持的事件发生时间。缺失、非法或精度不明时必须保持 null/unknown；不得用 `Date.now()`、`received_at`、服务调用时间或 P4 处理时间补齐。
- `valid_from_kind='implicit'` 仅适用于新记录、记录类型本身确实从创建时起有效、且 `created_at` 是可信写入时间的情形；不得用于把接收时间或写入时间伪装成事件发生时间。若记录语义依赖事件发生时间而 `event_time` 缺失，则时间边界保持 unknown，不得生成 exact。
- 对于缺少可信时间的记录，不得仅凭 `created_at` 将其提升为当前事实；具体记录类别的时间近似规则仍须单独提出并经 Owner 批准。

候选 `superseded_at`：

- 只有存在可靠替代时间证据时才填写。
- 不得伪造替代时间。
- 被替代的旧记忆保留；当前视图与 as-of 历史视图分别正确。

所有实际检索、注入、合并、摘要和决策入口必须遵守统一有效性语义。不得只修复单一 recall 路径而遗漏 preference、remembered、session-index、handoff、rules、stable、graph、merge、P4 邻居、daily/weekly 等入口。

### 7.5.1 未知时间、历史近似与普通注入边界（Owner 已批准原则；仅适用于 Memory）

**适用范围：**本节仅适用于 Memory `memories` 及其有效性判断、检索、注入、摘要和合并入口；不适用于 Persona 的 `emotion_event`、`emotion_appraisal`、`emotion_episodes` 或 `emotion_timeline`。Persona 运行期情绪历史的时间质量、历史参考与当前情绪状态分离，由 P0-6/Persona 专项设计另行规定。

本节所列旧记忆保护原则已由 Owner 明确同意；它们是合同约束，不代表当前代码已经实现，也不构成迁移授权。

- **旧记忆整体保留**：不得因缺少新字段、时间不明或尚未完成迁移而批量删除、整体排除或统一降级旧记忆。原始文本及已有 numeric confidence 原值必须保留，不得把旧 numeric confidence 直接映射成新的 `confidence_level`。
- **历史近似记录**：旧记录具有一定历史参考价值、但时间精度不足时，可进入带有“历史近似/时间不确定”明确标记的 Memory 历史回忆与参考通道。该标记不等于 `confirmed`，也不代表记录仍是当前事实；不得仅凭此类记录作出重要决策。
- **时间完全未知的记录**：`valid_from_kind='unknown'` 表示无法建立可信时间边界。记录必须保留，但只能进入专门的不确定历史回忆/参考通道，并显式返回不确定性标记；不得进入普通 current-fact 注入，也不得单独支撑重要决策。
- **legacy**：`valid_from_kind='legacy'` 表示旧记录待按获批规则进行历史近似处理。它既不自动等于 INVALID，也不自动等于当前 VALID；不得仅因 legacy 缺少新字段就删除或整体排除。**在 Owner 对相应数据类别的近似规则明确批准前，legacy 记录一律不得进入任何 current-fact 检索结果、普通注入、current 摘要或 current 合并流程；是否附带标记不改变此禁止。**在此期间只能通过显式 history/历史参考通道读取，并明确标为 legacy/待判定。具体哪些数据类别可按何种时间依据近似，须另行形成迁移设计并经 Owner 批准。
- **implicit**：仅适用于新记录，且只有在 `created_at` 经校验可信、记录类型允许时才可采用；不得将 implicit 规则追溯套用于旧记录。
- **current 与 history 隔离**：普通 current-fact 检索结果、普通注入、current 摘要、handoff 摘要及 current merge 必须统一执行有效性、验证状态、来源、主体、Conversation 范围与权限过滤；`unknown` 不得进入任何 current 输出。历史通道结果不得被任何普通自动入口静默转入 current。
- 本条适用于所有 current-summary API，包括 Bridge `dyMemory.publicBrief`（群聊近期上下文摘要）与 `dyMemory.handoffBrief`（轮换/交接摘要），以及任何后续等价出口。不得只在最终 prompt 层过滤；摘要缓存、handoff payload、下游 merge 也必须在入口处过滤。
- History 结果只能由 Memory 显式 history/历史参考接口返回，必须保留 typed channel 与不确定性标记。current injector/summary/merge 收到 history payload 时必须明确拒绝，不得静默丢弃标记或转换为 current。建议错误码 `E_HISTORY_CHANNEL_MISUSE`（名称 PROPOSAL，拒绝语义为合同要求）；历史通道 API/物理实现仍为 OPEN。
- **证据状态独立处理**：`unverified`、`supported`、`confirmed`、`disputed`、`retracted` 与时间类型是不同维度。历史近似或时间未知不能自动提升验证状态；`retracted` 不得普通注入，`disputed` 不得静默选边。
- **禁止伪造**：来源、时间、身份或证据缺失时继续保持 unknown；不得为填充新字段而推测或编造。

**Persona 情绪历史边界（独立约束）：**不得把本节的 `valid_from_kind` 直接套用到 Persona 情绪时间线。Persona 的历史情绪是派生记录，不得伪装为 `direct_statement`；旧 numeric confidence/certainty 不得映射为 Memory `confidence_level`。时间未知或不可信的情绪记录不得更新/冒充当前 `emotion_state`，须通过明确标记的历史参考方式读取；具体字段、接口和迁移由 Persona 专项设计提出并另行审查。

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

负向测试必须放入其他会话独有哨兵文本并断言命中数为 0。另须覆盖以下旧/历史数据路径（测试编号可在实现测试计划中细化）：

- 旧 `legacy_unmapped` 会话/消息不得进入新规范 `conversation_id` 的当前上下文；旧/新同群或同私聊必须隔离。
- Memory `legacy` / `unknown` 历史记录不得进入普通 current-fact 注入；只有显式历史参考查询可返回，并保留时间/验证不确定标记。
- Bridge 的 `buildSessionContext`、group fallback、digest 与 handover 不得消费其他 conversation 或 Memory 历史参考通道内容。
- 对 `dyMemory.publicBrief` 与 `dyMemory.handoffBrief` 分别放入 legacy、unknown、history-channel、跨 Conversation 哨兵及无授权 Owner todo/decision fixture；current-summary 输出命中数必须为 0。
- 验证摘要缓存、handoff payload 与下游 merge 在最终注入前已拒绝 legacy/unknown/history；不得只断言最终 prompt 没有这些内容。
- 缺失/非法平台 `event_time` 必须保持 null/unknown；不得等于 `received_at` 或由当前时间补齐。
- 缺失 sender ID 时 `external_speaker_id=null`；不得以群名、昵称或群实体替代。
- 旧 numeric confidence 原值必须保持不变，不得映射为新 `confidence_level`。
- 上述测试使用合成数据和临时数据库；不得以生产数据或真实渠道作为默认测试条件。

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
- binding 必须验证 canonical self、对应 conversation/runtime-session 关系、可信身份 evidence、状态及有效期；撤销、过期、冲突或证据失效时 fail closed。
- Persona 的身份解析接口（如 `identityOf`）在 Owner/Self 缺失、unknown、header 与 binding 冲突、binding 过期/撤销时必须返回明确 unknown/error，不得猜测身份。
- Owner identity 必须独立于平台账号事实；未取得 Owner 明确同意的跨平台账号关联不得确认为 Owner link；无回复或含糊回复不构成同意。
- Memory 拒绝 null、sentinel、非法 Self 及未经验证的 self episode；拒绝原因应有稳定错误类别（具体错误码命名由接口设计确认），且断言拒绝路径不落库。
- Owner identity absent/unknown 必须有独立负向测试；不得从平台白名单、昵称或单一账号事实推断 Owner canonical ID。
- Consent 无回复、模糊回复、相互冲突的 consent 证据均不得确认跨平台 link；撤销、过期、重新绑定必须有状态转换与旧 link 失效测试。
- `identityOf`（或等价解析接口）必须固定输出字段/错误类别，覆盖 Owner/Self absent、unknown、header-binding 冲突、binding expired/revoked/conflict/evidence revoked 等情形；不得以不稳定的任意对象或猜测结果代替。
- Binding 的 revoked/expired/conflict、证据撤销、Consent 撤销/过期后，旧 link/binding 不得继续被 Memory 作为可信身份依据。
- fresh DB、legacy DB、多次启动及并发初始化均须验证：不得因缺少 Self 而自动创建未经确认的 canonical Self。

### P0-4：有效性过滤

主要责任：Memory。

最低验收：

- 使用统一 VALID/INVALID/UNCERTAIN 语义。
- 所有实际注入、检索、摘要、合并和决策入口一致；必须逐入口断言 `legacy` 与 `unknown` 不进入 current。
- 覆盖 preference、remembered、session-index、handoff、episodeRecent、rules、stable、graph、merge、P4 neighbors、daily/weekly 等适用入口；不得仅以单一 recall 测试代替入口矩阵。
- history 通道只能由显式历史参考调用访问；history 结果必须保留通道类型和不确定性标记，普通 current 注入不得静默接收或转换 history 结果。
- 对 as-of 查询、被替代记录、current 摘要、daily/weekly 摘要及 merge 路径有明确正向/负向测试。
- 缺失时间不能默认解释为永远有效；不得以 `received_at` 或写入时间绕过有效时间缺失。
- current 结果的每一条记录必须能追溯其来源、时间语义、验证状态及适用 Conversation/主体范围；任一必要信息无法确认时 fail closed。
- `publicBrief`、`handoffBrief`、preference、remembered、session-index、episodeRecent、rules、stable、graph、merge、P4 neighbors、daily/weekly 与 recall 等入口必须逐入口提供 legacy/unknown 负向 fixture；仅测试 recall 或最终 injector 不构成覆盖。

### P0-5：重复证据与 confidence

主要责任：Memory。

最低验收：

- 同一 source 的副本、重复读取、引用、摘要不增加 evidence count 或 confidence。
- 只有新增、可追溯、相对独立证据才允许改变验证状态/把握度。
- 原 numeric confidence 保留；新旧模型不可无依据混算。
- 新记录默认 `confidence_level='unknown'` 且 numeric `confidence=NULL`；不得由 Schema/写入层或任何调用方静默/显式写入 `1.0`、`0` 或其他未获校准批准的数值。
- 显式 `confidence:null` 必须保持 NULL，不得经 `?? 1`、类型转换或归一化变为 1.0。
- 未获批准的 numeric 写入路径（包括 service、group turn、daily/weekly、LLM、P4、分类器、显式记忆及其他入口）必须被拒绝或改为 unknown+NULL；不得保留硬编码 0.6/0.7/0.8 等未校准值。
- 普通更新接口不得 PATCH 旧 numeric confidence；merge/consolidation 不得对旧值执行 `+0.02` 等重算或提升。旧值原样保留，任何变更必须有独立校准规则与 Owner 批准。
- 测试覆盖新记录默认值、显式未知值、旧 numeric 原值保留、NULL 与旧数值并存，以及重复来源不提升 confidence 的情形。
- 冲突证据保留并可审计。

### P0-6：Persona 时间线与事务完整性

主要责任：Persona。

最低验收：

- Timeline INSERT 列名与实际 Schema 一致。
- 不允许空 catch 静默吞掉关键持久化失败。
- `recordRuleEpisode` 的 event、appraisal、episode 写入必须在同一明确事务边界内；成功时验证预期 1/1/1，任一阶段失败时验证 0/0/0。
- `applyCoreAppraisal` 涉及的 emotion_state 与 timeline 更新必须原子提交或整体回滚；对 timeline 列错误、表/约束缺失和写入失败执行故障注入。
- 不允许空 catch 静默吞掉关键持久化失败；调用方必须能观察到失败结果，并有可审计的错误类别/日志信息。具体错误码和日志字段由接口设计确认。
- 成功测试验证预期行数、self_id 与归属关系；失败测试验证不存在部分成功。
- 身份切换历史有明确审计规则，不能把旧 timeline 静默改归到新 Self。
- 历史/时间未知的 Persona 情绪记录必须与当前 `emotion_state` 分离；不得仅凭旧 timeline 的数值时间或旧 numeric confidence/certainty 将其当作当前情绪状态。
- Persona 历史情绪查询必须显式标记为 history/historical，不得伪装成 current state；缺失或不可信的事件时间必须返回 unknown/time-uncertain 标记，不得用写入时间或查询时间补成事件时间。
- 历史情绪查询不得更新、重算或覆盖当前 `emotion_state`；current state 只能由符合当前运行期规则、身份绑定与时间条件的有效事件更新。
- 对历史情绪记录须区分原始 emotion score/intensity/certainty 与 Memory confidence；不得将其映射为 Memory `confidence_level`，不得把派生 appraisal 伪装为 `direct_statement`。
- 必须有负向测试：unknown-time 历史事件不改变 current state；history query 结果不能进入 current-state API；旧 timeline 不得因读取/摘要/重放而触发状态更新；身份切换后旧 timeline 不得改归新 Self。
- 历史情绪字段/查询接口的物理方案仍为 OPEN，须经 Persona 专项设计与审查。
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

## 12. v1.2.0 R4 候选合同审阅验收

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
13. `publicBrief` / `handoffBrief` 等 current-summary API 不得成为 legacy/unknown 或跨 Conversation 内容的旁路。
14. `created_at`、`received_at`、`event_time` 语义严格区分；不得以写入/接收时间伪造事件时间。
15. 未获批准的 numeric confidence 写入、PATCH 与 merge 加分均被禁止；nullable Schema 变更仍需单独授权。
16. Persona 历史情绪的 unknown-time 标记、current state 隔离与 Owner consent 生命周期均有明确负向验收。

Owner 可对本候选稿提出修改。只有 Owner 明确确认后，才能将其升级为正式合同版本或冻结；即便合同获批，代码实施仍需单独授权。

---

## 13. 当前状态

- 三方 audit-07 报告：**READY_FOR_REVIEW**。
- 本文件：**v1.2.0 R4 CANDIDATE / OWNER REVIEW REQUIRED / NOT FROZEN**。
- 联合合同：**NOT FROZEN**。
- Memory v6：**NOT_STARTED**。
- Persona v3：**NOT_STARTED**。
- EI-2A：**NOT_STARTED**。
- 迁移/生产写入/部署：**NOT AUTHORIZED**。

本候选稿只修订合同文字和逻辑验收要求；不改变任何代码、测试、Schema、数据库、生产配置或运行状态。

---

# R4.1 修订增补（基于三方 R4.1 专项只读审查）

- 版本：`v1.2.0-r4.1-candidate`
- 状态：**R4.1 CANDIDATE / OWNER REVIEW REQUIRED / NOT FROZEN**
- 基线：R4 @ `cf20a50f0bfca8b9182a9e699e223b2359c00319`
- 三方审查报告：
  - Memory：`b6674832a86ce43278fe814373146e7d1b696d6d`
  - Persona/EI：`4680c763ab31836641182ede5d80394b51440660`
  - Channel Bridge：`bf9a570a49df36675a0db88feacefbe19fac9ae4`
- 本增补只修订逻辑合同和验收要求；不修改源码、测试、Schema、数据库或生产状态，不授权迁移、部署、真实渠道操作或模块升级。

## R4.1-A. 解释与优先级

1. 本增补与 R4 原文共同构成 R4.1 候选稿。若两者存在不一致，以本增补对相应主题的更具体约束为准；Owner 已批准的 D1–D5 固定决策始终优先。
2. 本增补中的 **REQUIRED** 表示合同必须明确的逻辑约束/验收要求；**PROPOSAL** 表示候选字段、命名或策略，尚未获得 Owner 对物理实现的批准；**OPEN** 表示必须进一步设计或由 Owner 裁定；**NOT_SUPPORTED** 表示不得采用的语义或推导。
3. 三份专项报告的 READY_FOR_REVIEW 只表示报告交付完成。报告中代码差距仍按其证据记为 REJECT/PARTIAL/NOT_IMPLEMENTED/NOT_RUN；本增补不把合同修订等同于实现通过。
4. 任何字段名、错误码、物理表、索引、Schema 版本、API 传输格式及存储方案，除明确标为逻辑要求外，均不因本增补而自动冻结。

## R4.1-B. Memory 历史参考过渡通道与通道标记

### B.1 过渡只读历史参考（REQUIRED）

在正式 history API 获 Owner 批准并完成验收之前，Memory 必须保留一个明确的只读历史参考路径，使符合权限的旧记忆仍可用于回忆/参考，而不被误当作 current。调用方必须显式声明 `history/reference` 用途；不得由 current retrieval、current injection、current summary 或 current merge 隐式调用。

该过渡路径必须：
- 只读，不修改旧原文、旧 numeric confidence、来源、时间或身份字段；
- 对 legacy/unknown 如实标记，不补造来源、事件时间、身份或验证结论；
- 返回可识别的历史/不确定性信息；
- 拒绝将结果用于 current 用途；
- 不得经缓存、handoff payload、摘要、重放或 merge 转为 current；
- 在正式 history API 获 Owner 批准并通过实施验收后，只有 Owner 明确批准切换/终止，才可关闭过渡路径。切换时间、迁移版本和执行方式均 OPEN，不设定日期或自动 cutover。

该要求落实 Owner 已批准的旧记忆保护原则，不代表允许 legacy/unknown 进入 current，也不授权任何历史数据写入或迁移。

### B.2 唯一权威 channel 标记（REQUIRED 语义；字段名 PROPOSAL）

Memory 的跨模块载荷必须有唯一、明确的通道判别。候选字段为：
`channel: 'current' | 'history'`（字段名 PROPOSAL，单一权威判别语义 REQUIRED）。

- history 载荷必须携带历史/不确定性元数据，至少包括 `valid_from_kind`、`approximated`、`verification_status`、`confidence_level`；字段适用性及物理表示需按记录类型定义。
- current retrieval/injection/summary/merge 收到 `channel='history'`、缺失通道标记或无法识别的标记时，必须拒绝；不得默认当作 current。
- 同一载荷出现互相冲突的通道标记时必须拒绝，不得静默选择其中一个。
- 缓存、handoff、摘要和 merge 必须保留通道标记；不得在中间层剥除。
- 建议错误码 `E_HISTORY_CHANNEL_MISUSE` 为 PROPOSAL；稳定可观察的拒绝语义为 REQUIRED。
- 旧调用方兼容清单尚未定义；未明确登记为受控 current 兼容路径前，缺失标记不得默认放行。

### B.3 当前摘要/上下文出口清单（REQUIRED 清单；分类与细节 OPEN/PROPOSAL）

以下出口至少纳入 current/history 过滤矩阵，并逐项声明来源、Conversation/scope 范围、用途/授权、有效性/验证状态、是否含原文、缓存与 merge 入口：
- `publicBrief`
- `handoffBrief`
- `buildDigest`
- `stable`
- `carryover`
- `shorttermRecent`
- 后续任何功能等价的摘要、上下文、handoff、replay、cache 或 merge 出口。

不得只在最终 prompt 过滤；生成入口、查询入口、缓存读取/写入、handoff payload、下游 merge 均须执行相同的 current/history 与 Conversation/权限约束。未完成逐项分类或缺少必要元数据的出口标记 OPEN，并 fail closed；不得凭函数名称推断其授权范围。

专项报告观察到的具体风险作为待验证基线，不直接视为永恒实现事实：
- Memory 报告指出 `publicBrief` 当前查询缺少 status/validity 过滤；
- `handoffBrief` 对部分 todo 仅按 status 查询，来源/授权/有效性载荷不足；
- `buildDigest` 存在跨房间 raw 汇总风险；
- `stable` 的 group 查询、`carryover` 的 cwd 查询及 `shorttermRecent` 的 scope/TTL 语义仍需逐项确认。
以上均须在实施前按准确代码 HEAD 重新核验。

### B.4 implicit 时间边界（REQUIRED 默认规则；白名单 PROPOSAL/OWNER REVIEW）

默认禁止使用 `implicit`。只有记录类型被 Owner 明确批准列入白名单，且该类型语义确实自创建时起有效、`created_at` 明确表示 Memory 写入时间时，才可采用 implicit。

Memory 专项提出的初始候选（均为 PROPOSAL，未获 Owner 批准前不得视为白名单）：
- `episode`：仅限实时会话本身构成事件、来源明确的记录；
- `fact`/`preference`/`relation`：仅限 direct_statement 且明确表达“自记录时起有效”的情形；是否要求额外 basis 标记 OPEN。

导入、迁移、consolidated daily/weekly、LLM 推断、历史补全和 legacy 记录不得因写入时间而自动获得 implicit。事件时间缺失且语义依赖事件发生时间时，必须保持 unknown/time-uncertain。不得把 `received_at`、事件时间或 `Date.now()` 伪装为 `created_at`。

### B.5 旧 numeric confidence 的读取语义（PROPOSAL；Schema OPEN）

Memory 专项提出旧行使用 `confidence_level='unknown'` 并以候选 `confidence_kind='legacy_numeric'` 标记旧 numeric 仅为历史原值；numeric 原值保持不变，不回填、不重算、不映射等级。读取方不得使用该旧 numeric 参与排序、门控、注入优先级、决策或 high/medium/low 映射，只能在需要时作为原值展示。

该方案整体为 PROPOSAL，不是 Owner 已批准的 Schema 决策。新增字段、nullable 变更、迁移或写入均需单独授权。现阶段固定约束仍是：新记录 `confidence_level='unknown'`、numeric confidence 为 NULL；旧 numeric 原值保留。

### B.6 Memory 负向验收扩展（REQUIRED）

必须按入口分别提供合成 fixture、预期拒绝行为及可观察证据，至少覆盖：
- `updateMemory` 对旧 numeric confidence、`valid_from`、`superseded_by`、`status` 的 PATCH/升级 current 风险；
- 若保留 `memory_evidence`，验证既有证据不可被 UPDATE/DELETE/PATCH 静默改写；更正采用可审计追加方式（物理接口 OPEN）；
- `publicBrief` 对 legacy/unknown/expired/superseded public 记录的零输出；
- `handoffBrief` 对缺少来源 Conversation、用途、授权或有效性的 Owner todo/decision fail closed；
- `buildDigest` 对其他 Conversation 原文哨兵零命中；
- `stable`/`carryover`/`shorttermRecent` 的 legacy/unknown 与跨 Conversation 隔离；
- 缓存、payload、handoff、merge 旁路不得将 history/legacy/unknown 转为 current；
- history misuse 拒绝必须可通过返回结果、错误类别或审计证据观察。
不得仅以最终 prompt 没有内容代替入口级断言。

## R4.1-C. Persona 时间、身份解析与历史情绪边界

### C.1 Persona 时间语义（REQUIRED）

- `emotion_event.at` 与 `emotion_timeline.at` 表示事件发生时间。
- `emotion_state.updated_at` 表示当前情绪状态被写入/计算的时间，不是事件发生时间。
- 未来新增的 `created_at` 若存在，只表示记录创建/写入时间，不得替代事件时间。
- 接收时间、写入时间、查询时间、处理时间及 `Date.now()` 均不得补造缺失/不可信的事件时间。
- 缺失或不可信事件时间必须保持 unknown/time-uncertain；历史查询必须返回时间质量标记。逻辑质量至少能区分 exact、approximate、unknown、legacy；物理字段名 OPEN。
- unknown-time 历史情绪不得更新、重算或覆盖 current `emotion_state`。

### C.2 identityOf 最小逻辑输出（REQUIRED 语义；字段/物理名 OPEN）

Persona 必须提供稳定、可测试的身份解析结果（函数名 `identityOf` 为 PROPOSAL；等价接口可接受）。逻辑输出至少表达：
- canonical `self`：合法 `self:<uuid>` 或 null；
- canonical `owner`：合法 `owner:<uuid>` 或 null；
- `subject_type`：self/owner/third_party/unknown；
- `subject_id`：对应 canonical ID 或 null；
- `valid`：当前结果是否有效；
- `reason`：至少可区分 absent、unknown、conflict、expired、revoked、invalid；
- `source`：身份事实来源；
- `issued_at` 与 `expires_at`：如适用，缺失保持 null。

具体物理字段名、错误码及是否增加 `id_strength` 等字段 OPEN。不得将 `role_only` 视为稳定身份或写入授权；其显示层用途仍 OPEN/PROPOSAL。不得返回有效的 `self:unknown`。

身份门禁必须覆盖 Self/Owner 缺失、非法、多 active、并发、header-binding 冲突、binding 过期/撤销、证据撤销，以及 consent 无回复、模糊、冲突、撤销、过期和重新绑定。不得从平台白名单、昵称、头像、单一账号事实、role、cwd 或 private/group 类型推断 Owner canonical ID。未取得 Owner 明确同意不得建立跨平台 Owner link；撤销后旧 link 必须失效。Owner bootstrap、恢复、轮换及 Owner episode 写入政策继续 OPEN。

### C.3 Persona history/current-state API（REQUIRED）

- current-state API 只能由符合当前运行期规则、身份绑定有效且事件时间可信的当前事件更新。
- history query 必须只读并显式标记为历史，返回时间质量及适用的来源/验证信息。
- history query 不得写入、重算或覆盖 `emotion_state`，不得触发 timeline 写入。
- summary/replay 不得把 history 结果静默转成 current，也不得触发状态更新。
- Memory 的 `valid_from_kind`、`confidence_level` 和 Memory 三维证据模型不得直接套用到 Persona 情绪记录。
- Persona score/intensity/certainty 与 Memory credibility/confidence 独立；不得互相映射。派生 appraisal 不得伪装为 `direct_statement`。

### C.4 旧情绪记录的截断与来源限制（REQUIRED）

Persona 旧记录可能只保留截断的 `emotion_event.excerpt`、`emotion_timeline.trigger` 或派生 `cause`。现有专项审查报告指出 excerpt/trigger 存在长度截断；此类记录不得被描述为完整原始聊天。

- 不得从截断字段反推完整原文、精确时间、身份或证据。
- 原始聊天应由 Memory raw 或受控来源引用负责；Persona 保存派生情绪记录及其引用。
- 来源、时间或身份缺失时保持 unknown。
- 补全只能追加可追溯元数据，不得覆盖旧 excerpt/trigger。
- 查询可返回 truncated/partial 等逻辑标记（字段名 OPEN）；不得承诺恢复不存在的原文。

### C.5 Persona P0-3/P0-6 验收扩展（REQUIRED）

P0-3 至少覆盖：Self 缺失/非法/sentinel/多 active/并发；Owner absent/unknown；consent 无回复/模糊/冲突/撤销/过期/重绑；binding 冲突/过期/撤销/证据撤销；identity resolver 的固定字段与 reason。每个场景断言输出、拒绝原因及数据库行数/状态不变。

P0-6 至少覆盖：
- `recordRuleEpisode` 成功时 event/appraisal/episode 预期 1/1/1；任一阶段失败时整体 0/0/0；
- `applyCoreAppraisal` 的 state 与 timeline 原子性；
- timeline 列错误、表缺失、约束失败的故障注入与回滚；
- 不允许空 catch 静默吞错，错误必须可观察；
- 身份切换后旧 timeline 不得改归新 Self；
- history query、摘要、重放及 unknown-time 事件不得改变 current state。

必须分别验证 fresh 与 legacy Schema；每项提供 fixture、预期、exit code/断言/行数/错误类别或日志证据。既有 303/303 测试通过不能代替 R4.1 专项验收。

## R4.1-D. Channel Bridge 授权、来源链与受控 ingestion

### D.1 publicBrief 跨 Conversation 分享（REQUIRED）

`publicBrief` 是跨 Conversation 的公开摘要出口，不是默认授权。public scope 本身不构成 Owner 的公开分享许可。跨 Conversation 输出必须同时满足：
- 存在 Owner 明确授权或 Owner 明确配置的 public-sharing 授权依据；
- 来源 Conversation、目标范围、用途、内容范围及有效期可追溯；
- 内容经过 Memory current 有效性/验证/主体过滤；
- 不包含原始对话全文、昵称/群名身份推断或未经授权的 Owner todo/decision；
- 结果携带逻辑上的来源 Conversation、授权引用、生成时间、到期时间、审计引用和内容范围；
- 授权缺失、来源不明、范围不符、撤销/过期或元数据缺失时 fail closed，不注入、不缓存、不 merge。

字段名/存储/TTL 物理实现 OPEN。Bridge 必须复核返回载荷元数据；但 Bridge 单独过滤不能替代 Memory 的数据有效性与授权过滤。

### D.2 handoffBrief 逻辑载荷（REQUIRED 语义；字段名/存储 PROPOSAL/OPEN）

输入至少表达 source Conversation 范围、target Conversation、purpose、授权依据、请求范围与请求时间。输出至少表达摘要文本、source Conversation 范围、source scope、是否含原文、validity/current 状态、legacy/unknown 状态、授权引用、生成/到期时间和审计引用。

Owner todo/decision 不得仅凭 Owner 归属跨 Conversation。只有来源范围明确、purpose 明确、授权有效且记录 current/有效时才可返回。任一必要信息缺失时 fail closed。Bridge 不得把 handoffBrief 结果作为跨 Conversation 可复用摘要缓存；handoff payload 必须保留来源/授权/有效性元数据并在目标 Conversation 注入前复核。

### D.3 多跳转发、引用与 notice 来源链（REQUIRED 语义；结构 PROPOSAL）

Envelope 必须能区分当前消息 speaker、每一跳 forwarder、原始作者、quote 作者，以及群 notice 的 actor/operator/target。建议使用 `forward_chain[]` 保存多跳链，并保留 `quote_author_id`/`quote_message_id` 与 notice `actor_id`/`operator_id`/`target_id`。具体 JSON 结构 PROPOSAL；平台不可提供的 ID 保持 null/unknown，不得以昵称、群名、群实体或转发者替代。

P0-2 必须增加可执行矩阵：
- 群 A 成员发言：group_id 与 external_speaker_id 分离；
- 缺 user_id：speaker/experiencer unknown，不用群名/昵称；
- 同名不同 ID 不合并；
- 同一成员在群 A/B 仍按 Conversation 隔离；
- 多跳转发每跳可追溯，speaker/forwarder/original author 分离；
- quote 作者与当前 speaker 分离；
- notice actor/operator/target 分离，缺失 unknown；
- 群实体只作为 group/scope，不作为 speaker。

### D.4 Memory 受控 ingestion 接口（REQUIRED）

任何进入 Memory 的 group turn/transcript/digest/handover 必须通过 Memory 明确批准的受控 ingestion API。现有 `saveGroupTurn`/`saveGroupTranscript` 在未被 Memory 正式定义并验收为受控接口前，逻辑状态为 legacy/unapproved，不得作为绕过路径。

若后续保留为受控 API，至少须接收 conversation_id、适用时的 group_id、external_speaker_id/null、Bridge source_id、event_time/time_precision、received_at、missing_fields，并返回结构化结果/错误类别。Bridge 不得传入或决定未经批准的 numeric confidence、verification、validity 或 canonical speaker/experiencer。缺少必要 Conversation 信息必须拒绝；缺失 speaker/time 保持 null/unknown，不得用群名、received_at 或 Date.now 补造。群 transcript 不得依赖跨 Conversation 共享目录作为隔离依据。

具体 API 名称、物理字段和兼容/退役方式 OPEN；不得把当前实现视为已合规。

### D.5 Conversation/account/session 逻辑补充（REQUIRED 语义；物理 OPEN）

- `account_id` 明确指接收该消息的机器人/登录账号 ID，不是 peer ID、群 ID 或 Owner canonical ID；来源须为可信 Host/DSH 登录上下文或平台登录信息。缺失、空值或不可信时 fail closed。
- 旧 key/旧行保持 `legacy_unmapped` 逻辑状态，只读，不参与 current context、summary 或 merge；不得通过最近同 kind、昵称或群名推断映射。
- 同一规范 Conversation 在同一有效版本下只能有一个 active Runtime Session；冲突必须拒绝并保留轮换历史。
- Host/DSH 是 Runtime Session ID 权威 mint 方。Host mint 插件上下文可用性仍 BLOCKED/NOT_RUN；未验证前新会话创建必须 BLOCKED，不得回退 Bridge randomUUID。
- 物理 status、唯一索引、轮换记录、account_id 格式和 API 仍 OPEN，实施前需单独设计审查。

### D.6 Bridge 缓存、fallback 与上下文出口（REQUIRED）

Bridge 的 publicBrief/handoffBrief 结果、handover cache、rotation seed、group context、fallback、临时摘要和 payload 必须保留来源 Conversation、目标 Conversation、用途/授权、current/history 标记及有效期。缺少或冲突时 fail closed。不得按 channel、群类型、共享 cwd、昵称或最近同 kind 记录回退到其他 Conversation。Bridge 过滤必须与 Memory 的入口过滤配合，不能只依赖最终 prompt。

## R4.1-E. 跨模块 P0 验收扩展

### E.1 P0-1 出口与旁路矩阵（REQUIRED）

对 B.3 列出的每个出口逐一提供合成数据测试，至少包含：
- legacy、unknown、expired、superseded 与 history-channel 记录；
- 跨 Conversation 原文哨兵及无授权 Owner todo/decision；
- 缺失/冲突 channel marker、来源、授权、validity 元数据；
- cache、payload、handoff、merge 中间态旁路。

断言必须发生在对应入口/中间层，记录 0 输出、拒绝类别、审计记录或状态/行数不变。不得只断言最终 prompt 无内容。各出口的业务分类或授权语义尚未确认时保持 OPEN，并在确认前 fail closed。

### E.2 P0-2 来源链矩阵（REQUIRED）

按 D.3 的 T-A1～T-A8 覆盖群成员、缺 sender、同名异 ID、跨群同成员、多跳转发、quote、notice、群实体边界。平台不提供的字段必须保持 unknown，并验证无错误归属。

### E.3 P0-3/P0-6（REQUIRED）

按 C.5 执行 identityOf、Owner consent 生命周期、Self fail-closed、Persona 事务与时间线矩阵。测试报告必须标明 fresh/legacy schema、故障注入、行数/回滚和错误可观察证据。

### E.4 报告标准（REQUIRED）

每项报告准确 commit/branch、源码路径/行号/符号、Schema 版本、测试命令、fixture、预期/实际结果、exit code、未覆盖范围和 NOT_RUN 项。既有 562/562、303/303 或其他历史测试总数不能替代 R4.1 语义验收。

## R4.1-F. 明确保留的 OPEN / PROPOSAL / NOT_SUPPORTED

以下事项没有被三份报告或本次修订自动批准：
- Memory `confidence_kind='legacy_numeric'` 的物理字段、旧行回填及 nullable Schema 变更；
- Memory implicit 初始白名单的最终成员与 basis 字段；
- History API 的物理接口、载荷存储、近似时间策略及过渡通道实现细节；
- `channel`、`E_HISTORY_CHANNEL_MISUSE` 等命名是否采用；
- `identityOf` 物理字段/错误码、`id_strength`、`role_only` 语义；
- Owner bootstrap、恢复、轮换、Owner episode 写入政策；
- Persona 历史情绪物理字段、截断标记字段名与迁移；
- public-sharing 授权记录的物理模型、TTL、撤销机制；
- handoffBrief 的物理输入/输出字段、审计存储；
- `forward_chain[]` 的精确 JSON schema 及平台能力差异；
- saveGroupTurn/saveGroupTranscript 的最终保留、替换或退役方案；
- account_id 的具体规范格式、Host mint API 的插件可用性、session 唯一约束物理实现；
- buildDigest/stable/carryover/shorttermRecent 的最终逐项业务分类；
- 任何 Schema/DB 迁移、回填、cutover、部署或生产变更。

明确 NOT_SUPPORTED：
- public scope 自动等同 Owner 公开授权；
- Owner todo/decision 仅凭 Owner 归属即可跨 Conversation；
- Bridge 单独过滤即可替代 Memory 入口过滤；
- 使用群名/昵称/群实体代替 actual speaker；
- 用 received_at、created_at、查询时间或 Date.now() 伪造事件时间；
- 将 Persona emotion score/intensity/certainty 映射为 Memory confidence；
- 将 `role_only` 作为稳定身份或写入授权；
- 以既有测试套件通过证明 R4.1/P0 实现通过。

## R4.1-G. 剩余 Owner 待决事项与状态

OD-R4.1-01 已批准将本候选稿中明确标记为 REQUIRED 的逻辑约束作为下一阶段架构协调基线。以下事项仍未获批准，继续保持 OPEN/PROPOSAL，不得推定：

1. B.4：implicit 初始白名单的最终成员、适用条件及 basis 字段。
2. B.5：旧 numeric confidence 的读取/展示限制是否采用为正式语义；任何 Schema 变更仍须单独授权。
3. B.1：历史过渡路径的具体接口、可访问范围、审计方式及终止/切换方案；不设自动 cutover。
4. D.1/D.2：public-sharing 授权记录、允许内容范围、handoffBrief 物理载荷、TTL、撤销和审计存储。
5. C.2：identityOf 的物理字段、错误码及额外强度字段；Owner bootstrap、恢复、轮换与 Owner episode 写入政策。
6. B.3/D.6：各摘要、缓存、fallback、handoff 与 merge 出口的逐项业务分类和物理实现。
7. D.3/D.4/D.5：多跳来源链 JSON schema、受控 ingestion API、account_id 具体格式及 Host mint API 实际可用性。
8. 所有 Schema/数据库迁移、回填、cutover、部署、生产配置和真实渠道操作。

本文件仍为 **R4.1 CANDIDATE / NOT FROZEN**。OD-R4.1-01 只批准 REQUIRED 逻辑约束作为协调基线，不代表合同整体 PASS，不代表任何实现已合规，也不构成实施授权。后续只读审查应优先验证各 REQUIRED 约束在准确代码基线上的可执行性与跨模块一致性；发现冲突时先记录证据和建议，不得自行修改实现。

---

## R4.1-H. Owner 决策记录

### OD-R4.1-01 — REQUIRED 逻辑约束作为下一阶段协调基线

- 决策状态：**APPROVED**
- 决策日期：2026-11-22
- Owner 决策：同意将 R4.1 中明确标记为 REQUIRED 的逻辑约束，作为下一阶段架构协调与技术仲裁基线。
- 保留条件：
  - 所有 PROPOSAL 与 OPEN 项继续保持待定，不因本次同意自动升级为批准决定；
  - 本次同意不冻结 R4.1，不代表合同整体 PASS；
  - 本次同意不授权源码、测试行为、Schema、数据库、迁移、回填、部署、生产配置、Owner 身份绑定或真实渠道操作；
  - 任何可能改变汐实际状态或行为的实施，仍须另行取得 Owner 明确授权。
- 执行解释：架构协调者可在既有 Owner 固定决策及本次批准的 REQUIRED 逻辑约束范围内，自主完成只读审查、跨模块冲突仲裁和文档整理；遇到必须由 Owner 决定的 OPEN/PROPOSAL，不得自行推定。

