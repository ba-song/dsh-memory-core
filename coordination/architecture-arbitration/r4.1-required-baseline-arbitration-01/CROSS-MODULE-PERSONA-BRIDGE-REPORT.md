# R4.1 REQUIRED 跨模块只读技术仲裁报告 02（Persona / Channel Bridge）

- 状态：**IN_PROGRESS / STATIC REVIEW ONLY**
- 审查日期：2026-11-22
- Persona：`ba-song/dsh-persona-core` `main` @ `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`
- Channel Bridge：`ba-song/dsh-channel-bridge` `main` @ `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13`
- 对照：R4.1 Owner 已批准的 REQUIRED 逻辑约束。
- 范围：静态读取代码与测试源码；未执行测试，未修改业务源码/测试/Schema/数据库/生产状态。

## 1. 总结

本次补齐了 Persona 与 Channel Bridge 当前 main HEAD 的直接证据。**三个模块的当前 main 均存在 R4.1 REQUIRED 逻辑差距；不能冻结合同，也不能宣布实现 PASS。**

主要阻塞仍是 P0-1 跨会话上下文、P0-2 speaker attribution、P0-3 Self/Owner 身份门禁、P0-6 Persona 时间线与事务完整性。

## 2. Persona 当前 HEAD 发现

### PERS-01 — 启动时自动创建/恢复 Self，不是显式 enrollment

- 严重度：**P0**
- 证据：
  - `lib/index.js:101-105`：插件启动时直接调用 `ensureSelf(state.db, cfg.displayName, cfg.selfId)`。
  - `lib/self.js:10-43`：无 active Self 时自动恢复最早 dormant 行；无 dormant 行时自动生成 `self:<uuid>` 并插入 active 行。
  - `lib/self.js:36-43`：传入的 `seedId` 被直接用作 ID，函数本身未校验 `self:<uuid>` 格式。
- 影响：R4.1 要求 Self 缺失时保持 absent/null，需显式 enrollment；身份缺失不应由启动副作用自动解决。
- 判定：**FAILED（代码证据）**。
- 局部正向：多个 active Self 会抛 `E_SELF_CONFLICT`，但不能抵消自动创建/恢复问题。

### PERS-02 — Self 查询仍返回 self:unknown sentinel

- 严重度：**P0**
- 证据：`lib/service.js:60-69` 的 `selfId()` 在无行或异常时返回 `self:unknown`。
- 影响：R4.1 要求 canonical Self 为合法 `self:<uuid>` 或 null；不得把 sentinel 暴露为身份结果。
- 判定：**FAILED（代码证据）**。

### PERS-03 — Owner canonical identity / account link / consent 生命周期尚不存在于当前 Persona 数据模型

- 严重度：**P0**
- 证据：
  - `lib/db.js:38-100` 的核心建表包含 `self`、`meta`、`name_history`、`persona_versions` 及情绪表；未见 Owner identity、Owner account link 或 consent lifecycle 表。
  - `lib/service.js:60-150` 对外提供 `selfId`、`bindingOf`、`roleOf` 等接口；没有 R4.1 所需的 `identityOf` 等价解析结果，也没有 canonical `owner:<uuid>` 结果。
  - `lib/bindings.js` 的 `session_bindings` 记录 `session_id/persona_id/role/cwd/source/created_at`，不是 Owner 身份或跨平台账号 consent 模型。
- 影响：不能证明 Owner ID 独立永久身份、跨平台明确同意、撤销/过期/冲突处理已实现。
- 判定：**NOT_SUPPORTED IN CURRENT HEAD / BLOCKED**。

### PERS-04 — 旧 session_bindings 仍被主动写入并用于当前身份绑定

- 严重度：**P1**
- 证据：
  - `lib/inject.js:8-12` 引入 `bindSession`、`personaBindingOf`。
  - `lib/inject.js:72-87` 的 `writeBinding` 主动调用 `bindSession` 写入 `session_bindings`；`mount` 中继续写入并使用该 binding 决定 Persona 注入模式。
  - `lib/bindings.js:80-90` 实现 INSERT/UPSERT。
- 影响：R4.1/R4 对旧 `session_bindings` 的只读 legacy 定位尚未落实；当前代码仍将它作为活跃写入路径。
- 判定：**FAILED（代码证据）**。
- 边界：Runtime Session ↔ Self 关系由 Persona 唯一负责这一原则已批准；当前表的兼容、替换和迁移细节仍 OPEN，不能擅自改表。

### PERS-05 — Persona 情绪事件时间与状态写入时间混用

- 严重度：**P0**
- 证据：
  - `lib/index.js:218-220`：事件时间缺失时使用 `Date.now()`。
  - `lib/emotion.js:600-605`：`recordEvent` 的 `at` 默认 `Date.now()`。
  - `lib/emotion.js:630-647`：`applyCoreAppraisal` 将事件 `at` 同时写入 `emotion_state.label_updated_at/updated_at`，并写入 timeline `at`。
  - `lib/emotion.js:982` 起 `ingestEmotion` 也默认 `at=Date.now()`；写入 state 时将相同 `at` 写入 `label_updated_at/updated_at`。
  - Bridge `lib/parse.js:153-175` 也会在平台事件时间缺失时返回 `Date.now()`，上游缺失时间因此在进入 Persona 前已被伪装成有时间。
- 影响：无法区分事件发生时间与状态实际写入/计算时间；缺失事件时间无法保持 unknown/time-uncertain。
- 判定：**FAILED（代码证据）**。

### PERS-06 — recordRuleEpisode 不是原子事务，失败可留下部分状态

- 严重度：**P0**
- 证据：
  - `lib/emotion.js:652-723`：`recordRuleEpisode` 依次写 event、appraisal、episode，之后分别尝试状态更新；函数本身没有 `tx(db,...)` 包裹。
  - `lib/emotion.js:680-711`：状态更新失败被 catch 吞掉，可能已留下部分结果。
  - `lib/emotion.js:630-648`：`applyCoreAppraisal` 先更新 state，再 try/catch 写 timeline；timeline 失败不回滚 state。
  - `lib/emotion.js:1026-1063` 的主要 `ingestEmotion` 路径确实使用 `tx(db,...)`，但不能证明 `recordRuleEpisode` 同样原子。
- 影响：R4.1 C.5 要求 event/appraisal/episode 与 state/timeline 的事务一致性；当前至少两条路径不满足。
- 判定：**FAILED（代码证据）**。

### PERS-07 — 当前没有明确的 history/current API 边界

- 严重度：**P1**
- 证据：当前服务接口暴露 current state、timeline、active episodes 等读取，但未发现带显式 history/current 通道标记、时间质量字段且保证 history 只读不改变 current state 的 R4.1 等价接口。
- 判定：**NOT_VERIFIED / BLOCKED**；不能仅凭 `timeline()` 存在就判定 history API 已满足。

## 3. Channel Bridge 当前 HEAD 发现

### BR-01 — Conversation key 缺少 account_id，且缺字段时回退 unknown

- 严重度：**P0**
- 证据：
  - `lib/sessions.js:118-125`：key 只由 `group:<id>` 或 `private:<id>` 组成；通过 `replace(/\D/g,'')` 有损归一化；缺 ID 回退 `unknown`。
  - `lib/store.js:10-24`：`channel_sessions` 主键为 `(channel, kind)`，没有 `account_id`、规范 `conversation_id` 或映射版本字段。
  - `lib/parse.js:167-218`：解析消息没有 bot `account_id` 或规范 Conversation ID。
- 影响：与 Owner 批准的 `conv:qq:<account_id>:private:<peer_id>` / `group:<group_id>` 格式及缺字段 fail closed 冲突。
- 判定：**FAILED（代码证据）**。

### BR-02 — Bridge 自己生成 Runtime Session ID

- 严重度：**P0**
- 证据：
  - `lib/sessions.js:254-260`：轮换时由 Bridge 调用 `randomUUID()` 生成 `sessionId`，再传给 `agents.create`。
  - `lib/sessions.js:287-300`、`lib/sessions.js:483-500`：其他创建/退化路径同样由 Bridge 生成 UUID 并传给 Host。
- 影响：违反 Owner 已批准的 Host/DSH 权威 mint Runtime Session ID、Bridge 只记录映射的原则。
- 判定：**FAILED（代码证据）**。

### BR-03 — 平台 event_time 缺失时用 Date.now，且没有独立 received_at

- 严重度：**P0**
- 证据：
  - `lib/parse.js:153-155`：`toMillis` 对缺失/非法时间返回 `Date.now()`。
  - `lib/parse.js:175`：解析消息时把 fallback 后的时间放入 `at`。
  - `lib/message.js:33`：投递消息 source.at 再次使用 `Date.now()` fallback。
  - `lib/store.js:10-36`：`channel_events` 只有 `at`，没有 event_time/received_at/time_precision 分离字段。
- 判定：**FAILED（代码证据）**。

### BR-04 — 新会话上下文按 channel 取最近消息，不按 Conversation/contact 隔离

- 严重度：**P0**
- 证据：
  - `lib/context.js:8-17`：调用 `recentInboundAsc({channel,limit})`，没有 contact/conversation/session 参数。
  - `lib/store.js:322-330`：`recentInboundAsc` SQL 只按 `channel=? AND direction='in'` 查询，没有 contact/kind/session 过滤。
  - `lib/router.js` 新会话创建路径调用 `contextBuilder()`，未传入当前 parsed contact。
- 影响：同一 QQ channel 中其他私聊/群的近期消息可能被拼入新 Conversation 上下文，直接违反 P0-1 跨会话隔离。
- 判定：**FAILED（代码证据）**。

### BR-05 — 群上下文 fallback 也未按 group_id 过滤

- 严重度：**P0**
- 证据：`lib/index.js:280-290` 的 fallback 使用 `recentInboundAsc({channel:'qq'})` 后只筛 `kind='group'`，未筛当前 `groupId/contact`。
- 判定：**FAILED（代码证据）**。

### BR-06 — 群 turn 只传展示名，不传稳定 sender ID；flush 时间代替消息事件时间

- 严重度：**P0**
- 证据：
  - `lib/group-buckets.js:28-30`：bucket 只保存 `speaker/text/at`，未保存 sender_id。
  - `lib/group-turn-memory.js:91-97`：incoming 只传 `speaker` 字符串与文本。
  - `lib/group-turn-memory.js:103-124`：flush 使用 `now()` 作为整轮 `at` 并传给 Memory；原始消息各自的 `m.at` 只用于去重筛选。
  - Memory `lib/group/turn.js:54-56`：缺 speaker 时回退成“群友”。
- 判定：**FAILED（代码证据）**。

### BR-07 — publicBrief 元数据被 Bridge 格式化时剥除

- 严重度：**P0**
- 证据：
  - `lib/public-brief.js:24-31`：只把 Memory 返回内容格式化为文本；结构化对象中的授权/来源/validity 信息不会被保留。
  - `lib/router.js` 群 @ 投递路径把该文本直接拼进 prompt。
- 判定：**FAILED（代码证据）**。

### BR-08 — handoffBrief 调用没有传递 source/target Conversation、purpose 与 authorization ref

- 严重度：**P0**
- 证据：
  - `lib/sessions.js:202-238`：`fetchBrief` 调用 `memory.handoffBrief` 时传入 header/cwd/recent/kind/contactId/maxChars，没有 source Conversation、target Conversation、purpose 或授权引用。
  - Memory `lib/service.js:672-685` 只计算 `isOwner` 并传给 handoffBrief。
- 判定：**FAILED（代码证据）**。

### BR-09 — 转发/引用/notice 来源链在最终载荷中丢失或不完整

- 严重度：**P1（P0-2 来源链验收阻塞）**
- 证据：
  - `lib/forward.js:11-20` 能解析节点 senderId/senderName，但最终 `formatForward` 输出是可读文本，没有完整多跳 forward_chain 结构。
  - `lib/quote.js:48-52` 的 `formatQuote` 只输出 senderName 或 senderId 的展示字符串；`lib/prompt.js` 把引用拼成纯文本。
  - `lib/notice.js:84-99` 能解析 userId/operatorId/targetId，但 `lib/index.js:400-412` 写入 `channel_events.meta` 时只保存 noticeKind/subType/messageId，没有保存 operatorId/targetId。
- 判定：**FAILED（持久化/载荷证据）**。

## 4. 跨模块 P0 汇总

| Owner 优先级 | 当前证据 | 静态判定 |
|---|---|---|
| P0-1 跨 Conversation 泄漏 | Memory buildDigest + Bridge recentInboundAsc/context + group fallback | FAILED |
| P0-2 群聊 speaker attribution | Bridge bucket 丢 sender_id，Memory 用显示名/“群友” | FAILED |
| P0-3 Self identity gate | Persona 自动创建 Self、selfId sentinel、无 Owner identity/consent/identityOf | FAILED |
| P0-4 validity filtering | Memory 出口缺少统一 validity/current-history 过滤（见报告 01） | FAILED |
| P0-5 duplicate evidence/confidence inflation | Memory confidence 默认 1.0（见报告 01）；本轮未穷尽所有同源去重路径 | FAILED / INCOMPLETE |
| P0-6 Persona timeline/transaction integrity | event/write time 混用；recordRuleEpisode 非原子事务 | FAILED |

## 5. 局部正向证据（不等于整体 PASS）

- Persona 对多个 active Self 会拒绝启动，不会自动挑一行。
- Persona `ingestEmotion` 的主要 state/timeline/points 路径使用事务；但 `recordRuleEpisode` 与 `applyCoreAppraisal` 另有非原子路径。
- Bridge notice parser 已区分 `userId`、`operatorId`、`targetId`，但当前持久化时丢弃后两者。
- Bridge 已有按群/私聊联系对象拆分 session key 的意图；但 key 缺少 account_id、缺字段回退 unknown、有损数字归一化，不能满足 Owner 批准的规范 Conversation ID。

## 6. 证据边界与下一步

- 本次直接读取 Persona `main@a84c7bad...` 与 Channel Bridge `main@bffcabc...` 的当前 HEAD 文件。
- 本报告是静态代码审查，没有运行任何测试；R4.1 专项动态负向测试均为 **NOT_RUN**。
- 没有访问真实 QQ/NapCat 运行环境，也没有验证 Host/DSH 实际是否支持权威 mint API；Bridge 当前代码由自身生成并传入 UUID 的证据已确认，Host 侧 API 语义仍需独立验证。
- 下一步应整理跨模块 P0-1/P0-2/P0-3/P0-6 差距矩阵，再形成只读接口修订建议。不得修改实现，不得将 OPEN/PROPOSAL 升级为 Owner 决策。

## 7. 权限声明

本报告只读取代码与测试源码并创建本报告文档。没有执行测试，没有修改业务源码、测试、Schema、数据库、配置、权限、部署或设备状态；没有创建 Owner ID、账号绑定、迁移或发送真实消息。任何可能改变汐实际状态或行为的实施仍须 Owner 另行明确授权。
