# MEMORY–PERSONA 联合数据契约 v1.1.1 · Memory 专项只读审查报告

- 任务：`MEMORY-PERSONA-CONTRACT-V1.1.1-READONLY-REVIEW-02`
- 审查对象：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.1.1-DRAFT.md`
- 契约所在：分支 `docs/memory-persona-contract-v1.1.1-owner-decisions` @ **`006bb5bfce5d031b49a60271fe0406b228b43e00`**（323 行）
- 审查基线：`ba-song/dsh-memory-core` / `feat/m1-preference-memory` @ **`7548e49ed0b8d8673818464325d8e72ec7704b27`**（tree `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f`，相对 main `752cd08` ahead 245）
- 审查工作区：`/tmp/memaudit/m1`（独立 worktree，仅 `?? node_modules`，`git diff --check` 干净）
- 测试：`npm test` → **258/258 pass、0 fail、0 skip、exit 0**（140 文件，Node v24.19.0；运行 commit = 7548e49）
- 性质：只读；未改业务源码/测试/schema/数据库，未迁移，未部署。

> 结论先行：Memory 当前实现距离 v1.1.1 **差距很大**。会话层（稳定 conversation、群成员身份、跨会话原料注入）、身份层（experiencer/evidence）、有效性层（统一三态）、证据三维、按用途使用不确定记忆、自主补全审计、v6 迁移均未实现或不完整。本报告仅提供差距与证据，不代表冻结或实施授权。

## 0. 逐项总表

| # | 审查项 | 结论 |
|---|---|---|
| 1 | speaker_id 与 experiencer_type/id 分离 | REJECT |
| 2 | 私聊独立会话窗口/稳定 ID/隔离 | PARTIAL |
| 3 | 群聊独立窗口/成员 speaker/群实体分离 | REJECT |
| 4 | Persona canonical self / identityOf / binding 同源 | NOT_IMPLEMENTED |
| 5 | owner/third_party/unknown、群前缀、无稳定成员 ID | PARTIAL |
| 6 | experiencer_evidence 可信且不可 PATCH | NOT_IMPLEMENTED |
| 7 | 历史 cutover 兼容、旧原文保留、unknown 不误删 | PARTIAL |
| 8 | validityState 三态覆盖所有入口 | REJECT |
| 9 | valid_from_kind / superseded_at / asOf 历史 | NOT_IMPLEMENTED |
| 10 | evidence_source / verification_status / confidence_level 三维 | NOT_IMPLEMENTED |
| 11 | 情绪原始分数与记忆可信度分离 | PARTIAL |
| 12 | 重复引用不得提升可信度、证据独立可追溯 | REJECT |
| 13 | 不确定记忆按用途使用 | NOT_IMPLEMENTED |
| 14 | 自主补全的证据/审计/原文/权限/回滚 | NOT_IMPLEMENTED |
| 15 | Persona timeline 列名与多表事务 | PARTIAL（Persona 侧） |
| 16 | migration 单事务/校验/version-last/回滚 | PARTIAL（v5 通过，v6 未实现） |

---

## 1. speaker_id 与 experiencer_* 分离 —— **REJECT**

- HEAD 无 `experiencer_type` / `experiencer_id` / `experiencer_evidence` 列（`lib/store/schema.js` 无；`grep -rn experiencer` 仅出现在 EI 设计文档，不在 Memory 代码）。
- `speaker_id` 存在（`schema.js` memories 列），语义为“谁说的”；`subject` 为自由文本（`memories.js:44`），无身份保证。
- 写入路径：`lib/service.js:281-300` addEpisode 只写 `speakerId: selfId`；`lib/ingest/p4.js` 以 `speaker=owner.ownerQQ` 写入 user 语句；无“经历属于谁”的判断。
- 风险：接收/整理/摘要一律落为说话者，无法表达“群成员 A 的经历”“主人的经历”与“汐的经历”的差别；未来若直接用 `speaker_id` 充当主体，会把第三方经历写成 self/owner。
- 未覆盖：无测试；v6 设计见 MEMORY-REPORT-0026/0027，未实施。

## 2. 私聊独立会话窗口 —— **PARTIAL**

- 会话房间由 cwd 推导：`lib/scope.js:resolveExternalContact`（`私聊_<qq>` → `qq:<qq>`；渠道目录 → `<channel>:<externalId>`）；群 `groupIdFromCwd` → `qq:<gid>`。
- 稳定会话 ID 与运行时 session ID **未分离**：`memories.conversation_scope` 在所有写入点都是空串（`lib/service.js:322,457`、`lib/ingest/migrate.js:154`、`lib/store/memories.js:45`），运行时 `session.header.id` 不落库；因此“长期会话容器身份”不存在。
- 私聊隔离：`carryoverFor` 按 `cwd` 精确读原话（`lib/inject/carryover.js:6-16`）→ 同一房间内隔离成立；`scopeWhere` 对 contact 用 `scope_id` 精确匹配（`lib/scope.js:110-130`）。
- **跨会话泄漏（P1）**：`buildDigest` 读取近 12h 全部 raw（`lib/inject/digest.js:15-21`），房间白名单包含 `home`、`渠道/qq` 全部私聊、`群`、`email`，再作为 owner 会话上下文注入（`lib/index.js:1218`）→ 联系人 A 的私聊原文/群聊原文会进入 home 或主人私聊上下文，违反契约 2.3“默认只用当前会话 + 经授权的长期记忆”。
- 无稳定 conversation key 约束、无 Channel Bridge 写入协议；契约要求的三方字段（chat_type/peer/group/account）未在 Memory 侧校验。
- 建议：新增 `conversation_id`（稳定）与 `session_id`（运行期）分离；`buildDigest` 按当前会话过滤或显式授权；Channel Bridge 提供 `chat_type/peer_id/group_id/speaker_external_id`。

## 3. 群聊独立窗口/成员身份 —— **REJECT**

- 群窗口：`scope_type='group'` + `scope_id='qq:<gid>'`，`scopeWhere` 精确匹配（`lib/scope.js:110-130`），群间隔离成立。
- **群成员 speaker 丢失**：`lib/ingest/archive.js:282-285` 对群消息统一返回 `person:contact:qq:group:<gid>`（群实体），未使用 `srcMsg.contactId/senderId` 作为成员 ID；group 消息的 `speaker_id` 因此是“群”，不是“发言成员”。这直接违反“每条群聊消息必须尽可能保留实际发言成员身份”。
- 群实体 ID 形式符合契约（`person:contact:qq:group:<gid>`），不新增 group 类型（当前亦无 experiencer 字段）。
- 群成员无稳定 ID 时应 unknown：当前实现会落成群实体 ID，属于“用群 ID 代替成员 ID”的禁止行为。
- 建议：archive 增加 `member_external_id`/`member_person_id`（无映射则空），`speaker_id` 优先成员；群实体单独存 `conversation_entity_id`；Channel Bridge 提供 sender 信息。

## 4. Persona canonical self / identityOf / binding 同源 —— **NOT_IMPLEMENTED**

- Memory 侧无 `identityOf` 调用；`lib/index.js:216` 与 `lib/service.js:191-197` 只调用 `persona.selfId()`。
- 实测（临时库，`identityM1.mjs`）：persona DB 不可用 → `selfId()` 返回 `'self:unknown'`；Memory 视为有效 → `addEpisode` **写入** `speaker_id='self:unknown'`（不抛错）；非法 `'abc'` → 被规范成 `self:abc` 写入。
- persona 服务整体缺失时才抛 `E_PERSONA_UNAVAILABLE`（实测）。
- 无 `bindingOf` 同源校验；`meta.serviceVersion`/`origin` 在 `PATCHABLE_COLUMNS`（`memories.js:8-12`）可被 `updateMemory(metaPatch)` 改写。
- 结论：canonical self 门禁不存在；契约 3 条全部未满足。建议：`selfId()` 只返回 canonical 或 null；Memory 拒绝哨兵/空/非法格式（`E_PERSONA_IDENTITY_UNKNOWN/INVALID`）；专用 `experiencer_evidence` 列（非 PATCHABLE）。

## 5. owner/third_party/unknown 与群前缀 —— **PARTIAL**

- `person:owner` 存在（`lib/ingest/archive.js:279-280,293`；`lib/store/people.js:OWNER_PERSON_ID`）；群实体前缀存在（archive.js:285）；私人 QQ 映射 `person:contact:qq:<qq>`。
- 但无 `experiencer_*`，以上仅用于 raw `speaker_id`/`person_id`，未进入 memories 主体判断。
- `subject` 未被用于身份推断（`grep subject:` 仅 archive 邮件头；无自然语言身份推断代码）→ 这一点符合“不得用 subject 推断身份”。
- 无稳定成员 ID 时落群实体（见 #3）→ 需修正为 unknown。

## 6. experiencer_evidence —— **NOT_IMPLEMENTED**

- 无字段；`meta` 可 patch（`memories.js:8-12`、`updateMemory` metaPatch）。
- 无签名/不可篡改机制；无写入路径来源记录。
- 建议：新增只写列 `experiencer_evidence`（含来源、产生者、时间、完整性校验），从 `PATCHABLE_COLUMNS` 排除；`addEpisode`/wake 写入时设置；迁移不生成该证据（历史 unknown）。

## 7. 历史兼容 —— **PARTIAL**

- 旧记录当前仍可召回：current recall 对 `valid_from IS NULL` 行放行（`lib/recall/recall.js:71` 的 `(valid_from IS NULL OR valid_from<=?)`），未因缺新字段整体排除。
- 但无 cutover、无 `valid_from_kind`、无 `approximated` 标记：旧 NULL 与“曾被清洗为 NULL 的非法时间”不可区分（`insertMemory` 对 `validFrom` 做 `Number()`，`'abc'`→NaN→NULL，实测被注入）。
- 原文保护：`episode-rewrite` 存在显式 `UPDATE memories SET text=...`（`lib/store/episode-rewrite.js:120-126`），带 `episode_rewrite_snapshots` 快照与回滚、`provenanceReviewRequired`，属“owner 确认的重写”，不是自动补全；但契约 4.1 要求“原始正文不可被自动补全过程覆盖”，需在实施时明确该功能不属于 backfill。
- 缺 `historical_record` 证据来源与“原文存在≠事实为真”的字段区分（无 evidence_source）。
- 建议：cutover 时间/版本入库；`valid_from_kind`（exact/implicit/legacy/unknown）+ approximated；原文字段不可变（仅快照重写）；历史行默认 `evidence_source='historical_record'`、`verification_status='unverified'`。

## 8. 统一 validityState 三态 —— **REJECT**

- 无 `validityState`；至少 8 处内联过滤（preference/remembered/session-index/handoff/episodeRecent/rules/stable/graph/recall/p4/merge/daily/weekly）。
- 实测矩阵（HEAD 7548e49，合成数据，`/tmp/memaudit/v111probe.mjs`）：

| 入口 | future | expired | sup(status) | sup-only | NULL 起点 | 坏时间 |
|---|---|---|---|---|---|---|
| recall current | 排除 | 排除 | 排除 | 包含 | 包含 | 包含 |
| recall asOf | 排除→uncertain | 排除→uncertain | 排除 | 包含 | 排除→uncertain | 排除→uncertain |
| preference | 注入 | 排除 | 排除 | 注入 | 注入 | 注入 |
| remembered | 注入 | 排除 | 排除 | 注入 | 注入 | 注入 |
| session-index | 注入 | 排除 | 排除 | 注入 | 注入 | 注入 |
| handoff | 注入 | 注入 | 排除 | 注入 | 注入 | 注入 |
| episodeRecent | 返回 | 返回 | 排除 | 返回 | 返回 | 返回 |
| rules | 排除 | 排除 | 排除 | 注入 | 注入 | 注入 |
| stable group | 注入 | 注入 | 排除 | 注入 | 注入 | 注入 |
| graph lenient | 排除 | 排除 | 排除 | 包含 | 包含 | 包含 |
| graph strict | 排除 | 排除 | 排除 | 排除 | 排除 | 排除 |
| merge | 候选被合并 | 旧行排除 | 旧行排除 | 旧行包含 | 包含 | 包含 |
| P4 邻居 | 可选中 | 可选中 | 可选中 | 可选中 | 可选中 | 可选中 |

- 关键位置：`preference.js:40/48`、`remembered.js:18`、`session-index.js:40/67`、`handoff/brief.js:28`、`service.js:271`、`rules.js:113`、`stable.js:204`、`graph.js:51-73`、`p4.js:93`、`merge.js:105/116`、`recall.js:71/189`。
- 结论：契约要求的“所有注入/合并/摘要入口同一语义”不成立。

## 9. valid_from_kind / superseded_at / asOf —— **NOT_IMPLEMENTED**

- 无 `valid_from_kind`、无 `superseded_at`（schema v5 无）。
- 坏时间：`validFrom:'abc'` → 静默 NULL（focused 探针：只有 badtime+normal 时两者都被注入）。
- asOf：严格 `TEMPORAL_VALID_SQL`（`valid_from IS NOT NULL`），NULL 起点行全部进 uncertain；实测 asOf 查询 ids=[]、uncertain 含 normal/expired/future/suponly（历史不可恢复）。
- superseded_by-only（status=active）行在 8 个入口泄漏（见 #8）。
- 建议：v6 四列（experiencer_type/id、valid_from_kind、superseded_at）+ 统一 helper + 各入口改造；迁移矩阵见 MEMORY-REPORT-0026。

## 10. 三维证据体系 —— **NOT_IMPLEMENTED**

- `grep evidence_source/verification_status/confidence_level` → 无字段；memories 仅 `confidence REAL`。
- `insertMemory` 默认 `confidence = 1.0`（`memories.js:31`；schema `confidence REAL NOT NULL DEFAULT 1.0`）→ 新记忆默认“最高置信”，比旧 0.5 更违反契约。
- 无 `disputed`/`retracted` 保留机制（冲突表 conflict_queue 存在，但非证据冲突语义）。
- 建议：新增三列（或关联表），旧 numeric confidence 保留为 legacy 并映射 `confidence_level=unknown`；默认 `unknown/low`，禁止 1.0/0.5 默认。

## 11. 情绪原始分数与记忆可信度 —— **PARTIAL**

- Memory 不读取 emotion score 作为 confidence（无代码引用）；Persona 侧 emotion/appraisal 独立表。
- 但 Memory `confidence` 默认 1.0、Persona event/appraisal 默认 0.5，且无 `confidence_kind/source` 字段（`dsh-persona-core/lib/db.js`）→ “无依据默认值”风险仍在。
- 建议：Memory 与 Persona 各自默认 unknown；禁止数值默认充当校准概率；文档化 event.confidence 为原始分数。

## 12. 重复引用不得提升可信度 —— **REJECT**

- `lib/pref/merge.js:128-131`：同极性偏好再次出现时 `confidence=min(1,max(...)+0.02)`、`evidenceCount+1` → **同一人重复同一说法会提升记忆置信/证据数**，违反契约 6.3“重复引用/转述不构成新证据”。
- 正向：recall 只增加 `access_count/last_access_epoch`（`recall.js:213-219`），不改 confidence；这一点符合。
- 无 source ID/独立性字段，无法区分“同一原文副本”与“独立证据”。
- 建议：证据按 `source_id` 去重；同源重复只记 occurrence 不升 confidence；`evidenceCount` 改为独立来源计数；冲突保留。

## 13. 不确定记忆按用途使用 —— **NOT_IMPLEMENTED**

- Memory 无“用途分级”（回忆/建议/重要决策）接口；recall/工具返回不携带可信度/验证状态，调用方无从区分。
- 无“重要决策需额外证据”的门禁；授权逻辑在调用方（Autonomy/工具）而非 Memory。
- 建议：检索结果返回 `verification_status/confidence_level`；重要决策路径要求 `confirmed` 或额外证据；Memory 不替代授权层。

## 14. 自主补全历史记忆 —— **NOT_IMPLEMENTED**

- 无“扫描—补字段—证据链—审计”的通用补全功能；`selfid.js` 只回填 `self:unknown`（且静默返回 0）；`episode-rewrite` 是 owner 确认的正文重写（带快照/回滚），非补全。
- 无补全审计（时间/来源/方法/原值/新值），无冲突报告，无权限检查。
- 建议：设计为只读扫描 + 证据链 + 候选写入（独立表/字段）+ 审计；禁止自动改原文/身份/时间；生产写入另行授权。

## 15. Persona timeline 与多表事务 —— **PARTIAL（Persona 侧，跨仓库证据）**

- `dsh-persona-core/lib/emotion.js:645` 向 `emotion_timeline(session_key,...)` 写入，而表列为 `self_id` → 实测静默失败（0 行、无异常）；同文件其它路径使用 `self_id`（:1035）。
- `event/appraisal/episode` 无事务包裹（无 BEGIN/COMMIT），可能部分写入。
- Memory 侧未调用这些写路径；跨仓库依赖需 Persona 修复。

## 16. migration —— **PARTIAL**

- v5 `migrateSchema`：`BEGIN IMMEDIATE`（`db.js:48`）、校验、`schema_version` 最后写（:103）、`COMMIT`（:104）、失败 `ROLLBACK`（catch）。
- 实测（`mig-m1-fail3.mjs`）：`episode_rewrite_snapshots` 缺列 → `E_SCHEMA_MIGRATION_INCOMPLETE`，version 保持 4、`valid_from` 未残留、索引未残留 → 回滚成立。
- 但：无 v6 字段/回填/审计；fresh `raw_meta` 无 `speaker_id`（`archive.js:174-185` DDL 与 ALTER 均无）；`raw_meta` 迁移不在 schema 事务内、无 schema 标记。
- 建议：v6 单事务 + version-last + 前后计数 + 迁移快照；raw_meta 条件 ALTER + `meta['raw_meta.schema']` 标记 + 显式失败语义。

---

## 17. 会话层专项结论（契约 §2 新增要求）

| 要求 | 现状 | 结论 |
|---|---|---|
| 每个私聊独立窗口 | cwd 房间 + contact scope 精确匹配 | PARTIAL（隔离可用，但无稳定会话 ID） |
| 每个群独立窗口 | group scope_id 精确匹配 | PARTIAL |
| 群成员 speaker 身份 | 群消息统一成群实体 ID | REJECT |
| 群实体 ≠ 成员 | 群实体 ID 存在，但被当成员 speaker | REJECT |
| 私聊/群聊原文不得跨会话注入 | `buildDigest` 合入 home+全部 QQ 私聊+群+email | REJECT（P1 泄漏） |
| 跨会话长期记忆复用需主体/权限检查 | 仅 scope 粗过滤，无 experiencer/visibility | PARTIAL |
| 稳定 conversation vs runtime session | `conversation_scope` 恒空；session id 不落库 | NOT_IMPLEMENTED |

## 18. 测试与证据

- `npm test`（run at `7548e49`）：258/258 pass，0 fail，0 skip，exit 0。
- 探针（临时库）：`/tmp/memaudit/v111probe.mjs`、`rulesProbe.mjs`、`identityM1.mjs`、`mig-m1-fail3.mjs`（输出见上表/§4/§8）。
- 未运行/未覆盖：v6 迁移、真实注入、Persona 侧运行时、Channel Bridge、生产 DB、设备。
- 现有测试通过**不代表**契约合规（契约项多为未实现的新语义）。

## 19. 未决事项（需负责人/GPT 裁决）

1. canonical owner ID（D1）与 owner episode 写入策略。
2. 各平台 conversation key 字段组合；跨平台账号是否合并。
3. 运行 session 与长期 conversation 的映射。
4. Channel Bridge/Persona 对 session_bindings 的写入责任。
5. 群成员 ID 不可用时的补录/合并策略。
6. `experiencer_evidence` 物理存储与不可 PATCH 机制。
7. 三维字段命名/枚举/旧 numeric confidence 兼容。
8. legacy 近似规则、cutover 时间与 approximated 审计格式。
9. 自主补全是否允许自动写入及其事务/审计/回滚。
10. `subject` 是否 deprecated；rules 如何适配统一 helper。

## 20. 结论

**Memory 当前实现不足以声明符合 v1.1.1。** 3 项 REJECT（#1/#3/#8/#12 中核心 4 项）、6 项 NOT_IMPLEMENTED、6 项 PARTIAL；仅“旧原文可召回/scope 基本隔离/v5 迁移回滚”等子项成立。

**状态：REJECT（就合规性而言）**；本审查任务本身 **READY_FOR_REVIEW**（报告已完成，等待 GPT 汇总）。未修改任何代码/数据，未启动 v6/Persona v3/EI-2A。
