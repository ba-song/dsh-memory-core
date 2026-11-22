# Persona/EI 专项复核 · v1.2.0 R2 定向合同审计 06

> 任务：v1.2.0 R2 · Persona/EI 定向合同复核 audit-06
> 合同：`docs/memory-persona-contract-v1.2.0-owner-review` @ `5f33bba68b68d5eaf4f265adeba059c85b6f1dcf`
> 文件：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-CANDIDATE.md`
> 性质：只读；不改合同/代码/测试/Schema/DB；不执行迁移/部署；不启动 Persona v3/EI-2A。
> 时间：2026-11-22 18:30 (Asia/Shanghai)
> 状态：**READY_FOR_REVIEW**；合同 **CANDIDATE / BLOCKED**；Persona 实现 **REJECT / NOT_IMPLEMENTED**。

---

## 0. 结论速览

| # | 复核项 | 合同文本 | 当前实现 |
|---|---|---|---|
| 1 | §7.5.1 仅限 Memory，排除 Persona emotion_* | **PASS** | 不适用（Persona 未实现该模型） |
| 2 | 历史情绪与当前 `emotion_state` 分离可执行 | **PASS（原则）/PARTIAL（物理接口 OPEN）** | **PARTIAL**：表分离，但无历史标记/接口 |
| 3 | 历史情绪不伪装 direct_statement；旧 numeric 不映射 | **PASS** | **NOT_IMPLEMENTED/REJECT** |
| 4 | 时间未知/不可信不得更新/冒充当前 state | **PASS** | **PARTIAL**：无标记；当前 state 不读 timeline，但无法区分 |
| 5 | P0-3 Owner/identityOf/binding 覆盖 | **PASS（主体）/PARTIAL（consent 负向）** | **REJECT** |
| 6 | 跨平台 consent 负向（无回复/模糊/冲突/撤销） | **PARTIAL** | **NOT_IMPLEMENTED** |
| 7 | P0-6 事务/state+timeline/故障/可观察性 | **PASS** | **REJECT** |
| 8 | 未把 Persona 物理字段/表/迁移写成已批准 | **PASS** | — |
| 9 | R2 与现状差距 | — | 见 §9 |

**总判断**：v1.2.0 R2 已修复上一轮的主要范围问题：§7.5.1 明确排除 Persona emotion_*，P0-3/P0-6 验收明显增强。剩余合同缺口主要是 **Owner consent 的冲突/撤销负向测试** 与 P0-3 的 consent 验收；Persona 当前实现仍全面不满足。

---

## 1. 基线与变更

| 对象 | 值 |
|---|---|
| 合同 | `5f33bba68b68d5eaf4f265adeba059c85b6f1dcf`；tree `881cf17f70e157792f77d615c7c0998d53a33684`；blob `bb808e1e5f91e341566d7521c2051e19135df115` |
| 上一版 | `f06872306a983660a79b036dd852e98826e20ac7` |
| 变更 | 1 file, +41/−16；重点 §5.2/§5.6/§7.5.1/P0-1/P0-3/P0-6 |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| Persona schema | v2（`lib/db.js:14`） |
| Persona 测试 | main `npm test`：303/303、0 fail、0 skip、exit 0（本轮现有测试；不覆盖新语义） |

**已读**：v1.2.0 R2 全文（817 行），重点 §5.6、§7.5.1、P0-3、P0-6；Persona main 源码、Schema、测试；历史报告作为对照，不替代当前证据。

---

## 2. 逐项复核

### 2.1 §7.5.1 是否明确限定 Memory `memories`，排除 Persona emotion_*

**PASS（合同文本）。**

- 标题增加“仅适用于 Memory”（行 527）。
- 行 529 明确：仅适用于 Memory `memories` 及其有效性/检索/注入/摘要/合并入口；**不适用于** Persona `emotion_event`、`emotion_appraisal`、`emotion_episodes`、`emotion_timeline`。
- 行 542 增加“Persona 情绪历史边界”独立约束：不得把 `valid_from_kind` 套到 Persona 时间线；历史情绪是派生记录，不伪装 `direct_statement`；旧 numeric confidence/certainty 不映射 `confidence_level`；时间未知/不可信不得更新/冒充当前 `emotion_state`。
- 行 544 明确 fields/interface/migration 由 Persona 专项另行审查。

**评价**：上一轮指出的“未排除 Persona”已修复。**PASS**。

### 2.2 历史情绪与当前 `emotion_state` 分离是否可执行

**合同：PASS（原则）；PARTIAL（物理接口 OPEN）；实现：PARTIAL。**

- 合同要求“历史/时间未知必须与当前 `emotion_state` 分离”，P0-6 行 705 再次要求；这是可测试的约束。
- 但合同把历史情绪字段/查询接口的物理方案标为 OPEN（行 705），没有给出“如何标记历史/时间未知”的字段或 API。因此可执行性取决于 Persona 专项设计，当前不能算完全闭合。
- 当前代码：
  - `emotion_state` 是当前投影（`lib/db.js:95-122`），`emotionLine` 只读 state（`lib/emotion.js:1114-1122`）；没有从 `emotion_timeline` 回写 state 的路径。这一点结构上支持“历史不更新当前 state”。
  - `emotion_timeline` 只有 `at`（`lib/db.js:124-134`），没有 `temporal_quality/historical_reference`；`timeline()` 只按 `at` 窗口返回（`lib/emotion.js:1066-1067`），无法区分“历史/时间未知”行。
  - 当前 `applyCoreAppraisal` 更新 state 后写 timeline；timeline 失败不会回写 state，但也没有历史标记。
- 结论：合同原则可执行，但需要 Persona v3 定义标记/接口；当前实现只有“表分离”，没有“历史参考通道”。**PARTIAL**。

### 2.3 历史情绪不得伪装 direct_statement；旧 numeric 不映射

**合同：PASS；实现：NOT_IMPLEMENTED / REJECT。**

合同：

- 行 542 明确历史情绪是派生记录，不得 `direct_statement`；旧 numeric confidence/certainty 不得映射 `confidence_level`。
- 行 533 也禁止旧 numeric confidence 直接映射新 `confidence_level`（Memory 侧）。

当前 Persona：

- `emotion_event` 有 `excerpt`（写入截断 200 字，`lib/emotion.js:600-605`）、`confidence/certainty`，无 `evidence_source/verification_status/confidence_level`。
- `emotion_appraisal` 有 `cause/confidence/intensity`，无三维字段（`lib/db.js:203-224`）。
- `emotion_timeline` 的 `trigger` 截断 120 字（`lib/emotion.js:645-646`）；`emotion_state` 有 `certainty/confidence`，不是证据。
- 旧情绪行无法标 historical_record/inference/unknown；无法证明不是 direct_statement。
- 旧 `confidence` 0.5/0.7 仍是 numeric，未映射；但目前也没有 `confidence_level` 可映射，属于“未实现”，不是“已正确分离”。

结论：合同文本 PASS；实现 NOT_IMPLEMENTED（无字段/无来源/无验证），且 `excerpt/trigger` 截断不能被当作完整原文。**REJECT**（按实现）。

### 2.4 时间未知/不可信情绪记录不得更新/冒充当前 state

**合同：PASS；实现：PARTIAL。**

- 合同行 542/705 明确禁止；P0-6 要求历史/时间未知与当前 state 分离。
- 当前 `emotion_state` 与 `emotion_timeline` 分离；`emotionLine` 只读 state，结构上不会从 timeline 回写 state。但：
  - timeline 无 `temporal_quality`/`historical_reference`；`at` 是 `NOT NULL`，无法表达“时间未知”。
  - `timeline()` 只按 `at` 窗口读取；若旧行的 `at` 落在窗口内，无法知道它不可信。
  - 旧 timeline 曾因 `session_key` 错误没有写入；缺失记录不能反推时间。
  - 没有历史参考 API/标记；当前 `emotionAt`/`why` 的窗口查询也不区分历史/时间未知。
- 结论：合同要求明确；当前无字段/接口实现。**PARTIAL / NOT_IMPLEMENTED**，不能算完成。

### 2.5 P0-3 是否覆盖 Owner/identityOf/binding 的 conversation/runtime/evidence/status/expiry/revocation

**P0-3 合同：PASS（主体条款）；PARTIAL（consent 负向）。**

已覆盖（行 659–667）：

- selfId canonical/null；DB 不可用/缺失/多 active/非法 seed fail closed；首次启动不自动创建；旧 sentinel 非法。
- binding 校验 canonical self、conversation/runtime-session 关系、evidence、状态/有效期；撤销/过期/冲突/证据失效 fail closed。
- identityOf 在 Owner/Self 缺失、unknown、header/binding 冲突、binding 过期/撤销时返回 unknown/error。
- Owner identity 独立于平台；未经明确同意不得确认 Owner link；无回复/含糊不构成同意。
- Memory 拒绝 null/sentinel/非法/未验证 self episode，错误类别稳定，断言不落库。
- fresh/legacy DB、多次启动、并发初始化不自动创建 self。

仍缺：

1. Owner consent 的 **冲突** 负向测试：两个平台账号/证据都声称 owner，或 owner link 与既有 link 冲突时，必须 pending/unknown，不得自动选一个。
2. Owner consent 的 **撤销** 测试：confirmed link 撤销后不得再作为 owner；撤销/重绑历史保留；不得自动恢复。
3. `identityOf` 输出结构/错误码仍未冻结（合同说“如 identityOf”，具体错误码“由接口设计确认”）；P0-3 可测但缺少固定断言字段。
4. P0-3 没有明确 Owner identity absent/unknown 的独立验收（只提 Owner identity 独立/未同意不确认）；建议加 `owner identity absent` 与 `owner_account_link pending` 两条。

结论：P0-3 **主体 PASS**；consent 冲突/撤销与 identityOf 固定输出仍 **PARTIAL**。

### 2.6 跨平台账号关联 consent 负向测试（无回复、模糊、冲突、撤销）

**合同：PARTIAL；实现：NOT_IMPLEMENTED。**

合同现有：

- 行 665：无回复/含糊回复不构成同意。
- §2.5/§D3：明确同意才确认；平台账号不自动等于 owner。
- §11：撤销/恢复仍 OPEN。

缺口：

- 没有明确 **冲突** 测试：同一 owner 的两个候选账号、两个账号同时声称 owner、证据互相矛盾时，状态必须 pending/unknown，不得自动合并。
- 没有明确 **撤销** 测试：confirmed 后撤销/解绑，旧 link 不得再用于 owner 识别；历史保留；不得自动重绑。
- 没有明确 **无回复/模糊** 的具体测试数据/状态转换（pending→rejected/unclear）。
- 没有测试 owner link 与 binding 的交叉：撤销后 identityOf/binding 必须 unknown/fail closed。
- 当前 Persona 无 owner 表/consent 表，全部 NOT_IMPLEMENTED。

建议测试矩阵（PROPOSAL）：

1. candidate pending + no reply → 仍 pending，不确认。
2. ambiguous reply（“可能吧/再说”）→ 不确认。
3. conflicting candidates（两个账号）→ 不自动选，状态 conflict/unknown。
4. confirmed → revoked → owner 解析失败，旧链接不生效。
5. revoked → 重新申请 → 需新的明确同意，不能自动恢复。
6. 平台账号变更/多账号 → 每个 link 独立，不自动合并。
7. 撤销后 identityOf/binding 返回 unknown/error，不写 owner episode。

结论：**PARTIAL**；合同只覆盖无回复/含糊，缺冲突/撤销。

### 2.7 P0-6 是否明确要求 recordRuleEpisode 事务边界、applyCoreAppraisal state+timeline 原子、故障注入、可观察性

**P0-6 合同：PASS。**

行 698–705 已明确：

- Timeline INSERT 列名与 schema 一致。
- 不允许空 catch。
- `recordRuleEpisode` event/appraisal/episode 同一明确事务；成功 1/1/1，失败 0/0/0。
- `applyCoreAppraisal` state + timeline 原子提交/回滚；timeline 列错误、表/约束缺失、写入失败故障注入。
- 错误类别/日志可观察；成功行数/self_id/归属；失败无部分成功。
- 身份切换审计；旧 timeline 不静默改归新 Self。
- 历史/时间未知情绪与当前 state 分离；物理方案 OPEN。
- 不混 EI-2A。

剩余：

- 错误码/日志字段仍“接口设计确认”；不阻塞合同原则，但实现验收需固定。
- `recordRuleEpisode` 的具体 tx API（`tx()`）未写；可接受为设计选择，但需实现评审确认。
- 历史情绪字段/查询接口 OPEN；P0-6 只能验收“分离行为”，不能验收物理实现。

结论：**PASS（合同文本）**；当前实现 **REJECT**（见 §9）。

### 2.8 是否把 Persona 情绪历史物理字段/表名/迁移写成已批准

**PASS（合同文本）。**

- §7.5.1 明确 fields/interface/migration 由 Persona 专项另行审查（行 542/544）。
- P0-6 明确历史情绪字段/查询接口物理方案 OPEN（行 705）。
- §4.2 仍称 `persona_self_bindings` 为建议逻辑实体；§11 将 Persona Self binding 物理表列为 OPEN/PROPOSAL。
- 未发现把 `valid_from_kind`/`historical_reference`/`persona_self_bindings` 写成已批准 schema。

**评价**：PASS；本轮未越权冻结物理实现。

---

## 3. 当前实现与 R2 要求的差距

| R2 要求 | 当前 Persona main | 状态 |
|---|---|---|
| selfId canonical/null | 返回 `self:unknown`（`lib/service.js:64-69`） | REJECT |
| 缺失/非法/多 active fail closed | `ensureSelf` 自动创建/接受 `abc`；多 active 后 sentinel（`lib/self.js:13-41`; `lib/index.js:112-115`） | REJECT |
| 不自动创建 self | 0 active 自动 INSERT（`lib/self.js:36-41`） | REJECT |
| Owner `owner:<uuid>`/identity/link | 无 owner 代码/表（`git grep` 0） | NOT_IMPLEMENTED |
| Owner consent 无回复/模糊/冲突/撤销 | 无 candidate/consent/link | NOT_IMPLEMENTED |
| Runtime↔Self 与 Conversation↔Session 分离 | 旧 `session_bindings` 混 persona/role/cwd；无 conversation | REJECT |
| `persona_self_bindings` | 不存在 | NOT_IMPLEMENTED |
| `identityOf` | 不存在 | NOT_IMPLEMENTED |
| binding conversation/evidence/status/expiry | `bindingOf` 只返回 bound（`lib/service.js:126-135`） | REJECT |
| timeline 列名 | 写 `session_key`，真实列 `self_id`（`lib/emotion.js:645-647`） | REJECT |
| recordRuleEpisode 事务 | 无 `tx()`（`lib/emotion.js:652-730`） | REJECT |
| applyCoreAppraisal state+timeline 原子 | state 更新后 timeline 空 catch；失败不回滚 | REJECT |
| 历史情绪 evidence/verification/confidence_level | 无（`lib/db.js:203-224`） | NOT_IMPLEMENTED |
| 历史/时间未知标记 | 无；timeline 只有 `at` | NOT_IMPLEMENTED |
| 旧 numeric confidence 不映射 | 无三维字段；旧 numeric 仍在 | PARTIAL（未实现，不是已正确分离） |
| 旧情绪不伪装 direct_statement | 无字段可区分 | REJECT |

**Schema/测试证据**：

- `lib/db.js:14` schema v2；`:95-134` state/timeline；`:203-224` appraisal 无三维。
- `lib/service.js:64-69,126-135`；`lib/self.js:13-41`；`lib/inject.js:86-99`；`lib/emotion.js:645-647,652-730`。
- `tests/contract.test.mjs:144` 反向断言 `self:unknown`；无 owner/identityOf/history 测试。
- 本轮 `npm test` 303/303；只证明现有测试未回归。

---

## 4. 建议（文本级，PROPOSAL，不修改合同）

1. P0-3 增加 Owner consent 冲突/撤销验收：
   - 两个候选冲突 → conflict/unknown，不自动选；
   - confirmed→revoked 后 identityOf/binding 必须 unknown/fail closed；
   - revoked 后重绑需新的明确同意；
   - owner link 撤销/重绑历史保留。
2. P0-3 增加 Owner identity absent/unknown 与 owner_account_link pending 的独立断言；固定 `identityOf` 输出字段/错误类别（即使错误码命名后定，字段语义先固定）。
3. P0-6 固定 `recordRuleEpisode` 使用明确 `tx()` 的验收；固定 `applyCoreAppraisal` 失败注入用例（列错误/表缺失/约束失败）与 0/0/0 断言。
4. §7.5.1/Persona 边界已明确；建议在 Persona v3 设计里增加最小 `temporal_quality`/`historical_reference` 语义（字段名 OPEN），否则 P0-6 的“历史/时间未知分离”无法测试。
5. 保留旧 `emotion_event.excerpt`/timeline `trigger` 原值；新增元数据不覆盖；不把截断文本当完整原文。
6. 旧 numeric confidence/certainty 只保留原值，不映射 confidence_level；新增三维字段前，旧记录一律 unknown/unverified/historical。

---

## 5. 未决事项（不自行决定）

- Owner bootstrap、恢复、轮换、设备确认：**OPEN**。
- Owner episode 写入政策：**OPEN / fail closed**；本报告不决定。
- role_only 语义：**OPEN**；本报告不决定。
- Persona Self binding 物理表/字段：**OPEN/PROPOSAL**。
- 历史情绪物理字段/查询接口/迁移：**OPEN**。
- person:owner legacy 别名处理：**OPEN**。
- Persona v3 实施/迁移授权：**NOT AUTHORIZED**。

---

## 6. 测试与 NOT RUN

### 已执行

- Persona main `npm test`：303/303、exit 0。
- 静态核对：合同 diff +41/−16；§7.5.1 行 527–544；P0-3 行 653–667；P0-6 行 692–706。
- 临时 DB（历史轮次，同 main）：self 缺失自动创建、invalid seed、multi active、timeline 0、recordRuleEpisode 1/1 残留；本轮未重复新增 probe。

### 未覆盖 / NOT RUN

- Owner bootstrap/consent/撤销测试：无实现。
- identityOf/owner_account_link 测试：无实现。
- persona_self_bindings/旧 session 迁移测试：无实现。
- 历史情绪 evidence/temporal 标记测试：无实现。
- timeline/事务回滚测试：无实现。
- Memory/Channel 全量测试：未重跑。
- 生产/真实 QQ/迁移/Persona v3/Memory v6/EI-2A：NOT RUN。

---

## 7. 状态

- 本报告：**READY_FOR_REVIEW**。
- v1.2.0 合同：**CANDIDATE / BLOCKED**（Persona 实现不满足；P0-3 consent 冲突/撤销与 identityOf 输出仍需补；P0-6 物理历史接口 OPEN）。
- Persona 当前实现：**REJECT / NOT_IMPLEMENTED**。
- Persona v3 / Memory v6 / EI-2A：**NOT_STARTED**。
- 未修改合同/代码/测试/Schema/DB；未执行迁移/部署/绑定/bootstrap。

---

## 8. 最终回答

**v1.2.0 R2 是否已明确 Persona 情绪历史边界？**

**是。** §7.5.1 已明确只适用 Memory `memories`，并逐项排除 Persona `emotion_event`/`emotion_appraisal`/`emotion_episodes`/`emotion_timeline`；Persona 历史情绪独立约束也已写入。**合同 PASS。**

**P0-3/P0-6 是否足够？**

- P0-3 主体已覆盖 Owner/identityOf/binding/evidence/status/expiry/revocation；但 consent 的**冲突/撤销**负向测试、Owner absent/unknown、identityOf 固定输出仍缺，**PARTIAL**。
- P0-6 已明确 tx/state+timeline/故障注入/可观察性/历史分离，**合同 PASS**；当前实现仍 REJECT。

**当前实现能否执行合同？**

**不能。** selfId sentinel、自动建 self、无 Owner/identityOf、旧 binding 混用、timeline 错列/非原子、无历史情绪三维字段；Persona v3 未启动。整体合同 **BLOCKED**。
