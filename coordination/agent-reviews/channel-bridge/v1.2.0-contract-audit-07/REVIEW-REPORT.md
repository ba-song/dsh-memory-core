# v1.2.0 R3 · Channel Bridge 专项合同复核（audit-07）

- 任务：v1.2.0 R3 Channel Bridge 专项合同复核
- 角色：Channel Bridge 渠道接入与会话桥接专项负责人
- 性质：只读复核；不修改合同、Bridge 源码、测试、Schema、数据库、生产配置；不连接真实 QQ/NapCat；不发送消息；不创建/修改 Runtime Session；不实施 digest/handover 生命周期变更；不决定 account_id/TTL/物理字段/迁移方案。
- 报告状态：**READY_FOR_REVIEW**
- 合同状态：**CANDIDATE / NOT FROZEN**
- 当前 Bridge 实现：**REJECT / PARTIAL / NOT_IMPLEMENTED**
- 生成时间：2026-11-22（Asia/Shanghai）

---

## 0. 总体结论

R3 合同实际改动集中在 **§7.1（新记录 confidence 默认 unknown/NULL）**、**§7.5.1（legacy 在 Owner 批准近似规则前一律不得进入 current）**、**§9 P0-4/P0-5（对应测试）**；**没有修改 §5.2/§5.6/P0-1/P0-2 的 Bridge 字段与边界**。因此：

- R3 对 Memory 的 legacy/current/history 收紧本身更严格、方向正确（legacy 即使带标记也不得进入 current）；§7.1 的新默认也符合 Owner 已批准原则。
- 但 **Bridge 侧没有新增约束**。R2 已经写明的 §5.6 仍是唯一 Bridge/Memory 边界条款；R3 没有把 `publicBrief`/`handoffBrief` 这两个 Bridge 实际调用的 Memory summary 接口纳入 §5.6/P0-1 的逐路径约束。
- 当前 Bridge 仍可把 Memory 的 `publicBrief`/`handoffBrief` 摘要注入当前会话/轮换 seed；如果这些接口返回 legacy/unknown/current 摘要混合，R3 的“legacy 不得进入 current”会被 Bridge 间接绕过。这是本轮最重要的新发现。
- 当前 Bridge 仍存在 Conversation ID 旧 key/无 account、Bridge 自建 session、缺 Envelope 字段、`toMillis()` 当前时间补齐、群发言者退化、`saveGroupTurn`/`saveGroupTranscript` 直接写 Memory 等问题。

**结论**：R3 合同在 Memory 域收紧 **PASS/PARTIAL**；Bridge 侧边界合同文本 **PARTIAL**；当前 Bridge 实现 **REJECT/PARTIAL**；不冻结合同、不标记整体 PASS。

---

## 1. 基线

| 对象 | 值 |
|---|---|
| 合同 | `ba-song/dsh-memory-core` 分支 `docs/memory-persona-contract-v1.2.0-owner-review` @ `571b9d0a466e33b0dccb4b4542e0f8b6539670bc` |
| 合同 tree | `12eae23c4a3b7a5ae7270d759622c215382969be` |
| 合同 blob | `4ee29758207e435ef70067fe3b4480e2e1eacc56`（827 行） |
| 上一版 | `5f33bba68b68d5eaf4f265adeba059c85b6f1dcf`（817 行） |
| 本次 diff | 仅合同文件；`+15/−5`，涉及 §7.1、§7.5.1、P0-4、P0-5 |
| Bridge 代码 | `ba-song/dsh-channel-bridge` main @ `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` |
| Bridge tree | `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| Bridge package | `dsh-channel-bridge@0.18.0` |
| Bridge 测试 | `npm test` @ `bffcabc`：**562/562 pass / 0 fail / 0 skip，exit 0**（fake transport） |

**合同关键行号（R3）**

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
| §7.1 三维证据/新默认 | 432–471 |
| §7.5.1 旧记忆/时间边界 | 534–552 |
| §9 P0-1 | 621–645 |
| §9 P0-2 | 646–659 |

**R3 实际改动（合同文本）**

- §7.1 新增“新记录默认值（Owner 已批准）”：`confidence_level='unknown'`；numeric `confidence=NULL`；旧 numeric 原值保留；不得默认 1.0/0。
- §7.5.1 legacy 收紧：在 Owner 对相应数据类别近似规则批准前，legacy **一律不得**进入任何 current-fact 检索结果、普通注入、current 摘要或 current 合并；是否带标记不改变禁止；只能经显式 history/历史参考通道读取。
- P0-4/P0-5 增加对应测试要求。
- **§5.2/§5.6/P0-1/P0-2 未改**；Bridge 的 Envelope、临时上下文、digest/handover 边界仍按 R2 文本执行。

---

## 2. 逐项复核（A–G）

### A. R3 的 Legacy/current/history 收紧是否会被 Bridge 临时上下文、digest、handover、summary 绕过

**合同文本：PARTIAL**

- R3 把 legacy 在 current 中的禁令写得很强（“一律不得进入任何 current-fact 检索结果、普通注入、current 摘要或 current 合并；是否附带标记不改变禁止”），这本身对 Memory 是正确收紧。
- 但 §5.6 只列了 “message/turn/transcript/digest/handover” 的受控接口，没有点名 Bridge 实际调用的 `publicBrief` / `handoffBrief` summary 接口；P0-1 的路径清单也没有这两个。
- 因此存在合同层面的绕过口：
  1. Bridge `fetchPublicBrief` 调 `dyMemory.publicBrief({limit})`，把返回值拼成 `[汐的近况]` 注入群 prompt（`lib/public-brief.js:22-35`、`lib/index.js:268-277`）。
  2. Bridge `fetchBrief` 调 `dyMemory.handoffBrief({header,cwd,recent,kind,contactId})`，把结果用于轮换 seed（`lib/sessions.js:202-238`）。
  - 合同没有要求这两个 summary 接口必须过滤 legacy/unknown，也没有要求返回来源 conversation/不确定性标记；如果它们返回 legacy/unknown，Bridge 会把历史内容注入 current/rotation，绕过 §7.5.1。
- 合同 §5.6 说“Bridge 临时摘要不等于 Memory 历史通道”，但 `publicBrief`/`handoffBrief` 是 Memory 提供的摘要，不是 Bridge 自建；合同需要明确它们属于 current summary 还是 history channel，以及必须过滤哪些状态。

**当前实现：REJECT**

- `publicBrief` 在 Memory 侧查询 `scope_type='public'`，只做 TTL，不过滤 `valid_from_kind`/`status`/`verification_status`/`confidence_level`（Memory `lib/service.js:529-548`）。旧 public 记录/legacy 可能被返回。
- `handoffBrief` 对 owner 使用 `memories kind='todo' AND status='active'` 和 `decisions`，没有 validity/legacy 过滤（Memory `lib/handoff/brief.js:35-58`）；这些内容可能来自旧/跨会话记忆。
- Bridge 没有在调用前做 legacy/current 检查；它只把返回值拼进 prompt/seed。
- `buildSessionContext`/`getGroupContext`/`handover` 仍按 channel/kind/全量（详见 B）。
- 562/562 测试不覆盖 `publicBrief`/`handoffBrief` 的 legacy 过滤。

**建议/未验证**

- 合同 §5.6/P0-1 增加 `publicBrief`/`handoffBrief` 路径：必须只返回 current/valid 摘要，或显式返回 history 通道标记且不得进入 current；Bridge 不得把 history 结果当 current。
- 需要验证 Memory `publicBrief`/`handoffBrief` 的 legacy/validity 过滤（本轮只读代码；未运行探针）。

---

### B. §5.6 与 P0-1 对实际跨会话入口的覆盖

**合同文本：PARTIAL**

§5.6 覆盖：

- 临时上下文/临时摘要/handover 仅当前 `conversation_id`；
- 缺 conversation_id fail closed；
- Memory 历史通道由 Memory 提供；Bridge 不得自行读取/拼接/自动注入；
- turn/transcript 字段；
- digest 来源/授权/审计；
- handover 来源/用途/创建者/授权/生命周期；
- 不得决定 `valid_from_kind`/`verification_status`/`confidence_level`。

P0-1 覆盖：

- 私聊 A/B、私聊/群、群 A/B、owner home/unified、新 session 按 conversation_id、缺字段 fail closed、长期记忆授权、摘要≠原文；
- 新增 legacy_unmapped、新旧同群/同私聊、Memory legacy/unknown、Bridge context/fallback/digest/handover、缺时间、缺 sender、旧 confidence 的负向测试。

**缺口**：

- 没有点名 `buildSessionContext`、`getGroupContext`（含 fallback）、`publicBrief`、`handoffBrief` 的具体路径；P0-1 只笼统说 “Bridge 的 buildSessionContext、group fallback、digest 与 handover”；`publicBrief`/`handoffBrief` 未列。
- 没有说明 `publicBrief`/`handoffBrief` 属于 current summary 还是 history channel；没有要求它们的来源 conversation/uncertainty 标记。
- `getGroupContext` 的正常路径（OneBot `get_group_msg_history`）与 fallback 区分；合同只笼统说 group fallback，未要求正常路径也必须 group_id 精确。
- `fetchBrief` 的 `recent` 来自当前 agent 事件，但 `handoffBrief` 的 owner project/todos/decisions 可能跨 conversation；合同未要求来源 conversation。

**当前实现：REJECT**

- `buildSessionContext` 只按 channel（`lib/context.js:8-36`、`lib/store.js:330-339`）；`contextBuilder` 不传 conversation（`lib/index.js:263`）。
- `getGroupContext` fallback 只按 kind=group（`lib/index.js:287-290`）；正常路径 `get_group_msg_history` 按 group_id，但失败 fallback 不按 group。
- `groupDigest` 共享 `GROUP_CWD`、无 conversation/groupId/speakerId（`lib/group-digest.js:61-88`）。
- `handover` 按 channel 全量，所有 user 行标「主人」（`lib/handover.js:143-152,186-196`）。
- `publicBrief`/`handoffBrief` 见 A。
- `saveGroupTurn`/`saveGroupTranscript` 只传显示名/共享 cwd（`lib/group-turn-memory.js:122`、`lib/group-digest.js:88`）。

**结论**：合同部分覆盖，但 `publicBrief`/`handoffBrief` 的缺失使其存在绕过；当前实现 REJECT。

### B2. turn/transcript/digest/handover 的来源范围与必要字段

**合同文本：PASS（逻辑）/ PARTIAL（物理/TTL OPEN）**

- §5.6 明确：
  - turn/transcript：至少 `conversation_id`、适用 `group_id`、可得 `external_speaker_id`（缺失 null）、Bridge `source_id`、`event_time`/`time_precision`、`received_at`、`missing_fields`；
  - digest：来源 conversation 范围、群范围（如适用）、生成时间、摘要是否包含原文、授权/审计依据；不得把跨会话混合摘要当单会话原文；
  - handover：当前会话运行限定当前 conversation_id；进入 Memory/跨会话时经 Memory 受控接口，记录来源范围、用途、创建者、授权依据、生命周期；不得默认包含其他会话原文。
- 逻辑要求可执行；物理字段名/TTL 保持 OPEN，符合任务要求。
- **PARTIAL** 点：digest 的生命周期/读取范围/过期/撤回仍不如 handover 明确；turn/transcript 的 `source_id` 与 Memory evidence source_id 的命名分工只靠 §5.2 一句，未在 §5.6 重复。

**当前实现：REJECT**

| 路径 | 当前传参 | 缺失 |
|---|---|---|
| `saveGroupTurn`（`lib/group-turn-memory.js:122`） | `groupId/groupName/incoming[{speaker,text}]/reply/at` | conversation_id、session_id、external_speaker_id、Bridge source_id、event_time/time_precision、received_at、missing_fields |
| `saveGroupTranscript`（`lib/group-digest.js:88`） | `groupId/groupName/at/messageId/header(synthetic)/messages[{speaker,text,at}]` | conversation_id、external_speaker_id、source_id、time_precision/received_at；共享 `GROUP_CWD` |
| `saveGroupDigest` | 已退役（`DIGEST_RETIRED=true`，`lib/group-digest.js:14`） | 当前无 Memory digest 路径；未来字段未实现 |
| `handover` | Bridge 本地生成/注入 home（`lib/handover.js:186-196`），不写 Memory | 当前会话限定/来源范围/授权/生命周期均无；若未来入 Memory，字段未实现 |

**结论**：合同逻辑字段可用；当前实现 REJECT；物理/TTL 仍 OPEN。

---

### C. Bridge 不得自行读取 Memory history/legacy 通道并包装成 current context

**合同文本：PARTIAL**

- §5.6 明确 Bridge 不得自行建立 Memory 历史通道、不得读取/拼接 legacy/unknown、不得把历史结果自动注入当前会话；跨会话读取必须经明确授权的受控接口。方向正确。
- 但合同没有把 `publicBrief`/`handoffBrief` 明确归入“Memory 历史通道”或“current summary”。如果它们是 current summary，必须过滤 legacy；如果它们可能返回 history，必须带标记且不得进入 current。当前文本两者都可能解释。
- 合同没有要求 `publicBrief`/`handoffBrief` 返回 `source_conversation_ids[]`/`legacy/unknown` 标记；Bridge 无法判断返回值是否可注入。
- R3 的 §7.5.1 说 legacy 不得进入 “current 摘要”；`publicBrief`/`handoffBrief` 是 current 摘要，因此按 R3 语义应过滤；但 §5.6/P0-1 未把这条落到 Bridge 接口。

**当前实现：REJECT（风险）**

- Bridge 直接调用 `publicBrief`/`handoffBrief`，没有过滤/标记检查（`lib/public-brief.js:22-35`、`lib/sessions.js:202-238`）。
- Memory `publicBrief` 无 validity/legacy 过滤；`handoffBrief` owner todos/decisions 无 validity/legacy 过滤（Memory `lib/service.js:529-548`、`lib/handoff/brief.js:35-58`）。
- 因此，如果这些接口返回 legacy/unknown，Bridge 会把它们包装成 current context/seed；这正是 R3 想禁止的间接绕过。

**结论**：合同 PARTIAL；当前实现 REJECT（风险）。

### C2. Bridge 只提供平台原始事实，不决定 Memory 的时间/证据/置信字段

**合同文本：PASS**

- §5.1/§5.5/§5.6/§6 明确：Bridge 只采集平台事实；Memory 唯一写 canonical speaker/experiencer/evidence/validity/conflict/retraction/audit；Bridge 不得决定 `valid_from_kind`/`verification_status`/`confidence_level`。
- §5.2 把 `speaker_evidence` 改为 `platform_speaker_fact`，并明确 `source_id` 不等于 Memory evidence source_id；职责区分清楚（PASS）。
- R3 §7.1 新增“新记录默认 `confidence_level='unknown'`、numeric `confidence=NULL`”；这是 Memory 写入语义，Bridge 不设置。Bridge 只需不伪造、不传这些字段（PASS）。

**当前实现：PASS（不设置）/ PARTIAL（端到端被 Memory 默认值影响）**

- Bridge 没有设置 `valid_from_kind`/`verification_status`/`confidence_level`；`saveGroupTurn` 也不传 `confidence`，这些字段由 Memory 内部处理。就“Bridge 不自行决定”而言是 **PASS**。
- 但 Bridge 触发的 `saveGroupTurn` 在 Memory 侧仍写入 `confidence=0.6`（Memory `lib/service.js:641-653`），`publicBrief` 写入 `confidence=1`（`lib/service.js:523`）；R3 §7.1 要求新记录默认 NULL/unknown。这是 Memory 的 P0-5 实现问题，不是 Bridge 决定，但会阻塞端到端 R3 合规。
- `platform_speaker_fact` 在 Bridge `buildChannelMessage.source` 中不存在（`lib/message.js:10-38`）；`source_id` 也没有与 Memory evidence source_id 的分工字段。**NOT_IMPLEMENTED**。
- `received_at` 不得作 valid_from：§5.2/§5.6 已写清（PASS 合同）；当前 Bridge 无 `received_at`，只有 `at`，且缺时间会补当前时间（§D），下游可能误用。**REJECT（接口风险）**。

**结论**：合同 PASS；Bridge 不决定字段 PASS；`platform_speaker_fact` 当前 NOT_IMPLEMENTED；R3 §7.1 端到端受 Memory 默认值阻塞（Memory P0-5）。

---

### D. `event_time`、`time_precision`、`received_at` 边界

**合同文本：PASS（R2 已写清，R3 未改）**

- §5.2 明确 `event_time` 缺失/非法必须 null，不得用接收时间/当前时间；`time_precision` 缺失/无法判断为 unknown；`received_at` 是 Bridge 实际接收时间，与 event_time 分开，不得被 Memory 当作 `valid_from` 替代。
- §5.2 还明确缺失时间/身份必须 null/unknown，不得 `Date.now()`/群名/昵称补齐。

**当前实现：REJECT**

- `toMillis(t)` 在非有限/≤0 时返回 `Date.now()`（`lib/parse.js:151-155`）。
- `parseMessageEvent` 使用 `evt.time ?? now`（`lib/parse.js:175`）。
- `message.source` 只有 `at`，无 `event_time/time_precision/received_at`（`lib/message.js:10-38`）。
- `saveGroupTurn`/`saveGroupTranscript` 只传 `at`，没有区分 event/received（`lib/group-turn-memory.js:122`、`lib/group-digest.js:88`）。
- 562/562 不覆盖缺时间。

**结论**：合同 PASS；当前 REJECT。

---

### E. 群聊发言者归属

**合同文本：PARTIAL**

- §5.3/§5.4 语义清楚：group_id/external_speaker_id/forwarder_id/original_author_id/display_name_snapshot 分开；缺 sender → null/unknown；群实体不是成员；不得用群名/昵称/群号填充。
- 仍缺：
  1. 多跳/嵌套转发的字段模型（`forwarder_id`/`original_author_id` 单值不足）；
  2. quote 作者/当前 speaker 的区分（§5.2 没有 `quote_author_id`）；
  3. notice actor/operator/target 的字段（群撤回/禁言/拍一拍）；
  4. P0-2 没有可执行的 positive/negative 测试矩阵（P0-1 有测试项）；
  5. `group-turn`/`transcript` 必须写 `external_speaker_id` 的字段级断言。
- 结论：合同 PARTIAL。

**当前实现：REJECT**

- prompt 只显示 senderName（`lib/prompt.js:75-84`）；
- group bucket 只存 `{speaker,text,at}`（`lib/group-buckets.js:31-35`）；
- group-turn 只传 speaker（`lib/group-turn-memory.js:92-126`）；
- transcript 只传 speakerName，无 groupId/speakerId（Memory `lib/service.js:550-575`）；
- 缺 sender 退化群名（`lib/index.js:547,566`；探针）；
- forward 结构有 senderId 但 `formatForward` 只显示名字（`lib/forward.js:60-100,180-195`）；
- quote 有 senderId 但 `formatQuote` 只显示名字（`lib/quote.js:48-52,100-130`）；
- notice 把 QQ 号当 senderName，operator 未传（`lib/index.js:398-447`、`lib/notice.js:78-135`）；
- 562/562 无端到端测试。

---

### F. Conversation ID 与 Runtime Session

**合同文本：PARTIAL / PASS（R3 未改）**

- §3.1 格式/account 必填/legacy/fail-closed 清楚；但 `account_id` 的语义（接收消息的机器人账号）和格式/来源未写死；`legacy_unmapped` 物理表示/唯一 active 约束未定。
- §3.2 Host/DSH 权威 mint 清楚；Host API 插件上下文可用性 §11 标 BLOCKED/NOT RUN，合同态度正确。

**当前实现：REJECT / BLOCKED-NOT_RUN**

- `keyFor` 仍是 `group:<gid>`/`private:<qq>`，无 account，`replace(/\D/g,'')`，空/非法回退 `unknown`（`lib/sessions.js:119-124`）。
- Bridge `randomUUID()` 生成 sessionId（`lib/sessions.js:259,287,451,481`）；未调用 Host `sessionController.createSession`。
- `channel_sessions` 无 conversation_id/account_id/version/status（`lib/store.js:10-23,412-466`）；生产旧式 2 行无 `legacy_unmapped` 标记。
- Host mint 集成未验证 → **BLOCKED/NOT_RUN**；若不可用，新会话创建应 BLOCKED，不得回退 Bridge UUID。

**结论**：合同 §3 仍 PARTIAL；当前 REJECT；Host 集成 BLOCKED/NOT_RUN。

---

### G. 合同逻辑 PASS vs 代码实现 PASS

| 项 | 合同逻辑 | 代码实现 |
|---|---|---|
| event_time/time_precision/received_at | **PASS** | **REJECT** |
| platform_speaker_fact / source_id | **PASS** | **NOT_IMPLEMENTED** |
| 临时上下文/摘要/handover 当前 conversation | **PASS** | **REJECT** |
| 不读取 Memory history/legacy | **PASS**（直接历史通道） | **PARTIAL/REJECT（publicBrief/handoffBrief 风险）** |
| turn/transcript/digest/handover 字段 | **PASS（逻辑）/ PARTIAL（物理 OPEN）** | **REJECT** |
| P0-1 负向覆盖 | **PARTIAL**（publicBrief/handoffBrief 缺口） | **REJECT（无测试）** |
| P0-2 群发言者 | **PARTIAL** | **REJECT** |
| §3 Conversation ID | **PARTIAL** | **REJECT** |
| §3.2 Host mint | **PASS（合同）** | **REJECT / BLOCKED-NOT_RUN** |

**真实 QQ/NapCat、生产 DB、Memory/Persona 集成、P0 端到端均 NOT_RUN。**

---

## 3. P0-1 / P0-2 负向测试缺口

### P0-1（覆盖较好，但 publicBrief/handoffBrief 缺口）

已覆盖：

- legacy_unmapped 不进新 conversation；
- 新旧同群/同私聊；
- Memory legacy/unknown 不进 current；
- Bridge context/group fallback/digest/handover 不消费其他 conversation/历史通道；
- 缺时间 null/unknown；
- 缺 sender null；
- 旧 numeric confidence 不变；
- 合成数据/临时 DB。

缺口：

1. `publicBrief`/`handoffBrief` 未列入；这是 Bridge 实际两个跨来源 summary 路径。
2. 未明确 `getGroupContext` 正常路径 vs fallback 的测试分离（正常路径也应 group_id 精确）。
3. 未明确 `handoffBrief` 的 owner project/todos/decisions 来源 conversation 检查。
4. 未给出测试 ID/断言模板（合同允许实现计划细化，但实施前需落地）。

### P0-2

- 已有语义，但没有多跳转发、quote 作者、notice actor/operator 的测试；没有正/负矩阵。
- 需要 T-A1～T-A8：群 A 成员甲、缺 user_id、同名、群 B、群实体、forwarder/原作者的引用/合并转发、quote 作者、notice actor/operator；缺 sender 时 `external_speaker_id=null`，不得出现群名/昵称。

---

## 4. 现状/建议/未验证

### 4.1 现状（代码事实）

- `toMillis()` 缺失/非法 → `Date.now()`（`lib/parse.js:151-155,175`）。
- `message.source` 无 event_time/time_precision/received_at/platform_speaker_fact/source_id（`lib/message.js:10-38`）。
- `buildSessionContext` 按 channel（`lib/context.js:8-36`、`lib/store.js:330-339`）；`getGroupContext` fallback 按 kind（`lib/index.js:287-290`）；`handover` 按 channel（`lib/handover.js:143-152,186-196`）。
- `publicBrief` 无 validity/legacy 过滤（Memory `lib/service.js:529-548`）；`handoffBrief` owner todos/decisions 无 validity/legacy 过滤（Memory `lib/handoff/brief.js:35-58`）。
- `saveGroupTurn`/`saveGroupTranscript` 只传显示名/共享 cwd（`lib/group-turn-memory.js:122`、`lib/group-digest.js:88`）。
- `keyFor` 旧 key/无 account/剥字符/unknown（`lib/sessions.js:119-124`）；session `randomUUID`（`lib/sessions.js:259,287,451,481`）。
- 562/562 fake transport 通过，不覆盖上述契约语义。

### 4.2 建议（PROPOSAL）

1. §5.6/P0-1 增加 `publicBrief`/`handoffBrief` 路径：必须返回 current/valid 摘要或显式 history 标记；Bridge 不得把 history/legacy 返回注入 current。
2. §5.6 明确 `publicBrief`/`handoffBrief` 的来源 conversation/owner scope/uncertainty 字段；`handoffBrief` 的 owner todos/decisions 需有效性/legacy 过滤。
3. §5.2/§5.6 明确 `event_time=null`/`time_precision`/`received_at` 与 `platform_speaker_fact` 的字段映射；实现前保持物理 OPEN。
4. P0-2 增加多跳转发、quote 作者、notice actor/operator、缺 sender 的测试矩阵。
5. §3.1 明确 account_id 语义/来源与 legacy_unmapped 物理表示；§3.2 保留 Host mint BLOCKED 规则。
6. 记录 `saveGroupTurn`/`saveGroupTranscript` 是否属于受控接口；若否则标 legacy，不得继续直接调用。

### 4.3 未验证（NOT_RUN）

- Memory `publicBrief`/`handoffBrief` 对 legacy/unknown 的实际过滤行为（只读代码推断，未运行探针）。
- Host `sessionController.createSession` 在 Bridge 插件上下文可用性。
- 真实 OneBot/NapCat 的时间/sender/forward/quote/notice 字段。
- Memory/Persona 全量测试、P0 端到端、生产 DB、迁移、Owner 关联、v6/v3/EI-2A。
- 真实发送/渠道操作。

---

## 5. 未决 Owner 决策/合同问题

- `account_id` 精确语义/来源；`legacy_unmapped` 物理表示；唯一 active 约束/轮换历史。
- `publicBrief`/`handoffBrief` 是否属于 current summary/history channel；其来源/授权/过滤要求。
- digest 生命周期/TTL/读取范围（任务要求保持 OPEN，但合同逻辑需明确）。
- 多跳转发/quote/notice 的字段模型。
- `saveGroupTurn`/`saveGroupTranscript` 是否受控 Memory 接口。
- 物理字段/TTL/迁移方案仍 OPEN；不得自行决定。

---

## 6. 不得执行事项确认

- 未修改合同/代码/测试/Schema/DB/生产配置；
- 未连接真实 QQ/NapCat；
- 未发送消息；
- 未创建/修改 Runtime Session；
- 未实施 digest/handover 生命周期变更；
- 未决定 account_id/TTL/物理字段/迁移；
- 未把建议写成 Owner 已批准。

---

## 7. 最终状态

| 项 | 状态 |
|---|---|
| R3 §7.1 新默认 | **PASS（合同）**；当前 Memory 代码未实现，Bridge 不决定但 group-turn 路径仍会产生 0.6 numeric confidence（Memory 侧 P0-5） |
| R3 §7.5.1 legacy 收紧 | **PASS（合同）**；当前 Bridge 可通过 publicBrief/handoffBrief 间接接收 legacy/unknown，风险 **REJECT** |
| §5.6 Bridge 临时上下文/摘要/handover | **PASS（合同文本）**；当前实现 **REJECT** |
| §5.6 publicBrief/handoffBrief 覆盖 | **PARTIAL**（合同未点名）；当前 **REJECT** |
| event_time/time_precision/received_at | **PASS（合同）/ REJECT（当前）** |
| Conversation ID / Runtime Session | **PARTIAL/PASS（合同，未改）/ REJECT（当前）；Host mint BLOCKED/NOT_RUN** |
| P0-1 | **PARTIAL**（覆盖较好，但 publicBrief/handoffBrief 未列）；当前 **REJECT** |
| P0-2 | **PARTIAL**；当前 **REJECT** |
| 合同 v1.2.0 R3 | **CANDIDATE / NOT FROZEN** |
| 本报告 | **READY_FOR_REVIEW** |

**结论**：R3 的 Memory 域 legacy/confidence 收紧是正确且更严格的；但 Bridge 侧没有新增条款，`publicBrief`/`handoffBrief` 两个实际摘要入口未被 §5.6/P0-1 覆盖，构成 R3 “legacy 不得进入 current”的间接绕过风险；当前 Bridge 实现仍不满足合同。不冻结合同、不标记整体 PASS。
