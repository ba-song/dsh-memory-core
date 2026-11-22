# Channel Bridge · v1.2.0 R4.1 修订建议（只读）

- 任务：CHANNEL-BRIDGE-V1.2.0-R4.1-AMENDMENT-REVIEW
- 角色：Channel Bridge 渠道接入与会话桥接专项负责人
- 性质：只读合同修订建议；不修改 R4 合同、源码、测试、Schema、DB、生产配置；不执行迁移/回填/部署；不连接真实 QQ/NapCat；不发送消息；不修改 Conversation ID/Runtime Session；不批准 public sharing/Host 接入/生产操作。
- R4 合同：`ba-song/dsh-memory-core` 分支 `docs/memory-persona-contract-v1.2.0-r4-owner-review` @ `cf20a50f0bfca8b9182a9e699e223b2359c00319`
- R4 文件：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-R4-CANDIDATE.md`
- R4 tree：`9c363e80982814924714c2cc8f2d152a08d70f30`
- R4 blob：`1893aed22a13275d7a81250637c1c10b8e6b7caa`（868 行）
- Bridge 代码：`ba-song/dsh-channel-bridge` main @ `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13`，tree `b0ed3ff989905be4b16d3a1579d16695f772389c`
- Bridge 测试：`npm test` @ `bffcabc`：562/562 pass / 0 fail / 0 skip / exit 0（fake transport）
- 状态：READY_FOR_REVIEW

---

## 0. 结论摘要

R4 已经比 R3 明显收紧：明确 `publicBrief`/`handoffBrief` 是 current-summary API，禁止 legacy/unknown/history 经摘要缓存、handoff payload、下游 merge 旁路，P0-1 也增加了对应 fixture。但 R4.1 仍需补以下 **REQUIRED** 条款，才能让 Bridge 侧边界“可执行”：

| # | 修订项 | 标记 | 原因 |
|---|---|---|---|
| 1 | `publicBrief` 跨 Conversation 授权 | **REQUIRED** | R4 禁止绕过但未定义“home→群 public brief”的合法授权载体；public scope 本身不能等于 Owner 授权 |
| 2 | `handoffBrief` 逻辑载荷 | **REQUIRED** | R4 要求来源/用途/授权，但没有可执行输入/输出字段；Owner todo/decision 仍可能无来源注入 |
| 3 | 群聊多跳转发/quote/notice + P0-2 测试 | **REQUIRED** | R4 Envelope 只有单值 forwarder/original；无 quote author、notice actor/operator、多跳链和测试矩阵 |
| 4 | Memory 受控 ingestion 接口 | **REQUIRED** | `saveGroupTurn`/`saveGroupTranscript` 是否受控未命名；当前直接调用且字段不足 |
| 5 | Conversation/Runtime Session 语义 | **REQUIRED**（逻辑）/ **OPEN**（物理） | account_id 仍只说“机器人/登录账号”，未写“接收消息机器人账号”及格式/来源；legacy 物理/唯一约束未定 |
| 6 | current-context 出口与缓存清单 | **REQUIRED**（清单）/ **OPEN**（语义） | R4 未点名 `buildDigest`/`stable`/`carryover`/`shorttermRecent`；Bridge 缓存/handoff payload/fallback 仍有旁路 |

**总体建议**：R4.1 应纳入上述 1–3、4、5（逻辑）、6（清单）修订；R4 可作为候选继续审阅，但不得在 R4.1 前冻结或实施。

---

## 1. 审查范围与源码基线

### 1.1 合同章节

- §5.6（397–416）：Bridge/Memory 边界、current-summary API、publicBrief/handoffBrief；
- §7.5.1（554–574）：legacy/current/history、current-summary/cache/merge；
- §9 P0-1（643–669）：跨会话/摘要/legacy/缺时间/缺 sender；
- §9 P0-2（670–683）：群发言者；
- §3（217–279）：Conversation ID/Runtime Session/legacy；
- §5.2（340–365）：Envelope 字段；
- §5.3/§5.4（366–384）：speaker 语义/群规则。

### 1.2 Bridge/Memory 源码

- Bridge：`lib/public-brief.js`、`lib/sessions.js`（`fetchBrief`）、`lib/context.js`、`lib/index.js`（contextBuilder/getGroupContext）、`lib/handover.js`、`lib/group-digest.js`、`lib/group-turn-memory.js`、`lib/parse.js`、`lib/message.js`。
- Memory：`lib/service.js`（`publicBrief`、`handoffBrief`、`shorttermRecent`）、`lib/handoff/brief.js`、`lib/inject/digest.js`、`lib/inject/stable.js`、`lib/inject/carryover.js`。
- 说明：`buildDigest`/`stable`/`carryover`/`shorttermRecent` 是 Memory 注入/摘要路径，Bridge 当前只直接调用 `publicBrief`/`handoffBrief`；其余需要 Memory 专项确认语义（本轮标 OPEN/待协同）。

---

## 2. 修订项 1：`publicBrief` 跨 Conversation 授权

### 现状/合同定位

- R4 §5.6（409–412）明确 `publicBrief` 是 current-summary API，不得因名称/来源绕过；§7.5.1（566）明确 current-summary 必须做 Conversation 范围/用途权限过滤；P0-1（663）要求 publicBrief 放跨 Conversation/无授权 fixture。
- 但 R4 没有回答：`publicBrief` 本身是 **home→群的公开摘要**，天然跨 Conversation。它需要什么授权？是 Owner 配置、Home 的公开许可、还是 public scope 本身？
- 当前 Bridge `fetchPublicBrief`（`lib/public-brief.js:22-35`）直接调用 `dyMemory.publicBrief({limit})`，把文本拼 `[汐的近况]` 注入群 prompt（`lib/index.js:268-277`）；没有授权/来源/scope 元数据。
- 当前 Memory `publicBrief`（Memory `lib/service.js:529-548`）只查 `scope_type='public'` + TTL，无 valid/legacy/verification/authorization 过滤。

### 标记：**REQUIRED**

### 风险

1. 若把“public scope 存在”当公开许可 → 任何人/任何历史 public 记录都可进入群，R4 的 current/history 隔离被绕过；
2. 若一律禁止 publicBrief → 现有 home→群近况功能被误杀；
3. 无授权记录 → 无法审计谁允许哪条摘要跨 Conversation；
4. 无来源 Conversation → 无法判断摘要是否来自其他私聊/群；
5. 无 TTL/内容范围 → publicBrief 可能包含原文/旧数据。

### 建议条款（PROPOSAL 文本，写入 R4.1）

```text
§5.6 current-summary API / publicBrief 专条

publicBrief 是跨 Conversation 的公开摘要出口，不是默认授权。
跨 Conversation 分享必须同时满足：
1. Owner 明确授权或明确配置的 public-sharing 授权记录；
2. 仅限 scope_type='public' 且经过 current 有效性/验证状态过滤；
3. 摘要不得包含原始对话全文、昵称/群名/身份推断或未授权 Owner todo/decision；
4. 结果必须携带 source_conversation_ids[]、authorization_ref、generated_at、expires_at、audit_ref、content_scope；
5. 缺少授权、授权不明、来源不明、TTL 过期或 scope 不符时 fail closed（不注入、不缓存、不 merge）；
6. public scope 的存在本身不构成公开许可；不得以“已经在 public 表”作为授权依据。
```

### 验收用例

- PB-1：public 记录无授权记录 → publicBrief 空/错误，群 prompt 0 命中。
- PB-2：有授权、public scope、无原文 → 可注入；结果带 source/authorization/TTL。
- PB-3：public 记录为 legacy/unknown → 0 命中。
- PB-4：public 记录来自私聊/群原文引用 → 0 命中。
- PB-5：授权过期/撤销 → 0 命中。
- PB-6：缓存中已有旧 publicBrief → 缓存入口拒绝，而不是仅在最终 prompt 过滤。

---

## 3. 修订项 2：`handoffBrief` 逻辑载荷

### 现状/合同定位

- R4 §5.6（410–412）要求 Owner todo/decision 不能仅凭 Owner 归属跨 Conversation；必须有来源 Conversation、用途、授权依据；缺少时 fail closed。
- 但 R4 未给出 `handoffBrief` 的输入/输出逻辑字段；当前 Bridge `fetchBrief`（`lib/sessions.js:202-238`）调用 `dyMemory.handoffBrief({header,cwd,recent,kind,contactId,maxChars})`，没有 source conversation/purpose/authorization 参数。
- 当前 Memory `handoffBrief`（`lib/service.js:673-690`、`lib/handoff/brief.js:9-58`）对 owner 返回 `decisions`/`todos`，todos 查询 `memories kind='todo' AND status='active'`，无 valid/legacy/scope/authorization 过滤；Bridge 把结果用于轮换 seed。
- Owner todo/decision 的 Owner 归属不等于跨 Conversation 授权；当前实现没有来源 conversation/用途/授权字段，无法执行 R4 的 fail closed。

### 标记：**REQUIRED**（逻辑载荷）；字段名/存储 **PROPOSAL**；物理 **OPEN**

### 风险

- Owner todo/decision 被轮换 seed 带入任意会话；无来源、无用途、无授权；
- 旧/legacy todo 被注入 current；
- 摘要缓存/handoff payload 在 Bridge 侧形成旁路；
- 无法审计“哪个 Owner 决策被哪个会话使用”。

### 建议条款（PROPOSAL 文本）

```text
§5.6 handoffBrief 逻辑载荷

handoffBrief 的输入至少：
  source_conversation_ids[]、target_conversation_id、purpose（rotation/handoff/owner-summary）、
  authorization_ref（Owner 授权/配置）、requested_scope、max_chars、requested_at。

输出至少：
  text、source_conversation_ids[]、source_scope、contains_raw_text=false、
  validity_state、legacy/unknown flags、authorization_ref、generated_at、expires_at、audit_ref。

规则：
- Owner todo/decision 只有在 source_conversation_ids 包含其来源 Conversation、
  purpose 明确、authorization_ref 有效、validity_state=current 时才可返回；
- 缺少来源/用途/授权/有效性时 fail closed，返回空或明确错误；
- Bridge 不得把 handoffBrief 结果缓存成跨 Conversation 复用摘要；
- Bridge 的 handoff payload 必须携带上述元数据，并在注入前复核 target conversation。
```

### 验收用例

- HB-1：无 source_conversation_ids → 空/错误，0 注入。
- HB-2：无 purpose → 空/错误。
- HB-3：无 authorization_ref → 空/错误。
- HB-4：Owner todo 属于其他 Conversation 且未授权 → 0 命中。
- HB-5：legacy/unknown todo → 0 命中。
- HB-6：有授权且 current → 可注入，文本不含原文，元数据完整。
- HB-7：缓存 payload 缺少 source/authorization → 拒绝，不得只靠最终 prompt 过滤。

---

## 4. 修订项 3：消息来源模型与 P0-2

### 现状/合同定位

- R4 §5.2（340–365）已有 `external_speaker_id`、`forwarder_id`、`original_author_id`、`platform_speaker_fact`；§5.3/§5.4（366–384）语义清楚。
- R4 P0-2（670–683）语义覆盖：group_id/external_speaker_id、成员不被群实体替代、缺 sender unknown、display 只展示、forwarder/original/actual 分离、不默认 Owner/汐、群级事实不伪造个人归属。
- 但 R4 没有：
  1. 多跳/嵌套转发模型（`forwarder_id`/`original_author_id` 单值）；
  2. `quote_author_id`/`quote_message_id`；
  3. notice `actor_id`/`operator_id`/`target_id`；
  4. P0-2 可执行 positive/negative 测试矩阵；
  5. group-turn/transcript 必须写 `external_speaker_id` 的字段级断言。

### 标记：**REQUIRED**（多跳/quote/notice + 测试矩阵）；具体 `forward_chain[]` 结构 **PROPOSAL**；平台不可提供的原作者 **OPEN/unknown**

### 建议条款（PROPOSAL 文本）

```text
§5.2 Envelope 增加：
- forward_chain[]：每跳 {hop, sender_external_id, forwarder_id, original_author_id,
  message_id, event_time, source}；至少保留当前层 forwarder 与最外层 original author；
- quote_author_id / quote_message_id：引用消息作者与当前 speaker 分开；
- notice actor_id / operator_id / target_id：群撤回/禁言/拍一拍分别保留；
- 任一 ID 缺失为 null/unknown，不得用昵称/群名/群实体/转发者替代。

§9 P0-2 增加测试：
T-A1 群 A 成员甲发言 → external_speaker_id=甲、group_id=A，群实体不进 speaker；
T-A2 缺 user_id → external_speaker_id=null、speaker/experiencer unknown，0 群名/昵称；
T-A3 同名不同 ID → 不合并；
T-A4 群 A/B 同成员 → 仍按 conversation 隔离；
T-A5 多跳转发 → forward_chain 每跳 ID 可追溯，当前 speaker ≠ forwarder ≠ original author；
T-A6 quote → quote_author_id 与当前 speaker 分开；
T-A7 notice → actor/operator/target 分开，缺失 unknown；
T-A8 群实体只出现在 group/scope，不出现在 speaker_id。
```

### 风险

- 单值 forwarder/original 无法表达多跳；可能把中间转发者当原作者；
- quote 作者被当当前 speaker；
- notice 的 actor/operator 混淆；
- 无测试矩阵 → P0-2 只在文本上 PASS，无法验收。

---

## 5. 修订项 4：Memory 受控 ingestion 接口

### 现状/合同定位

- R4 §5.6（397–416）要求 message/turn/transcript/digest/handover 进 Memory 必须通过 Memory 受控 ingestion；Bridge 不得绕过/直接写 Memory 表/决定 speaker/experiencer/evidence/validity。
- 但 R4 没有命名 `dyMemory.saveGroupTurn`/`saveGroupTranscript` 是否属于受控接口。
- 当前 Bridge 直接调用：
  - `lib/group-turn-memory.js:122` → `saveGroupTurn({groupId,groupName,incoming:[{speaker,text}],reply,at})`；
  - `lib/group-digest.js:88` → `saveGroupTranscript({groupId,groupName,at,messageId,header(synthetic),messages:[{speaker,text,at}]})`。
- 两者都只传显示名/共享 `GROUP_CWD`，缺 conversation_id、external_speaker_id、Bridge source_id、event_time/time_precision、received_at、missing_fields。
- Memory `saveGroupTurn` 还写 `confidence=0.6`（Memory `lib/service.js:641-653`），`publicBrief` 写 `confidence=1`（Memory `lib/service.js:523`），与 R4 §7.1 新默认 `confidence_level='unknown'`/numeric NULL 冲突；Bridge 不传 confidence，但端到端仍违反。

### 标记：**REQUIRED**（接口定性/字段）；物理接口 **OPEN**；当前实现 **REJECT**

### 建议条款（PROPOSAL 文本）

```text
§5.6 Memory ingestion 接口

现有 dyMemory.saveGroupTurn / saveGroupTranscript 在 R4.1 中标记为
“legacy/unapproved”，除非 Memory 正式将其定义为受控 ingestion API。

若保留为受控 API，必须：
- 接收 conversation_id、group_id（适用时）、external_speaker_id/null、
  Bridge source_id、event_time/time_precision、received_at、missing_fields；
- 不接收/不写入未经批准的 numeric confidence/verification/validity；
- 返回结构化结果与错误类别，便于 Bridge 审计；
- 群 transcript 不得使用共享 GROUP_CWD；必须按 conversation/group 分区。

若不保留为受控 API：Bridge 只能提交标准 Envelope，由 Memory 决定是否写；
Bridge 不得直接调用 saveGroupTurn/saveGroupTranscript，也不得写 Memory 表。
```

### 验收用例

- MI-1：Bridge 调用受控 API，缺 conversation_id → 拒绝，0 写入。
- MI-2：缺 external_speaker_id → 写入 null/unknown，不用群名。
- MI-3：event_time 缺失 → null/time_precision unknown，不得用 received_at/Date.now。
- MI-4：Bridge 传 confidence → 拒绝（受控 API 不接受）。
- MI-5：Memory 新记录默认 confidence_level unknown/NULL；旧 numeric 原值保留。
- MI-6：Bridge 直接调用 legacy 接口 → 审计并拒绝（若 R4.1 标 legacy）。

---

## 6. 修订项 5：Conversation / Runtime Session

### 现状/合同定位

- R4 §3.1（217–239）：格式、account_id 必填、peer/group、禁有损归一化、缺字段 fail closed、旧 key legacy_unmapped；方向正确。
- R4 §3.2（240–247）：Host/DSH 权威 mint；Bridge 不得自建；Host 不可用则 BLOCKED；方向正确。
- R4 §3.3/§3.4（248–279）：逻辑字段、唯一 active、legacy 只读；方向正确。
- **PARTIAL/REQUIRED**：
  1. `account_id` 只写“用于区分不同机器人/登录账号”，没有明确“接收消息的机器人账号”及格式/可信来源（`self_id`/`get_login_info`）；需写死。
  2. `legacy_unmapped` 的物理 status/version/查询规则未定；旧 key 旧行如何读取/排除需要逻辑状态。
  3. 同一 Conversation 冲突 active session 的唯一约束/轮换历史未定。
  4. Host mint API 插件上下文可用性未验证；R4 已标 BLOCKED/NOT_RUN，R4.1 应保持，不得写成 PASS。
  5. 当前 Bridge `keyFor` 旧 key、无 account、剥字符、unknown；`session_id` 由 Bridge `randomUUID`（`lib/sessions.js:259,287,451,481`）；未调用 Host `sessionController.createSession`。

### 标记：**REQUIRED**（account_id 语义/legacy 逻辑/唯一约束文本）；物理字段 **OPEN**；Host 集成 **NOT_RUN**

### 建议条款（PROPOSAL 文本）

```text
§3.1 明确：
account_id = 接收该消息的机器人/登录账号 ID（不是 peer、不是 Owner 账号），
来源为 Host/DSH 登录上下文或 get_login_info；格式为稳定平台账号字符串。
缺失/为空/不可信 → fail closed，不生成 conversation_id。

§3.3/§3.4 明确：
legacy_unmapped 为逻辑状态，旧 key 只读、不参与 current context/摘要/merge；
不得用“最近同 kind”推断；旧行读取必须带 status/audit；
同一 conversation 同一有效版本只能有一个 active runtime_session；
Host/DSH mint 未接入时新会话创建 BLOCKED，不得回退 Bridge randomUUID。
```

### 验收用例

- CV-1：account_id 缺失 → 拒绝，不生成 conv/unknown。
- CV-2：同一群不同 account_id → 不同 conversation。
- CV-3：旧 group/private 行 → legacy_unmapped，不进入新上下文。
- CV-4：同一 conversation 两个 active session → 冲突拒绝，不覆盖历史。
- CV-5：Host mint 不可用 → 新会话 BLOCKED，不出现 Bridge UUID。

---

## 7. 修订项 6：current-context 出口与缓存

### 现状/合同定位

- R4 §5.6（409–412）点名 publicBrief/handoffBrief 为 current-summary，禁止摘要缓存/handoff payload/下游 merge 旁路；§7.5.1（566）重申。
- 但 R4 未点名 `buildDigest`、`stable`、`carryover`、`shorttermRecent` 等 Memory 出口；Bridge 当前不直接调用它们，但它们是 Memory 当前上下文生成路径，可能绕过同一 current/history 过滤。
- 当前代码证据：
  - Memory `buildDigest` 读取全库 raw（home+QQ+群+email）并按房间聚合（`lib/inject/digest.js:5-21`）→ 跨 Conversation 摘要；
  - `stable` 有 owner/group 过滤，但 group 记忆查询 `status='active' AND scope_type='group'` 无 valid/legacy 过滤（`lib/inject/stable.js:200-216`）；
  - `carryover` 按 cwd 取 raw（`lib/inject/carryover.js:6-24`），无 validity/legacy；
  - `shorttermRecent` 按 scope 过滤（`lib/service.js:700-716`），无 legacy/validity（shortterm 表本身可能无 legacy）。
- Bridge 侧缓存/旁路：
  - `handover` 有 `cached`（`lib/handover.js:160-196`），按 channel 全量生成；
  - `buildSessionContext` 无缓存但按 channel；
  - `getGroupContext` fallback 按 kind；
  - `handoffBrief` 结果进入 rotation seed；
  - `publicBrief` 结果进入 group prompt。

### 标记：**REQUIRED**（清单/入口过滤）；`buildDigest/stable/carryover/shorttermRecent` 语义 **OPEN**（需 Memory 专项确认）；Bridge 缓存/handoff payload/fallback **REQUIRED**

### 建议条款（PROPOSAL 文本）

```text
§5.6/§7.5.1 current-context 出口清单：
publicBrief、handoffBrief、buildDigest、stable、carryover、shorttermRecent，
以及任何后续等价出口，全部纳入 current-summary/current-context 过滤矩阵。
每个出口必须声明：
- 来源 conversation/scope；
- 用途/授权；
- validity/legacy/unknown 状态；
- 是否含原文；
- 缓存/payload/merge 入口过滤点。
未声明语义/未验证的出口标 OPEN，不得凭名称猜测。
Bridge 缓存、handoff payload、fallback、group context 必须复用同一过滤，
不得只在最终 prompt 过滤。
```

### 验收用例

- CC-1：buildDigest 混合 home+私聊+群+email → 未授权内容 0；仅当前/授权摘要。
- CC-2：stable group 查询含 legacy/unknown → 0 current。
- CC-3：carryover 读取旧 cwd raw → legacy/unknown 0（或显式 history 通道）。
- CC-4：shorttermRecent scope 过滤后，不得含其他 conversation；语义 OPEN。
- CC-5：Bridge handover 缓存含其他 conversation → 缓存入口拒绝。
- CC-6：handoffBrief/publicBrief payload 元数据缺失 → 拒绝注入。

---

## 8. 修订标记汇总

| 修订项 | 标记 | 说明 |
|---|---|---|
| publicBrief 跨 Conversation 授权 | **REQUIRED** | 必须补 Owner 授权/配置、public scope、用途、TTL、审计；public 本身不等于授权 |
| handoffBrief 逻辑载荷 | **REQUIRED** | 必须补 source_conversation_ids/purpose/authorization/validity；Owner todo/decision 不能自动跨会话 |
| 多跳转发/quote/notice + P0-2 测试 | **REQUIRED** | 需 `forward_chain[]` 或等效、quote_author_id、actor/operator/target、T-A1～T-A8 |
| Memory 受控 ingestion | **REQUIRED** | 必须定性 saveGroupTurn/saveGroupTranscript；字段不足/legacy 需标 |
| Conversation account_id/legacy/唯一 active | **REQUIRED**（逻辑）/ **OPEN**（物理） | account_id 接收账号语义/格式/来源；legacy 状态；唯一约束 |
| Host/DSH mint | **REQUIRED**（合同保持）/ **NOT_RUN**（集成） | 不得 Bridge randomUUID；Host API 未验证 |
| current-context 出口清单 | **REQUIRED**（清单）/ **OPEN**（buildDigest/stable/carryover/shorttermRecent 语义） | 必须与 Memory 协同；不得凭名称猜测 |
| publicBrief/handoffBrief 由 Bridge 单独过滤即可 | **NOT_SUPPORTED** | Bridge 没有 Memory 内部 validity/scope 元数据；必须 Memory 过滤 + Bridge 元数据校验 |
| 物理字段名/TTL/存储 | **OPEN** | 不得本轮定案 |

---

## 9. 未执行 / NOT_RUN

- 真实 QQ/NapCat 的 publicBrief/handoffBrief 返回内容与授权；
- Memory `buildDigest`/`stable`/`carryover`/`shorttermRecent` 的 current/history 过滤（只读代码；未运行探针）；
- Host/DSH `sessionController.createSession` 在 Bridge 插件上下文可用性；
- Memory/Persona 全量测试、P0-1/P0-2 端到端、生产 DB、迁移、Owner 关联、v6/v3/EI-2A；
- 真实发送/渠道操作；
- 未修改合同/源码/测试/Schema/DB/配置；未执行迁移/回填/部署/运行期写入。

---

## 10. 结论

**R4.1 建议纳入**：publicBrief 跨 Conversation 授权、handoffBrief 逻辑载荷、多跳转发/quote/notice + P0-2 测试、Memory 受控 ingestion 定性、Conversation account_id/legacy/唯一 active、current-context 出口清单。

**不建议**在 R4.1 前冻结合同或实施；R4 可作为候选继续 Owner 审阅，但上述 **REQUIRED** 项未补齐前，Bridge 侧边界仍不可执行。当前 Bridge 实现仍 REJECT/PARTIAL；host mint 未验证为 NOT_RUN。
