# Owner Decisions 落地与三方接口交叉复核 · Memory 专项报告

- 任务编号：`OWNER-DECISIONS-INTERFACE-CROSS-REVIEW-02`
- 角色：Memory 记忆智能体负责人
- 时间：2026-11-22 15:4x–16:2x (Asia/Shanghai)
- 性质：只读架构审查 + 跨模块交叉复核；未改源码/测试/schema/数据库；未迁移/部署；未启动 v6/Persona v3/EI-2A。
- 状态：**READY_FOR_REVIEW**（Memory 专项）；三方最终一致 **BLOCKED**（见 §9）

## 1. 基线

| 项 | 值 |
|---|---|
| Memory 仓库/分支/HEAD | `ba-song/dsh-memory-core` / `feat/m1-preference-memory` / **`7548e49ed0b8d8673818464325d8e72ec7704b27`** |
| tree | `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f` |
| 工作区 | `/tmp/memaudit/m1`；仅 `?? node_modules`；`git diff --check` 干净 |
| 测试 | `npm test` @ `7548e49`：**258/258 pass、0 fail、0 skip、exit 0**（本轮重跑） |
| 联合合同 | `006bb5bf…`（blob `10a62b64…`，v1.1.1-draft） |
| Memory R2 | `26fbd08e…`（blob `9fcbe908…`） |
| Persona 报告 | `3e9836334f07a78abc8522afbca8de2870d9feaf`（分支 `review/persona-interface-arbitration-01`） |
| Channel Bridge 报告 | `5192f146bdace0bc0279da06f5cff3de6a1750fe`（分支 `review/channel-bridge-interface-arbitration-01`） |
| Memory 联合提案 | `6136b8e0…`（blob `2100ad31…`） |

已完整阅读 CB 报告（539 行）与 Persona 报告（494 行），并逐节对照 Memory R2 与提案；未用摘要代替原文。

## 2. 七项 Owner Decisions 落实情况

| 决策 | Memory 侧落实 | 状态 |
|---|---|---|
| D1 Owner ID | 建议 `owner:<uuid>`（UUIDv7 优先），禁止 QQ/昵称；Memory 只存 `person:owner` 映射，不生成、不猜测 owner ID | **PROPOSAL，待所有者批准格式** |
| D2 主人记忆 | 区分 `direct_statement` / `direct_observation` / `inference`；inference 不得写 owner 直接陈述；同源重复不提升 | **设计已对齐，未实施** |
| D3 跨平台关联 | 仅“疑似候选 + 保持未确认 + 明确同意后建链 + 记录来源/时间/确认方式/授权依据”；无回复/模糊≠授权 | **设计已对齐，未实施** |
| D4 会话隔离 | 原始原文按 conversation_id 隔离；跨会话检索=长期记忆条目（非原文）；digest 按 conversation 过滤 | **设计已对齐；现行 digest 违反（P0-B）** |
| D5 旧记忆保护 | 原文保留；缺字段标记 unknown；不整体排除；可用于带不确定性标记的回忆 | **现行 recall 可回忆（PASS），字段标记未实现** |
| D6 模块职责 | CB=平台事实/speaker/会话/映射；Persona=self/验证；Memory=记忆/证据/有效性/审计 | **ACCEPT；写入权需拆表（§5.B）** |
| D7 迁移 | 只读扫描→证据→候选→审核→正式（需所有者批准）；单事务/校验/审计/回滚 | **设计已对齐，未实施** |

## 3. 六项接口分歧逐项裁决

### A. 平台发言者 ID 与内部人物 ID —— **MODIFY（接受方向，需补充层级）**

**三方原始意见**
- CB：内部有 `senderId`/`channel_events.sender_id`，但投递体丢失；群消息只传 `senderName`；无 `speaker_type=unknown`；提出统一信封（platform/account/conversation/chat_type/sender/message_id/event_time/source）。
- Persona：`identityOf` 只处理 self/owner/third_party 主体；群成员身份不在 Persona；建议 evidence 由 Persona 产生、Memory 保存。
- Memory（R2/提案）：需 `external_speaker_id`、`speaker_id`、`group_id`、`experiencer_id` 分离；群实体不得替代成员；成员缺失 → unknown。

**代码事实（同一 commit）**
- CB `lib/parse.js:160-220` 保留 `senderId`；`channel_events.sender_id` 落库；`lib/message.js:10-38` 的 `source` 不含 senderId。
- CB `lib/prompt.js:75-84`、`group-buckets.js:31-35`、`group-turn-memory.js:92-126` 只用 `senderName`；`index.js:547,566` 缺 sender 时回退 `senderName || contactName || senderId`（可退化成群名）。
- Memory `archive.js:282-285` 群消息 `personOfUser` 返回群实体 ID，不读成员 sender；`raw_meta` speaker_id 列在 fresh 库不存在（§E）。

**交叉审查结论**：**MODIFY**。接受 CB 统一信封方向；但字段必须分四层：
1. `external_speaker_id`（平台原始，CB 产生，不可被下游改写）；
2. `speaker_id`（Memory 规范化 person ID：third_party=`person:contact:<platform>:<external>`；self=`self:<uuid>`；owner=`owner:<uuid>`/待 D1 映射）；
3. `group_id`（群实体标识，不进入 speaker_id）；
4. `experiencer_id`（经历主体，独立判断）。

**逐问回答**
1. 原始 ID：CB 产生（`senderId`/`sender_external_id`），写入 `channel_events` 与信封。
2. 平台→内部人物：Memory 的 people/contacts 负责 third_party 映射；Persona 负责 self；owner 由 D1 + 明确同意后建链；CB 只提供外部 ID，不写 person id。
3. 身份关联证据：Memory `memory_evidence`（write-once）保存 `source_id`、`producer`、`produced_at`、`external_id`、映射结果；owner 同意记录单独存 `owner_link_consent`（CB 采集 + Memory 审计）。
4. 群聊区分：信封必须同时保留 `group_id`、`sender_external_id`、`forward_sender_external_id`、`forward_original_author_external_id`、`message_id`；转发/引用不得降成纯文本；通知类带 `actor/operator`。
5. 缺失：`speaker_id=''`、`id_strength='none'`、`speaker_type='unknown'`；不得用群名/昵称/群 ID 代替。
6. 防昵称：ID 字段只接受平台数字/稳定字符串；显示名单独 `display_name`；任何 `*_id` 不得从昵称/群名/正文推断（evidence_source 才能记录显示名来源）。
7. D3 流程：`owner_link_candidates`（external_id、platform、evidence、status=unconfirmed）→ 明确询问（记录 asked_at/channel/问句 hash）→ `owner_link_consent`（approved/rejected/unclear、scope、decided_at、owner 原话 hash）→ 仅 approved 才写 `person:owner` 映射；unclear/无回复保持 unconfirmed，不合并。

**风险**：群名回退（现网存在）；owner 多账号误判；转发原作者丢失。
**需主人决定**：owner 授权询问渠道与措辞模板；跨平台候选的展示方式。

### B. session_bindings 唯一写入责任 —— **MODIFY（拆三张表/三种接口，而非单表换写入方）**

**三方原始意见**
- CB：当前 `channel_sessions` 有 `(channel,kind)→session_id`；建议 Host/DSH 生成 session；`session_bindings` 表建议 Persona 唯一写入（RACI 第 12 项=Persona）。
- Persona：建议 CB 唯一写入 `session_bindings`（subject_type/id/source/updated_at），Persona 只读验证；`bindingOf` 只证“已绑定”，不单独证 self。
- Memory：上一轮列为 PENDING；`conversation_scope` 恒空、session id 不落库。

**代码事实**
- Persona `inject.writeBinding` 仅在 cwd 可绑定且非 group 时写 `session_bindings`（Persona 报告 §4.4）；`bindingOf` 无 `persona_id===selfId()` 校验。
- CB `channel_sessions` 只存 `(channel,kind)→session_id/prev_session_id`；投递体不携带。
- Memory 仅有 `conversation_scope`（恒空）。

**交叉审查结论**：**MODIFY**。三种关系不能混：
1. `conversation_id ↔ runtime_session_id`：**CB 唯一写入**（`channel_conversations`）。
2. `runtime_session_id ↔ 主体（subject_type/id）`：**CB 唯一写入**（`session_subjects`，带 source/consent_ref/updated_at），因为只有 CB 持有平台 sender/群/owner 同意事实；Persona 只读验证。
3. `runtime_session_id ↔ Persona self/persona 绑定`：**Persona 唯一写入**（保留 `session_bindings`，仅用于 persona 选择，不证明 subject）。

若所有者坚持单表：则 CB 唯一写入 subject 字段，Persona 对 persona/role 字段只读或另存；**禁止双写**。推荐拆表（清晰、可审计）。

**逐问回答**
1. 不作为单一共享表继续承载三种事实；拆三表/三接口。
2. 唯一写入：conversation=CB；session_subjects=CB；persona 绑定=Persona。
3. Persona 只读验证 subject；`bindingOf` 必须 `bound && persona_id===selfId && subject record valid`。
4. CB 有事实依据写 subject（sender/chat/consent），但不写 Persona DB。
5. self/persona 绑定与聊天会话映射分开（见上 3）。
6. 拆两张（conversation/session 与 session/subject）+ 保留 Persona binding；共三类。
7. 防双写：每表单一 writer + `version/updated_at` + 冲突→unknown + 审计。
8. 历史 binding 缺主体证据：`subject_type=unknown`、`subject_id=''`、`legacy_unmapped`；不得推断 owner/self。

**RACI（本项）**：conversation/session 生成=CB；session_subjects=CB；persona binding=Persona；验证=Persona（self）/CB（session）；Memory 只读消费。
**风险**：拆表迁移成本；旧 `session_bindings` 兼容。
**需主人决定**：是否接受拆表方案（推荐）。

### C. conversation_id 与 runtime_session_id —— **ACCEPT（CB 候选格式）+ 条件**

**三方原始意见**
- CB：候选 `qq:<account>:private:<peer>` / `qq:<account>:group:<gid>`；Host/DSH 生成 session，Bridge 记录映射；旧 `group`/`private` 行 legacy。
- Persona：`session_bindings.session_id` 是 runtime header.id；无 conversation_id；建议 CB 产生。
- Memory：提案同格式；Memory 只存两列。

**代码事实**：CB `keyFor()` `lib/sessions.js:119-124`；`channel_sessions` 主键 `(channel,kind)`；生产有旧式 `group`/`private` 行（CB 报告 §3.1.1）。

**交叉审查结论**：**ACCEPT**，条件：
- 格式 `qq:<account_id>:<chat_type>:<peer_id|group_id>`；`account_id` 必填（多机器人账号必须不同 conversation）；不得用昵称/群名/正文/随机数。
- runtime session：推荐 Host/DSH 生成；若保留 CB 生成，标记 `producer=bridge` + `trusted_source`，由所有者批准。
- 旧 `group`/`private`：`legacy_unmapped`，不自动合并；新消息缺 account/peer/group → **fail closed**（不建 unknown 房间、不按 channel 兜底）。
- Memory 侧新增 `conversation_id`/`session_id` 列 + 索引；raw_meta 同样落列。

**风险**：旧行无法映射；多账号切换；home 共享会话。
**需主人决定**：session_id 生成方；home 是否允许多 owner 私聊（建议按 conversation 分区）。

### D. 跨会话与跨群隔离 —— **ACCEPT（CB 的三条已确认路径）+ 统一验收**

**三方原始意见**
- CB：确认 `buildSessionContext` 仅按 channel、`getGroupContext` fallback 仅按 kind、群归档缺 group_id/speaker_id；给出 A–D 方案。
- Persona：无额外路径；支持按 conversation 隔离。
- Memory：确认 `buildDigest` 混合 home+全部 QQ 私聊+群+email 注入 owner（R2 §6）。

**代码事实**：CB 报告 §3.3 行号；Memory `digest.js:5-21`、`index.js:1218`。

**交叉审查结论**：**ACCEPT**；统一 12 条验收（§8）。
- 原始原文隔离：按 `conversation_id`；缺失 fail closed。
- 跨会话长期记忆：仅 Memory 条目/摘要，带 subject/permission/audit；不返回原文。
- 摘要共享：独立实体，带 `source_conversation_ids[]`、scope、TTL、撤回。
- owner 会话：只接收 owner 授权摘要，不自动接收所有渠道原文。

**需主人决定**：owner 会话允许的摘要范围与授权方式。

### E. raw_meta 中 `self:unknown` 的版本与证据差异 —— **VERSION_MISMATCH + 条件 CONFIRMED**

**检查（同一 Memory commit `7548e49`）**
1. `raw_meta` DDL：`archive.js:174-181` **无 `speaker_id`**。
2. ALTER：`:182-185` 仅 `raw_text/extra/cwd/person_id`；全仓 `grep "ALTER TABLE raw_meta ADD COLUMN speaker_id"` **0 命中**（`tests/channel-envelope.test.mjs` 手动 ALTER 才有）。
3. 写入：`archive.js:430-470`，role=self 时 `sid=getSelfId()`；空 → `speakerId='self:unknown'; pendingIdentity=true`；非空 sentinel → 直接 `speakerId='self:unknown'`，**pendingIdentity 不置位**。
4. 持久化：列存在时 INSERT 带 `speaker_id`；fresh 库无列 → 走降级 INSERT（不带该列）→ **无法持久化**。
5. 探针（临时库，手动 ALTER 加列）：归档 assistant 消息 → `speaker_id='self:unknown'`、`extra` 无 pendingIdentity（P5）；fresh 库无列（P4）。
6. 生产数据：**无证据**（未连接生产 DB）。

**结论**：**VERSION_MISMATCH**（fresh schema 与已有 schema 不同）+ **代码路径 CONFIRMED（仅当列存在）**；生产是否污染 **NOT_CONFIRMED**；fresh DB **NOT_PRESENT**。不得宣称生产已污染。

**建议**：v6 统一添加 `speaker_id` 列 + `speaker_type='unknown'`；历史 `self:unknown` 保持 unknown，不自动改写；`pendingIdentity` 对 sentinel 恒置位；写入 gate 与 memories 一致（禁止 sentinel 进入经历主体）。

### F. 旧记忆兼容 —— **ACCEPT（D5）+ 六维分离**

**三方原始意见**
- CB：旧行 legacy，不猜；原文保留。
- Persona：旧 emotion 行保留；无 cutover/三维；不能整体排除。
- Memory：legacy 用 created_at 下限近似；不整体降级。

**代码事实**：Memory current recall 放行 NULL 起点（`recall.js:71`）；旧记录可回忆（实测）；无 `valid_from_kind`/`approximated`/`evidence_source`。

**交叉审查结论**：**ACCEPT**（D5 已定，不重新讨论）。必须区分六种“未知”：
| 维度 | 字段 | 旧数据默认 |
|---|---|---|
| 来源未知 | `evidence_source` | `historical_record`（原文可访问）或 `unknown` |
| 发言者未知 | `speaker_id`/`id_strength` | `''` / `none` |
| 发生时间未知 | `valid_from_kind` | `legacy`（created_at 近似）或 `unknown` |
| 事实未验证 | `verification_status` | `unverified` |
| 存在冲突 | `verification_status` | `disputed`（保留冲突） |
| 已撤回 | `verification_status` | `retracted`（保留原记录） |

- 旧记忆仍用于回忆/参考（普通注入允许，但带标记）；重要决策需 `supported/confirmed`；冲突/撤回不作为决策依据。
- 原文保留：不改 `text`；补全只写元数据；`episode-rewrite` 需保持 owner 确认+快照，不算迁移。
- `historical_record` 与独立新证据分开：同 `source_id` 副本不计数。
- `validityState` 对 legacy 不得判 INVALID；仅无 created_at/无法建立边界时 `unknown` → UNCERTAIN（仍可通过不确定通道展示，不整体排除）。

## 4. 其他未决技术事项（建议）

1. **Owner ID**：`owner:<uuid>`（UUIDv7）；`owner_identity` 表（id/status/created_at/verified_at/evidence/rotated_from）；首次由 owner 明确确认；更换=新 ID+历史，不覆盖。
2. **同意记录**：`owner_link_consent`（candidate_id、platform、external_id、asked_at、asked_channel、question_hash、answer_hash、decision=approved/rejected/unclear、scope、decided_at、evidence_source）；无回复/unclear 保持 unconfirmed。
3. **role_only**：只用于展示/上下文；不得写 `experiencer_id`、去重键、self 统计；写入时 `id_strength='role_only'` 且 `experiencer_type=unknown`。
4. **experiencer_evidence**：CB 产生会话/平台事实，Persona 对 self 断言；Memory 结构校验+producer 白名单+canonical self 校验，写 `memory_evidence`（write-once，不在 PATCHABLE）。
5. **valid_from_kind**：exact（数值）/implicit（created_at）/legacy（cutover 前 NULL，近似）/unknown（无可信边界）；旧行 legacy，不误伤。
6. **cutover**：由所有者批准；候选=契约冻结日期 + v6 迁移完成时间；存 `meta.contract_cutover_at/version`；未批准前不写死。
7. **selfId()**：canonical 或 null；不自动建 self；多 active→null+`E_SELF_CONFLICT`；Memory 拒绝 sentinel/非法/空。
8. **identityOf**：输入 session/conversation/chat_type/peer/group/speaker/evidence；输出 `{ok,valid,self_id,subject_type,subject_id,id_strength,reason}`；无证据→unknown；冲突→unknown+审计；不读 PATCH 字段。
9. **bindingOf**：`bound && persona_id===selfId && status=active && subject record valid`；否则 unknown/`E_SESSION_BINDING_CONFLICT`/`E_BINDING_EXPIRED`。
10. **timeline/事务**：Persona 侧修列名、去空 catch、三表单事务、失败回滚、错误可观测（Persona 已列 P0-F）。
11. **重复证据**：Memory `source_id` 唯一 + `memory_evidence_links`（duplicate_of/corroborates/contradicts）；同源只记 occurrence；禁止 `confidence+0.02`（`merge.js:128-131` 需改）。
12. **补全四阶段**：只读扫描→证据检索→候选（`memory_backfill_candidates`）→正式写入（所有者授权+`memory_backfill_log`+事务+回滚）；原文不改。

## 5. RACI 最终建议（Memory 侧）

| 事项 | R（写入/执行） | A | C | 唯一写入方 |
|---|---|---|---|---|
| conversation_id 生成 | CB | CB | Persona/Memory | CB |
| runtime session_id 生成 | Host/DSH（建议） | Host/DSH | CB/Persona | Host/DSH（或 CB+trusted 标记） |
| conversation↔session 映射 | CB | CB | Persona | CB |
| session_subjects（主体） | CB | CB | Persona/Memory | CB |
| persona 绑定 | Persona | Persona | CB | Persona |
| speaker_id（canonical） | Memory | Memory | CB/Persona | Memory |
| self ID 验证 | Persona | Persona | Memory | Persona |
| owner ID 验证 | 所有者（D1） | 所有者 | Persona/Memory | 待 D1 |
| third_party ID | Memory | Memory | CB | Memory |
| experiencer 判定 | Memory | Memory | Persona/CB | Memory |
| experiencer_evidence 产生 | CB+Persona | Persona（self）/CB（会话） | Memory | 分字段唯一 |
| evidence 保存 | Memory | Memory | Persona/CB | Memory |
| digest | Memory | Memory | CB | Memory |
| 跨会话检索/注入 | Memory | Memory | CB/Persona | Memory（只读/注入） |
| validityState | Memory | Memory | — | Memory |
| 补全审计 | Memory | Memory | 所有者 | Memory |

**冲突**：CB 报告把 `session_bindings` 给 Persona；Persona 报告给 CB；Memory 建议拆表（本报告 §3.B）。需所有者批准拆表或单表唯一写入方。

## 6. P0 隔离验收矩阵

| # | 验收 | 正向 | 负向 |
|---|---|---|---|
| 1 | 私聊 A 不进 B | A 会话只含 A | B 无 A 原文；跨会话检索不带原文 |
| 2 | 私聊不进群 | 群只含群 | 群无 A 原文 |
| 3 | 群 A 不进群 B | A 群只含 A | B 群无 A |
| 4 | 群不进主人私聊 | 主人私聊仅授权摘要 | 无群原文 |
| 5 | 新 runtime session 不按 channel 取历史 | 仅当前 conversation | 缺 conversation 返回空 |
| 6 | 群 fallback 精确 group_id | 仅同群 | 不同群为空 |
| 7 | 群归档按 group_id 可查 | 精确命中 | 无 group_id 拒绝/空 |
| 8 | 群成员 sender 保留 | sender_id 落库 | 缺失→unknown，不用群名 |
| 9 | 缺 conversation 不退化为全 channel | 返回空+审计 | 无跨会话内容 |
| 10 | digest 不混无授权原文 | 仅当前/授权 | 负向无泄漏 |
| 11 | 跨会话长期记忆需授权/主体/审计 | 授权命中 | 无授权拒绝 |
| 12 | 摘要≠原文 | 摘要带来源 | 不注入全文 |

**测试方式**：CB 临时内存库 + Memory 临时 DB；合成 A/B 私聊、A/B 群、home、email；断言注入文本不含其他会话标记；每项正/负各一。

## 7. 仍未解决的问题

1. `session_bindings` 拆表方案需所有者批准。
2. runtime session_id 生成方（Host/DSH vs CB）。
3. owner ID 格式、首次绑定、同意询问渠道与措辞。
4. conversation_id 的 account_id 是否强制（建议强制）。
5. 旧 binding/旧 session 行的迁移与 legacy 解释。
6. 三维字段/枚举最终命名与旧 confidence 映射。
7. cutover 时间/版本。
8. 群成员 ID 补录/合并策略。
9. `subject` 是否 deprecated；rules 适配 validity。

## 8. 测试与证据

- Memory `npm test` @ `7548e49`：258/258、exit 0（本轮重跑）。
- Memory R2 探针（同 HEAD）：有效性矩阵、identity（`self:unknown`/`abc`/`self:` 写入）、迁移回滚。
- CB 报告：562/562 fake transport（引用，未重跑）；生产 DB 只读聚合（5 sessions）。
- Persona 报告：303/303（引用，未重跑）。
- 本报告未新增测试、未改代码；P0 矩阵为验收设计，未执行。

## 9. 状态与边界

- Memory 专项：**READY_FOR_REVIEW**
- 三方接口：**BLOCKED**（B/C/owner 需所有者裁决；CB/Persona 报告已读但对 `session_bindings` 归属仍有分歧）
- 合同：**NOT FROZEN**；v6/Persona v3/EI-2A：**NOT_STARTED**
- 未修改业务源码/测试/schema/数据库/生产配置；未迁移/部署/重启；未连接真实 QQ/NapCat；未发送消息。
- **NOT RUN**：生产 DB、真实渠道、Memory v6、Persona v3、EI-2A、迁移、设备。
