# Persona/EI 专项复核 · v1.2.0 R3 合同审计 07

> 任务：DSHA v1.2.0 R3 · Persona/EI 专项合同复核 audit-07
> 合同：`docs/memory-persona-contract-v1.2.0-owner-review` @ `571b9d0a466e33b0dccb4b4542e0f8b6539670bc`
> 文件：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-CANDIDATE.md`
> 性质：只读；不改合同/代码/测试/Schema/DB；不执行迁移/部署；不启动 Persona v3/EI-2A。
> 时间：2026-11-22 19:25 (Asia/Shanghai)
> 状态：**READY_FOR_REVIEW**；合同 **CANDIDATE / BLOCKED**；Persona 实现 **REJECT / NOT_IMPLEMENTED**。

---

## 0. 结论速览

| 项 | 合同文本 | 当前实现 |
|---|---|---|
| A Memory confidence 默认策略限定 Memory | **PASS（范围）**；**PARTIAL（可实现性）** | Persona 不应套用；当前无该规则 |
| B §7.5.1 排除 Persona 情绪历史 | **PASS** | 不适用（未实现） |
| C 历史情绪/当前 state 隔离可验收 | **PARTIAL** | **PARTIAL**：表分离，无历史标记/接口 |
| D P0-3 Owner/identityOf/binding | **PARTIAL** | **REJECT** |
| E P0-6 事务/原子/故障/可观察 | **PASS（合同）** | **REJECT** |
| F 未把 Persona 物理字段/迁移写成既定 | **PASS** | — |
| G 合同/实现/NOT_RUN 区分 | 见 §8 | 见 §8 |

**总判断**：R3 新增的 Memory confidence 默认策略在 §7.1“Memory 域”下，措辞明确是 Memory 记录，**不应套用到 Persona emotion score/intensity/certainty**；但 `numeric confidence=NULL` 与当前 Memory `NOT NULL DEFAULT 1.0` 冲突，属实现/Schema 依赖，需另批。Persona 实现仍全面不满足；P0-3 的 Owner consent 冲突/撤销与 identityOf 输出仍缺。

---

## 1. 基线与变更

| 对象 | 值 |
|---|---|
| 合同 | `571b9d0a466e33b0dccb4b4542e0f8b6539670bc`；tree `12eae23c4a3b7a5ae7270d759622c215382969be`；blob `4ee29758207e435ef70067fe3b4480e2e1eacc56` |
| 上一版 | `5f33bba68b68d5eaf4f265adeba059c85b6f1dcf` |
| 变更 | 1 file, +15/−5；§7.1 confidence 默认、§7.5.1 legacy、P0-4、P0-5 |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| Persona schema | v2（`lib/db.js:14`） |
| Persona 测试 | main `npm test`：303/303、0 fail、0 skip、exit 0（本轮现有测试；不覆盖新语义） |

**已读**：R3 全文（827 行），重点 §7.1/§7.2/§7.5.1/P0-3/P0-4/P0-5/P0-6；Persona main 源码、Schema、测试；历史报告只作对照。

---

## 2. A. R3 Memory confidence 默认策略是否明确限定 Memory 域

**合同：PASS（范围）/ PARTIAL（可实现性）。**

- R3 新增段落在 `## 7. Memory 域：证据、验证、把握度与有效性` / `### 7.1 三维证据模型` 下（行 430–470）。
- 每个 bullet 明确主语为“**新写入的 Memory 记录**”（行 466–469），不是 Persona 表。
- §7.2 行 480 再次明确：“原始 emotion model score、intensity、certainty 与 memory confidence 分开保存；不得互相替代。”
- §7.2 行 481：旧 numeric confidence 不解释为概率，不映射新等级。
- 因此：**不应**把 `confidence_level='unknown'`/`numeric confidence=NULL` 套到 Persona `emotion_event.confidence`、`emotion_appraisal.confidence`、`emotion_state.certainty`、`emotion_episodes`/`emotion_timeline`。合同文本范围 **PASS**。

**但存在实现/Schema 冲突（PARTIAL）：**
- R3 行 467 要求新 Memory 记录 numeric `confidence` 默认 `NULL`；当前 Memory v5 `memories.confidence REAL NOT NULL DEFAULT 1.0`（`lib/store/schema.js:79`）不能直接满足。
- 合同行 470 明确“上述规则是数据语义合同，不授权修改现有 Schema/代码/数据库或执行迁移”。因此这是**实现前置条件/迁移依赖**，不是已批准的 Schema 变更；不能把 NULL 默认写成已落地。
- Persona 当前 `emotion_appraisal.confidence` 默认 0.5、event 0.5、state 0（`lib/db.js:109,201,215`；`lib/emotion.js:600-615`）；这些是 Persona 模型/规则分数，不是 Memory confidence；合同禁止互相替代，**不得**用 R3 的 Memory 默认去改 Persona 默认。
- 结论：范围 PASS；可实现性 PARTIAL；Persona 不应套用。

---

## 3. B. §7.5.1 对 Persona 情绪历史的排除是否足够明确

**PASS（合同文本）。**

- 标题：`（Owner 已批准原则；仅适用于 Memory）`（行 534）。
- 行 536：仅适用于 Memory `memories` 及有效性/检索/注入/摘要/合并；**不适用于** Persona `emotion_event`、`emotion_appraisal`、`emotion_episodes`、`emotion_timeline`。
- 行 549：Persona 情绪历史独立约束：不得把 `valid_from_kind` 套用到 Persona 时间线；历史情绪是派生记录，不伪装 `direct_statement`；旧 numeric confidence/certainty 不映射 `confidence_level`；时间未知/不可信不得更新/冒充当前 `emotion_state`。
- 行 551：Persona 字段/接口/迁移由专项设计另行审查。

**评价**：排除明确，和 P0-6/Persona 专项边界一致。**PASS**。

---

## 4. C. 历史情绪与当前 `emotion_state` 隔离是否可验收

**合同：PARTIAL；实现：PARTIAL。**

合同要求：

- 行 549/P0-6 行 715：历史/时间未知情绪与当前 `emotion_state` 分离；不得仅凭旧 timeline 数值时间或旧 numeric confidence/certainty 当当前状态。
- 行 551/715：历史情绪字段/查询接口物理方案 OPEN。

可验收性缺口：

1. 没有定义“历史/时间未知”的可判定语义：哪些行属于历史？时间未知如何表示？是 `at` 缺失、精度不足、还是导入来源？
2. 没有定义当前 state 的更新守卫：哪些输入允许更新 `emotion_state`；旧 timeline 读取是否被禁止；历史查询是否只能走独立 API。
3. 没有负向测试：旧 timeline 行不得改变当前 `emotion_state`；历史查询结果不得被 `emotionLine`/当前注入使用；时间未知不得 fallback 到 `at`。
4. 没有定义历史查询输出标记：时间质量、来源、verification、historical_reference 等语义（字段名可 OPEN，语义应定）。
5. 没有定义“身份切换”时历史 timeline 归属：旧 self 的行不能改归新 self；审计规则在 P0-6 提到，但未给字段/查询语义。

当前代码：

- `emotion_state`（`lib/db.js:95-122`）与 `emotion_timeline`（`:124-134`）分表；`emotionLine` 只读 state（`lib/emotion.js:1114-1122`），结构上不会从 timeline 回写 state。
- 但 `emotion_timeline` 只有 `at`，无 `temporal_quality`/`historical_reference`；`timeline()` 按 `at` 窗口返回（`lib/emotion.js:1066-1067`），无法区分历史/时间未知。
- 当前 `applyCoreAppraisal` 更新 state 后写 timeline；timeline 失败不回滚 state（`lib/emotion.js:642-647`），也没有历史标记。
- 结论：合同原则可执行，但物理/接口语义不足；当前只有“分表”，没有“历史参考通道”。**PARTIAL**。

---

## 5. D. P0-3 Owner/identityOf/binding 复核

**合同：PARTIAL；实现：REJECT。**

### 已覆盖（PASS 部分）

- selfId canonical/null；DB 不可用、Self 缺失、多 active、非法 seed fail closed（行 666–668）。
- 首次启动不自动创建未确认 Self；旧 sentinel 非法（行 668–669）。
- binding 校验 canonical self、conversation/runtime-session 关系、evidence、status、有效期；撤销/过期/冲突/证据失效 fail closed（行 670）。
- identityOf 在 Owner/Self 缺失、unknown、header/binding 冲突、binding 过期/撤销时返回 unknown/error（行 671）。
- Owner identity 独立于平台；未明确同意不得确认 Owner link；无回复/含糊不构成同意（行 672）。
- Memory 拒绝 null/sentinel/非法/未验证 self episode，错误类别稳定，断言不落库（行 673）。
- fresh/legacy DB、多启动、并发初始化不自动创建 self（行 674）。

### 缺口（PARTIAL）

1. **Owner identity absent/unknown 独立验收**：P0-3 只说 identityOf 在 Owner/Self 缺失时 unknown；没有独立测试“无 owner_identity 行”“owner_identity.status=absent”“平台账号未绑定 owner”不得被当成 owner。
2. **consent 冲突**：未要求两个候选账号/冲突证据时保持 pending/unknown，不自动选。
3. **consent 撤销/过期/重新绑定**：未要求 confirmed→revoked、link 过期、revoked 后重新申请需新同意；也未要求撤销后 identityOf/binding fail closed。
4. **identityOf 输出稳定性**：合同用“如 identityOf”，具体输出字段/错误类别仍“接口设计确认”；P0-3 无法断言稳定输出。
5. **binding 撤销/过期负向测试**：行 670 有要求，但没有具体测试矩阵（active/expired/revoked/conflict/evidence revoked）。
6. **Owner link 与 binding 交叉**：撤销 owner link 后，已有 binding 是否 invalid？未明确。
7. **P0-3 没提 Owner 身份与 `owner:<uuid>` 解析**：只说 Owner identity 独立；没有明确 `owner:<uuid>` 为唯一 canonical、`person:owner` 仅 legacy；应补。

### 当前实现

- `selfId` sentinel（`lib/service.js:64-69`）；`ensureSelf` 自动建/非法 seed/多 active（`lib/self.js:13-41`；`lib/index.js:112-115`）。
- 无 `identityOf`、无 owner_identity/owner_account_link（`git grep` 0）。
- `bindingOf` 只返回 bound（`lib/service.js:126-135`）；旧 `session_bindings` 无 conversation/evidence/status/expiry（`lib/bindings.js:22-29`）。
- 因此实现 **REJECT**。

---

## 6. E. P0-6 事务/原子/故障/可观察性

**合同：PASS；实现：REJECT。**

合同行 708–716 已明确：

- timeline INSERT 列名与 schema 一致。
- 不允许空 catch。
- `recordRuleEpisode` event/appraisal/episode 同一事务；成功 1/1/1，失败 0/0/0。
- `applyCoreAppraisal` state+timeline 原子；timeline 列错误、表/约束缺失、写入失败故障注入。
- 失败可观察；错误类别/日志；成功行数/self_id/归属；失败无部分成功。
- 身份切换审计，旧 timeline 不改归新 self。
- 历史/时间未知与当前 state 分离；物理 OPEN。
- 不混 EI-2A。

评价：合同验收已足够具体；**PASS（文本）**。仍需实现固定错误码/日志字段（合同允许接口设计确认），但不构成文本阻塞。

当前实现：

- `emotion_timeline` 写入 `session_key`（真实列 `self_id`），空 catch（`lib/emotion.js:645-647`）。
- `recordRuleEpisode` 无 `tx()`（`lib/emotion.js:652-730`）；删除 episodes 后 event=1/appraisal=1 残留。
- `applyCoreAppraisal` 先更新 state 再 timeline；timeline 失败不回滚。
- 测试无 timeline 1 行/0 行、事务回滚断言。
- 结论：**REJECT**。

---

## 7. F. 是否把未批准的 Persona 字段/表/迁移写成既定

**PASS（合同文本）。**

- §7.1 明确候选枚举“物理命名需实现审查”（行 440）；confidence 默认是数据语义，不改 Schema（行 470）。
- §7.5.1 明确仅适用 Memory；Persona 字段/接口/迁移由 Persona 专项另行审查（行 549/551）。
- P0-6 明确历史情绪字段/查询接口物理方案 OPEN（行 715）。
- §4.2 仍称 `persona_self_bindings` 为建议逻辑实体；§11 物理表 OPEN。
- 未发现把 Persona 历史字段/表/迁移写成已批准；`persona_self_bindings` 仍是 PROPOSAL。

**唯一需注意**：R3 的 Memory `numeric confidence=NULL` 默认与当前 Memory schema `NOT NULL DEFAULT 1.0` 冲突；合同已说不改 schema，但实施前必须单独立项，不能把它当已落地或顺手迁移。

---

## 8. G. 合同 PASS / 实现 PASS / NOT_RUN 区分

| 类别 | 结论 |
|---|---|
| 合同文本（A/B/E/F） | **PASS**（A 范围 PASS，可实现性 PARTIAL；B/E/F PASS） |
| 合同文本（C/D） | **PARTIAL**（历史接口语义、Owner consent 冲突/撤销、identityOf 输出） |
| Persona 实现 | **REJECT**：self sentinel/自动建 self；无 Owner/identityOf；旧 binding；timeline 错列/非原子；无历史情绪三维字段 |
| Persona 现有测试 | **PASS（仅现有 303/303）**，不代表合同/P0 验收 |
| Persona v3 / Memory v6 / EI-2A | **NOT_STARTED** |
| 真实 QQ/生产/迁移/绑定/bootstrap | **NOT_RUN** |

---

## 9. 当前实现与 R3 要求差距

| 要求 | 当前 Persona main | 状态 |
|---|---|---|
| selfId canonical/null | `self:unknown`（`lib/service.js:64-69`） | REJECT |
| 缺失/非法/多 active fail closed | 自动建/接受 `abc`；多 active 后 sentinel（`lib/self.js:13-41`） | REJECT |
| Owner `owner:<uuid>`/identity/link | 无 | NOT_IMPLEMENTED |
| consent 缺失/冲突/撤销/过期/重绑 | 无 | NOT_IMPLEMENTED |
| identityOf | 无 | NOT_IMPLEMENTED |
| binding conversation/runtime/evidence/status/expiry | `bindingOf` 只 bound（`lib/service.js:126-135`） | REJECT |
| Runtime↔Self 与 Conversation↔Session 分离 | 旧 `session_bindings` 混用；`inject.writeBinding`（`lib/inject.js:86-99`） | REJECT |
| timeline 列名 | 写 `session_key`，真实 `self_id`（`lib/emotion.js:645`） | REJECT |
| recordRuleEpisode 事务 | 无 tx；失败残留（`:652-730`） | REJECT |
| applyCoreAppraisal state+timeline 原子 | state 更新后 timeline 空 catch | REJECT |
| 历史情绪 evidence/verification/confidence_level | 无（`lib/db.js:203-224`） | NOT_IMPLEMENTED |
| 时间未知历史标记 | 无；timeline 只有 at | NOT_IMPLEMENTED |
| 旧 numeric 不映射 | 无三维；旧 numeric 仍在 | PARTIAL（未实现） |
| 不伪装 direct_statement | 无字段可区分 | REJECT |

代码证据：

- `lib/db.js:14`（schema v2）；`:95-134`（state/timeline）；`:203-224`（appraisal）。
- `lib/service.js:64-69,126-135`；`lib/self.js:13-41`；`lib/inject.js:86-99`；`lib/emotion.js:645-647,652-730`。
- `tests/contract.test.mjs:144` 反向断言 `self:unknown`；无 owner/identityOf/history 测试。
- 本轮 `npm test` 303/303；仅现有测试。

---

## 10. P0-3/P0-6 负向测试缺口

### P0-3

- Owner identity absent/unknown：无独立用例。
- consent 无回复/模糊：合同有，但无具体状态转换断言。
- consent 冲突（两个候选/矛盾证据）：未列。
- consent 撤销/过期/重新绑定：未列。
- identityOf 输出字段/错误类别：未固定。
- binding active/expired/revoked/conflict/evidence revoked：合同有要求，无测试矩阵。
- self 缺失自动创建：合同有，需 fresh/legacy/多启动/并发四类测试。
- Memory 拒绝路径不落库：合同有，需具体错误类别断言。

### P0-6

- `recordRuleEpisode` 成功 1/1/1、失败 0/0/0：合同有，需 fixture（删除 episodes/约束失败）。
- `applyCoreAppraisal` state+timeline 原子：合同有，需 timeline 列错误/表缺失/约束失败注入。
- 空 catch/错误可观察：合同有，需 log/metric/error 断言。
- 身份切换 audit：合同有，需旧 timeline 归属查询。
- 历史/时间未知状态隔离：合同有，需负向测试（旧 timeline 不得改变 state/注入）。
- fresh/legacy schema 差异：P0-6 未明列，建议补。

---

## 11. 未决 Owner 决策 / 不自行决定

- Owner bootstrap 可信入口、恢复/轮换：**OPEN**。
- Owner episode 写入政策：**OPEN / fail closed**；本报告不决定。
- role_only：**OPEN**；本报告不决定。
- Persona Self binding 物理表/字段：**OPEN/PROPOSAL**。
- 历史情绪字段/查询接口/迁移：**OPEN**。
- Memory numeric confidence NULL 默认的 Schema/迁移：**需单独授权**（当前 `NOT NULL DEFAULT 1.0`）。
- cutover/legacy 近似：**OPEN**。
- Persona v3/迁移实施：**NOT AUTHORIZED**。

---

## 12. 测试与 NOT RUN

### 已执行

- Persona main `npm test`：303/303、exit 0。
- 静态核对：R3 diff +15/−5；§7.1 行 430–470；§7.5.1 行 534–551；P0-3 行 665–674；P0-6 行 702–716。
- 历史临时 probe（同 main）：self 缺失自动建、invalid seed、multi active、timeline 0、recordRuleEpisode 1/1 残留；本轮未新增生产/真实绑定。

### NOT_RUN

- Owner/identityOf/consent/撤销测试：无实现。
- Persona self binding/历史情绪字段：无实现。
- timeline/事务故障注入：无测试。
- Memory/Channel 全量测试：未重跑。
- 真实 QQ/生产/迁移/Persona v3/Memory v6/EI-2A：NOT RUN。

---

## 13. 状态与边界

- 本报告：**READY_FOR_REVIEW**。
- 合同 v1.2.0 R3：**CANDIDATE / BLOCKED**（合同 A/B/E/F PASS；C/D PARTIAL；实现 REJECT）。
- Persona 当前实现：**REJECT / NOT_IMPLEMENTED**。
- Persona v3 / Memory v6 / EI-2A：**NOT_STARTED**。
- 未修改合同/代码/测试/Schema/DB；未执行迁移/部署/绑定/bootstrap。

---

## 14. 最终回答

**A. R3 Memory confidence 默认策略是否限定 Memory？**

**是。** §7.1 在 Memory 域下，主语是“新写入的 Memory 记录”；§7.2 明确 emotion score/intensity/certainty 与 memory confidence 分开。**PASS（范围）**。但 `numeric confidence=NULL` 与当前 Memory `NOT NULL DEFAULT 1.0` 冲突，属实现/Schema 前置条件，**PARTIAL（可实现性）**，不能套用到 Persona 情绪字段。

**B. §7.5.1 是否排除 Persona 情绪历史？**

**是，PASS。** 行 534/536 明确仅适用 Memory，排除 `emotion_event/appraisal/episodes/timeline`；行 549 另设 Persona 边界。

**C. 历史情绪/当前 state 隔离是否可验收？**

**PARTIAL。** 原则明确、表结构分离，但缺历史/时间未知的可判定语义、当前 state 更新守卫、历史查询输出标记和负向测试；物理字段/接口 OPEN。

**D. P0-3 是否足够？**

**PARTIAL。** 已覆盖 self/binding/identityOf 主体；缺 Owner identity absent、consent 冲突/撤销/过期/重绑、identityOf 固定输出、binding 撤销/过期测试矩阵。

**E. P0-6 是否足够？**

**PASS（合同文本）。** 已明确 recordRuleEpisode 1/1/1/0/0/0、applyCoreAppraisal state+timeline 原子、故障注入、可观察性、身份切换审计、历史分离。当前实现 **REJECT**。

**合同能否冻结？**

**暂不能。** 合同文本 A/B/E/F PASS、C/D PARTIAL；Persona 实现 REJECT，且 Owner consent 冲突/撤销、历史情绪接口、P0-6 实现均未完成。整体 **BLOCKED**。
