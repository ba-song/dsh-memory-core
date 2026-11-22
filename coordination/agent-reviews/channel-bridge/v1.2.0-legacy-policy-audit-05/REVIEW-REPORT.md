# v1.2.0 §7.5.1 Owner 决策落实后的 Bridge 边界复核

- 任务：v1.2.0 §7.5.1 Owner 决策落实后的 Bridge 边界复核（Channel Bridge）
- 角色：Channel Bridge 渠道接入与会话桥接专项负责人
- 性质：只读复核；不修改合同、Bridge 源码、测试、Schema、数据库、生产配置；不连接真实 QQ/NapCat；不发送消息；不修改 Conversation ID；不切换 Runtime Session mint；不实施群归档/上下文修复。
- 报告状态：**READY_FOR_REVIEW**
- 合同状态：**CANDIDATE / NOT FROZEN**
- 当前 Bridge 实现：**REJECT / PARTIAL**（逐项见下）
- 生成时间：2026-11-22（Asia/Shanghai）

---

## 0. 总体结论

本次候选合同相对上一版只改动了 **§7.5.1**（Owner 已批准旧记忆保护原则），其余章节未变。§7.5.1 本身忠实落实了 D4/D5 的“旧记忆保留、历史近似/未知时间分流、不得伪造”原则，且明确“原则不等于已实现、不构成迁移授权”，这部分 **PASS**。

但 §7.5.1 是 **Memory 域**的旧记忆策略，**没有新增 Bridge 侧边界**。它没有说明：

- Bridge 的临时上下文/临时摘要是否可以消费旧记忆或历史近似记录；
- Bridge 的临时摘要与 Memory 的“历史回忆/参考通道”是什么关系；
- transcript/turn/digest/handover 进入 Memory 时必须携带哪些字段；
- 缺失时间时 Envelope 的 `event_time` 应如何表达（当前 Bridge 会用 `Date.now()` 补齐）；
- 新旧消息/旧会话/legacy 记录不得进入当前上下文的负向测试标准。

因此：**§7.5.1 合同条款 PASS；Bridge 侧边界仍为 PARTIAL；当前实现 REJECT/PARTIAL。**

---

## 1. 基线

| 对象 | 值 |
|---|---|
| 合同 | `ba-song/dsh-memory-core` 分支 `docs/memory-persona-contract-v1.2.0-owner-review` @ `f06872306a983660a79b036dd852e98826e20ac7` |
| 合同 tree | `39ca5e9da0e919861f4eb500183f8a8b9e1fcdb6` |
| 合同 blob | `8c507716b102070e3532544fc9d1d4abf079de3c`（792 行） |
| 上一版合同 | `1dced58a8093222a70853668fca6cf35cf7674ed`（790 行，blob `2b821169...`） |
| Bridge 代码 | `ba-song/dsh-channel-bridge` main @ `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` |
| Bridge tree | `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| Bridge package | `dsh-channel-bridge@0.18.0` |
| Bridge 测试 | `npm test` @ `bffcabc`：**562/562 pass / 0 fail / 0 skip，exit 0**（fake transport） |

**本次 diff**：仅 §7.5.1 修改（`git diff 1dced58 f068723`，`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-CANDIDATE.md`，+10/−8 行），其余章节（§3、§5、§9）未变。因此上一轮 v1.2.0 审计中关于 Conversation ID、Host mint、Envelope、群发言者、受控接口、P0-1/P0-2 的缺口仍存在，本报告只复核新增/受影响部分。

合同关键行号：

| 章节 | 行号 |
|---|---|
| §5.2 Envelope | 334–357 |
| §5.3 发言者字段 | 358–367 |
| §5.4 群聊规则 | 368–376 |
| §5.5 Memory 唯一写 | 377–388 |
| §5.6 Bridge/Memory 边界 | 389–398 |
| §6 RACI | 399–421 |
| §7.5 有效性与时间 | 494–518 |
| §7.5.1 旧记忆/时间边界 | 519–531 |
| §7.6 不确定记忆用途 | 533–539 |
| §8 旧记忆保护/迁移 | 542–595 |
| §9 P0-1 | 601–617 |
| §9 P0-2 | 618–631 |

---

## 2. 逐项复核

### 2.1 Bridge 临时上下文、临时摘要、长期记忆、历史回忆/参考通道的边界

**合同现状**

- §5.6：Bridge 可维护自身的渠道事件、投递状态、会话内临时上下文或受控原文引用；这些不等于 Memory 记忆；任何进入 Memory 的 message/turn/transcript/digest/handover 必须通过 Memory 受控 ingestion；Bridge 可生成仅供自身会话运行使用的临时摘要；若成为长期/跨会话，必须经 Memory 来源、主体、有效性、权限校验。
- §7.5.1：旧记录可进入“带有历史近似/时间不确定标记的历史回忆与参考通道”；`unknown` 只能进入专门的不确定历史回忆/参考通道，不得进入普通 current-fact 注入。
- §7.6：不确定记忆可用于回忆/参考，不得单独支撑重要决策。

**判断：PARTIAL**

- **清楚的部分**：Bridge 临时上下文≠Memory；长期/跨会话必须经 Memory；旧/未知记录不能普通注入。方向正确。
- **未清楚的部分**：
  1. §7.5.1 只定义 Memory 的历史回忆/参考通道，没有说明 Bridge 是否有对应通道。Bridge 的 `handover`/`buildSessionContext` 是“临时历史回顾”，但合同没有说它们只能来自当前 conversation，且不得消费 Memory 的 legacy/unknown 历史记录。
  2. “临时摘要”没有 TTL、存储位置、可见范围、审计；没有明确“只能从当前 conversation_id 的原文生成”。
  3. `handover` 同时出现在 §5.6 的“进入 Memory 内容”和 Bridge 的临时注入路径中；合同没有区分“handover 临时注入当前会话”与“handover 写入长期记忆”的边界。
  4. 历史回忆/参考通道的物理/接口归属未定；合同说“专门通道”，但没有规定由 Memory 提供、Bridge 只能通过受控接口读取，还是 Bridge 可以自己拼历史摘要。

**当前实现：REJECT**

- `buildSessionContext` 只按 `channel` 取最近入站（`lib/context.js:8-36`、`lib/store.js:330-339`）；`contextBuilder` 不传当前 conversation（`lib/index.js:263`）。
- `getGroupContext` fallback 只按 `kind=group`（`lib/index.js:287-290`）。
- `handover` 按 channel 全量取入站，`formatHandover` 把所有 user 行标成「主人」（`lib/handover.js:143-152,186-196`）。
- `groupDigest` 共享 `GROUP_CWD`（`lib/group-digest.js:61-88`）；Memory `saveGroupTranscript` 用合成 header、无 groupId/speakerId。
- 结论：Bridge 临时上下文/摘要没有 conversation 级边界；历史回忆/参考通道未建立。

**建议（PROPOSAL）**

- 在 §5.6 增加：Bridge 临时上下文/摘要只能来自当前 `conversation_id`；不得读取/拼接 Memory 的历史回忆通道、legacy/unknown 记录或其他 conversation 原文；临时摘要 TTL/存储/审计最小字段。
- 在 §7.5.1 明确“历史回忆/参考通道由 Memory 提供；Bridge 不得自行实现或消费该通道；Bridge 的 handover 不是该通道”。

---

### 2.2 Bridge 是否只提供渠道原始事实，不决定 Memory 的 `valid_from_kind` / `verification_status` / `confidence_level`

**合同现状**

- §5.5：Memory 唯一写 canonical speaker/experience/evidence/validity/conflict/retraction/audit。
- §5.6：Bridge 不得代替 Memory 决定 speaker/experiencer/evidence/validity 字段。
- §6 RACI：`validity / supersession` 只有 Memory 写；Bridge 不写。
- §7.5.1：时间/验证/confidence 是 Memory 域，旧记录 numeric confidence 保留、不得映射成新 `confidence_level`。

**判断：PASS（合同）**

- 合同明确 Bridge 只提供平台事实；`valid_from_kind`/`verification_status`/`confidence_level` 由 Memory 决定；§7.5.1 还禁止把旧 numeric confidence 直接映射成新 `confidence_level`。方向清楚。
- 可补充：§5.2 `speaker_evidence` 这个命名容易被误解为 Memory evidence；建议改名为 `platform_speaker_fact`，并明确“Bridge 不产出 verification_status/confidence_level”。这不是原则冲突，是命名清晰度问题。

**当前实现：PASS（不设置字段）/ PARTIAL（未提供足够事实）**

- 当前 Bridge 没有设置 `valid_from_kind`/`verification_status`/`confidence_level`；这些字段不存在于 Bridge；`saveGroupTurn` 由 Memory 内部写死 `importance=0.35, confidence=0.6` 等，Bridge 不传这些字段。就“Bridge 不自行决定”这一点，当前实现是 **PASS**。
- 但 Bridge 也没有提供 Memory 决定这些字段所需的 `conversation_id/group_id/external_speaker_id/source evidence`；这属于 §2.3，不是“越权决定”。

**结论**：合同 **PASS**；当前 Bridge 在“不决定”上 **PASS**，在“提供事实”上 **PARTIAL**。

---

### 2.3 transcript、turn、digest、handover 进入 Memory 时的字段保留

**合同现状**

- §5.2 Envelope 列了 `conversation_id`、`group_id`、`external_speaker_id`、`source/source_id`、`speaker_evidence`、`missing_fields`、`event_time` 等。
- §5.6 只对“群聊 transcript/turn”明确要求保留 `group_id` 与可得的 `external_speaker_id`；没有逐项要求 `conversation_id`、`source/source_id`、`speaker_evidence` 也必须在 transcript/turn/digest/handover 中保留。
- §5.6 说任何 message/turn/transcript/digest/handover 进入 Memory 必须经 Memory 受控接口，但没有定义这些内容类型的最小字段集。
- `handover` 在 §5.6 被列为“进入 Memory 的内容”之一，但没有字段清单；`digest` 也没有。
- 合同没有说明 `conversation_id` 在 Memory turn/transcript 中是必填、可空还是 legacy 可空；没有说明 `source_id` 是 Bridge event id 还是 Memory evidence source id。

**判断：PARTIAL**

- 方向正确，但**不足以实现**：
  1. turn/transcript 必须明确 `conversation_id`、`group_id`、`external_speaker_id`、`source_id`/`source evidence`、`event_time`/`time_precision`、`missing_fields`；
  2. digest 需要 `source_conversation_ids[]`、`group_id`、生成时间、来源范围、是否含原文、授权/审计；
  3. handover 若进入 Memory，需要 `source_conversation_ids[]`、`owner_authorized`、`raw_content_included=false`（建议）、`created_by`、`purpose`、`expires_at`；
  4. 需要区分 Bridge `source_id`（传输/审计幂等键）与 Memory evidence `source_id`（证据独立性键）。

**当前实现：REJECT**

- `saveGroupTurn`（`lib/group-turn-memory.js:122`）传入：`groupId/groupName/incoming[{speaker,text}]/reply/at`；无 `conversation_id`、`session_id`、`external_speaker_id`、`source_id`、`speaker_evidence`。
- `saveGroupTranscript`（`lib/group-digest.js:88`）传入：`groupId/groupName/at/messageId/header(synthetic)/messages[{speaker,text,at}]`；无 `conversation_id`、`external_speaker_id`、`source_id`/evidence；`GROUP_CWD` 共享，`person_id` 可能为空/`person:owner`（Memory 代码）。
- `groupDigest.save` 的旧 `saveGroupDigest` 已退役（`DIGEST_RETIRED=true`，`lib/group-digest.js:14`）；当前只有 transcript 路径；未来 digest 没有字段合同。
- `handover` 当前是 Bridge 生成并注入 home（`lib/handover.js:186-196`），不进入 Memory，但也不满足 P0-1 的 conversation 隔离；如果未来要进入 Memory，没有字段合同。
- 结论：当前实现 **REJECT**；合同 **PARTIAL**，需逐内容类型补最小字段。

---

### 2.4 缺失 speaker 或时间信息时的 unknown 行为

**合同现状**

- 缺 speaker：§5.4 明确 `external_speaker_id=null`，Memory `speaker_id/experiencer_id` unknown/null；禁止群号/群名/昵称/群实体填充；§5.6 对 transcript/turn 重申缺成员 ID 保持 unknown。
- 缺时间：§7.5.1 明确 `valid_from_kind='unknown'` 只能进入不确定历史通道，不得普通注入；禁止伪造时间；§7.5 有 `valid_from_kind` 四态。
- 但 §5.2 Envelope 的 `event_time/timestamp` 没有 missing 行为；没有区分平台事件时间与接收时间；没有规定“缺失时间不得用当前时间补齐”。

**判断：PARTIAL**

- 缺 speaker：**PASS**。
- 缺时间：**PARTIAL**。§7.5.1 是 Memory 域的时间语义，不能直接推出 Bridge `event_time` 的缺失行为；合同应明确：
  - `event_time=null` + `time_precision='unknown'`；
  - `received_at` 单独记录，只作接收事实；
  - 不得用 `Date.now()` 填充平台事件时间；
  - 下游 Memory 不得把 `received_at` 当 `valid_from`。

**当前实现：REJECT**

- `toMillis(t)` 在 `Number(t)` 非有限或 ≤0 时返回 `Date.now()`（`lib/parse.js:151-155`）；`parseMessageEvent` 使用 `evt.time ?? now`（`lib/parse.js:175`）。缺时间/非法时间会被当前时间补齐，**REJECT**。
- 群缺 sender：`senderId=''`、`senderName=''`；`index.js:547,566` fallback 到 `contactName`，探针得到 `speaker-fallback='测试群'`，**REJECT**。
- 结论：speaker/time 两类 unknown 当前都没有被完整保留；合同 speaker 清楚、time 需补 Envelope 规则。

---

### 2.5 新旧消息上下文隔离与跨会话注入的负向测试标准

**合同现状**

- §7.5.1：旧记录/legacy/unknown 只能进入历史回忆/参考通道；不得普通 current-fact 注入。
- §9 P0-1：私聊 A/B、私聊/群、群 A/B、owner home/unified、新 session 按 conversation_id、缺 conversation_id fail closed、跨会话长期记忆授权、摘要≠原文；负向测试放哨兵断言 0。
- 没有明确要求：
  - 旧 `legacy_unmapped` 会话/消息不进入新上下文；
  - 旧 Memory `valid_from_kind=legacy/unknown` 不进入普通 current 注入；
  - 历史回忆/参考通道的内容不得被 Bridge 注入当前 session；
  - 缺失时间的 Bridge 事件不得以 `Date.now()` 伪装成当前事件；
  - 新旧同群/同私聊的隔离测试。

**判断：PARTIAL**

- P0-1 的负向哨兵标准覆盖“新会话之间的跨会话泄漏”，但没有覆盖“旧记录/legacy/历史通道 → 当前会话”的隔离。§7.5.1 新增了旧记忆策略，却没有同步更新 P0-1 的测试标准。这是本版最关键的缺口。
- 建议增加可执行用例（PROPOSAL）：
  1. T-LEG-1：旧 `group:<gid>`/`private:<qq>`/`legacy_unmapped` 会话/消息不得进入新 `conv:...` 上下文；哨兵 0。
  2. T-LEG-2：Memory 旧记录 `valid_from_kind=legacy/unknown` 不得进入普通 current 注入；历史回忆/参考通道可返回，但必须带不确定性标记；当前 session 哨兵 0。
  3. T-LEG-3：新旧同群/同私聊：新 conversation 只含新消息，旧 legacy 0。
  4. T-LEG-4：Bridge `handover`/`buildSessionContext` 消费旧/其他会话原文；负向 0。
  5. T-LEG-5：缺失/非法 `event_time` → `event_time=null`/`time_precision=unknown`，不得等于 `received_at`/当前时间。
  6. T-LEG-6：缺 sender → `external_speaker_id=null`，不得出现群名/昵称。
  7. T-LEG-7：旧记录 numeric confidence 保留原值，不映射新 `confidence_level`；负向断言不变。
- 这些测试需要 Bridge 临时 DB + Memory 临时 DB，合成数据；不得用生产。

**当前实现：REJECT**

- Bridge `buildSessionContext` 的 SQL 只按 channel（`lib/context.js:8-36`、`lib/store.js:330-339`），没有 legacy/new 过滤。
- `channel_events` 没有 `legacy_unmapped`/`conversation_id` 字段，旧事件无法标记/排除。
- `handover` 按 channel 全量；`getGroupContext` fallback 按 kind；群归档共享 cwd。
- 结论：当前实现无法通过 T-LEG-1～T-LEG-7。

---

## 3. §7.5.1 本身评价

| 项 | 评价 |
|---|---|
| 忠实落实 Owner D4/D5 | **PASS**：旧记忆保留、numeric confidence 原值保留、legacy/unknown 分流、不得伪造、原则不构成迁移授权 |
| 是否新增 Bridge 边界 | **NO**：§7.5.1 全在 Memory 域，未提 Bridge 临时上下文/摘要/handover/历史通道 |
| 是否足以支撑 P0-1 的旧/新隔离测试 | **PARTIAL**：有政策，无测试/接口/字段 |
| 是否改变当前实现合规性 | **NO**：合同仍注明“不代表已实现”；当前 Bridge 仍有旧上下文、时间补齐、字段缺失 |

---

## 4. 现状、建议、未验证的区分

### 4.1 现状（代码事实）

- Bridge `keyFor` 旧 key、无 account、剥字符、unknown 回退（`lib/sessions.js:119-124`）。
- Bridge session 自建 UUID（`lib/sessions.js:259,287,451,481`）。
- Envelope `source` 缺 conversation/account/runtime_session/chat_type/peer/group/external_speaker/forwarder/original_author/message_id/source/evidence（`lib/message.js:10-38`）。
- `buildSessionContext` 按 channel；`getGroupContext` fallback 按 kind；`handover` 按 channel；群归档共享 cwd（`lib/context.js:8-36`、`lib/index.js:263,287-290`、`lib/handover.js:143-152,186-196`、`lib/group-digest.js:61-88`）。
- 缺 sender 退化群名（`lib/index.js:547,566`；探针）。
- 缺/非法时间用 `Date.now()`（`lib/parse.js:151-155,175`）。
- `saveGroupTurn`/`saveGroupTranscript` 只传显示名，缺 conversation/group/speaker/evidence（`lib/group-turn-memory.js:122`、`lib/group-digest.js:88`）。
- 562/562 fake transport 通过；不覆盖上述契约语义。

### 4.2 建议（PROPOSAL，不是实施）

1. 在 §5.6 增加 Bridge 临时上下文/摘要的 **conversation_id 强制**、TTL、审计、禁止消费历史 channel/legacy/unknown。
2. 在 §7.5.1 增加一句“Bridge 不得自行实现历史回忆/参考通道；该通道由 Memory 提供”。
3. 在 §5.2/§5.6 增加 `event_time` 缺失语义：`event_time=null`、`time_precision='unknown'`、`received_at` 独立，不得用当前时间补。
4. 明确 turn/transcript/digest/handover 的最小字段：
   - turn/transcript：conversation_id、group_id、external_speaker_id（可 null）、source_id、speaker_evidence、event_time/time_precision、missing_fields；
   - digest：source_conversation_ids[]、group_id、生成时间、是否含原文、授权/审计；
   - handover：source_conversation_ids[]、owner_authorized、raw_content_included=false、created_by、purpose、expires_at。
5. 在 §9 P0-1 增加 T-LEG-1～T-LEG-7；P0-2 增加缺 sender/群名/转发链测试。
6. 将 `speaker_evidence` 改名/说明为 `platform_speaker_fact`，与 Memory evidence 区分。
7. 明确 `legacy_unmapped` 的物理标记/查询规则；当前 Bridge `channel_events` 无该字段。

### 4.3 未验证（NOT RUN）

- Host/DSH `sessionController.createSession` 在 Bridge 插件上下文的可用性；
- 真实 QQ/NapCat 的 `event.time` 缺失/非法分布、sender/forward/quote/notice 字段；
- 生产旧会话/旧事件的 `legacy_unmapped` 比例；
- Memory 历史回忆/参考通道的物理/API 实现；
- 真实 Memory/Persona 端到端注入与 P0 测试；
- 生产 DB/迁移/部署/发送。

---

## 5. 代码与合同证据索引

| 结论 | 证据 |
|---|---|
| §7.5.1 变更 | `git diff 1dced58 f068723`：仅 §7.5.1，+10/−8 |
| §7.5.1 旧记忆原则 | 合同 `519–531` |
| §5.6 Bridge/Memory 边界 | 合同 `389–398` |
| §5.2 Envelope 字段 | 合同 `334–357` |
| §5.4 群聊 unknown | 合同 `368–376` |
| §9 P0-1 | 合同 `601–617` |
| §9 P0-2 | 合同 `618–631` |
| keyFor 旧 key/剥字符/unknown | `lib/sessions.js:119-124` |
| session 自建 UUID | `lib/sessions.js:259,287,451,481` |
| Envelope source 缺字段 | `lib/message.js:10-38` |
| 新会话按 channel | `lib/context.js:8-36`；`lib/store.js:330-339`；`lib/index.js:263` |
| 群 fallback 按 kind | `lib/index.js:287-290` |
| handover 全量/标主人 | `lib/handover.js:143-152,186-196`；`lib/store.js:293-305` |
| 群归档共享 cwd | `lib/group-digest.js:61-88`；Memory `lib/service.js:550-575` |
| 缺 sender 退化群名 | `lib/index.js:547,566`；探针 |
| 缺时间补当前 | `lib/parse.js:151-155,175` |
| 群 turn/transcript 缺字段 | `lib/group-turn-memory.js:122`；`lib/group-digest.js:88` |
| Bridge 测试 | `npm test` 562/562 @ `bffcabc`（fake transport） |

---

## 6. 最终状态

| 项 | 状态 |
|---|---|
| §7.5.1 Owner 旧记忆原则 | **PASS**（忠实、未声称已实现） |
| Bridge 临时上下文/摘要/历史通道边界 | **PARTIAL**（合同未新增 Bridge 侧规则） |
| Bridge 不决定 valid_from_kind/verification_status/confidence_level | **PASS（合同）/ PASS（当前不设置）/ PARTIAL（事实不足）** |
| transcript/turn/digest/handover 字段 | **PARTIAL（合同）/ REJECT（当前）** |
| 缺 speaker unknown | **PASS（合同）/ REJECT（当前）** |
| 缺时间 unknown/不补当前 | **PARTIAL（合同）/ REJECT（当前）** |
| 新旧上下文隔离负向测试 | **PARTIAL（合同）/ REJECT（当前）** |
| 合同 v1.2.0 | **CANDIDATE / NOT FROZEN** |
| 本报告 | **READY_FOR_REVIEW** |

**结论**：§7.5.1 本身是合格的 Owner 旧记忆保护条款，但它没有解决 Bridge 侧临时上下文/摘要/历史通道、时间缺失、turn/transcript/digest/handover 字段和新旧隔离测试的问题。当前 Bridge 实现仍不能通过 P0-1/P0-2 的旧/新隔离与群发言者验收；本报告不冻结合同、不标记整体 PASS。
