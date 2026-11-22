# Persona/EI 专项报告 · Owner 已批准契约协调 03

> 任务：`OWNER-APPROVED-CONTRACT-COORDINATION-03`
> 角色：Persona / EI 专项负责人
> 性质：只读复核 + 技术方案（PROPOSAL）；不实施代码/迁移/生产
> 时间：2026-11-22 17:05 (Asia/Shanghai)
> 状态：**READY_FOR_REVIEW**（Persona 报告）；整体合同 **BLOCKED / NOT FROZEN**
> 结论：Owner 五项决策原则接受；Persona 当前 main 仍不满足 Self 门禁、Owner 身份、Session 分层、Timeline 事务；Persona v3 / Memory v6 / EI-2A 均 **NOT_STARTED**

---

## 0. 阅读导航

1. 基线、已读材料、测试
2. Owner 五项决策落实情况
3. Self 身份门禁审查（重点 A）
4. Owner ID bootstrap / 账号关联（重点 B）
5. Persona Self 绑定合同（重点 C）
6. Persona ↔ Memory / Channel Bridge 职责边界
7. Timeline、事务、异常处理（重点 D）
8. 旧身份与兼容（重点 E）
9. 合同建议与实施前置条件
10. 未解决问题 / 需 Owner 决定
11. 测试覆盖、风险、NOT RUN
12. 状态与边界

---

## 1. 基线与已读材料

### 1.1 基线

| 对象 | 值 |
|---|---|
| 合同 | `docs/memory-persona-contract-v1.1.1-owner-decisions` @ `006bb5bfce5d031b49a60271fe0406b228b43e00`；tree `b460823bad5ce250d3360db8e59871a024335e6f`；blob `10a62b64dff6219d00a1e25be09a39ddccb50e1a` |
| Memory 交叉审查 | `review/memory-owner-decisions-cross-review-02` @ `3af0a57b05367d7d37f67e5c1378d8b250b7d007`；tree `147c3774b1ac7931caa9422a99a987ce3dfd02c5`；blob `b3f514c5134b1b983aed1361a3f5ae4b965836f1` |
| Persona 交叉审查 | `review/persona-owner-decisions-cross-review-02` @ `5652e35b40754e4d94e42860cf623d2499fb27be`；tree `7da8532d2cc772e7211eb00039e6eef0114096bd`；blob `a9f2a7647de53fc11b37a7d29684a8f1a224fe5f` |
| Channel Bridge 交叉审查 | `review/channel-bridge-owner-decisions-cross-review-02` @ `e811852a55d9f4c2a40694270d433b4f4b0a9733`；tree `1254fadb9b8eee19ff024be1c61855643c6d6a4c`；blob `e374808b558d57d9680a5469059c7396f55619df` |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| Persona fix | `8ccb8a922a789d8d15157b9d99f9de0c20c8807b`（仅历史对照，不作为 main） |
| Persona schema | `SCHEMA_VERSION = 2`（`lib/db.js:14`） |
| Persona 测试 | main `npm test`：**303/303 pass，exit 0**；不覆盖本任务新增语义 |
| Memory 基线 | `7548e49ed0b8d8673818464325d8e72ec7704b27`（schema v5） |
| Channel Bridge 基线 | `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` |
| 报告路径检查 | `coordination/agent-reviews/persona/owner-approved-contract-coordination-03/REVIEW-REPORT.md` 在所有远端 ref 中 **ABSENT**，本报告使用该路径，不覆盖旧文件 |

### 1.2 已完整阅读

- 合同 v1.1.1-draft（323 行）。
- Memory 交叉审查（258 行）。
- Persona 交叉审查（513 行）。
- Channel Bridge 交叉审查（526 行）。
- Persona main 源码：`lib/service.js`、`lib/self.js`、`lib/bindings.js`、`lib/inject.js`、`lib/index.js`、`lib/db.js`、`lib/emotion.js`、`lib/scope.js`。
- Persona 测试：`tests/contract.test.mjs`、`tests/d-persona-bindings.test.mjs`、`tests/emotion.test.mjs`、`tests/emotion-migrate.test.mjs`。
- Memory 同版本 raw/self 路径：`lib/ingest/archive.js`、`lib/selfid.js`、`lib/service.js`（按 Memory 报告/本轮只读核对）。
- Channel Bridge 同版本会话/speaker 路径：`lib/parse.js`、`lib/sessions.js`、`lib/store.js`、`lib/context.js`、`lib/group-turn-memory.js`、`lib/group-digest.js`、`lib/unified.js`。

### 1.3 测试与证据边界

- Persona main 测试为本轮实际执行：`npm test` → 303/303、0 fail、0 skip、exit 0（Node v24.19.0 / npm 11.17.0）。
- 临时 DB probes：`selfId` 缺失/多 active/非法 seed；timeline；recordRuleEpisode 原子性。
- Memory/Channel 测试本轮未重跑；引用其报告的历史结果，标 **NOT_RUN（本轮）**。
- 源码证据不等于运行时/生产证据；本报告不标记 PASS。

---

## 2. Owner 五项决策落实情况

| 决策 | 原则状态 | Persona 当前实现 | 结论 |
|---|---|---|---|
| D1 三层关系拆分 | **OWNER_DECISION_FIXED** | 无 conversation/self 分层；`session_bindings` 混 persona_id/role/cwd/source；Persona `inject.writeBinding` 隐式写 | **REJECT / MODIFY**：需拆 `conversation_bindings`（Channel）与 `persona_self_bindings`（Persona） |
| D2 conversation_id 格式 | **OWNER_DECISION_FIXED** | 无 `conv:` 格式；无 account_id；Channel 现有 `group:<gid>`/`private:<qq>`；Persona 无 conversation 字段 | **NOT_IMPLEMENTED**：Persona 只能消费，不得生成 |
| D3 Owner ID | **OWNER_DECISION_FIXED** | 无 `owner:<uuid>`、无 owner_identity/owner_account_link；无 bootstrap/同意流程 | **NOT_IMPLEMENTED**：见 §4 方案；D1 owner episode 政策未定，保持 fail closed |
| D4 旧记忆保护 | **OWNER_DECISION_FIXED** | Persona 旧 emotion 行保留；无 cutover/legacy/三维；旧 `self:unknown` 无统一识别 | **PARTIAL**：不删除；缺标记/迁移；见 §8 |
| D5 P0 修复顺序 | **OWNER_DECISION_FIXED** | P0-1 依赖 conversation_id（缺失）；P0-3/P0-6 明确失败；P0-2/4/5 非 Persona | **BLOCKED**：顺序接受；Persona 先修 P0-3/P0-6，P0-1 需 Channel 前置 |

**原则结论**：五项决策不重新讨论；技术落地均有缺口。

---

## 3. Self 身份门禁审查（重点 A）

### 3.1 当前事实

| 检查 | 事实 | 证据 |
|---|---|---|
| `selfId()` 是否可能返回 `self:unknown` | **是**；DB 不可用、self 行缺失、多 active 都返回 sentinel | `lib/service.js:64-69`；`lib/index.js:112-115` |
| DB 不可用 | 返回 `self:unknown`，不抛 | `lib/service.js:64-69` |
| 没有 active self | `ensureSelf` 自动新建 self，不是 null | `lib/self.js:36-41`；临时 probe `missing self` 返回新 `self:<uuid>` |
| 多个 active self | `ensureSelf` 抛 `E_SELF_CONFLICT`；`index.js` 捕获后 state.self=null；service 仍返回 `self:unknown` | `lib/self.js:15-18`；`lib/index.js:112-115`；临时 probe |
| 非法 seed | `ensureSelf(db,'汐','abc')` 返回 `abc`，不报错 | `lib/self.js:22-28,36`；临时 probe |
| 绕过路径 | `selfId` 无 canonical 校验；`addEpisode` 只判空；`bindingOf` 不验 self；测试反向断言 sentinel | `lib/service.js:64-69,126-135`；Memory `lib/service.js:191-199`；`tests/contract.test.mjs:144` |
| 测试覆盖 | 测“DB 关闭返回 self:unknown”；无 null/多 active/非法 seed/自动创建禁止测试 | `tests/contract.test.mjs:137-144` |

### 3.2 规范要求（Owner 已批准）

- Canonical self：`self:<uuid>`。
- 缺失/非法/多 active/DB 不可用 → **null**，不得 `self:unknown`。
- 不得自动创建未确认 self。
- 未验证 self 不得进入经历写入。

### 3.3 建议协议（PROPOSAL）

```text
selfId() -> canonical self:<uuid> | null
```

- 合法：`^self:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`。
- 返回 null：DB 不可用、self 行缺失、0 active、>1 active、格式非法、证据冲突。
- 不抛异常；调用方用 `identityOf` 取 reason。
- `ensureSelf`：
  - 0 active：**不创建**；返回 null / `E_SELF_IDENTITY_MISSING`。
  - 多 active：`E_SELF_CONFLICT`，service 不降级 sentinel。
  - seed 非法：`E_PERSONA_IDENTITY_INVALID`。
  - 只允许显式本地 bootstrap enrollment 创建 canonical self（见 §3.4）。
- Memory `addEpisode`：null/sentinel/非法 → `E_PERSONA_IDENTITY_UNKNOWN` / `E_PERSONA_IDENTITY_INVALID`；服务缺失 → `E_PERSONA_UNAVAILABLE`。
- `identityOf` 缺失/多 active/冲突 → `valid=false` + reason；不得升级 self。

### 3.4 Self 初始化（PROPOSAL）

- 首次启动无 self：状态 `uninitialized`，不自动创建；工具/PERSONA 注入可降级，但 self episode 全部 fail closed。
- 显式本地初始化：Owner 在 DSHA 本地受信入口确认（非 QQ/远程消息），生成 `self:<uuid>`，写 `self` + `identity_bootstrap_audit`（方法/时间/操作者/确认哈希）。
- 不允许从 display name/QQ/微信/群名/昵称生成 self。
- 已有 legacy self：仅当 id 合法、无冲突、Owner 确认时保留；不自动改 ID。

### 3.5 风险

- 当前 `ensureSelf` 自动创建会“凭空产生一个汐”，是身份漂移 P0。
- 多 active 降级 sentinel 会让 Memory 继续写入，P0-C。
- `self:unknown` 测试反向断言说明现有测试在保护错误行为。

---

## 4. Owner ID bootstrap / 账号关联（重点 B）

### 4.1 当前事实

- Persona main 无 `owner:<uuid>`、无 `owner_identity`、无 `owner_account_link`、无 owner bootstrap/consent（`git grep owner:` 0）。
- Channel Bridge 只有 `owner.qqIds` 白名单/`isOwner`；QQ 号可被当 owner 判定（Channel 报告）。
- Memory 无 owner identity，只有 `person:owner` 占位/scope。
- 当前没有跨平台合并逻辑；也没有 owner 授权记录。

### 4.2 建议格式

- Owner canonical：`owner:<uuid>`（UUIDv7 优先）。
- 不得用 QQ 号、昵称、头像、手机号、平台账号作为永久 Owner ID。
- `person:owner` 仅 legacy 别名/显示，必须解析到 `owner:<uuid>`；不得作为稳定 ID 落库。

### 4.3 Bootstrap

**目标**：证明操作者是 Owner，而不是平台账号持有者。

建议流程（PROPOSAL）：

1. Persona 首次启动无 Owner：`owner_identity.status='absent'`，所有 owner 记忆写入 fail closed。
2. Owner 在本机受信入口（DSH 本地 GUI/CLI/设备确认）发起 bootstrap；不接受 QQ/群/邮件远程指令作为唯一证明。
3. 本地 challenge：一次性 nonce + Owner 确认（本地设备确认/口令/恢复码）；生成 `owner:<uuid>`；写 `owner_identity` + `identity_bootstrap_audit`。
4. 记录 `created_by`（本地受信入口）、`method`、`evidence`、`confirmed_at`、`owner_ack_hash`；不记录平台账号为主键。
5. 平台账号只通过 `owner_account_link` 关联；`owner_account_link` 初始 `pending`，Owner 明确同意后 `confirmed`。
6. 无回复/含糊 → `pending`/`rejected`，不构成授权；不得自动合并。

### 4.4 表建议（PROPOSAL）

```sql
owner_identity(
  owner_id TEXT PRIMARY KEY,        -- owner:<uuid>
  status TEXT NOT NULL,             -- active | retired
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,         -- local bootstrap entry
  bootstrap_method TEXT NOT NULL,
  evidence TEXT NOT NULL,
  confirmed_at INTEGER NOT NULL,
  rotated_from TEXT,
  version INTEGER NOT NULL
)

owner_account_link(
  link_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,           -- owner:<uuid>
  platform TEXT NOT NULL,           -- qq/email/...
  account_id TEXT NOT NULL,         -- external platform ID
  status TEXT NOT NULL,             -- pending|confirmed|rejected|revoked
  evidence TEXT NOT NULL,
  consent_ref TEXT,                 -- owner consent record
  confirmed_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL,
  UNIQUE(platform, account_id)
)
```

- 唯一写入：Persona（身份域）；Channel 只提供平台事实；Memory 只存 `owner_id` 引用。
- `owner_account_link` 不进入 `speaker_id`/`experiencer_id` 主键；只用于 owner 身份解析。
- `owner_identity`/link 不加入普通 PATCH；专用 API + 审计。

### 4.5 账号关联授权

- Channel 提供 `platform/account_id/external_account_id/source/at` 事实；Persona 生成 candidate（不创建 owner link）。
- 汐可主动询问 Owner；记录 `asked_at/channel/question_hash`。
- Owner 明确同意（`approved`）才写 `confirmed`；`unclear/no_reply` 保持 pending；`rejected` 保留。
- 禁止昵称、头像、表达习惯、相似行为自动确认。
- 撤销保留历史，不删除。

### 4.6 恢复/轮换（未决）

- 恢复：离线恢复码 + 本地 Owner 确认；不得因平台账号登录自动恢复 Owner。
- 轮换：显式 Owner 操作生成新 `owner:<uuid>`，旧 `retired`，关联需重新同意；历史保留。
- 具体恢复/轮换流程需 Owner 批准；本报告不实施。

### 4.7 不得擅自决定

- Owner episode 写入政策（D1 批准了 Owner ID，但未批准 owner episode 写入规则）。
- role_only 政策。
- 跨平台合并规则。
以上保持 `PENDING_OWNER`，技术建议不写成批准。

---

## 5. Persona Self 绑定合同（重点 C）

### 5.1 Owner D1 三层关系

| 关系 | 唯一写入方 | 存储建议 |
|---|---|---|
| conversation_id ↔ runtime_session_id | **Channel Bridge** | `conversation_bindings`（Channel DB） |
| runtime_session_id ↔ Persona Self | **Persona** | `persona_self_bindings`（Persona DB） |
| Message ↔ Speaker/Experiencer | **Memory** | 每条 message/raw/memory 的 speaker/experiencer 字段，不是 session binding |

**结论**：旧 `session_bindings` 不再作为共享表继续承载三种事实；拆表/退役。

### 5.2 Persona 专属绑定表（PROPOSAL）

```sql
persona_self_bindings(
  runtime_session_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,       -- reference only; not authoritative
  self_id TEXT NOT NULL,               -- canonical self:<uuid>
  evidence_id TEXT NOT NULL,           -- Persona identity evidence
  status TEXT NOT NULL,                -- active | expired | revoked | conflict
  verified_at INTEGER NOT NULL,
  expires_at INTEGER,
  version INTEGER NOT NULL
)
```

- 写入：Persona 唯一写；Channel 不写 Persona DB。
- `conversation_id` 仅为引用/交叉校验，不修改、不生成；以 Channel 的 conversation_bindings 为准。
- 不写 subject_type/owner/third_party；Message↔Speaker/Experiencer 由 Memory 逐消息处理。
- 历史/旧表：`session_bindings` 只读 legacy；只有 `persona_id` 是 canonical self 且 self active 才可导入弱绑定；缺证据 → unknown；不迁移 conversation 事实。
- `bindingOf(sessionId)` 必须校验：`bound===true`、`persona_id===selfId()`、`status=active`、`conversation_id` 与 header 匹配、evidence 未过期；失败返回 null/reason，不证明 self。
- `identityOf(header)` 读取 header 的 `conversation_id`/`runtime_session_id`（Channel 提供）+ self 表 + persona_self_bindings；缺 conversation_id 时不得按 channel 猜测。
- 群聊：Persona 只做 self 绑定；群成员/群实体由 Memory 逐消息处理；不写 group subject binding。

### 5.3 Channel 消费

Persona 只消费 Channel 的：

- `conversation_id`（`conv:qq:<account>:private|group:<id>`）；
- `runtime_session_id`（Host/DSH 权威）；
- `chat_type`、`platform`、`account_id`、`peer_id/group_id`（参考）；
- 不消费 `speaker_type` 作为 self 证据；不写 `conversation_bindings`。

缺 `conversation_id`/`account_id`：`identityOf` unknown；不注入、不写 self episode；错误 `E_CONVERSATION_MAPPING_MISSING`。旧格式 `legacy_unmapped` 不得猜测。

### 5.4 旧 `session_bindings` 兼容

- 保留表只读；`inject.writeBinding` 退役，不再隐式写。
- 旧行：`persona_id` 非 canonical/无 self/role 非 persona/无 evidence → `legacy_unclassified`；不证明当前消息主体。
- 迁移到 `persona_self_bindings` 仅限显式、可审计、Owner 批准；本轮不迁移。
- 不删除旧行；不覆盖。

---

## 6. Persona ↔ Memory / Channel Bridge 职责边界

| 能力 | Channel Bridge | Persona | Memory |
|---|---|---|---|
| 平台消息事实 | **唯一**（platform/account/chat/group/sender/message/time） | 只读消费 | 只读引用 |
| conversation_id ↔ runtime_session | **唯一写** | 只读/校验 | 引用 |
| runtime_session ↔ self | 不写 | **唯一写** | 只读引用 |
| Owner ID / owner_account_link | 只提供平台事实/候选 | **唯一写**（Owner 同意后） | 引用 `owner:<uuid>` |
| Speaker canonical | 提供 external_speaker_id | 只验证 self/owner；不写 third_party | **唯一写** people/contacts + speaker_id |
| Experiencer | 提供 message/speaker 事实 | 提供 self/owner identity evidence | **唯一写**最终 experiencer/evidence |
| memory evidence | 提供 message evidence | 提供 self/owner identity evidence | **唯一写**存储/校验 |
| validity | 不写 | 不写 | **唯一写** |
| 注入 | 不写 | **唯一执行**（按 conversation/权限） | 提供检索结果 |

**边界结论**：Owner D1/D3 已把 Owner 身份/link 归 Persona；Memory 只引用 `owner:<uuid>`，不生成/不映射 owner。Channel 不写 Persona/Memory 身份事实。当前实现均未闭合。

---

## 7. Timeline、事务、异常处理（重点 D）

### 7.1 当前事实

- Timeline 写入：`lib/emotion.js:645` `INSERT INTO emotion_timeline(session_key,...)`；真实 schema 是 `self_id`（`lib/db.js:124-134`）。
- 读取：`timeline()` 用 `self_id`（`lib/emotion.js:1066`）。
- 临时 DB：`applyCoreAppraisal` 后 `emotion_state` 更新，`emotion_timeline` 前后均 0；空 catch 吞错（`:647`）。
- `recordRuleEpisode`：event/appraisal/episode 三连 INSERT 无 `tx()`（`lib/emotion.js:652-730`）；删除 episodes 后 event=1/appraisal=1 残留。
- 状态更新与时间线：状态更新在 timeline 之前，timeline 失败不回滚。
- 错误可观察性：空 catch 无 log/metric。
- 身份变化：timeline 旧行按旧 self_id 保留；无身份切换审计/迁移。

### 7.2 修复设计（PROPOSAL，不实施）

1. timeline 写 `self_id`；全仓检查所有 timeline INSERT。
2. 删除空 catch；至少 log/metric；timeline 为历史必需时与状态更新同事务并抛错。
3. `recordRuleEpisode` 用 `lib/db.js` `tx()` 包裹 event/appraisal/episode；主链提交后再做 state/core/relationship 派生。
4. 失败整体回滚；派生失败可重试/可观察。
5. 测试：
   - 成功 1/1/1；
   - 删除 episodes → 0/0/0；
   - timeline 1 行且 `self_id` 正确；
   - 身份切换审计；
   - 错误不被吞。
6. 与 EI-2A 分开；不混入情绪模型/持久化设计。

### 7.3 风险

- 当前 timeline 静默缺失，`why`/情绪历史不可追溯；P0-F。
- 三表部分写入可在失败后留下 event/appraisal，污染后续数据；P0-F。

---

## 8. 旧身份与兼容（重点 E）

### 8.1 `self:unknown`

- Persona `selfId` 当前返回 sentinel；Memory raw_meta 旧 schema（有 speaker_id）可写 `self:unknown`；fresh raw_meta DDL 无 speaker_id，不会写。
- 正式 `memories` 可接受 sentinel（Memory 报告实测）；Persona 无统一识别/回填。
- 结论：**VERSION_MISMATCH + 条件 CONFIRMED**；生产污染 **NOT_CONFIRMED**，不得宣称。

### 8.2 旧 `session_bindings`

- 当前表无 conversation/evidence/lifecycle；旧行只能证明“session 曾绑定 persona”，不证明当前消息主体。
- 旧行若有 canonical self + persona role + 证据：可导入 `persona_self_bindings`（显式迁移，需 Owner 批准）；否则 `legacy_unclassified`。
- 不把历史路径存在等同于生产已污染。

### 8.3 旧 emotion 记录

- 旧 `emotion_event/appraisal/episode` 行保留；无三维/evidence/cutover。
- 旧记录是派生情绪，不是原始聊天证据；只能标 `historical_record`/`inference`/unknown，不可当 direct_statement。
- 不整体过滤；可用于带不确定性回忆；不能仅凭“已保存”当客观事实。
- 迁移只加元数据，不覆盖原文；cutover 待 Owner。

### 8.4 Schema 差异

- Persona schema v2；Proposed v3 需新增 owner/identity/binding/timeline 修复。
- Memory schema v5；Proposed v6 需 conversation/experiencer/evidence/validity。
- 两者独立迁移；不得用一个版本号混淆；fresh/old DB 行为必须分别测试。

---

## 9. 合同建议与实施前置条件

### 9.1 合同文本建议（PROPOSAL）

1. Owner ID：canonical `owner:<uuid>`；`person:owner` 仅 legacy 别名；Persona 拥有 owner identity/link；Memory 只引用。
2. Conversation ID：`conv:qq:<account_id>:private:<peer_id>` / `conv:qq:<account_id>:group:<group_id>`；account 必填；旧格式 legacy；Persona 只消费。
3. 三层关系：conversation_binding（Channel）/ persona_self_binding（Persona）/ message speaker+experiencer（Memory）；删除共享 `session_bindings` 的“主体”职责。
4. `identityOf`：输入 Conversation/Session/chat_type/peer/group + self 表 + persona_self_binding；输出 self/owner/unknown；禁止 meta/display/role/cwd/subject。
5. `selfId`：canonical 或 null；不自动创建；Memory 拒绝 sentinel。
6. Owner consent：`owner_identity`/`owner_account_link` + consent_ref；无明确同意不合并。
7. Timeline/事务：列名、错误可观察、三表单事务、回滚测试。
8. Legacy：旧 session/self/evidence 标 unknown/legacy；不删除、不自动升级；迁移需 Owner 批准。

### 9.2 实施前置条件

- Owner 批准 Persona v3 schema（owner/self/binding/evidence）。
- Channel 实现 `conv:` conversation_id + conversation_bindings；Host/DSH runtime session ID。
- Memory 接受 `owner:<uuid>` 引用、self 证据、message speaker/experiencer；不再生成 owner。
- 先只读 scan/candidate/audit；正式迁移另授权。
- 测试矩阵通过；生产/设备另授权。
- EI-2A 不在本任务范围。

---

## 10. 未解决问题 / 需 Owner 决定

1. Owner bootstrap 的本地信任方式（设备确认/口令/恢复码）与恢复流程。
2. Owner episode 写入政策（D1 未批准；当前 fail closed）。
3. role_only 政策（不得擅自确定；建议仅展示）。
4. 多平台账号关联的询问渠道/措辞/授权证据格式。
5. Persona v3 schema 是否接受 `persona_self_bindings` 字段/退役旧表。
6. conversation_id `conv:` 格式/account 必填（Owner 已定；实现细节需 CB）。
7. Host/DSH runtime session ID 生成责任。
8. 旧 `session_bindings` 迁移/退役策略。
9. 旧 `self:unknown` 的保留/回填/阻断策略。
10. cutover 时间/版本；旧 emotion 记录三维标注。
11. Memory `owner:<uuid>` 引用与 evidence 关联格式。
12. 迁移授权与回滚验收。

---

## 11. 测试覆盖、风险、NOT RUN

### 11.1 已执行

- Persona main `npm test`：303/303，exit 0。
- 临时 probes：missing self 新建、invalid seed `abc`、多 active `E_SELF_CONFLICT`、timeline 0、atomic 残留。
- 代码/Schema 静态核对：`SCHEMA_VERSION=2`；`session_bindings` 旧字段；无 owner/identity/binding 表。

### 11.2 测试缺口

- 无 selfId null/缺失/多 active/非法 seed/禁止自动创建测试；现有测试反向断言 sentinel。
- 无 identityOf/owner bootstrap/owner_account_link/consent 测试。
- 无 persona_self_bindings、旧 session_bindings 迁移测试。
- 无 timeline 正确写入/事务回滚测试。
- 无旧 self:unknown 识别/阻断测试。
- Memory/Channel 测试未重跑；生产未验证。

### 11.3 风险

- **P0**：self 自动创建/降级 sentinel；timeline 静默丢失/部分写入；Owner ID 未实现；conversation/self 绑定未分层。
- **P1**：旧 session/self 兼容；owner 关联授权；Memory owner 引用；conversation_id 消费。
- **P2**：旧 emotion 三维标注；迁移审计。

### 11.4 NOT RUN

- 真实 Owner bootstrap/账号关联/恢复/轮换。
- 生产 DB 写入/迁移/Persona v3/Memory v6/EI-2A。
- 真实 QQ/NapCat/会话/注入。
- Memory/Channel 当前测试重跑。
- 生产 `self:unknown` 污染验证。
- Android/DSHA 设备操作。

---

## 12. 状态与边界

- Persona 专项报告：**READY_FOR_REVIEW**。
- 整体合同：**BLOCKED / NOT FROZEN**。
- Persona 当前实现：**REJECT / NOT_IMPLEMENTED**（Self、Owner、Session 分层、Timeline）。
- Persona v3 / Memory v6 / EI-2A：**NOT_STARTED**。
- 本报告只读；未修改源码/测试/schema/DB/配置；未部署/重启；未生成 Owner ID/绑定账号/迁移；所有建议均为 PROPOSAL。
