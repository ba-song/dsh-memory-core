# v1.2.0 R2 · Memory 定向合同复核（audit-06）

- 任务：`MEMORY-V1.2.0-CONTRACT-AUDIT-06`
- 时间：2026-11-22 18:2x–18:5x (Asia/Shanghai)
- 性质：只读复核；未改合同/源码/测试/schema/DB；未迁移/部署；未启动 v6/Persona v3/EI-2A。
- 状态：**READY_FOR_REVIEW**（合同 §7.5.1 文本 PARTIAL；实现多处 NOT_IMPLEMENTED/REJECT）

## 1. 基线

| 项 | 值 |
|---|---|
| Memory 仓库/分支/HEAD | `ba-song/dsh-memory-core` / `feat/m1-preference-memory` / **`7548e49ed0b8d8673818464325d8e72ec7704b27`** |
| tree | `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f` |
| 合同 | 分支 `docs/memory-persona-contract-v1.2.0-owner-review` @ **`5f33bba68b68d5eaf4f265adeba059c85b6f1dcf`** |
| 合同 blob | `bb808e1e5f91e341566d7521c2051e19135df115`（790 行；diff 41+/16-） |
| 测试 | `npm test` @ `7548e49`：258/258 pass、0 fail、0 skip、exit 0（本轮重跑） |
| 已读 | 合同全文（含 R2 diff）；Memory v33/audit-05；Persona/CB 交叉报告；M1 代码 |

## 2. 逐项复核

### 2.1 §7.5.1 是否正确表达 Owner 原则 —— **PARTIAL**

**合同文本（§7.5.1，行 519-531）**：旧记忆整体保留；历史近似记录可进带标记历史通道；unknown 只进不确定历史通道；legacy 不自动 VALID/INVALID、未获批前不得“无标记地”作为当前事实注入；implicit 仅新记录；current/history 隔离；证据状态独立。

**对照 Owner 原则**：
- 旧记忆整体保留：**符合**（明确“不得批量删除、整体排除或统一降级”）。
- 历史近似→历史通道：**符合**（明确带标记、非 confirmed）。
- unknown 只进不确定通道：**符合**（明确不得进入 current-fact）。
- 历史近似≠confirmed：**符合**。
- 旧 numeric confidence 保留：**符合**（“不得直接映射”）。
- cutover 未批准：**符合**（明确不决定 cutover）。

**问题（弱化风险）**：legacy 条写的是“未完成逐类近似规则审查前，不得将其**无标记地**作为当前事实注入”。这暗示“带标记即可进入 current”，与 Owner 第 2 条（历史近似记录走历史回忆/参考通道）和第 4 条（不等于当前事实）存在张力；在逐类规则未批准前，legacy 不应以任何形式进入 current 注入。建议改为“不得进入 current 注入（无论是否带标记）；仅 history 通道”。

**结论**：文本整体正确，但 legacy 一处措辞弱化了边界 → **PARTIAL**。

### 2.2 legacy 在逐类规则批准前的边界 —— **PARTIAL**

- 合同说“可在历史回忆/参考通道中明确标为 legacy/待判定” → 方向正确。
- 但“无标记不得注入 current”未排除“带标记注入 current”；且未定义 current 入口对 legacy 的默认行为（拒绝/跳过）。
- 建议明确：**逐类近似规则获批前，legacy 一律不进入 current 通道；current 入口遇到 legacy 必须过滤并计数/审计**，history 通道必须带 `valid_from_kind=legacy`、`approximated=false`（未批准前不做近似）。
- 现状：`recall.js:71` current 放行 `valid_from IS NULL`（含 legacy 候选行）→ 合同要求与实现冲突。

### 2.3 unknown 是否覆盖所有检索/注入/摘要/合并入口 —— **PARTIAL**

**合同文本**：§7.5（行 494-517）明确“所有实际检索、注入、合并、摘要和决策入口必须遵守统一有效性语义”，并列出 preference/remembered/session-index/handoff/rules/stable/graph/merge/P4/daily/weekly；§7.5.1 明确 unknown 不得进 current；P0-4 列验收入口；P0-1 新增旧/历史负向测试。

**问题**：
- 文本覆盖“所有入口”，但 P0-4 的验收条目未逐入口点明 unknown/legacy 过滤；P0-1 仅覆盖会话隔离路径；**merge/摘要**没有明确“不得消费 unknown/legacy”的测试断言。
- 现状：current recall 注入 `temporal_kind='unknown'` 行（`recall.js:71`）；preference/remembered/session-index/handoff/stable/rules/graph/merge 均无 `valid_from_kind` 判断（前几轮已列）。
- 结论：**PARTIAL**（文本够，验收矩阵不足；实现 REJECT）。

### 2.4 history 通道与自动注入隔离 —— **PARTIAL**

- 合同 §7.5.1 明确“历史通道结果不得被任何普通自动注入入口静默转入 current”；§5.6 明确 Bridge 不得自建/读取 history 通道；方向正确。
- 不足：
  1. 未定义 history 通道的**返回信封**（`channel:'history'` + 必填标记），调用方仍可能只取 `items` 丢标记；
  2. current 注入 API 未要求在收到 history 载荷时**拒绝**（建议 `E_HISTORY_CHANNEL_MISUSE`）；
  3. 未定义 history 结果进入“回忆/参考”工具后的展示约束。
- 建议：history 返回不可静默转换的 typed envelope；current injector 做 channel 断言；markers 必填；测试“把 history 结果喂给 current injector → 拒绝”。
- 现状：无 history 通道；无标记；`recall` 返回行对象（asOf 有 uncertain 数组，但 current 无）。

### 2.5 `received_at` 不得替代 `valid_from` —— **PARTIAL（合同文本正确，实现冲突）**

**合同文本**：§5.2 明确 `event_time` 缺失/非法必须 null，`received_at` 分开保存、不得被 Memory 当作 `valid_from` 替代；§5.6 重申 Bridge 不得决定 `valid_from_kind`，平台时间缺失不得用 `received_at`/当前时间伪造。

**实现事实**：
- `RawArchive`：`const t = Number(event?.time ?? Date.now())`（`lib/ingest/archive.js:426`）→ 缺失事件时间时用 **Date.now()**；该 `t` 用于 day/file/raw `at`，是 received/current 时间的直接替代。
- `addEpisode`：`const at = Number(input?.at ?? 0) || now()`；`createdAt: at`（`lib/service.js:305,330`）→ 若调用方传 received_at，Memory 把它当事件时间/created_at；无 `event_time`/`received_at` 区分字段。
- `p4`：`sourceTs = Date.now()` 默认（`lib/ingest/p4.js:50`）→ 接收时间进入 `source_ts`。
- 现有 schema 无 `event_time`/`received_at`/`time_precision` 列（`schema.js` memories DDL；raw_meta 只有 `at`）。
- **隐含风险**：§7.5.1 的 `implicit` 以 `created_at` 为起点；若 `created_at` 来自 `received_at`，则 `received_at` 经 `created_at` 间接成为 `valid_from`，违反 §5.2 语义。合同未定义 Memory `created_at` 与 Bridge `received_at` 的隔离规则。
- **建议**：合同补一条——Memory `created_at` 只能是 Memory 写入时间（不得取 `received_at`）；`implicit` 仅用于“记录类型允许从写入起有效”且 `created_at` 为写入时间；`event_time` 缺失 → 不得 `exact`；raw/记忆表分别保存 `event_time`/`time_precision`/`received_at`。
- **结论**：合同文本正确，但实现冲突且合同未封死 `created_at` 旁路 → **PARTIAL**。

### 2.6 旧 numeric confidence 与新 `confidence_level` 隔离 / 新行默认 1.0 —— **PARTIAL**

- 合同 §7.5.1/§7.2/§8.1：旧 numeric confidence 原值保留，不得映射到新 `confidence_level`；方向正确。
- 但合同**未明确**新记录默认值：`memories.confidence REAL NOT NULL DEFAULT 1.0`（`schema.js:79`）、`insertMemory` 默认 `Number(rec.confidence ?? 1)`（`memories.js:31`）→ 新行默认 1.0，若读取方按数值解释即“最高置信”，与三维独立/`confidence_level=unknown` 冲突。
- 合同也未要求 `confidence_kind`/新行 numeric 默认 0/unknown；P0-5 只写“原 numeric 保留；新旧模型不可无依据混算”，没有覆盖“新行默认 1.0”。
- 建议：合同补“新记录 `confidence_level='unknown'`，numeric 不得默认 1.0（或必须标 `confidence_kind='unknown'` 且不得被读取为概率）”；P0-5 增加新行默认负向测试。
- 现状：旧值未被迁移（保留）；但新行默认 1.0 风险成立 → **PARTIAL**。

### 2.7 evidence write-once/append-only/触发器/hash 是否仍为 PROPOSAL —— **PASS**

- §7.4（行 476-493）明确 `experiencer_evidence` 名称为 **PROPOSAL**，物理存储/签名/权限“仍需技术设计确认”；合同未把触发器、hash、append-only 写成 Owner 已批准方案。
- 行 743 也标注 Memory 消息级字段及 evidence schema 为 **OPEN/PROPOSAL**。
- 结论：**PASS（文本层面）**；实现不存在（NOT_IMPLEMENTED），但合同未越权。

### 2.8 与当前 Memory 源码的差距 —— **REJECT（实现）/ PARTIAL（合同）**

| 合同要求 | 现状 | 证据 |
|---|---|---|
| `valid_from_kind` 四态 + history/current 隔离 | 无字段；current 注入 NULL/unknown 行 | `schema.js` 无列；`recall.js:71` |
| unknown 不进 current | current 放行 `temporal_kind='unknown'` 且 `valid_from IS NULL` | `recall.js:20,71` |
| legacy 未获批不进 current | 无判定；旧行照常注入 | `recall.js:71` |
| implicit（created_at 可信） | 无字段；`createdAt` 无校验 | `memories.js:24` |
| 三维证据 | 无 `evidence_source/verification_status/confidence_level` | `grep` 0 命中；`schema.js` |
| evidence write-once | 无 `memory_evidence` | `grep` 0 命中 |
| `event_time`/`received_at`/`time_precision` | 无；`Date.now()` 回退 | `archive.js:426`；`service.js:305,330`；`p4.js:50` |
| 旧 numeric 不映射 | 未迁移；新行默认 1.0 | `schema.js:79`；`memories.js:31` |
| 群 transcript 保留 group_id/speaker | 仅 `cwd=GROUP_CWD`、正文拼 speaker | `service.js:551-576` |
| 全入口统一 validity | 8+ 入口各自过滤 | R2 §4；preference/remembered/session-index/handoff/stable/rules/graph/P4/merge |

## 3. 负向测试与验收建议（PROPOSAL，未执行）

| # | 测试 | 预期 |
|---|---|---|
| 1 | legacy 行（valid_from NULL + 合法 created_at） | current 全部入口排除；history 返回 `valid_from_kind=legacy`；原文不变 |
| 2 | unknown 行（created_at 0/非法） | current 排除；history 返回 `validity=UNCERTAIN`+标记 |
| 3 | new 无 validFrom + 合法 created_at | `implicit`；current 可见；带 `implicit` 标记 |
| 4 | new 非法 validFrom | 拒绝 `E_BAD_VALIDITY_TIME`；不落库 |
| 5 | `event_time` 缺失、`received_at` 存在 | 不得 `exact`；`received_at` 不出现在 `valid_from`/created_at 语义 |
| 6 | history 结果喂给 current injector | 拒绝 `E_HISTORY_CHANNEL_MISUSE`；无静默注入 |
| 7 | 全注入入口（12 个） | legacy/unknown/retracted/disputed 均不出现；exact/implicit 出现且带标记 |
| 8 | merge/daily/weekly/P4 候选 | 不消费 legacy/unknown |
| 9 | 旧 numeric confidence | 值 byte 不变；`confidence_level='unknown'` |
| 10 | 新行 confidence | 不为 1.0；`confidence_level='unknown'` |
| 11 | evidence UPDATE/DELETE/PATCH | 拒绝（若该 PROPOSAL 获批）；仅新增更正行 |
| 12 | 迁移前后 | 行数/原文/旧 confidence 一致；失败整体回滚 |

## 4. 建议合同修改（文本）

1. §7.5.1 legacy 条改为：“在逐类近似规则获批前，legacy 不得进入 current 注入（无论是否带标记），只能进入 history 通道并标为 legacy/待判定。”
2. §5.2/§7.5.1 增加：“Memory `created_at` 只能是写入时间，不得取 Bridge `received_at`；`implicit` 不得以 `received_at` 为依据；`event_time` 缺失不得 `exact`。”
3. §7.5.1/§7.6 增加 history channel 的 typed envelope 与 current injector 的拒绝规则（`E_HISTORY_CHANNEL_MISUSE`），markers 必填。
4. §7.1/§7.5.1/P0-5 增加：新记录 `confidence_level='unknown'`，numeric 不得默认 1.0（或必须 `confidence_kind='unknown'` 且读取方不得解释）。
5. P0-4 验收按 12 入口逐项列 unknown/legacy 断言；P0-1 增加 merge/摘要负向测试。

## 5. 未验证 / NOT RUN

- 生产 DB 实际分布；旧行 created_at 完整性；Bridge 实际调用；Memory v6/迁移；真实注入；设备。
- 本报告未新增测试；258/258 仅证明现有基线通过。
- 未决定 cutover 时间/版本、legacy 近似算法、物理 schema、触发器/hash 方案（均为 PROPOSAL/OPEN）。

## 6. 状态

- 本报告：**READY_FOR_REVIEW**
- 合同 §7.5.1：**PARTIAL**（legacy 措辞弱化；received_at/created_at 旁路未封死）
- 当前实现：**REJECT**（current 注入 unknown/legacy；无字段/通道/三维/evidence）
- 合同整体：**CANDIDATE / NOT FROZEN**；Memory v6/Persona v3/EI-2A：**NOT_STARTED**
