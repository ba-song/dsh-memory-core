# Persona 专项报告 · Memory–Persona–Channel Bridge 接口联合裁决 01

> 任务：`MEMORY-PERSONA-CHANNEL-INTERFACE-ARBITRATION-01`
> 角色：Persona / EI 专项负责人
> 性质：只读设计审查 + 接口提案（PROPOSAL）；不是开发/迁移/生产授权
> 审查时间：2026-11-22 14:15 (Asia/Shanghai)
> 状态：**READY_FOR_REVIEW**（Persona 报告完成）；联合裁决 **BLOCKED**；契约不可冻结
> 结论：Persona 当前 main 不能支撑 v1.1.1；三方接口责任未闭合；Persona v3 / Memory v6 / EI-2A 均 **NOT_STARTED**

---

## 0. 阅读导航

- §1 基线与权威依据
- §2 已确认事实（Persona / Channel Bridge / Memory）
- §3 完整消息流（Persona 视角）
- §4 Persona 专项设计：selfId / identityOf / binding / session_bindings
- §5 会话层七问
- §6 owner / third_party / group 边界
- §7 三维证据、历史与 cutover
- §8 timeline 与多表事务
- §9 RACI 责任矩阵（PROPOSAL）
- §10 跨仓库错误码语义（PROPOSAL）
- §11 版本与兼容（PROPOSAL）
- §12 P0 风险与验收
- §13 与其他两方报告的一致/差异/问题
- §14 需要所有者裁决的事项
- §15 未验证内容 / NOT RUN
- §16 测试与证据索引
- §17 状态与边界

---

## 1. 基线与权威依据

### 1.1 仓库/分支/HEAD/tree

| 对象 | 值 |
|---|---|
| 契约仓库 | `ba-song/dsh-memory-core` |
| 契约分支 | `docs/memory-persona-contract-v1.1.1-owner-decisions` |
| 契约 HEAD | `006bb5bfce5d031b49a60271fe0406b228b43e00` |
| 契约 tree | `b460823bad5ce250d3360db8e59871a024335e6f` |
| 契约 blob | `10a62b64dff6219d00a1e25be09a39ddccb50e1a` |
| Memory R2 报告 | `coordination/agent-reviews/memory/contract-v1.1.1/REVIEW-REPORT-R2.md` @ `26fbd08e9ff413cf403c3899c2880658e73d4e87`；tree `19a2d398273de29ef5f2f734b540a320bd5bd1cd` |
| Memory M1 基线 | `7548e49ed0b8d8673818464325d8e72ec7704b27` |
| Persona 仓库 | `ba-song/dsh-persona-core` |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| Persona EI 修复分支 | `8ccb8a922a789d8d15157b9d99f9de0c20c8807b`（仅供历史对照，不作为 main 能力） |
| Persona 报告分支 | `ei/pre-ei2a-review-01` @ `0af140785d89c3806c6f834195f820bac3808819` |
| Channel Bridge 仓库 | `ba-song/dsh-channel-bridge` |
| Channel Bridge main | `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13`；tree `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| Channel Bridge 专项报告 | **未在 coordination/agent-reviews/channel-bridge 找到**；本报告读取其 main 源码/README，不等同读取其报告 |
| 审查 worktree（Persona） | `/tmp/ei-main-a84c7ba`，HEAD `a84c7ba`，clean |
| 审查 worktree（Channel Bridge） | `/tmp/channel-bridge`，HEAD `bffcabc` |

### 1.2 已读文档

- 契约 v1.1.1-draft 全文（323 行）。
- Memory R2 报告全文（223 行），含 §47 矩阵、会话层、与 Persona 一致/差异。
- Persona 同版本报告 `EI-REPORT-0009`（`4053341`，362 行）及其本地摘要。
- Channel Bridge `README.md`、`lib/parse.js`、`lib/sessions.js`、`lib/router.js`、`lib/unified.js`、`lib/group-turn-memory.js`、`lib/group-digest.js`、`lib/store.js`。
- `coordination/HANDOFF.md`、`coordination/REPORT.md`；项目 AGENTS。

> 关键限制：Channel Bridge 的专项报告未找到；三方联合裁决不能仅凭源码阅读标记“已联合验证”。

---

## 2. 已确认事实

### 2.1 Persona（main `a84c7ba`）

| 事实 | 证据 |
|---|---|
| `selfId()` 返回 `row()?.id ?? 'self:unknown'` | `lib/service.js:64-69` |
| DB 不可用、self 行缺失、多 active 都返回 sentinel；不返回 null | 同上；`lib/index.js:112-115` |
| `ensureSelf` 0 active 时新建 self | `lib/self.js:36-41` |
| `ensureSelf` 接受任意 seedId（`abc`） | `lib/self.js:22-28,36`；临时 probe |
| 多 active 抛 `E_SELF_CONFLICT`，随后 service 降级 sentinel | `lib/self.js:15-18`；`lib/index.js:112-115` |
| `identityOf` 不存在 | `git grep identityOf lib` 0 命中 |
| `bindingOf` 只返回 session 行，不校验 persona_id===selfId | `lib/service.js:126-135` |
| `roleOf` 只有 persona/work；不能表达 owner/third_party | `lib/service.js:141-153`；`lib/bindings.js:14-15` |
| `session_bindings` 无 subject_type/id/updated_at/source（source 是绑定来源） | `lib/bindings.js:22-29` |
| 当前 `session_bindings` 由 Persona `inject.writeBinding` 写，且只写 private cwd 命中 | `lib/inject.js:86-99,126-130` |
| emotion 表无 speaker_id/experiencer/owner_scope/scope_type/evidence/三维字段 | `lib/db.js:173-224`；`git grep` 0 |
| `emotion_event.subject` 是自由文本 | `lib/db.js:192` |
| timeline 写 `session_key`，真实列 `self_id`；空 catch 吞错 | `lib/emotion.js:645-647`；`lib/db.js:124-134` |
| `recordRuleEpisode` 三连 INSERT 无事务 | `lib/emotion.js:652-730` |
| main `npm test` = 303/303，exit 0；不含 EI-1 新测试 | 2026-11-22 本轮执行，`/tmp/persona-main-a84c7ba-full.log` |
| 现有测试反向断言 `self:unknown` | `tests/contract.test.mjs:144` |

### 2.2 Channel Bridge（main `bffcabc`）

| 事实 | 证据 |
|---|---|
| 存在稳定会话 key：`group:<gid>` / `private:<QQ>` | `lib/sessions.js:118-124`；README “每个群/每个陌生私聊一个会话” |
| `channel_sessions.kind` 直接存该 key；`session_id` 单独存 | `lib/store.js:145-150,412-456` |
| runtime `session_id` 由 `randomUUID()` 生成，可 `resume`；轮换会新建 | `lib/sessions.js:259,287,368-414,451,481` |
| 私聊/群聊由 OneBot `message_type` 区分；群 `contactId=groupId`，`senderId=user_id` | `lib/parse.js:162-217` |
| 私聊 owner 由 `owner.qqIds` 与 `isOwner` 标记；unified 时 owner 私聊进 home，不建 QQ 私聊房间 | `lib/parse.js:174,194`；`lib/unified.js:13-18` |
| 群消息仍保留 `senderId`，但群记忆/摘要使用 `speakerName`（显示名） | `lib/index.js:547,566`；`lib/group-turn-memory.js:91-96` |
| 群摘要旧路径已退役，群全文归档传合成 header（`group-archive:<gid>:<at>`） | `lib/group-digest.js:3-8,61-66` |
| 没有 `conversation_id` 字段/持久化列；只有 key 字符串与 `channel_sessions.kind` | `lib/store.js` schema；`lib/sessions.js` |
| 没有 `speaker_evidence`/`experiencer_type/id`/`session_bindings` 写入 | 全仓 `grep` 无对应接口；`git grep` 需在报告中复核 |
| Channel Bridge 当前测试未本轮执行；README/VERIFY 的历史 550 不作为当前证据 | `docs/VERIFY-20261116.md` 仅历史 |

### 2.3 Memory R2（只读引用）

- Memory 当前实现：**REJECT**；self sentinel/非法 ID 可写入、无 evidence、无三维、无稳定 conversation_id、群成员 speaker 被群 ID 替代、digest 跨会话。
- Memory v6：**NOT_STARTED**；R2 §47 矩阵已确认。
- Memory 侧同样要求 `selfId` canonical/null、`identityOf`、binding 同源、session_bindings 主体字段、证据不可 PATCH。

---

## 3. 完整消息流（Persona 视角）

```text
外部平台消息（OneBot 私聊/群聊）
  │
  ▼
Channel Bridge: parseMessageEvent
  ├─ 输入：platform event（user_id/group_id/message_id/time/sender）
  ├─ 输出：channel, kind, contactId, senderId, senderName, at, messageId, isOwner
  ├─ 责任：保留原始平台 ID；群 groupId 与成员 senderId 分离
  └─ 失败：无 senderId/groupId → 拒收或 unknown；不得用显示名代替
  │
  ▼
Channel Bridge: conversation/session 识别
  ├─ 长期 key：group:<gid> / private:<QQ>（当前 keyFor）
  ├─ runtime session_id：host agents.create/resume（randomUUID）
  ├─ 输出：conversation_key + runtime session_id + cwd
  └─ 失败：无 agents/无 model → E_NO_AGENTS/NO_MODEL；不得伪造会话
  │
  ▼
Persona: identityOf(header) / bindingOf(session_id)
  ├─ 输入：header（session_id, conversation_key, chat_type, subject 候选）
  ├─ 读取：self 表 active + session_bindings（subject 字段）
  ├─ 输出：self_id / subject_type / subject_id / valid / reason
  ├─ 责任：验证 self canonical；binding 必须 persona_id===selfId
  └─ 失败：unknown / E_PERSONA_UNAVAILABLE / E_PERSONA_IDENTITY_UNKNOWN
  │
  ▼
Memory: 保存
  ├─ 输入：speaker_id, experiencer_type/id, evidence, conversation_id/session_id, source
  ├─ 校验：self 必须由 Persona 证明；否则拒绝 self episode
  ├─ 输出：raw/memory/episode + 证据 + 来源
  └─ 失败：fail closed 或 unknown；不得提升为 self/owner
  │
  ▼
Memory/Persona: 检索与注入
  ├─ validityState / 会话过滤 / 主体权限
  ├─ 输出：当前会话可见记忆
  └─ 失败：UNCERTAIN 不进普通注入；跨会话拒绝
```

**结论**：当前链路在“Channel Bridge 长期 conversation key → Persona binding → Memory conversation/evidence”三处断开；不能只靠 Memory 字段补齐。

---

## 4. Persona 专项设计（PROPOSAL，不实施）

### 4.1 selfId 严格协议

```text
selfId() -> string | null
```

- 合法：canonical `^self:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`。
- 返回 null：DB 不可用、self 行缺失、无 active、多个 active、格式非法、证据冲突。
- 不返回 `self:unknown`，不抛异常；调用方用 `identityOf` 获取 reason。
- `ensureSelf`：
  - 0 active：**不自动创建**；仅显式 enrollment（需负责人/受信入口）可创建 canonical self；
  - 多 active：`E_SELF_CONFLICT`，service 不降级 sentinel；
  - seedId 非 canonical：`E_PERSONA_IDENTITY_INVALID`；
  - DB 不可用：不创建，`E_PERSONA_UNAVAILABLE`。
- Memory addEpisode：null/sentinel/非法 → `E_PERSONA_IDENTITY_UNKNOWN` 或 `E_PERSONA_IDENTITY_INVALID`；Persona 服务缺失 → `E_PERSONA_UNAVAILABLE`。

### 4.2 identityOf(header) 输入/输出/伪代码

**输入（可信来源）**：
- `header.session_id`：宿主运行 session（CB/宿主生成）；
- `header.conversation_id` 或 `conversation_key`：Channel Bridge 的长期 key；
- `header.chat_type`：private/group；
- `header.peer_id` / `group_id`：CB 原始事实；
- `self` 表 active 行；
- `session_bindings` 的 `subject_type/id/updated_at/source`（由 CB 写，Persona 只读）。

**禁止作为身份证据**：
- `meta.serviceVersion`、`meta.origin`；
- display name、昵称、群名片、`subject` 文本；
- `role`（persona/work）、`cwd`、`source` 单独；
- 普通 PATCH 可写字段。

**输出**：

```js
{
  ok, valid, self_id,
  subject_type: 'self'|'owner'|'third_party'|'unknown',
  subject_id,
  id_strength: 'stable'|'role_only'|'none',
  reason: null|'E_PERSONA_UNAVAILABLE'|'E_PERSONA_IDENTITY_UNKNOWN'
        |'E_PERSONA_IDENTITY_INVALID'|'E_PERSONA_BINDING_CONFLICT'
        |'E_PERSONA_BINDING_EXPIRED'
}
```

**伪代码**：

```text
identityOf(header):
  if !header or !header.session_id: return unknown(HEADER_INVALID)
  sid = canonicalSelfIdOrNull()
  if sid == null: return unknown(IDENTITY_UNKNOWN/UNAVAILABLE)
  binding = getBinding(session_id)
  if !binding or !binding.bound: return unknown(BINDING_MISSING)
  if binding.persona_id != sid: return unknown(BINDING_CONFLICT)
  if binding.subject_updated_at missing/expired: return unknown(BINDING_EXPIRED)
  if binding.subject_type == 'self':
     if binding.subject_id != sid: return unknown(BINDING_CONFLICT)
     return self(sid)
  if binding.subject_type in owner/third_party:
     if !stableId(binding.subject_id): return unknown(UNKNOWN)
     return type/id
  return unknown
```

- 多来源冲突 → unknown，不自动升级。
- 身份变更历史：建议 `session_binding_history`，保存旧 subject/persona/时间/原因。
- metadata/PATCH 伪造：Persona 不读普通 PATCH 字段；证据由受信写入路径生成。

### 4.3 bindingOf 严格协议

- `bindingOf(sessionId)` 只返回原始 binding + `bound`；**不得单独证明 self**。
- 作为 self 依据必须满足：`bound===true && binding.persona_id===selfId() && selfId 合法`。
- binding 缺失/失效/过期/冲突 → unknown / `E_PERSONA_BINDING_*`，不猜。
- 旧 binding：无 subject 字段/无 updated_at → unknown；只可用于“是否已绑定”不能用于主体。
- 写入方：见 §4.4；Persona 只验证和消费。
- 不得让 Persona 与 Channel Bridge 各自维护主体事实。

### 4.4 session_bindings 责任（PROPOSAL）

| 项 | 建议 |
|---|---|
| 唯一写入方 | **Channel Bridge**（会话/主体事实的原始产生者） |
| Persona 角色 | 只读验证 + 解释；停止 `inject.writeBinding` 作为主体来源 |
| 字段 | `conversation_id`, `session_id`, `persona_id`, `subject_type`, `subject_id`, `subject_updated_at`, `subject_source`, `binding_version`, `status` |
| 生命周期 | active/expired/revoked；更新时间/来源；解绑保留历史 |
| 历史 | `session_binding_history` 追加；不覆盖旧事实 |
| 旧数据 | 缺字段 → unknown；不推断 owner/third_party |
| 冲突 | 多来源不一致 → unknown + 记录冲突；不自动选一方 |

> 这是 PROPOSAL，不是已批准 schema；不得描述为已定稿。

---

## 5. 会话层七问

| 问题 | 事实/建议 |
|---|---|
| 1 谁产生稳定 conversation_id？ | Channel Bridge；当前 keyFor `group:<gid>/private:<qq>` 已是稳定 key，但未作为 `conversation_id` 落库/传给 Memory；建议将其作为长期 ID，owner 私聊 home 单独约定 |
| 2 谁产生 runtime session_id？ | 宿主 agents create/resume；Channel Bridge 生成 randomUUID 并持久化 `channel_sessions.session_id`；Persona 只读 `header.id` |
| 3 谁写 session_bindings？ | 当前 Persona `inject.writeBinding`；建议改为 Channel Bridge 唯一写入，Persona 只读；需所有者批准 |
| 4 如何验证会话主体？ | 无协议；需 CB 提供 `subject_*` + Persona `identityOf` 校验；当前 `bindingOf` 只检查 bound，不能验证 |
| 5 私聊/群聊如何区分？ | CB `parseMessageEvent.message_type` 可靠；Persona `classify` 只看 cwd，属于二次推断；建议以 CB `chat_type` 为准 |
| 6 群成员身份如何保留？ | CB `parseMessageEvent` 有 `senderId`，但群记忆/摘要用 `speakerName`；Memory 群消息 speaker 被群实体替代；必须传 member `senderId`，缺失→unknown |
| 7 跨平台账号是否合并？ | 契约默认按平台/账号隔离；合并需可信映射/负责人授权；Persona 不做合并；**UNKNOWN**（待所有者） |

**私聊/群聊结论**：Channel Bridge 已有稳定 key 与独立房间；Persona 没有长期 conversation_id；Memory 没有 conversation_id 列。三方未闭合。

---

## 6. owner / third_party / group 边界

- owner：D1 未定；`person:owner` 只是候选占位。Persona 无 owner 接口；role_only 不能当稳定 ID。
- owner episode：D1 前 **BLOCKED**；建议拒绝或 `unknown`，不得写 self/owner stable。
- third_party：Memory people/contacts 管理；Persona 不接管。
- 群实体：`person:contact:qq:group:<gid>` 属 third_party；不得新增 group experiencer_type。
- 群成员：与群实体分离；无稳定成员 ID → unknown；不得用群 ID 代替成员 ID。
- 当前风险：Channel Bridge 群记忆用 speakerName；Memory 群消息 speaker 用群实体；存在 P0-A 错误归属。Persona 没有群成员接口，无法纠正。
- 未发现 Persona 显式把 owner/group 提升 self；但缺 owner 接口、Memory 回退 self 是潜在风险。

---

## 7. 三维证据、历史与 cutover

### 7.1 Persona 当前字段

| 维度 | 当前 | 结论 |
|---|---|---|
| evidence_source | 无 | NOT_IMPLEMENTED |
| verification_status | 无 | NOT_IMPLEMENTED |
| confidence_level | 无 | NOT_IMPLEMENTED |
| model raw score | `emotion_event.confidence` 0.5 / appraisal 0.5/0.7 | PARTIAL，未声明 raw/calibrated |
| intensity | `emotion_appraisal.intensity` | 有，但与 confidence 未按契约分离 |
| certainty | `emotion_state.certainty` / event certainty | 有，但不是 confidence_level |
| memory confidence | 无独立 | NOT_IMPLEMENTED |

- 重复引用不提升：无机制；`recordRuleEpisode`/timeline 不计算独立证据。
- inference：无 evidence_source，无法表达“推测”。
- disputed/retracted：无。
- 历史缺来源：旧行没有字段，无法补；不能整体过滤，但也不能标 known。

### 7.2 历史/cutover

- 原始情绪 event/appraisal/episode 行保留；无自动删除。
- 但无 cutover/版本/legacy 标记；timeline 旧写入失败导致历史缺失。
- 旧记录是 Persona 的派生情绪记录，不应被当作“原始聊天证据”；原始聊天在 Memory raw。
- 建议：cutover 前旧行标 `legacy_unclassified` / `unknown`，保留可回忆；cutover 后新行完整字段；禁止覆盖原文。
- cutover 时间/版本：**所有者待定**，不得自行冻结。

---

## 8. timeline 与多表事务

- 写入：`lib/emotion.js:645` `emotion_timeline(session_key,...)`；真实列 `self_id`（`lib/db.js:124-134`）。
- 读取：`timeline()` 用 `self_id`（`lib/emotion.js:1066`）。
- 临时 DB 复现：`applyCoreAppraisal` 后 `emotion_state` 更新，timeline 0；空 catch 吞。
- `recordRuleEpisode`：event/appraisal/episode 三连 INSERT 无 `tx()`（`lib/emotion.js:652-730`）；删除 episodes 后 event=1/appraisal=1 残留。
- 身份变化：timeline 旧行按旧 self_id 保留；无迁移/审计；切换 self 后旧 timeline 不自动归属新 identity。
- 修复设计（不实施）：
  1. timeline 写 `self_id`，删除空 catch，至少 log/metric；
  2. event/appraisal/episode 用 `tx()`；主链提交后再做 state/core/relationship 派生；
  3. 失败整体回滚；派生失败可重试/可观察；
  4. 测试：成功 1/1/1；删除 episodes 后 0/0/0；timeline 1 行 self_id；身份切换历史审计。
- 独立缺陷，不混 EI-2A。

---

## 9. RACI 责任矩阵（PROPOSAL）

> R=执行，A=最终负责，C=咨询，I=知会。每行只有一个 A；唯一写入权不重复。

| 事项 | Channel Bridge | Persona | Memory | Owner |
|---|---|---|---|---|
| conversation_id 生成 | **A/R** | C | C | I |
| runtime session_id 生成 | **A/R** | I | I | I |
| conversation/session 映射 | **A/R** | C | C | I |
| speaker_id 生成 | **A/R** | C | C | I |
| speaker_id 验证 | **R** | C | C | I |
| self ID 验证 | C | **A/R** | R（写入前复核） | I |
| owner ID 验证 | C | C | C | **A**（D1 待定） |
| third_party ID 管理 | C | C | **A/R** | I |
| experiencer=self/owner 判断 | C | **A/R** | C | I |
| experiencer 记录校验 | C | C | **A/R** | I |
| experiencer_evidence 产生 | C | **A/R**（self/owner） | R（third_party/存储） | I |
| evidence 保存 | I | C | **A/R** | I |
| session_bindings 写入 | **A/R**（建议唯一） | C（只读验证） | I | I |
| binding 验证 | C | **A/R** | C | I |
| digest 构建 | C | C | **A/R** | I |
| 跨会话检索 | I | C | **A/R** | I |
| 跨会话注入 | C | **A/R** | C | I |
| validityState 判断 | I | C | **A/R** | I |
| 记忆补全审计 | I | C | **A/R** | I |

**冲突点**：当前 `session_bindings` 由 Persona 写入；按上表应改为 Channel Bridge 唯一写入。这是责任重划，需所有者批准，不能由任一专项自行改。

---

## 10. 跨仓库错误码（PROPOSAL）

| 错误码 | 场景 | 行为 |
|---|---|---|
| `E_PERSONA_UNAVAILABLE` | Persona 服务/DB 不可用 | fail closed，不写 self |
| `E_PERSONA_IDENTITY_UNKNOWN` | self 缺失/无法证明 | fail closed，不写 self |
| `E_PERSONA_IDENTITY_INVALID` | 非 canonical/非法 seed | 拒绝 |
| `E_SELF_CONFLICT` | 多 active self | 拒绝启动/写入 |
| `E_SPEAKER_UNKNOWN` | 无法识别发言者 | 存 unknown，不提升 |
| `E_EXPERIENCER_UNKNOWN` | 无法确定经历主体 | 存 unknown，不提升 |
| `E_EVIDENCE_INVALID` | 证据来源/签名/版本不符 | 拒绝 self/owner，降 unknown |
| `E_CONVERSATION_MAPPING_MISSING` | 无法映射长期会话 | 拒绝跨会话注入，存 unknown |
| `E_SESSION_BINDING_CONFLICT` | binding 与 self 冲突 | fail closed |
| `E_BINDING_EXPIRED` | binding 过期/失效 | unknown，不猜 |
| `E_CROSS_SESSION_ACCESS_DENIED` | 跨会话无权限 | 拒绝读取/注入 |
| `E_SOURCE_DUPLICATED` | 同源重复 | 去重，不提升可信度 |
| `E_VALIDITY_CONFLICT` | 三态冲突 | UNCERTAIN，不进普通注入 |
| `E_MIGRATION_VALIDATION_FAILED` | 迁移校验失败 | 整体回滚，version 不前进 |

---

## 11. 版本与兼容（PROPOSAL）

- `contract_version`：v1.1.1-draft → 正式版需所有者批准后冻结。
- `evidence_version`：证据结构版本；旧证据不可解释时标 legacy。
- `conversation_identity_version`：长期 key 规则版本（`group:<gid>`/`private:<qq>` 需冻结）。
- `session_binding_version`：binding 写入协议/字段版本。
- `migration_version`：Memory v6 / Persona v3 各自迁移版本。
- `cutover`：旧记录保留 + `legacy/unknown/approximated`；具体时间/版本 **待所有者**。
- 回滚：迁移单事务；校验失败 version 不前进；证据/绑定写入可回滚/审计。
- 上述版本号与 cutover 不得由专项自行宣布。

---

## 12. P0 风险与验收

| P0 | 风险 | 验收 |
|---|---|---|
| P0-A 群成员 speaker | CB 用 speakerName，Memory 用群实体 ID 代替成员 | 群消息保留 member senderId；无 ID → unknown；群实体不进入 speaker |
| P0-B digest 跨会话 | Memory digest 混合 home+全部 QQ+群+email；CB 群全文归档 | 按 conversation/visibility 过滤；原文不跨会话注入；测试 A/B 私聊、群、home |
| P0-C self 门禁 | self:unknown/self:/abc/缺失 self 自动创建/多 active 后 sentinel | 所有入口拒绝；临时 DB 测试 5 类 |
| P0-D 重复证据 | Memory merge 同源 confidence+0.02/evidenceCount+1 | 来源去重/证据关系；重复不提升 |
| P0-E 有效性泄漏 | Memory 8+ 入口 future/expired/sup-only 泄漏 | 全部入口统一 validityState；矩阵测试 |
| P0-F timeline/事务 | Persona 列名错/非原子 | timeline self_id；event/appraisal/episode 回滚；测试 |

---

## 13. 与其他两方报告的一致/差异/问题

### 一致

- Memory R2 与 Persona 均判定：self sentinel/非法 ID 可写入、无 identityOf、binding 不校验、无 experience_evidence、无三维字段、群成员身份缺失、timeline 列名/非原子。
- 双方都要求 `selfId` canonical/null、binding 同源、session_bindings 主体字段、证据不可 PATCH。

### 差异

1. **身份证据**：Persona 建议 `identityEvidence`/`experiencer_evidence` 由 Persona 产出；Memory 建议专用只写列，不加入 PATCHABLE_COLUMNS。二者可合并，但字段/签名/存储未定。
2. **会话 ID**：Persona 说 `session_bindings.session_id` 是 runtime header.id；Memory 说 `conversation_scope` 恒空、session id 不落库；Channel Bridge 有稳定 key 但未作为 conversation_id。三方需裁决。
3. **session_bindings 写入方**：当前 Persona 写；契约方向 Channel Bridge；Memory 不写。必须唯一化。
4. **群成员**：CB 有 senderId 但群记忆用 speakerName；Memory 用群实体 ID；Persona 无接口。P0-A 未闭合。

### 需要其他方回答

- Memory：`conversation_id`/`session_id` 列与索引；`experiencer_evidence` 存储/不可 PATCH；三维字段；validityState 全入口；群成员 unknown 落库。
- Channel Bridge：`conversation_key` 提升为 `conversation_id` 的格式；owner 私聊 home 与 private:<QQ> 的关系；`senderId` 如何贯穿 group-turn-memory/摘要；`session_bindings` 唯一写入协议；chat_type/peer_id/group_id 的稳定来源。
- Persona：identityOf 的可信源；session_bindings 只读；owner/thirdparty 边界；timeline/事务。

---

## 14. 需要所有者裁决

1. D1 owner canonical ID。
2. owner episode 写入策略（D1 前 BLOCKED/unknown/role_only）。
3. role_only 是否允许任何写入（建议仅展示/上下文）。
4. 跨平台同一人账号是否合并（默认隔离）。
5. 历史 cutover 时间/版本。
6. `session_bindings` 最终字段与唯一写入方。
7. Channel Bridge ↔ Persona 主体验证协议/证据格式。
8. 群成员无稳定 ID 时的补录/合并策略。
9. `subject` 是否 deprecated；证据物理字段名。
10. 是否批准 Persona v3 / Memory v6 进入实施评审（本任务不授权）。

---

## 15. 未验证内容 / NOT RUN

- Channel Bridge 专项报告：**未找到**；未做三方联合签署。
- Channel Bridge 当前测试：**NOT RUN**；README/VERIFY 的 550 是历史证据。
- Memory 全量/契约测试：**NOT RUN**（本轮引用 R2）。
- Persona 生产安装/DSHA：**NOT RUN**。
- 真实 QQ/群/会话、真实 owner 私聊、真实 digest：**NOT RUN**。
- Persona v3 / Memory v6 / EI-2A：**NOT STARTED**。
- 生产 DB/配置/迁移/部署/重启：**未触碰**。

---

## 16. 测试与证据索引

### Persona

- main `a84c7ba`；`npm test` → **303/303，exit 0**；worktree `/tmp/ei-main-a84c7ba`。
- 临时 probe：
  - missing self → ensureSelf 新建 `self:<uuid>`；
  - invalid seed `abc` 接受；
  - multi active → `E_SELF_CONFLICT`；
  - timeline → state 更新、timeline 0；
  - atomic → event=1/appraisal=1 残留。
- 现有测试不覆盖 C1–C8；`tests/contract.test.mjs:144` 断言 `self:unknown`。

### Channel Bridge

- main `bffcabc`；源码/README 已读。
- 关键文件：`lib/parse.js:162-217`、`lib/sessions.js:118-124,368-414`、`lib/store.js:145-150,412-456`、`lib/unified.js:13-18`、`lib/group-turn-memory.js:91-96`、`lib/group-digest.js:3-8,61-66`。
- 测试 **NOT RUN**。

### Memory

- R2 `26fbd08`；M1 `7548e49`；报告 47 项矩阵。
- 测试 **NOT RUN**（引用 R2 历史结果，不作为本轮新验证）。

### 契约

- `006bb5b`，tree `b460823...`，blob `10a62b64...`。

---

## 17. 状态与边界

- Persona 专项报告：**READY_FOR_REVIEW**。
- 联合接口裁决：**BLOCKED**（Channel Bridge 报告缺失；三方字段/写入责任未闭合）。
- 契约 v1.1.1：**DRAFT / 不可冻结**。
- Persona 当前实现：**REJECT / NOT_IMPLEMENTED**。
- Memory 当前实现：**REJECT**（引用 R2）。
- Persona v3 / Memory v6 / EI-2A：**NOT_STARTED**。
- 本报告不构成实施/迁移/生产授权；未修改业务源码、测试、schema、DB、配置，未部署/重启，未合并实现分支。
