# Persona/EI 专项复核 · v1.2.0 §7.5.1 Owner 旧记忆原则落地审计 05

> 任务：v1.2.0 §7.5.1 Owner 决策落实后的 Persona 边界复核
> 合同：`docs/memory-persona-contract-v1.2.0-owner-review` @ `f06872306a983660a79b036dd852e98826e20ac7`
> 文件：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-CANDIDATE.md`
> 性质：只读；不改代码/Schema/DB/合同；不执行迁移；不启动 Persona v3/EI-2A。
> 时间：2026-11-22 18:15 (Asia/Shanghai)
> 状态：**READY_FOR_REVIEW**；合同 **CANDIDATE / BLOCKED（Persona 实现不满足，P0 验收需补）**。

---

## 0. 结论速览

| 复核项 | 合同文本 | 当前 Persona 实现 |
|---|---|---|
| §7.5.1 限定在 Memory 有效性/检索/注入 | **PARTIAL**：语义明显偏 Memory，但未明确排除 Persona `emotion_timeline` | **NOT_IMPLEMENTED**：Persona 无对应字段/标记 |
| 历史情绪保留原文/来源，inference/unknown 不伪装 direct_statement | **PARTIAL**：原则正确，但未专门定义 Persona 情绪记录类别 | **REJECT**：无 evidence_source/verification_status；旧情绪只有 numeric confidence/certainty |
| 时间未知情绪需独立历史参考标记，避免当当前状态 | **PARTIAL**：合同只讲旧记忆通道，未定义 Persona timeline | **NOT_IMPLEMENTED**：timeline 只有 `at`；无 temporal/historical 标记 |
| §9 P0-3/P0-6 验收是否足够 | **PARTIAL**：方向对，缺 Owner/identityOf/binding/tx 细节 | **REJECT**：Self 门禁、timeline、事务均未修 |

**总判断**：f068723 的 §7.5.1 文本比 1dced58 更完整，未弱化 Owner 旧记忆保护；但**仍未明确该节只适用于 Memory `memories` 的有效性/检索/注入，不适用于 Persona `emotion_timeline`**。Persona 当前实现无历史情绪来源/验证/时间质量字段，P0-3/P0-6 也缺验收细节。合同不能冻结。

---

## 1. 基线与变更

### 1.1 基线

| 对象 | 值 |
|---|---|
| 合同 | `f06872306a983660a79b036dd852e98826e20ac7`；tree `39ca5e9da0e919861f4eb500183f8a8b9e1fcdb6`；blob `8c507716b102070e3532544fc9d1d4abf079de3c` |
| 上一版 | `1dced58a8093222a70853668fca6cf35cf7674ed` |
| 变更 | 仅 `§7.5.1`：+10 / −8 行；其余条款未变（`git diff --stat`：1 file, 10 insertions, 8 deletions） |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| Persona schema | v2（`lib/db.js:14`） |
| Persona 测试 | main `npm test`：303/303、0 fail、0 skip、exit 0（本轮现有测试；不覆盖新语义） |

### 1.2 合同新增内容（§7.5.1，行 519–531）

新增明确：

- 旧记忆整体保留：不批量删除/整体排除/统一降级；原文与 numeric confidence 原值保留，不把旧 numeric confidence 映射成新 `confidence_level`。
- 历史近似记录：可进入带“历史近似/时间不确定”标记的历史回忆/参考通道；不等于 `confirmed`，不代表当前事实。
- `valid_from_kind='unknown'`：仅进入不确定历史回忆/参考通道；不得普通 current-fact 注入；不得单独支撑重要决策。
- `legacy`：不自动 INVALID/VALID；可历史回忆；具体近似另行设计。
- `implicit`：仅新记录；不得追溯旧记录。
- 证据状态独立：`unverified/supported/confirmed/disputed/retracted` 与时间类型分离；retracted 不普通注入；disputed 不静默选边。
- 禁止伪造来源/时间/身份/证据；缺失保持 unknown。
- 明确不决定 cutover/迁移；当前实现与合同不一致应登记差距。

**结论**：文本方向符合 Owner 旧记忆保护；但**没有出现“Persona emotion_timeline”或“不适用于 Persona 运行期情绪历史”的排除句**。

---

## 2. 逐项复核

### 2.1 §7.5.1 是否清楚限定在 Memory 记忆有效性和检索/注入语义

**合同：PARTIAL；实现：NOT_IMPLEMENTED。**

- 文本使用 `valid_from_kind`/`current-fact`/`普通注入`/`历史回忆通道`，语义明显是 Memory `memories` 的有效性/检索/注入。
- 但 §7.5.1 开头只说“本节所列旧记忆保护原则”，没有明确：
  - 仅适用于 Memory `memories`（以及未来 Memory 历史通道）；
  - 不适用于 Persona `emotion_timeline`/`emotion_event`/`emotion_appraisal`；
  - Persona 运行期 timeline 不是 `valid_from_kind` 的载体。
- 风险：实现者可能把 `valid_from_kind`/`historical` 标记直接套到 Persona emotion 表，或把旧 timeline 当作 Memory 旧记忆迁移；这与 Persona 的“当前情绪状态”和“历史情绪事件”职责冲突。
- 建议文本（PROPOSAL）：
  > 本节仅适用于 Memory `memories` 及其检索/注入/合并/摘要入口。Persona `emotion_event`、`emotion_appraisal`、`emotion_episodes`、`emotion_timeline` 是运行期情绪历史，不适用 `valid_from_kind`；其历史标记、当前状态分离和事务完整性由 §9 P0-6 与 Persona v3 设计另行规定。
- 结论：**PARTIAL**，需要明确 scope；否则不能算“清楚限定”。

### 2.2 历史情绪记录如何保留原始内容和来源，避免 inference/unknown 伪装 direct_statement

**合同：PARTIAL；实现：REJECT。**

当前 Persona 表：

- `emotion_event`：`actor/subject/target/excerpt/confidence/certainty/payload_json`；`excerpt` 写入时截断 200 字（`lib/emotion.js:600-605`）。
- `emotion_appraisal`：`cause/target/confidence/intensity/...`；无 `evidence_source/verification_status/confidence_level`（`lib/db.js:203-224`）。
- `emotion_timeline`：`self_id/at/valence/arousal/label/intensity/trigger/msg_ref`；`trigger` 截断 120 字（`lib/emotion.js:645-646`）。
- `emotion_state`：当前投影，含 `certainty/confidence`，不是历史证据。

问题：

1. 无 `evidence_source`：无法标 direct_statement/direct_observation/historical_record/inference/unknown。
2. 无 `verification_status`：无法标 unverified/supported/confirmed/disputed/retracted。
3. 无 `confidence_level`：`confidence`/`certainty` 是模型/规则数值，不能代替判断把握。
4. 旧 emotion 行是**派生情绪记录**，不是原始聊天；原始原文在 Memory raw。不能把 Persona `excerpt`/`trigger` 当 direct_statement。
5. `excerpt`/`trigger` 已被截断；不得声称保存了完整原文，也不得用截断文本补全来源。
6. 旧 `confidence` 0.5/0.7 不得映射成 medium/high；合同 §7.5.1 已禁止旧 numeric 映射，Persona 同样适用。

建议：

- 保留现有 `excerpt/trigger/cause` 原值，不覆盖、不再截断已有行；新字段只追加元数据。
- 旧情绪行默认 `evidence_source='historical_record'` 或 `inference`（按产生路径），`verification_status='unverified'`，`confidence_level='unknown'`；不得默认 `confirmed`。
- 对“汐推测主人难过”这类记录，标 `inference`，不得 `direct_statement`；即使重复引用也不升 confirmed。
- Persona 不复制 Memory raw 原文；通过 `source_ref/msg_ref` 引用 Memory/渠道来源，保留可追溯性。
- 新表字段/迁移属 Persona v3，本报告不实施。

结论：合同原则正确但未给 Persona 专门定义；当前实现 **REJECT**（无字段、无法区分）。

### 2.3 时间未知的情绪记录是否需要单独历史参考标记，避免作为当前情绪状态

**合同：PARTIAL；实现：NOT_IMPLEMENTED。**

当前：

- `emotion_timeline.at INTEGER NOT NULL`（`lib/db.js:124-134`）；没有“时间未知”表达；旧 timeline 若因 `session_key` 错列根本没写入，无法从缺失推断时间。
- `emotion_timeline` 读取按 `at>=now-hours`（`lib/emotion.js:1066-1067`）；旧/未知时间行不会自动被标历史，可能被当作近期行（若 at 在窗口内）。
- `emotion_state` 是当前投影；`emotionLine` 直接注入当前 state（`lib/emotion.js:1114-1122`）；没有“历史参考”标记。
- 旧 timeline 记录可能因错误路径缺失，不能把“没有行”当“没有情绪”；也不能把 `at` 数值当可信时间。

建议：

- Persona v3 增加历史情绪质量字段（候选）：`temporal_quality`（exact/approximate/unknown）、`historical_reference`（bool/status）、`evidence_source`、`verification_status`、`confidence_level`；旧行默认 unknown/legacy。
- 当前 `emotion_state` 只由当前/已确认事件更新；历史/时间未知行只进历史参考查询，不进当前 `emotionLine`/当前 state。
- `emotion_timeline` 读取 API 分离：`currentWindow()` 与 `historicalReference()`；时间未知返回明确标记，不按 `at` 当当前。
- 旧 timeline 不重写/不补造 `at`；缺失记录保留缺口。
- 具体字段/物理迁移属 Persona v3，OPEN；本报告不实施。

结论：合同没有定义 Persona timeline 的历史标记；实现 **NOT_IMPLEMENTED**，需要明确。

### 2.4 §9 P0-3/P0-6 验收是否足够，是否遗漏身份/事务风险

**P0-3：PARTIAL。**

已覆盖：

- selfId canonical/null；DB 不可用/缺失/多 active/非法 seed fail closed。
- 首次启动不自动创建；旧 sentinel 不合法。
- binding 验证 canonical self/evidence；Memory 拒绝 null/sentinel/非法/未验证 self episode。

遗漏：

1. **Owner 身份门禁未纳入 P0-3**：D3 已批准 `owner:<uuid>`/Persona 管理 owner identity/link；P0-3 只校验 self，未要求 owner absent/unknown、平台账号不自动等于 owner、owner_account_link 未明确同意不确认。
2. **identityOf 未列验收**：§4.3 有 identityOf 语义，但 P0-3 只提 binding；缺 identityOf 的 unknown/HEader/binding conflict/expiry 测试。
3. **binding 验收不完整**：未明确 conversation mapping 匹配、status/expiry/revoked、evidence 撤销/过期、identity conflict 的负向测试。
4. **Memory addEpisode 错误码**：未要求具体断言 `E_PERSONA_IDENTITY_UNKNOWN/INVALID/MISSING` 与“不落库”。
5. **Self 缺失自动创建的负向路径**：未要求 fresh/legacy DB、多次启动、并发下“不创建”。

**P0-6：PARTIAL。**

已覆盖：

- timeline 列名/schema；不得空 catch；event/appraisal/episode 原子；状态+timeline 不部分成功；成功行数/self_id；故障注入 0/0/0；身份切换审计；不混 EI-2A。

遗漏：

1. **`recordRuleEpisode` 明确 tx 边界**：只说“需要原子性时”，可能被实现成部分事务；应明确 `tx()` 包 event+appraisal+episode，成功 1/1/1、失败 0/0/0。
2. **`applyCoreAppraisal` state+timeline 原子**：未给具体失败注入点（timeline 列错误/表缺失/约束失败）和回滚断言。
3. **错误可观察性**：未要求 log/metric/错误码；只说“不允许空 catch”。
4. **身份切换审计字段**：未定义 audit 表/查询/旧 timeline 归属规则。
5. **旧 timeline 历史标记**：P0-6 未覆盖 §7.5.1 的“历史参考 vs 当前状态”分离；应加 `temporal_quality/historical_reference` 或明确不在 P0-6 范围。
6. **测试基线**：未要求覆盖 fresh/legacy schema 差异、旧行缺列、空表。

结论：P0-3/P0-6 方向正确，但验收条款不足以冻结；需补 P0-3（Owner/identityOf/binding/Memory error）与 P0-6（tx/state+timeline/可观察性/旧 timeline）条款。

---

## 3. 当前实现与新合同原则的具体差距

| 合同原则 | 当前 Persona main | 状态 |
|---|---|---|
| canonical self/null，不自动创建 | `selfId` 返回 sentinel；`ensureSelf` 自动建 | **REJECT** |
| 非法 seed/multi active fail closed | 非法 seed 接受；multi active 后 sentinel | **REJECT** |
| Owner `owner:<uuid>` 由 Persona 管理 | 无 owner 代码/表 | **NOT_IMPLEMENTED** |
| 跨平台必须明确同意 | 无 candidate/consent/link | **NOT_IMPLEMENTED** |
| Runtime↔Self 与 Conversation↔Session 分离 | 旧 `session_bindings` 混用；无 conversation | **REJECT** |
| `persona_self_bindings` | 不存在 | **NOT_IMPLEMENTED** |
| `identityOf` | 不存在 | **NOT_IMPLEMENTED** |
| 历史情绪 evidence_source/verification/confidence_level | 无 | **NOT_IMPLEMENTED** |
| 时间未知历史标记 | 无；timeline 只有 at | **NOT_IMPLEMENTED** |
| timeline 列名/空 catch | `session_key`/空 catch | **REJECT** |
| event/appraisal/episode 原子 | 无 tx；失败残留 | **REJECT** |
| 旧 numeric confidence 不映射 | 当前无三维；旧 numeric 仍为 confidence | **PARTIAL** |
| 旧情绪不伪装 direct_statement | 无字段可区分 | **REJECT** |

源码证据：

- `lib/service.js:64-69`（self sentinel）；`:126-135`（binding 只 bound）。
- `lib/self.js:13-41`（自动创建/非法 seed/multi active）。
- `lib/bindings.js:22-29`（旧 session schema）。
- `lib/inject.js:86-99`（隐式写 binding）。
- `lib/db.js:14`（schema v2）；`:124-134`（timeline）；`:173-224`（emotion 表，无 evidence/三维）。
- `lib/emotion.js:645-647`（session_key/空 catch）；`:652-730`（无 tx）。
- `tests/contract.test.mjs:144`（反向断言 sentinel）。

---

## 4. 建议的合同修订（文本级，PROPOSAL）

1. §7.5.1 加 scope：
   > 本节仅适用于 Memory `memories` 的有效性/检索/注入语义；Persona `emotion_timeline` 等运行期情绪历史不适用，另由 P0-6/Persona v3 规定。
2. §7.5.1 加 Persona 历史情绪类别：
   > Persona 旧情绪记录是派生历史，应标 `historical_record`/`inference`/`unknown`；不得标 `direct_statement`；旧 numeric confidence/certainty 不映射 confidence_level。
3. §7.5.1 加时间未知标记：
   > Persona 时间不可信的情绪记录不得进入当前情绪状态；必须通过独立历史参考通道并显式返回时间质量标记。
4. §9 P0-3 加：
   - Owner identity absent/unknown；owner_account_link 未明确同意不确认；
   - identityOf unknown/header/binding conflict/expiry；
   - binding conversation/evidence/status/expiry；
   - Memory addEpisode `E_PERSONA_IDENTITY_*` 具体断言/不落库；
   - fresh/legacy/多启动/并发不自动创建。
5. §9 P0-6 加：
   - `recordRuleEpisode` tx 包 event/appraisal/episode，成功 1/1/1、失败 0/0/0；
   - `applyCoreAppraisal` state+timeline 原子与失败回滚；
   - 错误 log/metric/错误码；
   - 身份切换 audit 字段/旧 timeline 归属；
   - 历史情绪时间质量/当前状态分离（如纳入 P0-6）。

---

## 5. 未解决问题 / 不决定事项

- Owner bootstrap、恢复、轮换、设备确认：**OPEN**；本报告不决定。
- Owner episode 写入政策：**OPEN / fail closed**；本报告不决定。
- role_only 政策：**OPEN**；本报告不决定。
- 旧 session_bindings 迁移/退役、Persona v3 schema、历史通道物理实现：**OPEN**。
- cutover 时间/版本、legacy 近似算法：**OPEN**。
- Owner 账号关联撤销/恢复流程：**OPEN**。

---

## 6. 测试、NOT RUN、状态

### 已执行

- Persona main `npm test`：303/303、0 fail、0 skip、exit 0。
- 临时 probes：self 缺失自动创建、invalid seed、multi active、timeline 0、recordRuleEpisode event=1/appraisal=1。
- 合同 diff：仅 §7.5.1 变化（+10/−8）。

### 未覆盖 / NOT RUN

- Persona 历史情绪 evidence_source/verification_status/confidence_level：不存在，无法测。
- 时间未知情绪历史标记：不存在。
- identityOf/Owner bootstrap/owner_account_link/consent：不存在。
- persona_self_bindings/旧 session_bindings 迁移：不存在。
- timeline 正确写入/事务回滚：无测试。
- 真实 QQ/生产/Persona v3/Memory v6/EI-2A/迁移：NOT RUN。

### 状态

- 本报告：**READY_FOR_REVIEW**。
- v1.2.0 合同：**CANDIDATE / BLOCKED**。
- Persona 当前实现：**REJECT / NOT_IMPLEMENTED**。
- Persona v3 / Memory v6 / EI-2A：**NOT_STARTED**。
- 未修改代码/Schema/DB/合同；未执行迁移/绑定/bootstrap。

---

## 7. 最终回答

**§7.5.1 是否清楚限定在 Memory 记忆有效性和检索/注入语义？**

**部分清楚，但不够明确。** 文本的 `valid_from_kind`/current-fact/历史通道语义明显是 Memory；但没有一句话排除 Persona `emotion_timeline`，存在被误套用的风险。建议加明确 scope 后再冻结。

**历史情绪/时间未知记录是否可继续当前状态使用？**

**不可以。** 当前没有 evidence/verification/time-quality 字段；旧 numeric confidence 不能当 confidence_level；时间未知/历史近似记录应只进历史参考，不得作为当前情绪状态或 current-fact 注入。

**P0-3/P0-6 是否足够？**

**不够。** P0-3 缺 Owner identity/account link、identityOf、binding conversation/evidence/expiry、Memory error 断言；P0-6 缺 recordRuleEpisode tx 边界、state+timeline 原子、错误可观察性、身份切换 audit、旧 timeline 标记。需补条款后再冻结。
