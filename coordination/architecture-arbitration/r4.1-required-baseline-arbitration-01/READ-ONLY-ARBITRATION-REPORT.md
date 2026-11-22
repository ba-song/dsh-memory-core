# R4.1 REQUIRED 基线只读技术仲裁报告 01

- 状态：**IN_PROGRESS / STATIC REVIEW ONLY**
- 审查日期：2026-11-22
- 仓库：`ba-song/dsh-memory-core`
- 被审查代码基线：`main` @ `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`
- 对照合同：R4.1 Owner 已批准的 REQUIRED 逻辑约束；合同候选当前另有 Owner 决策记录 OD-R4.1-01。
- 本报告分支：`review/gpt-r4.1-required-baseline-arbitration-01`
- 范围：GitHub 当前 main 分支静态代码/测试读取；没有执行测试、没有修改源码/测试/Schema/数据库/生产状态。

## 1. 结论摘要

**当前 Memory 仓库代码不能通过 R4.1 REQUIRED 语义验收。** 已直接确认以下高优先级差距：

1. 新记忆 numeric confidence 仍有多处默认值 `1.0`，与 Owner 已批准的新记录 `confidence_level='unknown'`、numeric confidence NULL 的逻辑要求冲突。
2. 群聊 turn 接口仍允许缺失实际 speaker，以“群友”占位；缺失时间时由 `Date.now()` 补时间；并把群名/群号与 speaker 文本拼成记忆正文。
3. `publicBrief` 查询只按 `scope_type='public'`，未过滤 status、validity、verification/current-history，也没有输出授权元数据。
4. `handoffBrief` 以单个 `isOwner` 布尔值决定是否返回项目决策/todo，没有 source Conversation、target Conversation、purpose、authorization reference 或 validity 载荷。
5. `buildDigest` 从多个 cwd/渠道读取原始消息，再注入 Owner 会话；它是实际跨 Conversation 原文摘要出口，当前没有逐来源授权/有效性/历史标记过滤。
6. `stable`、`carryover`、`shorttermRecent` 和缓存/注入链路尚未形成合同要求的统一 current/history 与 Conversation 授权门禁。

因此本轮状态是 **FAILED（静态差距已证实）/ NOT PASS**，不是整个项目的最终失败判定；这是针对当前 main 基线与 R4.1 REQUIRED 语义的静态差距结论。未执行专项负向测试，所有测试状态均为 **NOT_RUN**。

## 2. 证据与差距

### F-01 — 新记忆 confidence 默认值不符合 Owner 决策

- 严重度：**P0**
- 证据：
  - `lib/store/schema.js:79`：`memories.confidence REAL NOT NULL DEFAULT 1.0`。
  - `lib/store/db.js:17` 附近：旧库补列仍使用 `confidence REAL NOT NULL DEFAULT 1.0`。
  - `lib/store/memories.js:30`：`rec.confidence ?? 1`，未显式传值的新记录会得到 1.0。
- 影响：新记录可能在没有校准依据时获得最大 numeric confidence；与 Owner 已批准的新记录 unknown/NULL 语义冲突。
- 判定：**FAILED（代码证据）**。
- 边界：本报告不提出直接修改默认值；Schema/DB 改动仍需单独 Owner 授权。

### F-02 — 群聊 speaker 缺失时被伪装成“群友”

- 严重度：**P0**
- 证据：
  - `lib/group/turn.js:54-56`：缺失 `m.speaker` 时回退到字符串 `群友`。
  - `lib/group/turn.js:68-70`：将该展示字符串直接写入群聊正文。
  - `lib/service.js:612-654`：`saveGroupTurn` 接收 `incoming` 后直接构造并写入 Memory；接口没有要求 `external_speaker_id`、Bridge source id 或缺失字段清单。
  - `tests/group-turn.test.mjs` 明确把空 speaker 回退到“群友”作为预期行为。
- 影响：原始 speaker 缺失没有保持 unknown；正文中的展示占位可能被下游误读为可归属的发言者。现有测试保护的是旧行为，不是 R4.1 语义。
- 判定：**FAILED（代码与旧测试证据）**。
- 建议逻辑处理：缺实际 sender ID 时保留 group-scope event，但 speaker/experiencer 必须 unknown/null；显示名只能作为 display snapshot，不得代替身份。物理接口保持 OPEN。

### F-03 — 群聊事件时间缺失时使用当前时间补造

- 严重度：**P0**
- 证据：
  - `lib/group/turn.js:31` 注释说明缺省由调用方补 `Date.now()`。
  - `lib/group/turn.js:75`：`Number(at) > 0 ? Number(at) : Date.now()`。
  - `lib/service.js:612-654`：使用 `turn.at` 作为 `sourceTs` 写入记忆。
  - `tests/group-turn.test.mjs` 中大量调用未提供 `at`，测试仍期待成功。
- 影响：接收/处理时刻被伪装成事件时间，无法区分真实 event_time 与缺失时间。
- 判定：**FAILED（代码证据）**。
- 建议逻辑处理：缺失 event_time 保持 null/unknown；如需记录接收时间，必须使用独立 received_at 字段，不能冒充事件时间。

### F-04 — publicBrief 缺少 current/validity/status 与授权元数据过滤

- 严重度：**P0**
- 证据：
  - `lib/service.js:529-545`：查询条件只有 `scope_type='public'`，后续只按 TTL 判断；没有 `status='active'`、validity、verification 或 current/history 标记过滤。
  - 返回值仅包含 `id,text,at,source`，没有 source Conversation、target scope、purpose、authorization reference、expiry/audit metadata。
  - `tests/public-brief.test.mjs` 只验证 public scope 和 TTL，没有 legacy/unknown/expired/superseded/channel marker/授权缺失负向用例。
- 影响：public scope 被当作主要筛选条件，但合同明确规定 public scope 本身不是完整授权与有效性证明。
- 判定：**FAILED（代码证据）；专项负向验收 NOT_RUN**。
- 说明：`publishPublic` 是 Owner 显式调用的发布入口，这是已有授权意图证据；但当前记录没有形成 R4.1 所需可验证的授权引用、来源范围、用途与撤销/审计载荷，不能据此判定出口已满足合同。

### F-05 — handoffBrief 仅用 isOwner 布尔值，不具备跨 Conversation 授权边界

- 严重度：**P0**
- 证据：
  - `lib/handoff/brief.js:9-12`：输入只有 `cwd/recent/kind/contactId/maxChars/isOwner`；非 Owner 返回当前 recent 片段，Owner 路径进入项目决策/todo读取。
  - `lib/handoff/brief.js:24-35`：按 project_id 读取 decisions/todos，没有来源 Conversation、目标 Conversation、purpose、authorization reference 或记录 validity 的校验。
  - `lib/service.js:672-685`：调用层只把 `isOwnerHeader(header)` 结果传入。
  - `tests/handoff-brief.test.mjs` 只验证 Owner/非 Owner 输出，不覆盖跨 Conversation 未授权、撤销/过期授权或来源缺失。
- 影响：Owner 身份被当作足以跨 Conversation 携带决策/todo 的授权依据；这与 R4.1 已批准的“Owner todo/decision 不自动跨 Conversation 注入”冲突。
- 判定：**FAILED（代码证据）；专项负向验收 NOT_RUN**。

### F-06 — buildDigest 汇总多个会话原文并注入 Owner 会话

- 严重度：**P0**
- 证据：
  - `lib/inject/digest.js:12-20`：查询近 12 小时全部 `raw_meta`，没有按当前 Conversation 或已授权来源过滤。
  - `lib/inject/digest.js:22-36`：按 home/QQ/group/email 房间分类，抽取原始消息文本生成摘要。
  - `lib/index.js:1109-1120`：只要当前 session 被判为 Owner，就调用 `buildDigest(db)` 并注册为 system prompt context。
- 影响：该出口明确是跨房间/跨渠道原文汇总。当前过滤依据是粗粒度 cwd 房间类别，不是 R4.1 所要求的逐来源 Conversation、用途、授权、current/history 与 validity 约束。
- 判定：**FAILED（代码证据）**。
- 备注：这是 R4.1 P0-1 最直接的代码级阻塞之一。

### F-07 — stable/shortterm/remembered 缺少统一有效性与 history 通道过滤

- 严重度：**P1（当前 Owner 范围也可能跨来源）**
- 证据：
  - `lib/inject/stable.js:166-185`：Owner 常驻块读取未过期 shortterm，但没有 current/history marker 或来源 Conversation/授权检查。
  - `lib/inject/stable.js:195-202`：群记忆按 active + group scope 读取，未检查 valid_from/valid_to、verification 或 history marker。
  - `lib/inject/remembered.js:12-20`：按 active、scope 和 kind 过滤，没有 temporal/current/history 过滤。
  - `lib/service.js:699-715`：shorttermRecent 检查 expires_at/at 和 scope；没有 source Conversation/authorization/current-history 元数据过滤。
- 影响：scope/status/TTL 不是 R4.1 所要求的完整 current/history 与有效性模型。
- 判定：**FAILED（静态代码证据）；具体每个调用者的来源语义仍需逐项确认**。

### F-08 — carryover 使用 cwd 作为历史边界，未携带规范 Conversation/历史标记

- 严重度：**P1**
- 证据：
  - `lib/inject/carryover.js:6-29`：按 cwd 读取 raw_meta 的前序消息；返回纯文本块，没有 source Conversation、channel、validity 或 history marker。
  - `lib/index.js:1109-1111`：Owner session 通过 cwd 调用 carryoverFor。
  - `lib/service.js:688-695`：工具调用路径也按 cwd 读取，且未将 session id 传给 carryoverFor。
- 影响：cwd 目前承担了 Conversation boundary 的替代角色；尚无证据证明它与 R4.1 规范 Conversation ID 一一对应，也无法在下游保留 history/current 语义。
- 判定：**FAILED（逻辑载荷缺少 REQUIRED 元数据）；cwd 与规范 Conversation 的映射关系 OPEN/未验证**。

### F-09 — Self/Owner 仍有旧身份表达，不能当作新 canonical 身份合规证据

- 严重度：**P1**
- 证据：
  - `lib/owner.js:95-112`：Owner 分类依赖 `contact:owner` binding、Owner 私聊目录 fallback 或 trusted directory；本仓库检索到的该模块没有 `owner:<uuid>` canonical Owner identity 生命周期实现。
  - `lib/ingest/archive.js:418-430`：Persona Self 缺失时 raw archive 暂存 `self:unknown` 并标记 `pendingIdentity`。
  - `tests/selfid.test.mjs` 将该 sentinel + pending + 后续回填作为现有行为测试。
- 影响：这是旧兼容/待补全路径，不可证明 R4.1 的 canonical Owner/Self identity gate 已完成。
- 判定：**NOT_VERIFIED / BLOCKED**，不能仅凭这些片段断言 sentinel 已作为有效 canonical identity；需进一步核验 raw→Memory 晋升门禁与真实 Persona 身份服务。

## 3. 当前出口盘点（Memory 仓库）

| 出口 | 当前可见行为 | R4.1 静态判定 |
|---|---|---|
| publicBrief | public scope + TTL；无完整 status/validity/auth payload | FAILED |
| handoffBrief | Owner bool + project decisions/todos/recent | FAILED |
| buildDigest | 跨 cwd 原文汇总，Owner prompt 注入 | FAILED |
| stable | facts/pins/shortterm/group/remembered 混合输出 | FAILED / 部分来源语义 OPEN |
| carryover | cwd 范围 raw history → 文本 | FAILED |
| shorttermRecent | expires_at/at + scope | FAILED / 来源授权语义 OPEN |
| cache/payload/merge | 本轮未完成全仓调用链穷尽 | NOT_VERIFIED |

## 4. 模块边界与证据限制

- 本次直接读取的是 `ba-song/dsh-memory-core` 的 `main` 分支代码，HEAD 为 `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`。
- 该仓库包含 Memory 插件及部分旧情绪存储代码；本次没有取得当前独立 Persona/EI 仓库或 Channel Bridge 仓库的最新代码 HEAD。因此，R4.1-C 与 R4.1-D 的独立模块当前实现状态仍为 **NOT_VERIFIED**，不能把 Audit-07/R4.1 报告当作当前 HEAD 的实现证明。
- 旧测试只证明旧行为仍受测试保护；未运行测试，也未把旧测试通过当作语义 PASS。
- 本次没有进行动态/运行环境验证，没有真实 QQ/NapCat/Host mint 测试。

## 5. 后续只读工作顺序

1. 先完成 Memory 侧 P0-1 出口/旁路调用链盘点：包括缓存、工具注册、调用者、payload 与 merge；补全 F-07/F-08 的精确调用路径。
2. 核对 Memory validity/current 过滤函数是否被所有召回、注入和摘要出口复用；记录缺口，不改代码。
3. 核对群聊 raw archive → group turn/transcript/digest → Memory 的数据路径与 speaker/time 原始字段来源。
4. 获取 Persona 与 Channel Bridge 当前准确 HEAD 的只读证据后，分别做 C/D 条款逐项仲裁。
5. 只有跨模块差距被完整列明后，才提出下一份合同修订；不得将 PROPOSAL/OPEN 升级为已批准决定。

## 6. 权限声明

本报告仅为只读静态审查。没有执行代码/测试，没有修改源码、测试、Schema、数据库、配置、权限、部署或设备状态；没有创建 Owner ID、账号绑定或发送真实消息。所有后续实际行为变更仍须另行取得 Owner 明确授权。
