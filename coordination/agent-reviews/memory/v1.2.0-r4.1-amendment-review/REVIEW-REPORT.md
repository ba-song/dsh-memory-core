# v1.2.0 R4.1 · Memory 专项修订建议（只读）

- 任务：`MEMORY-V1.2.0-R4.1-AMENDMENT-REVIEW`
- 时间：2026-11-22 20:2x–21:0x (Asia/Shanghai)
- 性质：只读；未改合同/源码/测试/schema/DB；未迁移/部署；未运行测试。
- 状态：**READY_FOR_REVIEW**（仅修订建议）

## 1. 基线

| 项 | 值 |
|---|---|
| 合同仓库/分支 | `ba-song/dsh-memory-core` / `docs/memory-persona-contract-v1.2.0-r4-owner-review` |
| **合同 commit** | **`cf20a50f0bfca8b9182a9e699e223b2359c00319`** |
| 合同文件 | `coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.2.0-R4-CANDIDATE.md` |
| 合同 blob | `1893aed22a13275d7a81250637c1c10b8e6b7caa`（869 行） |
| Memory 代码 | `feat/m1-preference-memory` @ `7548e49ed0b8d8673818464325d8e72ec7704b27`（tree `3020e9b7…`） |
| 测试 | **NOT_RUN**（本轮只读，不运行测试） |

## 2. R4.1 修订建议

### 2.1 History 过渡条款 —— **REQUIRED（必须补）**

**合同定位**：R4 §7.5.1（行 560-567）、§5.6（行 409-412）、P0-1（行 660-665）。

**问题**：R4 已禁止 legacy/unknown 进入 current，并要求只能走 history；但 **history API/通道尚未实现**（源码 `grep history` 无对应接口；仅 `recall` 的 `asOf` + uncertain 片段）。过渡期旧记忆可能“current 不可用、history 不可达”，与 Owner 第 1 条“不得从检索中一律剔除”冲突。

**源码证据**：
- `lib/recall/recall.js:20,61`：`TEMPORAL_UNKNOWN_SQL` 仅用于 asOf uncertain；
- `lib/recall/recall.js:71`：current 放行 `valid_from IS NULL`；
- 无 `valid_from_kind`/`history` 服务（`grep` 0）。

**建议条款（PROPOSAL 文本，REQUIRED 补入）**：
> **R4.1-1 过渡只读通道**：在正式 history API 获 Owner 批准并验收前，Memory 必须提供显式、只读、带不确定性标记的历史参考读取（仅限调用方明确指定 `history/reference` 用途）；该通道不得进入 current retrieval、current injection、current summary、current merge，不得修改旧原文、旧 numeric confidence、来源或时间信息。通道返回必须含 `valid_from_kind`（legacy/unknown 如实标记）、`approximated`（未批准前为 false/unknown）、`verification_status`、`confidence_level`。通道终止条件：正式 history API 获 Owner 批准且完成实施验收后，由 Owner 明确批准切换；终止/切换时间与方式由 Owner 决定，本合同不设定 cutover。

**验收用例**：
1. 旧 legacy 行在过渡通道可见，带 `legacy` + 不确定标记；current 各入口不可见；
2. 过渡通道调用方以 current 用途申请 → 拒绝；
3. 读取不修改原行（hash/字段对比）；
4. 正式 history API 未获批时，过渡通道不得被静默移除或升级为 current。

### 2.2 History payload 最小标记 —— **REQUIRED（必须补）**

**合同定位**：R4 §7.5.1（行 567）、P0-1/P0-4（行 660-665、713-717）。

**问题**：R4 要求 current API 拒绝 history payload，但**未定义 payload 的权威类型判别字段**；若同时使用 `history:true`、`channel:'history'`、`source:'history'` 等多个标记，可能相互冲突或被调用方忽略。

**建议条款（PROPOSAL 文本，REQUIRED 补入）**：
> **R4.1-2 唯一权威通道标记**：所有 Memory 返回载荷必须带唯一权威字段 `channel: 'current' | 'history'`（名称 PROPOSAL，语义固定）。`history` 载荷必须同时带 `valid_from_kind`、`approximated`、`verification_status`、`confidence_level`。current API（retrieval/injection/summary/merge）收到 `channel='history'` 或缺失 `channel` 的载荷必须显式拒绝，拒绝语义为合同要求；建议错误码 `E_HISTORY_CHANNEL_MISUSE`（名称 PROPOSAL）。禁止用 `history=true`、`source` 文本或 `meta` 布尔值替代该字段；若出现多个冲突标记，按拒绝处理，不静默择一。

**验收用例**：
1. history payload 传入 current injector/summary/merge → `E_HISTORY_CHANNEL_MISUSE`（或等价合同错误），无输出；
2. payload 同时 `channel='history'` 与 `history=false` → 拒绝（冲突标记）；
3. 缺失 `channel` 的旧调用方 → current API 拒绝或显式按 current 兼容清单处理（需合同定义），不得默认视为 current；
4. marker 在缓存/handoff payload 中保留，不得被剥除。

### 2.3 current-summary/current-context 出口清单 —— **REQUIRED（补清单）；逐项分类 PROPOSAL/OPEN**

**合同定位**：R4 §5.6（行 409-412）、§7.5.1（行 566）、P0-1（行 662-665）。

**逐项判定（基于源码，不凭名称）**：

| 出口 | 数据类型 | 是否 current 上下文/摘要 | 跨 Conversation 风险 | 证据 |
|---|---|---|---|---|
| `publicBrief` | `memories`（public scope） | **current-summary** | 否（public 全局，但会跨会话可见） | `service.js:529-545`：SQL 仅 `scope_type='public'`，**无 status/validity**；TTL 用 created_at |
| `handoffBrief` | `memories`（todo/decisions）+ pins/shortterm | **current-context/handoff** | **可能**（project 级，跨会话） | `service.js:673-690`；`handoff/brief.js:24-28` todo 仅 status |
| `buildDigest` | `raw_meta`（home+全部 QQ 私聊+群+email） | **current-context** | **是（明确跨会话）** | `inject/digest.js:15-21`；`index.js:1218` 注入 owner |
| `stable` | 事实卡文件 + rules + shortterm + group memories | **current-context（混合）** | group 块按 scope；其余 owner/project | `stable.js:155-210`（`stable.js:204` group SQL 仅 status） |
| `carryover` | `raw_meta`（按 cwd） | **current-context** | 否（同房间）；共享 cwd 时 OPEN | `inject/carryover.js:6-16` |
| `shorttermRecent` | `shortterm` 表 | **current-context** | 按 scope 过滤；否 | `service.js:700-724` |

**建议条款（REQUIRED 补清单；具体分类 PROPOSAL）**：
> **R4.1-3 current-summary/context 清单**：至少包含 `publicBrief`、`handoffBrief`、`buildDigest`、`stable`、`carryover`、`shorttermRecent`，以及任何后续等价出口。逐项定义：数据类型、允许的来源/Conversation 范围、必须执行的有效性/验证/主体/权限过滤、是否允许跨 Conversation。不得只在最终 prompt 过滤；摘要缓存、handoff payload、下游 merge 及任何中间结果均须在入口过滤。发现新的等价出口时必须补充清单并经 Owner/接口审查；未列入但可能跨 Conversation 的出口默认 fail closed。

**分类建议**：
- `buildDigest`：明确为**跨 Conversation current-context**，默认禁止混合无授权原文；仅可返回当前 conversation 或 Owner 明确授权范围。
- `publicBrief`：current-summary；必须加 `status='active'` 与 validity 过滤（当前缺失）。
- `handoffBrief`：current-context；todo/decision 必须带来源 Conversation/项目/授权；缺失 fail closed。
- `stable`：混合出口；group 块必须 validity/legacy 过滤；事实卡/规则/短期需分别标注来源。
- `carryover`：同 cwd 的 current-context；共享 cwd 时按 conversation 再校验。
- `shorttermRecent`：current-context；按 scope + TTL；不涉及 legacy。

**OPEN**：`stable` 的事实卡/规则来源是否可跨 Conversation、`carryover` 共享 cwd 的边界，需 Owner/接口审查确认；本轮不臆断。

### 2.4 implicit 类型白名单 —— **REQUIRED（必须定义）；具体白名单 PROPOSAL/OPEN**

**合同定位**：R4 §7.5（行 543-544）、§7.5.1（行 564）。

**问题**：R4 要求 implicit 只适用于“记录类型本身确实从创建时起有效”的新记录，但**未列举类型**，写入方可自行声明，存在把写入时间伪装成事件时间的空间。

**源码证据**：
- `memories.js:24`：`createdAt` 缺省 `now()`；
- `service.js:305,330`：`at` 缺省 now，`createdAt: at`；
- `p4.js:50`：`sourceTs = Date.now()`；
- `archive.js:426`：`event.time ?? Date.now()`。

**建议条款（PROPOSAL 文本，REQUIRED 补入）**：
> **R4.1-4 implicit 白名单**：默认禁止 implicit。仅当记录类型列入 Owner 批准的显式白名单、且 `created_at` 为 Memory 写入时间（非 received_at、非事件时间）时可用。初始候选白名单（PROPOSAL，待 Owner 批准）：
> - `episode`：来自实时会话的体验记录（事件即会话本身），且 `source` 为实时渠道；
> - `fact`/`preference`/`relation`：仅来自 `direct_statement` 且语义为“自记录时起有效”（如“从今以后…”），带 `implicit_basis='from-now'` 标记；
> - 其余类型（导入、迁移、consolidated daily/weekly、LLM 推断、历史补全、legacy）**禁止 implicit**。
> 事件时间缺失且记录语义依赖事件发生时间时，时间边界必须 `unknown`，不得 implicit。

**验收用例**：
1. 白名单类型 + created_at 合法 → implicit，带标记；
2. 非白名单类型 → 拒绝 implicit 或 unknown；
3. `created_at` 等于 received_at/事件时间 → 拒绝 implicit；
4. 导入/迁移/consolidated 行 → 禁止 implicit。

### 2.5 旧行 confidence_level 语义 —— **PROPOSAL（可审查方案）；Schema 变更 OPEN**

**合同定位**：R4 §7.1（行 476-482）、§7.2（行 493）、P0-5（行 725-729）。

**建议方案（PROPOSAL，不写成已批准 Schema）**：
> 旧行（cutover 前，cutover 未批准）：
> - `confidence_level='unknown'`（不推断等级）；
> - 新增 `confidence_kind='legacy_numeric'`（名称 PROPOSAL）标识“数值仅为旧原值”；
> - numeric `confidence` 原值保留，不回填/不重算/不映射；
> - 读取方禁止将 legacy numeric 用于排序、门控、注入优先级、重要决策或转换为 high/medium/low；仅可作为展示原值。
> 迁移时只允许写新列 + 审计，禁止 UPDATE numeric；是否采用该方案需 Owner 批准，且涉及 Schema 变更须单独授权。

**验收用例**：
1. 旧行 numeric byte 不变；`confidence_level='unknown'`；
2. 读取路径不因 numeric 高低改变排序/注入/门控；
3. 旧行 `confidence_kind='legacy_numeric'` 可审计；
4. 未批准前不得写该列/迁移（BLOCKED）。

### 2.6 负向验收补充 —— **REQUIRED（补测试要求）**

**合同定位**：R4 P0-4（行 713-717）、P0-5（行 725-729）、P0-1（行 662-665）。

**建议条款（REQUIRED 补入）**：
> **R4.1-6 负向验收扩展**：除 R4 现有项外，必须覆盖：
> 1. `updateMemory`：PATCH `confidence`/`valid_from`/`superseded_by`/`status` 对旧行与 current/history 的影响；禁止改旧 numeric、禁止把 legacy 升级为 current；
> 2. `memory_evidence`（若保留 PROPOSAL）：UPDATE/DELETE/PATCH 拒绝；仅 append 更正；
> 3. `publicBrief`：legacy/unknown/expired/superseded public 行必须 0 输出；无 status/validity 过滤视为失败；
> 4. `handoffBrief`：无来源 Conversation/授权/有效性的 Owner todo/decision 必须 fail closed；legacy/unknown 0 输出；
> 5. `buildDigest`：其他 conversation 原文哨兵 0 命中；无授权跨会话 0；
> 6. `stable`/`carryover`/`shorttermRecent`：legacy/unknown 与跨 Conversation 哨兵 0 输出；
> 7. 缓存/payload/merge 旁路：history/legacy 不得经摘要缓存、handoff payload、下游 merge 进入 current；
> 8. `E_HISTORY_CHANNEL_MISUSE`（或等价）拒绝记录可观察（错误码/审计日志）。

**每类用例必须给出**：输入 fixture（合成数据/临时库）、预期拒绝行为（0 输出/错误码/fail closed）、可观察证据（返回、审计、行数/字段对比）。不得以最终 prompt 无内容代替入口断言。

## 3. 风险等级

| 项 | 等级 | 理由 |
|---|---|---|
| History 过渡缺失 | **P1** | 旧记忆可能在 current 禁用后不可达，违反 Owner 旧记忆保护 |
| Payload marker 缺失 | **P1** | current API 无法可靠拒绝 history，旁路风险 |
| 出口清单缺失 | **P1** | `buildDigest` 等跨会话原文未被 R4 点名 |
| implicit 白名单缺失 | **P1** | 写入时间可伪装事件时间 |
| 旧行 confidence_level 未定 | P2 | 读取语义不清，可能误用 numeric |
| 负向测试缺口 | P1 | 无法验收 current/history 隔离 |

## 4. 合同章节定位汇总

- §5.6：行 389-412（Bridge 边界、publicBrief/handoffBrief、digest）；
- §7.1：行 476-482（新默认、旧值、nullable 冲突）；
- §7.5：行 540-544（created_at/received_at/event_time、implicit）；
- §7.5.1：行 560-567（legacy/unknown/history、current 隔离、E_HISTORY_CHANNEL_MISUSE）；
- P0-1：行 660-665；P0-4：行 713-717；P0-5：行 725-729。

## 5. 未执行检查 / NOT_RUN

- 未运行测试；未验证生产 DB、真实 Bridge、Memory v6、迁移、设备。
- 未决定 cutover、history API 物理方案、nullable confidence Schema、legacy 近似规则。
- 未修改 R4 合同或任何源码/测试/schema/DB。

## 6. 状态

- 本报告：**READY_FOR_REVIEW**
- R4 合同：**CANDIDATE / NOT FROZEN**
- Memory v6 / Persona v3 / EI-2A：**NOT_STARTED**
