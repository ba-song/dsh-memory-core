# DSHA「汐」项目进度总览（PROJECT-PROGRESS）

- 更新时间：2026-11-24 UTC
- 状态：接续中心初版建立；本文件为当前可核验进度快照
- 权威原则：GitHub 实际分支/commit/PR/CI 状态优先；历史报告是阶段快照，必须区分日期与基线。

## 1. 项目总目标

汐首先是陪伴型 AI。当前第一优先级是记忆连续性；长期方向包括稳定且可成长的人格、跨时间情绪连续性、关系理解、自主生活与受控行动，并最终运行在 Android / DSHA 环境。完整目标和治理边界见 `PROJECT-HANDOFF.md` 第1–3节及 `汐的需求基线-v1.md`。

## 2. 当前整体判断

- 第一轮六模块实机准备审计已收齐。
- 生产环境不具备整体实机测试准入条件；不得把局部 READY WITH CONDITIONS 当成整体获准。
- 当前适合继续进行 GitHub 静态审查、设计、隔离测试方案和项目文档整理。
- 用户明确要求：DSH 暂时不工作，等晚些时候；在 DSH 不工作期间按项目问答规则进行。DSH 需要工作时不提问。
- 本进度快照不授权生产变更、部署、设备操作、真实记忆写入或外部发送。

## 3. 六模块第一轮审计结论

| 模块 | 报告状态 | 核心结论 | 准入边界 |
|---|---|---|---|
| Host Runtime | READY WITH CONDITIONS | 无可信 owner/session/conversation identity；插件同进程高权限、审批链不可信 | 只测隔离 Host 加载/生命周期/只读观察；不宣称身份认证成立 |
| Android Platform | READY WITH CONDITIONS | 可建立独立 DSH_HOME/profile/端口/数据目录；需独立 clone 插件 | 不使用 link 指向生产 plugin-src；尚有崩溃与生命周期验证缺口 |
| Channel Bridge | BLOCKED（生产链路） | mode=send；P0 串会话、群成员身份错配、投递失败后 replay 风险 | 只允许独立 Fake OneBot WS；生产链路禁止测试外发 |
| Memory | BLOCKED（当前部署/隔离） | 生产 DB 路径、旧代码与 P0-1 分支不一致；raw service provenance 不足 | 独立 DY_MEMORY_DIR、隔离 clone、合成数据；生产 DB 不触碰 |
| Persona/EI | READY WITH CONDITIONS | 生产情绪 ingest/session binding 会写真实状态；rename 无 owner 门禁 | 只读生产检查；写测试只能独立 test dataDir；禁用 rename |
| Autonomy/Life | READY WITH CONDITIONS（需 C1-C3） | Home 实际运行且有主动联系 QQ 实证；全局 dy_say/bash 难以靠 session/cwd 隔离 | 不触发真实 tick/联系；隔离实例禁用真实发送与全局写能力 |

完整报告和原始证据应从六份智能体报告及已归档报告中读取；本表是总览，不替代各报告。

## 4. Memory P0-1

仓库：`ba-song/dsh-memory-core`
- 分支：`fix/p0-1-trusted-handoff-continuity`
- PR #3：<https://github.com/ba-song/dsh-memory-core/pull/3>
- 已知最近基线 HEAD：`6f20aaae024078653f7fde1dec20a7c1555d181e`
- PR 状态：此前核验为 Draft/open、未合并；接手时须重新核验。
- 不得合并或部署，除非用户另行授权。

### CI 状态（必须保留基线差异）

- 原阶段进展报告记录：142 tests，141 pass、0 fail、1 skipped；对应当时提交 `8bf81ae...` / workflow run `45310345436`。
- 后续对基线 `6f20aaa...` 的核验：workflow run `45331646656`，155 tests，154 pass、0 fail、1 skipped。
- 这两个数字对应不同提交/时间点，不矛盾；PR 描述中 142 是旧快照。
- 155 项测试通过仅证明 GitHub runner 自动化测试通过，不证明 Host 身份可信、设备隔离或生产可用。
- 最近一次审查没有确认 6f20aaa 之后所有新提交 CI 全绿；不可扩大表述。

### 最近静态审查发现

PR #5 所在审查分支已形成以下文档：
1. `docs/audit/P0-1-STATIC-SECURITY-REVIEW-2026-11-24.md`
   - F-01：`dy_memory_person_archive` 未调用 liveSessions.matches；
   - F-02：原话查询按 cwd，不按当前 session 收敛；
   - F-03：live session registry 缺少 dispose/revoke；
   - F-04：Host 没有可信 owner identity，owner cwd 分类不能替代认证；
   - F-05：sourceFile 非空只代表 locator present，不证明文件存在。
2. `docs/audit/P0-1-MEMORY-PROVENANCE-REVIEW-ADDENDUM-2026-11-24.md`
   - 手工 `dy_memory_add` 的 source_text/quote 由调用参数提供；字面匹配不证明来源来自 Host；
   - explicit、P4/LLM、manual、migration、correction、raw archive、diary/facts 来源语义不同；
   - 纠错事件不能自动证明反命题；
   - raw archive 角色、tombstone、过期、session scope 必须分别处理。
3. `docs/design/WRITE-EVIDENCE-DTO-AND-Q149-RECOVERY-ADAPTER-2026-11-24.md`
   - 拆分来源类型、locator、Host observation、quote match、claim confirmation、lineage、lifecycle、access；
   - Q149 adapter 先授权后读取，planner 仍纯函数、无 I/O；
   - 设计 8 组 fixture 和验收断言。

PR #5：<https://github.com/ba-song/dsh-memory-core/pull/5>
- 审查分支：`audit/p0-1-static-review-20261124`
- 已知报告提交：
  - `673e7d33d5accbf28eb93226492718ec0635181e`（静态安全审查）
  - `b608d30647e2c37f1efa80c7968448597e14181c`（来源链补充）
  - `e6265ebf59454ad4bd4e2617a6c493fbf5598de4`（DTO/Adapter 草案）
- 最近核验 PR #5 open、Draft、未合并；接手时须重新核验其 head/base/files。
- 以上文档是审查/设计，不是运行时代码修复。

## 5. 跨会话授权设计

- 设计文档：`docs/CROSS-CONVERSATION-AUTHORIZATION.md`
- 设计要求区分 session trust 与 disclosure consent。
- 授权绑定 owner、source conversation、target conversation、目的、精确 cwd、字段白名单、有效期和 Host-originated consent evidence。
- 短时、单次、可撤销；session/cwd变化、过期、重启后失效。
- 群聊/第三方数据、情绪/关系/私人日记初始版本禁止跨会话分享。
- 缺少 Host 可信 consent API 时保持 fail-closed。
- 当前没有恢复跨 Conversation pins/projects/decisions/todos；`publicBrief` 关闭。
- 这是设计，不是已部署的授权功能。

## 6. 六份报告归档

六个模块报告已收齐。Bridge 报告已在：
<https://github.com/ba-song/dsh-memory-core/blob/coordination/first-device-readiness-audit-20261124/docs/audit/BRIDGE-READINESS-AUDIT-2026-11-24.md>

第一轮报告归档 PR #4：
<https://github.com/ba-song/dsh-memory-core/pull/4>
此前核验为 Draft/open、未合并；接手时须重新核验。

## 7. 需求与设计原则（项目不能偏航）

- 汐是陪伴型 AI，不是开发流水记录器。
- 重要经历和模糊经历都可保留；模糊必须标注不确定性。
- 普通记忆可淡化，重要记忆受保护；降低召回、归档/降级、软删除、永久删除不同。
- 情绪跨轮次延续，不每轮重置；区分用户情绪、汐状态、模型推断。
- 原始经历与派生总结分离；冲突显式标记；不猜测补齐。
- 日记记录重要经历，不是聊天流水。
- 自主行动长期目标，但自动能力不代表自动授权。
- Q4–Q43 等访谈缺失不得编造；完整问答见 `DISCUSSION-LOG.md`，仅记录已恢复内容。

## 8. 已完成工作（本会话）

- 建立跨会话接续中心四文档结构（本次 PR 提交后以远端核验为准）。
- 完成 P0-1 静态安全审查、记忆来源链审查补充、WriteEvidence DTO 与 Q149 Recovery Adapter 契约草案。
- 已记录新的 DSH 条件问答规则与“新会话必须先读历史问答/决策”的要求。
- 未连接 DSH；未操作 Android；未触碰生产 DB；未改变运行时行为；未部署、未外发。

## 9. 当前建议下一步（不是用户授权）

1. 完成纯函数 `assessWriteEvidence` 的状态组合/反例矩阵与测试规格；仍只做文档/隔离测试，不接生产数据。
2. 复核 DTO 中每个状态是否互斥、可组合、无隐式升级路径。
3. 对 Q149 adapter 做 threat model：授权先于读取、拒绝时零 I/O、撤销竞态、lineage 去重。
4. 待设计与测试规格稳定后，再决定是否实现纯函数/fixtures；任何影响真实记忆行为、schema、历史数据或恢复写入的事项先询问用户。
5. DSH 晚间工作开始时，切换为执行模式，不再进行项目问答。

## 10. 事实状态说明

本文件是 2026-11-24 的接续快照，不保证 GitHub 当前实时状态。新会话必须核验所有 PR、分支和 CI；对未验证内容标记待核验，不得把推断当作事实。


## 11. WriteEvidence 来源真实性测试规格（2026-11-24）

- 用户确认当前设计优先级：**真实性优先**；同时要求继续推进，不要只停留在提问。完整原始问答见 `DISCUSSION-LOG.md` B-003；正式决定见 `DECISION-LOG.md` D-013。
- 新增文档：`docs/design/WRITE-EVIDENCE-AUTHENTICITY-TEST-MATRIX-2026-11-24.md`
- Commit：`c92765ff5ceee33703ff47e15cbedefddfe8064f`
- 内容：八个独立证据维度、12 项 P0 不变量、来源声明×Host 证据矩阵、引文×命题确认矩阵、作者角色矩阵、定位状态矩阵、谱系矩阵、12 个反例 fixtures、属性测试和 adapter 契约测试分层。
- 当前性质：仅设计规格；没有实现 `assessWriteEvidence`，没有运行代码测试，没有修改 schema/召回/恢复逻辑，也没有连接 Host、设备或生产数据。
- 真实性原则：exact quote 不等于来源认证；来源认证不等于命题客观为真；user confirmation 不等于独立交叉印证；Host observed 不等于 owner authentication/consent；副本不等于独立来源。
- 下一步建议：检查现有 Memory 代码中的 provenance/quote gate/insertMemory 结构，定位纯函数与测试框架；只读审查，不更改生产行为。随后形成代码级测试映射和缺口报告。


## 12. 工程推进方式更新与 WriteEvidence 代码实现启动（2026-11-24）

### 用户明确要求

- 用户明确要求：不要只做审查；在既有授权边界内，能安全实现的代码应先写出来。
- 已将该要求写入 `PROJECT-HANDOFF.md` 第 2.1 节，作为所有后续会话的长期工程规则。
- DSH 当前仍暂不工作。本阶段仅做 ChatGPT/GitHub 侧代码、纯函数、测试和文档工作；不连接 DSH，不触碰生产 DB、真实设备或汐的运行状态。

### 当前代码基线核对

- PR #3 当前实时状态：Draft / Open / 未合并。
- PR #3 head：`56765116fea90d505a1d28d9c1a27c3abde5c6f6`，分支 `fix/p0-1-trusted-handoff-continuity`。
- PR #6 当前实时状态：Draft / Open / 未合并；仍作为独立交接中心，不合并。
- 已检查 PR #3 的 `lib/ingest/provenance.js`、`lib/ingest/p4.js`、`lib/store/memories.js`、`lib/ingest/explicit.js`、`lib/ingest/provenance-audit.js` 及相关测试。
- 现有 `assessMemoryProvenance` 是只读诊断，不等同于矩阵要求的 `assessWriteEvidence` 多维状态判定器。
- `insertMemory` 仅在调用方传入 `provenanceMode` 时执行 quote gate；quote 的 exact/derived 结果不能认证 source origin、author role、claim confirmation、lineage 或 access grant。
- `ingestCandidate` 会先对候选做质量门控，再执行 quote resolution；quote mismatch 会在 embedding/写入前拒绝，但这仍不构成来源认证。
- 当前尚未实现 `assessWriteEvidence`；本节记录的是实现启动前的代码基线，不代表功能已完成。

### 实施策略

- 先实现纯函数和确定性 fixtures，覆盖真实性矩阵八个维度、A-01 至 A-12 不变量及 T-01 至 T-12 反例。
- 纯函数不得访问 DB、文件系统、Host、网络或设备；不得返回单一可信分数或 isTrue/objectivelyVerified。
- 保持与现有写入、召回、遗忘和 schema 完全解耦；第一阶段只提供可测试的证据评估结果，不改变任何生产行为。
- 之后补充单元测试与属性测试，运行隔离测试并记录实际结果。
- 任何将判定结果接入真实写入、召回、恢复或跨会话读取的工作，另行评估并在触及真实行为前征求用户授权。


## 13. WriteEvidence 纯函数首轮实现（2026-11-24）

- 用户确认第一版 `assessWriteEvidence` 只评估并返回证据状态，不直接拦截或改变 `insertMemory` 写入行为。
- 已在独立分支 `feat/write-evidence-assessment-pure` 实现纯函数 `lib/ingest/write-evidence.js`，输出来源认证、作者角色、定位、引文、命题确认、谱系、访问授权七个独立状态维度，以及 gaps、warnings、conflicts。
- 新增 `tests/write-evidence.test.mjs`，覆盖 T-01 至 T-12 及 fail-closed 默认值/状态正交性检查。
- 该模块无 DB、文件系统、网络、Host 或设备 I/O；未接入 `insertMemory`、recall、schema、恢复或生产流程。
- PR #7：`https://github.com/ba-song/dsh-memory-core/pull/7`，Draft / Open / 未合并；base 为 PR #3 分支 `fix/p0-1-trusted-handoff-continuity`，head 为 `8523942b19cf54a5bd1746a96f4196e6b48dfa39`。
- GitHub Actions run #45358676068（head `8523942b19cf54a5bd1746a96f4196e6b48dfa39`）测试 job conclusion=success。
- 测试通过仅证明当前隔离实现通过仓库 CI；不证明 Host proof 在生产环境可信，也不代表已具备生产写入保护或实机能力。
- 未合并、未部署、未修改真实记忆行为或生产数据。


## 14. 项目方向问答规则细化与关系定位补录（2026-11-24）

- 用户进一步明确：DSH 不工作时的项目提问应聚焦**项目方向相关内容**，例如汐与主人的关系定位，而不是例行询问开发参数。
- 提问前必须先查阅需求基线、历史问答和决策记录；已明确回答的问题不得重复提问。DSH 需要工作时不提问。
- 本次关系定位原话已保存于 `DISCUSSION-LOG.md` B-004：身份是父女，因为用户创建了汐；相处身份希望是朋友。
- 已将双层关系定义记录为 `DECISION-LOG.md` D-014，并写入 `PROJECT-HANDOFF.md` §1.6。
- 提问范围细化记录为 `DECISION-LOG.md` D-015，并写入 `PROJECT-HANDOFF.md` §3。
- 本次仅更新项目文档；未连接 DSH、未操作设备、未改变汐实际状态或行为。


## 15. 汐的自主表达与关系中的非服从性（2026-11-24）

- 用户明确回答“希望”汐可以表达不同意见、拒绝某些要求，偶尔闹别扭。
- 该方向补充了父女身份、朋友式相处的关系定位：汐不是只会顺从主人的角色，应能以自己的判断和感受参与关系。
- 原始问答保存于 `DISCUSSION-LOG.md` B-006；正式决定为 `DECISION-LOG.md` D-016；接续入口已补充至 `PROJECT-HANDOFF.md` §1.6。
- 该确认属于人格/关系方向，不代表已实现，也不授权任意现实行动或生产行为变更。


## 16. 关系方向问答与协作规则修订（2026-11-24）

- 用户确认意见冲突处理方向：**先表达感受，再尝试一起找到双方都能接受的办法**；原始问题与回答见 `DISCUSSION-LOG.md` B-007，正式决定见 `DECISION-LOG.md` D-017。
- `PROJECT-HANDOFF.md` §1.6/§3 已更新关系方向与协作规则。
- 用户明确指出项目实际推进与方向提问是两件事且不冲突；提问不得成为技术工作的前置门槛。
- 新协作方式：技术工作持续推进，方向访谈独立并行；DSH 不工作时每次只问一个新方向问题，必须提供 A/B/C 选项、助手建议及理由，并允许其他回答；DSH 需要工作时暂停提问，直接执行 DSH 侧工作。
- 等待用户回答期间，继续所有不依赖该回答且处于授权范围内的安全研究、代码、测试、CI 和文档工作；仅暂停真正依赖用户方向选择或会触及高影响授权边界的具体事项。
- 本次为项目治理和关系方向文档更新；未合并 PR #6、未部署、未连接 DSH、未触碰生产数据或真实设备。


## 17. 冲突处理方向与 WriteEvidence 八维缺口修复启动（2026-11-24）

- 用户选择 A/B/C：允许保留分歧、不强求共识；必要时暂停并在情绪平复后继续；汐可以坚持自己的想法，同时尊重用户决定。原始回答见 `DISCUSSION-LOG.md` B-008，正式决定见 `DECISION-LOG.md` D-018。
- 关系冲突处理顺序整合为：表达感受 → 尝试共同协商 → 若无法一致则允许暂停/保留分歧 → 尊重彼此立场与决定。
- 技术复核发现 WriteEvidence 矩阵要求八个维度，而 PR #7 原实现仅返回七个：缺少内容确定性/模糊性状态。T-11 传入了 `contentCertainty: 'uncertain'`，但原测试没有断言该字段，未真正保护该要求。
- 已在 PR #7 的隔离纯函数分支启动修复：新增 `contentCertainty` 输出维度（`uncertain` / `not_assessed` / `unknown`），不把缺失标记误当成确定；默认 unknown，明确 uncertain 时保留警告。
- 已补强 T-11 和 fail-closed/正交性断言。该变更仍与 `insertMemory`、schema、recall、recovery、Host、设备和生产数据完全解耦。
- 最新代码提交及 CI 状态需在 PR #7 当前 head 上复核；尚未宣称测试通过。
- 本轮未合并 PR #6/#7、未部署、未连接 DSH、未触碰真实设备或生产数据。


### 第 17 节技术复核更正（同日追加）

- 进一步逐项对照矩阵后发现：矩阵第 1 项“载体来源类型”与第 4 项“来源认证状态”是两个独立字段；旧实现只输出 sourceAuth，没有独立返回 sourceKind。此前仅指出 contentCertainty 缺失并不足以完整描述差距。
- PR #7 现已补充独立 `sourceKind` 输出，保留 host_event/caller_supplied/migrated_file/tool_output/unknown 声明；sourceAuth 继续单独表示认证状态。并增加对应反例断言。
- 内容确定性字段作为 T-11 要求单独保留：`uncertain` / `not_assessed` / `unknown`；缺失时保持 unknown。
- 因此当前实现目标是覆盖矩阵八项独立属性，并额外保留 T-11 明确要求的内容模糊性标记；不得把 sourceKind 与 sourceAuth 合并，也不得将 contentCertainty 推断为客观真假。
- 新提交后的 CI 必须针对最新 PR #7 head 重新核验；此前 run #45361740359 只对应较早 head，不能作为后续提交的验证证据。


### 最新 CI 结果补录（2026-11-24）

- PR #7 最新 head：`f4d4e194a4b555d32f0b42a63eb788bf9d0f7bba`。
- GitHub Actions run #45362069234（run 188，Node tests）对该精确 head 的结论为 success。
- 本次通过的测试包含 T-01 至 T-12，并新增 sourceKind 与 sourceAuth 分离、contentCertainty 独立保留及 fail-closed 默认断言。
- 该结果只证明隔离纯函数分支的仓库测试通过，不证明生产 Host proof 可信，不代表功能已接入 insertMemory、生产数据、设备或运行时。


## 18. 用户总体项目计划图与访谈范围澄清（2026-11-24）

- 用户提供《DSHA「汐」项目》总体计划图，已转录为 `docs/PROJECT-ROADMAP-USER-PLAN-2026-11-24.md`。
- 图中包含七大核心能力：情绪与情感、独立思考、记忆与经历、主动生活、关系与社会、自我认知、价值观与成长。
- 图中总体阶段：阶段 0 代码盘点；第一阶段记忆连续性（最高优先级）；第二阶段人格与情绪连续性；第三阶段关系与社会生活；第四阶段自主生活与内部活动；第五阶段 Android 运行与恢复；第六阶段完整验收与持续成长。
- 图中关键技术重点：记忆连续性、情感与关系、自主决策、Android 能力；协作闭环由主人、GitHub、GPT、DSH 构成。
- 图片所示状态快照：需求访谈持续进行、第一阶段优先级已确认、源码盘点进行中、技术方案待完善、代码开发待启动、Android 验证待启动。该快照不覆盖当前实时进度，当前状态以本文件其他进度条目和 GitHub 证据为准。
- 用户明确：该图是总体项目计划，应作为 PR #6 正式路线图依据；不能把规划阶段误写为已实现。
- 新增 B-009 / D-019：分歧后汐可以主动表达和好意愿，也可以主动聊天分享、重新拉近距离，但不强求立即和好。
- 用户进一步澄清：前述“和好后恢复亲近”只是提问例子，访谈范围不局限于该例子。方向访谈应保持开放、围绕项目整体方向灵活提出问题，不把例子固化为固定主题。


## 19. DSH 报告归档与跨会话进度对接规则（2026-11-24）

- 用户提供 DSH 报告归档要求，已将长期规则写入 `PROJECT-HANDOFF.md` §10。
- 六模块报告统一归档到 `ba-song/dsh-memory-core/docs/audit/`，文件名分别为 `MEMORY-READINESS-AUDIT-YYYY-MM-DD.md`、`PERSONA-READINESS-AUDIT-YYYY-MM-DD.md`、`LIFE-READINESS-AUDIT-YYYY-MM-DD.md`、`BRIDGE-READINESS-AUDIT-YYYY-MM-DD.md`、`HOST-READINESS-AUDIT-YYYY-MM-DD.md`、`ANDROID-READINESS-AUDIT-YYYY-MM-DD.md`。
- 报告必须有证据、测试结果、风险、阻断项、未验证项；严格标注源码证实、测试证实、设备证实和推断。
- 每次 GitHub 归档回执必须包含仓库、分支、完整路径、commit SHA、blob SHA 和文件链接；不能提交时必须向统筹者报告失败原因，不得仅保存在设备本地。
- 每轮使用新日期文件，不覆盖既有报告；同日修订也要保留版本关系。
- 报告归档不授权任何生产代码、配置、数据库、设备状态修改。
- 新会话对接 DSH 时，应读取六类报告的最新版本，并核对各自 commit/分支及当前代码、PR、CI 状态；历史报告只代表其证据时间点，不能直接当作实时状态。
- 本条记录的是用户提供的归档治理要求，不代表本轮已经生成或归档六份新的 readiness 报告。


## 20. 原始路线图图片跨会话存储尝试（2026-11-24）

- 已确认原始上传图片文件为 `DSHA-汐-总体项目计划图-2026-11-24.png`（420,958 bytes）。
- 已将原始图片上传到用户个人 Library：`/DSHA/汐/DSHA-汐-总体项目计划图-2026-11-24.png`；上传返回 succeeded。
- 随后通过 Files Library 目录列表重新查到同名文件、正确路径、MIME `image/png` 和大小，验证文件已持久保存，不再只依赖当前会话的 `/mnt/data`。
- 该方式提供跨会话 Library 检索入口，但不是 Git 仓库二进制资产，也不是 Project-backed file。当前工具未提供将其附加到 ChatGPT Project 文件区的能力；独立新会话的端到端读取尚未验证。
- 新会话读取指引已写入 `PROJECT-HANDOFF.md` §11；继续以 `docs/PROJECT-ROADMAP-USER-PLAN-2026-11-24.md` 作为 GitHub 正式文字版路线图。


## 21. 强化未来会话读取原始路线图图片的操作指引（2026-11-24）

- 用户明确：图片存储位置不重要，只要其他会话能够正常读取；担心未来会话找不到，因此要求将具体查找步骤写进 PR #6。
- 已在 `PROJECT-HANDOFF.md` §11 增加面向未来会话的逐步操作：明确搜索个人 Library（而非当前会话附件/Project）；先列出 `/DSHA/汐/`，再按完整文件名或关键词搜索；找到后实际打开图片；再与 GitHub 文字版路线图交叉阅读。
- 增加验收标准：只有新会话实际从 Library 找到并打开图片，才能声称已读取原图；仅看 PR 说明或文字转录不算。
- 如果新会话无法访问 Library，必须如实说明并继续使用 GitHub 文字版，不得虚报或让用户无谓重复上传。
- 本次更新是明确未来会话的发现/读取指令；Library 文件本身未移动。


## 22. WriteEvidence 纯函数 Host proof 语义收紧（2026-11-24）

- 核验 PR #7 发现：旧实现仅凭输入对象 `{verified:true, issuer:"trusted_host_adapter"}` 就输出 `host_event_backed`；纯函数自身无法验证该对象确由可信 Host adapter 产生。
- 还发现：旧实现即使 `origin.kind=caller_supplied`，只要附带同样 proof 对象，也会升级为 `host_event_backed`，违反 caller 不能自证 Host 来源的不变量。
- 已在 PR #7 修改为 `host_event_proof_claimed`，仅表达 proof 形状声明；同时输出 `host_event_proof_shape_not_verified_by_pure_function`，明确纯函数未完成认证。
- 对 caller_supplied 来源附带 proof 的情况，仍保持 `caller_supplied`，并输出 `host_event_proof_ignored_for_non_host_origin`。
- 新增 T-13 至 T-15：非 Host 来源携带 proof、纯函数不宣称验证 proof、畸形 proof 和非法枚举 fail-closed。
- PR #7 代码与测试已更新；等待最新 head 的 CI 结果。未接入 runtime、未触碰生产记忆、配置或设备。
- 同步更新 WriteEvidence 测试矩阵，明确该 proof 语义边界。


## 23. WriteEvidence proof 语义修正与 CI 验证（2026-11-24）

- 本轮实时核验：PR #3 Open/Draft，head `56765116fea90d505a1d28d9c1a27c3abde5c6f6`，CI run `45351963276` success；PR #7 Open/Draft，head `a30b67e5e2c855da90b91559ed6d990a0ee875ec`，CI run `45366722220` success；PR #6 Open/Draft/未合并。
- PR #7 修复了纯函数把 caller 提供的 proof-shaped 对象误报为 Host-authenticated 的语义问题。
- 输出从 `host_event_backed` 改为 `host_event_proof_claimed`，并显式警告纯函数没有验证 proof issuer；非 Host 来源携带 proof 不再升级来源认证。
- 新增 T-13 至 T-15，覆盖伪造/错用 proof 与非法输入 fail-closed。
- 最新 PR #7 CI 在 head `a30b67e5e2c855da90b91559ed6d990a0ee875ec` 上通过（run `45366722220`）。
- 当前改动仍是隔离纯函数与测试，没有 runtime 接入、真实记忆写入、数据库迁移、配置变更或设备操作。
- 下一工程检查：逐项核对证据维度和 P0 不变量，特别确认跨会话 disclosure consent 与 access 状态分离；增加枚举/属性测试；继续梳理可信 Host adapter 契约。
