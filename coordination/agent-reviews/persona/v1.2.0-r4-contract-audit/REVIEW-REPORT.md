# Persona/EI 专项只读复核 · v1.2.0 R4 合同审计

> 任务：DSHA v1.2.0 R4 合同只读复核（Persona/EI）
> 合同：`docs/memory-persona-contract-v1.2.0-r4-owner-review` @ `cf20a50f0bfca8b9182a9e699e223b2359c00319`
> 文件：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-R4-CANDIDATE.md`
> 审查性质：只读；未修改合同/源码/测试/Schema/DB/配置；未执行迁移/部署/绑定/bootstrap。
> 时间：2026-11-22 20:35 (Asia/Shanghai)
> 状态：**READY_FOR_REVIEW**（Persona 专项）；合同 **R4 CANDIDATE / 可进入下一轮 Owner 审阅（附 1 项时间语义澄清）**；实现 **REJECT / NOT_IMPLEMENTED**；整体 **BLOCKED**。

---

## 0. 结论速览

| 审查项 | 合同 R4 | 当前实现 |
|---|---|---|
| 1. 历史情绪与当前 state 边界 | **PASS** | **PARTIAL**（表分离，无 history 标记/API；无负向测试） |
| 2. 时间语义 | **PARTIAL**（Memory/Bridge 清楚；Persona `at` 未映射） | **REJECT/PARTIAL** |
| 3. Self/Owner/Consent | **PASS（主体）/ PARTIAL（identityOf 字段/错误名未定）** | **REJECT/NOT_IMPLEMENTED** |
| 4. 事务/时间线 | **PASS** | **REJECT** |
| 5. 合同 vs 实现 | 合同基本可审 | **REJECT**；303/303 仅回归 |

**建议**：R4 可进入下一轮 Owner 审阅；建议仅补一条 **Persona 时间字段映射**（`emotion_* at` = event_time，写入时间/接收时间不得替代；history query 必须带 time-quality 标记）。不建议在实现未完成时冻结或宣称 PASS。

---

## 1. 审查基线

| 对象 | 值 |
|---|---|
| 合同 | `cf20a50f0bfca8b9182a9e699e223b2359c00319`；tree `9c363e80982814924714c2cc8f2d152a08d70f30`；blob `1893aed22a13275d7a81250637c1c10b8e6b7caa` |
| 上一版 | `571b9d0a466e33b0dccb4b4542e0f8b6539670bc`（R3） |
| R4 文件 | `coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-R4-CANDIDATE.md`（868 行） |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| Persona schema | v2（`lib/db.js:14`） |
| Persona 测试 | main `npm test`：303/303、0 fail、0 skip、exit 0（现有测试；不覆盖 R4 语义） |
| 当前实现分支 | 审查以 Persona main 为准；未使用未合并修复分支替代 |

**已读**：R4 全文（868 行），重点 §5.2/§5.6/§7.1/§7.2/§7.5/§7.5.1/P0-1/P0-3/P0-4/P0-5/P0-6；Persona main 源码、Schema、测试。

---

## 2. 历史情绪与当前状态隔离

**合同：PASS；实现：PARTIAL。**

### 合同

R4 已明确：

- §7.5.1 仅适用 Memory `memories`，排除 Persona `emotion_event`/`emotion_appraisal`/`emotion_episodes`/`emotion_timeline`（行 554/556）。
- Persona 历史情绪独立约束：历史情绪是派生记录，不得伪装 `direct_statement`；不得把 `valid_from_kind` 套到 Persona 时间线（行 571）。
- P0-6：历史/时间未知的 Persona 情绪必须与当前 `emotion_state` 分离；历史查询必须显式标 history/historical；unknown-time 必须返回 unknown/time-uncertain；历史查询不得更新/重算/覆盖当前 state；当前 state 只由符合当前规则、身份绑定、时间条件的有效事件更新（行 748–752）。
- 明确要求负向测试：unknown-time 不改变 state；history query 不进入 current-state API；旧 timeline 不因读取/摘要/重放触发状态更新；身份切换不改归（行 752）。

**评价**：合同边界明确，**PASS**。

### 实现

- `emotion_state`（当前投影，`lib/db.js:95-122`）与 `emotion_timeline`（历史，`:124-134`）分表；`emotionLine` 只读 state（`lib/emotion.js:1114-1122`），没有从 timeline 回写 state 的路径。结构上“历史不更新当前”有基础。
- 但 `emotion_timeline` 只有 `at`，无 `temporal_quality`/`historical_reference`；`timeline()` 只按 `at` 窗口返回（`lib/emotion.js:1066-1067`），无法区分 history/current。
- 没有 history query API；`emotionAt`/`why` 的读取语义未标历史/时间质量。
- 没有 R4 要求的负向测试（旧 timeline 改变 state、history 进入 current API、重放触发状态等）。
- 结论：**PARTIAL**；仅“分表”不等于“历史参考通道”。

---

## 3. 时间语义

**合同：PARTIAL；实现：REJECT/PARTIAL。**

### 合同

R4 已明确 Memory/Bridge：

- `Memory created_at` 仅记录写入/创建时间，不是事件发生/接收/起效时间（行 540）。
- `Bridge received_at` 仅接收时间；不得替代 `created_at`/`event_time`/`valid_from`（行 541）。
- `event_time` 仅平台/来源事件时间；缺失/非法/精度不明必须 null/unknown；不得用 `Date.now()`/`received_at`/调用/P4 时间补齐（行 542）。
- `implicit` 仅新记录、记录类型本身从创建时有效、`created_at` 可信；不得把接收/写入时间伪装为事件时间（行 543）。
- 缺可信时间不得仅凭 `created_at` 提升 current（行 544）。

**缺口**：R4 没有明确 **Persona** 的 `emotion_event.at`/`emotion_timeline.at` 对应 `event_time`，也没有明确 `emotion_state.updated_at`/future `created_at` 是“写入时间”而非事件时间。P0-6 行 749 只说“缺失/不可信的事件时间”，但未映射到 Persona 的 `at`。建议补一句：

> Persona `emotion_event.at`/`emotion_timeline.at` 表示事件时间；`emotion_state.updated_at` 或未来 `created_at` 只表示写入时间；两者不得互相替代；历史查询必须返回 time-quality 标记。

**评价**：Memory/Bridge 时间语义 PASS；Persona 映射缺失，**PARTIAL**。

### 实现

- `emotion_timeline.at INTEGER NOT NULL`（`lib/db.js:124-134`）；无 `created_at`/`received_at`/`event_time` 区分。
- `applyCoreAppraisal` 用调用方 `at` 写 state.updated_at/timeline.at（`lib/emotion.js:642-647`）；无事件时间/接收时间字段。
- `emotion_state.updated_at` 是写入时间；但它与 timeline at 同一 `at`，没有语义分离。
- 旧 timeline 可能因 `session_key` 错误缺失；缺失不能反推时间。
- 结论：**REJECT/PARTIAL**；当前无法表达 unknown-time，也没有写入时间/事件时间边界。

---

## 4. Self / Owner / Consent

**合同：PASS（主体）/ PARTIAL（identityOf 固定字段与错误名）；实现：REJECT/NOT_IMPLEMENTED。**

### 合同

R4 P0-3 已明确：

- selfId canonical/null；DB 不可用、缺失、多 active、非法 seed fail closed（行 690–693）。
- 首次启动不自动创建；旧 sentinel 非法（行 692–693）。
- binding 校验 canonical self/conversation/runtime-session/evidence/status/expiry；撤销/过期/冲突/证据失效 fail closed（行 694）。
- identityOf 在 Owner/Self 缺失、unknown、header-binding 冲突、binding expired/revoked 时 unknown/error（行 695）。
- Owner identity 独立于平台；未明确同意不得确认 Owner link；无回复/含糊不构成同意（行 696）。
- Memory 拒绝 null/sentinel/非法/未验证 self episode；错误类别稳定、不落库（行 697）。
- Owner identity absent/unknown 独立负向测试；不得从平台白名单/昵称/单一账号推断（行 698）。
- Consent 无回复/模糊/冲突不得确认；撤销/过期/重新绑定必须有状态转换与旧 link 失效测试（行 699）。
- identityOf 必须固定输出字段/错误类别，覆盖 absent/unknown/conflict/expired/revoked（行 700）。
- Binding 撤销/过期/冲突/证据撤销/Consent 撤销/过期后旧 link/binding 不得作为可信身份（行 701）。
- fresh/legacy/多次启动/并发不自动创建 self（行 702）。

**评价**：P0-3 主体和 consent 生命周期已补齐，**PASS**。

**仍 PARTIAL**：合同要求 `identityOf` 固定输出字段/错误类别，但没有给出具体字段/错误名；把“固定”交给接口设计。若 R4 的意图是给 Owner 审阅的合同，建议至少列出最小字段语义（即使物理名 OPEN），否则实现仍无法验证“稳定输出”。

### 实现

- `selfId()` 返回 `self:unknown`（`lib/service.js:64-69`）；DB 不可用/缺失/多 active 都 sentinel。
- `ensureSelf` 0 active 自动建 self（`lib/self.js:36-41`）；非法 seed `abc` 接受；多 active 抛 `E_SELF_CONFLICT` 后 `lib/index.js:112-115` 降级 state.self=null，service 仍 sentinel。
- 无 `identityOf`；无 Owner `owner:<uuid>`/owner_identity/owner_account_link/consent（`git grep` 0）。
- `bindingOf` 只返回 `bound:true`（`lib/service.js:126-135`）；旧 `session_bindings` 只有 session_id/persona_id/role/cwd/source/created_at（`lib/bindings.js:22-29`）。
- `tests/contract.test.mjs:144` 反向断言 `self:unknown`；无 Owner/identityOf/consent 测试。
- 结论：**REJECT/NOT_IMPLEMENTED**。

---

## 5. 事务与时间线完整性

**合同：PASS；实现：REJECT。**

### 合同

P0-6 已明确：

- timeline INSERT 列名与 schema 一致（行 741）。
- 不允许空 catch（行 742/745）。
- `recordRuleEpisode` event/appraisal/episode 同一事务；成功 1/1/1、失败 0/0/0（行 743）。
- `applyCoreAppraisal` state+timeline 原子；timeline 列错误、表/约束缺失、写入失败故障注入（行 744）。
- 错误类别/日志可观察；成功行数/self_id/归属；失败无部分成功（行 745–746）。
- 身份切换 audit；旧 timeline 不改归新 Self（行 747）。
- 历史/时间未知与当前 state 分离；历史查询标记；不得用写入/查询时间补事件时间（行 748–752）。
- 历史情绪字段/查询接口物理 OPEN（行 753）。

**评价**：合同验收明确，**PASS**。

### 实现

- timeline 写入 `session_key`（真实列 `self_id`），空 catch（`lib/emotion.js:645-647`）。
- `recordRuleEpisode` 无 `tx()`（`lib/emotion.js:652-730`）；删除 episodes 后 event=1/appraisal=1 残留。
- `applyCoreAppraisal` 先更新 state 再写 timeline；timeline 失败不回滚 state（`lib/emotion.js:642-647`）。
- 无 P0-6 负向测试。
- 结论：**REJECT**。

---

## 6. 合同与实现差异

| R4 要求 | 当前 Persona main | 状态 |
|---|---|---|
| selfId canonical/null | `self:unknown`（`lib/service.js:64-69`） | REJECT |
| 不自动建 self | `ensureSelf` 0 active 新建（`lib/self.js:36-41`） | REJECT |
| 非法 seed/multi active fail closed | `abc` 接受；多 active 后 sentinel（`lib/self.js:13-41`；`index.js:112-115`） | REJECT |
| Owner `owner:<uuid>`/identity/link | 无 | NOT_IMPLEMENTED |
| Consent 无回复/模糊/冲突/撤销/过期/重绑 | 无 | NOT_IMPLEMENTED |
| identityOf 固定输出/错误 | 无 | NOT_IMPLEMENTED |
| binding canonical/conversation/evidence/status/expiry | `bindingOf` 只 bound（`lib/service.js:126-135`） | REJECT |
| Runtime↔Self 与 Conversation↔Session 分离 | 旧 `session_bindings` 混用；`inject.writeBinding`（`lib/inject.js:86-99`） | REJECT |
| timeline 列名 | `session_key` vs `self_id`（`lib/emotion.js:645`） | REJECT |
| recordRuleEpisode 事务 | 无 tx；部分写入 | REJECT |
| applyCoreAppraisal state+timeline 原子 | state 更新后 timeline catch | REJECT |
| 历史情绪 evidence/verification/confidence | 无（`lib/db.js:203-224`） | NOT_IMPLEMENTED |
| 历史/时间未知标记 | 无；timeline 只有 at | NOT_IMPLEMENTED |
| 旧 numeric confidence 不映射 | 无三维字段；旧值仍在 | PARTIAL（未实现） |

---

## 7. 遗漏与建议文本

### 建议 R4 补一条 Persona 时间映射（不修改合同）

> **Persona 时间语义（建议文本）：** Persona `emotion_event.at`/`emotion_timeline.at` 表示事件时间；`emotion_state.updated_at` 与未来 `created_at` 只表示写入时间，不得替代事件时间。缺失/不可信的事件时间必须返回 time-uncertain/unknown；历史查询不得用写入时间或查询时间补齐。具体字段/接口仍 OPEN。

### 其他建议

1. P0-3 的 `identityOf` 固定输出/错误类别：建议至少列最小字段语义（self_id/owner_id/subject/valid/reason），错误码名称可 OPEN。
2. P0-6 的“历史查询 API”物理名 OPEN 可接受；但建议明确“current-state API 只能由当前事件更新”的调用边界，避免实现把 timeline 读入 state。
3. 旧 emotion `excerpt`/timeline `trigger` 已被截断（200/120 字）；合同应明确 Persona 旧记录不承诺完整原文，原始原文在 Memory raw。
4. Memory `confidence=NULL` 默认与当前 `NOT NULL DEFAULT 1.0` 冲突，R4 已正确标为独立 Schema 授权；需在实施前单独立项，不得用 0/0.5/1.0 绕过。

---

## 8. P0-3/P0-6 负向测试缺口

### P0-3

- Owner identity absent/unknown：合同有，需具体 fixture/状态。
- Consent 无回复/模糊/冲突/撤销/过期/重绑：合同有，需状态转换测试。
- identityOf 固定输出/错误：合同有，字段/错误名未定。
- binding active/expired/revoked/conflict/evidence revoked：合同有，需矩阵。
- self 缺失自动创建：合同有，需 fresh/legacy/多启动/并发。
- Memory 拒绝不落库：合同有，需具体错误类别断言。

### P0-6

- recordRuleEpisode 1/1/1 与 0/0/0：合同有，需 fixture（删除/约束失败）。
- applyCoreAppraisal state+timeline 原子：合同有，需列错误/表缺失/约束失败注入。
- 空 catch/错误可观察：合同有，需 log/metric/error 断言。
- 身份切换 audit：合同有，需旧 timeline 归属查询。
- 历史/时间未知隔离：合同有，需负向测试。
- fresh/legacy schema 差异：建议补。

---

## 9. 未决 Owner 决策（不自行决定）

- Owner bootstrap 可信入口、恢复/轮换：OPEN。
- Owner episode 写入政策：OPEN / fail closed。
- role_only：OPEN。
- Persona Self binding 物理表/字段：OPEN/PROPOSAL。
- 历史情绪字段/查询接口/迁移：OPEN。
- Memory `confidence=NULL` 的 Schema/迁移：需单独授权。
- cutover/legacy 近似：OPEN。
- Persona v3 实施：NOT AUTHORIZED。

---

## 10. 测试与 NOT_RUN

### 已执行

- Persona main `npm test`：303/303、exit 0。
- 静态核对：R4 868 行；§5.2/§5.6 时间/摘要边界；§7.1 行 442–482；§7.5 行 521–552；§7.5.1 行 554–571；P0-3 行 684–702；P0-6 行 735–754。
- 历史临时 probe（同 main）：self 缺失自动建、invalid seed、multi active、timeline 0、recordRuleEpisode 1/1 残留；本轮未新增生产/真实绑定。

### NOT_RUN

- Owner/identityOf/consent 测试：无实现。
- Persona self binding/历史情绪字段：无实现。
- timeline/事务故障注入：无测试。
- Memory/Channel 全量：未重跑。
- 真实 QQ/生产/迁移/Persona v3/Memory v6/EI-2A：NOT RUN。

---

## 11. 状态与建议

- Persona 专项：**READY_FOR_REVIEW**。
- R4 合同：**CANDIDATE / 可进入下一轮 Owner 审阅（附 1 项时间映射澄清）**。
- Persona 实现：**REJECT / NOT_IMPLEMENTED**。
- Persona v3 / Memory v6 / EI-2A：**NOT_STARTED**。
- 未修改合同/代码/测试/Schema/DB/配置；未迁移/部署/绑定/bootstrap。

---

## 12. 是否建议 R4 进入下一轮 Owner 审阅

**建议：YES（有条件）。** R4 已明显补齐 R3 的 P0-3 consent 生命周期、P0-6 事务/历史隔离、Memory confidence 默认与 legacy 边界；合同文本可进入下一轮 Owner 审阅。条件：

1. 补一条 Persona `at`/event_time/write-time 映射（本报告 §7 建议文本）。
2. P0-3 的 identityOf 最小输出字段语义建议列明（错误码名可 OPEN）。
3. 明确 R4 通过只代表合同文本，不代表 Persona 实现/迁移/生产 PASS。

**当前实现不能宣称合同 PASS**；需 Persona v3 另批实施。
