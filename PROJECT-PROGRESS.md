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
