# Persona/EI 专项修订建议 · v1.2.0 R4.1 合同修订审查

> 任务：PERSONA-EI-V1.2.0-R4.1-AMENDMENT-REVIEW
> 合同基线：`cf20a50f0bfca8b9182a9e699e223b2359c00319`
> 合同文件：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-R4-CANDIDATE.md`
> 性质：只读；未修改合同/源码/测试/Schema/DB；未迁移/部署；未启动 Persona v3/EI-2A。
> 时间：2026-11-22 20:50 (Asia/Shanghai)
> 状态：**READY_FOR_REVIEW（修订建议）**；R4.1 合同 **BLOCKED（未合入本建议前不建议冻结）**；Persona 实现 **REJECT**。

---

## 0. 结论摘要

R4 已解决上一轮大部分边界问题；R4.1 仍需补 **Persona 时间映射**、**identityOf 最小逻辑输出**、**history/current-state API 契约**、**旧情绪截断限制**、**P0-3/P0-6 可执行验收矩阵**。

| 修订项 | 建议状态 |
|---|---|
| 1 Persona 时间映射 | **REQUIRED** |
| 2 identityOf 最小输出 | **REQUIRED**（逻辑字段）；物理名/错误码 **OPEN** |
| 3 history/current API 边界 | **REQUIRED**；`valid_from_kind`/Memory confidence 套用 **NOT_SUPPORTED** |
| 4 旧情绪截断完整性 | **REQUIRED**；恢复不存在的原文 **NOT_SUPPORTED** |
| 5 P0-3/P0-6 验收补充 | **REQUIRED**；Owner bootstrap/恢复/轮换等仍 **OPEN** |

**建议**：R4.1 合入以下条款后再进入 Owner 冻结审阅；当前实现仍 REJECT，不能以 R4 合同 PASS 代替实现 PASS。

---

## 1. 基线、合同定位与源码证据

| 对象 | 值 |
|---|---|
| 合同 | `cf20a50f0bfca8b9182a9e699e223b2359c00319`；tree `9c363e80982814924714c2cc8f2d152a08d70f30`；blob `1893aed22a13275d7a81250637c1c10b8e6b7caa` |
| 合同章节 | §7.1（442–482）、§7.5（521–552）、§7.5.1（554–571）、P0-3（684–702）、P0-6（735–754） |
| Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| Persona schema | v2（`lib/db.js:14`） |
| Persona 测试 | 303/303 pass（main；仅现有测试，不覆盖 R4.1 语义） |
| 当前实现分支 | main；未用未合并修复分支替代 |

**关键源码：**

- `emotion_timeline`：`self_id/at/valence/arousal/label/intensity/trigger/msg_ref`（`lib/db.js:124-134`）；`at` 是事件时间候选。
- `emotion_state`：`updated_at` 是状态写入时间（`lib/db.js:95-122`）。
- `applyCoreAppraisal`：同一 `at` 更新 state.updated_at/timeline.at；timeline 写入空 catch（`lib/emotion.js:642-647`）。
- `recordRuleEpisode`：event/appraisal/episode 无事务（`lib/emotion.js:652-730`）。
- `emotion_event.excerpt` 写入截断 200 字（`lib/emotion.js:600-605`）；timeline `trigger` 截断 120 字（`:645-646`）。
- `selfId` sentinel（`lib/service.js:64-69`）；`ensureSelf` 自动建/非法 seed/multi active（`lib/self.js:13-41`）；`bindingOf` 只 bound（`lib/service.js:126-135`）；旧 `session_bindings` 无 conversation/evidence（`lib/bindings.js:22-29`）；`inject.writeBinding` 隐式写（`lib/inject.js:86-99`）。
- 无 `identityOf`/Owner identity/link（`git grep` 0）；测试反向断言 sentinel（`tests/contract.test.mjs:144`）。

---

## 2. 修订项 1：Persona 时间映射

**状态：REQUIRED。**

### 2.1 问题

R4 已明确 Memory `created_at`、Bridge `received_at`、`event_time`，但 Persona 仍只有 `at`，合同未说明：

- `emotion_event.at` / `emotion_timeline.at` 是事件时间；
- `emotion_state.updated_at` 是状态写入时间；
- 未来 `created_at` 若存在只表示写入，不得替代事件时间；
- 接收/写入/查询时间不得补事件时间；
- 缺失/不可信事件时间如何保留 unknown/time-uncertain；
- 历史查询如何返回时间质量。

当前代码中 `applyCoreAppraisal` 用同一 `at` 更新 state 和 timeline（`lib/emotion.js:642-647`）；没有事件时间/写入时间分离字段；旧 timeline 只有 `at`；没有 time-quality 标记。

### 2.2 建议条款（PROPOSAL 文本，R4.1 合入）

> **Persona 时间语义（R4.1 建议）：**
> - `emotion_event.at`、`emotion_timeline.at` 表示事件发生时间，不是写入时间、接收时间或查询时间。
> - `emotion_state.updated_at` 表示当前状态被写入/计算的时间，不得作为事件时间。
> - 未来新增的 `created_at` 若表示记录写入/创建时间，不得替代 `at`/event_time。
> - 接收时间、写入时间、查询时间、`Date.now()`、处理时间均不得补造缺失或不可信的事件时间。
> - 缺失/不可信事件时间必须保留为 unknown/time-uncertain；不得默认 exact。
> - 历史情绪查询必须返回时间质量标记（exact/approximate/unknown/legacy 的逻辑语义）；物理字段名 OPEN。
> - unknown-time 历史情绪不得更新/覆盖当前 `emotion_state`；只能通过显式历史参考读取。

### 2.3 验收用例

| 用例 | fixture | 预期 |
|---|---|---|
| 事件时间独立 | event at=100，state.updated_at=200 | 历史查询返回 at=100，写入时间不得当事件时间 |
| 缺失事件时间 | 旧行无可靠 at/时间未知 | 返回 unknown/time-uncertain，不用写入时间补 |
| 查询时间不伪造 | 查询发生在 300，行 at 未知 | 不得返回 at=300 |
| state 更新时间 | state.updated_at=200 | 不得作为 timeline event time |
| 历史查询标记 | 旧 timeline 行 | 返回 history/time-quality 标记 |
| 不更新 state | 历史查询/摘要/重放 | state 不变 |

**风险**：没有该条款，实现可能继续用同一 `at` 写 state/timeline，或在历史查询时用 `Date.now()` 补齐；P0-6 的 time-uncertain 无法测试。

---

## 3. 修订项 2：identityOf 最小输出语义

**状态：REQUIRED（逻辑字段）；物理名/错误码 OPEN。**

### 3.1 建议逻辑输出

```js
identityOf(header) => {
  self: string | null,          // canonical self:<uuid> or null
  owner: string | null,         // owner:<uuid> or null
  subject_type: 'self'|'owner'|'third_party'|'unknown',
  subject_id: string | null,
  valid: boolean,
  confidence: 'stable'|'role_only'|'none', // or id_strength
  reason: 'absent'|'unknown'|'conflict'|'expired'|'revoked'|'invalid'|null,
  source: string,               // provider/entry (logical)
  issued_at: number|null,
  expires_at: number|null
}
```

物理字段名/错误码命名 OPEN；逻辑语义必须稳定可测。

### 3.2 状态矩阵（必须）

| 场景 | self | owner | valid | reason | 允许写 self/owner? |
|---|---|---|---|---|---|
| Self+Owner 正常 | self:<uuid> | owner:<uuid> | true | null | self/owner 按策略；owner episode 政策 OPEN |
| Self 缺失 | null | owner/null | false | absent | 禁止 self |
| Self 非法/sentinel | null | owner/null | false | invalid | 禁止 self |
| 多 active Self | null | owner/null | false | conflict | 禁止 self |
| Owner 缺失 | self | null | false（owner 部分） | absent | 禁止 owner link |
| Owner unknown/平台白名单 | self | null | false | unknown | 禁止推断 owner |
| Header/binding 冲突 | null/不确定 | null | false | conflict | 禁止 |
| binding 过期 | self/null | owner/null | false | expired | 禁止 self |
| binding 撤销 | self/null | owner/null | false | revoked | 禁止 |
| consent 缺失/模糊 | self | null | false | absent/unknown | 禁止 owner link |
| consent 冲突 | self | null | false | conflict | 禁止 owner link |

### 3.3 禁止

- 不得从平台白名单、昵称、头像、单一账号事实推断 Owner canonical ID。
- 不得把 `role`/`cwd`/`private|group`/`source` 单独当 Self/Owner 证明。
- 不得把 `self:unknown` 作为 valid 输出。
- absent/unknown/conflict/expired/revoked 必须有不同 reason（或可区分状态），不能统一 null。

### 3.4 验收

- 每个状态矩阵行一个 fixture；断言字段与 reason。
- 无 owner_identity/owner_account_link 时 `owner=null`，即使平台白名单命中也不得 owner。
- consent 无回复/模糊/冲突/撤销/过期/重绑各一例。

**状态**：逻辑输出 REQUIRED；具体字段名/错误码 PROPOSAL/OPEN；Owner bootstrap/恢复/轮换/owner episode 政策仍 OPEN。

---

## 4. 修订项 3：history query 与 current-state API 边界

**状态：REQUIRED；Memory `valid_from_kind`/confidence 套用 Persona 为 NOT_SUPPORTED。**

### 4.1 建议条款

> - **current-state API**：只允许返回/更新由当前运行期有效事件、已验证身份绑定、可信事件时间产生的结果；不得读取 history 结果来更新 state。
> - **history query API**：只读，显式 `channel='history'`/等价标记；必须返回时间质量、来源、verification/confidence 语义；不得写 `emotion_state`、不得重算 state、不得触发 timeline 写入。
> - **summary/replay API**：不得把 history 结果静默转 current；不得因摘要/重放调用 update state。
> - **禁止套用**：不得把 Memory `valid_from_kind`、`confidence_level`、三维证据字段直接套到 Persona `emotion_event/appraisal/episodes/timeline`；Persona score/intensity/certainty 与 Memory credibility 独立。
> - **Persona 历史情绪**：派生记录不得伪装 `direct_statement`；旧 numeric confidence/certainty 不映射 Memory confidence_level。

### 4.2 验收

| 用例 | 预期 |
|---|---|
| history query 旧行 | 返回 history/time-quality；state 不变 |
| history query 结果传入 current-state API | 明确拒绝，不更新 state |
| 摘要/重放调用 | 不写 state/timeline；只读 |
| 旧 timeline 在窗口内 | 不得因读取被当 current |
| unknown-time 旧行 | 不更新 state；返回 unknown |
| score/intensity/certainty | 保持 Persona 字段，不映射 Memory confidence |
| valid_from_kind | 不写入 Persona 表 |

**风险**：只用“表分离”而没有 API 边界，未来 history 查询/摘要可能复用 state 写入路径；必须用 API 契约隔离。

---

## 5. 修订项 4：旧情绪记录完整性

**状态：REQUIRED；恢复不存在的完整原文 NOT_SUPPORTED。**

### 5.1 事实

- `emotion_event.excerpt` 写入截断 200 字（`lib/emotion.js:600-605`）。
- `emotion_timeline.trigger` 截断 120 字（`lib/emotion.js:645-646`）。
- `emotion_appraisal.cause` 是派生原因，不是原始聊天全文。
- 原始聊天原文在 Memory raw；Persona 不应声称拥有完整原文。

### 5.2 建议条款

> - Persona 旧情绪记录可能只保留截断的 `excerpt`/`trigger`/派生 `cause`；不得承诺恢复不存在的完整原文。
> - 不得用截断字段反推完整原文、时间、身份或证据。
> - 原始聊天/来源由 Memory raw 或受控引用保存；Persona 只保存派生情绪记录与引用。
> - 旧记录缺失来源/时间/身份时保持 unknown；不得编造。
> - 迁移/补全只能追加元数据，不覆盖 `excerpt`/`trigger` 原文；不得把截断文本升级为 direct_statement。

### 5.3 验收

- 旧行 excerpt/trigger 已截断：查询返回现有内容 + `truncated=true`/等价标记（物理名 OPEN）；不得返回“完整原文”。
- 引用缺失：返回 source unknown，不补 Memory raw 全文到 Persona。
- 旧行无时间/身份：保持 unknown；不得用 `at`/created_at 补。
- 补全只写元数据，不覆盖 `excerpt`/`trigger`。

---

## 6. 修订项 5：P0-3 / P0-6 验收补充

**状态：REQUIRED（验收矩阵）；Owner 决策项 OPEN。**

### 6.1 P0-3 补充（identityOf/Owner/Self/binding）

| 用例 | fixture | 预期 | 证据 |
|---|---|---|---|
| Self 缺失 | 空 self 表 | selfId null；identityOf self=null/reason=absent；不建 self | DB 行数不变 |
| Self 非法 | `abc`/`self:`/`self:unknown` seed | null/invalid；不写 | 错误类别 |
| 多 active | 2 active | null/conflict；不降级 sentinel | 错误类别 |
| 并发启动 | 两个初始化 | 不自动建 self；冲突可观察 | 日志/审计 |
| Owner absent | 无 owner_identity | owner=null；平台白名单不生效 | 输出 |
| Consent 无回复 | candidate pending | 不确认 link | 状态 |
| Consent 模糊 | pending + unclear | 不确认 | 状态 |
| Consent 冲突 | 两候选/矛盾证据 | conflict/unknown，不自动选 | 输出 |
| Consent 撤销 | confirmed→revoked | owner=null/revoked；旧 link 失效 | 输出 |
| Consent 过期 | expired | 不确认 | 输出 |
| 重新绑定 | revoked→new request | 需新明确同意 | 状态 |
| Binding 冲突/过期/撤销/证据撤销 | 各 fixture | fail closed；不写 self | 错误类别 |
| identityOf 稳定输出 | 全部状态 | 固定字段/reason | 契约测试 |

### 6.2 P0-6 补充（事务/时间线）

| 用例 | fixture | 预期 | 证据 |
|---|---|---|---|
| recordRuleEpisode 成功 | 正常 DB | event/appraisal/episode 1/1/1 | 行数 |
| event 失败 | 删除/约束 event | 0/0/0 | 回滚 |
| appraisal 失败 | 约束 appraisal | 0/0/0 | 回滚 |
| episode 失败 | 删除/约束 episode | 0/0/0 | 回滚 |
| applyCoreAppraisal 成功 | 正常 | state+timeline 各 1，self_id 正确 | 行数 |
| timeline 列错误 | 旧 schema/错误列 | state 回滚，timeline 0 | 回滚 |
| timeline 表缺失 | drop timeline | state 回滚/失败可观察 | 错误 |
| timeline 约束失败 | 约束 | 回滚 | 错误 |
| 空 catch | 注入错误 | 调用方可见错误/日志 | log |
| 身份切换 | 旧 timeline 旧 self | 不改归新 self；审计 | 查询 |
| history 不影响 state | 历史查询/摘要/重放 | state 不变 | 前后快照 |

### 6.3 可观察证据

- 每项必须有 exit code/断言/行数/错误类别/日志字段；错误码/日志名 OPEN，但语义必须稳定。
- fresh/legacy schema 分别跑；不得只跑 fresh。
- 不得以 303/303、258/258、562/562 代替 P0 验收。

---

## 7. 合同条款定位与建议状态

| 修订项 | R4 章节 | 状态 |
|---|---|---|
| Persona 时间映射 | §7.5/§7.5.1/P0-6 | **REQUIRED** |
| identityOf 最小输出 | P0-3 | **REQUIRED**（逻辑）；物理/错误名 **OPEN** |
| history/current API | §7.5.1/P0-6 | **REQUIRED** |
| Memory 规则不套 Persona | §7.1/§7.5.1/P0-6 | **NOT_SUPPORTED**（禁止） |
| 旧 excerpt/trigger 截断 | P0-6/§7.5.1 | **REQUIRED**；恢复原文 **NOT_SUPPORTED** |
| P0-3/P0-6 验收矩阵 | P0-3/P0-6 | **REQUIRED** |
| Owner bootstrap/恢复/轮换 | §11 | **OPEN** |
| Owner episode/role_only | §11 | **OPEN** |
| Persona Self binding 物理表 | §4.2/§11 | **OPEN/PROPOSAL** |
| 历史情绪物理字段/接口 | P0-6 | **OPEN** |
| Memory confidence NULL Schema | §7.1 | **OPEN/需单独授权** |

---

## 8. 当前实现差距（不影响合同修订，但影响冻结）

| 要求 | 当前 main | 状态 |
|---|---|---|
| at/event_time 与 updated_at 分离 | 同一 `at` 更新 state/timeline（`lib/emotion.js:642-647`） | REJECT |
| history/current API | 无；`timeline()` 只按 at | NOT_IMPLEMENTED |
| identityOf 最小输出 | 无 | NOT_IMPLEMENTED |
| Owner identity/consent | 无 | NOT_IMPLEMENTED |
| self canonical/null | `self:unknown`（`lib/service.js:64-69`） | REJECT |
| no auto-create self | `ensureSelf` 自动建（`lib/self.js:36-41`） | REJECT |
| binding conversation/evidence/status | 旧表无（`lib/bindings.js:22-29`） | REJECT |
| recordRuleEpisode 1/1/1/0/0/0 | 无 tx（`lib/emotion.js:652-730`） | REJECT |
| applyCoreAppraisal 原子 | state 先更新、timeline catch | REJECT |
| 旧 excerpt/trigger 截断 | 200/120 字（`lib/emotion.js:600-605,645-646`） | PARTIAL（需披露） |
| 旧 numeric 不映射 | 无三维；numeric 仍在 | PARTIAL（未实现） |

---

## 9. NOT_RUN / 未验证

- identityOf/Owner/consent/撤销/过期/重绑：无实现，NOT_RUN。
- history/current API、time-quality：无实现，NOT_RUN。
- P0-3/P0-6 故障注入/回滚/日志：未执行。
- fresh/legacy schema 对比：未执行（Persona v3 未启动）。
- 真实 QQ/生产/迁移/Persona v3/Memory v6/EI-2A：NOT_RUN。
- 本轮未运行新测试；Persona main 303/303 仅现有测试。

---

## 10. 结论与建议

- **R4.1 建议：REQUIRED**。至少补 Persona 时间映射、identityOf 最小逻辑输出、history/current API 边界、旧情绪截断限制、P0-3/P0-6 验收矩阵。
- **不建议在合入前冻结**；R4 当前文本方向正确，但这些缺口会导致实现层无法判定 PASS。
- 物理字段名/表名/错误码保持 **OPEN/PROPOSAL**；Owner bootstrap、恢复/轮换、owner episode、role_only、物理 binding 方案不决定。
- 当前 Persona 实现 **REJECT**；合同 PASS ≠ 实现 PASS ≠ 生产 PASS。

**状态**：本修订审查 **READY_FOR_REVIEW**；R4.1 合同 **BLOCKED（待修订合入）**；Persona 实现 **REJECT**；Persona v3/Memory v6/EI-2A **NOT_STARTED**。
