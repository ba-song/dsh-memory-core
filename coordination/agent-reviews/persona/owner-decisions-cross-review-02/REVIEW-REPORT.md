# Persona 专项交叉审查报告 · Owner Decisions 落地与三方接口复核 02

> 任务：`OWNER-DECISIONS-INTERFACE-CROSS-REVIEW-02`
> 角色：Persona / EI 专项负责人
> 性质：只读架构审查、跨模块交叉复核、接口方案协调
> 时间：2026-11-22 15:45 (Asia/Shanghai)
> 状态：**READY_FOR_REVIEW**（Persona 报告）；**联合接口：BLOCKED**；契约 **不可冻结**
> 结论：七项 Owner Decisions 原则接受；六项接口分歧中，A/B/C 需要 MODIFY，D 当前实现 REJECT，E 为 VERSION_MISMATCH，F 需 MODIFY。Persona v3 / Memory v6 / EI-2A 均 **NOT_STARTED**。

---

## 0. 阅读导航

- §1 基线与阅读材料
- §2 七项 Owner Decisions 落实情况
- §3 六项接口分歧逐项裁决（A–F）
- §4 其他未决技术事项（12 项）
- §5 RACI 最终建议
- §6 P0 隔离验收矩阵
- §7 与 Channel Bridge / Memory 报告的具体回应
- §8 仍待所有者决定
- §9 测试与证据
- §10 NOT RUN
- §11 状态与边界

---

## 1. 基线与阅读材料

### 1.1 仓库/分支/HEAD/tree

| 对象 | 值 |
|---|---|
| 契约 | `docs/memory-persona-contract-v1.1.1-owner-decisions` @ `006bb5bfce5d031b49a60271fe0406b228b43e00`；tree `b460823bad5ce250d3360db8e59871a024335e6f`；blob `10a62b64dff6219d00a1e25be09a39ddccb50e1a` |
| Channel Bridge 报告 | `coordination/agent-reviews/channel-bridge/interface-arbitration-01/REVIEW-REPORT.md` @ `5192f146bdace0bc0279da06f5cff3de6a1750fe`；tree `e639f695b251ce8a457c0a4f1bcb5aa20f8cd79c` |
| Persona 报告 | `coordination/agent-reviews/persona/interface-arbitration-01/REVIEW-REPORT.md` @ `3e9836334f07a78abc8522afbca8de2870d9feaf`；blob `6231f4f66d01daea0d3a98fa69c4570e295eb3c0` |
| Memory 报告 | `coordination/agent-reviews/memory/interface-arbitration-01/REVIEW-REPORT.md` @ `6136b8e0b5dbb342d1387a0df724b4bbb8339c94`；tree `6ad7d5d676fab3f4378f04d4d2caf4d52ce4f5a0`；blob `6796e2271e06f662ffbfd41ea24f188dfee1dff6` |
| Memory 联合提案 | `coordination/contracts/DSHA-MEMORY-PERSONA-CHANNEL-INTERFACE-PROPOSAL-01-DRAFT.md` @ `6136b8e...`；blob `2100ad3154b9e87064dabdc885cb3f19f95cc862` |
| Memory R2 | `coordination/agent-reviews/memory/contract-v1.1.1/REVIEW-REPORT-R2.md` @ `26fbd08e9ff413cf403c3899c2880658e73d4e87`；tree `19a2d398273de29ef5f2f734b540a320bd5bd1cd` |
| Memory M1 | `7548e49ed0b8d8673818464325d8e72ec7704b27`；tree `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f` |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| Persona fix | `8ccb8a922a789d8d15157b9d99f9de0c20c8807b`（历史对照，不作为 main） |
| Channel Bridge main | `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13`；tree `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| Persona 审查 worktree | `/tmp/ei-main-a84c7ba`，HEAD `a84c7ba`，clean |
| Channel Bridge 审查 worktree | `/tmp/channel-bridge`，HEAD `bffcabc` |

### 1.2 已读材料

- 契约 v1.1.1-draft 全文（323 行）。
- Channel Bridge 报告全文（539 行），含 §3 事实、§4 标准输出、§5 RACI、§8 P0、§9 对 Persona 问题。
- Persona 报告全文（494 行），含 selfId/identityOf/binding/session_bindings/timeline/RACI。
- Memory 报告全文（261 行），含 §3 字段、§4 evidence、§5 三维、§6 validity、§8 接口/RACI。
- Memory 联合提案 v0.1（169 行）。
- Memory R2（223 行），§47 矩阵、会话层、P0。
- Persona main 源码：`lib/service.js`、`lib/self.js`、`lib/bindings.js`、`lib/inject.js`、`lib/db.js`、`lib/emotion.js`、`lib/scope.js`。
- Channel Bridge 源码：`lib/parse.js`、`lib/sessions.js`、`lib/store.js`、`lib/context.js`、`lib/group-turn-memory.js`、`lib/group-digest.js`、`lib/unified.js`。
- Memory 源码：`lib/ingest/archive.js`、`lib/selfid.js`、`lib/service.js`、`lib/ingest/digest.js`（按报告证据）。

### 1.3 结论标签约定

本报告使用 `ACCEPT / REJECT / MODIFY / PENDING_EVIDENCE / OWNER_DECISION_FIXED`；任务状态使用 `READY_FOR_REVIEW / BLOCKED / NOT_STARTED`。`PROPOSAL` 不等于批准。

---

## 2. 七项 Owner Decisions 落实情况

| 决策 | 原则状态 | 当前实现/落地 | 结论 |
|---|---|---|---|
| D1 Owner ID 独立永久 | **OWNER_DECISION_FIXED** | 无 owner canonical ID；Persona 无 owner 接口；Memory 用 `person:owner` 占位；Channel 用 owner QQ 列表 | **PARTIAL / BLOCKED**：D1 原则接受；技术方案见 §4.1；D1 前 owner episode fail closed |
| D2 主人记忆区分陈述/观察/推断 | **OWNER_DECISION_FIXED** | Persona 只有 numeric confidence/certainty；无 evidence_source/verification/confidence_level；Memory 无三维 | **REJECT**：当前不能区分；需三维证据 + 禁止重复提升 |
| D3 跨平台疑似发现/不自动合并 | **OWNER_DECISION_FIXED** | 无 candidate link 表/授权记录；Channel 只按 owner QQ 配置；Persona 无跨平台映射 | **NOT_IMPLEMENTED**：需 candidate + 明确同意 + 审计；不得用昵称/头像 |
| D4 私聊/群聊独立会话 | **OWNER_DECISION_FIXED** | Channel 有 `group:<gid>`/`private:<qq>` 房间；Persona 有 runtime binding；Memory 无 conversation_id；存在跨会话上下文路径 | **PARTIAL / REJECT（P0-B）**：需 conversation_id + 精确过滤 |
| D5 旧记忆保护 | **OWNER_DECISION_FIXED** | Memory 旧行未删；无 cutover/legacy/unknown 标记；Persona 旧情绪行未删但无证据字段 | **PARTIAL**：方向接受；迁移/标记未实现 |
| D6 模块职责 | **OWNER_DECISION_FIXED** | 现状 Persona 写 session_bindings；Channel 有 conversation key；Memory 管 people/contacts/validity；边界冲突 | **MODIFY**：拆 conversation_binding 与 persona_self_binding；见 §3.B |
| D7 迁移先只读/证据/候选/审核 | **OWNER_DECISION_FIXED** | 无正式迁移；Memory 提案有候选/审计方向；Persona 无 v3 迁移 | **NOT_IMPLEMENTED**：本轮不授权迁移；方案见 §4.6/§4.12 |

**原则结论**：七项原则不重新讨论；当前实现均未达到可生产落地状态，需技术方案 + 所有者批准。

---

## 3. 六项接口分歧逐项裁决

### A. 平台发言者 ID 与内部人物 ID

**问题**：`external_speaker_id`、`speaker_id`、`group_id`、`experiencer_id` 混用。

**三方原始意见**：

- Channel：`speaker_id` 是平台 user id；canonical 映射由 Memory；群缺 sender 时 fallback 到群名（REJECT）。
- Memory：`speaker_id` 是发言者；`experiencer_*` 是经历主体；群消息 speaker 被群实体替代（REJECT）。
- Persona：Persona 只提供 self/owner 证据；不管理 third_party；当前无 speaker 字段。

**代码事实**：
- Channel `parseMessageEvent` 保留 `senderId`/`groupId`，但 `group-turn-memory`/`group-digest` 只用 `speakerName`；缺 sender 时 index fallback 到群名（Channel 报告 §3.2、§8.1）。
- Memory `archive.js:282-285` 群消息 speaker 用群实体 ID；`memories.speaker_id` 可写入。
- Persona `emotion_event` 只有 `actor/subject/target`，无外部 speaker/experiencer 字段。

**裁决**：**MODIFY（三方）**。字段必须改为：

| 字段 | 语义 | 产生 | 保存 | 备注 |
|---|---|---|---|---|
| `platform` | qq/email/... | Channel | Memory | 原始事实 |
| `account_id` | 机器人/登录账号 | Channel | Memory | 多账号隔离必需 |
| `external_speaker_id` | 平台 user id | Channel | Memory | 只作原始事实，不等于 canonical |
| `external_group_id` | 平台群 id | Channel | Memory | 群实体，不是成员 |
| `speaker_id` | 内部 canonical person ID | Memory people/contacts | Memory | 由 external ID 映射；不得用昵称 |
| `group_id` | 群实体/scope ID | Channel | Memory | `person:contact:qq:group:<gid>` 只表示群实体 |
| `experiencer_type/id` | 经历主体 | Persona（self/owner 证据）+ Memory（落库/third_party） | Memory | 不自动等于 speaker |

**具体回答**：

1. 原始平台 ID：**Channel Bridge**。
2. 平台 ID → 内部人物：**Memory people/contacts**；Channel 只提供 `external_speaker_id` + evidence；Persona 只验证 self/owner，不做第三方映射。
3. 身份关联证据：**Memory** 保存 `person_link_evidence`（候选/确认/授权），Channel 提供原始 sender 证据，Persona 提供 self/owner identity evidence。
4. 群聊区分：
   - 群实体：`external_group_id` / `group_id`；
   - 实际发言者：`external_speaker_id` → `speaker_id`；
   - 转发者：`forwarder_speaker_id`（转发操作者）；
   - 原始作者：`original_author_id`（转发节点/引用作者）；
   - 缺一项 → 对应字段 unknown，不互相替代。
5. 发言者缺失：`external_speaker_id=null`、`speaker_id=''`、`speaker_type=unknown`；可保存 group episode 但不得归 owner/self/群实体；**不得 fallback 到群名/群号**。
6. 防昵称：只接受平台数值/稳定 ID；昵称/群名片/群名只进 display 字段；canonical 映射必须查 people/contacts，不能用字符串推断。
7. D3 流程：Channel 发现疑似 owner 账号 → 只写 `owner_link_candidate(status='unconfirmed')` + 证据 → 询问 owner → 明确同意（文本/操作记录 + 时间 + 确认方式）→ 才建立 `owner_platform_account` 关联；无回复/模糊 → 保持 unconfirmed；不得自动合并。

**风险**：当前群消息把群实体当 speaker，P0-A；`speaker_id`/`experiencer_id` 若不拆分，Memory 会写错归属。

**Owner**：D3 原则已定；技术表/流程由 GPT 整合。

---

### B. session_bindings 唯一写入责任

**问题**：Persona 当前写，Persona 提案建议 Channel 写，Memory 提案列为待裁决，Channel 报告 RACI 又把写入给 Persona。

**三方原始意见**：

- Persona 报告：建议 Channel Bridge 唯一写，Persona 只读验证。
- Channel 报告 RACI：`session_bindings` 写入 R/A = Persona，唯一写入 Persona；Bridge 不写 Persona DB。
- Memory 报告：`session_bindings` 写入 **待裁决**（当前 Persona，契约方向 CB）。

**代码事实**：
- Persona `inject.writeBinding` 在 private cwd 命中时写 `session_bindings`（`lib/inject.js:86-99`），字段无 subject。
- Channel Bridge 没有写 Persona DB；只有 `channel_sessions`（conversation/session 映射）。
- Memory 不写 `session_bindings`。

**裁决**：**MODIFY（拆表）**，不接受任一“单表单写”方案。理由：三种关系被混在一张表：

1. `conversation_id ↔ runtime_session_id`（会话映射，Channel 事实）；
2. `runtime_session_id ↔ Persona self`（self/persona 绑定，Persona 事实）；
3. `runtime_session_id ↔ 当前消息主体`（owner/third_party 主体，Channel 原始事实 + Memory 身份证据）。

**推荐**：
- 表 1 `conversation_bindings`（Channel 唯一写）：`conversation_id`, `runtime_session_id`, `platform`, `account_id`, `chat_type`, `peer_id`, `group_id`, `subject_type`（raw hint）, `subject_id`（raw hint）, `updated_at`, `source`, `version`。
- 表 2 `persona_self_bindings`（Persona 唯一写）：`runtime_session_id`, `persona_id`（canonical self）, `verified_at`, `evidence_id`, `status`, `version`。
- 现有 `session_bindings` 作为 legacy/read-only，或迁移为视图；不双写。
- `identityOf(header)` 读取两表 + self 表，做交叉验证；冲突 → unknown。
- Persona 不再写 conversation/subject 事实；Channel 不写 Persona DB。
- 历史 binding 缺 subject → unknown；不推断 owner/third_party。
- 群聊：不写 persona_self_binding；`conversation_bindings` 写 group 实体；成员身份由 Memory 记录，不塞进 session binding。

**具体回答**：
1. 继续作为共享表？**否，建议拆两张**；共享表是冲突源。
2. 唯一写入者：conversation_binding = Channel；persona_self_binding = Persona。
3. Persona 只读？对 conversation/subject 只读；对 self binding 自己写。
4. Channel 有足够事实？对 conversation/platform/chat/speaker 事实足够；对 self 不足，不能写 Persona self。
5. self/persona 与聊天映射分开？**是**。
6. 拆两张？**是**。
7. 防双写：单写方 + 外键/版本 + 读时交叉校验；禁止同一字段两写。
8. 历史缺证据：unknown + legacy，不猜。

**风险**：拆表是 schema/迁移变更，需所有者批准；本轮不实施。

---

### C. conversation_id 与 runtime_session_id

**事实**：
- Channel 已有 `keyFor`：`group:<gid>`/`private:<qq>`（`lib/sessions.js:118-124`），存 `channel_sessions.kind`；runtime `session_id` 由 `randomUUID()` 生成并 resume。
- 未向下游输出标准 `conversation_id`；Memory 无 `conversation_id` 列；Persona 只读 `header.id`。
- 同一 QQ 群在不同机器人账号下当前 key 相同（无 account_id），存在多账号冲突。

**裁决**：**ACCEPT Channel 方向 + MODIFY 格式**。

推荐：

```
conversation_id = qq:<account_id>:private:<peer_id>
conversation_id = qq:<account_id>:group:<group_id>
```

- `account_id` **必须**纳入稳定身份；缺失 → 不生成新 conversation_id，`E_CONVERSATION_MAPPING_MISSING`，不建 unknown 房间。
- `platform`/`channel` 进入前缀；`chat_type` 显式。
- `runtime_session_id`：**Host/DSH 生成**；若 Host 不能提供，Bridge 生成 UUID 并登记为受信任来源（PENDING）；不能同时两方生成。
- 生成：Channel；持久化：Channel（conversation_bindings/channel_sessions）；验证：Channel 格式 + Memory 非空；Persona 不生成。
- 旧 `group`/`private` 行：`legacy_unmapped`，不自动合并；新消息只写新格式。
- 同群不同机器人账号：不同 conversation（account 不同）。
- 缺 group/peer/account：fail-closed；不按昵称/群名/文本/随机数构造。

**具体回答**：1 是；2 是（Host/DSH）；3 是；4 是；5 是；6 legacy_unmapped；7 fail-closed；8 双读/迁移映射，不覆盖旧行。

**Owner**：格式/account 必填由所有者/GPT 批准；本报告只推荐。

---

### D. 跨会话与跨群隔离

**事实**：
- Channel `buildSessionContext` 只按 channel 查最近入站，探针私聊 A/B + 群 C 全部进入新会话（P0）。
- `getGroupContext` fallback 只按 kind=group，群 A+B 混合（P0/P1）。
- 群归档共享 `GROUP_CWD`，无 groupId/speakerId；按群查询依赖 `raw_text LIKE`（P0）。
- Memory `buildDigest` 合入 home + 全部 QQ 私聊 + 群 + email（P0）。
- Persona 只负责注入；无 conversation_id，无法独立隔离。

**裁决**：**REJECT 当前实现；ACCEPT 目标；P0**。修复归属：Channel 修上下文/归档；Memory 修 digest/检索；Persona 修注入前置校验（缺 conversation_id 不注入）。

**验收矩阵**（正向/负向，详见 §6）：

1. 私聊 A 不得进入 B。
2. 私聊不得自动进群。
3. 群 A 不得进群 B。
4. 群原文不得进 owner 私聊。
5. 新 runtime session 不得按 channel 取历史。
6. 群 fallback 必须精确 group_id。
7. 群归档按 group_id 可查。
8. 群成员保留 sender ID。
9. 缺 conversation_id 不得退化为全 channel。
10. Memory digest 不混无授权私聊/群/邮件。
11. 跨会话长期记忆需授权/主体/审计。
12. 摘要共享 ≠ 原文共享。

**结论**：P0 未闭合，不能冻结契约。

---

### E. raw_meta 中 self:unknown 的版本与证据差异

**审查对象**：Memory `7548e49`（schema v5）。

**事实**：
- fresh `raw_meta` DDL（`lib/ingest/archive.js:174-177`）**无 speaker_id**；ALTER 列表只补 raw_text/extra/cwd/person_id（`:182-185`），不补 speaker_id。
- 写入路径按列分支：有 `thread_id` 走全列；有 `speaker_id` 走阶段3；都没有则走基础列（`:470-486`）。fresh DB 走基础列，**不会**写 speaker_id/self:unknown。
- 旧/部分迁移 DB 有 `speaker_id` 时，self/self-thought 且 Persona 取不到 selfId → `speaker_id='self:unknown'` + `extra.pendingIdentity=true`（`:454-458`）。
- 测试 `tests/archive-speaker.test.mjs:71-76` 断言该路径；`tests/selfid.test.mjs:25-40` 先手动 ALTER speaker_id 再测。
- `memories` 的 `addEpisode` 另走 Persona `selfId`；当前 Persona 返回 `self:unknown` 时会被写入（Memory R2 实测）；这是正式 memories 的缺陷，不是 raw_meta DDL 证明。

**结论**：**VERSION_MISMATCH**。

- fresh DB：raw_meta `self:unknown` = **NOT_PRESENT**（无列，路径不执行）。
- 旧/部分迁移 DB：**CONFIRMED** 可持久化 `self:unknown`。
- 正式 `memories`：**CONFIRMED** 接受 Persona sentinel（需 Persona 返回 sentinel）。
- 生产数据污染：**NOT_CONFIRMED**（无生产库只读证据；不宣称）。
- 不能把“代码路径存在”写成“生产已污染”。

**修复建议**：fresh DDL 补 `speaker_id` + 迁移；raw 仅允许 `self:unknown` + pending，不进 memories；addEpisode 拒绝；回填显式失败；以同版本 DB 探针验证。

---

### F. 旧记忆兼容性

**裁决**：**MODIFY**（D5 原则接受，Memory 提案需细化）。

必须区分六种“未知”：

1. source unknown；
2. speaker identity unknown；
3. event time unknown；
4. fact unverified；
5. memory conflict；
6. retracted。

不能一个 `unknown` 全包。建议：

| 情形 | 回忆/参考 | 普通注入 | 重要决策 |
|---|---|---|---|
| 旧记录，原文完整、字段缺 | 允许，带“来源/身份/时间未知” | 默认不进入普通事实注入；可进 uncertain/管理视图 | 不得单独支撑 |
| 来源/身份/时间明确但未验证 | 允许 | 可作为参考，标注 unverified | 需额外证据 |
| 已验证 confirmed | 允许 | 可进入（按 scope） | 可支撑 |
| disputed | 允许保留双方 | 不进入普通注入 | 不得单独支撑 |
| retracted | 保留原文/审计 | 不进入 | 不得使用 |
| 同源重复 | 只算一个来源 | 不重复计权 | 不提升 |

- 原文保留；迁移只加元数据，不覆盖 `text`；候选补全写候选表，不直接改。
- 历史 `historical_record` 与新独立证据分开；重复副本 `duplicate_of`，不计数。
- 旧记忆缺字段不等于失效；已保存不等于客观真实。
- cutover 前旧行 `legacy/unknown`；cutover 后新行完整字段；具体时间/版本待所有者。
- Persona 旧情绪记录是派生/推断，不得当“主人亲口陈述”的 raw evidence；应标 `inference/historical_record`。

**风险**：若 validityState 把 `unknown` 一律排除，会误伤旧记忆；若一律放行，会把未知当事实。必须按用途分层，而非二元。

---

## 4. 其他未决技术事项

### 4.1 Owner ID 格式/首次绑定/验证/更换（PROPOSAL）

- Canonical：`owner:<uuid>`（内部永久 ID，不用 QQ/昵称/平台账号）。
- `person:owner` 只作 legacy 别名/显示，必须解析到 `owner:<uuid>`；不得作为稳定 ID 直接落库。
- 首次绑定：owner 明确授权 + 一次性 challenge（owner 在可信会话确认）+ 记录 `owner_identity(owner_id, created_at, source, evidence, confirmed_by, status)`。
- 平台账号：`owner_platform_account(owner_id, platform, account_id, evidence, confirmed_at, status)`；D3 未确认的账号不能进该表。
- 更换：新 owner ID 仅 explicit owner action + 审计；旧 ID 保留历史，不静默改。
- D1 前：owner episode fail closed/unknown；不生成 `person:owner` 稳定 ID。

### 4.2 主人身份关联授权记录

`owner_link_candidates(id, platform, external_account_id, evidence, status='unconfirmed', asked_at, responded_at, consent_text, consent_method, approved_by, approved_at, expires_at)`。无明确同意 → 不建关联；模糊/无回复 → unconfirmed；不得用昵称/头像/行为相似度自动确认。

### 4.3 role_only

仅展示/上下文，不是稳定 ID；不得写 `experiencer_id`/去重/Link/self 统计；owner episode D1 前拒绝或 unknown。`identityOf` 可返回 `owner/id_strength=role_only`，`self_writable=false`。

### 4.4 experiencer_evidence 产生/验证/保存

- Persona：对 self/owner 产生 identity evidence（`session_id`, `self_id`, `subject_type/id`, `source`, `issued_at`, `evidence_version`, `integrity`）。
- Channel：提供 message/conversation/speaker evidence（原始字段/哈希）。
- Memory：合成/校验/保存 `memory_evidence`（write-once，不进 PATCHABLE_COLUMNS）；校验 producer/格式/self canonical；冲突/撤回保留。
- Persona 不保存 Memory 的 memory evidence；Memory 不覆盖 Persona identity evidence；引用关系。

### 4.5 valid_from_kind / 旧记忆

接受 Memory 四态 `exact/implicit/legacy/unknown`；旧行 cutover 前 NULL→legacy（created_at 下限近似，标 approximated）；新行无 valid_from→implicit；非法→unknown/拒绝；不得把未知时间伪造 exact。Persona 侧 emotion episode 只有 `expires_at`，不参与 Memory valid_from_kind；如需历史情绪，另立字段。

### 4.6 cutover

待所有者；建议版本化 `contract_version/evidence_version/conversation_identity_version/session_binding_version/migration_version`；cutover 前旧行只标记不删除；迁移单事务、version-last、前后计数、回滚。不得自行写日期/版本。

### 4.7 selfId null 协议

`selfId() -> canonical self:<uuid> | null`；DB 不可用/缺失/多 active/非法/冲突 → null；不返回 `self:unknown`；不抛。`ensureSelf` 0 active 不自动创建；显式 enrollment；非法 seed→`E_PERSONA_IDENTITY_INVALID`；多 active→`E_SELF_CONFLICT`；服务不可用→`E_PERSONA_UNAVAILABLE`。Memory addEpisode 拒绝 null/sentinel/非法。

### 4.8 identityOf 输入/输出/错误

输入：`conversation_id`, `runtime_session_id`, `chat_type`, `platform`, `account_id`, `peer_id/group_id`；Persona self 表；conversation binding（CB）；persona self binding（Persona）。禁止把 `speaker_id`/`speaker_type` 当 self 证据；禁止 meta/display name/role/cwd/subject。

输出：`ok, valid, self_id, subject_type, subject_id, id_strength, source, issued_at, reason`。

错误：`E_PERSONA_UNAVAILABLE`, `E_PERSONA_IDENTITY_UNKNOWN`, `E_PERSONA_IDENTITY_INVALID`, `E_SESSION_BINDING_CONFLICT`, `E_BINDING_EXPIRED`, `E_PERSONA_HEADER_INVALID`；冲突 → unknown；unknown 不升级 self/owner。

### 4.9 bindingOf 校验

`bindingOf(sessionId)` 只返回原始 binding；作为 self 依据必须：`status=active`、`persona_id===selfId()`、`conversation_id` 匹配、`issued_at/verified_at` 未过期、evidence 有效。失败：self 写入 `E_SESSION_BINDING_CONFLICT`/`E_BINDING_EXPIRED`；只读 unknown。

### 4.10 timeline/事务

- timeline 写 `self_id`，不写 `session_key`；删除空 catch，错误可观察。
- `recordRuleEpisode` event/appraisal/episode 单事务；主链提交后再派生；失败整体回滚。
- 测试：成功 1/1/1；删除 episodes→0/0/0；timeline 1 行 self_id；identity change 审计。

### 4.11 重复证据

- source_id 唯一；同源副本 `duplicate_of`，occurrence 计数不升 confidence；独立 source 才 `corroborates`；冲突 `contradicts`；撤回保留。
- 旧 numeric confidence 不映射 high/medium；标 unknown/legacy。
- Persona 重复事件不提升；Memory merge 不得 `confidence+0.02`/`evidenceCount+1` 作为独立证据。

### 4.12 自主补全四阶段

只读扫描 → 证据检索 → 候选表 → 正式写入（需所有者授权）。本轮仅允许前三阶段设计；不得自动写 memories/身份/证据；候选必须带来源、旧值、新值、方法、置信、审计；正式写入单事务/回滚/不覆盖原文。

---

## 5. RACI 最终建议

> 唯一写入方见“写入”列；每行只有一个 A；`PENDING` 表示需所有者/GPT 批准。

| 事项 | R | A | C | I | 唯一写入 |
|---|---|---|---|---|---|
| conversation_id 生成 | Channel | Channel | Persona/Memory | Owner | Channel |
| runtime session_id 生成 | Host/DSH | Host/DSH | Channel/Persona | Memory | Host/DSH（Bridge 代生成需登记） |
| conversation↔session 映射 | Channel | Channel | Persona/Memory | Owner | Channel |
| external_speaker_id | Channel | Channel | Persona/Memory | Owner | Channel |
| canonical speaker_id | Memory | Memory | Channel/Persona | Owner | Memory |
| speaker 验证 | Memory | Memory | Channel/Persona | Owner | — |
| self ID 验证 | Persona | Persona | Memory | Channel | Persona |
| owner ID 验证 | Owner | Owner | Persona/Memory/Channel | GPT | Owner（D1） |
| third_party ID | Memory | Memory | Channel/Persona | Owner | Memory |
| experiencer 判断（self/owner） | Persona | Persona | Memory/Channel | Owner | Persona evidence |
| experiencer 落库/third_party | Memory | Memory | Persona/Channel | Owner | Memory |
| identity evidence（self/owner） | Persona | Persona | Memory | Channel | Persona |
| message evidence | Channel | Channel | Memory/Persona | Owner | Channel |
| memory evidence 保存 | Memory | Memory | Persona/Channel | Owner | Memory |
| conversation_bindings | Channel | Channel | Persona/Memory | Owner | Channel |
| persona_self_bindings | Persona | Persona | Memory/Channel | Owner | Persona |
| binding 验证 | Persona | Persona | Memory/Channel | Owner | — |
| digest（会话内） | Channel | Channel | Memory/Persona | Owner | Channel |
| 跨会话检索 | Memory | Memory | Persona/Channel | Owner | — |
| 跨会话注入 | Persona | Persona | Memory/Channel | Owner | — |
| validityState | Memory | Memory | Persona/Channel | Owner | Memory |
| 补全审计 | Memory | Memory | Owner/Persona/Channel | — | Memory |

**冲突解决**：不再让 `session_bindings` 单表双写；拆 `conversation_bindings`（Channel）与 `persona_self_bindings`（Persona）。这是对 Channel 报告（Persona 写 binding）和 Persona 报告（Channel 写 binding）的 **MODIFY**，需要所有者批准。

---

## 6. P0 隔离验收矩阵

| # | 用例 | 预期 | 责任 |
|---|---|---|---|
| 1 | 新私聊 A | 仅 A 历史；不含 B/群 | Channel/Persona |
| 2 | 新私聊 B | 仅 B；不含 A/群 | Channel/Persona |
| 3 | 私聊进群 | 不注入私聊原文 | Channel/Persona |
| 4 | 群 A 新会话 | 仅群 A；不含群 B/私聊 | Channel/Persona |
| 5 | 群 A @，群 B 同时消息 | 只拿 A；fallback 不跨群 | Channel |
| 6 | owner home | 仅 owner 授权摘要；不含其他私聊原文 | Persona/Memory |
| 7 | 缺 conversation_id | 不注入；`E_CONVERSATION_MAPPING_MISSING` | Persona |
| 8 | 缺 group_id | 群上下文空/unknown；不跨群 | Channel |
| 9 | 群成员缺 sender ID | `speaker_id=null`/unknown；不用群名/群号 | Channel/Memory |
| 10 | 群归档按 group_id | 只返回该群；不 `LIKE` 跨群 | Channel/Memory |
| 11 | Memory digest | 不混无授权私聊/群/邮件 | Memory |
| 12 | 跨会话长期记忆 | 授权/主体/审计；摘要≠原文 | Memory/Persona |

**负向**：任一条件缺失必须 fail closed/unknown；不得回退到 channel 全量或群名。

---

## 7. 与 Channel Bridge / Memory 报告的具体回应

### 7.1 对 Channel 报告

- **ACCEPT**：稳定 key `group:<gid>`/`private:<qq>`、conversation/session 映射、owner QQ 配置、群成员 senderId 事实、P0-B 路径分析。
- **MODIFY**：
  1. `speaker_id` 改称 `external_speaker_id`；canonical `speaker_id` 由 Memory 生成，避免“Bridge 生成 canonical”与 Memory people 冲突。
  2. RACI `session_bindings` 写 Persona 不接受；拆表，Channel 只写 `conversation_bindings`。
  3. owner ID 验证 A=Owner 可接受；Persona 在 D1 前不验证 owner；Channel 的 `speaker_type=owner` 只是临时分类。
  4. 群消息必须贯穿 `senderId`，prompt 可显示昵称但内部字段不得用昵称替代。
  5. conversation_id 加 `account_id`；无 account → fail closed。
- **PENDING_EVIDENCE**：Host/DSH 是否愿意生成 runtime session_id；Bridge 生产 DB 旧式 session 行的实际比例；群归档真实调用量。

### 7.2 对 Memory 报告/提案

- **ACCEPT**：`external_speaker_id`/`speaker_id`/`experiencer_*` 分离；`memory_evidence` write-once；三维独立；validityState 统一；P0-A/B/C/D/E/F。
- **MODIFY**：
  1. RACI `speaker_id 生成/验证` 应改为 Memory（people/contacts），Channel 只提供 external ID；Memory 报告 §8.2 当前把 speaker 生成/验证给 Channel，和 §3 的 people/contacts 冲突。
  2. `experiencer_evidence` 产生不能只写 Memory；self/owner 必须引用 Persona identity evidence；Memory 不能自己推断 self。
  3. `session_bindings` 待裁决 → 建议拆表；Memory 不写。
  4. `speaker_id` 映射缺 external ID 时不能回退 owner；群实体不能进 speaker。
  5. 三维字段中旧 numeric confidence 不得映射 high/medium。
- **PENDING_EVIDENCE**：evidence 完整性算法/签名；Memory v6 迁移；fresh raw_meta speaker_id 修复；`valid_from_kind` 旧行判定。

### 7.3 对 Persona 报告

- 自审：`selfId`/identityOf/binding 结论仍然成立；本报告补充拆表、owner 证据、三维、历史/cutover、P0 矩阵。
- `session_bindings` 先前建议 Channel 单写，现修正为**拆表**；原因：三种关系不能混，Channel 不能写 Persona self，Persona 不能写 owner/third_party 主体事实。

---

## 8. 仍待所有者决定

1. D1 owner ID 具体格式/首绑流程（建议 `owner:<uuid>`，但未批）。
2. owner episode D1 前策略（建议 fail closed/unknown）。
3. role_only 是否允许任何写入（建议仅展示）。
4. 跨平台账号合并（D3 默认隔离，具体流程）。
5. cutover 时间/版本、legacy 时间近似。
6. `session_bindings` 拆表方案及迁移（Owner 批准）。
7. conversation_id 格式/account_id 必填、runtime session_id 生成方。
8. owner/home 多 owner 账号是否共享 runtime、分区规则。
9. 群成员无 ID 是否允许 unknown 写 group episode。
10. experiencer_evidence 物理/签名/不可 PATCH。
11. 三维字段最终命名/枚举/旧 confidence 映射。
12. 自主补全正式写入授权。

**未被重新讨论**：D1–D7 原则本身。

---

## 9. 测试与证据

### Persona

- main `a84c7ba`；`npm test` **303/303 pass，exit 0**；worktree `/tmp/ei-main-a84c7ba`。
- 临时 probes：missing self 自动创建；invalid seed `abc` 接受；多 active `E_SELF_CONFLICT`；timeline state 更新但 0 行；atomic event=1/appraisal=1 残留。
- 现有测试不覆盖契约；`tests/contract.test.mjs:144` 反向断言 `self:unknown`。

### Memory

- M1 `7548e49`；R2 报告 258/258（历史结果，本轮未重跑）。
- raw_meta DDL/写入路径：`archive.js:174-185,454-486`；selfid `lib/selfid.js`；schema v5。
- 结论 E：fresh raw_meta 无 speaker_id，旧/部分迁移可写 self:unknown → **VERSION_MISMATCH**。

### Channel Bridge

- main `bffcabc`；报告称 fake transport 562/562；本轮 Persona 未重跑，标 **NOT_RUN**。
- 关键代码：`lib/sessions.js:118-124,368-414`；`lib/parse.js:162-217`；`lib/context.js:8-48`；`lib/group-turn-memory.js:91-96`；`lib/group-digest.js:61-88`。
- 生产 DB 只读聚合由 Channel 报告提供；Persona 不独立验证。

### 契约

- `006bb5b`，tree `b460823...`，blob `10a62b64...`。

---

## 10. NOT RUN

- 真实 QQ/NapCat、真实私聊/群/转发/通知、真实消息发送。
- 生产 Memory/Persona DB 写入、迁移、v6/v3、EI-2A。
- Channel Bridge 当前全量测试（本轮未重跑）。
- Memory 全量测试（本轮未重跑）。
- Persona 生产运行时 identityOf/binding（main 无 identityOf）。
- 跨会话真实注入/digest 端到端。
- 生产数据 self:unknown 污染验证。
- Android/DSHA 设备操作。

---

## 11. 状态与边界

- Persona 专项：**READY_FOR_REVIEW**。
- 联合接口：**BLOCKED**（session_bindings 拆表、conversation_id、owner D1、evidence 未定；三方未签发一致）。
- 契约 v1.1.1：**DRAFT / 不可冻结**。
- Persona 当前实现：**REJECT / NOT_IMPLEMENTED**。
- Memory 当前实现：**REJECT**（引用 Memory 报告）。
- Channel Bridge 当前实现：**PARTIAL / REJECT / NOT_IMPLEMENTED**（引用 Channel 报告）。
- Persona v3 / Memory v6 / EI-2A：**NOT_STARTED**。

本报告只读，未修改业务源码/测试/schema/数据库/配置；未部署/重启；未合并实现分支；所有建议均为 `PROPOSAL`，不是批准。
