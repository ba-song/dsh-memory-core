# Owner 批准决策落地 · Memory 专项只读复核报告

- 任务：`OWNER-APPROVED-CONTRACT-COORDINATION-03`（Memory 专项）
- 角色：Memory 记忆智能体负责人
- 时间：2026-11-22 17:0x–17:4x (Asia/Shanghai)
- 性质：只读复核；未改源码/测试/schema/数据库；未迁移/部署；未启动 v6/Persona v3/EI-2A。
- 状态：**READY_FOR_REVIEW**（本报告）；联合合同仍由 GPT 汇总、Owner 审阅。

## 1. 审查范围与基线

| 项 | 值 |
|---|---|
| Memory 仓库/分支/HEAD | `ba-song/dsh-memory-core` / `feat/m1-preference-memory` / **`7548e49ed0b8d8673818464325d8e72ec7704b27`** |
| tree | `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f` |
| 工作区 | `/tmp/memaudit/m1`；仅 `?? node_modules`；`git diff --check` 干净 |
| 测试 | `npm test` @ `7548e49`：258/258 pass、0 fail、0 skip、exit 0（本轮重跑） |
| 合同 | `006bb5bfce5d031b49a60271fe0406b228b43e00`；blob `10a62b64dff6219d00a1e25be09a39ddccb50e1a` |
| Memory 交叉审查 | `review/memory-owner-decisions-cross-review-02` @ `3af0a57b05367d7d37f67e5c1378d8b250b7d007` |
| Persona 交叉审查 | `review/persona-owner-decisions-cross-review-02` @ `5652e35b40754e4d94e42860cf623d2499fb27be`（513 行） |
| Channel Bridge 交叉审查 | `review/channel-bridge-owner-decisions-cross-review-02` @ `e811852a55d9f4c2a40694270d433b4f4b0a9733`（526 行） |

已完整阅读合同全文（323 行）、两份交叉审查报告全文，并对照 Memory R2（`26fbd08`）与 M1 代码；未使用摘要替代原文。

## 2. Owner 五项决策在 Memory 侧的落实

| 决策 | Memory 结论 | 状态 |
|---|---|---|
| **D1 三层关系拆分**：Conversation↔Session（CB）/ Session↔Self（Persona）/ Message↔Speaker·Experiencer（Memory） | 接受。**撤回本人上一轮提出的通用 `session_subjects` 表**（D1 已明确不得引入含义模糊的共享表）；Memory 不再主张写任何 session binding；改为在 memories/raw_meta 上保存消息级 `external_speaker_id`/`speaker_id`/`group_id`/`experiencer_*` 与证据引用 | **CONFIRMED（对齐 D1）** |
| **D2 Conversation ID 格式** `conv:qq:<account_id>:private:<peer_id>` / `conv:qq:<account_id>:group:<group_id>` | 接受。Memory 只存 `conversation_id`/`session_id`，不生成、不猜测；缺 `account_id`/`peer`/`group` → fail closed；旧 `group`/`private` → `legacy_unmapped` | **CONFIRMED（设计）** |
| **D3 Owner ID** `owner:<uuid>`，不得用 QQ/昵称/平台账号，跨平台需明确同意 | 接受。Memory 只存 `experiencer_id='owner:<uuid>'` 引用与证据；不生成 owner ID、不写跨平台 link；旧 `person:owner` 保留为 legacy 别名，不自动改写 | **CONFIRMED（引用规则）/ NOT_IMPLEMENTED（字段）** |
| **D4 旧记忆保护** | 接受。保留原文与 numeric confidence；缺字段保持 unknown；不批量删除/排除/降级；旧记忆可带不确定性标记参与回忆；迁移=只读扫描→证据候选→人工审查→Owner 授权 | **PARTIAL（可回忆 PASS；标记/迁移未实现）** |
| **D5 P0 优先级** | 接受。Memory 侧对应 P0-B（digest 跨会话）、P0-A（群成员归属）、P0-C（self 门禁）、P0-E（有效性）、P0-D（重复证据）、P0-F（Persona 事务） | **CONFIRMED（优先级）/ NOT_IMPLEMENTED（修复）** |

## 3. Memory 负责的字段、数据与写入边界

### 3.1 字段（PROPOSED，未实施）

`memories`（v6 候选）：
```sql
external_speaker_id TEXT NOT NULL DEFAULT '';  -- CB 提供，只读引用
speaker_id          TEXT NOT NULL DEFAULT '';  -- Memory canonical（person:contact:<platform>:<id> / self:<uuid> / owner:<uuid>）
speaker_type        TEXT NOT NULL DEFAULT 'unknown'; -- self|owner|third_party|unknown
group_id            TEXT NOT NULL DEFAULT '';  -- 群实体，不是成员
experiencer_type    TEXT NOT NULL DEFAULT 'unknown';
experiencer_id      TEXT NOT NULL DEFAULT '';
conversation_id     TEXT NOT NULL DEFAULT '';
session_id          TEXT NOT NULL DEFAULT '';
source_id           TEXT NOT NULL DEFAULT '';  -- 原始消息唯一键
evidence_id         INTEGER NOT NULL DEFAULT 0;
valid_from_kind     TEXT NOT NULL DEFAULT 'unknown';
superseded_at       INTEGER NOT NULL DEFAULT 0;
evidence_source     TEXT NOT NULL DEFAULT 'unknown';
verification_status TEXT NOT NULL DEFAULT 'unverified';
confidence_level    TEXT NOT NULL DEFAULT 'unknown';
```
`raw_meta` 增补 `external_speaker_id`（fresh DDL + 旧表条件 ALTER + schema 标记）；`speaker_id` 统一落库（含 `speaker_type`）。

### 3.2 写入责任（D1 三层）
| 数据 | 唯一写入方 | Memory 行为 |
|---|---|---|
| `conversation_id` / `session_id` | Channel Bridge | 只读引用；缺失 fail closed |
| `external_speaker_id` | Channel Bridge | 只读引用；可用于 canonical 映射 |
| `self:<uuid>` / `owner:<uuid>` 身份 | Persona | 只读引用；不得自造 |
| `speaker_id`（canonical） | **Memory**（people/contacts 映射；self/owner 引用 Persona 验证结果） | 写入 |
| `group_id` | Channel Bridge | 只读；群实体 `person:contact:qq:group:<gid>` 只作 scope/实体 |
| `experiencer_type/id` | **Memory**（基于 speaker/Persona evidence/CB 事实） | 写入 |
| 三维证据 | **Memory** | 写入 |
| validity / 补全审计 | **Memory** | 写入 |

### 3.3 群成员缺失处理
- `speaker_id=''`、`speaker_type='unknown'`、`experiencer_type='unknown'`、`experiencer_id=''`；保留 `group_id` 与 `external_speaker_id`（若有）。
- **禁止**：群 ID/群名/昵称/显示名进入 `speaker_id`；禁止把群实体当作成员；禁止把 owner 当默认 speaker。
- 仍可保存消息与群记忆，但主体标记 unknown；不得进入 self/owner 主体统计。

### 3.4 证据
- `memory_evidence`（write-once，不在 `PATCHABLE_COLUMNS`）：id、memory_id、source_id、conversation_id、session_id、external_speaker_id、speaker_id、experiencer_type/id、evidence_source、verification_status、confidence_level、producer、produced_at、evidence_version、integrity、supersedes_id、retracted_at。
- self/owner 的 canonical 断言必须引用 Persona 的 identity evidence；Memory 不自行推断。
- CB 提供平台事实（sender/chat/session）作为 `direct_observation`；推断必须 `evidence_source='inference'`。

## 4. 与 Persona、Channel Bridge 的接口合同（Memory 侧确认）

### 4.1 Channel Bridge → Memory
必须提供（PROPOSAL，待 CB 最终确认）：
`platform`, `account_id`, `conversation_id`, `runtime_session_id`, `chat_type`, `group_id`, `external_speaker_id`, `speaker_evidence`, `message_id`, `event_time`, `source`, `forward_from`/`original_author`（如有）。
不得提供/不得让 Memory 猜测：canonical `speaker_id`、`experiencer_id`、self/owner 身份。
缺 `conversation_id`/`account_id`/`peer|group` → fail closed（不写普通记忆、不注入）。

### 4.2 Persona → Memory
- `selfId()`：canonical `self:<uuid>` 或 null；Memory 拒绝 sentinel/非法/空（`E_PERSONA_IDENTITY_UNKNOWN/INVALID`）。
- `identityOf(header)`：返回 `{ok,valid,self_id,subject_type,subject_id,id_strength,reason}`；Memory 只采信 `valid && id_strength=stable`。
- Owner：`owner:<uuid>` 由 Persona（或 Owner 指定模块）签发；Memory 只存引用；D3 同意记录以 Persona/授权记录为准。
- `bindingOf`：`bound && persona_id===selfId` 才可作 self 依据；旧 binding 缺 subject → unknown。

### 4.3 反向确认（Memory 对 CB/Persona 的回应）
- CB 报告 §11 将 `speaker_id` 生成归 Memory：**ACCEPT**（与 D1 一致；CB 只给 external）。
- Persona 报告 §7.2 要求 self/owner evidence 引用 Persona：**ACCEPT**；Memory 只存引用，不推断。
- 三方均同意拆表（CB `channel_conversation_sessions` + Persona `persona_session_identity`）：**ACCEPT**；Memory 不写这两张表。
- Owner ID 归属：CB 建议 identity 域归 Persona、Memory 存引用；**PROPOSED，待 Owner 明确**（本报告不替 Owner 决定）。

## 5. 发现的问题（代码/Schema/测试证据）

| # | 问题 | 证据（HEAD 7548e49） | 级别 |
|---|---|---|---|
| 1 | 无 `experiencer_*`/`conversation_id`/`session_id`/三维字段 | `schema.js` memories DDL；`grep experiencer/evidence_source` 0 命中 | P0/P1 |
| 2 | 群消息 speaker=群实体，成员 ID 丢失 | `lib/ingest/archive.js:282-285`（`personOfUser` 群分支返回 `person:contact:qq:group:<gid>`） | **P0-A** |
| 3 | `conversation_scope` 恒空，无稳定会话身份 | `service.js:322,457`、`memories.js:45`、`ingest/migrate.js:154` | P0 |
| 4 | digest 混合 home+全部 QQ 私聊+群+email 注入 owner | `lib/inject/digest.js:5-21`、`lib/index.js:1218` | **P0-B** |
| 5 | self 哨兵/非法 ID 可写 | `service.js:191-198,281`；实测 `self:unknown`/`abc`→`self:abc`/`self:` 写入 | **P0-C** |
| 6 | validity 入口不一致（8+ 入口泄漏） | Memory R2 §4；preference/remembered/session-index/handoff/stable/rules/episodeRecent/P4/merge | **P0-E** |
| 7 | 同源重复提升 confidence | `lib/pref/merge.js:128-131`（`+0.02`、`evidenceCount+1`） | **P0-D** |
| 8 | 默认 confidence=1.0，旧数值被当确定 | `memories.js:31`、`schema.js:79` | P1 |
| 9 | fresh `raw_meta` 无 `speaker_id`；旧库条件写 `self:unknown` | `archive.js:174-185`（无列）、`:430-470`（sentinel）；探针 P4/P5 | **VERSION_MISMATCH** |
| 10 | 无 cutover/approximated/legacy 标记 | `grep cutover/approximated` 0 命中 | P1 |

## 6. 仍未解决的冲突与风险

1. **Owner ID 归属**：D3 定格式，但“谁签发 `owner:<uuid>`、谁记录跨平台同意”未在 D1 三层中明确；CB 建议 identity 域归 Persona，Memory 只存引用。需 Owner 明确。
2. **`session_bindings` 旧表退役**：CB/Persona 均建议拆表；旧表 historical binding 缺 subject → unknown，需迁移方案与 Owner 批准。
3. **runtime session 生成方**：Host/DSH vs CB（当前 CB 生成）；D1 未细化，需 Owner/GPT 裁决。
4. **conversation 缺失时写入策略**：D2 说 fail closed；Memory 建议“拒绝普通写入并审计”，但群消息是否允许以 `legacy_unmapped` 暂存需 Owner 确认。
5. **旧记忆 `valid_from_kind`**：legacy（created_at 近似）与 unknown 的边界需迁移版本批准后确定。
6. **三维枚举最终名**：与合同 §6 候选一致，但物理字段名需三方统一。
7. **跨平台 owner link**：Candidate/询问/同意记录格式（谁问、谁存、如何撤回）未定。
8. **P0 修复顺序**：D5 已定优先级；具体批次/验收归 GPT 统筹。

## 7. 推荐的合同文本调整

1. 明确 D1 三层对应表/接口：CB `channel_conversation_sessions`；Persona `persona_session_identity`；Memory 消息级字段；**删除任何 `session_subjects` 共享表提案**。
2. 明确 `speaker_id` 唯一写入=Memory；CB 只提供 `external_speaker_id`；Persona 只提供 self/owner 身份。
3. 明确 `owner:<uuid>` 签发方与同意记录归属（建议 Persona 身份域；Memory 存引用）。
4. 明确 `conversation_id` 缺失时 Memeory 的 fail-closed 行为（拒绝普通写入/注入，审计）。
5. 明确三维字段与旧 numeric confidence 的映射（旧值保留，不映射 high/medium）。
6. 明确旧记忆 cutover 由获批迁移版本确定；legacy=created_at 近似、approximated 标记。

## 8. 不应由 Memory 单方面决定

- `owner:<uuid>` 签发与跨平台 link 授权（Owner/Persona）。
- runtime session 生成方（Owner/GPT）。
- `conversation_id` 缺失时是否允许 `legacy_unmapped` 暂存（Owner）。
- cutover 时间/版本与迁移批次（Owner）。
- `session_bindings` 拆表迁移与旧行处置（CB/Persona/Owner）。
- 三维枚举物理命名（三方统一）。

## 9. 测试覆盖

- `npm test` @ `7548e49`：258/258、0 fail、0 skip、exit 0（本轮重跑；仅证明现有测试通过，不证明合同合规）。
- 本轮未新增测试；P0 验收矩阵沿用 Memory R2 §5 与三方报告 §6；以下 **NOT RUN**：Memory v6、迁移、真实渠道、生产 DB、Persona v3、EI-2A、设备。
- 建议新增测试（未实施）：群成员缺失→unknown；conversation 缺失→fail closed；digest 负向；self 哨兵/非法拒绝；同源重复不提升；validity 12 入口矩阵；迁移回滚。

## 10. 状态与后续依赖

- 状态：**READY_FOR_REVIEW**
- 依赖：Persona（self/owner 身份与 evidence）、Channel Bridge（conversation/session/speaker 事实）、Owner（owner 签发/迁移/cutover）。
- 合同：**NOT FROZEN**；Memory v6 / Persona v3 / EI-2A：**NOT_STARTED**。
- 本报告不构成实施授权；任何 v6/迁移/生产写入需 Owner 另行批准。
