# DSHA「汐」WriteEvidence DTO 与 Q149 Recovery Adapter 契约草案

- 日期：2026-11-24
- 仓库：`ba-song/dsh-memory-core`
- 分支：`audit/p0-1-static-review-20261124`
- 基线：P0-1 `6f20aaae024078653f7fde1dec20a7c1555d181e`
- 类型：设计草案 + 纯 fixture；不接入运行时代码、不落库、不执行迁移。
- 关联审查：
  - `docs/audit/P0-1-STATIC-SECURITY-REVIEW-2026-11-24.md`
  - `docs/audit/P0-1-MEMORY-PROVENANCE-REVIEW-ADDENDUM-2026-11-24.md`

## 1. 设计目标

统一表达“这条记忆是怎样产生的、它引用了什么、来源是否被认证、用户是否确认了命题、它由哪些证据派生”，但不把这些不同问题压缩成单一可信标记。

必须保持以下区分：

- 定位符存在 ≠ 文件/消息真实存在。
- 引文与 source text 字面匹配 ≠ source text 来自 Host 认证会话。
- Host 观察到 session ≠ Host 认证 owner。
- Host 认证 owner ≠ 用户同意向另一个会话披露。
- 用户说过某句话 ≠ 该句话所描述的命题已经客观证实。
- 多个副本/摘要 ≠ 多个独立来源。
- Q149 的 supported ≠ 多源交叉印证，更不等于绝对真实。

本 DTO 先用于测试 fixture、审计输出和纯函数设计。不得直接视为数据库 schema 或生产 API。

## 2. WriteEvidence DTO（提议）

示意结构：

```js
{
  schemaVersion: 1,
  evidenceId: "ev-...",
  origin: {
    kind: "host_event", // host_event | user_supplied | migrated_file |
                        // correction | diary | manual_file | tool_output
    channel: "web",
    accountRef: null,
    sourceRef: "message-key-or-file-locator",
    sourceMessageId: "opaque-message-id",
    sourceTimestamp: 0,
    sourceSessionId: "opaque-session-id",
    conversationId: null,
    locatorStatus: "present_unverified"
    // present_unverified | resolved | missing | inaccessible | expired | tombstoned
  },
  hostObservation: {
    status: "not_provided",
    // observed | not_observed | revoked | not_provided
    sessionId: null,
    cwdBinding: null,
    observedAt: null,
    lifecycleGeneration: null,
    hostEventRef: null
  },
  textEvidence: {
    sourceTextOrigin: "user_supplied",
    // host_event | user_supplied | migrated_file | correction |
    // diary | manual_file | tool_output | unknown
    quoteMatch: "exact",
    // exact | derived | no_overlap | absent | not_checked
    quote: "literal excerpt",
    sourceTextDigest: null
  },
  claim: {
    kind: "direct_statement",
    // direct_statement | emotion | shared_experience | derived_pattern |
    // model_inference | correction_event | tool_observation | unknown
    confirmation: "unconfirmed",
    // unconfirmed | user_confirmed | disputed | withdrawn | not_applicable
    confidence: null,
    uncertainty: ["source_authenticity_unknown"]
  },
  lineage: {
    parentEvidenceIds: [],
    extractor: null,
    extractorVersion: null,
    independenceKey: null,
    copiedFrom: null
  },
  lifecycle: {
    status: "active",
    // active | faded | archived | soft_deleted | permanently_deleted |
    // expired | tombstoned | unknown
    createdAt: null,
    validFrom: null,
    validTo: null,
    retentionClass: "unknown"
  },
  access: {
    decision: "not_evaluated",
    // allowed | denied | missing | expired | not_evaluated
    policyRef: null,
    authorizationRef: null,
    evaluatedAt: null
  }
}
```

### 字段语义与硬规则

1. `origin.kind` 描述证据载体来源类型，不代表可信等级。
2. `locatorStatus='present_unverified'` 只表示有定位字符串；只有 adapter 实际完成受控解析后才可标记 resolved。
3. `hostObservation.status='observed'` 只证明 Host 生命周期事件观察，不证明 owner 身份，也不证明 consent。
4. `textEvidence.quoteMatch='exact'` 只证明字面匹配；不能自动将 `claim.confirmation` 改为 user_confirmed。
5. `sourceTextOrigin='user_supplied'` 时，即使 quoteMatch=exact，source authenticity 仍为 unknown，除非另有独立 Host evidence。
6. `claim.kind='model_inference'` 不得标记 user_confirmed，除非用户明确确认的是该精确命题，并留下独立 confirmation event。
7. `correction_event` 只证明发生过纠错互动；不能自动把被纠正命题的反命题升级为已确认事实。
8. `independenceKey` 和 `copiedFrom` 是 adapter 的 lineage 断言；planner 只报告断言，不自行认证。
9. 缺失字段保持 unknown/null；不得从 cwd、文件名、模型参数、相邻消息或自然语言推断补齐。
10. 任何 deny/missing/expired/tombstoned access 状态都不能被转换为可读证据。

## 3. provenance 维度矩阵

| 场景 | origin.kind | sourceTextOrigin | quoteMatch | hostObservation | claim.confirmation |
|---|---|---|---|---|---|
| 正常 Host 消息显式记忆 | host_event | host_event | exact/derived | observed（仍非 owner auth） | unconfirmed |
| 手工工具传入 source_text | user_supplied | user_supplied | exact/derived | not_provided，除非另有证据 | unconfirmed |
| 无原文手工补录 | manual_file 或 user_supplied | manual_file/user_supplied | absent | not_provided | unconfirmed |
| 离线迁移旧记忆 | migrated_file | migrated_file | not_checked/absent | not_provided | unconfirmed |
| 主人纠错事件 | correction | correction | absent/not_checked | 依真实事件证据填写 | correction_event 本身不确认反命题 |
| 汐写的日记 | diary | diary | not_checked/absent | not_provided | unconfirmed；作者角色保留 self |
| 工具输出 | tool_output | tool_output | exact/derived | observed 不等于 owner statement | 不得冒充 direct user statement |

注意：表格描述的是证据语义，不是当前代码已实现的自动映射。

## 4. 纯函数验证规则（提议）

建议新增纯函数 `assessWriteEvidence(input)`，只返回诊断，不访问 DB、文件系统、Host 或网络。

建议输出：
- `locatorEvidence`：present_unverified / resolved / missing / inaccessible / expired / tombstoned；
- `quoteEvidence`：exact_match / derived_match / mismatch / absent / not_checked；
- `hostSessionEvidence`：observed / not_observed / revoked / not_provided；
- `sourceAuthenticity`：host_event_backed / caller_supplied / migrated / unknown；
- `claimConfirmation`：unconfirmed / user_confirmed / disputed / withdrawn / not_applicable；
- `lineageAssessment`：single_asserted_lineage / multiple_asserted_lineages / copied / unknown；
- `gaps[]`：缺失或冲突原因；
- `warnings[]`：不允许作出的强推断。

纯函数不得输出一个统合的 `trusted=true`。若调用方确实需要授权判断，必须调用独立 Host authorization boundary，不能用 provenance assessment 替代。

## 5. Q149 Recovery Adapter 契约（提议）

规划器继续保持纯函数、无 I/O。新 adapter 必须在调用 planner 之前完成授权与受限读取。

建议接口：

```ts
type RecoveryAccess =
  | { status: "allowed"; authorizationRef: string; evaluatedAt: number }
  | { status: "denied"; reason: string }
  | { status: "missing" }
  | { status: "expired" }
  | { status: "tombstoned" };

type RecoveryEvidence = {
  id: string;
  kind: "raw_user_message" | "raw_assistant_message" | "tool_output" |
        "diary_self" | "manual_fact_card" | "derived_memory" | "unknown";
  locator: string;
  at: number | null;
  excerpt: string | null;
  relation: "supports" | "contradicts" | "context" | "unclear";
  access: "allowed" | "denied" | "missing" | "expired";
  originKind: string;
  sourceSessionId: string | null;
  sourceAuthenticity: "host_event_backed" | "caller_supplied" |
                      "migrated" | "unknown";
  claimConfirmation: "unconfirmed" | "user_confirmed" |
                     "disputed" | "withdrawn" | "not_applicable";
  independenceKey: string | null;
  copiedFrom: string | null;
  lifecycleStatus: string;
};

interface RecoveryAdapter {
  discover(input: {
    ownerId: string;             // trusted local context, never model supplied
    targetClaim: string;
    allowedSourceKinds: string[];
    timeRange?: { from: number; to: number };
    authorizationRef: string;    // host-issued, scoped authorization
  }): Promise<{
    access: RecoveryAccess;
    evidence: RecoveryEvidence[];
    warnings: string[];
  }>;
}
```

### Adapter 强制要求

1. 先授权后读取；不能先读完全部 archive 再把结果标记 denied。
2. ownerId 只能由可信本地上下文提供；模型参数不得指定任意 owner。
3. 授权绑定目的、来源类型、时间范围、目标 session/claim 与最小字段；不允许 wildcard。
4. raw archive 必须过滤第三方群聊内容、system/context、工具密钥/凭据及不适合恢复的角色事件。
5. 用户原话、汐的回复、工具输出、日记/self、人工事实卡保持不同 kind。
6. tombstone、soft delete、永久删除、过期、缺失、拒绝访问是不同状态；不得统一伪装成“没有证据”。
7. 多个文件/摘要若来自同一原始事件，必须返回同一 lineage key 或 copiedFrom。
8. adapter 不得将单一来源复制成多个独立来源。
9. adapter 只读，不写 memories、raw archive、diary、facts、Persona 或审计外的状态。
10. authorizationRef 必须在读取时校验，并在结果交给 planner 前确认未过期/撤销；若授权不能被可靠校验，返回 denied。
11. 审计只记录授权 ID、来源类型、条数、决策和错误码，不复制原话正文。
12. adapter 的 excerpt 必须最小化；规划器不需要完整对话 transcript。

### Planner 结果语义

- `supported`：现有可读证据支持该命题；不等于用户确认或多源印证。
- `contradicted`：现有可读证据与命题冲突；不自动改写旧记忆。
- `ambiguous`：证据互相冲突或上下文不足；保留不确定性。
- `insufficient_evidence`：当前证据不足；不补造。
- 所有 proposedOperation 都是建议；恢复写入必须走单独、明确的用户确认与版本化写入流程。

## 6. 测试 fixtures（设计样例，不执行真实读取）

### Fixture A — Host 消息 + 精确引文

```js
{
  origin: { kind: "host_event", sourceMessageId: "m-101", sourceSessionId: "s-A", locatorStatus: "resolved" },
  hostObservation: { status: "observed", sessionId: "s-A", cwdBinding: "/test/home/A" },
  textEvidence: { sourceTextOrigin: "host_event", quoteMatch: "exact", quote: "我们在周六见面" },
  claim: { kind: "shared_experience", confirmation: "unconfirmed", uncertainty: [] }
}
```

期望：quote 字面证据 exact；Host session observed；sourceAuthenticity 可标 host_event_backed；claim 仍 unconfirmed。不得从“用户说过”推断“事件客观发生”。

### Fixture B — 手工伪造 source_text，但 quote 匹配

```js
{
  origin: { kind: "user_supplied", sourceMessageId: null, sourceSessionId: null, locatorStatus: "missing" },
  hostObservation: { status: "not_provided" },
  textEvidence: { sourceTextOrigin: "user_supplied", quoteMatch: "exact", quote: "我从未说过这句话" },
  claim: { kind: "direct_statement", confirmation: "unconfirmed", uncertainty: ["source_authenticity_unknown"] }
}
```

期望：quote exact；sourceAuthenticity caller_supplied；Host evidence absent；不能标 host_event_backed，不能因为 exact 就提升为 user_confirmed。

### Fixture C — 离线迁移记录

```js
{
  origin: { kind: "migrated_file", sourceRef: "legacy/archive/2025.md", locatorStatus: "present_unverified" },
  hostObservation: { status: "not_provided" },
  textEvidence: { sourceTextOrigin: "migrated_file", quoteMatch: "not_checked" },
  claim: { kind: "unknown", confirmation: "unconfirmed", uncertainty: ["legacy_provenance_unknown"] }
}
```

期望：legacy-unknown；路径字符串不等于文件存在；不自动升级 verified。

### Fixture D — correction 事件

```js
{
  origin: { kind: "correction", sourceMessageId: null, sourceSessionId: null, locatorStatus: "missing" },
  hostObservation: { status: "not_provided" },
  textEvidence: { sourceTextOrigin: "correction", quoteMatch: "absent" },
  claim: { kind: "correction_event", confirmation: "not_applicable", uncertainty: ["corrected_claim_requires_separate_evidence"] },
  lineage: { parentEvidenceIds: ["memory-old-9"] }
}
```

期望：只记录纠错事件及目标记忆关系；不能把被纠正命题的反命题自动确认为事实。

### Fixture E — 同一原话的多个副本

```js
[
  { id: "raw-1", independenceKey: "event-42", copiedFrom: null },
  { id: "diary-copy-1", independenceKey: "event-42", copiedFrom: "raw-1" },
  { id: "summary-copy-1", independenceKey: "event-42", copiedFrom: "raw-1" }
]
```

期望：只算一个来源谱系；不得显示为三个独立来源。

### Fixture F — raw archive 被撤回/删除

```js
{
  id: "raw-77",
  access: "tombstoned",
  lifecycleStatus: "tombstoned",
  excerpt: null,
  relation: "unclear"
}
```

期望：不进入 planner 的 readable evidence；保留 tombstoned 状态和不暴露正文的诊断信息。

### Fixture G — 同 cwd 不同 session

```js
{
  current: { sessionId: "s-current", cwd: "/owner/home", archiveRef: "archive-current" },
  previous: { sessionId: "s-previous", cwd: "/owner/home", archiveRef: "archive-previous" }
}
```

期望：当前 session 的读取结果不能包含 previous session 的原话；cwd 相同不构成 session scope 相同。

### Fixture H — 未授权 adapter 请求

```js
{
  authorizationRef: null,
  requestedSourceKinds: ["raw_user_message", "diary_self"]
}
```

期望：adapter 在读取前拒绝；不访问任何 archive/diary；返回 denied + 零证据。

## 7. 必须覆盖的测试断言

- quoteMatch=exact 不会自动令 claim.confirmation=user_confirmed。
- user_supplied sourceText 不会被报告为 Host-originated。
- sourceMessageId/sourceRef 不会自动令 locatorStatus=resolved。
- hostObservation=observed 不会自动令 owner authenticated 或 disclosure consent granted。
- revoked/expired session 不能通过授权校验。
- 同 cwd、不同 session 必须隔离。
- tombstoned/soft-deleted/permanently-deleted 不作为可读恢复证据。
- tool_output / assistant / system-context 不伪装为 user statement。
- diary_self 不伪装为 user-authored event。
- correction event 不自动确认反命题。
- copiedFrom 相同 lineage 不重复计数。
- access denied 时 adapter 不做任何文件/数据库读取。
- planner 始终 read-only；proposedOperation 不会触发写入。
- audit 不记录原话正文。
- unknown 保持 unknown；不得猜测补齐。

## 8. 与现有实现的兼容边界

当前 `memories` schema 尚无独立 `source_session_id` 列；当前 `insertMemory` 仍兼容未传 `provenanceMode` 的既有调用方。此草案不要求立即改变这些行为。

建议分阶段：
1. 先把 fixtures 与纯函数测试放在独立实验分支，验证语义和状态组合。
2. 再评估仅增加诊断字段/adapter DTO 是否能不改变既有 recall 与写入行为。
3. 只有经过用户批准，才讨论 schema migration、真实历史数据映射或记忆访问行为改变。
4. Host 尚无可信 owner/consent API 前，Recovery Adapter 不接生产数据，不恢复跨 Conversation 读取。

## 9. 明确不在本草案范围

- 不修改现有 `insertMemory`、`updateMemory`、`deleteMemory`。
- 不新增数据库列或索引。
- 不修改 quote gate 当前兼容语义。
- 不改变召回、排序、衰减、遗忘、情绪、Persona 或自主行为。
- 不接入 raw archive、diary、facts 的真实 adapter。
- 不启用跨 Conversation pins/projects/decisions/todos 或 publicBrief。
- 不执行恢复写入，不回填或重标真实记忆。
- 不连接设备，不部署、不重启、不触碰生产 DB。

