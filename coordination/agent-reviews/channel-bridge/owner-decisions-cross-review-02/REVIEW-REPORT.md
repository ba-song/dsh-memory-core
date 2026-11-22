# Channel Bridge 交叉审查报告

- 任务：`OWNER-DECISIONS-INTERFACE-CROSS-REVIEW-02`
- 角色：Channel Bridge 渠道接入与会话桥接专项负责人
- 性质：只读架构审查、跨模块交叉复核、接口方案协调；不修改业务源码/测试/schema/数据库/生产配置；不连接真实 QQ/NapCat；不发送消息；不部署/重启；不启动 Memory v6 / Persona v3 / EI-2A。
- 状态：**READY_FOR_REVIEW**
- 联合契约：**BLOCKED / NOT FROZEN**
- 本轮不标记任何 PASS；本报告不构成实施、迁移或生产授权。
- 生成时间：2026-11-22（Asia/Shanghai）

---

## 0. 一句话结论

七项 Owner Decisions 的原则必须作为最高依据；当前 Channel Bridge 能提供平台事实和事实上的会话映射，但不能单独完成 canonical 人物身份、Owner 身份验证或 Persona self 绑定。建议把当前混在一起的 `session_bindings` 拆成：

1. **Channel Bridge 唯一写**：`conversation_id ↔ runtime_session_id` 映射（平台会话事实）；
2. **Persona 唯一写**：`runtime_session_id ↔ Persona self / 已验证主体` 绑定（身份事实）；
3. **Memory 唯一写**：每条消息的 `external_speaker_id → speaker_id` 映射、`experiencer_*` 与证据（记忆事实）。

这三件事不能共用一张表、不能由两个模块双写。Persona 报告建议“Channel Bridge 成为 session_bindings 唯一写入方”，本报告 **REJECT / MODIFY**：Bridge 没有 canonical self/persona 的验证权，不能写身份绑定；Bridge 应写会话映射，Persona 写身份绑定。

---

## 1. 基线

### 1.1 必读报告与代码基线

| 对象 | 分支/commit | tree | 说明 |
|---|---|---|---|
| Channel Bridge 报告（任务指定基线） | `5192f146bdace0bc0279da06f5cff3de6a1750fe` | `e639f695b251ce8a457c0a4f1bcb5aa20f8cd79c` | 本报告以该 commit 为基线；本会话后续 commit `37d4852609a1f40fbf569955001662839354bb0f` 仅作为补充证据，不替代基线 |
| Channel Bridge 代码 | `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` | `b0ed3ff989905be4b16d3a1579d16695f772389c` | `ba-song/dsh-channel-bridge` main，0.18.0 |
| Persona 报告 | `3e9836334f07a78abc8522afbca8de2870d9feaf` | `5979f9a8d41e6fb3000c50f0f0dd001e6df0a36a` | 任务指定基线 |
| Persona 代码 | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90` | `ec05b3dec856f976881b6e6365188b9d92377ce9` | main |
| Memory 报告 | `6136b8e0b5dbb342d1387a0df724b4bbb8339c94` | `6ad7d5d676fab3f4378f04d4d2caf4d52ce4f5a0` | 任务指定基线 |
| Memory 代码 | `7548e49ed0b8d8673818464325d8e72ec7704b27` | `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f` | `feat/m1-preference-memory` |
| Memory 联合接口提案 | `6136b8e0b5dbb342d1387a0df724b4bbb8339c94` | 同上 | `coordination/contracts/DSHA-MEMORY-PERSONA-CHANNEL-INTERFACE-PROPOSAL-01-DRAFT.md` |
| 联合合同草案 | `006bb5bfce5d031b49a60271fe0406b228b43e00` | `b460823bad5ce250d3360db8e59871a024335e6f` | blob `10a62b64dff6219d00a1e25be09a39ddccb50e1a` |

### 1.2 已读文档

- Channel Bridge 报告 `5192f146...` 全文；
- Persona 报告 `3e983633...` 全文；
- Memory 报告 `6136b8e...` 全文；
- Memory 联合接口提案 `6136b8e...` 全文；
- 联合合同草案 `006bb5b...` 全文（323 行）；
- Channel Bridge main 源码：`lib/parse.js`、`message.js`、`sessions.js`、`store.js`、`context.js`、`router.js`、`prompt.js`、`index.js`、`unified.js`、`handover.js`、`group-buckets.js`、`group-followup.js`、`group-turn-memory.js`、`group-digest.js`、`forward.js`、`quote.js`、`notice.js`、`tools.js`、`config.js`、`status.js`；
- Memory 关键代码：`lib/service.js`、`lib/ingest/archive.js`、`lib/store/schema.js`、`lib/inject/*`、`lib/pref/merge.js`；
- Persona 关键代码：`lib/service.js`、`lib/bindings.js`、`lib/self.js`、`lib/emotion.js`、`lib/db.js`、`lib/scope.js`、`lib/inject.js`。

### 1.3 测试与证据边界

| 证据 | 结果 |
|---|---|
| Channel Bridge `npm test` @ `bffcabc` | **562/562 pass / 0 fail / 0 skip，exit 0**（fake transport；本会话在同一 HEAD 只读 clone 复跑） |
| Memory R2 报告 @ `7548e49` | 258/258 pass（引用 Memory R2；本轮未重跑） |
| Persona 报告 @ `a84c7ba` | 303/303 pass（引用 Persona 报告；本轮未重跑） |
| 生产 Bridge profile | `enabled:true`、`unified:true`、`mode:send`、`group.social:true`（只读核查） |
| 生产 Bridge DB | 聚合只读；sessions 5（`group:<gid>` 2、`private:<qq>` 1、旧式 `group`/`private` 2）（只读快照） |
| 真实 QQ/NapCat/生产 DB 写 | **NOT RUN** |

测试通过只证明该 HEAD 未回归，不证明契约 v1.1.1 合规。

---

## 2. 七项 Owner Decisions 落实情况

| 决策 | 当前实现事实 | 状态 | 本报告建议 |
|---|---|---|---|
| **D1 主人身份** | 只有 `owner.qqIds` 白名单和 `person:owner` 占位；无独立 Owner ID、首次绑定、验证、更换流程；QQ 号仍可被当 owner 判定 | **NOT_IMPLEMENTED** | canonical `owner:<uuid>`（PROPOSAL）；平台账号只通过显式 `owner_account_link` 关联；绝不把 QQ 号/昵称/头像当 Owner ID |
| **D2 主人记忆** | Memory 无 `evidence_source/verification_status/confidence_level`；只有 numeric `confidence`；无“陈述/观察/推断”三分 | **REJECT / NOT_IMPLEMENTED** | 由 Memory 实现三维；Channel Bridge 只提供平台事实；推断不得写 direct_statement |
| **D3 跨平台身份关联** | 无疑似账号发现、无 pending 关联、无主人询问/明确同意记录；无自动合并代码 | **NOT_IMPLEMENTED** | 新增 `owner_account_link`（pending/confirmed/rejected）；Bridge 只提供平台账号事实；Persona/Owner gate 唯一写；无明确同意不得关联 |
| **D4 会话隔离** | Bridge 有分房 key；但新会话上下文、群 fallback、群归档、交接卡有跨会话路径；Memory digest 有跨会话路径 | **REJECT（当前）** | 见 §5 P0 矩阵；所有上下文/摘要/归档按 `conversation_id`/`group_id` 精确过滤 |
| **D5 旧记忆保护** | 原始文本保留；但无 `legacy/unknown/approximated` 标记、无 cutover；旧记录缺字段仍可能被普通注入 | **PARTIAL** | 原文不覆盖；旧记录标 legacy/unknown；缺字段不等于失效；迁移只读扫描→候选→审核→正式 |
| **D6 模块职责** | Bridge 管平台事实/会话映射；Persona 管 self；Memory 管记忆；但 Bridge 直写群记忆、Persona `inject.writeBinding` 隐式写绑定，边界未闭合 | **PARTIAL** | 按 §3 B 拆表；Bridge 不写 Persona/Memory 身份事实；Persona 不写会话映射；Memory 不写 binding |
| **D7 记忆迁移** | 无迁移执行；无扫描/候选/审核/回滚实现 | **NOT_STARTED** | 四阶段：只读扫描→证据→候选→正式（Owner 批准）；单事务、审计、回滚 |

---

## 3. 议题 A：平台发言者 ID 与内部人物 ID

### 3.1 四个概念必须分开

| 概念 | 含义 | 产生方 | 保存方 | 能否当身份主键 |
|---|---|---|---|---|
| `external_speaker_id` | 平台原始发言者 ID（QQ `user_id`） | Channel Bridge | Channel Bridge 原始事件/证据；Memory 可存引用 | 否（只是平台事实） |
| `speaker_id` | 系统内部规范化人物 ID（`person:contact:<platform>:<id>`；self 为 `self:<uuid>`；owner 为 `owner:<uuid>`） | Memory（people/contact 映射）；self/owner 由 Persona 验证 | Memory | 是（canonical） |
| `group_id` | 群聊实体 ID（QQ 群号） | Channel Bridge | Bridge + Memory（群实体 `person:contact:qq:group:<gid>` 作 scope/实体） | 否（群实体不是成员） |
| `experiencer_id` | 记忆描述/归属的经历主体 | Memory（基于 speaker/persona/证据） | Memory | 是（经历主体，不等于 speaker） |

### 3.2 七个问题的回答

1. **谁产生原始平台 ID？** Channel Bridge。`parseMessageEvent` 保留 `senderId`、`contactId`、`messageId`；群 `contactId=group_id`、`senderId=user_id`（`lib/parse.js:160-220`）。Bridge 必须把 `external_speaker_id` 作为原始事实输出，不做 canonical 化。
2. **谁把平台 ID 关联到内部人物？** Memory（people/contacts）。Bridge 只提供 `external_speaker_id` + `speaker_evidence`；Persona 只验证 self/owner 的 canonical 身份，不接管第三方人物映射。**Memory 报告的 RACI 把 `speaker_id` 生成给 Channel Bridge，本报告 MODIFY：Bridge 生成 external，Memory 生成 canonical。**
3. **谁保存身份关联证据？** 分层：
   - Bridge：`speaker_evidence`（原始 sender 字段、来源、缺失字段、置信）在 channel event/envelope；
   - Persona：`identity_evidence`（self/owner 的 canonical 断言、会话/时间/来源）；
   - Memory：`memory_evidence`（canonical `speaker_id` 映射、experiencer、三维证据）；
   - 三处都写会重复，必须用 ID 引用，不复制同一证据为多份独立证据。
4. **群聊中如何区分群实体、实际发言者、转发者、原始作者？**
   - 群实体：`group_id` / `person:contact:qq:group:<gid>`，只作 scope/实体；
   - 实际发言者：`external_speaker_id` / `speaker_id`（成员）；
   - 转发者：`forwarder_external_id`（当前 forward 节点有 `senderId`，但渲染只显示名字；需保留结构字段）；
   - 原始作者：`original_author_external_id`（平台能提供时；不能提供则 `unknown`）；
   - 引用：`quote.sender_id`；
   - 系统通知：`actor_id`/`operator_id`/`target_id` 分开，不能统一塞进 `senderId`。
5. **发言者 ID 缺失时如何处理？** `external_speaker_id=null`、`speaker_id=null`、`speaker_type=unknown`；保留原始事件与 `missing_fields=['sender_id']`；群消息可存档但不得用于 self/owner 归属；不得用群名/群号/昵称代替。
6. **如何防止群昵称/群名被当人物 ID？** 显示名只进 `display_name_snapshot`/`card_snapshot`；所有 ID 字段必须是平台数字 ID 或 canonical ID；代码/测试禁止 `senderName || contactName` 作为 speaker ID；P0-A 测试覆盖。
7. **如何执行 D3 主人疑似发现/询问/明确授权？**
   - Bridge 只产生候选事实：`platform`、`account_id`、`external_account_id`、来源、时间、证据；
   - Memory/Persona 的候选表记录 `status=pending`，不改 `owner_id`；
   - 汐可主动询问主人；只有主人明确同意（`confirmed`）才写 `owner_account_link`；
   - 无回复/模糊/无法确认 → `pending`/`rejected`，不构成授权；
   - 禁止用昵称、头像、表达习惯、相似行为自动合并；
   - 保留来源、时间、确认方式、授权依据、确认人/渠道。

### 3.3 Owner ID / 账号关联候选设计（PROPOSAL）

```text
owner_identity(
  owner_id            -- canonical owner:<uuid>，永久
  status              -- active / retired
  created_at
  created_by          -- 首次绑定的受信入口
  evidence            -- 创建依据（不含平台账号作为主键）
  version
)

owner_account_link(
  link_id
  owner_id            -- owner:<uuid>
  platform            -- qq / email / ...
  account_id          -- 平台账号 ID（external）
  status              -- pending / confirmed / rejected / revoked
  evidence            -- 发现依据（来源/时间/原始账号信息）
  consent             -- 主人明确同意的记录（who/when/how/what）
  confirmed_by
  created_at
  updated_at
  revoked_at
)
```

唯一写入建议：

- `owner_identity`：Persona（身份域）唯一写，Owner 决策 A；
- `owner_account_link`：Persona（身份域）唯一写，Owner 明确同意后才 `confirmed`；
- Memory 只保存 `owner_id` 引用与记忆证据，不写 link/identity；
- Channel Bridge 只提供 `platform/account_id` 事实，不写 link。

> 该设计与 Memory 报告“owner 映射归 Memory”的建议存在分歧；本报告建议 **Owner ID/link 属身份域，归 Persona；Memory 只存 owner_id 引用**。需 Owner 裁决。

### 3.4 交叉审查评级

| 来源 | 提案 | 评级 | 理由 |
|---|---|---|---|
| Memory 报告 | `speaker_id` 生成归 Channel Bridge | **MODIFY** | Bridge 只能生成 `external_speaker_id`；canonical `speaker_id` 必须由 Memory 的 people/contacts 映射生成 |
| Persona 报告 | `speaker_id` 生成归 Channel Bridge | **MODIFY** | 同上；Persona 只验证 self/owner |
| Memory/Persona | 群实体 `person:contact:qq:group:<gid>` 属 third_party、非成员 | **ACCEPT** | 与 D6 和契约一致 |
| Persona 报告 | `experiencer=self/owner` 由 Persona 判断 | **MODIFY** | Persona 提供 canonical self/owner 证据；`experiencer` 落库/最终判断归 Memory |
| Owner D3 | 不自动合并、必须明确同意 | **OWNER_DECISION_FIXED** | 不重新讨论；技术方案按上表 |
| Owner D1 | Owner ID 独立、永久 | **OWNER_DECISION_FIXED** | 格式 `owner:<uuid>` 为 PROPOSAL，不改变原则 |

---

## 4. 议题 B：session_bindings 的唯一写入责任

### 4.1 三种关系必须拆开

| 关系 | 内容 | 唯一写入方 | 存储建议 |
|---|---|---|---|
| 1 | `conversation_id ↔ runtime_session_id` | **Channel Bridge** | `channel_conversation_sessions`（Bridge DB）：conversation_id、session_id、account_id、chat_type、peer_id/group_id、status、created_at、rotated_at、prev_session_id |
| 2 | `runtime_session_id ↔ Persona self / 已验证主体` | **Persona** | `persona_session_identity`（Persona DB）：session_id、persona_id/self_id、subject_type、subject_id、evidence_id、status、issued_at、expires_at、version |
| 3 | `runtime_session_id ↔ 当前消息主体` | **Memory（每条消息）** | `memories`/`raw_meta`：speaker_external_id、speaker_id、experiencer_type/id、conversation_id、session_id、evidence_id；不是 session binding 表 |

### 4.2 八个问题的回答

1. **`session_bindings` 是否继续作为共享表？** **NO（建议拆分）**。当前表把 `session_id → persona_id/role/cwd/source` 混在一起，无法表达 conversation、subject、evidence、lifecycle。保留旧表只读兼容，新建两层表/接口。
2. **谁是唯一写入者？** 关系 1 = Channel Bridge；关系 2 = Persona；关系 3 = Memory（每条消息，不是 binding）。没有任何一张表由两个模块双写。
3. **Persona 是否只负责读取和验证？** 对关系 1 是；对关系 2 不是——Persona 是唯一写入者（验证 self/persona 后写绑定）。Persona 不再通过 `inject.writeBinding` 隐式写主体；改为显式 `bindSessionIdentity` API。
4. **Channel Bridge 是否有足够事实依据写主体绑定？** **NO**。Bridge 有平台 `sender_id`、`chat_type`、`conversation_id`、`session_id`，但没有 canonical `persona_id`/`selfId`，不能验证 `persona_id===selfId`；写主体绑定会把平台事实误当身份事实。Bridge 只写关系 1。
5. **Persona 自身 self/persona 绑定是否应与聊天会话映射分开？** **YES**。self/persona 是身份域；conversation/session 是渠道会话域；两者生命周期、写入方、证据不同。
6. **是否需要拆两张表/两种接口？** **YES**：
   - `channel_conversation_sessions`（Bridge）；
   - `persona_session_identity`（Persona）；
   - 旧 `session_bindings` → legacy 只读，逐步迁移/退役。
7. **如何避免双写和数据冲突？** 唯一写入方 + 外键/引用 + 不允许跨模块 UPDATE；Bridge 不写 Persona DB；Persona 不写 Bridge DB；Memory 不写两者；冲突时 `unknown` + 审计，不自动选一方。
8. **历史 binding 缺少主体证据？** 标 `legacy_unclassified`/`unknown`；旧 `persona_id===selfId` 且 active 只能证明“该 session 曾绑定该 persona”的弱事实，不能证明当前消息主体；不得据此写 self/owner episode；需新证据或 Owner 确认。

### 4.3 RACI（本议题）

| 事项 | R | A | C | I | 唯一写入 |
|---|---|---|---|---|---|
| conversation↔session 映射 | Channel Bridge | Channel Bridge | Persona/Memory | Owner | Channel Bridge |
| runtime session_id 生成 | Host/DSH | Host/DSH | Bridge/Persona | Memory | Host/DSH（Bridge 记录） |
| self/persona 绑定 | Persona | Persona | Memory/Bridge | Owner | Persona |
| 绑定验证 | Persona | Persona | Memory/Bridge | Owner | 无（只读） |
| 每条消息 speaker/experiencer | Memory | Memory | Bridge/Persona | Owner | Memory |
| 旧 binding 兼容 | Persona | Persona | Memory/Bridge | Owner | Persona（legacy 标记） |

### 4.4 交叉审查评级

| 来源 | 提案 | 评级 | 理由 |
|---|---|---|---|
| Persona 报告 | Channel Bridge 成为 `session_bindings` 唯一写入方 | **REJECT / MODIFY** | 违反 D6：Bridge 无 canonical self/persona 验证权；改为 Bridge 写会话映射、Persona 写身份绑定 |
| Persona 报告 | Persona 只读验证、停止 `inject.writeBinding` | **MODIFY** | 方向对（退役隐式写入），但 Persona 仍需作为关系 2 的唯一写入者，不是纯只读 |
| Memory 报告 | `session_bindings` 写入方 PENDING | **MODIFY** | 不是二选一；拆成两表，Bridge/Persona 各写各的 |
| 当前 Persona 实现 | `inject.writeBinding` 隐式写 | **MODIFY** | 改为显式、可审计、带 evidence 的 `bindSessionIdentity`；旧路径退役 |
| Channel Bridge 报告（基线） | 建议 Persona 写 binding | **ACCEPT** | 与 D6 一致；补充拆分表和唯一写入细节 |

---

## 5. 议题 C：conversation_id 与 runtime_session_id

### 5.1 最终推荐字段与格式（PROPOSAL）

| 字段 | 建议 |
|---|---|
| `conversation_id` | `conv:qq:<account_id>:private:<peer_id>` / `conv:qq:<account_id>:group:<gid>` |
| `account_id` | **必须**；接收消息的机器人/账号 ID |
| `chat_type` | `private` / `group` |
| `peer_id` | 私聊对方平台 ID |
| `group_id` | 群号（群聊） |
| `runtime_session_id` | 宿主/DSH 运行期 UUID |
| `conversation_identity_version` | `conv-v1`（候选） |

示例：

```text
conv:qq:10001:private:20002
conv:qq:10001:group:30003
```

### 5.2 八个问题的回答

1. **是否由 Channel Bridge 生成稳定 `conversation_id`？** **YES**。D6 把会话身份/映射给 Bridge；Bridge 从平台事实派生，不猜。
2. **runtime `session_id` 继续由 Bridge/宿主？** 建议 **Host/DSH 生成**，Bridge 记录映射；当前 Bridge `randomUUID()` 是实现事实，不是最终契约。若宿主 API 要求调用方提供，Bridge 可生成但必须标 `runtime_session_id`，不得当稳定 conversation。
3. **是否采用平台+账号+聊天类型+对方/群 ID？** **YES**；格式见上，含 `account_id`。
4. **`account_id` 是否必须纳入？** **YES**；否则同一群在不同机器人账号下会错误合并，违反会话隔离。
5. **同一 QQ 群在不同机器人账号下是否不同 conversation？** **YES**；`account_id` 不同 → conversation 不同。
6. **旧式 `group`/`private` session 行？** 保留为 `legacy_unmapped`；不推断具体群/QQ；只读兼容；不用于新上下文；`forceRotate` 必须精确 key，禁止按 kind 选最新。
7. **缺少 account_id/群 ID/对方 ID 如何安全降级？** 新消息：缺 `group_id`（群）/`peer_id`（私聊）/`account_id` → **fail-closed**，拒绝投递/写入，记 `E_CONVERSATION_MISSING`；不得建 `unknown` conversation，不得按 channel 取历史。
8. **新旧 ID 如何兼容？** 保留 `(channel, kind)` 旧 key 只读；新增 `conversation_id` 列/映射表；双读期新字段优先，缺失只能 unknown；迁移只对 account_id 已知且无歧义的行生成；不覆盖旧行；Owner 批准后执行。

### 5.3 生成/持久化/验证/迁移

| 动作 | 责任 |
|---|---|
| 生成 `conversation_id` | Channel Bridge |
| 生成 `runtime_session_id` | Host/DSH（Bridge 记录；当前 Bridge 代生成，需改） |
| 持久化映射 | Channel Bridge `channel_conversation_sessions` |
| 验证格式/冲突 | Channel Bridge（格式/唯一性）；Persona 验证 session 绑定；Memory 验证引用 |
| 旧 ID 迁移 | Channel Bridge 只读扫描 → 候选 → Owner 批准；不覆盖 |

### 5.4 交叉审查评级

| 来源 | 提案 | 评级 | 理由 |
|---|---|---|---|
| Memory 报告 | conversation_id 由 Channel Bridge 生成，格式含 platform/account/chat_type/peer/group | **ACCEPT** | 与 D6 一致；本报告采用 `conv:` 前缀 |
| Persona 报告 | conversation_id 由 Channel Bridge，长期 key 提升 | **ACCEPT** | 同上 |
| Memory 报告 | runtime session_id 由 Channel Bridge/宿主 | **MODIFY** | 建议 Host/DSH 权威生成；Bridge 记录；当前 Bridge 代生成需登记为过渡 |
| Persona 报告 | runtime session_id 当前 Bridge 生成 | **MODIFY** | 现状不是最终契约；改为 Host/DSH |
| Memory/Persona | 旧 `group`/`private` 行保留 | **ACCEPT** | 不猜、不迁移、legacy 只读 |

---

## 6. 议题 D：跨会话/跨群隔离 P0 验收矩阵

### 6.1 统一验收矩阵

| ID | 场景 | 期望 | 当前已知失败路径 |
|---|---|---|---|
| D-01 | 私聊 A / 私聊 B 各一条；新建 A 会话 | A 上下文只含 A；B 原文 0 条 | `buildSessionContext` 按 channel 全量（`lib/context.js:8-36`） |
| D-02 | 私聊 / 群各一条；新建私聊会话 | 私聊上下文不含群原文 | 同上 |
| D-03 | 群 A / 群 B 各一条；群 A 请求上下文 | 只含群 A；群 B 原文 0 条 | `getGroupContext` fallback 只过滤 kind（`lib/index.js:287-290`） |
| D-04 | 群原文 / owner 私聊；owner home 新建 | owner home 不含群原文，除非显式授权摘要 | `handover.js` 按 channel 全量且标主人（`lib/handover.js:143-152,186-196`） |
| D-05 | 新建 runtime session | 不按 channel 取其他会话历史；只按 conversation_id | `contextBuilder` 调用不带 conversation（`lib/index.js:263`） |
| D-06 | 群 history API 失败，fallback | 只返回同 group_id；跨群 0 条 | fallback 无 groupId 过滤 |
| D-07 | 群 A/B 全文归档；按 group_id 查询 | 只返回 A；B 0 条 | 共享 `GROUP_CWD`、无 groupId（Memory `lib/service.js:550-575`） |
| D-08 | 群 A 成员 90001 发言 | 保留 `external_speaker_id=90001`、`speaker_id` 成员；群实体不进 speaker | prompt/buffer/群记忆只留显示名（`lib/prompt.js:75-84`、`lib/index.js:547`） |
| D-09 | 缺 conversation_id / account_id | 不注入、不建 unknown、返回错误/审计；不得按 channel 兜底 | `keyFor` 回退 unknown；context 无 conversation 过滤 |
| D-10 | Memory digest 合入 home/私聊/群/email | 只允许当前 conversation 或 Owner 授权摘要；未授权原文 0 条 | Memory `buildDigest` 跨渠道（Memory R2 §6/§11） |
| D-11 | 跨会话长期记忆检索 | 必须带 subject/scope/purpose/来源；审计；无权限拒绝 | 当前无统一授权/审计 |
| D-12 | 摘要共享 vs 原文共享 | 摘要可共享（带来源/授权）；原文全文不得共享 | 当前无摘要/原文边界 |

### 6.1.1 与 P0-A～P0-F 的映射

| Owner/P0 | 本报告落点 |
|---|---|
| P0-A 群成员 speaker 错误归属 | D-08；§3.2；§6.1 D-08 |
| P0-B digest/上下文跨会话原文注入 | D-01～D-07、D-10、D-12；§6.1 |
| P0-C self 身份门禁 | 议题 E；§9 第 7/9 项；Persona 报告 |
| P0-D 重复证据提升 | §8.1、§9 第 11 项；Memory 报告 |
| P0-E 有效性泄漏 | §8.1、§9 第 5/17 项；Memory 报告 |
| P0-F Persona timeline/事务 | §9 第 10 项；Persona 报告 |

### 6.2 正向/负向测试要求

- 每个用例同时断言“应包含”和“不得包含”；仅断言包含不够。
- 负向测试必须用其他私聊/群/email 的合成文本作为哨兵，断言 0 命中。
- 不允许删除既有测试来变绿；Bridge `npm test` 562 项只能作为回归底线。
- 缺 `conversation_id`/`group_id` 的用例必须断言 fail-closed/empty，不得断言“回退全渠道”。
- Memory digest 测试需覆盖 home + 两个私聊 + 两个群 + email；仅 Owner 明确授权的摘要可见。
- 跨会话长期记忆测试需覆盖未授权、授权、撤回、审计四态。

### 6.3 当前结论

D-01～D-04、D-06、D-07、D-10 在代码层存在明确失败路径；D-05/D-09 缺少 conversation 参数；D-08 成员 ID 在 Bridge 内部有、下游丢失；D-11/D-12 未实现。**P0 未闭合，不能冻结契约。**

---

## 7. 议题 E：raw_meta 中 `self:unknown` 的版本与证据差异

### 7.1 同版本核对（Memory `7548e49`）

| 路径 | 代码事实 | 结论 |
|---|---|---|
| fresh `raw_meta` DDL | `CREATE TABLE raw_meta` 无 `speaker_id`；`ALTER` 只补 `raw_text/extra/cwd/person_id`（`lib/ingest/archive.js:174-185`） | **NOT_PRESENT**（fresh DB 不持久化 `self:unknown`） |
| 旧 DB 有 `speaker_id` 列 | 写入分支 `this.cols.rawMeta.has('speaker_id')` 时 INSERT 带 `speakerId`；`getSelfId` 缺失时 `speakerId='self:unknown'`（`archive.js:451-479`、`lib/index.js:208-216`） | **CONFIRMED（条件路径）**：旧库有列时可写入 sentinel；非 fresh |
| 正式 `memories` | `personaSelfId()` 只判空 + `self:` 前缀，接受 `self:unknown`；`addEpisode` 写 `speakerId=selfId`（`lib/service.js:191-198,281-321`） | **CONFIRMED（代码路径）**：Memory 报告临时库 probe 已写入；与 raw_meta 门禁不一致 |
| `selfid.js` 回填 | `SELECT ... WHERE speaker_id=?`，fresh 无列时 `try/catch` 返回 []，静默 0（`lib/selfid.js:45-50`） | **VERSION_MISMATCH**：离线迁移脚本建列，fresh DDL 不建 |
| 生产数据是否已污染 | 未读生产 memory.db；无同版本生产证据 | **NOT_CONFIRMED** |

### 7.2 最终标签

- fresh DB raw_meta：`NOT_PRESENT`
- 旧 DB（有 speaker_id 列）raw_meta：`CONFIRMED` 代码路径可写 `self:unknown`，但无生产数据证据
- 正式 memories：`CONFIRMED` 代码路径接受 sentinel（需修复）
- 生产数据污染：`NOT_CONFIRMED`
- 总体：**`VERSION_MISMATCH`**（DDL / 写入路径 / 离线迁移 / memories 门禁不一致）

不得宣称“生产 raw_meta 已被 self:unknown 污染”；只能宣称代码路径和版本差异。修复方案：fresh DDL 加 `speaker_id`、旧库显式 ALTER、`selfId()` 严格 null、Memory 拒绝 sentinel、回填失败显式报错；本轮只设计，不实施。

### 7.3 交叉审查评级

| 来源 | 提案/说法 | 评级 | 理由 |
|---|---|---|---|
| Memory 报告 | fresh raw_meta 无 speaker_id | **ACCEPT** | 与 DDL 一致 |
| Grok 说法 | 生产 raw_meta 可能已写 `self:unknown` | **PENDING_EVIDENCE / NOT_CONFIRMED** | 无同版本生产 DB 证据；不能当事实 |
| Memory 报告 | `memories` 接受 sentinel | **ACCEPT** | 代码路径确认；需修复 |
| 本报告 | 版本差异 | **VERSION_MISMATCH** | 不是单一 CONFIRMED/NOT_PRESENT |

---

## 8. 议题 F：旧记忆兼容性

### 8.1 六类“不确定”必须分开

| 类型 | 字段/状态 | 当前普通注入 | 重要决策 | 处理 |
|---|---|---|---|---|
| 来源未知 | `evidence_source=unknown`, `source_id=''` | 可回忆/参考，带标记 | 不得单独支撑 | 保留原文，标 unknown |
| 发言者未知 | `speaker_id=null`, `speaker_type=unknown` | 可参考，带标记 | 不得归 self/owner | 保留原文，不猜 |
| 时间未知 | `valid_from_kind=unknown`, `valid_from=null` | 不进普通 current 注入；reference 可用 | 不得单独支撑 | 标 unknown/approximated |
| 事实未验证 | `verification_status=unverified`, `confidence_level=unknown` | 可参考，带“未验证” | 不得单独支撑 | 三维字段 |
| 冲突 | `verification_status=disputed` | 不普通注入；保留双方 | 不得选一方 | 冲突关系，不删除 |
| 已撤回 | `verification_status=retracted` | 不普通注入；显示“已撤回” | 不得使用 | 原文保留，纠正关系 |

补充：`valid_from_kind='legacy'` 不是“无效”；旧记录可用 `created_at_epoch` 作近似下限并标 `approximated`，可在带不确定性标记的回忆/参考中使用；不得无下限注入。

### 8.2 旧记忆处理原则

- 原始文本永久保留；迁移不覆盖正文；不因缺字段整体删除/废弃/统一降级。
- 旧记录缺字段 → `unknown/legacy`，不是 `INVALID`；可回忆、可参考、可带标记注入；重要决策需额外证据。
- 区分“历史记录”（`historical_record`）与“独立新证据”：同一原文的副本/转述/摘要不算新证据；`source_id`/hash 去重。
- 同源重复：`duplicate_of`，不提升 `verification_status/confidence_level`；独立来源才 `corroborates`。
- 迁移四阶段：只读扫描 → 证据检索 → 候选生成（不写 memories）→ 正式写入（Owner 批准、事务、审计、回滚）；不覆盖原文。

### 8.3 交叉审查评级

| 来源 | 提案 | 评级 | 理由 |
|---|---|---|---|
| Memory 报告 | `validityState` 单一 unknown | **MODIFY** | 必须拆六类；unknown 不等于所有情况同一处理 |
| Persona 报告 | 旧记录标 legacy/unknown、保留可回忆 | **ACCEPT** | 与 D5 一致 |
| Owner D5 | 旧记忆保留、缺字段标未知、不整体降级 | **OWNER_DECISION_FIXED** | 不重新讨论 |
| Memory 报告 | 迁移只按证据回填 | **ACCEPT** | 与 D7 一致 |

---

## 9. 其他未决技术事项（专家建议）

| # | 事项 | 建议 |
|---|---|---|
| 1 | Owner ID 格式/首次建立/验证/更换 | `owner:<uuid>`（PROPOSAL）；首次由 Owner 在本地受信入口显式创建；验证需 Owner 确认；更换追加历史，不覆盖旧 ID；`person:owner` 仅 legacy 别名 |
| 2 | 主人身份关联授权记录 | `owner_account_link`：platform/account_id/status/evidence/consent/confirmed_by/created_at/revoked_at；Only Owner 明确同意可 `confirmed` |
| 3 | `role_only` | 只作展示/上下文，不作稳定 ID；不写 `speaker_id/experiencer_id/owner_id/self_id`；无法稳定识别时 `unknown` |
| 4 | `experiencer_evidence` | Bridge 产生平台事实；Persona 产生 self/owner 身份证据；Memory 验证结构并保存 write-once `memory_evidence`；三方用 ID 引用，不复制 |
| 5 | `valid_from_kind`/legacy | exact/implicit/legacy/unknown；legacy 以 created_at 近似并标 approximated；unknown 不进普通 current 注入 |
| 6 | cutover | Owner 决定版本+时间；旧记录 legacy；新记录完整字段；迁移只读扫描→候选→Owner 批准；不自行设日期 |
| 7 | `selfId()` null 协议 | 合法 `self:<uuid>` 或 null；DB 不可用/缺失/多 active/非法 → null/错误；不返回 `self:unknown`；`ensureSelf` 不自动创建 |
| 8 | `identityOf()` | 输入 session_id/conversation_id/chat_type/peer/group + self/binding；输出 `{ok,valid,self_id,subject_type/id,id_strength,reason}`；多来源冲突→unknown |
| 9 | `bindingOf()` | 必须 `bound && persona_id===selfId && status=active && not expired && conversation 匹配`；否则 unknown/错误 |
| 10 | Persona timeline/事务 | timeline 写 `self_id`，去空 catch；event/appraisal/episode 单事务；失败回滚；测试 1/1/1 与 0/0/0 |
| 11 | 重复证据 | `source_id` 唯一；同源 `duplicate_of` 不提升；独立来源才 corroborate；Memory merge 不得 `confidence+0.02` |
| 12 | 自主补全四阶段 | 只读扫描 → 证据检索 → 候选表（不写 memories）→ 正式写入（Owner 授权、事务、审计、回滚）；不覆盖原文 |

---

## 10. 最终 RACI 建议（18 项）

> R=执行，A=最终负责，C=咨询，I=知会；每行一个唯一写入方；`*` 表示需 Owner 批准/技术方案待定。

| # | 事项 | R | A | C | I | 唯一写入 |
|---|---|---|---|---|---|---|
| 1 | conversation_id 生成 | Channel Bridge | Channel Bridge | Persona/Memory | Owner | Channel Bridge |
| 2 | runtime session_id 生成 | Host/DSH | Host/DSH | Bridge/Persona | Memory | Host/DSH（Bridge 记录） |
| 3 | conversation↔session 映射 | Channel Bridge | Channel Bridge | Persona/Memory | Owner | Channel Bridge |
| 4 | external_speaker_id | Channel Bridge | Channel Bridge | Memory/Persona | Owner | Channel Bridge |
| 5 | canonical speaker_id | Memory | Memory | Bridge/Persona | Owner | Memory |
| 6 | speaker_id 验证 | Memory | Memory | Persona/Bridge | Owner | 无（验证）；self/owner 用 Persona 证据 |
| 7 | self ID 验证 | Persona | Persona | Memory | Bridge | Persona（identity evidence） |
| 8 | owner ID 验证/关联 | Persona | Owner（D1） | Memory/Bridge | GPT | Persona（owner_account_link；D1 前不写） |
| 9 | third_party ID 管理 | Memory | Memory | Bridge/Persona | Owner | Memory |
| 10 | experiencer 判断 | Memory | Memory | Persona/Bridge | Owner | Memory |
| 11 | experiencer_evidence | Memory | Memory | Persona/Bridge | Owner | Memory（引用 Persona identity evidence） |
| 12 | session 身份绑定 | Persona | Persona | Bridge/Memory | Owner | Persona |
| 13 | binding 验证 | Persona | Persona | Memory/Bridge | Owner | 无（只读） |
| 14 | digest 构建（会话内） | Channel Bridge | Channel Bridge | Memory/Persona | Owner | Channel Bridge |
| 15 | 跨会话长期检索 | Memory | Memory | Persona/Bridge | Owner | 无（只读）；Memory 负责过滤 |
| 16 | 跨会话注入 | Persona | Persona | Memory/Bridge | Owner | 无（只注入授权摘要） |
| 17 | validityState | Memory | Memory | Persona | Owner | Memory |
| 18 | 记忆补全审计 | Memory | Memory | Persona/Bridge | Owner | Memory（正式写入需 Owner 批准） |

**唯一写入检查**：conversation/session 映射=Bridge；self/owner identity=Persona；speaker/experiencer/memory/validity=Memory；没有两个模块同时唯一写同一事实。

---

## 11. 对 Memory / Persona 具体提案的交叉回应

| 来源 | 提案/问题 | 评级 | 回应 |
|---|---|---|---|
| Memory 报告 | conversation_id 由 CB 生成，格式含 platform/account/chat_type | **ACCEPT** | 采用 `conv:qq:<account>:...`；account_id 必填 |
| Memory 报告 | runtime session_id 由 CB/宿主 | **MODIFY** | Host/DSH 权威；Bridge 记录；当前 Bridge 代生成是过渡 |
| Memory 报告 | speaker_id 生成归 CB | **MODIFY** | CB 只给 external；Memory 生成 canonical |
| Memory 报告 | session_bindings 写入方 PENDING | **MODIFY** | 拆两表：CB 会话映射，Persona 身份绑定 |
| Memory 报告 | digest 由 Memory | **ACCEPT** | 会话内本地 digest 可归 CB；跨会话摘要归 Memory，二者分开 |
| Memory 报告 | owner ID A=Owner、owner 映射归 Memory | **MODIFY** | 原则 A=Owner；建议 Owner ID/link 归 Persona 身份域，Memory 只存 owner_id 引用；需 Owner 裁决 |
| Memory 报告 | validityState 单一 unknown | **MODIFY** | 拆六类；legacy/unknown/conflict/retracted 分开 |
| Memory 报告 | raw_meta 可能写 self:unknown | **ACCEPT（谨慎）** | fresh 不写；旧库条件写；生产污染 `NOT_CONFIRMED`；总体 `VERSION_MISMATCH` |
| Persona 报告 | CB 成为 session_bindings 唯一写入 | **REJECT / MODIFY** | 违反 D6；CB 写会话映射，Persona 写身份绑定 |
| Persona 报告 | Persona 只读验证 | **MODIFY** | 对会话映射只读；对身份绑定是唯一写入者 |
| Persona 报告 | CB 提供 subject_type/subject_id 等字段 | **ACCEPT（仅平台事实）** | CB 提供 chat_type/group_id/external_speaker_id/conversation/session；canonical subject 由 Persona/Memory 验证 |
| Persona 报告 | conversation_id 由 CB、长期 key 提升 | **ACCEPT** | 格式加 account_id；旧 key legacy |
| Persona 报告 | runtime session 当前 CB 生成 | **MODIFY** | 现状；建议 Host/DSH 权威 |
| Persona 报告 | group member sender 必须保留 | **ACCEPT** | P0-A；CB 负责贯穿 prompt/buffer/memory/archive |
| Persona 报告 | owner ID D1 未决 | **OWNER_DECISION_FIXED** | 原则固定；格式/流程 PROPOSAL |
| Persona 报告 | digest 由 Memory | **ACCEPT** | 跨会话摘要归 Memory；CB 不拼跨会话文本 |
| 三方 | D4 隔离 P0 | **ACCEPT** | §6 矩阵作为验收；当前未闭合 |
| 三方 | D5 旧记忆保护 | **OWNER_DECISION_FIXED** | 六类 unknown 拆分是技术实现 |

---

## 12. 仍需 Owner 决定/批准的事项

1. Owner ID 最终格式（建议 `owner:<uuid>`）与首次绑定/验证/更换流程。
2. Owner 账号关联的授权记录格式与展示方式；`owner_account_link` 是否归 Persona 唯一写。
3. `session_bindings` 拆分方案与唯一写入责任（本报告建议拆两表；需 Owner 批准责任重划）。
4. `conversation_id` 最终格式（`conv:qq:<account>:...`）与 `account_id` 必填；旧 key 兼容窗口。
5. runtime `session_id` 权威生成方（Host/DSH vs Bridge）。
6. `role_only` 是否允许任何持久化（建议仅展示/上下文）。
7. `valid_from_kind`/cutover 时间与 legacy 近似规则。
8. `experiencer_evidence` 的物理存储/防伪强度/是否需签名。
9. `subject` 是否 deprecated；三维字段最终命名/枚举。
10. 自主补全正式写入是否允许未来自动执行；批量迁移授权。
11. Bridge 是否继续直接调用 `saveGroupTurn`/`saveGroupTranscript`，还是只提交信封由 Memory 写。
12. 群成员无稳定 ID 时是否允许写 unknown group episode，或必须拒绝。

---

## 13. 测试、命令与证据

### 13.1 已执行/复用

| 命令/证据 | 结果 |
|---|---|
| `git rev-parse` / `git show` 基线 | 见 §1.1；所有 commit/tree 已核对 |
| Channel Bridge `npm test` @ `bffcabc` | 562/562 pass，0 fail/skip，exit 0（fake transport） |
| Bridge 探针 | 跨会话上下文（私聊 A/B + 群 C/D）、群 fallback 跨群、source 缺字段、keyFor 碰撞、群缺 sender 退化群名、群归档 person_id、clearHandoff/status、handover 全量 |
| 生产只读 | profile：enabled/unified/mode=send/group.social；bridge.db 聚合 sessions 5、群入站 187、空 sender 0 |
| Memory 代码核对 | `7548e49` raw_meta DDL/写入分支、`personaSelfId`、addEpisode、group archive |
| Persona 代码核对 | `a84c7ba` selfId/bindingOf/roleOf/timeline/事务 |
| Memory/Persona 测试 | 引用其报告 258/258、303/303；本轮未重跑 |

### 13.2 关键代码位置

- Channel Bridge：`lib/parse.js:160-220`；`lib/message.js:10-38`；`lib/sessions.js:119-124,259,287,324-352,367-508`；`lib/store.js:10-23,293-305,330-339,406-466`；`lib/context.js:8-36`；`lib/index.js:263,287-290,391-448,547,566`；`lib/prompt.js:75-84`；`lib/handover.js:143-152,186-196`；`lib/status.js:96-97`；`lib/group-*.js`。
- Memory：`lib/service.js:191-198,281-321,550-575`；`lib/ingest/archive.js:174-185,451-479`；`lib/store/schema.js`；`lib/selfid.js:45-50`。
- Persona：`lib/service.js:64-69,126-135`；`lib/bindings.js:22-30`；`lib/emotion.js:645-647,652-730`；`lib/db.js:124-134`；`lib/scope.js`；`lib/inject.js:86-99`。

---

## 14. NOT RUN

- 真实 QQ/NapCat/群/私聊/媒体/引用/转发/通知；
- 真实 429/退避、并发、长连接、凭证轮换；
- 生产 memory.db / persona.db 读写、生产迁移、cutover；
- Memory/Persona 全量测试本轮未重跑（引用其报告）；
- Persona v3 / Memory v6 / EI-2A；
- 任何代码/测试/schema/DB/配置修改；
- 任何真实发送、身份合并、自动授权。

---

## 15. 状态与边界

- Channel Bridge 交叉审查：**READY_FOR_REVIEW**
- Channel Bridge 当前实现：会话映射 **PARTIAL**、speaker 传播 **REJECT/PARTIAL**、跨会话隔离 **REJECT**、标准 envelope **NOT_IMPLEMENTED**
- Memory 当前实现：**REJECT**（引用其报告）
- Persona 当前实现：**REJECT / NOT_IMPLEMENTED**（引用其报告）
- 联合契约：**BLOCKED / NOT FROZEN**
- Memory v6 / Persona v3 / EI-2A：**NOT_STARTED**
- 本报告只读，不构成实施、迁移、生产或身份合并授权。

---

## 16. 结论：能否冻结？

**不能。** 关键阻塞：

1. `session_bindings` 唯一写入责任未达成三方一致（本报告建议拆两表；Persona 报告建议 Bridge 唯一写；Memory 报告 PENDING）。
2. Owner ID 格式/关联/授权流程未定（D1 原则已定，技术方案待批）。
3. conversation_id 格式/account_id/旧行兼容待 Owner 批准。
4. D4 的 P0 路径（Bridge context/group fallback/handover/group archive；Memory digest）未修复。
5. raw_meta `self:unknown` 为 `VERSION_MISMATCH`，生产污染 `NOT_CONFIRMED`，不能宣称已污染。
6. 旧记忆六类 unknown/legacy/cutover 未实现。

在 Owner 批准并完成 P0 验收前，本报告保持 READY_FOR_REVIEW，不标记 PASS，不冻结契约。
