# Channel Bridge 合同协调审查报告 03

- 任务：`OWNER-APPROVED-CONTRACT-COORDINATION-03`
- 角色：Channel Bridge 渠道接入与会话桥接专项负责人
- 性质：只读复核；不修改 Bridge 源码/测试/数据库/生产配置；不部署/重启；不连接真实 QQ/NapCat；不发送消息；不实施 Conversation ID 迁移；不创建 Owner 账号关联；不写 Persona/Memory 专属关系。
- 状态：**READY_FOR_REVIEW**
- 合同状态：v1.1.1 仍为 DRAFT；本报告不冻结合同，不宣布整体架构 PASS。
- 生成时间：2026-11-22（Asia/Shanghai）

---

## 0. 一句话结论

Owner 已批准的五项决策（D1 三层关系、D2 Conversation ID、D3 Owner ID、D4 旧记忆保护、D5 P0 顺序）在 Channel Bridge 当前实现中**尚未落地**。当前 Bridge 有事实上的 `(channel, kind) → session_id` 映射，但 `keyFor()` 不包含 `account_id`、不生成 `conv:` 格式、缺失时回退 `unknown`；runtime `session_id` 由 Bridge `randomUUID()` 自建，而不是使用 Host/DSH 的权威 mint；消息 Envelope 缺少 `external_speaker_id`、`conversation_id`、`runtime_session_id`、`forwarder_id`、`original_author_id`、证据元数据；上下文/群归档/交接卡仍有跨会话路径。**当前实现状态：REJECT / PARTIAL / NOT_IMPLEMENTED；不能进入实施或冻结。**

---

## 1. 当前代码基线与阅读材料

### 1.1 基线

| 对象 | 值 |
|---|---|
| Channel Bridge 仓库 | `ba-song/dsh-channel-bridge` |
| 分支/HEAD | `main` @ `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` |
| tree | `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| package | `dsh-channel-bridge@0.18.0` |
| 合同 | `docs/memory-persona-contract-v1.1.1-owner-decisions` @ `006bb5bfce5d031b49a60271fe0406b228b43e00`，blob `10a62b64dff6219d00a1e25be09a39ddccb50e1a` |
| Memory 交叉审查 | `review/memory-owner-decisions-cross-review-02` @ `3af0a57b05367d7d37f67e5c1378d8b250b7d007` |
| Persona 交叉审查 | `review/persona-owner-decisions-cross-review-02` @ `5652e35b40754e4d94e42860cf623d2499fb27be` |
| Channel Bridge 交叉审查 | `review/channel-bridge-owner-decisions-cross-review-02` @ `e811852a55d9f4c2a40694270d433b4f4b0a9733` |
| 生产 Bridge 源码 | `/root/.dsh/plugin-src/dsh-channel-bridge`；与 main HEAD `diff -rq` 无差异（本报告未修改） |
| 生产 profile | `enabled:true`、`unified:true`、`mode:send`、`group.social:true`（只读核查，未改动） |

### 1.2 已读文件

- 合同全文（323 行）；
- Memory 交叉审查全文（258 行）；
- Persona 交叉审查全文（513 行）；
- Channel Bridge 交叉审查全文（526 行）；
- Channel Bridge 源码：`lib/parse.js`、`message.js`、`sessions.js`、`store.js`、`context.js`、`router.js`、`prompt.js`、`index.js`、`unified.js`、`handover.js`、`group-buckets.js`、`group-followup.js`、`group-turn-memory.js`、`group-digest.js`、`forward.js`、`quote.js`、`notice.js`、`tools.js`、`status.js`、`config.js`；
- DSH Host 包：`@deepseek-ai/dsh-api-session-controller`（`createSession`/`createMinted` 证据）、`@deepseek-ai/dsh-agent`（`agents.create` 需要 `sessionId`）。

### 1.3 测试与证据

| 证据 | 结果 |
|---|---|
| Bridge `npm test` @ `bffcabc` | **562/562 pass / 0 fail / 0 skip，exit 0**（fake transport；同一 HEAD 只读 clone） |
| Memory 交叉审查 | 258/258 pass @ `7548e49`（引用 Memory 报告；本轮未重跑） |
| Persona 交叉审查 | 303/303 pass @ `a84c7ba`（引用 Persona 报告；本轮未重跑） |
| 真实 QQ/NapCat/生产 DB 写 | **NOT RUN** |
| 生产 Bridge DB 聚合 | sessions 5（`group:<gid>` 2、`private:<qq>` 1、旧式 `group`/`private` 2）；群入站 187、空 sender 0（只读快照） |

---

## 2. Owner 五项决策落实情况

| 决策 | 要求 | 当前 Bridge 实现 | 状态 |
|---|---|---|---|
| **D1 三层关系拆分** | Conversation↔Runtime Session = Bridge；Runtime Session↔Persona Self = Persona；Message↔Speaker/Experiencer = Memory | `channel_sessions` 有 `(channel, kind)→session_id/prev_session_id`，但无标准 `conversation_id`；Persona 仍有 `session_bindings` 单表；Bridge 还直接写群轮次/群归档（Memory 层） | **REJECT / PARTIAL**：三层未拆清；Bridge 越界写 Memory 层 |
| **D2 Conversation ID** | `conv:qq:<account_id>:private:<peer_id>` / `conv:qq:<account_id>:group:<group_id>`；account_id 必填；缺失 fail closed；旧格式 `legacy_unmapped`；runtime session 由 Host/DSH 权威生成 | `keyFor()` 生成 `group:<gid>` / `private:<qq>`，无 account_id；ID 剥非数字；空/非数字回退 `unknown`；runtime session 由 Bridge `randomUUID()`；无 `legacy_unmapped` 标记 | **REJECT**（格式/account/fail-closed/legacy 均未落地） |
| **D3 Owner ID** | `owner:<uuid>`；Persona 负责 Owner 身份/账号关联；Bridge 只提供平台原始账号事实；跨平台关联需 Owner 明确同意 | Bridge 只有 `owner.qqIds` 白名单和 `person:owner` 占位；无 owner ID、无 owner link、无 consent；`isOwner` 仅为配置命中 | **NOT_IMPLEMENTED** |
| **D4 旧记忆保护** | 保留原文、已有 confidence、未知信息；不因缺新字段批量删除/降级/猜身份 | Bridge 不管理 Memory 旧记忆；但 Bridge 群归档/上下文仍可能把旧群内容跨会话注入；Memory 侧有旧记忆字段缺失问题 | **PARTIAL（跨模块）**：Bridge 侧隔离未闭合；Memory 侧另见其报告 |
| **D5 P0 修复顺序** | 1 跨会话泄漏；2 群发言者；3 Self 门禁；4 有效性；5 重复证据；6 Persona 事务 | 第 1、2 项在 Bridge 侧明确未闭合（见 §5/§7）；第 3-6 项属 Persona/Memory，本报告只核对接口 | **REJECT（当前）** |

**结论**：Owner 原则已固定，不再重新讨论；当前 Bridge 实现不能作为合同落地基线。

---

## 3. 议题 A：平台发言者 ID 与内部人物 ID

### 3.1 四层字段

| 字段 | 语义 | 产生方 | 保存方 | 备注 |
|---|---|---|---|---|
| `external_speaker_id` | 平台原始发言者 ID（QQ `user_id`） | Channel Bridge | Bridge 原始事件/Envelope；Memory 可存引用 | 不可被下游改写 |
| `speaker_id` | Memory 解析的 canonical person ID（third_party `person:contact:<platform>:<id>`；self `self:<uuid>`；owner `owner:<uuid>`） | Memory（people/contacts）；self/owner 由 Persona 验证 | Memory | 不等于 external |
| `group_id` | 群聊空间（QQ 群号） | Channel Bridge | Bridge + Memory 作 scope/群实体 | `person:contact:qq:group:<gid>` 只表示群实体 |
| `experiencer_id` | 记忆描述/归属的经历主体 | Memory（基于 speaker/persona/evidence） | Memory | 不等于 speaker |

### 3.2 逐问回答

1. **谁产生原始平台 ID？** Channel Bridge。`parseMessageEvent` 保留 `senderId`、`contactId`、`messageId`；群 `contactId=group_id`、`senderId=user_id`（`lib/parse.js:160-220`）。当前 `channel_events` 有 `sender_id`，但投递体 `buildChannelMessage.source` 不带 `senderId`/`messageId`（`lib/message.js:10-38`）。
2. **谁负责平台 ID → 内部人物？** Memory 的 people/contacts。Bridge 只给 `external_speaker_id` + `speaker_evidence`；Persona 只验证 self/owner；Bridge 不生成 canonical `speaker_id`。
3. **谁保存身份关联证据？**
   - Bridge：`speaker_evidence`（原始 sender 字段、来源、缺失字段、置信）在 Bridge 事件/Envelope；
   - Persona：`identity_evidence`（self/owner 的 canonical 断言）；
   - Memory：`memory_evidence`（canonical speaker 映射、experiencer、三维证据）；
   - 三处用 ID 引用，不复制成多份独立证据。
4. **群聊中如何区分群实体、实际发言者、转发者、原始作者？**
   - 群实体：`group_id`；
   - 实际发言者：`external_speaker_id` → Memory `speaker_id`；
   - 转发者：`forwarder_id`（当前 `forward.js` 节点有 `senderId`，但 `formatForward` 只显示 `senderName`，结构字段未进入 prompt/Envelope）；
   - 原始作者：`original_author_id`（平台能提供时；引用消息 `quote.senderId` 同理）；
   - 通知：`actor_id`/`operator_id`/`target_id` 分开；当前 `index.js:398-447` 把 notice 压成 `senderId=n.userId`、`senderName=n.userId`，`operatorId` 未传。
5. **发言者 ID 缺失？** `external_speaker_id=null`、`speaker_id=null`、`speaker_type=unknown`；保留消息事实和 `missing_fields=['sender_id']`；群消息可存档但不得用于 self/owner 归属；不得用群名/群号/昵称代替。当前群解析不校验 `senderId`，`index.js:547,566` 会 fallback 到群名（探针已复现）。
6. **如何防止群昵称/群名被当人物 ID？** 显示名只进 `display_name_snapshot`/`card_snapshot`；所有 `*_id` 字段只接受平台数字/稳定字符串；禁止 `senderName || contactName` 作为 ID；P0-A 测试覆盖。
7. **D3 Owner 疑似发现/询问/明确授权？**
   - Bridge 只产生平台账号事实：`platform`、`account_id`、`external_account_id`、来源、时间、证据；
   - Persona 身份域保存 `owner_link_candidate`（`status=pending`），不写 `owner_id`；
   - 汐可主动询问；Owner 明确同意（记录 who/when/how/原话 hash）后才写 `owner_account_link(status=confirmed)`；
   - 无回复/模糊/无法确认 → 保持 pending/unconfirmed，不构成授权；
   - 禁止昵称、头像、表达习惯、相似行为自动合并。
   - 当前 Bridge 只有 `owner.qqIds` 配置；无 candidate/link/consent，D3 **NOT_IMPLEMENTED**。

### 3.3 Owner ID / 账号关联建议（PROPOSAL）

```text
owner_identity(
  owner_id        -- owner:<uuid>，永久
  status          -- active / retired
  created_at
  created_by
  evidence
  version
)

owner_link_candidate(
  candidate_id, platform, external_account_id,
  evidence, status='unconfirmed',
  asked_at, asked_channel, question_hash,
  response_at, response_hash,
  decision='pending'|'approved'|'rejected'|'unclear'
)

owner_account_link(
  link_id, owner_id, platform, account_id,
  status='confirmed', consent_ref,
  confirmed_by, confirmed_at, revoked_at
)
```

唯一写入建议（符合 D3）：Persona 负责 Owner 身份/关联；Bridge 只提供平台事实；Memory 只存 `owner_id` 引用与记忆证据；不自动建链。

---

## 4. 议题 B：三层关系与 session_bindings

### 4.1 三层关系（Owner D1 已批准，不再讨论原则）

| 关系 | 唯一写入 | 存储建议 | 当前 Bridge |
|---|---|---|---|
| 1. `conversation_id ↔ runtime_session_id` | **Channel Bridge** | `channel_conversations` + `channel_session_map`（或给 `channel_sessions` 加 `conversation_id/account_id/version`） | 只有 `channel_sessions(channel, kind)→session_id/prev_session_id`，无 `conversation_id/account_id/version` |
| 2. `runtime_session_id ↔ Persona self` | **Persona** | `persona_self_bindings` | 当前 Persona `session_bindings` 单表；Bridge 不写 Persona DB |
| 3. `Message ↔ Speaker / Experiencer` | **Memory** | `memories`/`raw_meta` 的 speaker/experiencer/evidence | Bridge 当前直接写群轮次/群归档（越界到 Memory 层） |

### 4.2 逐问回答

1. **`session_bindings` 是否继续作为共享表？** **NO**。按 Owner D1 拆三层；旧表作为 legacy/read-only 或迁移为视图，不双写。
2. **谁是唯一写入者？** 关系 1 = Channel Bridge；关系 2 = Persona；关系 3 = Memory（每条消息）。没有任何一张表由两个模块双写。
3. **Persona 是否只读验证？** 对关系 1 只读；对关系 2 是唯一写入者；`bindingOf` 只证“已绑定”，不能单独证 self，必须 `persona_id===selfId`。
4. **Channel Bridge 是否有足够事实写主体绑定？** **NO**。Bridge 有平台 sender/群/会话事实，但没有 canonical self/persona，不能写 Persona self 绑定；Bridge 只写关系 1。
5. **Persona self/persona 绑定是否与聊天会话映射分开？** **YES**。
6. **是否拆两张表/两种接口？** **YES**；建议 `channel_conversation_sessions`（Bridge）与 `persona_self_bindings`（Persona）；旧 `session_bindings` 标 legacy。
7. **如何避免双写？** 单一 writer + 外键/引用 + 版本/审计；Bridge 不写 Persona DB；Persona 不写 Bridge 映射；Memory 不写两者；冲突 → unknown + 审计。
8. **历史 binding 缺主体证据？** 标 `legacy_unclassified`/`unknown`；不得推断 owner/self；旧 `persona_id===selfId` 只能作弱绑定事实，不能证明当前消息主体；需新证据或 Owner 确认。

### 4.3 当前实现缺口

- `channel_sessions` 主键 `(channel, kind)`；`kind` 存 `group:<gid>`/`private:<qq>`；`session_id`、`prev_session_id`、`rotated_at`、`handoff_text`；无 `conversation_id`、`account_id`、`version`、`audit`。
- `sessions.ensure` 按 key 复用/resume/create；`session_id` 由 `randomUUID()`（`lib/sessions.js:259,287,451,481`）。
- `unified` owner 私聊走 home，不写 `channel_sessions`（`lib/unified.js:13-19`），因此 owner 私聊没有 conversation→session 映射。
- Persona `session_bindings` 仍只有 `session_id/persona_id/role/cwd/source/created_at`（引用 Persona 报告）；Bridge 不写它，但也没有 conversation 维度供 Persona 验证。
- Bridge 的 `saveGroupTurn`/`saveGroupTranscript` 直接写 Memory 层（`lib/group-turn-memory.js:92-126`、`lib/group-digest.js:61-88`），与 D1 第 3 层“Memory 唯一写”冲突。

---

## 5. 议题 C：Conversation ID 与 Runtime Session ID

### 5.1 目标格式（Owner D2 已批准）

```text
conv:qq:<account_id>:private:<peer_id>
conv:qq:<account_id>:group:<group_id>
```

- `account_id` 必填；`peer_id` 私聊必填，`group_id` 群聊必填。
- 缺失任一字段 → **fail closed**，不生成 `unknown`，不按 channel 取历史。
- 旧格式 `group`/`private` 保留为 `legacy_unmapped`，不猜测、不自动合并。
- 不得用昵称、群名、显示名、消息文本或随机数构造。

### 5.2 当前实现对照

| 问题 | 当前实现 | 结论 |
|---|---|---|
| `keyFor()` 如何构造？ | `group:<gid>` / `private:<qq>`；ID `replace(/\D/g,'')`；空/非数字回退 `unknown`（`lib/sessions.js:119-124`） | **REJECT**：无 account、非 `conv:`、剥字符、unknown 合并 |
| 是否包含 account_id？ | 否 | **REJECT**：多机器人账号同群/同 QQ 会冲突 |
| 私聊 peer/群 group 是否严格区分？ | `kind` 前缀区分；`contactId=群号`；私聊 `senderId` | **PARTIAL**：结构区分，但 ID 归一化会碰撞 |
| 多账号是否冲突？ | 同 `(channel,kind)` 不区分 account | **REJECT**：不同机器人同群会映射同一 conversation |
| 旧格式识别？ | 无 `legacy_unmapped` 标记；生产有旧式 `group`/`private` 行 | **NOT_IMPLEMENTED** |
| 缺字段是否拒绝？ | 空/非数字回退 `unknown`，不拒绝 | **REJECT**：应 fail closed |
| 唯一约束/审计/版本？ | `channel_sessions` PK `(channel,kind)`；无 conversation_id/版本/audit | **PARTIAL（唯一性有，身份/审计无）** |

### 5.3 Runtime Session ID 权威来源

- 当前 Bridge：`randomUUID()` 生成 `sessionId`，传给 `agents.create({sessionId,...})`（`lib/sessions.js:259,287,451,481`）。
- DSH Host 安装包：`@deepseek-ai/dsh-api-session-controller` 的 `sessionController.createSession(request)` 在 `request.sessionId === undefined` 时调用 `createMinted()`，生成 `session-${randomUUID()}`（Host 包 `lib/index.js:267-268,511-519`）；`@deepseek-ai/dsh-agent` 的 `agents.create` 需要 `sessionId`，不是自动 mint。
- 结论：**Host/DSH 有权威 mint 接口**（`sessionController.createSession`），当前 Bridge 绕过它，自建 UUID。D2 要求 Host 权威；当前实现 **REJECT**。
- 若 Bridge 运行环境拿不到 `ctx.sessionController`，则这部分应标 **BLOCKED**，请求 Host 暴露 mint 接口；不得用 Bridge UUID 冒充 Host 权威。
- Bridge 应记录 `conversation_id ↔ runtime_session_id`，并标 `session_producer='host'|'bridge'`、`host_session_id`/`session_id`、`created_at`、`rotated_at`、`version`。

### 5.4 旧格式兼容

- 旧 `group`/`private` 行：标 `legacy_unmapped`，只读；不参与新上下文；不自动映射；`forceRotate` 必须精确 `conversation_id`，不能按 `kind` 取最新（当前 `lib/sessions.js:324-352` 有模糊选择）。
- 新消息缺 `account_id`/`peer_id`/`group_id`：拒绝投递/不写入，返回 `E_CONVERSATION_MISSING`；不得建 `unknown` room。
- 迁移只对 `account_id` 已知且无歧义的行生成新 ID；不覆盖旧行；Owner 批准后执行。

---

## 6. 议题 D：跨会话/跨群隔离 P0 验收

| ID | 场景 | 期望 | 当前失败路径 |
|---|---|---|---|
| D-01 | 私聊 A / B；新建 A 会话 | 只含 A；B 原文 0 条 | `buildSessionContext` 只按 channel（`lib/context.js:8-36`） |
| D-02 | 私聊 / 群；新建私聊会话 | 私聊不含群原文 | 同上 |
| D-03 | 群 A / B；群 A 上下文 | 只含 A；B 0 条 | `getGroupContext` fallback 只过滤 kind（`lib/index.js:287-290`） |
| D-04 | 群原文 / owner 私聊 | owner home 不含群原文，除非授权摘要 | `handover.js` 按 channel 全量且标主人（`lib/handover.js:143-152,186-196`） |
| D-05 | 新建 runtime session | 不按 channel 取历史；只按 conversation_id | `contextBuilder` 无 conversation 参数（`lib/index.js:263`） |
| D-06 | 群 history API 失败 | fallback 只同 group_id；跨群 0 条 | fallback 无 groupId 过滤 |
| D-07 | 群 A/B 全文归档；按 group_id 查询 | 只返回 A；B 0 条 | 共享 `GROUP_CWD`、无 groupId（Memory `lib/service.js:550-575`） |
| D-08 | 群 A 成员 90001 | 保留 external/speaker ID；群实体不进 speaker | prompt/buffer/群记忆只留显示名（`lib/prompt.js:75-84`、`lib/index.js:547`） |
| D-09 | 缺 conversation_id/account_id | 不注入、不建 unknown、返回错误/审计 | `keyFor` 回退 unknown；context 无 conversation 过滤 |
| D-10 | Memory digest 混 home/私聊/群/email | 只允许当前 conversation 或 Owner 授权摘要 | Memory `buildDigest` 跨渠道（Memory 报告） |
| D-11 | 跨会话长期记忆 | 需 subject/scope/purpose/来源/审计 | 当前无统一授权/审计 |
| D-12 | 摘要共享 vs 原文 | 摘要可共享；原文全文不得共享 | 当前无边界 |

**P0-A～F 映射**：P0-A 群发言者=D-08；P0-B 跨会话=D-01～D-07/D-10/D-12；P0-C self=Persona；P0-D 重复证据=Memory；P0-E 有效性=Memory；P0-F Persona timeline=Persona。

**测试要求**：每项正/负断言；负向用其他私聊/群/email 合成哨兵，断言 0 命中；缺字段断言 fail-closed/empty，不得回退全渠道；不得删除既有 562 项测试来变绿。

---

## 7. 议题 E：raw_meta 中 `self:unknown` 的版本与证据

### 7.1 同版本核对（Memory `7548e49`）

| 路径 | 事实 | 结论 |
|---|---|---|
| fresh `raw_meta` DDL | `CREATE TABLE raw_meta` 无 `speaker_id`；ALTER 只补 `raw_text/extra/cwd/person_id`（`lib/ingest/archive.js:174-185`） | **NOT_PRESENT**（fresh DB 不持久化 sentinel） |
| 旧/部分迁移 DB 有 `speaker_id` | 写入分支在列存在时 INSERT 带 `speakerId`；`getSelfId` 缺失 → `self:unknown`（`archive.js:451-479`、`lib/index.js:208-216`） | **CONFIRMED（条件路径）**：旧库有列可写 sentinel |
| 正式 `memories` | `personaSelfId()` 只判空 + `self:` 前缀，接受 `self:unknown`；`addEpisode` 写 `speakerId`（`lib/service.js:191-198,281-321`） | **CONFIRMED（代码路径）**：与 raw_meta 门禁不一致 |
| `selfid.js` 回填 | fresh 无列时回填 SELECT 失败静默 0（`lib/selfid.js:45-50`） | **VERSION_MISMATCH** |
| 生产数据污染 | 未读生产 memory.db；无同版本证据 | **NOT_CONFIRMED** |

**总体：`VERSION_MISMATCH`**。不得宣称生产 raw_meta 已被 `self:unknown` 污染；只能宣称代码路径/版本差异。修复建议：fresh DDL 加 `speaker_id`、旧库显式 ALTER、`selfId()` 严格 null、Memory 拒绝 sentinel、回填失败显式报错；本轮不实施。

---

## 8. 议题 F：旧记忆兼容（D4/D5）

### 8.1 六类“未知”必须分开

| 类型 | 字段 | 普通注入 | 重要决策 |
|---|---|---|---|
| 来源未知 | `evidence_source=unknown`, `source_id=''` | 参考，带标记 | 不得单独支撑 |
| 发言者未知 | `speaker_id=null`, `speaker_type=unknown` | 参考，带标记 | 不得归 self/owner |
| 时间未知 | `valid_from_kind=unknown` | 不进入普通 current | 不得单独支撑 |
| 事实未验证 | `verification_status=unverified` | 参考，标未验证 | 需额外证据 |
| 冲突 | `disputed` | 保留双方，不普通注入 | 不得选一方 |
| 已撤回 | `retracted` | 不注入，保留原文 | 不得使用 |

补充：`legacy`（cutover 前 NULL，created_at 近似）不是 `INVALID`；可带 `approximated` 标记回忆/参考；`unknown` 不进普通 current 注入。

### 8.2 旧记忆处理

- 原文保留；迁移不覆盖 `text`；不因缺字段整体删除/降级/猜身份。
- 历史 `historical_record` 与新独立证据分开；同 `source_id` 副本不计数；`duplicate_of` 不提升。
- 迁移四阶段：只读扫描 → 证据检索 → 候选表（不写 memories）→ 正式写入（Owner 批准、事务、审计、回滚）。
- 当前 Bridge 侧风险：群归档/交接卡/上下文仍可能跨会话；Conversation 未映射时没有 fail-closed 保证。

---

## 9. 消息 Envelope 建议（PROPOSAL）

| 字段 | 采集/产生 | 消费/保存 | 缺失行为 |
|---|---|---|---|
| `platform` | Bridge（`qq`） | Memory | fail closed |
| `account_id` | Bridge（登录账号） | Memory | fail closed（新记录） |
| `conversation_id` | Bridge（D2 格式） | Memory/Persona | fail closed；不建 unknown |
| `runtime_session_id` | Host/DSH 权威 | Memory/Persona | null；不能证明 self |
| `chat_type` | Bridge | Memory | fail closed |
| `peer_id` / `group_id` | Bridge | Memory | 私聊/群聊对应字段缺失 → fail closed |
| `external_speaker_id` | Bridge | Memory（canonical 映射） | null + `speaker_type=unknown` |
| `forwarder_id` | Bridge（forward 节点/操作者） | Memory | null；不冒充原发言者 |
| `original_author_id` | Bridge（平台能提供） | Memory | null/unknown；不冒充转发者 |
| `message_id` | Bridge | Memory（去重/溯源） | null；不可去重 |
| `timestamp` | Bridge（平台时间） | Memory | received_at + precision unknown |
| `raw_content` / `raw_content_ref` | Bridge（原文/引用） | Bridge/Memory | 原文不可丢；引用可追溯 |
| `source/evidence` | Bridge（transport/provider/raw hash/missing） | Memory（evidence 引用） | 无来源不写长期记忆 |

原则：Bridge 只声明“平台说了什么”；Memory 决定“记住什么/属于谁”；Persona 决定“self/owner 是谁”。Envelope 不包含 canonical speaker/owner/experiencer 结论。

---

## 10. 群聊发言者与 unknown 处理

当前五层退化：

1. `parse` 群分支不校验 `senderId`（`lib/parse.js:199-218`）；
2. `prompt` 只显示 `senderName`（`lib/prompt.js:75-84`）；
3. `index` buffer `speaker = senderName || contactName || senderId`，缺 sender 退化群名（`lib/index.js:547,566`；探针 `speaker-fallback='测试群'`）；
4. `group-turn-memory` 只传 `speaker` 字符串（`lib/group-turn-memory.js:92-126`）；
5. `saveGroupTranscript` 只传 `speakerName`，无 `groupId/speakerId`；Memory 角色用昵称正则 `/汐|自己/`，`person_id` 可能为空/`person:owner`（Memory `lib/service.js:550-575,566`、`lib/ingest/archive.js:271-295`）。

修复要求（PROPOSAL）：群消息必须同时保留 `group_id` + `external_speaker_id`；缺 sender → `speaker_id=null`/`speaker_type=unknown`，不用群名；转发者/原作者字段分开；群实体只出现在 group/scope；测试 T-A1～T-A6。

---

## 11. RACI 最终建议（18 项）

| # | 事项 | R | A | C | I | 唯一写入 |
|---|---|---|---|---|---|---|
| 1 | conversation_id 生成 | Channel Bridge | Channel Bridge | Persona/Memory | Owner | Channel Bridge |
| 2 | runtime session_id 生成 | Host/DSH | Host/DSH | Bridge/Persona | Memory | Host/DSH（Bridge 记录） |
| 3 | conversation↔session 映射 | Channel Bridge | Channel Bridge | Persona/Memory | Owner | Channel Bridge |
| 4 | external_speaker_id | Channel Bridge | Channel Bridge | Memory/Persona | Owner | Channel Bridge |
| 5 | canonical speaker_id | Memory | Memory | Bridge/Persona | Owner | Memory |
| 6 | speaker_id 验证 | Memory | Memory | Persona/Bridge | Owner | 无（验证）；self/owner 用 Persona 证据 |
| 7 | self ID 验证 | Persona | Persona | Memory | Bridge | Persona |
| 8 | owner ID 验证/关联 | Persona | Owner | Memory/Bridge | GPT | Persona（owner_account_link；D3 已批准） |
| 9 | third_party ID 管理 | Memory | Memory | Bridge/Persona | Owner | Memory |
| 10 | experiencer 判断 | Memory | Memory | Persona/Bridge | Owner | Memory |
| 11 | experiencer_evidence | Memory | Memory | Persona/Bridge | Owner | Memory（引用 Persona identity evidence） |
| 12 | session 绑定（拆三层） | Bridge（conversation-session）/ Persona（self）/ Memory（message） | 各层 | 其他两方 | Owner | Bridge/Persona/Memory 各写各层，禁止双写 |
| 13 | binding 验证 | Persona | Persona | Memory/Bridge | Owner | 无（只读） |
| 14 | digest（会话内） | Channel Bridge | Channel Bridge | Memory/Persona | Owner | Channel Bridge |
| 15 | 跨会话长期检索 | Memory | Memory | Persona/Bridge | Owner | 无（只读） |
| 16 | 跨会话注入 | Persona | Persona | Memory/Bridge | Owner | 无（只注入授权摘要） |
| 17 | validityState | Memory | Memory | Persona | Owner | Memory |
| 18 | 记忆补全审计 | Memory | Memory | Persona/Bridge | Owner | Memory（正式写入需 Owner 批准） |

---

## 12. 代码/Schema/测试证据

| 结论 | 证据 |
|---|---|
| `keyFor` 无 account、剥数字、unknown | `lib/sessions.js:119-124`；探针 `12a34→1234`、空→unknown |
| `channel_sessions` 无 conversation_id/version | `lib/store.js:10-23,412-466` |
| session_id 由 Bridge randomUUID | `lib/sessions.js:259,287,451,481`；`lib/store.js` |
| Host mint 接口 | DSH `@deepseek-ai/dsh-api-session-controller` `lib/index.js:267-268,511-519`；`@deepseek-ai/dsh-agent` README/`agents.create` 需 sessionId |
| 投递 source 缺字段 | `lib/message.js:10-38`；探针 source keys |
| 新会话上下文跨会话 | `lib/context.js:8-36`；`lib/index.js:263`；探针 A/B/C |
| 群 fallback 跨群 | `lib/index.js:287-290`；`lib/group-followup.js:146-159`；探针 A/B |
| 群归档共享 cwd/无 groupId | `lib/group-digest.js:61-88`；Memory `lib/service.js:550-575`、`lib/group/digest.js:2` |
| 交接卡全量/标主人 | `lib/handover.js:143-152,186-196`；`lib/store.js:293-305` |
| 群缺 sender 退化群名 | `lib/index.js:547,566`；探针 |
| `clearHandoff`/status 旧 kind | `lib/router.js:141`；`lib/store.js:406-410`；`lib/status.js:96-97` |
| raw_meta version | Memory `lib/ingest/archive.js:174-185,451-479`；`lib/service.js:191-198,281-321`；`lib/selfid.js:45-50` |
| 测试 | Bridge 562/562 @ `bffcabc`（fake transport）；Memory/Persona 引用报告 |

---

## 13. 尚未解决/依赖

1. Host `ctx.sessionController.createSession` 是否在当前 Bridge 插件上下文中可用；需要集成验证（NOT RUN）。
2. 旧 `group`/`private` 行迁移/legacy 口径；生产 2 行旧式 session。
3. owner 私聊 unified/home 的 conversation_id 与 runtime session 映射；当前不写 `channel_sessions`。
4. 多账号 `account_id` 来源（`selfId`/`get_login_info`）与多机器人部署。
5. 群成员 `external_speaker_id` 是否在所有真实 OneBot 事件中稳定；生产样本 0 空 sender，但非穷尽。
6. 群归档按 `group_id` 分区/查询的 Memory 侧实现；Bridge 只能提供事实。
7. `session_bindings` 拆表的最终 schema/迁移；Owner/Persona 决定。
8. `owner:<uuid>` 首绑/验证/更换流程；Owner/Persona 决定。
9. D4/D5 旧记忆 `legacy/unknown/approximated` 与 cutover；Memory 决定/实现。
10. `experiencer_evidence` 存储/防伪；Memory/Persona。
11. 真实渠道、生产 DB、Memory/Persona 全量测试；NOT RUN。

---

## 14. 建议的合同修改（PROPOSAL，不是批准）

1. 在合同中明确 `conversation_id` 格式、`account_id` 必填、`legacy_unmapped`、缺失 fail-closed。
2. 明确 `runtime_session_id` 由 Host/DSH mint，Bridge 只记录映射；新增 `session_producer/version`。
3. 把 `session_bindings` 拆为 `conversation_session_bindings`（Bridge）与 `persona_self_bindings`（Persona）；旧表 legacy。
4. 明确 `external_speaker_id`/`speaker_id`/`group_id`/`experiencer_id` 四层；群实体不作为 speaker。
5. 增加 Envelope 字段：account_id、conversation_id、runtime_session_id、chat_type、peer_id/group_id、external_speaker_id、forwarder_id、original_author_id、message_id、timestamp、source/evidence、raw_content_ref。
6. 增加 `legacy_unmapped`/`unknown`/`approximated` 标记与六类未知；旧原文不改。
7. 规定 P0-A～F 的验收矩阵与 fail-closed 错误码（E_CONVERSATION_MISSING、E_SPEAKER_UNKNOWN、E_EXPERIENCER_UNKNOWN、E_EVIDENCE_INVALID、E_SESSION_BINDING_CONFLICT、E_CROSS_SESSION_DENIED）。
8. 明确 owner 私聊/home 的 conversation 映射与多 owner 分区。

以上均为 PROPOSAL；需 GPT 整合、Owner 批准，本轮不冻结。

---

## 15. 禁止实施事项与后续授权

- 未修改 Bridge 源码/测试/Schema/DB/生产配置；未部署/重启；未连接真实渠道；未发送消息；未迁移 Conversation ID；未创建 Owner 关联；未写 Persona self/Memory speaker/experiencer；未冻结 v1.1.1。
- 任何实现（Conversation ID 迁移、Host session 接入、Envelope 字段、群归档分区、拆表、Owner 首绑）均需 Owner 另行明确授权，并按 D5 顺序先 P0 隔离/群发言者。
- 本报告状态 **READY_FOR_REVIEW**；不能标记合同/整体架构 PASS。

---

## 16. 最终状态

| 项 | 状态 |
|---|---|
| Channel Bridge 本轮审查 | **READY_FOR_REVIEW** |
| D1 三层关系（实现落实） | **未满足（REJECT/PARTIAL）**：未拆清；Bridge 越界写 Memory 层 |
| D2 Conversation ID / Runtime Session（实现落实） | **未满足（REJECT）**：无 account/格式/legacy/fail-closed；Bridge 自建 session |
| D3 Owner ID（实现落实） | **NOT_IMPLEMENTED** |
| D4 旧记忆（实现落实） | **PARTIAL（跨模块）** |
| D5 P0 顺序（实现落实） | **未完成（REJECT 当前）** |
| 合同 v1.1.1 | **DRAFT / NOT FROZEN** |
| Memory v6 / Persona v3 / EI-2A | **NOT_STARTED** |
