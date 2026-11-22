# Persona 专项只读审查报告 · Memory–Persona 联合契约 v1.1.1

> 审查对象：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.1.1-DRAFT.md`
> 契约分支：`docs/memory-persona-contract-v1.1.1-owner-decisions` @ `006bb5bfce5d031b49a60271fe0406b228b43e00`
> 契约 tree：`b460823bad5ce250d3360db8e59871a024335e6f`
> 契约 blob：`10a62b64dff6219d00a1e25be09a39ddccb50e1a`
> 审查角色：DSHA「汐」Persona / EI 专项负责人
> 审查方式：只读源码、临时 DB 复现、现有测试；未改业务源码/测试/schema/DB/配置
> 审查时间：2026-11-22 13:10 (Asia/Shanghai)
> 结论：**BLOCKED**（契约文本方向可接受，但 Persona 当前实现不能支撑；Persona v3 / Memory v6 / EI-2A 均未启动）

---

## 0. 审查基线与说明

### 0.1 仓库/分支/HEAD

| 对象 | 值 |
|---|---|
| Persona 仓库 | `ba-song/dsh-persona-core` |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90` |
| Persona EI 修复分支 | `fix/ei1-source-ref-experiencer-contract` @ `8ccb8a922a789d8d15157b9d99f9de0c20c8807b` |
| Persona EI 报告分支 | `ei/pre-ei2a-review-01` @ `0af140785d89c3806c6f834195f820bac3808819` |
| 审查 worktree（main） | `/tmp/ei-main-a84c7ba`，HEAD `a84c7ba`，`git status --short` 空 |
| Memory M1 | `7548e49ed0b8d8673818464325d8e72ec7704b27`（schema v5） |
| Memory coordination | `8956f1c3a62c522e83527add8d37c26c50b2e657`（读取时） |

> 本报告以 **Persona main `a84c7ba`** 为“当前实现”基线；EI 修复分支仅用于历史对照。main 与 fix 的 `lib/service.js`、`lib/self.js`、`lib/bindings.js`、`lib/emotion.js`、`lib/db.js`、`lib/scope.js` 完全相同（`git diff` 为空），fix 仅多 EI-1 新文件与文档。

### 0.2 AGENTS 与文档

- 已读 `/sdcard/DSHA/工作区/AGENTS.md`、项目 `AGENTS.md`；Persona 仓库内无 AGENTS.md。
- 已读 HANDOFF（blob `b210d0a...`）、REPORT（blob `02c430b...`）、EI-REPORT-0009、Memory 报告 0028 §19、契约 v1.1.1-draft。
- 契约状态为 **DRAFT / READ-ONLY REVIEW REQUIRED**；不是实施授权。

### 0.3 测试基线

- Persona main `npm test`：**303 tests / 303 pass / 0 fail / 0 skip，exit 0**（Node v24.19.0 / npm 11.17.0）。
- 本报告不使用 fix 分支的 324 测试数字作为 main 证据；fix 的数字只说明 EI-1 分支自身测试。
- 测试通过不等于契约通过；现有测试不覆盖 C1–C8 与本契约新增项。

---

## 1. C1–C8 逐项结论

| 条款 | 结论 | 证据 |
|---|---|---|
| C1 身份字段语义 | **NOT_IMPLEMENTED** | `lib/db.js:173-224` 的 emotion 表只有 `self_id/actor/subject/target`；`git grep speaker_id/experiencer_type/experiencer_id/owner_scope/scope_type` 在 main lib 0 命中；`subject` 只是 `TEXT`（`db.js:192`）；EI-1 的 `experiencer*` 只在纯函数（main 无该文件） |
| C2 selfId canonical/null | **REJECT** | `lib/service.js:64-69` 返回 `row()?.id ?? 'self:unknown'`；DB 不可用/行缺失/多 active 都是 sentinel；`ensureSelf` 0 active 时新建 self（`lib/self.js:36-41`）；非法 seed `abc` 被接受（临时 probe）；多 active 抛 `E_SELF_CONFLICT`，`lib/index.js:112-115` 捕获后 self=null，service 仍返回 sentinel |
| C3 identityOf | **NOT_IMPLEMENTED** | `identityOf` 不存在（`git grep` 0）；无输入字段、无证据/冲突/伪造检查 |
| C4 binding 与 selfId 同源 | **REJECT** | `bindingOf` 只返回 session row（`lib/service.js:126-135`），无 `persona_id===selfId()` 检查；`roleOf` 返回 `persona`/`work`（`lib/bindings.js:14-15`）；`bindSession` 可存其他 persona；无失效/解绑/历史 |
| C5 owner/third_party/group | **NOT_IMPLEMENTED** | Persona 无 owner/third_party 接口；`roleOf` 只有 persona/work；`classify` 只有 private/group/subagent（`lib/scope.js:64-70`）；无 `person:owner`/群实体映射；无 role_only |
| C6 experiencer_evidence | **NOT_IMPLEMENTED** | `experiencer_evidence` 不存在（`git grep` 0）；`meta.serviceVersion/origin` 未被 Persona 用于身份；binding `source` 只是 default/subagent；无不可 PATCH 证据 |
| C7 subject_updated_at/source | **NOT_IMPLEMENTED** | `session_bindings` 只有 `session_id/persona_id/role/cwd/source/created_at`（`lib/bindings.js:22-29`）；无 subject 字段/更新时间/来源可信度；旧 binding 无法判断主体 |
| C8 timeline/原子性 | **REJECT** | timeline 写 `session_key`（`lib/emotion.js:645`），真实列 `self_id`（`lib/db.js:124-134`），空 catch 吞错；临时 DB 复现 state 更新、timeline 0。`recordRuleEpisode` 无事务（`lib/emotion.js:652-730`），删除 episodes 后 event=1/appraisal=1 |

---

## 2. 契约最低审查矩阵（16 项）

| # | 项 | 结论 | 说明 |
|---|---|---|---|
| 1 | speaker_id 与 experiencer_type/id 分离 | **NOT_IMPLEMENTED** | Persona 无 speaker_id/experiencer 字段；emotion_event 仅 free-text subject |
| 2 | private conversation 独立窗口、稳定 ID、隔离 | **PARTIAL** | `session_bindings` 按 runtime `session_id`；`classify` private；无稳定 conversation_id；同一联系人多次 session 无合并/稳定映射 |
| 3 | group conversation 独立窗口、成员 speaker、群实体分离 | **PARTIAL** | `classify` group；群聊只 brief；`writeBinding` 不处理 group；无 group 实体/成员 ID/成员历史 |
| 4 | canonical self ID、identityOf、binding 同源、fail closed | **REJECT** | selfId sentinel/自动建 self；identityOf 缺失；binding 无 equality；fail open 到 sentinel |
| 5 | owner/third_party/unknown/群实体前缀/成员 unknown | **NOT_IMPLEMENTED** | 无 owner/thirdparty/group 类型与映射；role 只有 persona/work |
| 6 | experiencer_evidence 可信且不可 PATCH | **NOT_IMPLEMENTED** | 无字段/生成路径/防篡改设计 |
| 7 | 历史 cutover、旧原文保留、unknown 不误删 | **NOT_IMPLEMENTED** | 无 cutover/版本；无旧情绪证据字段；旧行未删但无法按新语义使用 |
| 8 | validityState 三态与所有入口一致 | **NOT_IMPLEMENTED / BLOCKED** | Persona 无 validityState；属于 Memory 契约；Persona 未接入 |
| 9 | valid_from_kind、superseded_at、legacy 近似、asOf | **NOT_IMPLEMENTED** | Persona emotion episode 只有 `expires_at`；无 valid_from_kind/superseded_at |
| 10 | evidence_source / verification_status / confidence_level 三维分离 | **NOT_IMPLEMENTED** | 只有 confidence/certainty/intensity；无三维字段 |
| 11 | 原始 emotion score / intensity / certainty / memory confidence 分离 | **PARTIAL** | `emotion_appraisal.confidence`、`intensity`、`emotion_state.certainty` 分开存；但无 evidence_source/confidence_level；event.confidence 语义未声明 |
| 12 | 重复引用不提升可信度、证据独立性 | **NOT_IMPLEMENTED** | 无证据表/独立来源/重复引用计数；无自动提升防护 |
| 13 | 不确定记忆按用途使用，不单独触发重要决策 | **NOT_IMPLEMENTED** | 无按用途策略；无 uncertain 使用矩阵 |
| 14 | 自主补全证据、审计、原文保护、权限、回滚 | **NOT_IMPLEMENTED** | 无自主补全流程/审计/候选表 |
| 15 | timeline 列名与多表事务一致 | **REJECT** | 见 C8；已临时 DB 复现 |
| 16 | migration 单事务、验证、version-last、rollback | **NOT_IMPLEMENTED / BLOCKED** | Persona v3 未设计/未实施；当前仅 schema v2 migration；无 v3 migration 方案 |

---

## 3. selfId / identityOf / bindingOf 详细审查

### 3.1 selfId()

- 当前：`row()?.id ?? 'self:unknown'`（`lib/service.js:64-69`）。
- DB 不可用：`self:unknown`。
- self 行缺失：`ensureSelf` 会新建 self（`lib/self.js:36-41`），不是 null；临时 probe 返回新 `self:<uuid>`。
- 非法 seed：`ensureSelf(db,'汐','abc')` 返回 `abc`；没有 canonical 校验。
- 多个 active：正常 schema 的唯一部分索引阻止；若索引缺失/损坏，`ensureSelf` 抛 `E_SELF_CONFLICT`（`lib/self.js:15-18`），`index.js:112-115` 捕获后 state.self=null，service 返回 `self:unknown`。
- 结论：**REJECT**；没有 fail closed，反而创建/回退。

### 3.2 identityOf(header)

- 不存在（`git grep` 0）；无实际实现可审查。
- 现有 `roleOf` 只返回 `{session_id, persona_id, role, bound}`；role 只有 persona/work。
- 结论：**NOT_IMPLEMENTED**；C3/C6 无法 PASS。

### 3.3 bindingOf(sessionId)

- 返回 `{...row, bound:true}`（`lib/service.js:126-135`）；不校验 persona_id 与 selfId。
- `bindSession` 对同 session 不同 persona 不覆盖旧行（`lib/bindings.js`）；无失效/解绑/历史。
- 结论：**REJECT**；只有 `bound===true && persona_id===selfId()` 才可作 self 依据，当前未实现。

---

## 4. 会话层：私聊/群聊/主体

### 4.1 七个问题

| 问题 | 审查结论 |
|---|---|
| 1. 谁产生稳定 conversation_id？ | 契约方向是 Channel Bridge；Persona 不产生；当前 `session_bindings.session_id` 是 runtime `header.id`，无长期 conversation 容器 ID |
| 2. 谁产生运行时 session_id？ | 宿主/DSH/Channel Bridge；Persona 只读取 `header.id`（`inject.js:107`） |
| 3. 谁写入 session_bindings？ | 当前是 Persona `inject.writeBinding`（`lib/inject.js:86-99`），只在 cwd 可绑定且非 group 时写；契约要求 Channel Bridge 提供会话身份，二者**责任冲突**，需裁决 |
| 4. Channel Bridge 与 Persona 如何验证会话主体？ | 无协议；Persona `bindingOf/roleOf` 不验证 subject；Channel Bridge 未提供 subject 字段；**NOT_IMPLEMENTED** |
| 5. 私聊/群聊如何区分？ | Persona `classify` 只看 cwd basename（`lib/scope.js:64-70`）；群聊 brief；未使用 Channel Bridge chat_type；**PARTIAL** |
| 6. 群成员身份如何保留？ | Persona 无群成员身份；`session_bindings` 不写 group；Memory raw `person_id` 有联系人/群 person 值，但无稳定成员 ID；**NOT_IMPLEMENTED** |
| 7. 跨平台同一人账号是否合并？ | 契约默认按平台/账号隔离，合并需可信映射/负责人授权；Persona 无合并逻辑，**UNKNOWN/负责人决定**；不得擅自合并 |

### 4.2 结论

- 私聊：有 runtime session binding，但无长期 conversation 稳定 ID；同一联系人多个 session 没有明确合并/隔离策略。**PARTIAL**。
- 群聊：有 group 分类，但无群实体/成员 speaker/binding；群成员经历无法在 Persona 侧归属。**PARTIAL/REJECT**。
- 会话隔离：`session_bindings` 只覆盖 private cwd；group 不写 binding；跨会话隔离依赖注入/Channel Bridge，Persona 侧不完整。

---

## 5. owner / third_party / group 身份边界

- Persona 角色枚举只有 `persona`/`work`（`lib/bindings.js:14-15`），不是 owner/third_party。
- `classify` 只分 private/group/subagent（`lib/scope.js:64-70`）。
- 无 `person:owner`、`person:contact:*`、`person:contact:qq:group:<gid>` 映射。
- 无 role_only；无 owner episode 写入门禁。
- 无第三方 people/contacts（契约规定 Memory 管理，Persona 不应接管；当前也没有）。
- 群实体/群成员：无区分；无稳定成员 ID 时无法标记 unknown，因为 Persona 根本没有该字段。
- **未发现** Persona 显式把 owner/group 提升为 self 的路径；但缺少 owner 接口，Memory 可能回退 self，是潜在风险。
- 结论：**NOT_IMPLEMENTED**；owner/third_party/group 边界不能由 Persona 当前实现保证。

---

## 6. experiencer_evidence

- `experiencer_evidence` 在 Persona 不存在（`git grep` 0）；无专用表/列/接口。
- 无可信生成路径；`meta.serviceVersion`/`meta.origin` 未被 Persona 用于 self；Memory 报告也指出这些字段可被 PATCH，不能作为证据。
- `session_bindings.source` 只是 `default`/`subagent`，不是主体证据。
- 建议接口（不实施）：
  - `identityEvidence(header)` 返回 `{session_id, self_id, subject_type, subject_id, source, issued_at, evidence_version, nonce}`；
  - 证据由 Persona 可信运行路径产生，Memory 专用列/表存储，不加入 PATCHABLE_COLUMNS；
  - 证据绑定 session + subject + 时间；旧/失效 binding 不得复用；
  - 无证据 → unknown，不猜。
- 结论：**NOT_IMPLEMENTED**；C6 不能 PASS。

---

## 7. 历史记忆与三维证据

### 7.1 历史/旧情绪

- 旧 `emotion_event/appraisal/episodes` 行仍保留；没有自动删除。
- 但无 cutover/版本、无 evidence_source/verification_status/confidence_level、无 legacy 近似标记；旧记录无法按新契约解释。
- `emotion_timeline` 旧路径写入失败（session_key），历史时间线可能缺失；不能声称历史完整。
- 新旧规则切换：**NOT_IMPLEMENTED**。
- 旧记录不能因缺字段整体排除，但当前也没有“保留但标记 unknown/legacy”的机制；需要设计。

### 7.2 三维证据

| 维度 | 当前 Persona | 结论 |
|---|---|---|
| evidence_source | 无 | **NOT_IMPLEMENTED** |
| verification_status | 无 | **NOT_IMPLEMENTED** |
| confidence_level | 无（只有 numeric confidence） | **NOT_IMPLEMENTED** |
| 原始模型分数 | `emotion_appraisal.confidence` 0.5/0.7；无 kind/source | **PARTIAL/REJECT** |
| intensity | `emotion_appraisal.intensity` | 有，但与 confidence/certainty 未按契约语义分离 |
| certainty | `emotion_state.certainty`、event/appraisal certainty | 有，但不是 confidence_level |
| memory confidence | 无独立字段 | **NOT_IMPLEMENTED** |

- 重复引用不提升可信度：无机制；dedupeKey 仅用于 episode 幂等，不是证据独立性。**NOT_IMPLEMENTED**。
- 不确定记忆按用途：无策略。**NOT_IMPLEMENTED**。

---

## 8. session_bindings 数据结构与旧数据兼容

当前（`lib/bindings.js:22-29`）：

```sql
session_bindings(
  session_id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL,
  role TEXT NOT NULL,
  cwd TEXT,
  source TEXT,
  created_at INTEGER NOT NULL
)
```

缺失（契约候选，未批准）：
- `subject_type`
- `subject_id`
- `subject_updated_at`
- `subject_source`

审查：
- 无 subject 字段 → 无法表达 owner/third_party/group；旧 binding 不能判断主体。
- 无 `updated_at` → 无法判断陈旧；旧行可能长期复用。
- 无解绑/失效/历史 → 无法保留 binding 变更。
- 写入方：当前 Persona `inject.writeBinding`；契约要求 Channel Bridge 提供会话/主体；**责任冲突**。
- 校验方：Persona `bindingOf` 不校验 self；无 Channel Bridge 协议。
- 多设备/多 session：无版本/来源；旧 binding 可能指向其他 persona。
- 结论：**NOT_IMPLEMENTED**；字段仍是候选设计，不能写成已批准 schema。

---

## 9. timeline 与多表事务

### 9.1 timeline

- 写入：`lib/emotion.js:645` `INSERT INTO emotion_timeline(session_key,...)`；真实 schema `self_id`（`lib/db.js:124-134`）。
- 读取：`timeline()` 用 `self_id`（`lib/emotion.js:1066`）。
- 临时 DB 复现：`applyCoreAppraisal` 后 state 更新，timeline 前后均 0；异常被 `:647` 空 catch 吞。
- 结论：**REJECT**；写入/读取列不一致，历史丢失且无错误。

### 9.2 多表写入

- `recordRuleEpisode` 三连 INSERT（event/appraisal/episode）无 `tx()`（`lib/emotion.js:652-730`）。
- 临时 DB 删除 episodes 后调用：event=1、appraisal=1 残留；抛 `no such table`。
- 结论：**REJECT**；无原子性，失败留下部分身份链。

### 9.3 self 身份变化

- timeline 行按 `self_id` 保留；无身份变更 workflow/审计/迁移。
- 旧 self 行历史仍按旧 ID 存储，切换 self 后旧 timeline 不会自动归属新 identity。
- 结论：**NOT_IMPLEMENTED**；需定义历史归属和审计。

---

## 10. addEpisode 错误语义（Memory 侧，Persona 提供 self）

Memory M1 `lib/service.js`：

- `personaSelfId()` 只判空，接受任意非空；`self:unknown` 被当有效（`:191-199`）。
- `addEpisode` 只判 `!selfId`（`:291-294`），随后 `speakerId:selfId`（`:321`）。
- `E_PERSONA_IDENTITY_UNKNOWN` 不存在（M1 `git grep` 0）；只有 `E_PERSONA_UNAVAILABLE`。
- 非法 `abc` 被规范成 `self:abc` 写入（Memory 报告 0024/0026 实测）。
- 多 active `E_SELF_CONFLICT` 来自 Persona `ensureSelf`，不是 addEpisode；Persona 服务降级后 `selfId=self:unknown`，仍写入。
- 无 `E_PERSONA_IDENTITY_INVALID`；ensureSelf 非法 seed 未校验。
- 结论：**REJECT**；错误语义与契约不符。

---

## 11. 测试结果与未覆盖

### 11.1 本轮执行

- 环境：Node v24.19.0 / npm 11.17.0；worktree `/tmp/ei-main-a84c7ba`；HEAD `a84c7ba`；`git status --short` 空。
- `npm test` → **303 tests / 303 pass / 0 fail / 0 skip，exit 0**。
- 临时 DB probes：
  - identity：missing self 自动新建；invalid seed `abc` 接受；多 active 抛 `E_SELF_CONFLICT`。
  - timeline：state 更新、timeline 0。
  - atomic：event=1、appraisal=1 残留。
- 未运行 Memory 全量/契约测试；**NOT RUN**。

### 11.2 未覆盖

- C1–C8 与 16 项矩阵绝大多数无测试。
- `identityOf`、`experiencer_evidence`、`subject_updated_at/source` 无测试。
- `tests/contract.test.mjs:144` 反向断言 `selfId()='self:unknown'`，与契约冲突。
- 无 owner/third_party/group 边界测试。
- 无 timeline/事务失败测试（现有测试未覆盖 `applyCoreAppraisal` 写入与 `recordRuleEpisode` 回滚）。
- 无 session_bindings 主体字段/旧 binding 兼容测试。

---

## 12. 与 Memory 共同契约的差异

| 字段/行为 | Persona 当前 | 契约/Memory 方向 | 差异 |
|---|---|---|---|
| `speaker_id` | 无 | Memory raw 层 | Persona 不提供 |
| `experiencer_type/id` | 无 DB/service；EI-1 纯函数输入（fix 分支） | 共同身份字段 | **NOT_IMPLEMENTED** |
| `subject` | emotion_event TEXT | 仅展示 | 当前可被误当身份；无显式禁止 |
| `selfId` | `self:unknown` sentinel | canonical/null | **冲突** |
| `identityOf` | 无 | 可信身份 | **缺失** |
| `bindingOf` | 无 selfId 校验 | 同源校验 | **缺失** |
| `owner/third_party/group` | 无 | 需映射 | **缺失** |
| `experiencer_evidence` | 无 | 需不可 PATCH 证据 | **缺失** |
| `subject_updated_at/source` | 无 | 需 | **缺失** |
| validityState | 无 | Memory 统一 helper | **未接入** |
| 三维证据 | 无 | evidence/verification/confidence | **未实现** |
| timeline/事务 | 错列/非原子 | 一致 | **缺陷** |

---

## 13. 已确认缺陷、潜在缺陷、证据不足

### 已确认（代码/复现）

1. selfId 返回 `self:unknown`（DB 不可用/行缺失/多 active）。
2. self 缺失时 ensureSelf 新建 self；非法 seed 被接受。
3. bindingOf 无 selfId equality 校验。
4. identityOf / experiencer_evidence / subject_* 不存在。
5. timeline `session_key` 错列，静默失败。
6. `recordRuleEpisode` 非原子，部分写入。
7. Memory addEpisode 接受 `self:unknown`，无 `E_PERSONA_IDENTITY_UNKNOWN`。

### 潜在缺陷

- 无 owner/third_party 接口，Memory 可能回退 self；无显式提升路径，但风险存在。
- session binding 无更新时间/失效/历史，旧绑定可能复用。
- 无 canonical self 校验，非法 seed/旧行可进入服务。
- `subject` 是自由文本，可能被误用为身份，虽然当前无直接路径。

### 证据不足

- Memory 全量/契约测试未本轮执行。
- Memory M1 与 validity 分支行为可能不同（service 代码相同，validity 分支仅新增 helper）。
- 生产安装/DSHA 未验证。
- Channel Bridge 实际 conversation/session 行为未读。

---

## 14. 对共同契约的结论

- **契约文本方向：ACCEPT_WITH_CHANGES**（Persona 接受核心语义；需补充 session binding 写入责任、subject 字段协议、evidence 接口）。
- **Persona 当前实现：REJECT / NOT_IMPLEMENTED**（C1/C2/C4/C5/C7/C8 与 16 项多数不满足）。
- **整体状态：BLOCKED**：不能以当前 Persona 实现支撑契约；需要 Persona v3、Memory v6、Channel Bridge 协议与负责人决策。
- EI-2A：**NOT_STARTED**；本报告不构成实施授权。

---

## 15. 进入后续实施评审前必须解决的问题

1. 明确 Channel Bridge / Persona 的 session_bindings 写入责任与字段协议。
2. 定义稳定 conversation_id 与 runtime session_id 的映射；私聊/群聊隔离规则。
3. `identityOf(header)` 接口及可信来源；`selfId()` canonical/null；`ensureSelf` 错误语义。
4. `bindingOf` 同源校验与失效/解绑/历史；旧 binding 兼容。
5. owner/third_party/group 身份边界；`person:owner`/群实体/成员 unknown 映射；role_only 禁写稳定身份。
6. `experiencer_evidence` 的可信生成、不可 PATCH 存储、来源/时间/主体绑定。
7. 三维证据（evidence_source/verification_status/confidence_level）与原始分数/intensity/certainty 分离。
8. 历史 cutover、旧记录保留、legacy/unknown 标记、原文不可覆盖。
9. timeline `self_id` 修复、event/appraisal/episode 单事务、错误可观察、历史归属审计。
10. Memory v6 的 validityState/valid_from_kind/superseded_at/raw_meta speaker_id 与统一入口。
11. 测试矩阵：当前 HEAD、临时 DB、身份/会话/证据/历史/timeline/事务；不得以现有 303 测试通过代替契约验证。
12. 契约文本与 Persona v3/Memory v6 的最终版本冻结；负责人 D1/owner 策略。

---

## 16. 证据索引

| 结论 | 证据 |
|---|---|
| 契约版本/commit | 契约分支 `006bb5b`，tree `b460823...`，blob `10a62b64...` |
| Persona main | `a84c7ba`；`npm test` 303/303；worktree `/tmp/ei-main-a84c7ba` |
| selfId | `lib/service.js:64-69`；`lib/self.js:13-41`；`lib/index.js:101,112-115`；临时 probe |
| identityOf/evidence/subject | `git grep` 0 命中；`session_bindings` `lib/bindings.js:22-29` |
| binding | `lib/service.js:126-135`；`lib/bindings.js:14-15`；`lib/inject.js:86-99` |
| owner/group | `lib/scope.js:64-70`；`roleOf` `service.js:141-153` |
| emotion fields | `lib/db.js:173-224`；无 speaker_id/experiencer/owner_scope/scope_type |
| timeline | `lib/emotion.js:645-647`；`lib/db.js:124-134`；临时 timeline probe |
| atomic | `lib/emotion.js:652-730`；临时 atomic probe |
| tests | `/tmp/persona-main-a84c7ba-full.log` 303/303；现有测试未覆盖契约 |
| Memory addEpisode | M1 `lib/service.js:191-199,291-294,321`；无 `E_PERSONA_IDENTITY_UNKNOWN` |
