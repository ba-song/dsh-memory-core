# v1.2.0 R4 · Channel Bridge 专项合同复核

- 任务：DSHA v1.2.0 R4 合同只读复核（Channel Bridge）
- 角色：Channel Bridge 渠道接入与会话桥接专项负责人
- 性质：只读合同复核；不修改合同、源码、测试、Schema、数据库、生产配置；不连接真实 QQ/NapCat；不发送消息；不执行迁移/回填/部署/运行期写入；不改 Conversation ID/Runtime Session。
- 报告状态：**READY_FOR_REVIEW**
- 合同状态：**R4 CANDIDATE / NOT FROZEN**
- 当前 Bridge 实现：**REJECT / PARTIAL / NOT_IMPLEMENTED**
- 生成时间：2026-11-22（Asia/Shanghai）

---

## 0. 总体结论

R4 是独立文件 `DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-R4-CANDIDATE.md`（868 行），不是 R3 的同一文件；本报告以 R4 commit `cf20a50` 全文为准。

R4 针对上一轮 audit-07 指出的 **`publicBrief` / `handoffBrief` 旁路** 做了直接补强：

- 明确 `publicBrief`、`handoffBrief` 及等价摘要出口都是 **current-summary API**；
- 明确 current-summary API 必须经过 Memory 当前有效性、验证状态、主体/Conversation 范围、用途权限、来源检查；
- 明确 `legacy` / `unknown` / 未完成审批的历史近似记录不得进入 current-summary；
- 明确不得只在最终 prompt 过滤，摘要缓存、handoff payload、下游 merge 入口也必须过滤；
- 明确 Owner todo/decision 的 Owner 归属本身不构成跨 Conversation 授权，缺少来源 Conversation/权限/有效性时 fail closed；
- P0-1 负向矩阵新增 `publicBrief`、`handoffBrief` 的 legacy/unknown/history/跨 Conversation/无授权 Owner todo/decision fixture，以及摘要缓存、handoff payload、下游 merge 的断言。

因此，**摘要出口的合同边界本轮基本补齐**；R4 具备进入下一轮 Owner 审阅的候选资格。但以下问题仍存在：

- `publicBrief` 本质是 home→群的公开摘要，R4 要求 current-summary 做 Conversation 范围检查，却未定义它的跨 Conversation 公开授权载体/例外；可能把合法 public brief 也判为越界，或留下“public 即默认授权”的误读。
- `handoffBrief` 的 Owner todo/decision 要求“来源 Conversation、用途、授权依据”，但未给出 API 逻辑字段/返回结构；合同要求正确，实施入口仍 PARTIAL。
- §3 Conversation ID 本轮未改：`account_id` 的语义/格式/来源、`legacy_unmapped` 物理表示、唯一 active 约束仍为 PARTIAL；当前 Bridge 仍是旧 key/无 account/unknown 回退。
- §5.2/§5.6 已明确时间/身份字段，但当前 Bridge 仍 `toMillis()` 用 `Date.now()`，缺 `event_time/time_precision/received_at/platform_speaker_fact`。
- P0-2 仍未补多跳转发、quote 作者、notice actor/operator 的测试矩阵；Review 仍 PARTIAL。
- 当前 Bridge 实现仍全面不满足：context/group fallback/handover 跨会话；group-turn/transcript 只传显示名/共享 cwd；saveGroupTurn 的 Memory 路径仍写 `confidence=0.6`，与 R4 §7.1 新默认冲突；Conversation ID/Runtime Session 旧实现未改。

**结论**：R4 合同在摘要出口/current-history 隔离方面 **PASS（有少量 PARTIAL 授权载体缺口）**；Conversation/实现边界仍 **PARTIAL/REJECT**。建议 R4 进入下一轮 Owner 审阅，但不建议冻结或实施。

---

## 1. 基线

| 对象 | 值 |
|---|---|
| 合同仓库 | `ba-song/dsh-memory-core` |
| R4 合同实际所在分支 | `docs/memory-persona-contract-v1.2.0-r4-owner-review` @ `cf20a50f0bfca8b9182a9e699e223b2359c00319` |
| 任务所述分支 | `docs/memory-persona-contract-v1.2.0-owner-review` @ `571b9d0a...`（该分支 HEAD 是 R3 文件；R4 文件在 r4 分支，故本报告以精确 commit + 路径为准） |
| R4 合同路径 | `coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-R4-CANDIDATE.md` |
| R4 commit | `cf20a50f0bfca8b9182a9e699e223b2359c00319` |
| R4 tree | `9c363e80982814924714c2cc8f2d152a08d70f30` |
| R4 blob | `1893aed22a13275d7a81250637c1c10b8e6b7caa`（868 行） |
| 上一版 R3 | `571b9d0a466e33b0dccb4b4542e0f8b6539670bc`（R3 文件名，不是本文件） |
| Bridge 代码 | `ba-song/dsh-channel-bridge` main @ `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` |
| Bridge tree | `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| Bridge package | `dsh-channel-bridge@0.18.0` |
| Bridge 测试 | `npm test` @ `bffcabc`：**562/562 pass / 0 fail / 0 skip，exit 0**（fake transport） |

**R4 关键行号**

| 章节 | 行号 |
|---|---|
| §3.1 Conversation ID | 217–239 |
| §3.2 Runtime Session | 240–247 |
| §3.3 Conversation↔Session 记录 | 248–269 |
| §3.4 旧会话兼容 | 270–279 |
| §5.2 Envelope | 340–365 |
| §5.3 发言者字段 | 366–375 |
| §5.4 群聊规则 | 376–384 |
| §5.5 Memory 唯一写 | 385–396 |
| §5.6 Bridge/Memory 边界 | 397–416 |
| §7.1 三维证据/新默认 | 442–483 |
| §7.5.1 旧记忆/时间边界 | 554–574 |
| §9 P0-1 | 643–669 |
| §9 P0-2 | 670–683 |

---

## 2. 摘要出口 current/history 隔离

**合同文本：PASS（核心边界）/ PARTIAL（publicBrief 授权载体）**

R4 明确：

- `publicBrief`、`handoffBrief` 及任何面向当前运行会话的摘要出口，均视为 **current-summary API**（§5.6，397–416）；
- 只能返回经 Memory 当前有效性、验证状态、主体/Conversation 范围、用途权限、来源检查确认可用于 current 的内容；`legacy`、`unknown`、未完成逐类批准的历史近似记录不得进入结果；
- 不得只在最终注入层过滤；摘要缓存、handoff payload、下游 merge 也必须在入口处过滤；
- Owner todo/decision 的 Owner 归属本身不构成跨 Conversation 授权；缺少来源 Conversation、权限、有效性时 fail closed；
- History 结果只能由显式 history/历史参考接口返回，必须保留 typed channel/不确定性标记；不得被 publicBrief/handoffBrief/current 摘要/current merge/当前会话注入消费；
- P0-1 明确对 `publicBrief`/`handoffBrief` 分别放 legacy/unknown/history/跨 Conversation/无授权 Owner todo/decision fixture，current-summary 命中 0；并验证摘要缓存/handoff payload/下游 merge。

**判断**：

- **PASS**：R4 不再让 `publicBrief`/`handoffBrief` 因名称/来源绕过；摘要缓存、payload、merge 入口都写入禁止，直接回应 audit-07 的旁路。
- **PARTIAL**：`publicBrief` 是 home→群的公开摘要，天然跨 Conversation；R4 要求 current-summary API 做 Conversation 范围检查，但没有写“public scope + Owner 已授权公开近况”是否构成合法例外/授权载体。实施时可能：
  - 把合法 public brief 全部 fail closed，功能失效；或
  - 以“public 就是公开”默认为授权，重新打开跨 Conversation 旁路。
  需要合同补一句：publicBrief 的跨 Conversation 公开分享必须由 Owner 明确授权/配置，且仅限 public scope、无原文、可审计；未授权 fail closed。
- `handoffBrief` 的 Owner todo/decision 要求来源/用途/授权，但没有定义 API 逻辑字段/返回结构（source_conversation_ids、purpose、authorization_ref、validity），因此“可执行性”仍 PARTIAL；物理字段可 OPEN，但逻辑载荷应列出。

**当前实现：REJECT**

- `lib/public-brief.js:22-35` 直接调用 `dyMemory.publicBrief({limit})`，把返回文本拼 `[汐的近况]` 注入群 prompt（`lib/index.js:268-277`）；没有检查 Memory 返回项的 valid/legacy/unknown/scope/authorization。
- `lib/sessions.js:202-238` 直接调用 `dyMemory.handoffBrief({...})`，把结果用于轮换 seed；没有检查 Owner todo/decision 的来源 Conversation/用途/授权/validity。
- Memory `publicBrief`（Memory `lib/service.js:529-548`）只查 `scope_type='public'` + TTL，不查 valid/legacy/verification；`handoffBrief` owner todos/decisions（Memory `lib/handoff/brief.js:35-58`）没有 validity/legacy 过滤。若这些接口返回 legacy/unknown，R4 的 current-summary 禁止会被 Bridge 间接绕过。
- `handover` 有 `cached` 变量（`lib/handover.js:160-196`）缓存交接文本；缓存生成前按 channel 全量取入站，若未来接入 current-summary 缓存过滤，当前也没有入口过滤。当前 `handover` 不写 Memory，但会注入 home，属于 P0-1 的跨会话路径。
- 562/562 测试不覆盖 publicBrief/handoffBrief legacy/unknown/授权 fixture。

**建议/未验证**

- 合同补 publicBrief 跨 Conversation 公开授权的明确载体；补 handoffBrief 的逻辑字段（source_conversation_ids/purpose/authorization_ref/validity）。
- 需要 Memory 侧对 `publicBrief`/`handoffBrief` 做 valid/legacy/unknown/scope/authorization 过滤；Bridge 侧在调用前/后校验返回元数据；本轮只读代码，未运行探针。

---

## 3. Conversation 隔离

**合同文本：PARTIAL（§3 未改）**

- §3.1 格式、account 必填、peer/group、禁有损归一化、缺字段 fail closed、旧 key legacy_unmapped、不参与新上下文，方向清楚。
- §3.2 Host/DSH 权威 mint、Bridge 不得自建、Host 不可用则 BLOCKED，清楚。
- §3.3 逻辑字段/唯一 active 关系、audit/version，方向清楚；物理表 OPEN。
- §3.4 旧记录只读/不推断，清楚。
- **PARTIAL** 的原因仍是上一轮未改：
  1. `account_id` 只说明“区分不同机器人/登录账号”，未明确是**接收消息的机器人账号**、格式（QQ 数字字符串）和来源（`self_id`/`get_login_info`）；
  2. `legacy_unmapped` 的物理 status/version/查询规则未定；
  3. “同一 conversation 不得同时指向冲突 active session”是逻辑约束，唯一索引/轮换历史未定；
  4. owner 私聊/home 是否必须使用 conversation_id 并写映射，未特别说明；
  5. `publicBrief`/`handoffBrief` 的跨 Conversation 公开摘要授权载体未定（见 §2）。

**当前实现：REJECT**

- `keyFor` 仍是 `group:<gid>`/`private:<qq>`；无 account；`replace(/\D/g,'')`；空/非法回退 `unknown`（`lib/sessions.js:119-124`）。
- `channel_sessions` 主键 `(channel, kind)`，无 conversation_id/account_id/version/status（`lib/store.js:10-23,412-466`）；旧式 `group`/`private` 行无 legacy 标记。
- `buildSessionContext` 只按 channel（`lib/context.js:8-36`、`lib/store.js:330-339`）；`contextBuilder` 不传 conversation（`lib/index.js:263`）；`getGroupContext` fallback 只按 kind（`lib/index.js:287-290`）。
- `handover` 按 channel 全量（`lib/handover.js:143-152,186-196`）；`groupDigest` 共享 `GROUP_CWD`（`lib/group-digest.js:61-88`）。
- 缺少/非法 conversation 时没有 fail closed；反而 `unknown` 回退。
- Host mint：Bridge 仍 `randomUUID()`（`lib/sessions.js:259,287,451,481`），未调用 Host `sessionController.createSession`；Host 集成 **BLOCKED/NOT_RUN**。

**测试**：562/562 不覆盖多 account、conv 格式、legacy、缺字段、Host mint、跨会话。

---

## 4. 消息来源与群聊归属

**合同文本：PASS（时间/字段）/ PARTIAL（群聊多跳/quote/notice）**

- §5.2 明确 `event_time` 缺失/非法 null、`time_precision` unknown、`received_at` 分开、不得当 valid_from；缺失时间/身份不得 `Date.now()`/群名/昵称补齐（PASS）。
- §5.2 明确 `platform_speaker_fact` 原始事实、`source/source_id` 不与 Memory evidence 混用（PASS）。
- §5.3/§5.4 明确 group_id/external_speaker_id/forwarder_id/original_author_id/display_name_snapshot 分离；缺 sender → null/unknown；群实体不是成员；不得群名/昵称/群号填充（PASS 语义）。
- **PARTIAL**：
  1. 多跳/嵌套转发的字段模型仍只有单值 `forwarder_id`/`original_author_id`；没有 `forward_chain[]` 或每节点 sender_id/原作者；
  2. 引用消息的作者没有 `quote_author_id`/`quote_message_id`；
  3. notice 的 actor/operator/target 未列入 Envelope；群撤回/禁言/拍一拍可能 actor≠operator；
  4. P0-2 没有可执行的 positive/negative 测试矩阵；
  5. `group-turn`/`transcript` 必须写 `external_speaker_id` 的字段级断言未明确。

**当前实现：REJECT**

- `toMillis()` 缺失/非法 → `Date.now()`（`lib/parse.js:151-155,175`）。
- `buildChannelMessage.source` 缺 `event_time/time_precision/received_at/platform_speaker_fact/external_speaker_id` 等（`lib/message.js:10-38`）。
- prompt 只显示 senderName（`lib/prompt.js:75-84`）；group bucket 只存 `{speaker,text,at}`（`lib/group-buckets.js:31-35`）；group-turn 只传 speaker（`lib/group-turn-memory.js:92-126`）；transcript 只传 speakerName（Memory `lib/service.js:550-575`）；缺 sender 退化群名（`lib/index.js:547,566`；探针）。
- forward 结构有 senderId 但 `formatForward` 只显示名字（`lib/forward.js:60-100,180-195`）；quote 有 senderId 但 `formatQuote` 只显示名字（`lib/quote.js:48-52,100-130`）；notice 把 QQ 号当 senderName，operator 未传（`lib/index.js:398-447`、`lib/notice.js:78-135`）。

---

## 5. Memory 写入边界

**合同文本：PASS（责任）/ PARTIAL（受控接口命名）**

- §5.1/§5.5/§5.6 明确 Bridge 只提供平台事实；Memory 唯一写 canonical speaker/experiencer/evidence/validity；Bridge 不得决定 `valid_from_kind`/`verification_status`/`confidence_level`。
- §5.6 明确 message/turn/transcript/digest/handover 进入 Memory 必须通过 Memory 受控 ingestion，Bridge 不得绕过/直接写 Memory 表。
- §5.6 明确 turn/transcript/digest/handover 最小逻辑字段；物理/TTL OPEN。
- **PARTIAL**：
  1. “Memory 受控 ingestion/interface”仍未命名，现有 `dyMemory.saveGroupTurn`/`saveGroupTranscript` 是否属于受控接口未定义；如果是，需规定字段；如果不是，Bridge 直接调用即违规。
  2. R4 §7.1 新默认要求新记录 `confidence_level='unknown'` + numeric `confidence=NULL`；当前 `saveGroupTurn` 在 Memory 侧写 `confidence=0.6`（Memory `lib/service.js:641-653`），`publicBrief` 写 `confidence=1`（`lib/service.js:523`），与 R4 冲突。Bridge 不传 confidence，但端到端新记录仍违反 R4，属 Memory P0-5 实现问题。
  3. `saveGroupTranscript` 共享 `GROUP_CWD`、无 groupId/speakerId/source，当前直接调用；`handover` 当前不写 Memory，但跨会话注入 home。
- **结论**：合同责任 PASS；受控接口命名/实现字段 PARTIAL；当前实现 REJECT。

**当前实现**

- `group-turn-memory.js:122` 直接调 `mem.saveGroupTurn({groupId,groupName,incoming:[{speaker,text}],reply,at})`。
- `group-digest.js:88` 直接调 `mem.saveGroupTranscript({groupId,groupName,at,messageId,header(synthetic),messages:[{speaker,text,at}]})`。
- 缺 conversation_id、external_speaker_id、Bridge source_id、event_time/time_precision、received_at、missing_fields；`handover` 按 channel 全量。
- 562/562 不覆盖。

---

## 6. 负向验收

### P0-1：**PASS（覆盖）/ 当前 REJECT**

R4 P0-1 包含：

- 私聊 A/B、私聊/群、群 A/B、owner home/unified、新 session 按 conversation_id、缺 ID fail closed、长期记忆授权、摘要≠原文；
- legacy_unmapped 不进新 current；新旧同群/同私聊；
- Memory legacy/unknown 不进 current；Bridge context/group fallback/digest/handover 不消费其他 conversation/历史；
- `publicBrief`/`handoffBrief` 分别放 legacy/unknown/history/跨 Conversation/无授权 Owner todo/decision fixture，current-summary 命中 0；
- 摘要缓存、handoff payload、下游 merge 在最终注入前拒绝；
- 缺时间 null/unknown；缺 sender null；旧 numeric confidence 不变；
- 合成数据/临时 DB。

**判断**：覆盖了本轮要求的摘要出口、legacy、unknown、history、跨 Conversation、Owner todo/decision、缺时间、缺 sender、cache/payload/merge。**PASS（合同覆盖）**。当前实现无对应测试/字段，**REJECT**。

### P0-2：**PARTIAL / 当前 REJECT**

已有语义：group_id/external_speaker_id、成员不被群实体替代、缺 sender unknown、display 只展示、forwarder/original author/actual speaker 分离、不默认 Owner/汐、群级事实不伪造个人归属。

**缺口**：

- 多跳/嵌套转发；
- quote 作者/当前 speaker；
- notice actor/operator/target；
- 正/负测试矩阵；
- `group-turn`/transcript 必须写 `external_speaker_id` 的字段级断言。

当前实现：

- prompt/buffer/group-turn/transcript 只留显示名；缺 sender 退化群名；forward/quote 只显示名字；notice operator 丢失；562/562 无端到端测试。**REJECT**。

---

## 7. 当前 Bridge 源码与 R4 差距

| R4 要求 | 当前 Bridge | 结论 |
|---|---|---|
| publicBrief/handoffBrief current-summary 过滤 | `publicBrief`/`handoffBrief` 直接注入，无 valid/legacy/scope/authorization 检查；Memory 侧也缺过滤 | **REJECT** |
| 摘要缓存/handoff payload/merge 入口过滤 | `handover` 有 cached；context/group fallback 直接取 channel/kind | **REJECT** |
| Conversation ID `conv:qq:<account>:...` | `keyFor` 旧 key、无 account、剥字符、unknown | **REJECT** |
| Host/DSH mint session | Bridge `randomUUID`；Host `sessionController.createSession` 未接入 | **REJECT / BLOCKED-NOT_RUN** |
| event_time/time_precision/received_at | 无字段；toMillis `Date.now` | **REJECT** |
| platform_speaker_fact | 无字段；群只留显示名 | **NOT_IMPLEMENTED** |
| turn/transcript 字段 | 只传 names/shared cwd | **REJECT** |
| `saveGroupTurn` 不写 numeric confidence | Bridge 不传，但 Memory 写 0.6 | **REJECT（端到端）** |
| P0-1 tests | 无 | **REJECT** |
| P0-2 tests | 无；多跳/quote/notice 缺口 | **REJECT** |

---

## 8. 建议修改（PROPOSAL，不是批准）

1. §5.6/§7.5.1 补 `publicBrief` 的跨 Conversation 公开授权载体：Owner 明确授权/配置、仅 public scope、无原文、可审计；未授权 fail closed。避免“public=默认授权”或“合法 public brief 全被禁止”两种误读。
2. §5.6 补 `handoffBrief` 的逻辑返回/输入字段：`source_conversation_ids[]`、`purpose`、`authorization_ref`、`validity/legacy` 标记；Owner todo/decision 缺来源/权限时 fail closed。
3. §5.2 增加 `quote_author_id`/`quote_message_id`、`forward_chain[]`（或每节点 sender/original author）、notice `actor_id/operator_id/target_id`；P0-2 增加对应测试。
4. §5.6 明确 `dyMemory.saveGroupTurn`/`saveGroupTranscript` 是否为受控接口；如果是，补字段；如果不是，标 legacy 并禁止直接调用。
5. §7.1 与 Memory 实现：`saveGroupTurn`/`publicBrief` 固定 `confidence=0.6/1.0` 与 R4 新默认冲突，需 Memory P0-5 修复；Bridge 不传 confidence 这一事实应记录为“非 Bridge 越权，但端到端 BLOCKED”。
6. §3.1 明确 account_id 的接收账号语义/格式/来源；§3.3/§3.4 明确 legacy_unmapped 物理表示/唯一 active 约束；Host mint 保持 BLOCKED 验证。
7. 保留物理字段/TTL OPEN；不要在本轮冻结。

---

## 9. 未执行/未验证（NOT_RUN）

- 真实 QQ/NapCat 的 event_time 缺失/非法分布、sender/forward/quote/notice 字段；
- Memory `publicBrief`/`handoffBrief` 对 legacy/unknown/authorization 的实际过滤（本轮只读代码；未运行探针）；
- Host `sessionController.createSession` 在 Bridge 插件上下文可用性；
- Memory/Persona 全量测试、P0-1/P0-2 端到端、生产 DB、迁移、Owner 关联、v6/v3/EI-2A；
- 真实发送/渠道操作；
- 未修改合同/源码/测试/Schema/DB/配置；未执行迁移/回填/部署/运行期写入。

---

## 10. 结论与 Owner 审阅建议

| 项 | 结论 |
|---|---|
| 摘要出口 current/history 隔离 | **PASS（核心）/ PARTIAL（publicBrief 跨 Conversation 授权载体）**；当前 **REJECT** |
| Conversation 隔离 | **PARTIAL（§3 未改）**；当前 **REJECT**；Host mint **BLOCKED/NOT_RUN** |
| 消息来源/时间 | **PASS（合同 time/platform_speaker_fact）/ PARTIAL（群多跳/quote/notice）**；当前 **REJECT** |
| Memory 写入边界 | **PASS（责任）/ PARTIAL（受控接口命名/confidence 默认）**；当前 **REJECT** |
| P0-1 | **PASS（覆盖）**；当前 **REJECT（无测试）** |
| P0-2 | **PARTIAL**；当前 **REJECT** |
| R4 合同 | **CANDIDATE / NOT FROZEN** |
| 本报告 | **READY_FOR_REVIEW** |

**是否建议 R4 进入下一轮 Owner 审阅？** **建议：是，但仅作为候选审阅，不建议冻结或实施。** 前提/待补：

1. 补 `publicBrief` 跨 Conversation 公开授权载体，避免合法 public brief 与“public=默认授权”两种误读。
2. 补 `handoffBrief` 的 source/purpose/authorization 逻辑字段；P0-1 已要求测试，但合同还需可执行的载荷。
3. P0-2 补多跳转发/quote/notice 测试矩阵。
4. 明确 `saveGroupTurn`/`saveGroupTranscript` 是否受控接口，以及 R4 §7.1 与 Memory 固定 0.6/1.0 的冲突处理（Memory P0-5）。
5. 保留 §3 account_id/legacy 物理表示/Host mint 的 OPEN/BLOCKED 状态，不把未验证写成 PASS。

**当前 Bridge 实现仍不能作为 R4 落地基线；本报告不冻结合同、不标记整体 PASS。**
