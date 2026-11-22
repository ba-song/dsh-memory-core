# v1.2.0 R4 合同 · Memory 专项只读复核

- 任务：`MEMORY-V1.2.0-R4-CONTRACT-AUDIT`
- 时间：2026-11-22 20:2x–20:5x (Asia/Shanghai)
- 性质：只读审查；未改合同/源码/测试/schema/DB；未迁移/部署；未运行测试。
- 状态：**READY_FOR_REVIEW**（合同文本整体强；实现 REJECT；含 PARTIAL 合同缺口）

## 1. 审查基线

| 项 | 值 |
|---|---|
| 合同仓库/分支 | `ba-song/dsh-memory-core` / `docs/memory-persona-contract-v1.2.0-owner-review` |
| **合同 commit** | **`cf20a50f0bfca8b9182a9e699e223b2359c00319`** |
| 合同文件 | `coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-R4-CANDIDATE.md` |
| 合同 blob | `1893aed22a13275d7a81250637c1c10b8e6b7caa`（869 行；相对 R3 新增 current-summary/time/confidence 约束） |
| Memory 代码 | `ba-song/dsh-memory-core` / `feat/m1-preference-memory` @ **`7548e49ed0b8d8673818464325d8e72ec7704b27`**（tree `3020e9b7…`） |
| 测试 | **NOT RUN**（本任务只读；不运行测试） |

## 2. 重点 1：Current / History 隔离

### 2.1 合同文本 —— **PASS（总体）**

R4 §5.6/§7.5.1 明确：
- `legacy`、`unknown` 不得进入任何 current-fact 检索结果、普通注入、current 摘要、handoff 摘要、current merge；
- `publicBrief`/`handoffBrief` 及后续等价出口均属 current-summary API；
- 摘要缓存、handoff payload、下游 merge 必须在入口过滤，不得只在最终 prompt 过滤；
- history 结果只能由显式 history 接口返回，必须保留 typed channel 与标记；
- current injector/summary/merge 收到 history payload 必须拒绝，建议 `E_HISTORY_CHANNEL_MISUSE`（名称 PROPOSAL，拒绝语义为合同要求）。

**判断**：文字上已封住“只在最终 injector 过滤”和“带标记进 current”的漏洞；比 R3 明显加强。

### 2.2 合同缺口 —— **PARTIAL**

1. **history 通道尚未实现，但 legacy 已被禁止进入 current**：R4 要求 legacy 只能走 history；当前无 history 通道（仅 asOf uncertain 片段），过渡期旧记忆可能“既不能 current、也无 history 可读”，与 Owner 第 1 条“不得从检索中一律剔除”冲突。建议加过渡条款：**history 通道上线前，legacy 经显式 `asOf`/uncertain 或临时只读历史接口可读；不得因过滤实现先行使旧记忆不可达。**
2. **history payload 的识别字段未定义**：未规定 `channel:'history'`/`history=true` 等载荷标识，current injector 如何“识别并拒绝”缺少接口约束；建议在合同中固定最小标记（名称 PROPOSAL）。
3. **未点名 Memory `buildDigest`**：R4 只点名 `dyMemory.publicBrief`、`dyMemory.handoffBrief`；Memory 的 `buildDigest`（跨 home+QQ 私聊+群+email 的 raw 摘要）也是 current-summary 出口，未在验收中列名。
4. **`stable`/`carryover`/`shorttermRecent` 未列**：`stable` 的 group memory 块（`stable.js:204`）与 `carryover`（raw，`carryover.js:6-16`）属当前会话输出；`carryover` 按 cwd 隔离（相对安全），但 `stable` 仅按 status，未进入 R4 的逐入口清单。

### 2.3 实现 —— **REJECT**

- 无 `valid_from_kind`/`approximated` 字段（`schema.js` memories DDL；`grep` 0）。
- `recall.js:71` current 放行 `valid_from IS NULL`（含 `temporal_kind='unknown'`）；
- preference `preference.js:40/48`、remembered `remembered.js:18`、session-index `session-index.js:40/67`、handoff `brief.js:28`、episodeRecent `service.js:271`、rules `rules.js:113`、stable `stable.js:204`、graph `graph.js:51/73`、merge `merge.js:105/116`、P4 `p4.js:93`、daily/weekly `daily.js:123-128`/`weekly.js:70-75` 均无 legacy/unknown 判断。
- **`publicBrief` 实现**（`lib/service.js:529-545`）：SQL 仅 `scope_type='public'`，**无 status、无 valid_from/valid_to、无 valid_from_kind**；仅按 `created_at` 做 TTL → 过期/被替代/legacy 的 public 行可直接返回，与 R4 current-summary 约束冲突。
- **`handoffBrief` 实现**（`service.js:673-690` → `handoff/brief.js:24-28`）：todos 仅按 `status` 查，**无时间/有效性/legacy 过滤**；decisions 仅 `status='decided'`；Owner 归属只用于 `isOwner`，无 conversation/授权/用途检查。

**结论**：合同 PASS（总体），实现 REJECT；`publicBrief`/`handoffBrief` 是明确违规点。

## 3. 重点 2：摘要出口

- R4 已将 `publicBrief`/`handoffBrief` 纳入 current-summary API，并要求入口过滤、缓存/payload/merge 过滤，方向正确。
- **Owner todo/decision**：R4 明确“Owner 归属不构成跨 Conversation 自动读取/注入授权；缺少来源/权限/有效性 → fail closed”。但实现 `handoffBrief` 只判断 `isOwner`，未校验 conversation 来源、用途、授权；`brief.js:28` 的 todo 查询无 validity。
- **未列出的 Memory 摘要出口**：`buildDigest`（`lib/inject/digest.js:15-21`，`index.js:1218` 注入 owner）是实际跨会话原文摘要，R4 未点名；`stable` group 块（`stable.js:204`）也未进入逐入口清单。
- **`publicBrief`** 的 public scope 通常不含 owner/third_party 私聊，但包含 legacy/expired/superseded 的 public 行；R4 要求失效过滤，当前无。

**结论**：**PARTIAL**（合同覆盖两个 named API；`buildDigest`/`stable`/实现校验缺口）。

## 4. 重点 3：Confidence

### 4.1 合同 —— **PASS（文本强）**

- §7.1 明确：新记录 `confidence_level='unknown'`、numeric 默认 `NULL`；禁止 `1.0/0/其他`；显式/隐式写入（常数、LLM/规则、merge 加分、默认回填）均禁止；nullable 需另行授权；`NULL` 与 unknown 不等于低置信。
- §7.3/P0-5 补充：重复不提升；旧 numeric 原值保留；不得 PATCH/merge `+0.02`；显式 `confidence:null` 不得经 `?? 1` 变 1.0。
- 合同已明确“当前 `NOT NULL DEFAULT 1.0` 冲突；nullable/迁移需 Owner 授权；未授权时验收 BLOCKED”。**准确**。

### 4.2 合同缺口 —— **PARTIAL**

- **旧记录的 `confidence_level` 取值未定义**：合同只说旧 numeric 保留、不映射；新列在迁移时对旧行应填 `unknown` 还是 `legacy_unclassified` 未说明（影响读取语义与测试）。
- **历史/当前读者如何处理旧 numeric**：合同说“不映射”，但未要求读取方显式忽略（只写语义），存在被下游误当概率的空间；建议加“读取方不得将 legacy numeric 用于排序/门控”。

### 4.3 实现 —— **REJECT**

- `schema.js:79` `confidence REAL NOT NULL DEFAULT 1.0`；
- `memories.js:31` `Number(rec.confidence ?? 1)` → **null → 1.0**；
- 硬编码/规则值：`service.js:330` 0.7、`service.js:646` 0.6、`p4.js:109/120`、`daily.js:186/199` 0.6/0.65、`llm.js:58/77` 0.6/0.65、`index.js:1369` 0.8、`classes.js:15/24/33`、`explicit.js:52`；
- `merge.js:128` 同源 `confidence+0.02`；
- `PATCHABLE_COLUMNS` 含 `confidence`（`memories.js:8-12`），`updateMemory` 可改；
- 无 `confidence_level`/`confidence_kind`。

## 5. 重点 4：时间语义

### 5.1 合同 —— **PASS（文本强）/ PARTIAL（implicit 歧义）**

- §7.5 新增：`created_at`=Memory 写入/创建时间，不是事件/接收/起效时间；`received_at` 仅 Bridge 接收时间，不得复制为 `created_at`/`event_time`/`valid_from`；`event_time` 缺失/非法必须 null/unknown；禁止 `Date.now()`/接收/服务/P4 时间补齐；`implicit` 仅新记录、记录类型确实从创建时有效、created_at 可信；依赖事件时间的记录缺失 event_time → unknown。
- **歧义**：哪些“记录类型”允许 implicit 未列举，也未要求批准清单；写入方可自行声明“本类型从创建起有效”。建议合同要求**显式记录类型白名单/批准规则**，否则 implicit 仍可被滥用。
- 另：`publicBrief` 用 `created_at` 做 TTL（`service.js:537-542`），与“created_at 非事件时间”一致（TTL 是记录时长），但若 TTL 被解释为事实有效期则混淆；建议注释/合同说明 TTL 仅记录保留期。

### 5.2 实现 —— **REJECT**

- `archive.js:426` `Number(event?.time ?? Date.now())` → 缺失事件时间用当前时间；
- `service.js:305,330` `at = input.at || now()`，`createdAt: at` → 调用方传 received_at 即成为 created_at/事件时间；
- `p4.js:50` `sourceTs = Date.now()` 默认；
- `memories.js:24` `createdAt` 缺省 `now()`；
- 无 `event_time`/`received_at`/`time_precision` 列（`schema.js`、raw_meta DDL）。

## 6. 重点 5：验收完整性

### 6.1 R4 改善 —— **PASS/PARTIAL**

- P0-1 增加 `publicBrief`/`handoffBrief` legacy/unknown/history/跨 Conversation/无授权 Owner todo fixtures；要求摘要缓存/payload/下游 merge 在最终注入前拒绝；P0-4 逐入口 fixture；P0-5 显式 null/硬编码/PATCH/merge 加分。**明显接近可执行**。

### 6.2 仍缺的负向测试/API —— **PARTIAL**

1. `buildDigest`（跨会话 raw）未列名；
2. `stable` group 块、`carryover`（raw）未列；
3. `shorttermRecent`（短期记忆）是否属 current-summary 未定义；
4. `publicBrief`/`handoffBrief` 的实现负向测试（status/validity/status+conversation）；
5. `E_HISTORY_CHANNEL_MISUSE` 的载荷识别与拒绝测试（需先定义 marker）；
6. `memory_evidence`（R4 §7.4 仍 PROPOSAL）无验收；
7. `updateMemory` PATCH confidence/旧值不变的测试未点名；
8. `p4`/`merge`/`daily/weekly` 的“旧值不变、不 +0.02”具体断言；
9. 旧行 `confidence_level` 取值测试（见 §4.2）；
10. 迁移“未授权即零变更”测试。

### 6.3 与 Owner 旧记忆保护原则 —— **PARTIAL**

- R4 禁止 legacy 进入 current 检索，但 history 通道未实现；过渡期可能使旧记忆不可达，与 Owner 第 1 条“不得从检索中一律剔除”冲突风险（见 §2.2）。建议加过渡条款。

## 7. 合同歧义、遗漏与风险等级

| # | 问题 | 等级 | 建议 |
|---|---|---|---|
| 1 | legacy 禁 current 但 history 未实现 → 过渡期不可达 | **P1** | 加过渡规则：history 上线前经显式 asOf/临时只读通道可读 |
| 2 | history payload 识别字段未定义 | P1 | 固定 `channel`/`history` 最小标记（PROPOSAL） |
| 3 | `buildDigest`/`stable`/`carryover`/`shorttermRecent` 未列 | P1 | 纳入 current-summary 清单与 fixtures |
| 4 | `publicBrief` 无 status/validity 过滤 | **P0** | 合同已有约束，实现需修 |
| 5 | `handoffBrief` 无 validity/来源/授权检查 | **P0** | 同上 |
| 6 | implicit 记录类型未列举 | P1 | 要求白名单/批准规则 |
| 7 | 旧行 `confidence_level` 取值未定义 | P2 | 明确 unknown/legacy_unclassified |
| 8 | 读取方忽略 legacy numeric 未强制 | P2 | 加“不得用于排序/门控” |
| 9 | `publicBrief` TTL 与事实有效期混淆风险 | P3 | 注释 TTL=记录保留期 |

## 8. 建议修改文本（仅建议，不修改合同）

1. §7.5.1 增加过渡条款：“history 通道实现前，legacy/unknown 仍须通过显式 `asOf`/临时只读历史接口可读，不得因 current 过滤先行使旧记忆不可达。”
2. §7.5.1/§5.6 固定 history payload 最小标记：`channel='history'` + `history=true` + 标记字段；current API 收到即 `E_HISTORY_CHANNEL_MISUSE`。
3. §5.6/P0-1 清单加入 `buildDigest`、`stable`（group）、`carryover`、`shorttermRecent`。
4. §7.5 增加 implicit 记录类型白名单/批准要求（未批准类型默认不得 implicit）。
5. §7.1/§8 明确旧行 `confidence_level` 迁移取值（建议 `unknown` 或 `legacy_unclassified`，二选一需 Owner 批准），并要求读取方不得用 legacy numeric 排序/门控。
6. P0-4/P0-5 补充 `updateMemory` PATCH、`memory_evidence`（若保留 PROPOSAL）、`publicBrief`/`handoffBrief` 实现负向测试。

## 9. 未执行测试及原因

- 本任务只读，未运行 `npm test`、未新增测试；历史 258/258 不作为 R4 验收依据。
- 未验证：生产 DB、真实 Bridge、Memory v6、迁移、设备；均 **NOT_RUN**。

## 10. 是否建议 R4 进入下一轮 Owner 审阅

**建议进入**，但附 6 项修订（§8 第 1–6），并明确：
- §7.1/§7.5.1 文本总体正确；
- 实现与合同差距大（confidence、legacy/unknown、history、时间回退、publicBrief/handoffBrief）；
- history 通道未实现前的过渡规则必须先定，否则与 Owner 旧记忆保护原则冲突。

## 11. 状态

- 合同 R4 文本：**PASS（总体）/ PARTIAL（过渡、payload、清单、implicit、旧行 level）**
- 当前实现：**REJECT**
- 合同整体：**R4 CANDIDATE / NOT FROZEN**
- Memory v6 / Persona v3 / EI-2A：**NOT_STARTED**
- 本报告：**READY_FOR_REVIEW**
