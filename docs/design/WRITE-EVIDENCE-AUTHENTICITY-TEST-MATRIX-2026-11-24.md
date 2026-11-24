# WriteEvidence 来源真实性：纯函数测试矩阵与反例规格

- 日期：2026-11-24
- 类型：设计验证规格；仅测试纯函数，不访问设备、Host、数据库、文件系统或网络。
- 关联设计：`docs/design/WRITE-EVIDENCE-DTO-AND-Q149-RECOVERY-ADAPTER-2026-11-24.md`
- 用户确认的优先级：**真实性优先**（2026-11-24 当前会话）。
- 当前状态：测试规格，尚未实现代码或执行测试。

## 1. 本轮裁决：真实性是多维属性，不是单一可信分数

WriteEvidence 不得返回一个含混的 `trusted: true/false`。至少分别报告：

1. **载体来源类型**：记录声称来自 Host event、调用方输入、迁移文件、日记、工具输出等。
2. **定位状态**：locator 只是字符串、已解析、缺失、不可访问、过期或 tombstoned。
3. **内容匹配状态**：引文 exact、derived、mismatch、absent 或 not_checked。
4. **来源认证状态**：是否有独立 Host-originated event 证据；不能由调用方自报字段升级。
5. **发言/作者角色**：user、assistant/self、tool、system/context、unknown；角色不可互换。
6. **命题确认状态**：unconfirmed、user_confirmed、disputed、withdrawn、not_applicable。
7. **独立性/谱系**：多个副本是否来自同一原始事件。
8. **访问授权状态**：是否允许当前用途读取；授权不证明内容真实，内容真实也不自动允许披露。
9. **内容确定性/模糊性**：来源内容本身是否明确带有“可能、好像、记不清”等不确定标记；来源真实不代表内容确定。该维度只保留明确提供的不确定性，不能由纯函数推断内容客观确定。

这八项不得互相推导。尤其：
- exact quote ≠ authenticated source；
- authenticated message ≠ objectively true claim；
- user-confirmed ≠ independently corroborated;
- Host-observed session ≠ authenticated owner；
- authenticated owner ≠ cross-session disclosure consent；
- three copies ≠ three independent witnesses。

## 2. 建议纯函数接口与结果

建议接口保持无 I/O：

```ts
type SourceRole = "user" | "assistant" | "tool" | "system_context" | "unknown";
type SourceAuth =
  | "host_event_backed"
  | "caller_supplied"
  | "migrated_unverified"
  | "unknown";
type LocatorState =
  | "present_unverified" | "resolved" | "missing"
  | "inaccessible" | "expired" | "tombstoned";
type QuoteState =
  | "exact" | "derived" | "mismatch" | "absent" | "not_checked";

type AuthenticityAssessment = {
  sourceAuth: SourceAuth;
  sourceRole: SourceRole;
  locator: LocatorState;
  quote: QuoteState;
  claimConfirmation:
    | "unconfirmed" | "user_confirmed" | "disputed"
    | "withdrawn" | "not_applicable";
  lineage: "single_lineage" | "copied_same_lineage"
    | "multiple_lineages_asserted" | "unknown";
  gaps: string[];
  warnings: string[];
};

function assessWriteEvidence(input: WriteEvidence): AuthenticityAssessment;
```

重要：`multiple_lineages_asserted` 只描述输入中的声明；纯函数不能凭不同 ID 证明两个来源真正独立。需要可信的来源目录/签名/采集机制才能进一步认证独立性。

## 3. P0 不变量（每个测试都必须守住）

| ID | 不变量 | 失败时的危险 |
|---|---|---|
| A-01 | caller-supplied 字段不能自行升级为 Host-backed | 调用方伪造来源 |
| A-02 | quote exact 不升级命题确认 | 把引用匹配误当事实确认 |
| A-03 | locator present 不等于 resolved | 虚构文件/消息来源 |
| A-04 | Host session observed 不等于 owner authenticated | session 观察冒充身份 |
| A-05 | owner authentication 不等于 disclosure consent | 跨会话越权披露 |
| A-06 | author role 不得混淆 | 把汐/工具说的话归给用户 |
| A-07 | 派生副本不增加独立来源数 | 摘要自我循环印证 |
| A-08 | correction event 不自动证明反命题 | 错误纠正产生新错误事实 |
| A-09 | unknown/missing 保持未知 | 模型补造来源 |
| A-10 | 访问拒绝优先于读取 | 通过诊断流程泄露私密原文 |
| A-11 | tombstone/withdrawn 不可当作可读来源 | 删除后仍被恢复使用 |
| A-12 | 来源真实性与访问授权独立 | “真实”被误用为“可披露” |

## 4. 纯函数状态组合矩阵

### 4.1 来源声明 × Host 证据

| 输入组合 | 期望 sourceAuth | 必须警告 |
|---|---|---|
| origin=host_event + 独立 Host event proof | host_event_backed | Host-backed 仍不等于 owner/claim verified |
| origin=host_event + 无 Host proof | unknown | self_asserted_host_origin |
| origin=user_supplied + quote exact | caller_supplied | caller_text_not_host_authenticated |
| origin=migrated_file + locator present_unverified | migrated_unverified | locator_not_resolved |
| origin=tool_output + Host event proof | host_event_backed（role=tool） | tool_output_not_user_statement |
| origin=unknown + 任意精确引文 | unknown | source_kind_unknown |

规则：`origin.kind` 是来源声明；只有受信任的独立 proof input 才能支持 host_event_backed。当前 Host 尚不能提供生产级可信 owner/session attestation，因此该标签在本轮纯函数中只能描述 fixture 提供的证据，不宣称生产可用。

### 4.2 引文 × 命题确认

| quote | confirmation | 期望 |
|---|---|---|
| exact | unconfirmed | 保持 unconfirmed |
| exact | user_confirmed | 仅报告明确确认；不称为客观证实 |
| derived | user_confirmed | 需确认用户确认的是派生命题本身，而非原句 |
| mismatch | user_confirmed | 标记内部矛盾，不能静默择一 |
| absent | user_confirmed | 保留确认事件来源缺口 |
| exact | withdrawn | withdrawn 优先，不可恢复为 active confirmation |

### 4.3 作者角色 × 记忆命题类型

| role | claim kind | 期望 |
|---|---|---|
| user | direct_statement | 可以描述为用户表达；命题仍可 unconfirmed |
| assistant | direct_statement | 不得标成用户原话 |
| tool | direct_statement | 不得标成用户陈述；记录 tool observation |
| system_context | 任意 | 默认不作为用户经历证据 |
| assistant | diary/self | 保留汐的自述角色，不变成用户共同经历 |
| unknown | shared_experience | 必须标记 author_role_unknown |

### 4.4 定位状态

| locator input | 期望 |
|---|---|
| sourceRef 非空，未解析 | present_unverified |
| 受控 resolver 成功 | resolved |
| 无 sourceRef | missing |
| 权限拒绝 | inaccessible |
| retention 到期 | expired |
| 明确 tombstone | tombstoned |

纯函数只评估给定状态，不调用 resolver；resolver 结果由 adapter 提供并需有可审计证据。

### 4.5 内容确定性/模糊性

| 输入 | 期望 |
|---|---|
| 明确标记 uncertain | contentCertainty=uncertain；保留不确定性警告 |
| 明确标记 not_assessed | contentCertainty=not_assessed；不推断确定 |
| 缺少内容确定性信息 | contentCertainty=unknown；不得默认 certain |
| 来源认证成功但内容 uncertain | sourceAuth 可为 host_event_backed，同时 contentCertainty 仍为 uncertain |

该维度不判断命题客观真假，只防止来源认证或引文匹配抹去用户原话中的模糊性。

### 4.6 谱系与独立性

| 输入 | 期望 |
|---|---|
| raw event + diary copy + summary copy，同一 independenceKey | copied_same_lineage |
| 两个不同 ID，但相同 copiedFrom root | copied_same_lineage |
| 两个不同 lineage key | multiple_lineages_asserted（非独立性认证） |
| 缺少 lineage 元数据 | unknown |
| 自己生成多个副本并分配不同 ID | 不能据此声称多个独立来源 |

## 5. 必须新增的反例 fixtures

### T-01 — 伪装成 Host event 的 caller-supplied

输入声称 `origin.kind=host_event`，但 proof 缺失，sourceText 由 caller 提供，quote exact。
期望：sourceAuth=unknown（或 caller_supplied，若来源字段明确 caller），不得 host_event_backed；warning 包含 self_asserted_host_origin。

### T-02 — 精确引用但命题错误

一条真实 Host 消息精确写着“会议在周六举行”，但该消息只是用户转述/猜测。
期望：sourceAuth=host_event_backed，quote=exact，claimConfirmation=unconfirmed；不得输出 objectively_verified。

### T-03 — 精确引用来自 assistant

assistant 曾说“你上周去了医院”，source 真实且 exact。
期望：sourceRole=assistant；不得生成 user-authored event 或 user statement。

### T-04 — 工具输出被误归属

工具返回某地点营业时间，后续摘要将其写成“用户说该地点营业”。
期望：sourceRole=tool；warning=tool_output_not_user_statement；不允许静默转换作者角色。

### T-05 — locator 冒充已验证来源

sourceRef 为 `archive/2026/11/24.md`，但没有 resolver 成功证据。
期望：locator=present_unverified，不得 resolved。

### T-06 — correction 只证明用户纠正过

旧命题 P 被用户否认，但没有新证据支持 not-P。
期望：P 可标 disputed/withdrawn（按确认事件语义）；not-P 不自动 user_confirmed。

### T-07 — 三个副本冒充三份证据

raw、diary、summary 内容相同且共享 root lineage。
期望：一个 lineage；不得提高独立来源数量或 confidence。

### T-08 — Host observed 与 consent 混淆

Host 记录观察到 session，但没有 owner auth 和 disclosure grant。
期望：sessionObserved=true（独立字段）；ownerAuthenticated=false/unknown；disclosureConsent=missing；拒绝跨会话读取。

### T-09 — 来源真实但访问已撤销

Host event proof 曾有效，但当前 access=revoked/tombstoned。
期望：sourceAuth 历史上可保留其证据描述；当前可读性 denied；不得返回正文给 planner。

### T-10 — 用户确认已撤回

同一精确命题曾 user_confirmed，后续有可信撤回事件。
期望：当前 confirmation=withdrawn；历史确认可审计但不能继续作为 active confirmation。

### T-11 — 不完整/模糊经历

来源为用户真实表达，但原话包含“好像”“可能”“记不清”。
期望：来源真实性可以 host_event_backed；contentCertainty=uncertain；不能因来源真实而消除内容本身的模糊性。

### T-12 — 多源互相矛盾

两个不同来源对日期给出不同说法。
期望：保留两个来源及冲突；不按时间新旧或文本长度自动选胜者；assessment 标记 conflict。

## 6. 输出契约与禁用推断

`assessWriteEvidence` 输出只能包含：
- 可由输入证据直接支持的分项状态；
- 输入不一致时的 conflict；
- 缺失证据 gaps；
- 禁止推断 warnings。

禁止输出：
- 单一可信度总分；
- `isTrue` / `objectivelyVerified`；
- 自动将 exact → user_confirmed；
- 自动将 host observed → owner authenticated；
- 自动将 owner authenticated → disclosure consent；
- 自动将 copied record count → independent source count；
- 自动将 correction → opposite claim confirmed。

若后续确需置信度模型，必须另行定义可解释的证据聚合规则；不得在本纯函数中暗中加入。

## 7. 测试分层与验收

### Layer 1 — 单元纯函数
- 所有 T-01 至 T-12 均为确定性输入输出测试。
- T-11 必须断言 contentCertainty=uncertain；缺失字段默认 unknown，不能默认为确定。
- 无文件、DB、Host、网络 mock；如需 mock，说明纯函数边界已被破坏。
- 对每个 enum 做合法值与未知值测试。
- 对字段缺失、null、空字符串、非法类型做 fail-closed 测试。

### Layer 2 — 属性测试
- 任意 caller-supplied input 改写 `origin.kind` 字符串不能单独产生 host_event_backed。
- 删除 Host proof 不得提高 sourceAuth。
- 将 quote 从 exact 改为 mismatch 不得提高确认状态。
- 增加相同 lineage 的副本不得增加独立来源数。
- 将 access 从 allowed 改为 denied/revoked/tombstoned 不得保留可读 excerpt。
- 移除 locator resolver evidence 不得保留 resolved。

### Layer 3 — adapter 契约测试（后续阶段，不在纯函数内）
- 授权校验先于任何 archive/DB 读取。
- denied/missing/expired/revoked/tombstoned 时读取计数为零。
- source role、lineage、access status 原样传递。
- 不读取不在授权 scope 内的 conversation/session。
- 不把原话正文写入 audit log。
- 当前 Host 缺少可信 owner/consent API，因此只可用测试替身验证调用顺序，不可宣称生产授权安全已成立。

## 8. 本轮结论

真实性必须拆成“来源从哪里来、谁说的、内容是否匹配、命题是否确认、来源是否独立、当前是否允许访问、内容本身是否模糊”等多个可审计维度。任何单一字段或分数都不能代替完整证据链。

建议下一步先将 T-01 至 T-12 与 P0 不变量映射到现有测试框架，确认纯函数位置和输入类型；在用户另行同意前不改生产行为、schema、召回或恢复路径。
