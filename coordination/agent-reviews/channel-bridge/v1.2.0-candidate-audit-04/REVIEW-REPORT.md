# v1.2.0 候选合同 · Channel Bridge 专项复核

- 任务：v1.2.0 候选合同专项复核（Channel Bridge）
- 角色：Channel Bridge 渠道接入与会话桥接专项负责人
- 性质：只读技术复核；不修改合同、源码、测试、Schema、数据库、生产配置；不连接真实 QQ/NapCat；不发送真实消息；不修改 Conversation ID；不切换 Runtime Session mint；不实施群归档/上下文修复。
- 报告状态：**READY_FOR_REVIEW**
- 合同状态：**CANDIDATE / NOT FROZEN**
- 当前 Bridge 实现：**REJECT / PARTIAL / NOT_IMPLEMENTED**（详见逐项）
- 生成时间：2026-11-22（Asia/Shanghai）

---

## 0. 总体结论

v1.2.0 候选合同在 **§3 会话域、§5.2–§5.6 消息 Envelope 与写入边界、§9 P0-1/P0-2** 上整体方向正确，较 v1.1.1 明显收紧了 Owner 决策、三层关系、account_id、Host/DSH session 权威和 Bridge/Memory 写入边界。但仍有若干 **可实现性/边界歧义**：

- `account_id` 的语义（接收消息的机器人账号）和格式没有明确写死；`legacy_unmapped` 的物理标记/查询规则未定。
- Runtime Session 的 Host mint 方向已写清，但 Host API 在 Bridge 插件上下文的可用性仍未验证（合同 §11 已标 BLOCKED/NOT RUN）。
- `speaker_evidence` 与 Memory 的 evidence 语义容易混淆；§5.6 的“Memory 受控接口”没有指定现有 `saveGroupTurn`/`saveGroupTranscript` 是否算受控接口。
- 临时上下文/会话摘要/长期记忆的边界只有原则，没有 TTL、scope、conversation 过滤和审计细节。
- 群聊转发链（多跳）与 notice actor/operator 未被 Envelope 完整覆盖。
- P0-1 覆盖较全；P0-2 有明确语义但缺少可执行的负向测试矩阵与多跳转发用例。

**结论**：合同可作为候选继续修订；当前 Bridge 实现不能作为落地基线；不冻结合同、不标记整体 PASS。

---

## 1. 基线与阅读材料

| 对象 | 值 |
|---|---|
| 合同 | `ba-song/dsh-memory-core` 分支 `docs/memory-persona-contract-v1.2.0-owner-review` @ `1dced58a8093222a70853668fca6cf35cf7674ed` |
| 合同 tree | `b2a1ea0f75b723586bffaa702690142697debf8a` |
| 合同 blob | `2b821169a61f39dab9b7ede37f580ba428d1b2e4`（790 行） |
| Bridge 代码 | `ba-song/dsh-channel-bridge` main @ `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` |
| Bridge tree | `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| Bridge package | `dsh-channel-bridge@0.18.0` |
| 生产 Bridge 源码 | `/root/.dsh/plugin-src/dsh-channel-bridge`；与 main HEAD `diff -rq` 无差异（只读核对） |
| Bridge 测试 | `npm test` @ `bffcabc`：**562/562 pass / 0 fail / 0 skip，exit 0**（fake transport） |

合同关键行号（用于复核）：

| 章节 | 行号 |
|---|---|
| §3.1 Conversation ID | 211–233 |
| §3.2 Runtime Session | 234–241 |
| §3.3 Conversation↔Session 记录 | 242–263 |
| §3.4 旧会话兼容 | 264–273 |
| §5.2 Envelope | 334–357 |
| §5.3 发言者字段 | 358–367 |
| §5.4 群聊规则 | 368–376 |
| §5.5 Memory 唯一写 | 377–388 |
| §5.6 Bridge/Memory 边界 | 389–398 |
| §9 P0-1 | 599–615 |
| §9 P0-2 | 616–629 |

已读合同全文（§0–§13），重点逐行核对 §3、§5.2–§5.6、§9 P0-1/P0-2、§6 RACI、§10 基线、§11 未决项、§12 验收。已读 Bridge 源码与 DSH Host 包：

- Bridge：`lib/parse.js`、`message.js`、`sessions.js`、`store.js`、`context.js`、`router.js`、`prompt.js`、`index.js`、`unified.js`、`handover.js`、`group-buckets.js`、`group-followup.js`、`group-turn-memory.js`、`group-digest.js`、`forward.js`、`quote.js`、`notice.js`、`tools.js`、`status.js`、`config.js`；
- DSH：`@deepseek-ai/dsh-api-session-controller`（`createSession`/`createMinted`）、`@deepseek-ai/dsh-agent`（`agents.create` 的 `sessionId` 参数）。

---

## 2. 逐项复核

### 2.1 §3 Conversation ID：**PARTIAL（合同）/ REJECT（当前实现）**

**合同要求（§3.1–§3.4）**

- 唯一格式：`conv:qq:<account_id>:private:<peer_id>` / `conv:qq:<account_id>:group:<group_id>`；
- `account_id` 必填；私聊 `peer_id`、群聊 `group_id` 必填；
- 不得删除非数字字符等有损归一化；不得用昵称/群名/正文/随机数/默认字符串；
- 缺字段 fail closed，不生成 unknown，不进入普通上下文/长期记忆/跨会话摘要；
- 旧 `group:<gid>`/`private:<peer>`/更早 `group`/`private` 保为 `legacy_unmapped`，不自动迁移/合并/改写；
- 逻辑记录含 conversation_id/runtime_session_id/platform/account_id/chat_type/peer/group/created/updated/rotated/mapping_version/source/audit/status；
- 同一 conversation 不得同时指向冲突的 active runtime session；轮换历史模型待实施设计。

**合同清晰度**

- 格式、必填字段、有损归一化禁令、fail-closed、legacy 原则都清楚；与 Owner D2 一致。
- **PARTIAL** 的原因：
  1. `account_id` 的语义未写死。合同只说“平台账号 ID”；应明确是**接收消息的机器人/登录账号**（不是私聊对方、不是 Owner 账号）。否则多机器人场景仍可能把 account 理解为对方账号。
  2. `account_id` 的格式/来源未定义：QQ 号字符串？`self_id`？`get_login_info` 返回值？缺失时如何 fail-closed？需要实现设计。
  3. `legacy_unmapped` 的物理表示未定：是 `channel_sessions.status` 列、独立表、还是 `mapping_version`？需要至少一个可查询的 status/version。
  4. “同一 conversation 不得同时指向冲突 active session”是逻辑约束；唯一索引/轮换历史/`prev_session_id` 规则未定，属于实施设计。
  5. “未映射的新消息不得进入普通上下文/长期记忆/跨会话摘要”清楚；但 Bridge 自身 raw event 是否可保留用于审计、是否可进入 Bridge 的 `channel_events`，合同未明确“允许 Bridge 本地 raw 审计、禁止进入 Memory”这一层。建议在 §3.1 或 §5.6 明确。
  6. owner 私聊/home 是否也必须使用 `conv:qq:<account_id>:private:<owner_peer>` 并记录映射，合同未特别说明；D2 的格式本身包含 private，应明确 unified/home 不能例外。

**当前实现**

- `keyFor(parsed)`：`group:<gid>` / `private:<qq>`；`String(raw).replace(/\D/g,'')`；空/非数字回退 `unknown`（`lib/sessions.js:119-124`）。**REJECT**：
  - 无 `account_id`；
  - 非 `conv:qq:...` 格式；
  - 有损剥字符（`12a34→1234`）；
  - 缺字段回退 `unknown`，不是 fail closed。
- `channel_sessions` 主键 `(channel, kind)`，`kind` 存旧 key；有 `session_id/prev_session_id/rotated_at`，无 `conversation_id/account_id/version/audit/status`（`lib/store.js:10-23,412-466`）。**PARTIAL**：有唯一 key，但缺合同字段。
- `forceRotate` 无精确 key 时按 `kind` 取最新行（`lib/sessions.js:324-352`），可能换错群/私聊；合同 §3.4 明确禁止“最近一条同 kind”推断，**REJECT**。
- 生产 DB 仍有旧式 `group`/`private` 行（只读快照 5 行中 2 行），当前无 `legacy_unmapped` 标记；**NOT_IMPLEMENTED**。
- `unified` owner 私聊直接走 home，不写 `channel_sessions`（`lib/unified.js:13-19,44-53`），因此没有 conversation_id→runtime session 映射；D2 的 private 格式未覆盖 home 例外，当前实现不满足。
- `parsed.isOwner` 只是 `owner.qqIds` 配置命中（`lib/parse.js:174,194`），是 Bridge 的临时提示，不是 canonical Owner ID；合同 §5.3 应明确它不得作为最终 Owner 身份。

**测试**

- 562/562 通过不覆盖 account_id、conv 格式、legacy、fail-closed；`multi-session.test.mjs` 只验证两个群/私聊分房，不验证多账号/旧行。
- 需要新增：多 account 同群 → 不同 conversation；缺 account/peer/group → 拒绝；旧 key → legacy 且不进上下文；`12a34` 不碰撞 `1234`；轮换唯一 active。

---

### 2.2 §3.2 Runtime Session ID：**PASS（合同）/ REJECT（当前实现）/ BLOCKED（Host 集成未验证）**

**合同要求**

- Host/DSH 是 Runtime Session ID 的权威 mint/generation 方；
- Bridge 不得自行生成随机 UUID 并宣称 Host 权威；
- Bridge 获得 Host ID 后记录 Conversation ↔ Runtime Session 映射；
- 如果 Bridge 插件上下文无法调用 Host mint 接口，新会话创建必须 **BLOCKED**，不得静默回退。

**合同清晰度：PASS**

- 责任、禁止回退、BLOCKED 条件都明确；与 D2 一致；§11 也把 Host mint API 插件上下文可用性列为 BLOCKED/NOT RUN，态度正确。
- 唯一可补充的是“Host/DSH”的准确服务名/API（例如 DSH `sessionController.createSession`）以及“resume 已有 session 不重新 mint”的规则；合同把 API 调用设计留给实施，可接受。

**当前实现：REJECT**

- Bridge 在 4 处 `randomUUID()` 生成 `sessionId` 后调用 `agents.create({sessionId,...})`（`lib/sessions.js:259,287,451,481`）；它不是 Host mint。
- DSH Host 包 `@deepseek-ai/dsh-api-session-controller` 的 `createSession(request)` 在 `request.sessionId === undefined` 时调用 `createMinted()`，生成 `session-${randomUUID()}`（Host 包 `lib/index.js:267-268,511-519`）；`@deepseek-ai/dsh-agent` 的 `agents.create` 需要 `sessionId`，不会自动 mint。Host 有权威路径，但 Bridge 没调用。
- Bridge 保存的 `channel_sessions.session_id` 是 Bridge 自建 UUID；缺 `session_producer/version/audit`，无法区分 Host 权威与 Bridge 自建。**REJECT**。

**Host 集成：BLOCKED / NOT_RUN**

- `ctx.sessionController` 在 Bridge 插件上下文是否可用、如何注入、`createSession` 返回值如何与 `channel_sessions` 映射，均未验证；合同 §11 已标 `BLOCKED / NOT RUN`。在验证前不得声称满足 §3.2。

**测试**

- 无 Host mint 集成测试；562/562 使用 fake agents，不证明 Host 权威。
- 需要：Host mint 成功→Bridge 记录同一 ID；Host 不可用→新会话创建 BLOCKED；不得回退 `randomUUID`；resume 已有 session 不重复 mint；Host ID 与 `channel_sessions` 一致。

---

### 2.3 §5.2–§5.6：Bridge 只提供平台原始事实：**PARTIAL（合同）/ REJECT（当前实现）**

**合同要求**

- Bridge 采集/传递平台原始事实；Memory 负责 canonical speaker/experiencer/evidence；Persona 负责 self/owner。
- Bridge 不得生成 canonical `speaker_id`、`experiencer_id`、Owner 身份（§5.1/§5.5）。
- Envelope 含 platform/account/conversation/runtime_session/chat_type/peer/group/external_speaker/forwarder/original_author/message_id/time/raw_content/source/speaker_evidence/missing_fields/version（§5.2）。
- §5.3 明确 external vs canonical；§5.4 群规则；§5.5 Memory 唯一写；§5.6 写入边界。

**合同清晰度：PARTIAL**

- 方向完全正确；`external_speaker_id` / `speaker_id` / `group_id` / `experiencer` 分离清楚；群实体不是成员、缺 sender 为 unknown、display 只作快照，均明确。
- 需补充/澄清：
  1. **`speaker_evidence` 命名**：它容易被理解为 Memory 的 evidence/verification。建议改名为 `platform_speaker_fact`（或明确其只含原始字段/缺失字段/来源，不含可信度结论）；否则与 §5.5 的“Memory 唯一写 evidence”语义重叠。
  2. **`source` / `source_id` 语义**：Envelope 同时列 `source` 与 `source_id`，但未说明 `source_id` 是平台 `message_id` 派生的幂等键、Bridge event id，还是 Memory evidence source。建议明确“Bridge source_id 只作传输幂等/审计键；Memory evidence source_id 由 Memory 生成”。
  3. **`raw_content` 与受控原文引用**：合同允许 raw_content 或引用，但未定义隐私/保留/访问控制；这属于实现设计，但应在合同中明确 Bridge 不得把其他会话原文塞进 Envelope/摘要。
  4. **Owner 平台账号事实**：§5.2 没有专门字段 `external_owner_account_id`/candidate link；D3 要求 Bridge 只提供平台账号事实。可以复用 `external_speaker_id`/`account_id`，但建议明确“候选 Owner 账号”如何表达，避免 Bridge 自行 `owner` 化。
  5. **§5.6 的“受控接口”未命名**：见 §2.5。

**当前实现：REJECT**

- `buildChannelMessage.source` 只有 `kind/channel/contact/contactKind/contactId/contactName/messageKind/at`（`lib/message.js:10-38`）；缺 `account_id/conversation_id/runtime_session_id/chat_type/peer_id/group_id/external_speaker_id/forwarder_id/original_author_id/message_id/source/speaker_evidence/missing_fields`。
- `channel_events` 有 `sender_id/message_id/session_id`，但无 `account_id/conversation_id`（`lib/store.js:25-38`）。
- 群 prompt 只显示 `senderName`（`lib/prompt.js:75-84`）；群 bucket/群轮次/归档只保留显示名；缺 sender 时 `index.js:547,566` 退化群名。**REJECT**。
- 结论：合同方向对，当前 Bridge 不满足；Envelope 需要先设计，不应直接改生产接口。

---

### 2.4 群聊实际发言者/群实体/转发者/原作者：**PARTIAL（合同）/ REJECT（当前实现）**

**合同要求（§5.3/§5.4）**

- `group_id` 是群空间，不是成员；
- `external_speaker_id` 是实际成员；
- `forwarder_id` 是转发者，不自动等于原作者/当前发言者；
- `original_author_id` 是原始作者，平台不提供则 unknown；
- display name 只作展示；
- 缺 sender → `external_speaker_id=null`，Memory 的 speaker/experiencer unknown；
- 禁止群号/群名/昵称/群实体 ID 填成员 speaker；
- 群级事实可保留，但不得归给群主/Owner/汐/具体成员；
- 转发者/原作者/当前发言者必须分开。

**合同清晰度：PARTIAL**

- 语义分离清楚，覆盖群实体、成员、转发者、原作者、display。
- 需补充：
  1. **多跳转发链**：`forwarder_id`/`original_author_id` 是单值；QQ 合并转发可能有多个节点/多个作者/嵌套转发。建议 `forward_chain[]`（每跳 sender_id/forwarder_id/original_author_id/时间/来源），至少明确“当前层转发者”和“原始作者”的层级。
  2. **引用消息**：`quote` 的作者与当前 speaker 不同；Envelope 需要 `quote_author_id`/`quote_message_id`，否则引用作者可能被误当当前 speaker。
  3. **notice/system**：`actor_id`/`operator_id`/`target_id` 未出现在 §5.2；群撤回/禁言/拍一拍中 actor 与 operator 可能是不同人。P0-2 主要针对群消息，但 P0-2/§5.2 应补充 notice 字段或明确“notice 不进入个人 speaker 归属”。
  4. **平台字段映射**：OneBot 的 `sender.user_id`/`group_id`/`forward` 节点 `user_id` 等未写入合同；可作为实现设计，但需要明确“平台不提供则 unknown”。

**当前实现：REJECT**

- parse 保留 `senderId`/`groupId`（`lib/parse.js:160-220`），但：
  - prompt 只显示 `senderName`（`lib/prompt.js:75-84`）；
  - group bucket 只存 `{speaker,text,at}`（`lib/group-buckets.js:31-35`）；
  - group-turn 只传 `speaker`（`lib/group-turn-memory.js:92-126`）；
  - transcript 只传 `speakerName`，无 groupId/speakerId（Memory `lib/service.js:550-575`）；
  - 缺 sender 时 `index.js:547,566` 退化群名（探针已复现）。
- forward：`nodeFromItem` 保留 `senderId`，但 `formatForward` 只输出 `senderName`（`lib/forward.js:60-100,180-195`）；quote 保留 senderId，但 `formatQuote` 只显示 senderName（`lib/quote.js:48-52,100-130`）；notice 把 `senderId=n.userId`、`senderName=n.userId`，`operatorId` 未传（`lib/index.js:398-447`、`lib/notice.js:78-135`）。
- 结论：合同语义对，当前实现 P0-2 不满足。

**测试**

- 562/562 包含 parse/group 测试，但没有端到端“群成员/群实体/转发者/原作者”归属测试；需新增 T-A1～T-A6（群 A 成员甲、缺 user_id、同名、群 B、群实体、notice）。

---

### 2.5 §5.6 Bridge 群 turn/transcript/digest/handover 进 Memory：**PARTIAL（合同）/ REJECT（当前实现）**

**合同要求**

- Bridge 可维护自己的渠道事件/投递状态/会话内临时上下文/受控原文引用，但这些不等于 Memory 记录；
- 任何需要进入 Memory 的 message/群 turn/transcript/digest/handover，必须通过 Memory 的受控 ingestion/interface；
- Bridge 不得绕过接口直接写 Memory 数据表，或代替 Memory 决定 speaker/experiencer/evidence/validity；
- 群 transcript/turn 必须保留 group_id 与可得 external_speaker_id；缺成员 ID → unknown；
- 临时摘要若成为长期/跨会话，必须经 Memory 校验。

**合同清晰度：PARTIAL**

- 原则非常对，直接回应了当前 `group-turn-memory`/`group-digest` 的职责冲突。
- 但“Memory 提供的受控 ingestion/interface”没有命名。当前 Bridge 调用的 `dyMemory.saveGroupTurn`/`saveGroupTranscript` 是否算“受控接口”？
  - 如果算：合同必须要求这两个接口接收 group_id/external_speaker_id/conversation_id/evidence，并禁止只传 speakerName；
  - 如果不算：合同必须把它们标为 legacy/未批准，Bridge 不得继续直接调用。
  - 当前合同两种解释都成立，属于 **可实现性歧义**。
- `handover` 被列为进入 Memory 的内容之一，但当前 handover 实际是注入 home 的临时文本，不写 Memory；合同需要区分“handover 临时注入”与“handover 入 Memory”的边界。
- `digest` 在 Bridge 侧是 `groupDigest`（本地摘要）还是 Memory digest？合同应明确会话内 local digest 与 Memory 长期 digest 的不同接口。

**当前实现：REJECT**

- `group-turn-memory.js:122` 直接调用 `mem.saveGroupTurn({groupId, incoming:[{speaker,text}], reply,...})`；`incoming` 只有 speaker 显示名，无 `speaker_id`/`external_speaker_id`，无 conversation/session/evidence。
- `group-digest.js:88` 直接调用 `mem.saveGroupTranscript({groupId, header: synthetic, messages:[{speaker,text,at}]})`；共享 `GROUP_CWD`，无 `groupId`/`speakerId` in source；Memory `person_id` 可能为空或 `person:owner`（Memory 代码）。
- 两条都是 Bridge 直接调用 Memory 服务，不是通过合同定义的“Memory 受控 ingestion”；且 Bridge 在调用前已决定群内容是否写入（`groupMemory.enabled` / 窗口关闭）。这与 §5.6“Bridge 不得代替 Memory 决定写入/证据”存在冲突。
- `handover` 当前由 Bridge 生成并注入 home（`lib/handover.js:186-196` + `lib/router.js`），按渠道全量取入站、标签一律「主人」；即使不写 Memory，也违反 P0-1 的 owner home 隔离，合同 §5.6 应显式否定这种 handover。
- 结论：当前实现 **REJECT**；合同需要先指定受控接口，再谈实现。

---

### 2.6 Bridge 临时上下文/会话摘要/长期记忆边界：**PARTIAL（合同）/ REJECT（当前实现）**

**合同要求**

- Bridge 可维护会话内临时上下文/摘要；
- 长期/跨会话必须经 Memory 来源、主体、有效性和权限校验；
- 摘要共享 ≠ 原文共享（§9 P0-1）。

**合同清晰度：PARTIAL**

- 原则存在，但缺少可执行边界：
  1. “临时”的 TTL/存储/生命周期未定义；Bridge 的 `handover`/`buildSessionContext` 是否属于临时？
  2. 临时上下文是否必须按 `conversation_id` 过滤？合同只在 §9 P0-1 说“新会话只按 conversation_id 取上下文”；§5.6 应明确所有 Bridge 临时上下文（包括 handover、group fallback）都受此约束。
  3. 临时摘要是否允许包含其他会话的原文？合同说摘要共享≠原文，但没有明确“临时摘要只能来自当前 conversation”。
  4. 审计：临时摘要生成/注入是否记录 conversation_id/来源？未明确。
- 这些是实现设计的一部分，但合同需要给出最小约束，否则实现容易回到“按 channel 取最近 N 条”。

**当前实现：REJECT**

- `buildSessionContext` 只按 channel 取最近入站（`lib/context.js:8-36`、`lib/store.js:330-339`）；`contextBuilder` 无 conversation 参数（`lib/index.js:263`）。
- `getGroupContext` fallback 只按 kind=group（`lib/index.js:287-290`）。
- `handover` 按 channel 全量取入站、`formatHandover` 一律标「主人」（`lib/handover.js:143-152,186-196`）。
- `groupDigest` 共享 `GROUP_CWD`，无 groupId/speakerId（`lib/group-digest.js:61-88`）。
- 结论：当前临时上下文/摘要边界未建立。

---

### 2.7 §9 P0-1 / P0-2 验收充分性

#### P0-1：**PASS（覆盖）/ PARTIAL（测试细节）**

合同覆盖：

- 私聊 A/B 原文互不注入；
- 私聊不注入群；
- 群 A/B 不互混；
- owner home/unified 不自动接收其他原文；
- 新会话按 conversation_id，不按 channel 全量；
- 缺 Conversation ID/account_id fail closed；
- 跨会话长期记忆需主体/权限/用途/来源/审计；
- 摘要≠原文；
- 负向测试放其他会话哨兵并断言 0。

**判断**：覆盖了任务列出的私聊、群聊、跨群、跨会话泄漏，方向充分。**PASS（覆盖）**。
不足（PARTIAL）：没有点名 `handover`、`getGroupContext` fallback、`clearHandoff`、`status` 等具体路径；没有给出测试 ID/断言模板；email/其他渠道未明确（虽不在本轮 Bridge 范围）。建议补“每条路径→测试用例→哨兵断言”的映射。

#### P0-2：**PARTIAL**

合同覆盖：

- group_id 与 external_speaker_id 分开；
- 成员不被群实体替代；
- 缺 sender → unknown；
- 昵称/群名只作展示；
- forwarder/original author/actual speaker 分离；
- 不默认归 Owner/汐；
- 群级事实不伪造个人归属。

**判断**：语义覆盖充分，但 **PARTIAL**：
1. 没有多跳转发/嵌套转发的具体字段/测试；
2. 没有 quote author、notice actor/operator 的测试；
3. 没有明确 `group-turn`/`transcript` 必须写 `external_speaker_id` 的验收断言；
4. 没有正向/负向测试矩阵（P0-1 至少有哨兵要求，P0-2 没有）。
建议增加 T-A1～T-A8 用例，并明确缺 sender 时 `speaker_id=null`/`speaker_type=unknown`、群实体只出现在 group/scope。

---

## 3. 当前实现与合同的关键差距

| 合同项 | 当前实现 | 状态 |
|---|---|---|
| §3 Conversation ID 格式 | `keyFor` 旧 key，无 account，剥字符，unknown 回退 | **REJECT** |
| §3.2 Host mint | Bridge `randomUUID()` 自建；未调用 Host `sessionController.createSession` | **REJECT**；Host 集成 **BLOCKED/NOT_RUN** |
| §3.3 conversation↔session 记录 | `channel_sessions` 只有 `(channel,kind)→session_id/prev`；无 conversation/account/version/audit | **PARTIAL** |
| §3.4 legacy | 生产旧行存在；无 `legacy_unmapped` 标记；`forceRotate` 模糊 | **REJECT** |
| §5.2 Envelope | `source` 缺 account/conversation/runtime_session/chat_type/peer/group/external_speaker/forwarder/original_author/message_id/source/evidence | **REJECT** |
| §5.3/5.4 群发言者 | prompt/buffer/turn/transcript 只用显示名；缺 sender 退化群名 | **REJECT** |
| §5.5 Memory 唯一写 | Bridge 直接调 `saveGroupTurn`/`saveGroupTranscript`，并决定写不写 | **REJECT** |
| §5.6 受控接口 | 合同未命名；当前直接服务调用、无 group/speaker/evidence | **PARTIAL/REJECT** |
| §9 P0-1 | 合同覆盖较好；实现路径仍泄漏 | **PASS（合同）/ REJECT（实现）** |
| §9 P0-2 | 语义较好；多跳/notice/测试矩阵不足 | **PARTIAL** |

---

## 4. 建议的合同修改（PROPOSAL，不是批准）

1. §3.1 明确 `account_id` = **接收消息的机器人/登录账号 ID**；给出格式（QQ 数字字符串）和来源（`self_id`/`get_login_info`）；明确 owner 私聊/home 也必须有 conversation_id。
2. §3.1/§3.4 明确 `legacy_unmapped` 的物理表示（status 列/独立表）和查询规则；旧行只读、不进新上下文。
3. §3.2 明确 Host/DSH 的 API 名称/边界（例如 `sessionController.createSession`），并写“Bridge 插件上下文不可用 → 新会话创建 BLOCKED，禁止回退”。
4. §5.2 将 `speaker_evidence` 改名为 `platform_speaker_fact`（或明确它只是原始字段，不含 Memory 可信度）；区分 Bridge `source_id` 与 Memory evidence `source_id`。
5. §5.2 增加 `quote_author_id`、`forward_chain[]`、`actor_id/operator_id/target_id`（notice）；明确多跳转发/引用作者。
6. §5.6 明确“受控 Memory ingestion”的具体接口；把现有 `saveGroupTurn`/`saveGroupTranscript` 标为 legacy/待审，或规定其必须接收 conversation_id/group_id/external_speaker_id/evidence。
7. §5.6/§9 P0-1 明确 Bridge 临时上下文（`buildSessionContext`/`getGroupContext`/`handover`）必须按 conversation_id/group_id 过滤，TTL/审计/禁原文跨会话。
8. §9 P0-2 增加可执行测试矩阵：群 A 成员甲、缺 user_id、同名、群实体、群 B、转发者/原作者/quote/notice；明确 unknown 字段。
9. §9 P0-1 增加 `handover`、`getGroupContext` fallback、`clearHandoff` 等具体路径与测试 ID；补充 email/其他渠道边界（如不在范围则明确）。

---

## 5. 测试与证据

### 5.1 已执行/复用

| 证据 | 结果 |
|---|---|
| Bridge `npm test` @ `bffcabc` | 562/562 pass，0 fail/skip，exit 0（fake transport） |
| 生产源码一致性 | `/root/.dsh/plugin-src/dsh-channel-bridge` vs main `diff -rq` 无差异 |
| 生产 profile | `enabled:true`、`unified:true`、`mode:send`、`group.social:true`（只读） |
| 生产 DB 聚合 | sessions 5（`group:<gid>` 2、`private:<qq>` 1、旧式 `group`/`private` 2）；群入站 187、空 sender 0（只读快照） |
| Bridge 探针 | 跨私聊/群上下文注入、群 fallback 跨群、source 缺字段、keyFor 碰撞、群缺 sender 退化群名、群归档 person_id、handover 全量、clearHandoff/status 旧 kind（复用前轮只读探针） |
| Host API 证据 | `@deepseek-ai/dsh-api-session-controller` `createSession/createMinted`；`@deepseek-ai/dsh-agent` `agents.create` 需 `sessionId` |

### 5.2 测试缺口

- 无 account_id/conv 格式/legacy/fail-closed 测试；
- 无 Host mint 集成测试；
- 无跨会话 positive/negative 端到端测试（当前 562 项不覆盖）；
- 无群成员/群实体/转发者/原作者/quote/notice 端到端测试；
- 无 `session_bindings` 拆表/旧 binding 测试（属 Persona/Bridge 接口）；
- 无真实 QQ/NapCat 测试。

---

## 6. 未验证 / NOT RUN

- Host `sessionController.createSession` 在 Bridge 插件上下文的可用性、返回结构、权限、错误语义；
- 真实 OneBot/NapCat 的 `account_id`/sender/forward/quote/notice 字段完整性；
- 生产 memory/persona DB 读写、迁移、cutover；
- Memory/Persona 全量测试与 P0-3～P0-6；
- Conversation ID 迁移、旧行标记、租户/多账号真实部署；
- 任何代码/测试/Schema/DB/配置修改；
- 任何真实消息发送、Owner 关联、身份合并。

---

## 7. 结论与状态

| 项 | 结论 |
|---|---|
| 合同 §3 Conversation ID | **PARTIAL**（方向正确，account_id 语义/legacy 物理表示/唯一约束需补充） |
| 合同 §3.2 Runtime Session | **PASS**（权威方/BLOCKED 回退写清）；Host 集成 **BLOCKED/NOT_RUN** |
| 合同 §5.2–§5.6 | **PARTIAL**（方向正确，evidence 命名/受控接口/临时边界需补充） |
| 群发言者/群实体/转发者/原作者 | **PARTIAL**（语义清楚，多跳/quote/notice 不足） |
| §5.6 Bridge→Memory 受控接口 | **PARTIAL**（未命名现有 `saveGroupTurn`/`saveGroupTranscript` 是否受控） |
| 临时上下文/摘要/长期记忆边界 | **PARTIAL**（原则有，TTL/scope/审计不足） |
| §9 P0-1 | **PASS（覆盖）/ PARTIAL（路径/测试细节）** |
| §9 P0-2 | **PARTIAL**（测试矩阵/多跳/notice 不足） |
| 当前 Bridge 实现 | **REJECT / PARTIAL / NOT_IMPLEMENTED** |
| 合同 v1.2.0 | **CANDIDATE / NOT FROZEN** |
| 本报告 | **READY_FOR_REVIEW** |

**最终判断**：v1.2.0 候选合同可以作为继续修订的基础，但不能因本报告标记合同 PASS 或冻结；当前 Bridge 实现不满足 §3/§5.2–§5.6/P0-1/P0-2 的落地要求；Host mint 集成和真实渠道验证仍为 BLOCKED/NOT_RUN。
