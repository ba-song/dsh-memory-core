# v1.2.0 R2 · Channel Bridge 定向合同复核（audit-06）

- 任务：v1.2.0 R2 Channel Bridge 定向合同复核
- 角色：Channel Bridge 渠道接入与会话桥接专项负责人
- 性质：只读复核；不修改合同、Bridge 源码、测试、Schema、数据库、生产配置；不连接真实 QQ/NapCat；不发送消息；不修改 Conversation ID；不切换 Runtime Session mint；不实施上下文/群归档修复。
- 报告状态：**READY_FOR_REVIEW**
- 合同状态：**CANDIDATE / NOT FROZEN**
- 当前 Bridge 实现：**REJECT / PARTIAL / NOT_IMPLEMENTED**（逐项见下）
- 生成时间：2026-11-22（Asia/Shanghai）

---

## 0. 总体结论

R2 候选合同针对上一轮 §7.5.1 复核意见做了实质性补强：

- §5.2 明确 `event_time` / `time_precision` / `received_at` 三者分离，缺失时间必须 null/unknown，禁止 `Date.now()`/接收时间/群名/昵称补齐；
- §5.2 把 `speaker_evidence` 改为 `platform_speaker_fact`，并明确 `source_id` 不等于 Memory evidence source；
- §5.6 明确 Bridge 临时上下文/临时摘要/handover 只能使用当前 `conversation_id` 范围内获准数据，缺 conversation_id fail closed；
- §5.6 明确 Bridge 不得自行建立/读取/拼接 Memory 历史通道，历史通道归 Memory；
- §5.6 分别规定 turn/transcript、digest、handover 进入 Memory 的最小逻辑字段与授权/审计要求；
- P0-1 新增 legacy_unmapped、新旧同群/同私聊、Memory legacy/unknown、Bridge context/fallback/digest/handover、缺时间、缺 speaker、旧 confidence 的负向测试要求。

因此，就**合同文本**而言，本轮 1–8 项多数从 PARTIAL 提升为 PASS；剩余主要问题：

- §3 的 `account_id` 语义/legacy 物理表示未在本轮修改，仍是 PARTIAL；
- §5.6 的 turn/transcript/digest/handover 只有逻辑字段，物理字段/TTL 仍 OPEN（任务明确允许保持 OPEN，但实现前需设计）；
- digest 的“生命周期”仍不如 handover 明确；
- P0-2 仍未增加多跳转发/quote 作者/notice actor/operator 的测试矩阵，仍为 PARTIAL；
- 当前 Bridge 实现仍普遍不满足（Envelope、conversation 隔离、时间缺失、群发言者、直接 Memory 写入）。

**结论**：合同 R2 可作为继续修订/实施设计的基线；当前实现不能作为落地基线；不冻结合同、不标记整体 PASS。

---

## 1. 基线

| 对象 | 值 |
|---|---|
| 合同 | `ba-song/dsh-memory-core` 分支 `docs/memory-persona-contract-v1.2.0-owner-review` @ `5f33bba68b68d5eaf4f265adeba059c85b6f1dcf` |
| 合同 tree | `881cf17f70e157792f77d615c7c0998d53a33684` |
| 合同 blob | `bb808e1e5f91e341566d7521c2051e19135df115`（817 行） |
| 上一版 | `f06872306a983660a79b036dd852e98826e20ac7`（792 行） |
| 本次 diff | 仅合同文件；`+41/−16`，涉及 §5.2/§5.3/§5.6/§7.5.1/§9 P0-1/P0-3/P0-6 |
| Bridge 代码 | `ba-song/dsh-channel-bridge` main @ `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` |
| Bridge tree | `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| Bridge 测试 | `npm test` @ `bffcabc`：**562/562 pass / 0 fail / 0 skip，exit 0**（fake transport） |

**合同关键行号（R2）**

| 章节 | 行号 |
|---|---|
| §3.1 Conversation ID | 211–233 |
| §3.2 Runtime Session | 234–241 |
| §3.3 Conversation↔Session 记录 | 242–263 |
| §3.4 旧会话兼容 | 264–273 |
| §5.2 Envelope | 334–359 |
| §5.3 发言者字段 | 360–369 |
| §5.4 群聊规则 | 370–378 |
| §5.5 Memory 唯一写 | 379–390 |
| §5.6 Bridge/Memory 边界 | 391–406 |
| §7.5.1 旧记忆/时间边界 | 527–545 |
| §9 P0-1 | 614–638 |
| §9 P0-2 | 639–652 |

---

## 2. 十项定向复核

### 2.1 §5.2：`event_time` / `time_precision` / `received_at` 区分

**合同文本：PASS**

- §5.2 明确：
  - `event_time` 是平台事件发生时间；缺失或非法时必须为 null，不得用接收时间或当前时间填充；
  - `time_precision` 是平台时间精度/可信程度；缺失或无法判断时为 `unknown`；
  - `received_at` 是 Bridge 实际接收时间，与 `event_time` 分开保存；不得被 Memory 当作 `valid_from` 的替代。
- §5.2 进一步规定“缺失的时间/身份字段必须显式 null/unknown，不得以 `Date.now()`、群名、昵称或其他展示字段补齐”。这正好覆盖上一轮指出的当前 `toMillis()` 回退问题。

**当前实现：REJECT**

- `toMillis(t)` 在 `Number(t)` 非有限/≤0 时返回 `Date.now()`（`lib/parse.js:151-155`）。
- `parseMessageEvent` 使用 `evt.time ?? now`（`lib/parse.js:175`）；缺失/非法平台时间会得到当前时间，且没有 `time_precision`/`received_at` 字段。
- 投递 source 只有 `at`（`lib/message.js:10-38`），没有 `event_time/time_precision/received_at`，无法让下游区分平台时间与接收时间。
- 562/562 测试没有覆盖“缺时间必须 null/unknown”。

**建议/未验证**

- Bridge 应输出 `event_time=null` + `time_precision='unknown'`，另存 `received_at`；不得把 `at` 同时当两者。
- 需要测试：`evt.time` 缺失、0、负数、NaN、字符串非数字 → `event_time=null`/`time_precision=unknown`；`received_at` 独立。

---

### 2.2 `received_at` 不得作为 Memory `valid_from` 的替代

**合同文本：PASS**

- §5.2 明确 `received_at` 不得被 Memory 当作 `valid_from` 的替代；
- §5.6 再次明确“平台事件时间缺失不得用 `received_at` 或当前时间伪造”。
- 这条与 D4/D5 的旧记忆/时间语义一致。

**当前实现：REJECT（接口风险）**

- 当前 Bridge 没有 `received_at` 字段，只有 `at`；`at` 缺失时被当前时间填充（§2.1）。如果下游把 `at` 当事件时间/valid_from，就会把接收时间误当发生时间。
- `saveGroupTurn`/`saveGroupTranscript` 只传 `at`，没有 `event_time`/`received_at`/`time_precision`；Memory 无法区分。

**建议**

- Envelope 强制 `event_time` 与 `received_at` 两字段；Memory 侧只允许 `event_time`/显式证据作为 `valid_from` 候选，`received_at` 仅作接收事实。
- 需要测试：`received_at` 存在但 `event_time=null` → Memory 不得用 received_at 填 valid_from。

---

### 2.3 `platform_speaker_fact` 与 Memory evidence 的职责区分

**合同文本：PASS**

- R2 把 `speaker_evidence` 改为 `platform_speaker_fact`，并明确“原始平台发言者字段、来源及缺失字段；不代表 Memory 验证结论”（§5.2）。
- `source/source_id` 明确为 Bridge 来源/事件标识，不得与 Memory evidence source ID 混为一谈（§5.2）。
- §5.5 明确 Memory 唯一写消息级 evidence；§5.6 禁止 Bridge 替代 Memory 决定 evidence/validity。
- 这解决了上一轮的命名歧义：Bridge 的 `platform_speaker_fact` 是原始事实，不是 Memory `memory_evidence`/verification。

**当前实现：NOT_IMPLEMENTED**

- `buildChannelMessage.source` 没有 `platform_speaker_fact`、`source_id`、`missing_fields`；只有 `contact/contactKind/contactName` 等（`lib/message.js:10-38`）。
- `channel_events` 有 `sender_id/message_id`，但没有 `platform_speaker_fact`/`source_id` 语义分工。
- 当前 Bridge 不写 Memory evidence；这一点没有越权，但没有提供合同要求的原始事实字段。

**建议/未验证**

- Envelope 的 `platform_speaker_fact` 应为对象：`{raw_sender_id, display_name_snapshot, card_snapshot, source, missing_fields}`；不得含 `verification_status/confidence_level`。
- `source_id` 与 Memory evidence `source_id` 命名需在接口层区分；建议 Bridge 用 `bridge_event_id`，Memory 用 `evidence_source_id`。

---

### 2.4 §5.6 临时上下文/临时摘要/handover 只能使用当前 `conversation_id` 获准数据

**合同文本：PASS（TTL/存储仍 OPEN）**

- §5.6 明确：Bridge 的临时上下文、临时摘要和 handover 注入只能使用当前规范 `conversation_id` 范围内获准的数据；不得按 channel、群类型、昵称或共享目录回退到其他 conversation；缺少/无法确认 conversation_id 时必须 fail closed。
- 临时摘要必须标来源 conversation 范围，受会话范围与生命周期约束；TTL/存储/审计字段仍为技术设计 OPEN。
- 临时摘要/handover 不等于 Memory 历史回忆/参考通道。
- 这直接覆盖上一轮 `buildSessionContext`/group fallback/handover 的跨会话风险。

**当前实现：REJECT**

- `buildSessionContext` 只按 channel 取最近入站（`lib/context.js:8-36`、`lib/store.js:330-339`）；`contextBuilder` 不传当前 conversation（`lib/index.js:263`）。
- `getGroupContext` fallback 只按 `kind=group`（`lib/index.js:287-290`）。
- `handover` 按 channel 全量取入站，`formatHandover` 所有 user 行标「主人」（`lib/handover.js:143-152,186-196`）。
- 缺 `conversation_id` 时没有 fail-closed；当前 `keyFor` 反而回退 `unknown`（`lib/sessions.js:119-124`）。
- 562/562 测试不覆盖跨会话/缺 conversation 的负向断言。

**建议/未验证**

- TTL/存储/审计字段保持 OPEN，但合同已固定“当前 conversation 范围 + fail closed”，可作为实施验收。
- 需要测试：私聊 A/B、群 A/B、owner home、缺 conversation_id、legacy_unmapped、handover 旧内容。

---

### 2.5 Bridge 不得自行读取/拼接/注入 Memory 的 legacy/unknown 历史通道

**合同文本：PASS**

- §5.6 明确：Memory 的历史回忆/参考通道由 Memory 提供并执行有效性/来源/主体/权限判断；Bridge 不得自行建立该通道、不得自行读取/拼接 legacy 或 unknown 历史记录，也不得把历史通道结果自动注入当前会话；跨会话读取必须经明确授权的受控接口。
- §7.5.1 明确该节仅适用于 Memory，Bridge 不在其适用范围；Persona 情绪历史另有边界。
- 这解决了上一轮“§7.5.1 是 Memory-only、Bridge 边界缺失”的问题。

**当前实现：PASS（未读取 Memory 历史通道）/ PARTIAL（相邻风险）**

- 当前 Bridge 没有调用 Memory 的 legacy/unknown 历史通道；没有 `history`/`legacy` 查询接口调用。就“不得读取 Memory 历史通道”这一条，当前实现 **PASS**。
- 但 Bridge 仍会读取自己的 `channel_events`（包括旧事件）生成 `buildSessionContext`/handover；`handoffBrief`/`publicBrief` 是 Memory 提供的摘要接口，是否过滤 legacy/unknown 未验证。这里存在相邻风险，需要 Memory 接口保证；不能视为“已满足 P0-1”。
- `fetchBrief` 调 `memory.handoffBrief`（`lib/sessions.js:202`）用于轮换；`publicBrief` 用于群 @。二者不是“历史通道”，但可能包含旧摘要；合同没有明确其返回范围。建议合同/接口要求 `handoffBrief/publicBrief` 也声明来源范围与 legacy/unknown 过滤。

**建议/未验证**

- 合同可补一句：Bridge 只能通过 Memory 明确授权的 `publicBrief`/`handoffBrief` 等摘要接口读取摘要，接口必须返回来源范围/不确定性标记；Bridge 不得自行拼接。
- 需要检查 Memory 的 `handoffBrief`/`publicBrief` 是否过滤 legacy/unknown；本轮未验证。

---

### 2.6 turn/transcript/digest/handover 进入 Memory 的来源范围与必要字段

**合同文本：PASS（逻辑字段）/ PARTIAL（物理/TTL OPEN）**

- §5.6 明确：
  - turn/transcript：至少保留 `conversation_id`、适用时的 `group_id`、可得 `external_speaker_id`（缺失 null）、Bridge `source_id`、`event_time/time_precision`、`received_at`、`missing_fields`；
  - digest：来源 conversation 范围、群范围、生成时间、摘要是否包含原文、授权/审计依据；不得把跨会话混合摘要当单会话原文；
  - handover：当前会话运行必须限定当前 conversation_id；若进入 Memory/跨会话，经 Memory 受控接口，记录来源范围、用途、创建者、授权依据及生命周期；不得默认包含其他会话原文。
- 这比 R1 明确得多，逻辑上可执行；物理字段/TTL 保持 OPEN，符合任务要求。

**当前实现：REJECT**

- `saveGroupTurn` 传 `groupId/groupName/incoming[{speaker,text}]/reply/at`（`lib/group-turn-memory.js:122`）：没有 conversation_id、session_id、external_speaker_id、Bridge source_id、event_time/time_precision、received_at、missing_fields。
- `saveGroupTranscript` 传 `groupId/groupName/at/messageId/synthetic header/messages[{speaker,text,at}]`（`lib/group-digest.js:88`）：没有 conversation_id、external_speaker_id、source_id、time_precision/received_at；共享 `GROUP_CWD`。
- `saveGroupDigest` 已退役（`DIGEST_RETIRED=true`，`lib/group-digest.js:14`）；当前没有 Memory digest 路径，未来 digest 无字段实现。
- `handover` 当前不进入 Memory，只是 Bridge 注入 home（`lib/handover.js:186-196`），且是 channel 全量；如果按合同“仅当前会话”也不满足。
- 结论：合同逻辑字段可用，当前实现 **REJECT**。

**建议/未验证**

- 实施前需把 `saveGroupTurn`/`saveGroupTranscript` 定义为 Memory 受控接口（或新建受控接口），并验证其接收/存储上述字段。
- 物理字段名/TTL 保持 OPEN；不得在本轮自行定 schema。

---

### 2.7 digest/handover 的跨会话授权、原文引用、生命周期、审计

**合同文本：PARTIAL**

- handover：明确来源范围、用途、创建者、授权依据、生命周期；不得默认包含其他会话原文；当前会话运行限定 conversation_id。较完整。
- digest：明确来源 conversation 范围、群范围、生成时间、是否包含原文、授权/审计依据；**但没有明确 digest 的生命周期/过期/TTL、谁能读、是否可跨会话注入**。合同 §5.6 只说“不得把跨会话混合摘要当作单会话原文”，但没有说“digest 是否允许跨会话使用、需要什么授权、如何撤回”。
- 物理字段/TTL 按任务要求保持 OPEN，但逻辑要求仍可再补：digest 的 `source_conversation_ids[]`、`raw_content_included`、`authorization_ref`、`expires_at`/`lifecycle`、`created_by`、`purpose`、`audit_ref`。
- 结论：handover 逻辑较完整；digest 生命周期/读取范围仍有歧义，**PARTIAL**。

**当前实现：REJECT**

- 当前 `groupDigest` 是 Bridge 本地摘要/归档路径，调用 `saveGroupTranscript`；没有 digest 的授权/来源范围/生命周期字段；共享 `GROUP_CWD`。
- `handover` 当前是 Bridge 本地生成，按 channel 全量；没有授权/来源范围/生命周期字段。
- `saveGroupDigest` 退役，当前无 Memory digest 路径。
- 562/562 不覆盖。

**建议/未验证**

- 合同补 digest 的生命周期/读取范围/授权；handover 已较完整。
- 需要测试：跨会话 digest 未授权→拒绝；含原文→不得作为摘要注入；过期/撤回→不可读；审计记录完整。

---

### 2.8 P0-1 是否覆盖 legacy_unmapped、新旧同群/同私聊、历史通道、缺时间、缺 speaker 负向测试

**合同文本：PASS（覆盖）**

R2 P0-1 新增：

- 旧 `legacy_unmapped` 会话/消息不得进入新规范 conversation_id 当前上下文；旧/新同群或同私聊必须隔离；
- Memory `legacy`/`unknown` 历史记录不得进入普通 current-fact 注入；只有显式历史参考查询可返回并保留标记；
- Bridge `buildSessionContext`、group fallback、digest、handover 不得消费其他 conversation 或 Memory 历史通道；
- 缺失/非法 `event_time` 必须 null/unknown，不得等于 `received_at`/当前时间；
- 缺失 sender → `external_speaker_id=null`，不得群名/昵称/群实体替代；
- 旧 numeric confidence 原值不变，不映射新 `confidence_level`；
- 合成数据/临时 DB，不得生产/真实渠道。

这些正好覆盖本轮要求的 legacy、新旧同群/同私聊、历史通道、缺时间、缺 speaker 负向测试。**PASS（覆盖）**。

**当前实现：REJECT**

- 无 `legacy_unmapped`/`conversation_id` 字段，旧事件无法标记/过滤；
- `buildSessionContext` 按 channel；`getGroupContext` 按 kind；`handover` 按 channel；
- `toMillis` 用当前时间；缺 sender 退化群名；
- 562/562 无这些负向测试；
- 结论：P0-1 合同可验收，当前实现不满足。

**建议/未验证**

- 为每个新增路径编号测试；P0-1 已写“测试编号可在实现测试计划中细化”，可以接受，但实施前必须有可执行测试清单。

---

### 2.9 P0-2 对实际 speaker、group entity、forwarder、original author 的区分

**合同文本：PARTIAL**

- P0-2 仍保留：
  - group_id / external_speaker_id 分开；
  - 实际成员 speaker 不得被群实体替代；
  - 缺稳定 sender → speaker/experiencer unknown；
  - 昵称/群名/显示名只作展示；
  - forwarder/original author/actual speaker 分离；
  - 不默认归 Owner/汐；
  - 群级事实不伪造个人归属。
- 但 P0-2 **没有新增**：
  1. 多跳转发/嵌套转发的字段与测试（`forwarder_id`/`original_author_id` 单值可能不够）；
  2. quote 作者/当前 speaker 的区分测试；
  3. notice actor/operator/target 的区分（群撤回/禁言/拍一拍）；
  4. 明确的 negative/positive 测试矩阵（P0-1 有测试项，P0-2 只有语义要求）；
  5. `group-turn`/`transcript` 必须写 `external_speaker_id` 的字段级断言。
- 因此 P0-2 语义正确但可执行性不足，**PARTIAL**。

**当前实现：REJECT**

- prompt 只显示 senderName（`lib/prompt.js:75-84`）；
- group bucket 只存 `{speaker,text,at}`（`lib/group-buckets.js:31-35`）；
- group-turn 只传 speaker（`lib/group-turn-memory.js:92-126`）；
- transcript 只传 speakerName，无 groupId/speakerId（Memory `lib/service.js:550-575`）；
- 缺 sender 退化群名（`lib/index.js:547,566`；探针）；
- forward 结构有 senderId 但 `formatForward` 只显示名字（`lib/forward.js:60-100,180-195`）；
- quote 有 senderId 但 `formatQuote` 只显示名字（`lib/quote.js:48-52,100-130`）；
- notice 把 QQ 号当 senderName，operator 未传（`lib/index.js:398-447`、`lib/notice.js:78-135`）；
- 562/562 无这些端到端测试。

**建议/未验证**

- P0-2 增加 T-A1～T-A8：群 A 成员甲、缺 user_id、同名、群 B、群实体、forwarder/原作者的引用/合并转发、quote 作者、notice actor/operator；明确 unknown 断言。
- 多跳转发建议 `forward_chain[]` 或每节点 `sender_id/original_author_id`；至少保留当前层转发者与原始作者。

---

### 2.10 对照当前 Bridge 源码的 R2 差距

| R2 要求 | 当前 Bridge | 状态 |
|---|---|---|
| §5.2 `event_time=null`/`time_precision`/`received_at` 分离 | `at=toMillis(...)`，缺失回退 `Date.now()`；无 time_precision/received_at | **REJECT** |
| `received_at` 不得作 valid_from | 无 received_at；`at` 可能被下游当事件时间 | **REJECT（接口风险）** |
| `platform_speaker_fact` 原始事实 | `source` 无该字段；群只留显示名 | **NOT_IMPLEMENTED** |
| 临时上下文/摘要/handover 仅当前 conversation | `buildSessionContext` 按 channel；group fallback 按 kind；handover 按 channel | **REJECT** |
| 不读取 Memory legacy/unknown 历史通道 | 未直接调用历史通道；但 `handoffBrief/publicBrief` 过滤未验证 | **PASS（该条）/ PARTIAL（相邻）** |
| turn/transcript 字段 | `saveGroupTurn`/`saveGroupTranscript` 缺 conversation/speaker/source/time | **REJECT** |
| digest 来源范围/授权/生命周期 | 无；`saveGroupDigest` 退役；`groupDigest` 共享 cwd | **REJECT** |
| handover 当前会话/授权/生命周期 | 按 channel 全量，无 conversation/授权/TTL | **REJECT** |
| P0-1 负向测试 | 无 legacy/conversation/time/speaker 测试 | **REJECT** |
| P0-2 群发言者 | 五层退化；forward/quote/notice 丢 ID | **REJECT** |
| §3 合同格式/account/legacy | `keyFor` 旧 key，无 account，剥字符，unknown 回退；无 legacy 标记 | **REJECT** |
| §3.2 Host mint | Bridge `randomUUID` 自建；Host 集成未验证 | **REJECT / BLOCKED-NOT_RUN** |

---

## 3. §3 与 Runtime Session 的遗留（本轮未被 R2 修改）

R2 未改 §3。上一轮 audit-04 的结论仍有效：

- §3.1 合同格式/account 必填/legacy/fail-closed 方向正确，但 `account_id` 语义（接收消息的机器人账号）与格式/来源未写死；`legacy_unmapped` 物理表示未定；唯一 active 约束/轮换历史未定。
- 当前 `keyFor` 仍是 `group:<gid>`/`private:<qq>`，无 account，`replace(/\D/g,'')`，空/非法回退 `unknown`（`lib/sessions.js:119-124`）。
- §3.2 Host/DSH 权威 mint 明确；当前 Bridge `randomUUID()`（`lib/sessions.js:259,287,451,481`）；Host `sessionController.createSession` 在 Bridge 插件上下文可用性未验证，标记 **BLOCKED/NOT_RUN**。
- §3.3/§3.4 旧行 legacy、唯一写入、审计/版本仍未实现。

本轮不改变这些结论；合同文本 §3 PASS/PARTIAL，当前实现 REJECT。

---

## 4. 建议（PROPOSAL，不是批准）

1. §3.1 明确 `account_id` = 接收消息的机器人/登录账号，给出格式/来源；明确 owner 私聊/home 也使用 conversation_id。
2. §3.1/§3.4 明确 `legacy_unmapped` 的物理 status/version 和查询规则；旧行只读、不进新上下文。
3. §5.2/§5.6 在 Bridge 实现前固定 Envelope 字段映射：`event_time/time_precision/received_at`、`platform_speaker_fact`、`source_id`（Bridge）与 Memory evidence `source_id` 分离。
4. §5.6 给 digest 补生命周期/读取范围/授权/审计；handover 已较完整，保留现有文字。
5. §5.6 明确 turn/transcript/digest/handover 的受控 Memory 接口名称；把现有 `saveGroupTurn`/`saveGroupTranscript` 标为 legacy/待审或规定其字段。
6. §9 P0-2 增加多跳转发、quote 作者、notice actor/operator 的测试矩阵；P0-1 的测试编号可接受，但实施前需落到可执行清单。
7. §9 P0-1/P0-2 明确测试数据为合成/临时库，不得使用生产。

---

## 5. 测试、证据与未验证

### 5.1 已执行/复用

- Bridge `npm test` @ `bffcabc`：562/562 pass，exit 0（fake transport）。
- 生产源码与 main `diff -rq` 无差异；profile 只读（enabled/unified/mode=send/group.social）。
- 生产 DB 聚合：sessions 5（旧式 2 行）；群入站 187、空 sender 0（只读快照）。
- 前轮只读探针：context 跨会话、group fallback 跨群、source 缺字段、keyFor 碰撞、群缺 sender 退化群名、群归档 person_id、handover 全量、clearHandoff/status 旧 kind。
- 本报告未新增生产/真实渠道测试。

### 5.2 未验证 / NOT RUN

- 真实 OneBot/NapCat 的 `event.time` 缺失/非法分布、sender/forward/quote/notice 字段完整性；
- Host `sessionController.createSession` 在 Bridge 插件上下文的可用性；
- Memory `handoffBrief`/`publicBrief` 对 legacy/unknown 的过滤行为；
- Memory `saveGroupTurn`/`saveGroupTranscript` 是否会被定义为受控接口及其字段扩展；
- Memory/Persona 全量测试、P0-3～P0-6；
- 生产 DB/迁移/cutover、Conversation ID 迁移、Owner 关联、v6/v3/EI-2A；
- 真实消息发送/渠道操作。

---

## 6. 状态

| 项 | 状态 |
|---|---|
| §5.2 event_time/time_precision/received_at | **PASS（合同）/ REJECT（当前）** |
| received_at 不得作 valid_from | **PASS（合同）/ REJECT（当前接口风险）** |
| platform_speaker_fact vs Memory evidence | **PASS（合同）/ NOT_IMPLEMENTED（当前）** |
| 临时上下文/摘要/handover 当前 conversation | **PASS（合同，TTL OPEN）/ REJECT（当前）** |
| 不读取 Memory legacy/unknown 历史通道 | **PASS（合同）/ PASS（未直接读取）；相邻摘要过滤未验证** |
| turn/transcript/digest/handover 字段 | **PASS（逻辑）/ PARTIAL（物理/TTL OPEN）/ REJECT（当前）** |
| digest/handover 授权/原文/生命周期/审计 | **PARTIAL（digest 生命周期仍不足）** |
| P0-1 负向覆盖 | **PASS（合同覆盖）/ REJECT（当前无测试）** |
| P0-2 群发言者 | **PARTIAL（合同）/ REJECT（当前）** |
| §3 Conversation ID/Runtime Session | **PARTIAL/PASS（合同文本，未改）/ REJECT（当前）；Host mint 集成 BLOCKED/NOT_RUN** |
| 合同 v1.2.0 R2 | **CANDIDATE / NOT FROZEN** |
| 本报告 | **READY_FOR_REVIEW** |

**结论**：R2 合同在 §5.2/§5.6/P0-1 上已基本解决上一轮的 Bridge 边界歧义；当前 Bridge 实现仍不满足合同（Envelope、conversation 隔离、时间缺失、群发言者、Memory 写入边界）。不冻结合同、不标记整体 PASS；下一步应进入实现设计和测试计划，不得直接改生产。
