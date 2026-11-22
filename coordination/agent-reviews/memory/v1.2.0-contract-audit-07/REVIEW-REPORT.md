# v1.2.0 R3 · Memory 专项合同复核（audit-07）

- 任务：`MEMORY-V1.2.0-CONTRACT-AUDIT-07`
- 时间：2026-11-22 19:1x–19:5x (Asia/Shanghai)
- 性质：只读复核；未改合同/源码/测试/schema/DB；未迁移/部署；未新增或执行测试。
- 状态：**READY_FOR_REVIEW**（合同文本 §7.1/§7.5.1 基本正确；当前实现 REJECT）

## 1. 唯一复核基线

| 项 | 值 |
|---|---|
| 合同仓库/分支 | `ba-song/dsh-memory-core` / `docs/memory-persona-contract-v1.2.0-owner-review` |
| **合同 commit** | **`571b9d0a466e33b0dccb4b4542e0f8b6539670bc`** |
| 合同文件 | `coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-CANDIDATE.md` |
| 合同 blob | `4ee29758207e435ef70067fe3b4480e2e1eacc56`（与 R2 `bb808e1` 相比 15+/5-） |
| Memory 代码仓库/分支 | `ba-song/dsh-memory-core` / `feat/m1-preference-memory` |
| **Memory HEAD** | **`7548e49ed0b8d8673818464325d8e72ec7704b27`**（tree `3020e9b7…`） |
| 测试 | 本轮**未执行**（任务禁止新增/执行测试）；引用历史基线 258/258，不作为 R3 验收依据 |

## 2. 合同文字正确性（先于实现）

### A. §7.1 confidence 默认策略 —— **PASS（文本）/ PARTIAL（可实施性）**

**R3 新增（§7.1，行 462-469）**：
- 新记录无充分证据/获批规则时 `confidence_level='unknown'`；
- numeric `confidence` 默认必须 `NULL`，不得 `1.0`/`0`/其他数值；
- 旧值原值保留，不回填/重算/映射；
- `unknown`+`NULL` 不等于低置信；
- 不授权修改 Schema/代码/DB。

**一致性核对**：
- §7.2（旧 numeric 不解释）、§7.3（重复不提升）、§7.5（有效性独立）、§8.1（旧值保留）、P0-5（新默认测试）均一致；未发现互相矛盾。
- **可实施性缺口**：当前 schema `memories.confidence REAL NOT NULL DEFAULT 1.0`（`schema.js:79`），且无 `confidence_level` 列。要满足“默认 NULL”必须把列改为 nullable 并新增列，但 R3 明确“不授权修改 Schema/迁移”。这不是合同矛盾，但合同未说明“验收前需另行授权 schema 变更”，容易被误读为无需 schema 变更。建议补一句：**“NULL 默认要求 schema 允许 NULL；该变更未获授权，须另行批准。”**
- 另一歧义：现有调用方显式传 `0.6/0.7/0.8` 等数值；R3 只禁“默认”数值，未说明显式数值是否允许。建议明确：**未获批校准规则的写入不得写 numeric，必须 NULL**；否则显式数值仍可绕过。

### B. §7.5.1 legacy 边界 —— **PASS（文本）**

**R3 修改（§7.5.1，行 540-547）**：
> “在 Owner 对相应数据类别的近似规则明确批准前，legacy 记录一律不得进入任何 current-fact 检索结果、普通注入、current 摘要或 current 合并流程；是否附带标记不改变此禁止。只能通过显式 history/历史参考通道读取。”

- 与 Owner 第 5 条完全一致；堵住了 R2“带标记可进 current”的漏洞。
- “不得因 legacy 缺字段删除/整体排除”仍保留；与 Owner 第 1 条一致。
- history 通道 API/物理实现仍 OPEN；合同已明示。
- 结论：**PASS（文本）**；实现无对应字段/通道（见 §4）。

### C. P0-4/P0-5 —— **PARTIAL（文本覆盖改善，但仍有缺口）**

- P0-4 已增加“逐入口断言 legacy/unknown 不进 current”、history 通道、current 摘要/daily/weekly/merge、received_at/写入时间。较 R2 明显改善。
- 仍缺：
  1. 未明确“current 检索结果”本身（不只注入）对 legacy 的过滤断言；
  2. 未列 **P4 neighbors、stable、rules、episodeRecent、handoff** 的具体 fixtures（只列名称）；
  3. 未要求 current injector 对 history 载荷的**拒绝码**；
  4. 未要求“history 结果不得被下游摘要/合并静默消费”的断言（仅说不得静默转入 current）。
- P0-5 已加“新默认 unknown + numeric NULL；测试新默认/显式未知/旧值保留/NULL 与旧值并存/重复来源不提升”。
- 仍缺：
  1. 现有写入路径（service 0.7、group 0.6、daily/llm 0.6/0.65、p4 candidate、index 0.8 等）的负向测试；
  2. `insertMemory` 把 `null` 转成 1.0 的测试；
  3. `updateMemory` 允许 PATCH `confidence` 的禁止测试；
  4. merge `+0.02` 的禁止测试；
  5. 旧行 numeric 值 byte 不变测试（目前只写语义）。

## 3. 当前实现检查（代码事实）

### B. numeric confidence 默认/重算风险 —— **REJECT**

| 位置 | 事实 | 风险 |
|---|---|---|
| `lib/store/schema.js:79` | `confidence REAL NOT NULL DEFAULT 1.0` | Schema 层默认 1.0 |
| `lib/store/memories.js:31` | `const confidence = round3(Number(rec.confidence ?? 1) * ...)` | **显式 `null` → 被 `?? 1` 转成 1.0**；无值时 1.0 |
| `lib/service.js:330` | `addEpisode` 写 `confidence: 0.7` | 新记录显式数值，未获校准批准 |
| `lib/service.js:646` | `saveGroupTurn` 写 `confidence: 0.6` | 同上 |
| `lib/ingest/p4.js:109/120` | `confidence: candidate.confidence`（默认来自 LLM/规则） | 同上 |
| `lib/consolidate/daily.js:186/199` | `confidence: f.confidence ?? 0.6`、`?? 0.65` | 同上 |
| `lib/consolidate/llm.js:58/77` | 默认 0.6/0.65 | 同上 |
| `lib/index.js:1369` | `confidence: 0.8` | 同上 |
| `lib/ingest/classes.js:15/24/33`、`explicit.js:52` | 0.6/0.55 | 同上 |
| `lib/pref/merge.js:128` | 同极性合并 `confidence + 0.02` | 旧值被重算/提升，违反“旧值不回填/不重算” |
| `lib/store/memories.js:8-12,99-101` | `PATCHABLE_COLUMNS` 含 `confidence`；update 直接写 | 旧值可被 PATCH 改写 |

**结论**：R3 的“NULL 默认、不重算”在当前实现中**完全不成立**；`?? 1` 的 null 转 1.0 是直接违反点。

### C. Legacy/unknown 在 current 入口拦截 —— **REJECT**

- 无 `valid_from_kind`/`approximated` 字段（`schema.js` memories DDL；`grep` 0）。
- 各入口均无 legacy/unknown 判断：
  - recall current：`recall.js:71` 放行 `valid_from IS NULL`（含 `temporal_kind='unknown'`）；
  - preference：`preference.js:40/48`（valid_from 缺失）；
  - remembered：`remembered.js:18`；
  - session-index：`session-index.js:40/67`（仅 valid_to）；
  - handoff：`brief.js:28`（无时间过滤）；
  - episodeRecent：`service.js:271`（仅 status）；
  - rules：`rules.js:113`（无 superseded_by/kind）；
  - stable（含 group）：`stable.js:204`（仅 status）；
  - graph：`graph.js:51/73`（无 kind；unknownHop）；
  - merge：`merge.js:105/116`（仅 valid_to/status）；
  - P4 邻居：`p4.js:93`（bestMatch 无有效性）；
  - daily/weekly：`daily.js:123-128`、`weekly.js:70-75`（status+创建窗）。
- **结论**：R3 要求的“逐入口拦截”不存在；current 会注入 legacy/unknown 行（特别是 `recall.js:71`）。

### D. History 通道 —— **NOT_IMPLEMENTED**

- 无显式 history 通道/API；`recall` 只有 `asOf` 与 uncertain 列表（`recall.js:20,61`），且 asOf 严格路径排除 NULL 起点（旧行无法作为 legacy 历史返回）。
- 无 typed envelope（`channel:'history'`），无 `E_HISTORY_CHANNEL_MISUSE`。
- 结论：history 只能经 asOf 的 uncertain 片段部分满足，legacy 历史不可读；**NOT_IMPLEMENTED**。

### E. created_at / received_at / event_time 语义 —— **REJECT（实现）/ PARTIAL（合同）**

- `archive.js:426`：`const t = Number(event?.time ?? Date.now())` → 缺失事件时间时用 **Date.now()**；
- `service.js:305,330`：`at = Number(input?.at ?? 0) || now()`；`createdAt: at` → 调用方传 received_at 即成为 created_at/事件时间；
- `p4.js:50`：`sourceTs = Date.now()` 默认；
- `memories.js:24`：`createdAt` 缺省 `now()`（group turn/daily/weekly 等未显式传 createdAt 的新行）；
- 无 `event_time`/`received_at`/`time_precision` 列（`schema.js`、`archive.js` raw_meta DDL）。
- 合同 R3 §5.2/§7.5.1/P0-4 已禁“received_at/写入时间冒充事件时间”，但**未明确 Memory `created_at` 的语义**；`implicit` 以 created_at 为起点，若 created_at=received_at/写入时间，仍会绕过。建议补：“Memory created_at 只能是写入时间；implicit 不得以 received_at 为依据；event_time 缺失时不得 exact；仅对‘记录时起有效’的类型允许 implicit。”
- 结论：合同 PARTIAL（缺 created_at 细则）；实现 REJECT（Date.now 回退、`at` 混用）。

## 4. 合同问题 vs 实现问题（分开）

**合同问题**：
1. §7.1 NULL 默认依赖 nullable schema，但合同未声明需另行授权 schema 变更（易被误读）。
2. §7.1 未明确“显式 numeric 数值”是否允许（现有 0.6/0.7/0.8 路径可绕过）。
3. §7.5.1 `created_at` 与 `received_at` 的旁路未封死（implicit 依据未限定）。
4. P0-4/P0-5 缺具体入口 fixtures 与拒绝码（见 §2.C）。

**实现问题**：
1. `insertMemory` `?? 1` 把 null 转 1.0；schema 默认 1.0。
2. 多路显式 numeric（0.6/0.7/0.8 等）；merge +0.02；updateMemory 可 PATCH confidence。
3. 无 legacy/unknown 字段与入口拦截；current 注入。
4. 无 history 通道。
5. Date.now / at / sourceTs 回退，created_at 与事件时间混用。

## 5. 负向测试缺口（PROPOSAL）

| # | 缺口 | 建议断言 |
|---|---|---|
| 1 | 新记录默认 | `confidence_level='unknown'`；`confidence IS NULL`；不得 1.0/0 |
| 2 | 显式 null | `insertMemory({confidence:null})` 不得变 1.0 |
| 3 | 显式 numeric | 未批准校准前，service/group/daily/p4 的 0.6/0.7/0.8 路径应被拒绝或标 unknown（按合同） |
| 4 | 旧值 | 迁移/更新后旧 numeric byte 不变；不得映射 level |
| 5 | updateMemory | `confidence` 不在 PATCHABLE 或 PATCH 被拒 |
| 6 | merge | 同源重复不得 `+0.02`/增加 evidenceCount |
| 7 | 逐入口 legacy | preference/remembered/session-index/handoff/episodeRecent/rules/stable/graph/merge/P4/daily/weekly/recall：legacy 结果数=0 |
| 8 | 逐入口 unknown | 同上：unknown 结果数=0 |
| 9 | history 隔离 | history 结果喂 current injector → `E_HISTORY_CHANNEL_MISUSE`；markers 保留 |
| 10 | asOf | legacy/unknown 在 asOf 的标记与边界正确 |
| 11 | received_at | event_time=null + received_at 设置 → 不得 exact；created_at 不得取 received_at |
| 12 | 摘要/合并 | daily/weekly/摘要不得消费 legacy/unknown |
| 13 | 迁移 | 未授权迁移时 0 变更；旧值/原文不变 |

## 6. 未决 Owner 决策

1. 是否允许 nullable `confidence` 与新增 `confidence_level` 的 schema 变更（R3 未授权）。
2. 新记录显式 numeric 是否一律禁止（现有 0.6/0.7/0.8 路径）。
3. `created_at` 语义（写入时间 vs 事件时间）与 implicit 适用范围。
4. cutover 时间/版本、legacy 逐类近似规则。
5. history 通道 API 与 `E_HISTORY_CHANNEL_MISUSE` 是否采纳。
6. 物理 schema/触发器/hash（仍 PROPOSAL）。

## 7. 不得执行事项确认

本轮未修改合同/源码/测试/schema/DB；未执行测试、迁移、部署、重启；未新增报告外文件；未连接生产 DB/真实渠道；未创建 Owner ID 或写入任何身份/记忆。

## 8. 状态

- 合同 §7.1：**PASS（文本）/ PARTIAL（可实施性）**
- 合同 §7.5.1：**PASS（文本）**
- 合同 P0-4/P0-5：**PARTIAL（文本覆盖改善，缺口见 §2.C）**
- 当前实现：**REJECT**（confidence 默认/重算、legacy/unknown 未拦截、history 缺失、时间回退）
- 合同整体：**CANDIDATE / NOT FROZEN**
- Memory v6 / Persona v3 / EI-2A：**NOT_STARTED**
