# MEMORY–PERSONA–CHANNEL BRIDGE 三方接口联合裁决 · Memory 专项报告

- 任务：`MEMORY-PERSONA-CHANNEL-INTERFACE-ARBITRATION-01`
- 角色：Memory 记忆智能体负责人
- 时间：2026-11-22 14:1x–14:5x (Asia/Shanghai)
- 性质：只读设计；未改源码/测试/schema/数据库；未迁移/部署；未启动 v6/Persona v3/EI-2A。
- 状态：**READY_FOR_REVIEW**（Memory 专项）；联合接口提案 **DRAFT / 待另两方**（见联合提案文件）

## 1. 基线

| 项 | 值 |
|---|---|
| 仓库 | `ba-song/dsh-memory-core` |
| 分支 / HEAD | `feat/m1-preference-memory` @ **`7548e49ed0b8d8673818464325d8e72ec7704b27`** |
| tree | `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f` |
| main | `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`（ahead 245） |
| 契约 | `006bb5bf…`（blob `10a62b64…`，v1.1.1-draft） |
| 已有报告 | Memory R2 `26fbd08…`；Persona `4053341…`（blob `17d1fc1e…`） |
| Channel Bridge 报告 | **未找到**（仓库树无 `coordination/agent-reviews/channel-bridge/`；本仓库无 `lib/channel*`；`tests/channel-envelope.test.mjs` 仅测 archive 的 envelope 清洗）→ 跨仓库事实 **待其负责人确认** |
| 测试 | `npm test` @ `7548e49`：258/258 pass、0 fail、0 skip、exit 0 |

## 2. 已确认事实（只读证据）

### 2.1 数据模型
- `memories` 现有列：`speaker_id`、`conversation_scope`、`owner_scope`、`scope_type/scope_id`、`source_msg_id/source_ts/source_file/source_channel/source_ref`、`confidence REAL NOT NULL DEFAULT 1.0`、`valid_from/valid_to/temporal_kind/superseded_by`、`meta`（`lib/store/schema.js`，memories DDL）。
- **无** `experiencer_type/id`、`conversation_id`、`session_id`、`source_id`、`valid_from_kind`、`superseded_at`、`evidence_source/verification_status/confidence_level`、`experiencer_evidence`（`git grep` 0 命中）。
- `raw_meta` DDL 无 `speaker_id`（`lib/ingest/archive.js:174-181`）；写路径按列存在降级（`:471-490`）；`tests/channel-envelope.test.mjs` 首行手动 `ALTER TABLE raw_meta ADD COLUMN speaker_id` 才可测 → fresh 库缺列。

### 2.2 身份与 speaker
- `personaSelfId()` 只判空 + 强制 `self:` 前缀（`lib/service.js:191-198`）→ `abc`→`self:abc`、`self:`→写入、`self:unknown`→写入（`r2-id2.mjs`）；空→`E_PERSONA_UNAVAILABLE`。
- `addEpisode` 守卫只判 `!selfId`（`lib/service.js:281-300`）。
- 群消息 `personOfUser` 返回 `person:contact:qq:group:<gid>`（`archive.js:282-285`），不读 `srcMsg.contactId/senderId` 成员 ID → speaker=群实体。
- `meta` 在 `PATCHABLE_COLUMNS`（`memories.js:8-12`），可被 `updateMemory(metaPatch)` 改写。

### 2.3 会话与来源
- `conversation_scope` 所有写入点为空串（`service.js:322,457`、`ingest/migrate.js:154`、`memories.js:45`）；无 `conversation_id/session_id` 落库。
- `carryoverFor` 按 `cwd` 精确取原话（`lib/inject/carryover.js:6-16`）→ 同房间隔离可用。
- `buildDigest` 读取近 12h 全部 raw（`digest.js:15-21`），房间白名单含 home、全部 QQ 私聊、群、email，注入 owner 会话（`index.js:1218`）→ 跨会话原文泄漏。
- `scopeWhere` 对 contact/group 用 `scope_id` 精确匹配（`lib/scope.js:110-130`）。

### 2.4 有效性与证据
- 无 `validityState`；多入口内联过滤；泄漏矩阵见 MEMORY-REPORT-0028 §19.3（本轮复核结论一致）。
- `insertMemory` 对 `validFrom` 做 `Number()`（`memories.js:31`），`'abc'`→NaN→NULL；current recall 放行 NULL 起点（`recall.js:71`）→ 坏时间注入。
- `pref/merge.js:128-131` 同极性重复 `confidence+0.02`、`evidenceCount+1`。
- 无三维字段；`confidence` 默认 1.0（`schema.js:79`）。

## 3. Memory 身份字段设计（候选 PROPOSAL，未实施）

### 3.1 `memories` 新增列（v6 候选）
```sql
ALTER TABLE memories ADD COLUMN experiencer_type TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE memories ADD COLUMN experiencer_id   TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN conversation_id  TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN session_id       TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN source_id        TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN valid_from_kind  TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE memories ADD COLUMN superseded_at    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN evidence_source  TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE memories ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE memories ADD COLUMN confidence_level TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE memories ADD COLUMN experiencer_evidence_id INTEGER NOT NULL DEFAULT 0;
```
保留 `speaker_id`（谁说的）、`subject`（展示）、`owner_scope/scope_type`（scope）；`experiencer_*` 只表达经历归属。

### 3.2 写入映射（Memory 侧）
| 场景 | speaker_id | experiencer_type | experiencer_id | 证据 |
|---|---|---|---|---|
| self episode（addEpisode） | self:<uuid> | self | self:<uuid> | 必须 `experiencer_evidence` |
| owner 直接陈述（P4） | owner person id | owner（仅在 owner 已验证时） | person:owner | 需要 owner 证据；D1 未决 → unknown 或拒绝 |
| 群成员发言 | 成员 person id（无→''） | third_party | person:contact:<platform>:<id>（无→''） | 成员 ID 缺失 → unknown |
| 群实体记忆（如群摘要） | '' | third_party | person:contact:qq:group:<gid> | 群实体证据 |
| 无法判定 | 原 speaker | unknown | '' | 无 |

规则：speaker 不自动成为 experiencer；群实体不自动成为 speaker；owner ID 缺失不回退 self。

## 4. `experiencer_evidence` 设计（PROPOSAL）

### 4.1 存储（Memory 侧）
```sql
CREATE TABLE memory_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id INTEGER NOT NULL DEFAULT 0,
  session_id TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL DEFAULT '',
  speaker_id TEXT NOT NULL DEFAULT '',
  experiencer_type TEXT NOT NULL DEFAULT 'unknown',
  experiencer_id TEXT NOT NULL DEFAULT '',
  evidence_source TEXT NOT NULL DEFAULT 'unknown',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  confidence_level TEXT NOT NULL DEFAULT 'unknown',
  source_id TEXT NOT NULL DEFAULT '',
  producer TEXT NOT NULL DEFAULT '',
  produced_at INTEGER NOT NULL DEFAULT 0,
  evidence_version INTEGER NOT NULL DEFAULT 1,
  integrity TEXT NOT NULL DEFAULT '',
  supersedes_id INTEGER NOT NULL DEFAULT 0,
  retracted_at INTEGER NOT NULL DEFAULT 0,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX idx_mem_evidence_source ON memory_evidence(source_id);
```
`experiencer_evidence_id` 指向该表；`memory_evidence` **不加入 PATCHABLE_COLUMNS**（只由专用写入路径插入）。

### 4.2 产生/验证/保存
- 产生：可信写入路径（Channel Bridge 消息头 + Persona `identityOf` 的 self 断言）生成 evidence 草案；Memory 只接受带 `producer`、`issued_at`、`integrity`、`source_id` 的草案。
- 验证：Memory 校验结构（枚举/时间/自洽）+ producer 白名单 + `self:<uuid>` 格式；无法验证 → 不落 self，落 unknown 或拒绝。
- 保存：Memory 写 `memory_evidence`（write-once），`memories.experiencer_evidence_id` 关联；普通 PATCH 不可改。
- 历史：保留旧 evidence 行（`supersedes_id`/`retracted_at`），不物理删除。
- 冲突/撤回：`disputed`/`retracted` 状态保留原记录与关系；补全审计写 `memory_evidence` + `memory_backfill_log`。
- 审计：evidence_id、producer、produced_at、source_id、integrity、retraction 均可追溯。

## 5. 三维证据模型（PROPOSAL）

| 维度 | 字段 | 枚举 | 更新规则 |
|---|---|---|---|
| 来源 | `evidence_source` | direct_statement / direct_observation / historical_record / external_source / inference / unknown | 写入时确定；不因重复引用改变 |
| 验证 | `verification_status` | unverified / supported / confirmed / disputed / retracted | 仅新增独立证据（新 `source_id`，非 duplicate）可推进；冲突→disputed；撤回→retracted 且保留原记录 |
| 把握 | `confidence_level` | unknown / low / medium / high | 由证据质量与数量决定；重复同源不提升；旧 numeric confidence → unknown |

- 旧 `confidence REAL` 保留但不再作概率：迁移时 `confidence_level='unknown'`、`evidence_source='historical_record'`（可访问原文）或 `unknown`、`verification_status='unverified'`；不得把 0.5/1.0 解释为中等/高。
- 证据关系：`source_id` 唯一；同源副本 `relation='duplicate_of'`，不计数；独立来源才 `corroborates`；矛盾 `contradicts` 保留。
- `disputed/retracted` 不删除记忆；原记录保留，附纠正关系。
- 情绪 score/intensity/certainty 存 Persona 表，Memory 不读取作为 confidence。
- 不确定记忆：检索结果必须返回 `verification_status/confidence_level`；重要决策路径要求 `confirmed` 或额外证据；Memory 不替代授权层。

## 6. validity 与历史兼容（PROPOSAL）

### 6.1 统一入口
`lib/store/validity.js`：`validityState(row, at, {mode:'current'|'asOf', supersede:'enforce'|'guard'}) → {state:'VALID'|'INVALID'|'UNCERTAIN', reason, approximated?}`；SQL 预设由同一 spec 生成。

规则：
- current：`status='active'` ∧ `superseded_by` 空 ∧ 时间窗；`valid_from_kind='unknown'` → UNCERTAIN；`legacy` 以 `created_at_epoch` 为下限（近似，标 approximated）。
- asOf：忽略当前 status 对 superseded/corrected 的排除；`valid_to>asOf`；`superseded_by>0 && superseded_at=0` → UNCERTAIN；`superseded_at>asOf` 有效；legacy/implicit 以 created_at 下限；unknown → UNCERTAIN。
- `implicit`：无 valid_from，合法 created_at 为起点（等价 exact+valid_from=created_at）。
- `legacy`：cutover 前 NULL；created_at 下限近似；不得无下限注入。
- `unknown`：无法建立可信边界（含非法时间被清洗为 NULL 的可疑行）；排除当前注入。

### 6.2 入口覆盖（必须全部改造）
recall current/asOf、preference、remembered、session-index、handoff、rules、stable（含 group）、graph 候选/最终、episodeRecent、daily/weekly 候选、P4 邻居、merge 候选、p4 邻居预过滤；quotes/anchors/digest 属 raw 域，不参与 memories 有效性但需会话隔离。

### 6.3 superseded_at
- 写入点：weekly 两条路径、pref/merge、conflict/resolve、rules（valid_to 代理，显式标注过渡）。
- 回填：memory_revisions.changed_at > valid_to≤cutover > 0；0+superseded_by>0 → UNCERTAIN。
- 历史保留：不得物理删除；asOf 按真实替代时间。

## 7. 自主补全设计（PROPOSAL，只读前三阶段）

1. 只读扫描：`memory_backfill_scan` 只读查询缺失字段/冲突/时间不明/关联断裂，输出清单（不写）。
2. 证据检索：仅在可访问 raw/证据链内检索；记录 source_id 与访问范围。
3. 候选生成：写 `memory_backfill_candidates`（memory_id、字段、旧值、新值、证据、置信、状态），不写 memories。
4. 正式写入（本轮不授权）：独立授权后写元数据列 + `memory_backfill_log`（时间/来源/方法/原值/新值/操作者）；不覆盖 `memories.text`；冲突保留。
5. 批量迁移：另行授权，单事务、前后计数、回滚。

## 8. 联合接口（Memory 侧建议，待另两方确认）

### 8.1 消息流（Memory 视角）
```
外部平台消息
 → Channel Bridge：平台原始事实（platform/account/chat_type/group_id/sender_id/message_id/event_time）
 → 标准化 envelope：conversation_id（稳定）/session_id（运行期）/speaker_id/speaker_evidence
 → Persona：identityOf（self:<uuid> 或 null/错误）；binding 校验（persona_id===selfId）
 → Memory：校验 speaker/experiencer/evidence → 生成/保存记忆（experiencer_type/id、conversation_id、session_id、source_id、三维、valid_from_kind）
 → 检索：validityState + 会话/主体/权限过滤
 → 注入：只注入 VALID 且允许的 scope；跨会话仅经授权长期记忆
```

### 8.2 RACI（Memory 行；其他模块列为待确认）
| 事项 | R（执行） | A（负责） | C（咨询） | I（知会） |
|---|---|---|---|---|
| conversation_id 生成 | Channel Bridge | Channel Bridge | Persona/Memory | Memory |
| runtime session_id | Channel Bridge/宿主 | Channel Bridge | Persona/Memory | Memory |
| conversation↔session 映射 | Channel Bridge | Channel Bridge | Persona | Memory |
| speaker_id 生成 | Channel Bridge | Channel Bridge | Persona | Memory |
| speaker_id 验证 | Channel Bridge | Channel Bridge | Persona/Memory | — |
| self ID 验证 | Persona | Persona | Memory | Memory |
| owner ID 验证 | 所有者（D1 未决） | 所有者 | Persona/Memory | — |
| third_party ID | Memory people/contacts | Memory | Channel Bridge | Persona |
| experiencer 判断 | Persona+Channel Bridge 提供证据；Memory 落库 | Memory（数据一致性） | Persona/CB | — |
| experiencer_evidence 产生 | Channel Bridge+Persona | Persona（身份）/CB（会话） | Memory | Memory |
| evidence 保存 | Memory | Memory | Persona/CB | — |
| session_bindings 写入 | **待裁决**（当前 Persona `inject.writeBinding`；契约方向 CB） | 所有者 | Persona/CB/Memory | — |
| binding 验证 | Persona | Persona | Memory | Memory |
| digest 构建 | Memory | Memory | CB/Persona | — |
| 跨会话检索 | Memory | Memory | CB/Persona | — |
| 跨会话注入 | Memory（受授权/scope） | Memory | CB/Persona | — |
| validityState | Memory | Memory | — | — |
| 补全审计 | Memory | Memory | 所有者（写入授权） | — |

**冲突点（需裁决）**：`session_bindings` 写入方（Persona 现状 vs 契约方向 Channel Bridge）；owner ID（D1）；conversation_id 产生方与格式。

### 8.3 错误码（Memory 侧提案）
| 码 | 触发 | 行为 |
|---|---|---|
| `E_PERSONA_SELF_MISSING` | selfId 为 null/缺失 | fail closed（拒绝 self episode） |
| `E_PERSONA_SELF_INVALID` | 非法格式/哨兵/非 canonical | fail closed |
| `E_PERSONA_SELF_CONFLICT` | 多 active self | fail closed |
| `E_SPEAKER_UNKNOWN` | 成员 ID 缺失 | 降级：speaker=''，experiencer=unknown |
| `E_EXPERIENCER_UNKNOWN` | 证据不足 | 降级：unknown，不拒绝（非 self 场景） |
| `E_EVIDENCE_INVALID` | 证据结构/来源不合法 | self 场景 fail closed；其他 unknown |
| `E_CONVERSATION_UNMAPPED` | 无 conversation_id | 降级：不跨会话注入，记审计 |
| `E_SESSION_BINDING_CONFLICT` | binding 冲突/过期 | fail closed（self） |
| `E_BINDING_EXPIRED` | binding 过期 | fail closed（self） |
| `E_CROSS_SESSION_DENIED` | 跨会话原文访问 | 拒绝并审计 |
| `E_SOURCE_DUPLICATE` | 同 source_id 重复 | 不提升证据，记 occurrence |
| `E_VALIDITY_CONFLICT` | superseded_at 缺失/时间冲突 | UNCERTAIN，不注入 |
| `E_MIGRATION_VALIDATION_FAILED` | 迁移校验失败 | 整体回滚 |

### 8.4 版本与 cutover
- `contract_version`（v1.1.1）、`evidence_version`、`conversation_identity_version`、`session_binding_version`、`migration_version`（v6）。
- cutover 时间/版本 **待所有者批准**，不得自行设定；迁移只按证据回填，无证据 unknown。
- 回滚：单事务 + version 最后写 + 失败回滚 + 前后计数；v6 测试 6 类（fresh/v5→v6/v4→v6/partial/坏行/失败）。

## 9. P0 风险（Memory 侧）

| 编号 | 风险 | 证据 | 修复方向 |
|---|---|---|---|
| P0-A | 群成员 speaker 被群实体替代 | `archive.js:282-285` | CB 提供 sender；Memory 存 speaker_id + speaker_evidence；无 ID → unknown |
| P0-B | digest 跨会话原文注入 | `digest.js:5-21`、`index.js:1218` | 按 conversation_id 过滤；跨会话需授权与审计；默认禁止 |
| P0-C | self 门禁失效 | `service.js:191-198,281`；probe | 严格 canonical 校验；拒绝 sentinel/invalid；fail closed |
| P0-D | 重复证据提升 | `merge.js:128-131` | source_id 去重；同源 occurrence 不升 confidence |
| P0-E | 有效性泄漏 | R2 矩阵 | 统一 validityState；12 入口改造 |
| P0-F | Persona timeline 错列/非原子 | Persona 报告 | Persona 侧修复；Memory 只读接口 |

## 10. 待其他模块回答

**Channel Bridge**：
1. 是否已有稳定 conversation_id？格式与跨进程稳定性？
2. 私聊/群聊是否保留 group_id + member sender_id？
3. 是否提供 conversation_id↔session_id 映射？
4. 群成员缺失时能否显式 unknown？
5. digest 数据是否可按 conversation 边界提供？

**Persona**：
1. `selfId()` 严格协议（null/错误码）与 `identityOf` 输出结构？
2. `bindingOf` 是否校验 `persona_id===selfId()`？
3. `session_bindings` 写入方与生命周期（当前 Persona vs 契约方向 CB）？
4. `experiencer_evidence` 是否由其产生/断言？
5. timeline 错列与事务修复计划？

## 11. 待所有者裁决

1. D1 canonical owner ID 与 owner episode 写入策略。
2. `session_bindings` 唯一写入方（Persona vs Channel Bridge）。
3. conversation_id 格式与产生方（Channel Bridge）。
4. cutover 时间/版本与 legacy 近似规则。
5. `role_only` 写入策略（拒绝 vs unknown）。
6. 自主补全是否允许未来自动写入及授权范围。
7. 跨平台账号合并策略。

## 12. 风险等级与 NOT RUN

- P0：群成员归属、digest 跨会话、self 门禁、重复证据、有效性泄漏、Persona 事务。
- P1：conversation 映射缺失、三维字段缺失、历史 cutover 缺失、raw_meta speaker_id 缺失。
- **NOT RUN**：生产 DB、设备、真实注入、Channel Bridge 实现（仓库未提供）、Persona 运行时、迁移、v6/Persona v3/EI-2A。

## 13. 状态

- Memory 专项：**READY_FOR_REVIEW**
- 联合接口提案：**DRAFT**（Memory 侧；待 Persona/Channel Bridge 报告与回应）
- 契约：**BLOCKED — NOT FROZEN**
- Memory v6 / Persona v3 / EI-2A：**NOT_STARTED**
