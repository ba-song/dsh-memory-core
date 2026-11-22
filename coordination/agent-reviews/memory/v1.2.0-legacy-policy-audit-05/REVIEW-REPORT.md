# v1.2.0 §7.5.1 Owner 决策落实 · Memory 专项复核报告

- 任务：`MEMORY-V1.2.0-LEGACY-POLICY-AUDIT-05`
- 时间：2026-11-22 18:0x–18:3x (Asia/Shanghai)
- 性质：只读复核；未改合同/源码/测试/schema/DB；未迁移/部署；未启动 v6/Persona v3/EI-2A。
- 状态：**READY_FOR_REVIEW**（含 BLOCKED/NOT_IMPLEMENTED 子项）

## 1. 基线

| 项 | 值 |
|---|---|
| Memory 仓库/分支/HEAD | `ba-song/dsh-memory-core` / `feat/m1-preference-memory` / **`7548e49ed0b8d8673818464325d8e72ec7704b27`** |
| tree | `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f` |
| 合同 | 分支 `docs/memory-persona-contract-v1.2.0-owner-review` @ **`f06872306a983660a79b036dd852e98826e20ac7`** |
| 合同 blob | `8c507716b102070e3532544fc9d1d4abf079de3c`（§7.5.1 已更新） |
| 测试 | `npm test` @ `7548e49`：258/258 pass、0 fail、0 skip、exit 0（本轮重跑） |
| 已读 | 合同全文（790 行，含新 §7.5.1）；Memory R2；Memory v33；Persona/CB 交叉报告；M1 代码 |

## 2. §7.5.1 新条款逐项对照

| 条款 | 当前 Memory 状态 | 判定 |
|---|---|---|
| 旧记忆整体保留，不批量删除/排除/统一降级 | 无删除路径；current recall 放行 `valid_from IS NULL`（`recall.js:71`），旧行仍可被召回 | **PARTIAL**（保留成立；无“历史/不确定”分层） |
| 历史近似记录进入带标记的历史回忆/参考通道 | 无 `valid_from_kind`/`approximated`/历史通道；旧行以普通行注入 | **NOT_IMPLEMENTED** |
| 时间完全未知记录只进入不确定历史通道 | 无专门通道；`temporal_kind='unknown'` 行仍被 current recall 注入（`recall.js:71`）；仅 asOf 把它们放入 uncertain（`recall.js:20,61`） | **REJECT**（当前行为与条款冲突） |
| legacy 不自动 INVALID/VALID；可历史参考、不冒充已确认 | 无 `valid_from_kind`；legacy（NULL）被当有效注入；无标记 | **NOT_IMPLEMENTED** |
| implicit 仅新记录、created_at 需校验 | 无字段；`createdAt` 直接 `Number(...)` 无校验（`memories.js:24`） | **NOT_IMPLEMENTED** |
| 证据状态独立；retracted 不普通注入、disputed 不静默选边 | 无 `verification_status`；无 retracted/disputed 语义 | **NOT_IMPLEMENTED** |
| 保留旧 numeric confidence，不映射至 confidence_level | 旧值未迁移（保留）；但 `confidence` 默认 1.0（`memories.js:31`、`schema.js:79`），无 `confidence_kind`/`confidence_level`，存在被当“高置信”的风险 | **PARTIAL** |

## 3. legacy / unknown / implicit 建议映射（PROPOSAL，未实施）

### 3.1 旧记录（cutover 前）
以“cutover 标记”而非日期判定（cutover 时间/版本 **未批准**，本报告不设定）：
- `valid_from` 为有限数值 > 0 → `exact`。
- `valid_from IS NULL` 且 `created_at_epoch` 为有限值 > 0 → **`legacy`**（近似起点=created_at，`approximated=true`）；这是旧数据的大多数。
- `valid_from IS NULL` 且 `created_at_epoch` 缺失/0/非有限/未来越界 → **`unknown`**（仅不确定历史通道）。
- `valid_from` 存为非数值（TEXT 等）→ **`unknown`**（不能信任；不得静默转 NULL 后当 legacy）。
- 不得以 `temporal_kind='unknown'` 作为 unknown 的唯一依据：该列默认 `'unknown'`（`schema.js:90`），几乎所有新行都命中；它是“未判定”提示，不是时间证据。

### 3.2 新记录
- 显式 `validFrom` 合法数值 → `exact`，并校验 > 0、有限、<= now+容差。
- 无 `validFrom` → `implicit`，仅当 `created_at` 通过同一校验；否则 `unknown` 或拒绝。
- 显式 `validFrom` 非法 → 拒绝（`E_BAD_VALIDITY_TIME`），不写 NULL、不降级。
- 禁止把 implicit 追溯套用于旧记录（Owner 条款）。

### 3.3 迁移建议
- 迁移只读扫描 → 生成候选映射（`legacy`/`unknown`/`exact`）→ 人工/模块交叉核验 → Owner 单独授权 → 事务写入；迁移不得 UPDATE 原文/旧 numeric confidence；只写新列 + 审计。
- 迁移前统计：总数、NULL 时间数、非法时间数、created_at 异常数；迁移后对比；失败回滚。

## 4. 历史通道 vs current-fact 通道（PROPOSAL）

### 4.1 接口
```js
recall(query, {
  channel: 'current' | 'history',   // default current
  asOf?: number,
  scope,
  ...
}) -> {
  channel, items: [{
    id, text,
    validity: 'VALID'|'INVALID'|'UNCERTAIN',
    valid_from_kind: 'exact'|'implicit'|'legacy'|'unknown',
    approximated: boolean,
    evidence_source, verification_status, confidence_level,
    legacy_confidence?: number,     // 原值，仅展示，不参与计算
  }]
}
```
- `current`：仅 `VALID` 且 `valid_from_kind ∈ {exact, implicit}`；`verification_status` 至少 `unverified` 也可注入，但必须带标记；`disputed/retracted` 不进入。
- `history`：允许 `legacy`、`unknown`、`disputed`、`retracted`（带各自标记）；不自动进入普通注入；用于回忆/参考工具。
- 所有注入入口（preference/remembered/session-index/handoff/stable/rules/episodeRecent/graph/merge/P4/daily/weekly）统一走同一 helper；history 结果不得被自动注入。

### 4.2 返回标记
必须返回：`validity`、`valid_from_kind`、`approximated`、`verification_status`、`confidence_level`、`evidence_source`、`legacy_confidence?`。
- `approximated=true` 仅用于 legacy 近似；`unknown` 一律 `validity=UNCERTAIN`。
- 标记不得被调用方丢弃；注入层必须保留（或至少记录审计）。

## 5. 旧 numeric confidence 保留与防误映射（PROPOSAL）

- 保留 `memories.confidence REAL` 原值：迁移不 UPDATE、不重算；旧行继续原值。
- 新增 `confidence_kind`（`legacy_numeric` / `rule_default` / `calibrated` / `unknown`）与 `confidence_level`（unknown/low/medium/high）。
- 迁移：旧行 `confidence_kind='legacy_numeric'`、`confidence_level='unknown'`；**禁止**把 0.5/1.0 映射为 medium/high。
- 新行：`confidence_kind='unknown'`、`confidence_level='unknown'`；数值字段不再默认 1.0（可写 0 或留空，需 schema 允许；至少保证读取方不看数值）。
- 读取规则：只有 `confidence_kind='calibrated'` 才可把数值当概率参考；`legacy_numeric` 仅显示原值；`unknown` 不解释。
- 现有 `confidence` 默认 1.0（`schema.js:79`、`memories.js:31`）必须改：否则新记忆看起来“最高置信”。

## 6. `memory_evidence` write-once 的必要性与可验证方式

**必要性**：合同 §7.4 要求证据可审计、不可由普通 PATCH 篡改；证据是身份/主体判断的依据，若可 UPDATE，则审计链与历史结论不可信。

**可实现方式（PROPOSAL）**：
1. 专用表 `memory_evidence`（append-only）；字段含 `source_id`、`producer`、`produced_at`、`evidence_version`、`integrity`、`supersedes_id`、`retracted_at`。
2. 不入 `PATCHABLE_COLUMNS`；`updateMemory` 对证据字段一律拒绝（`E_EVIDENCE_IMMUTABLE`）。
3. DB 级保护（SQLite）：
   ```sql
   CREATE TRIGGER trg_memory_evidence_no_update
   BEFORE UPDATE ON memory_evidence
   BEGIN SELECT RAISE(ABORT, 'E_EVIDENCE_IMMUTABLE'); END;
   CREATE TRIGGER trg_memory_evidence_no_delete
   BEFORE DELETE ON memory_evidence
   BEGIN SELECT RAISE(ABORT, 'E_EVIDENCE_IMMUTABLE'); END;
   ```
   更正只能新增行 + `supersedes_id`/`retracted_at`。
4. 完整性：对（memory_id, source_id, speaker/experiencer, evidence_source, produced_at, evidence_version）计算 SHA-256 存 `integrity`；读取时校验；可选 HMAC（本地密钥）。
5. 审计：每次写入/撤回/替代记录 actor、reason、batch；只读审计查询。

**可验证测试**：直接 SQL UPDATE/DELETE → 失败；service PATCH → `E_EVIDENCE_IMMUTABLE`；新增更正行后旧行 hash 不变；hash 篡改可检测。

## 7. 负向测试与验收标准（PROPOSAL）

| # | 测试 | 预期 |
|---|---|---|
| 1 | 旧行 valid_from NULL + 合法 created_at | history 通道可见，`legacy`+`approximated=true`；current 不可见；原文不变 |
| 2 | 旧行 created_at=0/非法 | 仅 uncertain history；current 不可见；`validity=UNCERTAIN` |
| 3 | 旧行 valid_from TEXT | unknown；不静默转 NULL |
| 4 | 新行无 valid_from + 合法 created_at | `implicit`；current 可见；非 approximated |
| 5 | 新行非法 validFrom | 拒绝 `E_BAD_VALIDITY_TIME`，无写入 |
| 6 | 旧 numeric confidence | 值不变；`confidence_level='unknown'`；不被当概率 |
| 7 | 新行 confidence | 默认 `unknown`，不写 1.0 |
| 8 | evidence UPDATE/PATCH/DELETE | 拒绝；仅新增更正行 |
| 9 | 旧记忆整体 | 迁移前后行数/原文一致；无批量排除 |
| 10 | 注入入口 | legacy/unknown 不出现在 current 注入；history 工具可查 |
| 11 | asOf | legacy 近似边界正确；unknown 不冒充有效 |
| 12 | 迁移失败 | 整体回滚；version 不前进；原文/置信不变 |

## 8. 与合同/报告的冲突与未决

1. **当前实现 vs §7.5.1**：current recall 注入 `temporal_kind='unknown'` 行（`recall.js:71`），与“unknown 只进不确定通道”冲突 → P0 级差距。
2. **legacy 的 current 行为**：合同已明确“不自动 VALID/INVALID、可历史参考”；具体 current 注入策略仍需迁移设计（OPEN）。
3. **cutover**：未批准；本报告不设定日期/版本。
4. **confidence 默认 1.0**：与“旧值保留、不映射”不冲突（旧值保留），但新行默认 1.0 会让新数据看起来高置信 → 建议改。
5. **历史通道物理实现**：未定（API/表/工具），需与 Persona/CB 对齐。

## 9. 已实现 / 建议 / 未验证

- **已实现**：旧记忆未被删除；current recall 仍可回忆旧行；numeric confidence 未被重算（无迁移）。
- **建议**：§3–§7 的映射、通道、标记、confidence 字段、evidence 触发器、测试矩阵。
- **未验证**：生产 DB 实际分布；旧行 created_at 完整性；v6 迁移；真实注入；Bridge 调用。All **NOT_RUN**。

## 10. 状态

- 本报告：**READY_FOR_REVIEW**
- 合同：**CANDIDATE / NOT FROZEN**
- Memory v6 / Persona v3 / EI-2A：**NOT_STARTED**
- 未修改合同/源码/测试/schema/DB；未迁移/部署。
