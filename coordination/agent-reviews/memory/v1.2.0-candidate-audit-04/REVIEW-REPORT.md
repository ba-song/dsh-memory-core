# v1.2.0 候选合同 · Memory 专项只读复核报告

- 任务：`MEMORY-V1.2.0-CANDIDATE-AUDIT-04`（Memory 专项）
- 时间：2026-11-22 17:5x–18:2x (Asia/Shanghai)
- 性质：只读技术复核；未改合同/源码/测试/schema/DB；未迁移/部署；未启动 v6/Persona v3/EI-2A。
- 状态：**READY_FOR_REVIEW**（含 BLOCKED 子项，见 §5）

## 1. 基线

| 项 | 值 |
|---|---|
| Memory 仓库/分支/HEAD | `ba-song/dsh-memory-core` / `feat/m1-preference-memory` / **`7548e49ed0b8d8673818464325d8e72ec7704b27`** |
| tree | `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f` |
| 审查合同 | 分支 `docs/memory-persona-contract-v1.2.0-owner-review` @ **`1dced58a8093222a70853668fca6cf35cf7674ed`** |
| 合同 blob | `2b821169a61f39dab9b7ede37f580ba428d1b2e4`（790 行） |
| 基础合同 | v1.1.1 `006bb5bfce5d031b49a60271fe0406b228b43e00` |
| 测试 | `npm test` @ `7548e49`：258/258 pass、0 fail、0 skip、exit 0（本轮重跑） |
| 已读材料 | 合同全文（790 行）；Memory v1.1.1 R2；Memory 交叉审查 03（`612bd88…`）；Persona 交叉审查 03；CB 交叉审查 03；M1 代码 |

## 2. 逐项复核结论

### 2.1 §5.5 Memory 唯一写入责任 —— **PARTIAL**

**合同文本（§5.5，行 377-388）**：Memory 是关系 3（Message ↔ Speaker/Experiencer）的唯一写入方，负责 canonical `speaker_id`、`speaker_type`、`experiencer_type/id`、消息级 evidence、有效性/冲突/撤回/审计；不得伪造 Bridge 事实，不得从 Persona Session Self binding 推断每条消息的 speaker/experiencer。

**判定**：
- **条款与 D1 一致**，且与 Memory v33 报告一致（Memory 唯一写 speaker/experiencer/evidence/validity）→ **PASS（条款层）**。
- **当前实现 PARTIAL**：
  - `speaker_id` 有写入（`lib/store/memories.js:45`；`archive.js:430-470`）；
  - `experiencer_type/id`、`memory_evidence`、三维字段、统一 validity **不存在**（`grep experiencer/evidence_source/validityState` 0 命中；`schema.js` memories DDL）；
  - 群消息 speaker 仍写群实体（`archive.js:282-285`），违反“canonical speaker”目标；
  - `saveGroupTurn` 写 group episode 时不写 speaker/experiencer（`service.js:613-655`）。
- 结论：**PARTIAL**（条款可接受；实现距离目标尚远）。

### 2.2 §5.6 Bridge 写入边界（turn/transcript/digest/handover 必须经 Memory） —— **PARTIAL**

**合同文本（§5.6，行 389-398）**：Bridge 不得绕过接口直接写 Memory 数据表或代替 Memory 决定 speaker/experiencer/证据/有效性；群 turn/transcript 必须保留 `group_id` 与 `external_speaker_id`；摘要进入长期记忆须经 Memory 校验。

**当前实现**：
- Memory **有**受控接口：`saveGroupTurn`（`lib/service.js:613`）、`saveGroupTranscript`（`:551`）、`saveGroupDigest`（`:578`），Bridge 通过 `dyMemory.*` 调用（CB 报告 §3.3 确认）。
- **但字段不满足 §5.6**：
  - `saveGroupTranscript` 用 `cwd=GROUP_CWD` 写 raw，正文拼成 `"speaker：text"`；**无 `group_id` 列**、**无 `external_speaker_id`**；去重按 `cwd+at+raw_text LIKE`（`:559-566`）→ 跨群碰撞风险；
  - `saveGroupTurn` 只写 `scopeId='qq:<gid>'`，不写 group_id 列，也不写成员 speaker（`:613-655`）；
  - `saveGroupDigest` 同样以 `GROUP_CWD` 归档（`:578-605`）。
- **无 handover 写入接口**：`grep handover/handOver lib/service.js lib/index.js` 0 命中 → 合同要求“handover 内容须经 Memory”缺少实现入口。
- 跨仓库“Bridge 是否直接写 Memory 表”无法在本仓库验证 → **NOT_RUN**（CB 代码侧待其确认）。
- 结论：**PARTIAL**（接口存在；字段/入口/防绕过不完整）。

### 2.3 §7.5.1 未知时间、legacy、implicit 与现有模型/旧记忆保护的一致性 —— **PARTIAL + BLOCKED 子项**

**合同文本（§7.5.1，行 519-530）**：
- `unknown`：默认不得进入普通 current-fact 注入，仅历史回忆/参考；
- `legacy`：不自动等于 VALID/INVALID；是否 created_at 近似、是否 approximated，须 Owner 批准；
- `implicit`：仅当 created_at 可信且记录类型允许；
- 具体规则/cutover **OPEN**。

**与现有模型对照**：
1. 无 `valid_from_kind` 字段（`schema.js` memories DDL）；现有 `temporal_kind` 语义不同（`schema.js:90` 默认 `'unknown'`）。
2. 当前 current recall 对 `valid_from IS NULL` 一律放行（`recall.js:71`），**包括 `temporal_kind='unknown'` 的行**；asOf 才把它们放入 uncertain（`TEMPORAL_UNKNOWN_SQL`，`recall.js:20,61`）。→ 与 §7.5.1“unknown 默认不得普通注入”**直接冲突**（当前会注入）。
3. `insertMemory` 接受任意 `createdAt`（`memories.js:24`，`Number(rec.createdAt ?? now())`），无“created_at 可信”校验 → `implicit` 的前置条件未实现。
4. `legacy` 的 current 行为未定义：若实现为“非 VALID 即排除”，会与 D4“不得因缺字段批量排除/降级”冲突；若实现为“VALID”，又与 §7.5.1“不自动等于 VALID”冲突。**这是合同必须补齐的语义空洞**。
5. 迁移映射未定义：旧行 `valid_from IS NULL` 若被映射为 `unknown` 而非 `legacy`，会触发第 4 点冲突；若映射为 `legacy` 再按未批准规则处理，当前无实现。

**结论**：**PARTIAL**；其中“legacy 在 current 视图的默认行为”为 **BLOCKED**（须 Owner 批准近似规则/明确默认通道后才能实现和验收）。

**建议合同文本**（PROPOSAL）：
> `legacy` 在 Owner 批准近似规则前，默认以 `approximated=true` 参与**历史回忆/参考**与普通注入的低置信通道；不得整体排除，也不得作为 `confirmed`/重要决策依据。`unknown` 仅用于无法建立可信边界（非法/缺失 created_at）的行，默认只进入 uncertain/历史参考通道。

### 2.4 不确定记忆：保留历史价值 vs 未验证当前事实注入 —— **PARTIAL / NOT_IMPLEMENTED**

- 合同 §7.5.1/§7.6 意图正确：允许回忆/参考，禁止单独支撑重要决策。
- 当前实现缺少落地机制：
  - 无 `verification_status/confidence_level`（`grep` 0 命中）；
  - recall 返回值不携带“未验证/不确定”标记（`recall.js` 返回行对象，无该字段）；
  - session-index/handoff/stable 等入口直接注入旧记忆，无不确定性标记（`session-index.js:40/67`、`brief.js:28`、`stable.js:204`）；
  - 无“历史回忆/参考”独立通道（仅 asOf 有 uncertain 列表）。
- 结论：合同方向可接受，但“保留价值 + 不冒充当前事实”**当前不可实现**，需补 uncertain/legacy 通道与标记 → **NOT_IMPLEMENTED**。

### 2.5 与 Memory 专项报告/代码基线冲突项 —— **PARTIAL**

| # | 合同条款 | Memory 报告/代码 | 判定 |
|---|---|---|---|
| 1 | §5.5 Memory 唯一写 speaker/experiencer/evidence/validity | 与 Memory v33 §3-§5 一致；当前仅 speaker 可写 | 一致（实现缺口） |
| 2 | §5.6 Bridge 经 Memory 接口写入 | Memory 有 saveGroupTurn/Transcript/Digest；无 handover；transcript 缺 group_id/speaker | 实现缺口 |
| 3 | §7.5.1 unknown 不普通注入 | 当前 current recall 注入 `temporal_kind='unknown'` 行（`recall.js:71`） | **冲突（当前实现违反合同）** |
| 4 | §7.5.1 legacy 不自动 VALID/INVALID | 当前 legacy（NULL）被当有效；合同未定义 current 行为 | **语义空洞（BLOCKED）** |
| 5 | §7.1 三维独立、旧 numeric confidence 保留不映射 | 当前只有 `confidence REAL`（默认 1.0，`schema.js:79`；`memories.js:31`）；无三维 | 实现缺口 |
| 6 | D3 Owner 由 Persona 身份域管理，Memory 只引用 | Memory 当前 `person:owner` 占位（`archive.js:293`、`people.js`）；无 `owner:<uuid>` | 实现缺口（旧别名兼容） |
| 7 | D1 禁止 `session_subjects` | 本人 v33 已撤回；合同一致 | 一致 |
| 8 | §7.5.1 旧记忆不得整体排除（D4） | 当前未排除；若按 unknown 排除将违反 D4 | 风险 |

未发现合同与 Memory 报告在**责任归属**上的直接矛盾；冲突集中在 §7.5.1 的 current 行为与现有 `temporal_kind` 模型。

## 3. 推荐合同文本调整

1. **§7.5.1 补 current 行为**：明确 `legacy` 默认“approximated 回忆/参考可用、非 confirmed、非重要决策”；`unknown` 仅进 uncertain/历史通道；禁止整体排除（D4）。
2. **§7.5.1 补迁移映射**：旧 `valid_from IS NULL` → `legacy`；仅非法/缺失 created_at → `unknown`；新写入无 valid_from → `implicit`（须校验 created_at）；非法显式时间 → 拒绝。
3. **§5.6 补 handover 接口与字段**：新增 Memory 受控 handover 写入接口；群 transcript/turn 必须持久化 `group_id`、`external_speaker_id`（列/结构化字段，不拼正文）；缺失 → fail closed/unknown。
4. **§7.5/§7.6 补不确定通道**：定义“历史回忆/参考”检索 API 与返回标记（`verification_status/confidence_level/valid_from_kind`），普通注入默认仅 confirmed/supported；unverified 仅经该通道。
5. **§7.1/§7.4 补默认值**：新记忆 `confidence_level=unknown`；旧 numeric confidence 原值保留、不映射；`memory_evidence` 作为唯一证据表（write-once，不在 PATCHABLE）。
6. **§6 补一句**：Memory 只读 Persona 的 self/owner **evidence**（不读 binding 推断消息主体），与 §5.5 一致。

## 4. 需其他模块/Owner 回答

- Owner：§7.5.1 legacy 的 current 默认行为与近似规则；cutover 时间/版本。
- Persona：owner:<uuid> 签发/迁移方案；identity evidence 结构。
- Channel Bridge：是否确实只经 `dyMemory.*` 写 Memory（不直写表）；handover 数据形态；transcript 是否能提供 group_id/external_speaker_id。
- GPT：P0-4/P0-5 的验收批次；三维字段物理命名。

## 5. 状态汇总

| 检查项 | 状态 |
|---|---|
| §5.5 唯一写入责任（条款/实现） | **PARTIAL**（条款 PASS；实现 PARTIAL） |
| §5.6 Bridge 写入边界/turn/transcript/digest/handover | **PARTIAL**（接口有；字段/入口缺；跨仓库 NOT_RUN） |
| §7.5.1 未知/legacy/implicit | **PARTIAL**；legacy current 行为 **BLOCKED** |
| 不确定记忆历史价值 vs 注入 | **PARTIAL / NOT_IMPLEMENTED** |
| 与 Memory 报告/代码冲突 | **PARTIAL**（无责任冲突；§7.5.1 与当前实现冲突） |
| 合同整体 | **READY_FOR_REVIEW**（候选稿，含 BLOCKED 子项） |

## 6. 测试与未验证

- `npm test` @ `7548e49`：258/258、0 fail、0 skip、exit 0（本轮重跑；仅证明现有测试通过，不证明合同合规）。
- 本轮未新增测试；未执行：Memory v6、迁移、真实 Bridge 调用、生产 DB、设备、Persona v3/EI-2A。
- 未验证：Bridge 是否直写 Memory 表（跨仓库）；`saveGroupTranscript` 生产调用量；旧库 `raw_meta.speaker_id` 实际列存在率（无生产 DB 证据）。

## 7. 边界声明

只读复核；未修改合同/源码/测试/schema/数据库/生产配置；未迁移、未部署、未重启；未连接真实 QQ/NapCat；未创建 Owner ID 或写入任何身份。本报告不构成合同冻结或实施授权。
