# R4.1 REQUIRED 基线 — 跨模块 P0 修复仲裁与依赖计划

- 状态：**PROPOSAL / READ-ONLY COORDINATION PLAN**
- 日期：2026-11-22
- 基于代码：
  - Memory `ba-song/dsh-memory-core` main `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`
  - Persona `ba-song/dsh-persona-core` main `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`
  - Channel Bridge `ba-song/dsh-channel-bridge` main `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13`
- 依据：Owner 已批准的 P0 优先级和 R4.1 REQUIRED 逻辑约束。
- 性质：只读技术仲裁与后续工作排序；不是实现合同、Schema 决定或实施授权。

## 1. 仲裁原则

1. 严格保持 Owner 已批准的 P0 顺序，不因模块方便或现有实现成本改变优先级。
2. 优先修复边界/授权/身份语义，再讨论字段、API、表结构和迁移。
3. 对缺失信息 fail closed；不得用昵称、群名、cwd、接收时间、默认 confidence 或 Owner 身份猜测补齐。
4. 一个出口不能只靠最终 prompt 过滤；生成、查询、缓存、payload、handoff、merge 每一层都要保留并验证必要元数据。
5. 现有接口可保留为 legacy/兼容入口，但在被正式审查并验收为受控接口前，不得绕过新的逻辑门禁。
6. 本计划中所有具体字段名、函数名、表名和 API 名均为实现候选，不因本文件自动成为 Owner 决策。

## 2. P0 工作拆分与依赖

### P0-1 — 跨 Conversation context/raw/digest 泄漏

- 主责：**Channel Bridge + Memory**；Persona 提供可信身份结果但不是数据出口过滤的替代品。
- 当前证据：
  - Bridge `recentInboundAsc` 仅按 channel 查询，未按 contact/group/conversation 过滤。
  - Bridge 新会话 contextBuilder 未接收当前 Conversation 标识。
  - Bridge 群 context fallback 只筛 group kind，未筛当前 group_id。
  - Memory `buildDigest` 汇总多个 cwd 的原始对话并注入 Owner 会话。
  - Memory `publicBrief` / `handoffBrief` 缺少合同要求的完整授权与来源载荷。
- 修复方向（逻辑 REQUIRED 的落实，不冻结物理方案）：
  1. 每条入站消息必须有可验证的规范 Conversation 范围；缺失时不进入跨会话上下文。
  2. 所有上下文查询必须显式接收当前 Conversation；群 fallback 必须显式限定当前 group。
  3. `buildDigest` 不得跨 Conversation 汇总原文后默认注入；每个来源需有明确用途和授权，否则不输出。
  4. `publicBrief` 与 `handoffBrief` 返回结构化、可验证的来源/目标/用途/授权/有效性元数据；Bridge 不得把元数据剥成纯文本后直接注入。
  5. 缓存、rotation seed、fallback、replay、handoff 与 merge 继承相同边界。
- 验收：每个出口分别使用两个 Conversation 的唯一哨兵；目标 Conversation 对未授权来源的输出必须为零；缺失/冲突授权与 marker 必须可观察地拒绝。
- 依赖：先确认 Conversation ID/account/session 规范；不得用 cwd 替代规范 ID。

### P0-2 — 群聊 speaker attribution

- 主责：**Channel Bridge → Memory**。
- 当前证据：
  - Bridge group bucket 只存 speaker 展示字符串，不存 external sender ID。
  - group turn ingestion 只传 speaker 名称。
  - Memory 缺 speaker 时回退为“群友”。
  - forward/quote/notice 的部分结构化身份在最终文本或持久化阶段丢失。
- 修复方向：
  1. Bridge 保留平台实际 sender ID、display-name snapshot、message ID、source reference，缺失字段明确 null/unknown。
  2. Memory 将 canonical speaker 与 experiencer 作为独立语义判断；不得把显示名或群实体当 speaker。
  3. group-scope event 可以保留，但无稳定 sender ID 时不得归属到具体成员。
  4. forwarder、original author、quote author、current speaker，以及 notice actor/operator/target 必须保持可追溯的独立字段/关系。
  5. `saveGroupTurn` 等入口在受控 ingestion 语义验收前不得视为合规。
- 验收：缺 sender、同名不同 ID、同一成员跨群、多跳 forward、quote、notice 缺字段等负向矩阵；unknown 不得被补成某个成员。

### P0-3 — Self identity gate

- 主责：**Persona**；Memory 消费验证结果，Bridge 只提供平台原始事实。
- 当前证据：
  - Persona 启动时 `ensureSelf` 自动恢复/创建 Self。
  - `selfId()` 在缺失/异常时返回 `self:unknown`。
  - 当前 Persona DB/service 未提供 Owner canonical identity 与 consent lifecycle。
  - 旧 `session_bindings` 仍被主动写入和用于注入。
- 修复方向：
  1. Self 缺失/非法/冲突时返回 null/明确错误，不得自动创建或将 sentinel 当 canonical ID。
  2. 显式 enrollment 与 bootstrap/recovery/rotation 必须分离；Owner bootstrap 方案仍 OPEN，不能自行选择实现。
  3. 提供稳定、可测试的身份解析逻辑结果（`identityOf` 只是候选名字）。
  4. Owner 使用独立 `owner:<uuid>`；平台账号 link 只有明确 Owner 同意才建立，撤销/过期必须失效。
  5. Memory 只接受已验证身份结果；缺失时拒绝 Self/Owner 特定归属写入。
  6. 旧 `session_bindings` 的只读兼容、替代接口与迁移单独设计，不双写、不静默迁移。
- 验收：Self absent/invalid/multiple active；Owner absent/unknown；consent no-reply/ambiguous/conflict/revoked/expired/rebind；所有拒绝场景断言数据行与状态不变。

### P0-4 — validity filtering

- 主责：**Memory**；Bridge/Persona 保留并传递各自来源语义。
- 当前证据：Memory 的多个输出/注入出口仍只依赖 status/scope/TTL 或旧查询逻辑，尚无统一 current/history/validity 门禁。
- 修复方向：
  1. 对 B.3 列出的 publicBrief、handoffBrief、buildDigest、stable、carryover、shorttermRecent、cache/payload/merge 逐一登记入口和调用链。
  2. 对 current 与 history 使用显式通道语义；缺失/冲突 marker 不得默认 current。
  3. legacy/unknown 可在获准的历史参考路径中带不确定性标签使用，不得进入 current factual injection。
  4. Owner todo/decision 不因 Owner 归属自动跨 Conversation。
  5. history 过渡路径、API、终止控制仍按合同 OPEN，不擅自实现或 cutover。
- 验收：每个出口分别覆盖 legacy、unknown、expired、superseded、history、缺失/冲突 marker 与未授权来源；缓存和 merge 中间层也必须断言零输出。

### P0-5 — duplicate evidence / confidence inflation

- 主责：**Memory**；Bridge 提供稳定 source/event/message provenance。
- 当前证据：新记忆 confidence 在 Schema、旧库补列和 insert 默认路径仍可得到 1.0；群聊和跨渠道摘要可能把同源内容重复包装。
- 修复方向：
  1. 遵守 Owner 已批准的新记录 `confidence_level='unknown'`、numeric confidence NULL；旧 numeric 原值保持不变。
  2. 同源副本、摘要、重复检索、转发副本不得被计为独立证据。
  3. source/evidence identity 必须可追溯；没有证据来源时保持 unknown。
  4. B.5 的旧 numeric 读取/展示细则仍是 PROPOSAL，不在本计划中批准。
- 验收：重复写入、摘要再入库、同一原文多路径检索、转发副本、旧 numeric 排序/门控等负向 fixture。

### P0-6 — Persona timeline / transaction integrity

- 主责：**Persona**。
- 当前证据：
  - event time 缺失时有 Date.now fallback。
  - 部分路径把事件 at 同时写作状态 updated_at。
  - `recordRuleEpisode` 分步写 event/appraisal/episode/state；`applyCoreAppraisal` 在 state 更新后 catch timeline 失败。
- 修复方向：
  1. event time、received time、write/update time 独立；未知 event time 保持 unknown。
  2. `recordRuleEpisode` 全链路原子；任一步失败整体回滚。
  3. state/timeline 原子更新；错误不可静默吞掉。
  4. history query/replay/unknown-time 不得改变 current state。
  5. Persona 情绪强度/确定性与 Memory credibility/confidence 分离。
- 验收：event/appraisal/episode/state/timeline 行数矩阵；故障注入每阶段失败必须整体回滚；fresh 与 legacy schema 分别验证。

## 3. 实施前的跨模块前置条件

以下逻辑关系必须先在文档层统一，具体物理方案仍待审查：

1. Bridge 产生并校验规范 Conversation ID，包含可信 account_id；缺字段 fail closed。
2. Host/DSH mint 权威 Runtime Session ID；Bridge 只记录映射。
3. Persona 管 Runtime Session ↔ Self；Memory 管 Message ↔ Speaker/Experiencer。
4. Bridge envelope 同时表达 event_time/time_precision 与 received_at；不得用 Date.now 伪造 event_time。
5. Memory 的受控 ingestion 接口接收来源事实，不允许 Bridge 代填 canonical speaker/experiencer、validity 或 confidence。
6. 所有跨 Conversation 输出显式声明 source/target/purpose/authorization/validity，并在 Memory 与 Bridge 两侧复核。

## 4. Owner 决策边界

本计划不要求 Owner 现在决定以下 OPEN 项，也不将其推定为已批准：

- Owner bootstrap/recovery/rotation 具体方案；
- implicit 时间边界白名单；
- legacy numeric confidence 的正式读取/排序/展示规则；
- History API 的物理形式、过渡通道和终止/切换方案；
- public-sharing 授权模型的物理字段、TTL、撤销机制；
- handoffBrief 物理载荷与授权存储；
- forward_chain 的精确 JSON schema；
- saveGroupTurn/saveGroupTranscript 最终保留、替换或退役；
- Schema/DB 迁移、回填、cutover、部署与生产变更。

## 5. 权限声明

当前仅完成只读审查与文档协调。没有修改任何业务源码、测试、Schema、数据库、配置、权限、部署或设备状态；没有执行测试、迁移、回填、Owner 绑定或真实渠道操作。任何可能改变汐实际状态或行为的实施仍须 Owner 另行明确授权。
