# Channel Bridge 专项接口评审报告

- 任务：`MEMORY-PERSONA-CHANNEL-INTERFACE-ARBITRATION-01`
- 角色：Channel Bridge 渠道接入与会话桥接专项负责人
- 审查性质：只读设计/接口评审；不修改业务源码、测试、schema、数据库、生产配置；不连接真实 QQ/NapCat；不发送消息；不部署/重启；不启动 Memory v6 / Persona v3 / EI-2A。
- 报告状态：**READY_FOR_REVIEW**
- 当前实现结论：会话身份 **PARTIAL**、speaker 传播 **PARTIAL / REJECT**、跨会话隔离 **REJECT**、标准输出接口 **NOT_IMPLEMENTED**
- 联合契约：**BLOCKED / NOT FROZEN**；本报告不构成契约冻结或实施授权
- 生成时间：2026-11-22（Asia/Shanghai）

---

## 0. 一句话结论

Channel Bridge 当前已经有事实上的稳定会话 key（`group:<gid>` / `private:<qq>`）和 `channel_sessions` 映射，能够跨运行时 session 复用同一私聊/群聊房间；但它没有把这套身份作为标准 `conversation_id` 输出给 Memory/Persona，投递体丢失了 `external_message_id`、`speaker_id`、`conversation_id`、`session_id`、`identity_evidence`，并且存在新会话上下文、群上下文兜底、群全文归档、交接卡四条跨会话/跨群混合路径。当前实现不能支撑契约 v1.1.1 的会话层与证据层要求。

---

## 1. 基线

| 对象 | 值 |
|---|---|
| Channel Bridge 仓库 | `ba-song/dsh-channel-bridge` |
| 分支 | `main` |
| HEAD | `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` |
| tree | `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| package | `dsh-channel-bridge@0.18.0` |
| 联合契约 | `ba-song/dsh-memory-core` 分支 `docs/memory-persona-contract-v1.1.1-owner-decisions` @ `006bb5bfce5d031b49a60271fe0406b228b43e00` |
| 契约 tree | `b460823bad5ce250d3360db8e59871a024335e6f` |
| 契约 blob | `10a62b64dff6219d00a1e25be09a39ddccb50e1a` |
| Memory 同版本 R2 报告 | commit `26fbd08e9ff413cf403c3899c2880658e73d4e87`；blob `9fcbe908ffd7b75c996c1e7d4daf19cb0c0ab08d` |
| Persona 同版本报告 | commit `4053341f9da5b30cf2469b280d80c2c86f208c08`；blob `17d1fc1e2a3fff891fa86092164d0cb203473916` |
| 生产 Bridge 源码 | `/root/.dsh/plugin-src/dsh-channel-bridge`；与 main HEAD 做 `diff -rq` 无差异 |
| 生产 profile | `channel-bridge`：`enabled:true`、`unified:true`、`mode:send`、`group.social.enabled:true`（只读核查，未改动） |
| Memory 参考基线 | `feat/m1-preference-memory` @ `7548e49ed0b8d8673818464325d8e72ec7704b27`；tree `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f`（引用 Memory R2 报告，不替 Memory 确认实现） |
| Persona 参考基线 | `main` @ `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；tree `ec05b3dec856f976881b6e6365188b9d92377ce9`（引用 Persona 报告，不替 Persona 确认实现） |

说明：本报告以 Channel Bridge main 为“当前实现”基线；Memory/Persona 的实现事实分别引用其同版本报告和代码，不替它们做实现承诺。

---

## 2. 检查范围与命令

### 2.1 代码范围

`lib/parse.js`、`lib/message.js`、`lib/sessions.js`、`lib/store.js`、`lib/context.js`、`lib/router.js`、`lib/prompt.js`、`lib/index.js`、`lib/unified.js`、`lib/group-buckets.js`、`lib/group-followup.js`、`lib/group-turn-memory.js`、`lib/group-digest.js`、`lib/forward.js`、`lib/quote.js`、`lib/notice.js`、`lib/tools.js`、`lib/config.js`、`lib/mode.js`、`lib/delivery.js`、`lib/dedupe.js`。

### 2.2 实际执行/复用的命令

| 命令 | 目录/对象 | 结果 |
|---|---|---|
| `git rev-parse HEAD` | `/tmp/cb-audit/bridge` | `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` |
| `git rev-parse HEAD^{tree}` | 同上 | `b0ed3ff989905be4b16d3a1579d16695f772389c` |
| `npm test` | 同上，Node v24.19.0 / npm 11.17.0 | **562 pass / 0 fail / 0 skip，exit 0**（fake transport；同一精确 HEAD 的只读 clone，本轮未重跑） |
| `diff -rq --exclude=.git --exclude=node_modules` | 生产 plugin-src vs main clone | 无差异 |
| 只读 `node:sqlite` 聚合 | 生产 `bridge.db` | 事件 4743 / 入站 1531 / 群入站 187 / 空 sender 0；sessions 5（`group:<gid>` 2、`private:<qq>` 1、旧式 `group`/`private` 2） |
| `/tmp/cb-audit/probe.mjs` | 临时内存 DB / 纯函数 | 复现跨会话上下文、跨群上下文、source 缺字段、unknown 回退、群缺 sender 退化群名、群归档 person_id 空 |
| 只读 profile 读取 | `/root/.dsh/profiles/web/cordis.patch.yml` | `enabled:true, unified:true, mode:send, group.social:true` |

说明：562/562 只证明该 HEAD 的现有测试通过，不证明契约 v1.1.1 合规，也不是真实 QQ/NapCat 验收。

---

## 3. 已验证事实（Channel Bridge 专项）

### 3.1 会话身份（对应任务 §4.1）

| # | 问题 | 当前事实 | 结论 |
|---|---|---|---|
| 1 | 是否已有稳定 conversation/chat ID？ | 没有名为 `conversation_id` 的字段/接口；事实上用 `(channel, kind)` 作为逻辑会话 key：`group:<群号>` / `private:<QQ号>`，存在 `channel_sessions`。`keyFor()` 在 `lib/sessions.js:119-124`。 | **PARTIAL**：de facto key 存在，但不是标准字段。 |
| 2 | 能否跨 runtime session 保持稳定？ | `channel_sessions` 以 `(channel, kind)` 为主键，保存 `session_id`/`prev_session_id`；`sessions.ensure()` 先缓存、再 live、再 resume、最后 create（`lib/sessions.js:367-508`）。同一 key 在数据库存续时可跨重启复用；轮换只改 `session_id`，key 不变。 | **PARTIAL**：DB 存续时稳定；DB 丢失/迁移/旧行/`unknown` 回退时不保证。 |
| 3 | 私聊和群聊如何区分？ | `kind` 前缀 + `channel_sessions.kind`；`parse` 的 `kind`/`chat_type` 由 OneBot `message_type` 得到；路由队列按 `channel|group:<id>` 或 `channel|private:<id>` 分串行。 | **PASS（结构上）**：私聊/群聊分房。 |
| 4 | 同一联系人多次启动 DSH 是否同一长期私聊 conversation？ | 是，只要 `channel_sessions` 行仍在：`getSession(channel, 'private:<qq>')` 命中后 resume/复用；resume 失败才新建 session，但 key 不变。 | **PARTIAL**：依赖 DB 与 key 规范化；无标准 `conversation_id` 导出。 |
| 5 | 同一个群多次启动是否同一群 conversation？ | 是，key=`group:<gid>`；同上。生产 DB 有 2 个 `group:<gid>` 行，说明多群并存。 | **PARTIAL**：依赖 DB；旧式 `group` 行与 `forceRotate` 有风险（§3.3）。 |
| 6 | runtime session_id 谁生成？ | 当前 **Bridge 自己生成**：`randomUUID()` 后传给 `agents.create({sessionId,...})`；见 `lib/sessions.js:259,287,481`。不是宿主先分配再告知 Bridge。 | **当前实现事实**；与“宿主/DSH 生成 runtime session_id”的候选契约不一致，需裁决。 |
| 7 | Bridge 能否提供 conversation_id ↔ session_id 映射？ | 能，内部 `channel_sessions(channel, kind -> session_id, prev_session_id)`；`store.updateEventSession()` 把 `message_id` 回填到 `channel_events.session_id`（`lib/store.js:229-236`）。但投递体不带这些字段。 | **内部具备，外部 NOT_IMPLEMENTED**。 |

#### 3.1.1 生产 DB 的旧式 session 行

生产 `channel_sessions` 有 5 行：`group:<gid>` 2 行、`private:<qq>` 1 行、旧式 `group` 1 行、旧式 `private` 1 行（只读聚合，不展示 ID）。当前正常消息用 `group:<gid>`/`private:<qq>`，旧行不会被新消息命中；但 `forceRotate` 在无精确 key 时会先查旧式 `group`/`private` 行，再按 `created_at` 取最新同类行（`lib/sessions.js:324-352`），可能换到旧房间或另一个群。工具 `dy_bridge_rotate` 只接收 `channel/kind`，不接收具体群号/QQ 号（`lib/tools.js:696-721`）。

#### 3.1.2 候选稳定 ID 格式（PROPOSAL，不修改现有 ID）

建议：

- `conversation_id = qq:<account_id>:private:<peer_id>`
- `conversation_id = qq:<account_id>:group:<gid>`

其中：

- `account_id`：接收消息的机器人/账号 ID（避免多账号串号）；
- `peer_id`：私聊对方平台 ID；
- `gid`：群号；
- 不使用昵称、群名、显示名、消息文本或随机数；
- owner 私聊仍然是 `qq:<account>:private:<owner_uin>`，不把 `home` 当 conversation_id；
- 群实体 ID `person:contact:qq:group:<gid>` 只表示群实体，不表示成员。

兼容现有代码的方式：

1. 保留现有 `(channel, kind)` 作为 legacy key；
2. 新增 `channel_conversations` / `channel_session_map`（候选，PROPOSAL），或在 `channel_sessions` 增加 `conversation_id` 列；
3. 迁移时把 `private:<qq>` 映射为 `qq:<account>:private:<qq>`，`group:<gid>` 映射为 `qq:<account>:group:<gid>`；
4. 旧式 `group`/`private` 行不猜测，标记 `legacy_unmapped`，不自动合并；
5. 新消息必须带 `conversation_id`；缺失时 fail-closed，不写入 `unknown` 房间。

### 3.2 消息 speaker（对应任务 §4.2）

| # | 问题 | 当前事实 | 结论 |
|---|---|---|---|
| 1 | 消息对象是否保留平台原始 sender ID？ | `parseMessageEvent` 保留 `senderId`（群/私聊）；`channel_events.sender_id` 落库。见 `lib/parse.js:160-220`、`lib/index.js:511-520`。 | **PARTIAL**：Bridge 内部有，投递体没有。 |
| 2 | QQ 私聊如何识别对方和 owner？ | `contactId=senderId`；`isOwner=owner.qqIds.includes(senderId)`；`unified` 只把 owner 私聊投 home（`lib/unified.js:12-20`）。 | **PARTIAL**：owner 依赖配置列表；无 canonical owner ID；列表缺失时 owner 会被当第三方。 |
| 3 | QQ 群是否同时保留 group ID 和 member ID？ | `contactId=group_id`、`senderId=user_id`，二者都在 parsed/DB；但 prompt、group bucket、group-turn memory、transcript 只保留发言人显示名，不保留 member ID。 | **PARTIAL / REJECT（下游传播）**。 |
| 4 | 是否存在昵称/显示名/群名片替代真实 ID？ | 是：群 prompt 只显示 `senderName`（`lib/prompt.js:75-84`）；group bucket 只存 `{speaker,text,at}`（`lib/group-buckets.js:31-35`）；group-turn 只把 `speaker` 字符串交 Memory（`lib/group-turn-memory.js:92-126`）；transcript 只写 `speakerName`（Memory `lib/service.js:550-575`）。 | **REJECT（接口层）**：真实 ID 未传到 Memory/Persona。 |
| 5 | 无法识别成员时能否明确输出 unknown？ | 不能。群解析不校验 `senderId`；为空仍返回群消息；index 的 speaker fallback 为 `senderName || contactName || senderId`，缺 sender 时会退化成群名。探针：`senderId=''`、`speaker-fallback='测试群'`。见 `lib/parse.js:169-173,199-218`、`lib/index.js:547,566`。 | **REJECT**：没有 `speaker_type=unknown`，且可能把群名当发言人。 |
| 6 | 转发/引用/机器人/系统通知如何区分原始 speaker？ | 转发：`nodeFromItem` 保留 `senderId`，但 `formatForward` 只显示 `senderName`，prompt 只用 `forward.text`（`lib/forward.js:60-100,180-195`）。引用：`quote` 保留 `senderId`，`formatQuote` 只显示 `senderName`（`lib/quote.js:20-35,100-130`）。机器人：`parse` 只过滤 `user_id===self_id`，没有 bot 标记。系统通知：`parseNoticeEvent` 有 `userId/operatorId/targetId`，`handleNotice` 只把 `senderId=n.userId`、`senderName=n.userId` 投递，`operatorId` 未传；`parsed.notice=true` 不在投递 source 中（`lib/notice.js:78-140`、`lib/index.js:391-448`）。 | **PARTIAL**：内部字段部分存在；投递层把转发/引用降成文本，通知的 actor/operator 丢失。 |

#### 3.2.1 统一消息头建议（PROPOSAL）

```json
{
  "platform": "qq",
  "account_id": "<receiving account id>",
  "conversation_id": "qq:<account_id>:private:<peer_id> | qq:<account_id>:group:<gid>",
  "runtime_session_id": "<DSH session uuid>",
  "chat_type": "private | group",
  "group_id": "<gid> | null",
  "speaker_id": "<platform user id> | null",
  "speaker_type": "owner | third_party | unknown",
  "speaker_evidence": {
    "source": "onebot_v11",
    "raw_sender": {"user_id": "<id>", "nickname": "<snapshot>", "card": "<snapshot>"},
    "missing_fields": [],
    "confidence": "strong | partial | none"
  },
  "message_id": "<external message id>",
  "event_time": 0,
  "received_at": 0,
  "message_kind": "message | notice | forward | quote",
  "actor_id": "<notice actor> | null",
  "operator_id": "<notice operator> | null",
  "target_id": "<notice target> | null",
  "forward_nodes": [{"sender_id": "<id> | null", "sender_name": "<snapshot>", "text": "<text>"}],
  "quote": {"message_id": "<id>", "sender_id": "<id> | null", "sender_name": "<snapshot>", "text": "<text>"},
  "source": {"transport": "onebot_v11", "provider": "napcat", "raw_event_hash": "sha256:..."},
  "message_content_ref": "<bridge event id / raw archive ref>"
}
```

兼容方式：

- 不删除现有 `source.channel/contact/contactKind/contactId/contactName/messageKind/at`；新字段作为 `source` 的可选扩展；
- 旧消费者忽略未知字段；新消费者优先读新字段，缺失时只能落到 `unknown`，不能从昵称/群名反推 ID；
- `speaker_id` 是平台原始 ID，不是 canonical `person:*`；canonical 映射由 Memory 负责；
- `speaker_type` 是 Bridge 的**临时分类**（owner 仅当配置的 owner 列表命中），最终由 Persona/Memory 的证据链确认；Bridge 不把它当最终身份；
- `account_id` 缺失时不得用空串冒充；标记 `null`/unknown，并阻断需要账号隔离的写入。

### 3.3 会话隔离与 digest（对应任务 §4.3）

#### 3.3.1 已确认的跨会话路径

| 路径 | 代码事实 | 探针/影响 |
|---|---|---|
| 新会话上下文 | `buildSessionContext` 调 `store.recentInboundAsc({channel,limit})`，SQL 只按 `channel` + `direction='in'`，没有 contact/kind/conversation 过滤；`router` 的 `contextBuilder` 不接收当前 `parsed`。见 `lib/context.js:8-36`、`lib/store.js:330-339`、`lib/index.js:263`。 | 临时内存库写入私聊 A、私聊 B、群 C 各一条，输出三条全部注入新会话。P0。 |
| 群上下文兜底 | `getGroupContext` fallback 用 `recentInboundAsc({channel:'qq'})`，仅 `filter(kind==='group')`，没有 `groupId`；见 `lib/index.js:287-290`、`lib/group-followup.js:146-159`。 | 群 A + 群 B 两条，fallback 同时输出。P1/P0 视触发频率。 |
| 群全文归档 | `groupDigest.save` → `dyMemory.saveGroupTranscript`；`saveGroupTranscript` 用共享 `GROUP_CWD=/sdcard/DSHA/渠道/qq-群`，`source` 无 `groupId`/`speakerId`；`personOfUser` 在未配 `ownerQQ` 时返回空，已配 `ownerQQ` 时因 `/渠道/qq` 兜底返回 `person:owner`；`dy_memory_group_archive` 按 `cwd=GROUP_CWD` + `raw_text LIKE %gid%` 查询，正文不含群号。见 `lib/group-digest.js:61-88`、Memory `lib/group/digest.js:2`、`lib/service.js:550-575`、`lib/ingest/archive.js:271-295`、Memory `lib/index.js:776-792`。 | 探针：无 groupId/无 ownerQQ → `''`；有 groupId → 群实体 ID；有 ownerQQ → `person:owner`。按群查询通常找不到；不传 groupId 会跨群返回。P0。 |
| owner unified | `shouldRouteToHome` 对 `ownerIds` 全部返回 true；所有 owner QQ 私聊进同一个 home。见 `lib/unified.js:12-20`。 | 当前生产只配置一个 owner，未实际发生；多 owner 会共享 home。P2/P1 设计风险。 |
| Memory 跨渠道 digest | Memory 报告指出 `buildDigest` 合入 home + 全部 QQ 私聊 + 群 + email，owner 会话注入；本报告不替 Memory 结论，但把它列为 P0-B 的跨模块路径。 | 见 Memory R2 §6/§11；需 Memory 修复。 |

#### 3.3.2 本轮补充发现（Channel Bridge 侧新增证据）

| # | 事实 | 位置 | 影响/严重度 |
|---|---|---|---|
| N-1 | `keyFor` 的 ID 处理是**剥字符**而非拒绝：`private:'12a34'` → `private:1234`，与真正的 `1234` 碰撞 | `lib/sessions.js:122`；探针输出 | P1：不同外部 ID 可合并进同一会话 |
| N-2 | `clearHandoff` 调用传 `p.kind`（`group`/`private`），表里存的是 `group:<gid>`/`private:<qq>` → 对新式行永不清理 | `lib/router.js:141`；`lib/store.js:406-410`；探针：`clearHandoff(kind=group)` 后 `handoff_text` 仍为「交接卡正文」 | P1：交接卡重复注入；DB 残留 |
| N-3 | `status` 用 `getSession('qq','private'/'group')` 取会话，新式行永远 `null` | `lib/status.js:96-97`；探针：`getSession('qq','private')=null`、`getSession('qq','group')=null` | P2：诊断状态失真 |
| N-4 | 交接卡数据源 `listInboundSince({channel})` 按渠道全量取入站，无 contact/kind/conversation 过滤；`formatHandover` 把所有 user 行标成「主人」 | `lib/handover.js:186-196,143-152`；`lib/store.js:293-305` | **P0**：owner home 首次交接会把第三方私聊/群成员消息混入并标成主人 |
| N-5 | notice 被转成一条 message：`senderId=n.userId`、`senderName=n.userId`（QQ 号当名字）、`messageId=''`、正文 `[系统]…`；`operatorId` 未传，撤回类 actor/operator 不区分；`parsed.notice=true` 不在投递 source | `lib/index.js:398-447`；`lib/notice.js:78-135` | P1：系统事件 speaker/actor 失真，下游无法区分通知与普通消息 |
| N-6 | `channel_events` 无 `account_id` 列；`session_id` 只在投递成功后按 `message_id` 回填，排队/失败时长期为空 | `lib/store.js:25-38,230-242`；`lib/router.js:178-180` | P1：多账号无法隔离；未投递消息没有 session 映射 |
| N-7 | Memory 群全文归档用昵称正则 `/汐|自己/` 判定 self；昵称含「汐/自己」的群友会被归档成 self | Memory `lib/service.js:566` | P1：群成员原话被误标 self（跨模块，供 Memory 修复） |
| N-8 | Memory `personOfUser` 在 `ownerQQ` 已配时，对共享 `GROUP_CWD` 命中 `/渠道/qq` 兜底，返回 `person:owner`；未配时返回空 | Memory `lib/ingest/archive.js:271-295`；探针：未配 `''`、已配 `person:owner` | **P0**：群原话可能被归给主人；需 Memory 修复 |


#### 3.3.3 当前 `channel_events`/`channel_sessions` 能提供的隔离基础

- `channel_events` 有 `channel/kind/contact/sender_id/direction/text/message_id/session_id`，但查询接口 `recentInboundAsc` 只按 channel；
- `channel_sessions` 有 `(channel, kind) -> session_id/prev_session_id`，但 `contextBuilder`、`groupContext` fallback、group archive 都没有使用这个 key；
- `group-buckets` 按 `group:<gid>` 分 map，但只存显示名，不存 member ID；
- `groupDigest` 的 `groupId` 进入函数，但写入 Memory 时没有作为 `source.groupId` 传递；
- `channel_events.session_id` 只在投递成功后按 message_id 回填；它没有进入投递体，也没有被用于上下文过滤。

#### 3.3.4 A. 原始会话隔离方案（PROPOSAL）

1. 每条原始消息写入 `channel_events` 时强制带 `conversation_id`、`chat_type`、`group_id`、`speaker_id`、`message_id`、`runtime_session_id`；
2. `contextBuilder` 改为 `buildSessionContext({conversationId, kind, limit})`，SQL 必须 `WHERE channel=? AND conversation_id=? AND kind=?`；无 `conversation_id` 返回空，不按 channel 兜底；
3. `groupContext` fallback 必须 `WHERE group_id=?`；拿不到就返回空，不跨群；
4. `groupDigest`/`saveGroupTranscript` 按 `group_id` 分目录或写 `group_id` 列；`source` 带 `groupId`/`speakerId`；查询按 `group_id`，不按正文 LIKE；
5. owner/home 如果继续共享 runtime session，必须把 home 的上下文按 `conversation_id` 分区；没有分区就不允许把其他私聊原文注入 home；
6. 旧式 `group`/`private` 行标记 legacy，不参与新上下文；不自动迁移/合并。

#### 3.3.5 B. 跨会话长期记忆检索方案（PROPOSAL）

- 由 Memory 负责：按 `subject/experiencer/validity/authorization` 检索长期记忆；
- 检索结果必须带 `conversation_id`、`source_message_id`、`evidence`、`visibility`；
- 返回给会话的是**记忆条目/摘要**，不是原始聊天全文；
- Channel Bridge 只提供 `conversation_id`/来源，不直接查 Memory 长期记忆；
- 跨会话检索不等于跨会话原文注入；默认不把 A 私聊原文交给 B 私聊。

#### 3.3.6 C. 跨会话摘要共享方案（PROPOSAL）

- 允许：同一主体/同一群实体/owner 明确授权的摘要，带来源、时间、scope、审计；
- 禁止：原始对话全文跨私聊/跨群无条件共享；
- 摘要由 Memory 生成（跨会话长期摘要）或 Channel Bridge 生成**会话内本地 digest**；两者必须分开命名/存储；
- 每条摘要带 `source_conversation_ids[]`、`subject_id`、`scope`、`redaction`、`created_by`、`purpose`、`expires_at`；
- owner 会话只接收 owner 授权的摘要，不自动接收所有渠道原文。

#### 3.3.7 D. 允许共享的主体、权限、来源和审计条件（PROPOSAL）

| 条件 | 要求 |
|---|---|
| 主体 | 仅同一 canonical subject（self/owner/third_party）或群实体；跨主体共享必须显式授权 |
| 权限 | owner 明确授权；群成员/第三方默认不跨群；群实体不自动代表成员 |
| 来源 | 必须保留 `conversation_id`、`message_id`、`source`、`evidence_source` |
| 范围 | 摘要/记忆条目，不是原始全文；默认 TTL + 可撤回 |
| 审计 | 共享动作记录谁、何时、为什么、读了哪些 conversation、注入了哪个 session |
| 失败 | 缺来源/缺授权/缺主体 → fail-closed，不降级为“全部可见” |

### 3.4 当前输出接口缺口（对应任务 §4.4）

`buildChannelMessage` 的 `source` 当前仅：

```js
source: {
  kind: 'user',
  channel, contact, contactKind, contactId, contactName,
  messageKind, at
}
```

见 `lib/message.js:10-38`。

| 契约候选字段 | 当前是否存在 | 说明 |
|---|---|---|
| `platform` | 部分（`channel:'qq'`） | 没有独立 `platform` 字段 |
| `account_id` | 否 | 只有 `selfId` 配置/`get_login_info`，未进 source |
| `conversation_id` | 否 | 内部 `(channel,kind)` 未导出 |
| `runtime_session_id` | 否 | 只在 bridge DB/日志 |
| `chat_type` | 部分（`contactKind/messageKind`） | 命名不统一 |
| `group_id` | 部分（`contact`=群号） | 没有 `group_id` 命名 |
| `speaker_id` | 否 | 内部有 `senderId`，source 不带 |
| `speaker_evidence` | 否 | 无 |
| `message_id` | 否 | 内部 `parsed.messageId`，source 不带 |
| `event_time` | 是（`at`） | 名称不同 |
| `source` | 部分（`channel/contact`） | 无 transport/provider/raw hash |
| `message_content_reference` | 否 | 无 |
| `identity_evidence` | 否 | 无 |

结论：**当前标准输出接口 NOT_IMPLEMENTED**；只有内部字段，没有给 Memory/Persona 的稳定信封。

---

## 4. 建议的标准输出接口（PROPOSAL）

### 4.1 字段责任表

| 字段 | 原始渠道事实 | Bridge 推导 | 需 Persona 验证 | 由 Memory 保存 | 缺失时 |
|---|---|---|---|---|---|
| `platform` | 是 | 否 | 否 | 是（provenance） | fail-closed（未知平台不投） |
| `account_id` | 是（登录账号） | 否 | 否 | 是 | unknown；需账号隔离的写入 fail-closed |
| `conversation_id` | 否 | 是（平台+账号+chat_type+peer/group） | 否 | 是 | fail-closed，不建 unknown 房间 |
| `runtime_session_id` | 否 | 否（宿主/DSH 生成） | 否 | 是 | 可空；无则不能绑定 self |
| `chat_type` | 是 | 否 | 否 | 是 | fail-closed |
| `group_id` | 是（群） | 否 | 否 | 是 | 群聊缺失 → fail-closed/unknown；私聊 null |
| `speaker_id` | 是（平台 user id） | 否 | 自/owner 需 Persona 证据 | 是（canonical 映射） | unknown；不得用群 ID/群名代替 |
| `speaker_type` | 否 | 临时分类（owner 配置命中） | 自/owner 最终验证 | 是 | unknown |
| `speaker_evidence` | 是（原始 sender 字段/哈希） | 是（缺失字段/置信） | 否 | 是（引用） | 空证据 → unknown |
| `message_id` | 是 | 否 | 否 | 是 | 可空但不可去重；标记 unknown |
| `event_time` | 是 | 否 | 否 | 是 | 保留 unknown/0，不伪造 |
| `source` | 是（transport/provider） | 是（raw hash） | 否 | 是 | fail-closed（无来源不写长期记忆） |
| `message_content_reference` | 否 | 是（bridge event id） | 否 | 是（引用） | 可空；不可回溯则标 unknown |
| `identity_evidence` | 否 | 否 | 是（Persona） | 是（引用） | self/owner 写入 fail-closed |

### 4.2 禁止下游覆盖

- Bridge 不得覆盖 Persona 的 canonical self ID；
- Memory 不得覆盖 Bridge 的 `external_message_id`/`source`；
- Persona 不得覆盖 Memory 的 `speaker_id`/`experiencer_*`/evidence；
- 下游不得把 `unknown` 静默替换成 owner/self/群名；
- 下游不得把昵称/群名片当 `speaker_id`。

---

## 5. RACI 建议（PROPOSAL，待三方确认）

> 说明：R=执行/写入，A=最终负责，C=被咨询，I=被告知；“唯一写入方”是数据/事实的唯一持久化方。A 可以是项目负责人（跨系统决策），但写入方仍必须唯一。

| # | 事项 | R | A | C | I | 唯一写入方 |
|---|---|---|---|---|---|---|
| 1 | `conversation_id` 生成 | Channel Bridge | Channel Bridge | Persona, Memory | Owner, GPT | Channel Bridge |
| 2 | runtime `session_id` 生成 | Host/DSH | Host/DSH | Channel Bridge, Persona | Memory | Host/DSH（当前 Bridge 代生成，需改） |
| 3 | conversation ↔ session 映射 | Channel Bridge | Channel Bridge | Persona, Memory | Owner | Channel Bridge |
| 4 | `speaker_id` 生成（canonical） | Memory | Memory | Channel Bridge, Persona | Owner | Memory |
| 5 | `speaker_id` 验证 | Memory | Memory | Persona, Channel Bridge | Owner | 无（验证） |
| 6 | self ID 验证 | Persona | Persona | Memory | Channel Bridge | Persona（identity evidence） |
| 7 | owner ID 验证 | Persona（验证） | Owner（D1 决策） | Memory, Channel Bridge | GPT | Memory（`person:owner` canonical 映射）；Persona 只产出 identity evidence；D1 前不写 |
| 8 | third_party ID 管理 | Memory | Memory | Channel Bridge, Persona | Owner | Memory |
| 9 | experiencer 判断 | Memory | Memory | Persona, Channel Bridge | Owner | Memory |
| 10 | `experiencer_evidence` 产生 | Memory | Memory | Persona, Channel Bridge | Owner | Memory（引用 Persona identity evidence） |
| 11 | evidence 保存 | Memory | Memory | Persona, Channel Bridge | Owner | Memory（memory evidence）；identity evidence 由 Persona 单独保存，不重叠 |
| 12 | `session_bindings` 写入 | Persona | Persona | Channel Bridge, Memory | Owner | Persona |
| 13 | binding 验证 | Persona | Persona | Memory, Channel Bridge | Owner | 无（验证） |
| 14 | digest 构建（会话内） | Channel Bridge | Channel Bridge | Memory, Persona | Owner | Channel Bridge |
| 15 | 跨会话检索 | Memory | Memory | Persona, Channel Bridge | Owner | 无（只读） |
| 16 | 跨会话注入 | Persona | Persona | Memory, Channel Bridge | Owner | 无（只注入，不写源数据） |
| 17 | `validityState` 判断 | Memory | Memory | Persona, Channel Bridge | Owner | Memory |
| 18 | 记忆补全审计 | Memory | Memory | Persona, Channel Bridge | Owner | Memory |

冲突说明：

- **owner ID 归属未达成三方一致**：Memory R2 建议 owner people 映射由 Memory 管理；本报告建议 owner **身份验证**由 Persona 负责、`person:owner` 的 canonical 映射由 Memory 保存。两者不必然冲突，但必须明确「谁唯一写 `person:owner`」；当前建议 writer=Memory，Persona 只产出身份证据，Bridge 只提供 `owner.qqIds` 命中事实。该分歧列为所有者裁决项，不在本报告强行统一。
- 当前 Persona `inject.writeBinding` 在 Persona 侧写 binding；Channel Bridge 只提供 conversation/session；本表把 binding 唯一写入权给 Persona，避免两方各写一套主体事实。Bridge 不得写 Persona DB。
- 当前 Bridge 自己 `randomUUID()` 生成 session_id；本表建议改由 Host/DSH 生成，Bridge 只记录映射。若 Host 不能提供，需在契约中显式保留 Bridge 生成并登记为受信任来源。
- `owner ID 验证` 的 A 是 Owner，因为 D1 未决；Persona 只能在 D1 确认后执行校验，不能自造 `person:owner`。
- `digest` 拆成“会话内本地 digest”（Bridge）与“跨会话摘要/长期记忆”（Memory）；后者归 Memory，不在本行重复。

---

## 6. 错误语义建议（PROPOSAL）

| 错误码 | 触发 | 归属 | 行为 |
|---|---|---|---|
| `E_SELF_IDENTITY_MISSING` | Persona 无有效 self；self 行缺失 | Persona | **fail-closed**：拒绝 self episode/self 身份写入；不得返回/写入 `self:unknown` |
| `E_SELF_IDENTITY_INVALID` | 非 `self:<uuid>`、非法 UUID、`self:`、`abc` | Persona | **fail-closed** |
| `E_SELF_MULTIPLE_ACTIVE` | 多个 active self | Persona | **fail-closed**；不降级 sentinel |
| `E_SPEAKER_UNKNOWN` | 群成员 ID 缺失/不可信 | Bridge/Memory | 可降级 `unknown`；不得用群 ID/群名代替；self/owner 写入 fail-closed |
| `E_EXPERIENCER_UNKNOWN` | 证据不足 | Memory | 可存 `unknown`；不得自动提升为 self/owner；重要决策不得单独使用 |
| `E_EVIDENCE_INVALID` | 证据格式/来源/完整性不合法 | Memory/Persona | **fail-closed** 对该证据；不得把无效证据升级为 confirmed |
| `E_CONVERSATION_MAPPING_MISSING` | 无 `conversation_id`/映射冲突 | Channel Bridge | **fail-closed** 投递/写入；不建 `unknown` 房间 |
| `E_SESSION_BINDING_CONFLICT` | binding 的 persona_id/self/conversation 冲突 | Persona | **fail-closed** self 写入；非 self 可降级 unknown |
| `E_BINDING_EXPIRED` | binding 过期/解绑/失效 | Persona | self 写入 **fail-closed**；只读查询降级 unknown |
| `E_CROSS_SESSION_ACCESS_DENIED` | 跨会话读取/注入未授权 | Memory/Persona | **fail-closed** |
| `E_SOURCE_DUPLICATED` | 同一来源重复引用/重复消息 | Memory/Channel Bridge | 幂等跳过；不视为错误、不提升可信度 |
| `E_VALIDITY_CONFLICT` | VALID/INVALID/UNCERTAIN 冲突 | Memory | 标记 uncertain/disputed；不进入 current 注入；不得静默选一个 |
| `E_MIGRATION_VALIDATION_FAILED` | 迁移校验失败 | Memory/Persona | **fail-closed**，整体回滚，version 不前进 |

兼容映射：

- 现有 `E_PERSONA_UNAVAILABLE` → 对 self 写入映射为 `E_SELF_IDENTITY_MISSING`，保留原码用于兼容；
- 现有 `E_SCHEMA_MIGRATION_INCOMPLETE` → 对外统一映射为 `E_MIGRATION_VALIDATION_FAILED`；
- 现有 `E_PERMISSION` → 跨会话/跨主体拒绝时映射为 `E_CROSS_SESSION_ACCESS_DENIED`；
- 不删除旧错误码；新增码作为契约 v1.1.x 的候选。

---

## 7. 兼容、版本与迁移（PROPOSAL）

| 项 | 建议 |
|---|---|
| `contract_version` | 当前 `v1.1.1-draft`；正式版本由所有者冻结，不由本报告冻结 |
| `evidence_version` | `1`（候选）；三维枚举/关系版本化 |
| `conversation identity version` | `1`（候选）；格式 `qq:<account>:private|group:<id>` |
| `session binding version` | `1`（候选）；字段/写入方待所有者 |
| `migration version` | Memory v6 / Persona v3（候选）；均 NOT_STARTED，本报告不授权 |
| cutover | 未确定；由所有者决定；不得写具体日期 |
| legacy 解释 | 旧记录原文保留；缺字段 → `unknown`/`legacy`；不整体排除；不编造 |
| 回滚 | 单事务、version-last、快照/计数；Bridge 侧双读/feature flag；不覆盖原文 |
| 兼容策略 | Bridge 同时输出旧 `source` 字段与新信封；新消费者缺新字段时只能 unknown；旧消费者忽略新字段 |

---

## 8. P0-A / P0-B 专项

### 8.1 P0-A：群成员 speaker 错误归属

**当前数据流（事实）**

1. OneBot 群事件：`group_id`、`user_id`、`sender.card/nickname`。
2. `parseMessageEvent`：`contactId=group_id`、`senderId=user_id`；不校验 `senderId` 非空（`lib/parse.js:199-218`）。
3. `channel_events`：`contact=群号`、`sender_id=成员号`（有值时）。
4. `buildChannelPrompt`：`[QQ·群·群名(群号)] 昵称：正文`，只显示昵称（`lib/prompt.js:75-84`）。
5. `group-buckets`：`{speaker: senderName, text, at}`，无 member ID（`lib/group-buckets.js:31-35`）。
6. `group-turn-memory` → `saveGroupTurn`：`incoming[{speaker: 昵称, text}]`；Memory `buildGroupTurn` 拼 `昵称：text`，无 `speaker_id`（`lib/group-turn-memory.js:92-126`、Memory `lib/group/turn.js:49-76`）。
7. `groupDigest` → `saveGroupTranscript`：`source.speakerName`，无 `groupId`/`speakerId`；`person_id` 探针：未配 ownerQQ 为空，已配 ownerQQ 为 `person:owner`（Memory `lib/service.js:550-575`、`lib/ingest/archive.js:271-295`）。
8. 缺 `user_id` 时：`senderId=''`、`senderName=''`，index fallback 为群名（探针 `speaker-fallback='测试群'`）。
9. Memory 归档角色用昵称正则 `/汐|自己/` 判定 self：昵称含「汐/自己」的群友会被归档成 self（Memory `lib/service.js:566`）。

**风险**

- 群实体（`person:contact:qq:group:<gid>`）可能被当作“发言人/经历主体”；
- 群名/昵称可能被当成员 ID；
- 同名成员无法区分；
- Memory 的 `speaker_id`/`experiencer` 无法从 Bridge 输入可靠生成。

**修复设计（PROPOSAL）**

- Bridge 统一输出 `group_id` + `speaker_id`（平台 user id，可为 null）+ `speaker_evidence`；
- 群聊缺 `user_id`：`speaker_id=null`、`speaker_type=unknown`、`speaker_name=''`；**禁止** fallback 到群名/群号；
- prompt 群标签带 `speaker_id` 或 `unknown` 标记（展示可脱敏，但内部字段保留）；
- group bucket / group-turn memory 增加 `speakerId`；
- Memory `saveGroupTurn` 接收 `speakerId`，写入 `speaker_id`；群实体只写 `scope_id`/`group_id`，不作为 speaker；
- group transcript `source` 带 `groupId`/`speakerId`；`person_id` 由 Memory 按 group_id/member id 生成，不从 cwd 猜。

**防回归测试**

1. 群 A 成员甲发言 → `speaker_id=甲`、`speaker_type=third_party`、`group_id=A`；`experiencer` 不得是群实体。
2. 群 A 成员乙发言 → 甲/乙分开；同名不同 ID 不合并。
3. 群事件缺 `user_id` → `speaker_id=null`、`speaker_type=unknown`；不得出现群名/群号作为 speaker。
4. 群 A/B 同成员 ID → 仍按群 conversation 隔离；不得跨群合并经历。
5. 群实体 ID 只出现在 `group_id`/scope，不出现在 `speaker_id`。
6. 记录/归档回读：`person:contact:qq:group:<gid>` 只表示群实体；成员 ID 可追溯。
7. 昵称含「汐/自己」的群友 → 归档 role 仍为 user，不得变 self。
8. `ownerQQ` 已配 + 群归档 → `person_id` 为群实体/成员，不得为 `person:owner`。

### 8.2 P0-B：digest / 上下文跨会话原文注入

**已确认路径**

1. **新会话上下文**：`buildSessionContext` 只按 channel（`lib/context.js:8-36`、`lib/store.js:330-339`、`lib/index.js:263`）。探针：私聊 A/B + 群 C 三条全部进入新会话。
2. **群上下文兜底**：`getGroupContext` fallback 只按 kind=group（`lib/index.js:287-290`、`lib/group-followup.js:146-159`）。探针：群 A + 群 B 两条全部输出。
3. **群全文归档**：共享 `GROUP_CWD`、无 `groupId`/`speakerId`；`person_id` 未配 ownerQQ 为空、已配 ownerQQ 为 `person:owner`；按群查询依赖 `raw_text LIKE %gid%`（Memory `lib/service.js:550-575`、`lib/group/digest.js:2`、`Memory lib/index.js:776-792`）。
4. **交接卡**：`listInboundSince({channel})` 按渠道全量取入站，无 contact/kind/conversation 过滤；`formatHandover` 把所有 user 行标成「主人」（`lib/handover.js:186-196,143-152`、`lib/store.js:293-305`）。owner home 首次交接会把第三方私聊/群成员消息混入并标成主人。
5. **owner unified**：所有 owner QQ 私聊进 home（`lib/unified.js:12-20`）；多 owner 会共享。
6. **Memory 跨渠道 digest**：Memory 报告指出 `buildDigest` 合入 home+QQ 私聊+群+email（Memory R2 §6/§11）；这是 Memory 侧路径，需 Memory 修复，但属于 P0-B 的跨模块风险。

**禁止条件（PROPOSAL）**

- 禁止无 `conversation_id` 的上下文注入；
- 禁止按 `channel` 全量取最近消息作为任意新会话的“上次聊到”；
- 禁止按 `kind=group` 取所有群的最新消息作为群上下文；
- 禁止共享 `GROUP_CWD` 作为所有群的归档 cwd；
- 禁止按 channel 全量生成交接卡；交接卡必须按 conversation 生成，user 行标签由 speaker_type 决定，未确认写「未知发言人」；
- 禁止把 A 私聊/群原文注入 B 私聊/群，除非有明确 owner 授权、摘要化、审计、TTL；
- owner/home 也不得无条件接收所有渠道原文。

**授权条件（PROPOSAL）**

- `conversation_id` 精确匹配，或 Memory 按 subject/validity/authorization 返回摘要；
- 共享主体、来源、范围、目的、审计、TTL 全部记录；
- 缺任一条件 → fail-closed，不降级为“全部可见”。

**测试矩阵**

| 用例 | 期望 |
|---|---|
| 新私聊 A 会话 | 只含 A 的历史；不含 B/群 |
| 新私聊 B 会话 | 只含 B 的历史；不含 A/群 |
| 新群 A 会话 | 只含群 A 的上下文；不含群 B/私聊 |
| 群 A @ 触发、群 B 同时有消息 | 群 A 只拿 A；fallback 不跨群 |
| owner home | 只含 owner 授权摘要；不含其他私聊原文 |
| 交接卡 | 只含 owner 私聊；第三方/群消息为 0；无「主人」误标 |
| 缺 conversation_id | 不注入，返回 `E_CONVERSATION_MAPPING_MISSING` |
| 缺 group_id | 群上下文为空/unknown，不跨群 |
| 旧式 session 行 | 标记 legacy，不参与新上下文 |

---

## 9. 对其他两方的问题

### 9.1 对 Memory

1. canonical `speaker_id` 是否统一为 `person:contact:<platform>:<external_id>`？群实体是否只作为 `scope_id`/`group_id`，永不进入 `speaker_id`？
2. `experiencer` 由 Memory 判断时，self/owner 的最终依据是否只接受 Persona 的 identity evidence？third_party 的默认是否 `unknown`？
3. `experiencer_evidence` 是否接受 Bridge 的 `source_metadata`/`identity_evidence` 引用？Memory 是否建立独立 evidence 表，禁止 PATCH？
4. 群全文归档是否改为 `group_id` 分区/列？`dy_memory_group_archive` 是否改为按 `group_id` 查询，不再 `raw_text LIKE`？
5. Memory 是否继续允许 Bridge 直接调用 `saveGroupTurn`/`saveGroupTranscript`？若允许，是否视为受控 Memory 入口并记录责任？若不允许，Bridge 只提交标准信封，由 Memory 决定写不写。
6. `validityState` 的统一 helper/SQL 是否覆盖 R2 §5 全部 13 个入口？是否接受 `conversation_id`/`session_id` 作为 provenance，而不作为 validity 条件？

### 9.2 对 Persona

1. `identityOf(header)` 的输入是否包含 `conversation_id`、`chat_type`、`session_id`、`speaker_id`、`speaker_type`、`identity_evidence`？输出是否包含 `self_id`、`subject_type/id`、`source`、`issued_at`、`valid`、`reason`？
2. `bindingOf(session_id)` 是否强制 `persona_id===selfId()`、`status=active`、`conversation_id` 匹配、evidence 未过期？失败是否 `E_SESSION_BINDING_CONFLICT`/`E_BINDING_EXPIRED`？
3. `session_bindings` 是否由 Persona 唯一写入？Bridge 只提供 conversation/session/chat_type/speaker 证据，不写 Persona DB；是否同意？
4. 群聊是否不写 `session_bindings`，或写 `subject_type=third_party`/`group_id`？群成员身份是否会进入 Persona，还是留给 Memory？
5. `selfId()` 是否改为返回 canonical 或 null，并禁止 `self:unknown`/`ensureSelf` 自动创建？与 Memory `addEpisode` 的错误码如何对齐？
6. owner canonical ID D1 未决前，Persona 是否拒绝 owner episode 写入（fail-closed），而不是回退 self/owner 猜测？

### 9.3 对 GPT / 项目负责人

1. conversation_id 的最终格式是否接受 `qq:<account>:private|group:<id>`？是否要求 account_id 进入？
2. runtime session_id 由 Host/DSH 生成，还是保留 Bridge 生成并登记为受信任来源？
3. owner/home 是否允许一个 runtime session 承载多个 owner 私聊？若允许，是否强制按 conversation_id 分区？
4. 群成员无稳定 ID 时，是否允许 `speaker_id=null`/`speaker_type=unknown` 继续写入 group episode？还是必须阻断？
5. Bridge 是否继续直接写群记忆，还是只提供信封、由 Memory 写？

---

## 10. 需要所有者裁决的事项（不得自行决定）

1. D1：owner canonical ID；owner episode 写入策略。
2. `role_only` 身份写入策略。
3. 跨平台账号合并策略（默认按平台/账号隔离）。
4. 历史 cutover 时间/版本；legacy 时间近似规则。
5. `session_bindings` 最终字段与唯一写入方。
6. Channel Bridge 与 Persona 的最终主体验证协议（identityOf 输入/输出/错误）。
7. conversation_id 最终格式与 account_id 是否必填。
8. runtime session_id 的最终生成方（Host/DSH vs Bridge）。
9. owner/home 是否允许承载多个 owner 私聊，以及分区/审计规则。
10. 群成员 ID 不可用时的补录/合并策略；是否允许 unknown 写 group episode。
11. `experiencer_evidence` 物理存储、可信生成、不可 PATCH 机制。
12. 三维证据的最终字段名/枚举/旧 numeric confidence 映射。
13. 自主补全元数据写入是否允许未来自动执行，及其审计/事务/回滚。
14. `subject` 是否 deprecated；rules 等特殊表如何适配统一 validity。
15. Bridge 群记忆写入的最终责任归属。

以上全部标记为 **待所有者批准**，本报告不替所有者决定。

---

## 11. 未验证 / NOT RUN

- 真实 OneBot/NapCat 事件字段完整性；真实 QQ 私聊/群聊/媒体/引用/转发/通知；
- 真实 429/退避、并发群消息、长连接资源、凭证轮换；
- 生产 Memory `saveGroupTranscript` 实际调用频率/行数、按群检索效果；
- 生产 Persona 运行时 `identityOf`/binding 行为（当前 main 没有 identityOf）；
- Host/DSH 真实 `session_id` 生成路径与 Bridge 自生成 UUID 的一致性；
- Memory/Persona 全量测试本轮未重跑；562/562 是 Bridge fake transport 测试；
- 未连接生产 DB 写、未发送任何消息、未部署/重启。

---

## 12. 边界声明

本报告只读，不修改 Channel Bridge/Memory/Persona 业务代码、测试、schema、数据库、生产配置；不连接真实渠道；不发送消息；不部署/重启；不启动 Memory v6/Persona v3/EI-2A；不创建跨平台身份合并。报告中的设计建议均为 `PROPOSAL`，不是已批准契约，不构成实施授权。

---

## 13. 证据索引（主要代码行号）

| 结论 | 证据 |
|---|---|
| conversation key / unknown 回退 / 非数字剥字符碰撞 | `lib/sessions.js:119-124`（`replace(/\D/g,'')` 在 122） |
| session 表 / session_id 生成 | `lib/store.js:10-23,412-466`；`lib/sessions.js:259,287,481` |
| 会话复用/resume | `lib/sessions.js:367-508` |
| forceRotate 模糊选择 | `lib/sessions.js:324-352`；`lib/tools.js:696-721` |
| 入站解析 / 群缺 sender | `lib/parse.js:160-220` |
| 投递 source 字段 | `lib/message.js:10-38` |
| 新会话上下文 | `lib/context.js:8-36`；`lib/store.js:330-339`；`lib/index.js:263` |
| 群上下文 fallback | `lib/index.js:287-290`；`lib/group-followup.js:121-159` |
| prompt 群发言人 | `lib/prompt.js:75-84` |
| group bucket | `lib/group-buckets.js:31-35` |
| group turn memory | `lib/group-turn-memory.js:92-126` |
| group transcript | `lib/group-digest.js:61-88`；Memory `lib/service.js:550-575` |
| 群归档查询 | Memory `lib/index.js:776-792` |
| 群实体 person_id | Memory `lib/ingest/archive.js:271-295` |
| unified owner | `lib/unified.js:12-20` |
| forward/quote speaker | `lib/forward.js:60-100,180-195`；`lib/quote.js:20-35,100-130` |
| notice actor/operator | `lib/notice.js:78-140`；`lib/index.js:391-448` |
| clearHandoff kind 不匹配 | `lib/router.js:141`；`lib/store.js:406-410` |
| status 旧 kind 失效 | `lib/status.js:96-97` |
| handover 全量/标主人 | `lib/handover.js:143-152,186-196`；`lib/store.js:293-305` |
| group transcript 昵称判 self | Memory `lib/service.js:566` |
| 生产 profile | `/root/.dsh/profiles/web/cordis.patch.yml`（只读） |
| 生产 DB 聚合 | `/root/.dsh/dsh-channel-bridge/bridge.db`（只读 `node:sqlite`） |

---

## 14. 状态

- Channel Bridge 本轮：**READY_FOR_REVIEW**
- Channel Bridge 当前实现对契约 v1.1.1 的会话/身份/输出接口：**PARTIAL / REJECT / NOT_IMPLEMENTED**
- 联合契约：**BLOCKED / NOT FROZEN**
- Memory v6：**NOT_STARTED**
- Persona v3：**NOT_STARTED**
- EI-2A：**NOT_STARTED**
- 本报告不构成任何实施授权。
