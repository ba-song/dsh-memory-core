# Persona/EI 专项复核 · v1.2.0 候选合同审计 04

> 任务：v1.2.0 候选合同专项复核（Persona/EI）
> 合同：`docs/memory-persona-contract-v1.2.0-owner-review` @ `1dced58a8093222a70853668fca6cf35cf7674ed`
> 文件：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-CANDIDATE.md`
> 性质：只读；不改源码/测试/Schema/DB；不启动 Persona v3 / EI-2A；不执行 Self/Owner/账号绑定/迁移。
> 时间：2026-11-22 17:55 (Asia/Shanghai)
> 状态：**READY_FOR_REVIEW**；整体合同 **BLOCKED / NOT FROZEN**；Persona 实现 **REJECT / NOT_IMPLEMENTED**。

---

## 0. 结论速览

| 重点 | 合同文本 | 当前实现 | 结论 |
|---|---|---|---|
| §2.4 Self 门禁 | PASS | REJECT | 文本符合 Persona 职责；实现仍 sentinel/自动创建 |
| §2.5 Owner 门禁 | PASS | NOT_IMPLEMENTED | 文本明确 `owner:<uuid>`/Persona 管理；实现无 Owner |
| Owner ID 不混平台账号 | PASS | NOT_IMPLEMENTED | 无 owner 表/link；平台 QQ 仍是 owner 白名单 |
| 跨平台明确同意 | PASS | NOT_IMPLEMENTED | 无 candidate/consent/link |
| Runtime↔Self vs Conversation↔Session | PASS | REJECT | 合同分层清楚；实现仍是一张旧 `session_bindings` |
| §5.6 Bridge 临时摘要 vs Persona 身份 | PASS（需补一句 scope） | 未实现 | 职责未混淆；但临时摘要缺 conversation 精确边界 |
| §7.5.1 时间未知/历史近似/注入 | PARTIAL | NOT_IMPLEMENTED | 文本方向对；与 Persona timeline 的适用范围需明确 |
| §9 P0-3 / P0-6 | PARTIAL | REJECT | 验收项基本对，但漏 Owner identity/identityOf/事务细节 |

**总判断**：v1.2.0 候选文本总体符合 Persona 职责，未弱化 Owner 五项决策；但 Persona 当前实现不支持，且 P0-3/P0-6 验收需补充后才能冻结。

---

## 1. 基线、证据与测试

### 1.1 基线

| 对象 | 值 |
|---|---|
| 合同 | `1dced58a8093222a70853668fca6cf35cf7674ed`；tree `b2a1ea0f75b723586bffaa702690142697debf8a`；blob `2b821169a61f39dab9b7ede37f580ba428d1b2e4` |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| Persona schema | v2（`lib/db.js:14`） |
| Persona 测试 | `npm test` @ main：303/303、0 fail、0 skip、exit 0（本轮执行） |
| Memory 基线 | `7548e49ed0b8d8673818464325d8e72ec7704b27`（v5，引用） |
| Channel Bridge 基线 | `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13`（引用） |
| 报告路径 | `coordination/agent-reviews/persona/v1.2.0-candidate-audit-04/REVIEW-REPORT.md` 在所有远端 ref 中不存在；本报告新建，不覆盖 |

### 1.2 已读

- v1.2.0 CANDIDATE 全文（790 行），重点 §2.4、§2.5、§4、§5.6、§7.5.1、§9。
- Persona main 源码：`lib/service.js`、`lib/self.js`、`lib/bindings.js`、`lib/inject.js`、`lib/db.js`、`lib/emotion.js`、`lib/index.js`。
- Persona 测试：`tests/contract.test.mjs`、`tests/d-persona-bindings.test.mjs`、`tests/emotion.test.mjs`。
- 历史基线：Persona 交叉审查 `8eaed1a`、Memory/Channel 报告用于事实对照，但不替代本轮代码。

### 1.3 证据边界

- 303/303 只证明现有测试未回归；不覆盖 Self/Owner/binding/timeline 新语义。
- 临时 DB probes：self 缺失/非法 seed/多 active、timeline、recordRuleEpisode；不写生产。
- Memory/Channel 测试本轮未重跑；标 NOT_RUN。

---

## 2. 逐项复核

### 2.1 §2.4 / §2.5 / §4：Self 与 Owner 门禁是否符合 Persona 职责

**结论：合同文本 PASS；当前实现 REJECT / NOT_IMPLEMENTED。**

#### §2.4 Self

合同要求与 Persona 职责一致：

- canonical `self:<uuid>`；只返回合法 ID 或 null。
- DB 不可用、缺失、多 active、非法、冲突 → fail closed。
- 禁止 `self:unknown`；禁止首次启动自动创建未确认 Self。
- Memory 写 self 前必须验证 canonical Self。
- role/cwd/private/group/subagent/display/PATCH 元数据不能证明 Self。

当前代码违反：

- `selfId()` 返回 `row()?.id ?? 'self:unknown'`（`lib/service.js:64-69`）；DB 不可用/行缺失/多 active 都是 sentinel。
- `ensureSelf` 0 active 自动新建 self（`lib/self.js:36-41`）；非法 seed `abc` 被接受（`lib/self.js:22-28,36`；临时 probe）。
- 多 active 抛 `E_SELF_CONFLICT`；`lib/index.js:112-115` 捕获后 state.self=null，service 仍 sentinel。
- `identityOf` 不存在（`git grep` 0）；`bindingOf` 不校验 `persona_id===selfId`（`lib/service.js:126-135`）。
- 测试反向断言 `self:unknown`（`tests/contract.test.mjs:144`）。

#### §2.5 Owner

合同要求与 Owner D3 一致：

- `owner:<uuid>`；Owner 身份与平台账号分离。
- Persona 身份域是 Owner identity/account link 唯一管理方。
- 未 bootstrap → absent/unknown；不得把平台白名单/昵称当 Owner。
- 未经明确同意不得确认跨平台关联；Memory 不签发/推断 Owner。

当前代码：

- Persona main 无 `owner:`/`owner_identity`/`owner_account_link`（`git grep owner:` 0）。
- 无 owner bootstrap/consent；Channel 仍用 `owner.qqIds` 白名单；Memory 用 `person:owner` 占位。
- 结论：合同文本 PASS；实现 NOT_IMPLEMENTED。

#### §4 Persona 域

合同要求：

- Persona 唯一写 Runtime Session ↔ Self；Channel 写 Conversation ↔ Runtime Session；Memory 写 Message↔Speaker/Experiencer。
- `persona_self_bindings` 是逻辑建议，物理表 OPEN。
- binding 验证：active、canonical self、当前 self 一致、conversation mapping 匹配、evidence 可信、无冲突；失败 null/reason，不得 sentinel。
- 旧 `session_bindings` 只读 legacy；不得双写/自动升级。

当前代码：

- `session_bindings` 只有 `session_id/persona_id/role/cwd/source/created_at`（`lib/bindings.js:22-29`），无 conversation/evidence/status/version。
- `inject.writeBinding` 在 private cwd 命中时隐式写旧表（`lib/inject.js:86-99`）；不是显式 Persona Self binding。
- `bindingOf` 只返回 `bound:true`，无 self/conversation/evidence 校验（`lib/service.js:126-135`）。
- 无 `persona_self_bindings`，无 conversation 消费。
- 结论：合同文本 PASS；实现 REJECT。

---

### 2.2 Owner ID `owner:<uuid>` 与平台账号分离

**合同 PASS；实现 NOT_IMPLEMENTED。**

- §2.3/§2.5 明确 `owner:<uuid>` canonical；`person:owner` 仅 legacy/显示；平台账号不得等同 Owner。
- §1 D3 明确 Persona 身份域管理 Owner identity/link；Channel 只提供平台事实；Memory 只引用。
- 当前 Persona 无 owner 代码；Channel 的 `owner.qqIds` 是临时分类，不是 canonical；Memory `person:owner` 是占位。
- 风险：若实现把 `owner.qqIds` 直接映射 `owner:<uuid>`，违反 D3；必须 owner_account_link 明确同意后才关联。
- 建议：`owner_identity`/`owner_account_link` 仅在 Persona；`owner:<uuid>` 不进入 `speaker_id` 的自动映射；Memory 只存引用。

**结论：合同满足 D3；实现缺口明确。**

---

### 2.3 跨平台账号关联是否始终要求 Owner 明确同意

**合同 PASS；实现 NOT_IMPLEMENTED。**

- §2.5/D3：无明确同意不得确认；无回复/含糊/无法确认不构成同意。
- 当前无 candidate/consent/link 表；Channel 只有 owner QQ 白名单；无跨平台合并代码。
- 风险：若用昵称/头像/行为相似度自动关联，违反 D3；合同已禁止。
- 建议：`owner_account_link(status=pending|confirmed|rejected|revoked)` + `consent_ref`（asked_at/channel/question_hash/decision/decided_at/evidence）；`confirmed` 前不写 owner mapping；`revoked` 保留历史。
- Owner 明确同意的渠道/措辞仍 OPEN，需 Owner 审阅。

**结论：合同未弱化 D3；实现无该能力。**

---

### 2.4 Runtime Session ↔ Persona Self 与 Conversation ↔ Runtime Session 是否完全分离

**合同 PASS；实现 REJECT。**

- §3/§4 明确：
  - Conversation ↔ Runtime Session：Channel 唯一写。
  - Runtime Session ↔ Persona Self：Persona 唯一写。
  - Message ↔ Speaker/Experiencer：Memory 唯一写。
- `persona_self_bindings` 的 `conversation_id` 仅是引用，不由 Persona 生成/修改；符合分离。
- 当前实现仍是一张 `session_bindings` 混 `persona_id/role/cwd/source`；`inject.writeBinding` 隐式写；无 conversation_id；无 self binding。**不满足分离。**
- 旧 `session_bindings` 只读/迁移尚未实施；不能把旧行自动升级。
- 建议：拆分/退役旧表；Persona 只写 `persona_self_bindings`；Channel 不写 Persona DB；Memory 不写 binding。

**结论：合同分层正确；实现 REJECT。**

---

### 2.5 §5.6：Bridge 临时摘要与 Persona 身份验证是否混淆

**合同 PASS（建议补一句 scope）。**

- §5.6 明确：
  - Bridge 可维护会话内临时上下文/受控原文引用；不等于写 Memory。
  - 进入 Memory 的 turn/transcript/digest/handover 必须走 Memory 受控接口；Bridge 不决定 speaker/experiencer/evidence/validity。
  - 临时摘要若长期/跨会话，必须经 Memory 来源/主体/有效性/权限校验。
- 未发现把 Bridge 临时摘要职责写成 Persona 身份验证职责；Persona 不在 §5.6 被赋予摘要写入权。
- 潜在歧义：§5.6 未明确“临时摘要必须按 conversation_id 限定，不得跨会话”，容易被实现成 Bridge 内跨会话缓存。建议补一句：`临时摘要/上下文必须绑定 conversation_id；跨会话共享按 P0-1 授权与审计`。
- 结论：职责分离 PASS；scope 补强 PARTIAL。

---

### 2.6 §7.5.1：未知时间、历史近似与普通注入边界

**合同 PARTIAL；实现 NOT_IMPLEMENTED。**

合同方向正确：

- `unknown` 保留、可用于标注回忆，不默认 current-fact 注入，不单独支撑重要决策。
- `legacy` 不是自动 VALID/INVALID；created_at 近似需逐类批准。
- `implicit` 仅 created_at 可信且类型允许。
- `verification_status` 与时间独立；retracted 不注入，disputed 不静默选边。
- 旧记忆不因保存过而升级为已验证。

需要补充的 Persona 边界：

1. §7.5.1 属于 Memory `memories` 有效性；Persona `emotion_timeline` 是运行期情绪历史，不是 Memory `valid_from_kind` 的同一张表。合同应明确“不适用于 Persona timeline；Persona timeline 只受 P0-6 事务/列名约束”。
2. Persona 的 `emotion_event/appraisal` 是派生情绪记录，不应被当作 `direct_statement`/原始证据；旧情绪记录应标 `historical_record`/`inference`/unknown，不能因“已保存”成为已验证事实。
3. Persona 注入情绪行时，必须遵守「unknown/legacy 不默认 current-fact」；但不应把情绪强度/certainty 当 Memory 的 confidence_level。
4. `valid_from_kind` 物理字段/旧行近似仍 OPEN；Persona 不实现 Memory v6，不应在 Persona schema 里复制该字段。
- 结论：合同方向 PARTIAL；需明确适用范围，避免与 Persona timeline 冲突。

---

### 2.7 §9 P0-3 / P0-6 验收是否足够

**P0-3：PARTIAL。**
已覆盖：

- selfId canonical/null；DB 不可用/缺失/多 active/非法 seed fail closed。
- 首次启动不自动创建；旧 sentinel 不合法。
- binding 验证 canonical self/evidence；Memory 拒绝 null/sentinel/非法/未验证 self episode。

遗漏/需明确：

1. 未提 `identityOf` 的 fail-closed 输出/错误码；P0-3 只提 binding，但 §4.3 identityOf 是入口。
2. 未提 Owner identity/account link 的验收；D3 已批准，P0-3 只覆盖 Self。应加 P0-3 的 Owner 身份门禁或独立 P0 项（owner absent/unknown、platform 不等同 owner、owner_account_link 未同意不确认）。
3. 未明确 `bindingOf` 的 conversation mapping、expiry/conflict/evidence 撤销测试；§4.3 有，但 P0-3 验收未列。
4. 未明确“self 缺失自动创建”在 fresh/legacy DB、多次启动、并发下的负向测试。
5. 未明确 Memory addEpisode 对 `E_PERSONA_IDENTITY_*` 的具体断言（错误码/不落库）。

**P0-6：PARTIAL。**
已覆盖：

- timeline 列名与 schema 一致；不允许空 catch；event/appraisal/episode 原子；状态与 timeline 不部分成功；成功行数/self_id；故障注入 0/0/0 或完整原子；身份切换审计；不混 EI-2A。

遗漏/需明确：

1. 未明确 `recordRuleEpisode` 的具体事务边界（event/appraisal/episode）与 `tx()`；只说“需要原子性时”，仍可能被实现成部分事务。
2. 未明确 `applyCoreAppraisal` 的 state + timeline 是否同事务；P0-6 说“状态更新与 timeline 不得部分成功”，但未给验收步骤/失败注入点。
3. 未要求错误码/日志/metric 可观察；只说“不允许空 catch”。
4. 未要求 `recordRuleEpisode` 失败后 event/appraisal/episode 精确 0/0/0 的具体 fixture（删除表/约束失败）。
5. 未要求 self 身份变化时旧 timeline 归属审计的具体字段/查询。
6. 未要求测试覆盖旧 schema（列名错列）与 fresh schema 的差异。

**结论：P0-3/P0-6 方向正确但验收不够具体，不能直接冻结。**

---

## 3. 合同文本与 Persona 职责的差异/风险

### 3.1 文本一致性

- v1.2.0 未弱化 D1–D5：三层关系、`conv:` 格式、`owner:<uuid>`、旧记忆保护、P0 顺序均明确。
- §2.4/§2.5/§4 与 Persona 职责一致；Persona 不应写 conversation、Memory 不应写 Owner。
- §4.2 明确 `conversation_id` 只是引用，符合“Persona 不写 Channel 事实”。

### 3.2 实现差距

| 合同要求 | 当前 Persona main | 结论 |
|---|---|---|
| canonical self/null | `self:unknown` | REJECT |
| 不自动建 self | ensureSelf 自动建 | REJECT |
| 非法 seed fail closed | 接受 `abc` | REJECT |
| multi active fail closed | `E_SELF_CONFLICT` 后 sentinel | REJECT |
| Owner identity/link | 无 | NOT_IMPLEMENTED |
| 跨平台同意 | 无 | NOT_IMPLEMENTED |
| conversation↔session 分离 | 旧单表 | REJECT |
| Persona self binding | 无 | NOT_IMPLEMENTED |
| identityOf | 无 | NOT_IMPLEMENTED |
| timeline 列/事务 | 错列/非原子 | REJECT |
| 旧 session 只读 | 仍隐式写 | REJECT |

### 3.3 风险等级

- **P0**：Self 自动创建/sentinel 绕过；timeline 静默丢失/部分写入；Owner 身份未实现但平台白名单可当 owner（D3 风险）。
- **P1**：旧 session_bindings 双写/误迁移；Owner link 未同意；conversation_id 缺失；identityOf 缺失。
- **P2**：旧情绪时间/三维标注；Persona v3 schema 细节。

---

## 4. 建议的合同修订（文本级，PROPOSAL）

1. §2.4 增加：`selfId` 与 `identityOf` 分离；`selfId` 不抛，`identityOf` 返回 reason；Memory 错误码映射。
2. §2.5 增加：P0-3 验收必须覆盖 Owner identity absent/unknown 和 owner_account_link 未同意不确认；否则 D3 没有验收。
3. §4.3 增加：`bindingOf` 必须校验 conversation mapping、expiry/revoked/conflict、evidence 撤销；失败 reason。
4. §5.6 增加一句：Bridge 临时摘要/上下文必须按 `conversation_id` 限定；跨会话共享按 P0-1 授权/审计；不得进入 Persona identity decision。
5. §7.5.1 增加适用范围：不适用于 Persona `emotion_timeline`；Persona 情绪记录是派生历史，不等同 Memory 有效性；旧情绪标 historical/inference/unknown。
6. §9 P0-3 增加：
   - `identityOf` 缺失/mismatch/expired→unknown；
   - `bindingOf` self/conversation/evidence 条件；
   - Owner identity/account link 未同意不确认（或独立 P0-3b）；
   - Memory addEpisode 具体错误码/不落库断言。
7. §9 P0-6 增加：
   - `recordRuleEpisode` 明确 `tx()` 包 event/appraisal/episode；
   - `applyCoreAppraisal` state+timeline 原子；
   - 失败注入 fixture、错误可观察、旧 timeline 归属审计字段。

---

## 5. 未解决事项 / Owner 决策

以下保持 OPEN，不重新解释已批准决策：

1. Owner bootstrap 可信入口（设备确认/口令/恢复码）细节。
2. Owner 恢复/轮换流程。
3. Owner episode 写入政策（当前 fail closed；合同 OPEN）。
4. role_only 语义（合同 OPEN；仅展示建议未冻结）。
5. Owner account link 撤销/恢复流程。
6. Persona Self binding 物理表/字段冻结（合同只冻结职责）。
7. 旧 session_bindings 迁移/退役方案。
8. 旧 self:unknown 识别/回填/阻断策略。
9. cutover/legacy 时间近似规则。
10. Persona v3 schema/迁移授权。

---

## 6. 测试、NOT RUN、状态

### 已执行

- Persona main `npm test` → 303/303、0 fail、0 skip、exit 0。
- 临时 DB：missing self 自动创建；invalid seed `abc`；multi active `E_SELF_CONFLICT`；timeline 0；recordRuleEpisode event=1/appraisal=1 残留。
- 静态：schema v2；self/binding/timeline 行号；无 owner/identityOf。

### 未覆盖/NOT RUN

- `identityOf`/Owner bootstrap/owner_account_link/consent 测试：不存在。
- `persona_self_bindings`/旧 session_bindings 迁移：不存在。
- timeline 正确写入/事务回滚：无测试。
- 旧 self:unknown 识别/阻断：无测试。
- Memory/Channel 当前测试：未重跑。
- 真实 QQ/生产/Persona v3/Memory v6/EI-2A/迁移：NOT RUN。

### 状态

- 本报告：**READY_FOR_REVIEW**。
- 合同 v1.2.0：**CANDIDATE / BLOCKED（Persona 实现不满足；P0-3/P0-6 验收需补）**。
- Persona v3 / Memory v6 / EI-2A：**NOT_STARTED**。
- 未修改源码/测试/Schema/DB/配置；未执行 Self 创建/Owner bootstrap/账号绑定/迁移。

---

## 7. 最终回答

**Persona 是否接受 v1.2.0 候选合同作为职责基线？**

**原则接受文本方向，但当前实现不接受；合同需按 §4 的建议补 P0-3/P0-6/P0-3b 与 §7.5.1 适用范围后再冻结。**  
Persona 不反对 D1–D5；反对的是在实现未满足、验收不完整时把合同标为 PASS/FROZEN。
