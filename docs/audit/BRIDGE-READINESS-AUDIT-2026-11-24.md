<!-- 来源：本地只读报告 /sdcard/DSHA/工作区/人格记忆插件优化/Channel Bridge Agent/FIRST-REAL-DEVICE-TEST-READINESS-20261124.md -->
<!-- 来源 SHA256：3c9e0b266303c7f2f00819872dc6abd963cae4e820386d7e1e4904945efdddf8 -->
<!-- 归档：ba-song/dsh-memory-core docs/audit/BRIDGE-READINESS-AUDIT-2026-11-24.md -->
<!-- 说明：正文保留来源报告内容；仅在本文件开头增加来源注释与证据分级补充。 -->

# DSHA「汐」第一轮实机测试准备 · Channel Bridge

> **归档说明**：本文件是 Channel Bridge 第一轮实机测试准备报告的原样归档。来源为本地只读报告（SHA256 见上）；未修改生产代码、配置、数据库或设备状态。
>
> **证据分级补充**（严格区分）：
>
> | 等级 | 本报告中的内容 | 位置 |
> |---|---|---|
> | **源码证实** | 生产源码与 main `bffcabc` 一致、与 P0-1 `3ae4c03` 不一致；`buildSessionContext`/group fallback/`handover`/dedupe 等代码路径 | §1.1、§4 |
> | **测试证实** | 生产 `npm test` 562/562、P0-1 隔离 clone 565/565；均为本地实际运行 | §1.1、§9 |
> | **设备证实（只读）** | DSH PID 30172、profile、Bridge 日志、只读 `bridge.db` 统计 | §1.2、§9 |
> | **源码+本地探针** | 生产 `buildSessionContext` 混入私聊 A+B+群 A、`recentInboundAsc` 无 scope、handover 输出 `[主人]`；使用临时内存 DB/本地 clone，不是生产实时测试 | §4.4 |
> | **推断/设计建议** | 隔离测试 profile、fake WS、测试 ID 设计、风险投影；**未执行** | §5、§8 |
>
> 注：本归档不把静态推断写成设备实测；未运行真实 QQ/NapCat、未启动测试 profile、未发送测试消息。

- 任务：第一轮实机测试准备（Channel Bridge）
- 角色：Channel Bridge 专项工程智能体
- 仓库/安装：`ba-song/dsh-channel-bridge` / `/root/.dsh/plugin-src/dsh-channel-bridge`
- 生产 profile：`/root/.dsh/profiles/web/cordis.patch.yml`
- 检查时间：2026-11-24 13:22–13:30（Asia/Shanghai）
- 性质：只读核查；未修改配置/代码/数据库；未部署/重启；未连接真实 QQ（只读日志/DB）；未发送消息。
- 结论：**BLOCKED（当前生产链路）/ READY WITH CONDITIONS（隔离测试环境）**

---

## 1. 当前版本与部署状态

### 1.1 版本

| 项 | 值 |
|---|---|
| package | `dsh-channel-bridge@0.18.0` |
| 生产源码 | `/root/.dsh/plugin-src/dsh-channel-bridge` |
| 生产源码 vs main `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` | **一致**（`lib/index.js`、`context.js`、`store.js`、`sessions.js`、`message.js` 全部相同；仅生产无 package-lock） |
| 生产源码 vs P0-1 目标 `3ae4c03f7119c3c798a1d824b8d02bb53ad3544d` | **不一致**：`index.js`/`context.js`/`store.js` 仍是旧版；`sessions.js`/`message.js` 相同 |
| 生产测试 | `npm test`：**562/562 pass，0 fail，exit 0**（2026-11-24 13:2x） |
| P0-1 分支测试（另 clone） | **565/565 pass，0 fail，exit 0**（2026-11-22 验证） |

结论：**当前部署不是 P0-1 修复分支**；P0-1 的 `buildSessionContext`/fallback/store scope 修复尚未部署。

### 1.2 运行方式

- DSH Web：PID **30172**，`node .../bin.js web --no-open --host 127.0.0.1 --port 38105`（2026-11-24 仍在运行）。
- Channel Bridge 是 **DSH 插件进程内模块**，不是独立 daemon；由 `cordis.patch.yml` 的 `channel-bridge` 插件加载。
- 生产 profile（164–178 行）：

```yaml
- id: channel-bridge
  name: 'dsh-channel-bridge'
  config:
    enabled: true
    unified: true
    host: 127.0.0.1
    port: 3001
    cwd: /sdcard/DSHA/渠道/qq
    owner:
      qqIds:
        - "2971030080"
    mode: send
    group:
      social:
        enabled: true
```

- 模式文件 `/root/.dsh/dsh-channel-bridge.json`：`{"mode":"send"}`；但 `modeHotSwitch` 默认 **false**，所以该文件当前不是权威开关，实际 mode 来自 profile 的 `send`。
- 连接：日志 `已连上 ws://127.0.0.1:3001/`；最近一次连接 2026-11-24 12:57:58（local），日志持续到 13:22:57；
- 日志中约每 30 分钟出现 `连接断开 code=1006` 后自动重连；这是当前运行特征，不是测试结论。
- 2026-11-24 13:22:57 统计：事件 6137（消息 48、非消息 6088、重复 0、解析失败 0），投递 10/10 失败 0 静默 1；对账累计拉取 54480。
- 只读 DB（`bridge.db`）快照：`channel_events` 4850（入 1570 / 出 3238）、`channel_sessions` 5、`channel_contacts` 4；群入站 196 条，空 `sender_id` 0；群入站无 `session_id` 60 条；私聊入站无 `session_id` 1343 条（unified/未投递）。

---

## 2. 完整消息链路图（实际代码）

```text
Android / DSHA 宿主 (proot Ubuntu, DSH web PID 30172)
  │
  └─ @deepseek-ai/dsh web
       └─ plugin: channel-bridge (lib/index.js apply)
            │
            ├─ lib/ws.js: WebSocket client -> ws://127.0.0.1:3001/
            │    (NapCat/OneBot WS；onEvent -> index.onEvent)
            │
            ├─ lib/parse.js: parseMessageEvent
            │    private: contactId = senderId
            │    group:   contactId = group_id
            │             senderId = user_id
            │             senderName = card/nickname/user_id
            │
            ├─ lib/dedupe.js / store.hasMessageId:
            │    key = message_type|group_id|message_id
            │    DB 查重 = message_id only
            │
            ├─ store.insertEvent (先落库，再投递)
            │
            ├─ 群聊门禁 (shouldDeliverGroup)
            │
            ├─ unified?（仅主人私聊）
            │    └─ dyHome.deliver(payload)
            │         payload: channel/kind/contactId/contactName/text/at/messageId/priority
            │         无 conversation_id / runtime_session_id / senderId
            │
            └─ router.deliver (群 / 陌生私聊)
                 └─ queue key = channel|kind:id
                      └─ sessions.ensure
                           ├─ key = private:<id> / group:<id>
                           ├─ store.getSession(channel,key)
                           ├─ agents.get / resume / create({sessionId: randomUUID()})
                           ├─ cwd = /sdcard/DSHA/渠道/qq-群/<gid>
                           │       或 /sdcard/DSHA/渠道/qq-私聊/<qq>
                           └─ agent.followup(buildChannelMessage(prompt))
                                └─ 会话内 Persona/Memory 插件执行
                                     └─ dy_say / dy_send_* 发送（mode=send）
```

### 2.1 发送与错误处理（同一链路的下行）

```text
agent 会话（Persona/Memory 插件已加载）
  └─ dy_say（lib/tools.js:73-298）
       ├─ validateSay（lib/say.js:11-78）
       │    mode=observe/deliver 拒绝；send 才允许
       │    owner 只能 private；非 owner 必须在 7 天联系人窗口
       └─ sender.sendText（lib/sender.js:46-90）
            ├─ delivery ledger：同内容在途 → E_ALREADY_DELIVERING（防并发双发）
            ├─ WS action send_private_msg / send_group_msg
            └─ 失败：不重试；写 outbox 留底；返回 E_OFFLINE/E_SEND_FAILED
```

- 其他发送工具（图片/语音/表情/文件/视频）也都走 `mode` 闸门和 `sender`；`outbound:'tool'` 时 `dy_say` 可用；`outbound:'auto'` 时 `dy_say` 被停用（`lib/tools.js:82-84`）。
- 错误处理：
  - 解析失败/非消息：`parseFail`/`notMessage` 计数，丢弃。
  - 入站闸重复：`dup`；回声：`echoSkipped`；卡片：`cardSkipped`。
  - 会话失败：`E_NO_AGENTS`/`NO_MODEL`/`E_CWD`/`E_SESSION_FAILED`，`deliverFail`，不重试。
  - followup 失败：`E_FOLLOWUP_FAILED`；工作目录错误：`E_AGENT_ERROR`，不算已回复。
  - 队列满：`QUEUE_FULL`，丢弃；`mode=observe`：`MODE_OBSERVE`，不投递。
  - WS：断线指数退避重连（1s→60s，±20%），心跳 `get_status`，半开硬重置；action 超时 `E_TIMEOUT`，不重放。
  - unified：home 不可用 `E_HOME_UNAVAILABLE`，不回退自建；未确认送达不写 handover.done、不重放。
- 发送风险：生产 `mode:send`，`dy_say` 对 owner/7 天内联系人有真实发送能力；多段发送中途失败会返回 failed，已发段不回滚，outbox 留全文；不自动重试。

**六个智能体的实际边界**：

- 不存在“六个智能体各自接收 QQ 消息”的扇出。Bridge 的实际接收端是：
  1. **Host/DSH agent 会话**（`agents.create/resume/followup`；群/陌生私聊）；
  2. **dyHome**（主人私聊 unified，交给 home/autonomy 链路）；
  3. **dyMemory**（`handoffBrief`、`publicBrief`、`saveGroupTurn`、`saveGroupTranscript`）；
  4. **dyMedia/attachments**（媒体落盘/图片直投）；
  5. **dyMail**（email 发送工具）；
  6. **tools/webServer**（`dy_*` 工具、`/xi-console` 只读状态）。
- **Persona** 不在 Bridge 里直接调用；它作为 agent 会话插件参与。**Android** 不是消息接收端，只提供宿主/文件系统/网络。**GPT** 不在运行时链路。
- 因此“六个智能体”是项目分工，不是六个独立消息 recipient；测试必须按上述实际接口验证。

---

## 3. 会话身份字段传递路径

| 阶段 | 字段 | 代码/证据 |
|---|---|---|
| OneBot 入站 | `user_id`, `group_id`, `message_id`, `time` | `lib/parse.js:160-220` |
| parse 私聊 | `contactId = senderId`; `senderId` | `lib/parse.js:181-200` |
| parse 群聊 | `contactId = group_id`; `senderId = user_id`; `contactName = group_name/群_<gid>` | `lib/parse.js:199-219` |
| 入站落库 | `channel_events.kind` = `private:<qq>` / `group:<gid>`；`contact`；`sender_id`；`message_id`；`session_id` 初为 null | `lib/index.js:509-518`; `lib/store.js:207-227` |
| 路由队列 | `channel|kind:contactId` | `lib/router.js:30-34` |
| 会话 key | `private:<qq>` / `group:<gid>`（`keyFor` 剥非数字，空→`unknown`） | `lib/sessions.js:118-124` |
| 会话映射 | `channel_sessions(channel,kind)` → `session_id`；无 `conversation_id`/`account_id` | `lib/store.js:10-23`; DB 5 行 |
| session ID | Bridge `randomUUID()` 生成，传给 `agents.create` | `lib/sessions.js:259,287,451,481` |
| cwd | 群 `/sdcard/DSHA/渠道/qq-群/<gid>`；私聊 `/sdcard/DSHA/渠道/qq-私聊/<qq>`；unified owner 走 home | `lib/sessions.js:131-137`; `lib/unified.js:44-52` |
| 投递给 agent | `buildChannelMessage` 的 `source`：channel/contact/contactKind/contactId/contactName/messageKind/at；**无 senderId/sessionId/conversationId** | `lib/message.js:10-35` |
| 回填 | `updateEventSession(messageId, sessionId)` 只回填 session_id | `lib/router.js:179`; `lib/store.js:229-242` |
| unified | payload 无 conversation/session/senderId；home 返回 sessionId | `lib/unified.js:44-52,62-78` |
| 群上下文 | `buildSessionContext` 用 `row.contact` 当 `who`；群时是群号 | `lib/context.js:31` |
| handover | `listInboundSince` 不取 sender_id；`formatHandover` 所有 user 标 `[主人]` | `lib/store.js:293-305`; `lib/handover.js:114-124,143-152` |

**结论**：当前生产没有 `conversation_id`；`session_id` 是 Bridge 自己生成；cwd 按旧 key；`message.source` 没有 session/conversation/sender；群上下文/历史仍可能用群号或昵称。

---

## 4. 重复、丢失、乱序、串会话风险

### 4.1 重复投递

| 风险 | 证据 | 级别 |
|---|---|---|
| 去重 key 不含 channel/account：`message_type|group_id|message_id`；不同渠道/账号同 ID 可能误判重复 | `lib/dedupe.js:5-10` | P1 |
| DB 去重只按 `message_id`，不含 channel/account/kind | `lib/store.js:307-315` | P1 |
| 没有 `message_id` 的事件不去重，重复推送会重复投递 | `lib/dedupe.js:7` | P2 |
| echoGuard 同 contact+同文本≤3s 跳过，可能把用户真实重复消息当回声 | `lib/echo.js`; `lib/index.js:486-491` | P2 |
| 群对账在投递成功后才 `insertEvent`；若 insert 失败，下轮 `hasMessageId` 不存在，可能重复投递 | `lib/reconcile.js:212-239` | P2 |

### 4.2 丢失

| 风险 | 证据 | 级别 |
|---|---|---|
| **先落库、后投递**：事件已写入 `channel_events`，若 router 队列满/会话失败/followup 失败，DB 已有 `message_id`，replay/reconcile 会按 `hasMessageId` 跳过 | `lib/index.js:509-518` + `lib/router.js:101-105,225-233` + `lib/replay.js:80` + `lib/reconcile.js:152` | **P0** |
| 入站闸内存去重在投递前执行；投递失败后本进程也不会再处理同一 key | `lib/dedupe.js:49-56` | P1 |
| `maxQueue=50` 满时直接 `QUEUE_FULL`，不重试 | `lib/router.js:225-229` | P1 |
| `sessions.ensure` 失败（NO_MODEL/CWD/SESSION）直接返回失败，不重试 | `lib/router.js:101-105` | P1 |
| `unified` 失败不重放，只依赖 home 侧重试；home 不确认时消息可能丢失 | `lib/unified.js:87-97` | P1 |
| 富化（quote/forward/media）失败按原样投递，不算丢失；但附件/引用内容丢失 | `lib/router.js:48-67` | P2 |

### 4.3 乱序

| 风险 | 证据 | 级别 |
|---|---|---|
| 同一队列串行，顺序按到达；不同群/私聊队列并发，无全局顺序 | `lib/router.js:28-34,190-205` | P2 |
| unified owner 私聊 `void unified.deliver` 异步，不经过 router 队列；连续消息可能并发 | `lib/index.js:587-613` | P1 |
| replay/reconcile 与实时路径可并发，旧消息可能晚于新消息到达；群对账按 `at` 排序，但不与实时队列统一 | `lib/replay.js:133-190`; `lib/reconcile.js:160-260` | P1 |
| `toMillis` 缺失/异常时间回退 `Date.now()`（生产旧版）→ 事件时间可能变成接收时间，影响排序 | `lib/parse.js:151-155,175` | P1 |

### 4.4 错误关联会话

| 风险 | 证据 | 级别 |
|---|---|---|
| **生产 `buildSessionContext` 只按 channel 取最近入站**；私聊 A/B、群、其他会话会混入新会话上下文 | 生产 `lib/context.js:13`; 实测输出私聊A+私聊B+群A | **P0** |
| `contextBuilder` 无参调用，不接受当前消息 scope | 生产 `lib/index.js:263` | **P0** |
| group fallback 只按 `channel='qq'` + kind=group，不按 group_id；群 B 会混入群 A | 生产 `lib/index.js:287-290` | **P0** |
| `keyFor` 剥非数字、空→`unknown`、无 account_id；不同账号/非法 ID 可碰撞 | 生产 `lib/sessions.js:118-124` | P1 |
| `channel_sessions` 主键 `(channel,kind)`，旧行 `group`/`private`；无 conversation_id/account_id/version | 生产 `lib/store.js:10-23`; DB 5 行 | P1 |
| 群 context `who = row.contact` = 群号；群 ID 被当发言人 | 生产 `lib/context.js:31`; 实测 `707380948：群成员消息` | **P0** |
| handover `listInboundSince` 无 sender_id，所有 user 标 `[主人]` | 生产 `lib/store.js:293-305`; `lib/handover.js:143-152` | **P0** |
| unified owner 私聊 payload 无 conversation/session；所有主人私聊进入同一 home | `lib/unified.js:44-52` | P1 |
| 群 live buffer `speaker = senderName || contactName || senderId`；缺 sender 退化群名 | 生产 `lib/index.js:546,565` | **P0** |
| group-turn/transcript 只传 speaker 名称，不做成员 ID | `lib/group-buckets.js:29-33`; `lib/group-turn-memory.js:96,122-127`; `lib/group-digest.js:56-88` | **P0** |

**结论**：当前生产同时存在 P0 级串会话/身份错配风险；“先落库后投递 + 全局 message_id 去重”会造成投递失败后无法补投的丢失风险。

---

## 5. 测试消息隔离方法

### 5.1 当前能不能直接用生产链路测？

**不能。** 原因：

- 生产 `mode: send`，`unified:true`；`dy_say` 对 owner/7 天内联系人可真实发送；群消息在 @ 后可回复。
- `modeHotSwitch` 默认 false；不能靠改 `/root/.dsh/dsh-channel-bridge.json` 临时切 observe（生产 profile 未开 hotSwitch）。
- 没有 `test` 标志、测试会话命名空间或测试 message_id 前缀；任何进入 127.0.0.1:3001 的真实 OneBot 事件都按真实用户处理。
- 当前部署代码不是 P0-1 修复分支，跨会话上下文会把测试消息和其他会话混合。

因此，**生产链路 BLOCKED**。

### 5.2 推荐隔离方案（READY WITH CONDITIONS）

1. **独立 DSH 测试实例**：单独 `DSH_HOME`/profile/端口（如 38106）、独立 `dbPath`、独立 `cwdRoot`（`/sdcard/DSHA/测试/p01`）；不碰生产 profile/DB/home。
2. **Fake OneBot WS**：本地测试服务器监听测试端口（如 3101），实现 `get_login_info`/`get_status`/`get_group_msg_history`/`get_friend_msg_history`；Bridge 指向它，不连 NapCat 3001。
3. **测试 code 版本**：使用 P0-1 目标分支 `3ae4c03...`（565/565）而不是生产旧版；若要验证当前生产，则只能验证“已知有 P0 缺陷的基线”，不能当 P0-1 PASS。
4. **测试配置**：`enabled:true`、`mode:observe`（第一轮只验证接收/落库/路由判定，不投 agent）；确认后再用 `mode:deliver` + 测试 agent（不暴露发送工具）；`unified:false` 或独立 test home；`owner.qqIds` 用测试 ID；`agentPreset` 用测试 preset。
5. **测试标识**：`message_id = p01-test-<nonce>-<seq>`；测试群 `900000001`、成员 `900000002`、私聊 `900000003`；正文前缀 `[P01-TEST:<nonce>]`。前缀只用于断言，不是隔离边界；隔离边界是独立进程/DB/WS。
6. **禁止真实外发**：fake WS 对任何 `send_private_msg`/`send_group_msg` 只记录并返回模拟成功/失败；不接真实 NapCat；不启动生产 home/autonomy 的真实发送。
7. **观测**：测试 DB 的 `channel_events`（scope/sender/session）、Bridge 日志、agent session log、fake WS 收包记录；不读生产 DB 写。

### 5.3 条件

- 负责人批准测试 profile/测试进程与 fake WS；不改生产配置。
- 测试使用独立目录/DB/端口；测试结束清理。
- 若只能使用生产进程/真实 NapCat，则 **BLOCKED**，不得发送测试消息。

---

## 6. 与 Host、Memory、Android 的接口依赖

| 依赖 | 调用点 | 说明 |
|---|---|---|
| Host `agents` | `lib/sessions.js` `agents.get/resume/create` | 会话创建/恢复/`followup`；`sessionId` 当前由 Bridge 传入 |
| Host `agentDefaultModel` | `lib/index.js:174-180` | 无模型不建会话 |
| Host `attachments` | `lib/index.js:203-209` | 群图片直投 |
| Host `tools` / `webServer` | `lib/index.js:666-700,727-740` | `dy_*` 工具、只读 console |
| `dyHome` | `lib/unified.js:35-40` | 主人私聊 unified；缺失不回退 |
| `dyMemory` | `lib/index.js:129-162`; `lib/sessions.js:202-238`; `lib/group-turn-memory.js:122`; `lib/group-digest.js:88` | `handoffBrief`/`publicBrief`/`saveGroupTurn`/`saveGroupTranscript` |
| `dyMedia` | `lib/index.js:191-210` | 媒体落盘 |
| `dyMail` | `lib/tools.js:97-126` | email 发送 |
| Android/宿主 | `/sdcard/DSHA` cwd、附件路径、proot/DSH web | Bridge 不直接调 Android API；依赖宿主文件/网络 |
| NapCat/OneBot | `lib/ws.js` `ws://127.0.0.1:3001/` | 生产连接；测试用 fake WS 替代 |

---

## 7. 第一轮实机测试链路追踪方法

1. **基线**：记录生产 PID/版本/profile/DB/日志时间；确认测试实例独立。
2. **连接**：fake WS 记录 Bridge 的 `get_login_info`/心跳；日志确认 `已连上`。
3. **注入**：按时间顺序发送 synthetic group/private 事件；每个事件带 nonce/message_id/group_id/user_id；记录发送序号。
4. **接收**：查测试 DB `channel_events`：`channel/kind/contact/sender_id/message_id/session_id/at`；确认 scope 和 sender。
5. **路由**：日志 `in:`/`已投递`/`队列`；确认 unified owner→home、group→group session、陌生私聊→private session。
6. **会话**：查 `channel_sessions` 和 agent `session.header`；确认 cwd、session_id、prev；确认没有跨 conversation。
7. **上下文**：在新会话首条触发 `contextBuilder`；断言只含当前 scope；群 `who` 不应是群号。
8. **重复/丢失**：同一 message_id 重放→0 重复投递；queue full/agent fail 后查 DB/replay 是否可补投（预期当前生产会丢失，作为缺陷）。
9. **发送**：只在 `observe`/`deliver`；fake WS 断言 `send_*` 0 次；`send` 模式仅限隔离测试且 fake WS 捕获。
10. **清理**：停测试实例、保留测试 DB/日志证据，不动生产。

---

## 8. 结论

### 当前生产

**BLOCKED**：

- 部署代码是 main `bffcabc`（562/562），不是 P0-1 修复分支 `3ae4c03`（565/565）；`buildSessionContext` 仍按 channel 全量、group fallback 不按 group_id、群 context 用群号当 `who`。
- `mode:send` + `unified:true`，无测试 mode/命名空间；测试消息进入真实 NapCat 可能触达真实用户。
- 无 `conversation_id`/`account_id`；session 由 Bridge `randomUUID`；`channel_sessions` 旧 key；`message.source` 无 sender/session。
- 先落库后投递 + 全局 message_id 去重，存在投递失败后无法补投的 P0/P1 丢失风险。
- 因此第一轮实机测试**不能**直接在生产链路进行。

### 隔离测试环境

**READY WITH CONDITIONS**：

- 使用目标 P0-1 分支 `3ae4c03` + 独立测试 profile/DB/cwd/端口 + fake OneBot WS + `mode:observe`（首轮）/`deliver`（测试 agent）；不接真实 QQ。
- 必须由负责人批准测试实例；不改生产配置；测试结束清理。
- 在此条件下可执行第一轮链路追踪；但生产部署仍需 P0-1 修复、Conversation ID/Host mint、测试隔离方案完成后另行授权。

**一句话**：生产链路 **BLOCKED**；隔离测试环境 **READY WITH CONDITIONS**。不得在当前生产 `mode:send` 下发送任何测试消息。

---

## 9. 证据索引

- 生产 profile：`/root/.dsh/profiles/web/cordis.patch.yml:164-178`
- 模式文件：`/root/.dsh/dsh-channel-bridge.json`（`{"mode":"send"}`）
- 生产源码：`/root/.dsh/plugin-src/dsh-channel-bridge`（0.18.0，与 main bffcabc 一致）
- 生产测试：`/tmp/prod-bridge-test.log`（562/562，exit 0）
- P0-1 测试：`/tmp/p01-verify`（565/565，exit 0）
- 生产日志：`/root/.dsh/dsh-channel-bridge.log`（连接/统计/对账）
- 只读 DB：`/root/.dsh/dsh-channel-bridge/bridge.db`（4850 events / 5 sessions / 4 contacts；群入站 196，空 sender 0，无 session 60）
- 生产 context 探针：私聊A+私聊B+群A 混入（见 §4.4）
- 生产 `recentInboundAsc({channel:'qq'})` 返回私聊A+群A（无 scope）
- 生产 handover 探针：群成员消息输出 `[主人]`（见 §4.4）


---

## 10. 未验证 / 未执行（归档补充）

以下均为 **NOT RUN**，不得标记 PASS：

- 独立 DSH 测试 profile/端口/DB/cwd 的实际启动；
- fake OneBot WS 的实际启动、事件注入、`send_*` 捕获；
- 真实 QQ/NapCat 入站/出站；本报告只读生产日志/DB，未连接真实渠道；
- 测试消息发送（生产 `mode:send` 下尤其禁止）；
- P0-1 目标分支 `3ae4c03` 的部署；当前生产仍是旧版 main；
- Host/DSH `sessionController`/Conversation ID 的运行期验证；
- Memory/Persona 端到端、Android 设备侧真实路径、生产 DB 写入、配置/部署/重启；
- 其他渠道同类字段丢失验证。

**安全边界**：本归档不构成部署、生产写入、权限变更、真实外发或实机测试授权。
