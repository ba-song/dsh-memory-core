# DSHA「汐」Memory–Persona–Channel Bridge 联合接口提案 v0.1（DRAFT / PROPOSAL）

- 任务：`MEMORY-PERSONA-CHANNEL-INTERFACE-ARBITRATION-01`
- 状态：**PROPOSAL — NOT APPROVED / NOT FROZEN**
- 编制：Memory 专项（本文件为 Memory 侧草案）
- 待并入：Persona/EI 专项报告、Channel Bridge 专项报告
- 说明：凡涉及 Channel Bridge/Persona 内部实现与最终写入权的条目，均标注 **PENDING**；不得视为已批准或已联合验证。

## 1. 目标

回答：一条外部消息进入 DSHA 后，身份、会话、speaker、experiencer、证据分别由谁产生、验证、保存、修改；不同会话在什么条件下可共享长期记忆。

## 2. 消息流（目标状态）

```
外部平台消息
 → Channel Bridge（R）：平台原始事实
    platform / account_id / chat_type / group_id / sender_external_id / message_id / event_time
 → 标准化 envelope（CB，R）：conversation_id（稳定）/ session_id（运行期）/ speaker_id / speaker_evidence
 → Persona（R）：identityOf(header) → self_id（canonical 或 null）；binding 校验
 → Memory（R）：校验 + 落库
    speaker_id / experiencer_type / experiencer_id / conversation_id / session_id / source_id
    evidence_source / verification_status / confidence_level / valid_from_kind
 → Memory 检索：validityState + 会话/主体/权限过滤
 → 注入：仅 VALID 且允许的 scope；跨会话仅经授权长期记忆
```

失败行为：
- self 无法验证 → 拒绝 self episode（fail closed）；
- conversation 无法映射 → 不跨会话注入，记审计；
- speaker/experiencer 无证据 → unknown（不拒绝非 self 记录）。

## 3. conversation / session 模型

### 3.1 定义
- `conversation_id`：长期会话容器，跨 DSH 重启稳定。候选：`conv:<platform>:<account_id>:<chat_type>:<peer_id|group_id>`
  - 私聊：`conv:qq:<botAccount>:private:<qq>`
  - 群聊：`conv:qq:<botAccount>:group:<gid>`
  - 邮件：`conv:email:<account>:thread:<hash>`
- `session_id`：运行期会话（DSH 启动/连接），由宿主/Channel Bridge 生成。
- 映射：Channel Bridge 维护 `conversation_id ↔ session_id`；Memory 只存两列，不自行生成。

### 3.2 隔离
- 原始原文（raw_meta）按 `conversation_id` 写入；`cwd` 仅作兼容辅助。
- 注入默认只读当前 `conversation_id` 的原文；跨会话原文默认禁止。
- 跨会话长期记忆：按 subject/scope/permission 检索，不带原文；需审计。
- digest：仅当前 conversation 或 owner 明确授权范围；禁止 home+全部私聊+群混合。

### 3.3 PENDING
- conversation_id 最终格式与产生方（建议 CB）。
- session_bindings 唯一写入方（Persona 现状 vs 契约方向 CB）。
- 跨平台账号合并（默认不合并）。

## 4. speaker / experiencer 模型

### 4.1 字段语义
| 字段 | 含义 | 产生 | 保存 |
|---|---|---|---|
| `speaker_id` | 谁说的 | Channel Bridge（原始 sender） | Memory（raw/memories） |
| `speaker_evidence` | speaker 识别依据 | CB | Memory（raw extra/evidence） |
| `experiencer_type` | self/owner/third_party/unknown | Persona+CB 证据；Memory 落库 | Memory |
| `experiencer_id` | 主体稳定 ID | 同上 | Memory |
| `experiencer_evidence` | 可信证据 | CB 会话事实 + Persona self 断言 | Memory（write-once 表） |
| `conversation_id/session_id` | 会话容器/运行期 | CB | Memory |
| `source_id` | 原始消息唯一键 | CB（message_id 派生） | Memory |
| `subject` | 展示文本 | 抽取/写入方 | Memory（不用于身份） |

### 4.2 规则
- speaker ≠ experiencer；群实体 ≠ speaker；群实体 ≠ 成员。
- self 只接受 canonical `self:<uuid>`；owner 需 D1 证据（未决→unknown/拒绝）；third_party 用 `person:<stable>`；成员无 ID → unknown。
- 群实体 ID：`person:contact:qq:group:<gid>`（third_party 群体实体，不新增类型）。

## 5. 证据模型

### 5.1 三维独立
`evidence_source`（direct_statement/direct_observation/historical_record/external_source/inference/unknown）× `verification_status`（unverified/supported/confirmed/disputed/retracted）× `confidence_level`（unknown/low/medium/high）。

### 5.2 证据关系
- `source_id` 唯一；同源副本 `duplicate_of`，不计数；独立来源 `corroborates`；冲突 `contradicts`；撤回 `retracted` 保留原记录。
- 重复检索/引用/摘要/转述不提升 verification/confidence。
- 旧 numeric confidence → `confidence_level='unknown'`；不得解释为概率。
- 情绪原始 score/intensity/certainty 不入记忆可信度。

### 5.3 存储
`memory_evidence`（id, memory_id, session_id, conversation_id, speaker_id, experiencer_type/id, evidence_source, verification_status, confidence_level, source_id, producer, produced_at, evidence_version, integrity, supersedes_id, retracted_at, meta）；write-once，非 PATCHABLE。

## 6. session binding 协议

- 写入：**PENDING**（当前 Persona `inject.writeBinding`；契约方向 CB）。
- 校验：Persona 校验 `bound===true && persona_id===selfId()`；CB 校验 conversation↔session 映射。
- 字段（候选）：`session_id, conversation_id, self_id, subject_type, subject_id, source, issued_at, expires_at, version, status`。
- 生命周期：创建/刷新/过期/解绑/冲突；历史审计；旧 binding 不满足同源校验 → 不可作 self 依据。
- 唯一写入权：不得 Persona 与 CB 双写；由所有者裁决。

## 7. RACI（提案；PENDING 项见注）

| 事项 | R | A | C | I |
|---|---|---|---|---|
| conversation_id 生成 | Channel Bridge | Channel Bridge | Persona/Memory | Memory |
| runtime session_id | Channel Bridge/宿主 | Channel Bridge | Persona/Memory | Memory |
| 二者映射 | Channel Bridge | Channel Bridge | Persona | Memory |
| speaker_id | Channel Bridge | Channel Bridge | Persona | Memory |
| self ID 验证 | Persona | Persona | Memory | — |
| owner ID | 所有者 | 所有者 | Persona/Memory | — |
| third_party ID | Memory | Memory | Channel Bridge | Persona |
| experiencer 判定 | Memory 落库 | Memory | Persona/CB | — |
| evidence 产生 | CB+Persona | Persona/CB（待定） | Memory | — |
| evidence 保存 | Memory | Memory | Persona/CB | — |
| session_bindings 写入 | **PENDING** | 所有者 | Persona/CB | — |
| binding 验证 | Persona | Persona | Memory | — |
| digest | Memory | Memory | CB/Persona | — |
| 跨会话检索/注入 | Memory | Memory | CB/Persona | — |
| validityState | Memory | Memory | — | — |
| 补全审计 | Memory | Memory | 所有者 | — |

唯一写入权：conversation/session=CB；self identity=Persona；memory/evidence/validity=Memory；owner=D1 未决。

## 8. 错误码表

| 码 | 触发 | 行为 |
|---|---|---|
| E_PERSONA_SELF_MISSING / INVALID / CONFLICT | self 缺失/非法/多 active | fail closed |
| E_SPEAKER_UNKNOWN | 成员 ID 缺失 | unknown（降级） |
| E_EXPERIENCER_UNKNOWN | 证据不足 | unknown（降级） |
| E_EVIDENCE_INVALID | 证据结构/来源非法 | self fail closed；其他 unknown |
| E_CONVERSATION_UNMAPPED | 无 conversation_id | 不跨会话注入 + 审计 |
| E_SESSION_BINDING_CONFLICT / EXPIRED | binding 冲突/过期 | self fail closed |
| E_CROSS_SESSION_DENIED | 跨会话原文访问 | 拒绝 + 审计 |
| E_SOURCE_DUPLICATE | 同 source_id 重复 | 不提升证据 |
| E_VALIDITY_CONFLICT | 替代时间缺失/冲突 | UNCERTAIN，不注入 |
| E_MIGRATION_VALIDATION_FAILED | 迁移校验失败 | 整体回滚 |

## 9. 兼容与迁移

- `contract_version`（v1.1.1）、`evidence_version`、`conversation_identity_version`、`session_binding_version`、`migration_version`（v6）。
- cutover：**待所有者批准**；旧记录按 legacy（created_at 下限近似、approximated）保留可用；无证据 unknown。
- 迁移：单事务、version-last、失败回滚、前后计数；原文不改；raw_meta speaker_id 条件 ALTER + schema 标记。
- 回滚：失败整体回滚；不留下半迁移 schema。

## 10. P0 风险与验收

| 编号 | 风险 | 验收标准 |
|---|---|---|
| P0-A | 群成员 speaker 被群实体替代 | 群消息 speaker=成员 ID；缺失→unknown；测试覆盖 |
| P0-B | digest 跨会话注入 | digest 仅当前 conversation/授权范围；负向测试 |
| P0-C | self 门禁 | sentinel/`self:`/`abc`/空/多 active 全部拒绝；测试 |
| P0-D | 重复证据提升 | 同 source_id 副本不提升；关系表可追溯 |
| P0-E | 有效性泄漏 | 12 入口统一 validityState；矩阵测试 |
| P0-F | Persona timeline/事务 | 列名修复、单事务、错误可观测、回滚测试 |

## 11. 待所有者裁决

1. D1 owner canonical ID 与 owner episode 写入。
2. session_bindings 唯一写入方（Persona vs CB）。
3. conversation_id 格式与产生方。
4. cutover 时间/版本与 legacy 近似规则。
5. role_only 写入策略。
6. 自主补全自动写入授权。
7. 跨平台账号合并策略。

## 12. 未决 / 待另两方回应

- Channel Bridge：conversation_id 现状、群成员 sender、映射接口、digest 边界（本仓库无实现，报告缺失）。
- Persona：selfId/identityOf/binding 协议、session_bindings 写入责任、experiencer_evidence 产生。
- 三方：RACI 中 PENDING 项的最终归属。

## 13. 状态

**PROPOSAL / 未批准 / 未冻结**。Memory v6、Persona v3、EI-2A 均 NOT_STARTED；本提案不构成实施授权。
