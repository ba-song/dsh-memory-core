# dsh-memory-core

汐的**记忆插件**：分层记忆（事实/偏好/关系/技能/插曲）、原话归档、检索（关键词 + 语义 + 图谱）、按会话注入、以及 owner/contact/public 三级可见性。它同时提供 `dyMemory` 服务给其他插件（人格、自主性、渠道桥）使用。

> 本文件只讲「怎么用、边界在哪」；改动记录见 `记忆/文档/部分报告-*.md` 与 `计划书-记忆.md`。

---

## 1. 定位与结构

- **记忆层**（`memories`）：结构化条目，`kind ∈ fact/preference/relation/skill/episode/todo`，`layer ∈ manual/auto`，带来源、置信度、scope。
- **原话层**（`raw_meta` + `raw_fts` + `记忆/数据/raw/<日期>/*.md`）：逐行归档对话（user/self/self-thought/事/步/具/果/量/境/系/题/待），可按天读、按原句搜。
- **检索**：三路 RRF —— 关键词 FTS（bigram/trigram）+ 语义向量（embedding 可用时）+ 图谱 1 跳；结果经闸门后以 notice 注入。
- **注入**：常驻块（`dy-memory-stable`：事实卡/话头/【上次聊到】）、命中块（【本轮相关】【相关原话】【出处上下文】）、跨渠道摘要（`dy-digest`）。
  - 2026-11-15 起【出处上下文】对每个可用命中（默认 top2）都回到 `raw_meta` 锚点，展开「命中原话 + 前后各 2 条对白」共 5 条；每条带当时思考（±8 行内最近 `self-thought`，没有写 `想：无`）与情绪（persona `emotionAt` 优先，退化 `emotion_timeline`，强度<0.35 省略）。只 owner 注入。
  - 同一次注入带工具摘要：assistant 行按「上一条 dialog → 本行」归属 `具/果/错/图/文`（每行最多 2 个），只显示工具名 + `ok/err`（错误码/40 字内错误短句），**不注入参数/结果正文**；块末有【工具概要】（调用/成功/失败/最近/错误），无工具则省略；超预算先整块丢工具、再按命中顺序整窗丢窗口。
- **scope**：`owner` / `contact` / `public` 三级；另有人维度 `person_id`（`person:owner`、`person:contact:<ch>:<id>`、`person:contact:qq:group:<群号>`）。

代码地图：`lib/index.js`（工具/注入/钩子）、`lib/service.js`（dyMemory 服务）、`lib/ingest/`（归档与 P4 提炼）、`lib/recall/`、`lib/inject/`、`lib/person/`、`lib/facts/`、`lib/group/`、`lib/maintain/`（快照自愈）、`scripts/`（doctor、回填）。

---

## 2. 工具清单（前缀 `dy_`）

全部工具返回统一结构 `{ ok, ... }`；失败带 `error`，不抛到聊天。

### 记忆读写
| 工具 | 参数 | 返回 | 门禁/说明 |
|---|---|---|---|
| `dy_memory_add` | `text` 必填；`kind`（默认 fact）、`speaker`、`scope` 可选 | `{ok,id}` | 仅主人私聊；手动层 `layer=manual` |
| `dy_memory_forget` | `id` | `{ok,removed}` | 仅主人私聊；跨表删除（fts/实体/向量/冲突引用） |
| `dy_memory_forget_by_source` | `sourcePrefix` 或 `extractor` | `{ok,removed}` | 只删**同时匹配**的 auto 条目；manual 不动 |
| `dy_memory_auto_list` | `limit?` | `{items}` | 列出 `layer=auto` 最近条目，用于检查误抽 |
| `dy_memory_stats` | 无 | 计数、`embedding`、`retrieval`、`autoExtract.diag` | 只读；`diag` 含 P4 `counts/lastDrop/attempts/inserted/last*At` |

### 检索
| 工具 | 参数 | 说明 |
|---|---|---|
| `dy_memory_recall` | `query`、`limit?`、`channel?`(qq/home)、`contactId?` | 关键词+语义检索；`channel/contactId` 可按房间/人过滤（不传则全量） |
| `dy_memory_quote_search` | `query`、`limit?` | 原话 FTS，带日期与角色；已撤回不返回 |
| `dy_memory_raw_verify` | `day`（YYYY-MM-DD） | 校验当天原话档案行数与哈希 |

### 档案读取
| 工具 | 参数 | 说明 |
|---|---|---|
| `dy_archive_read` | `kind?`(dialog/reasoning)、`limit?`、`channel?` | 读当天原话；**dialog=user+self，reasoning=思考**，两者不混 |
| `dy_archive_research` | `question`、`limit?` | 跨天原话片段检索（≤400 字） |
| `dy_archive_tools_overview` | 无 | 当天工具调用/结果/报错概览 |
| `dy_memory_person_archive` | `personId?`、`channel?`、`limit?` | 按「人」聚合原话：不给 id → 最近有原话的人；给 id → 跨房间最近 N 条（每条 ≤300 字） |

### 事实卡（她自填）
| 工具 | 参数 | 说明 |
|---|---|---|
| `dy_memory_fact_add` | `section`(全局/主人/群/人)、`text`、`name?` | 追加到 `事实卡.md` 对应节；≤200 字、去重、写前备份（保留 5 份）；`人` 可带 `name` 子标题 |
| `dy_memory_facts_list` | 无 | 只读列出四节内容 |

### 联系人/冲突
| 工具 | 参数 | 说明 |
|---|---|---|
| `dy_memory_contacts` | 无 | 联系人列表（id/名字/kind/渠道/最后出现） |
| `dy_memory_contact_merge` | `from`、`to` | 把 `from` 的引用并到 `to`（不改正文、不删记忆），写审计 |
| `dy_memory_conflicts` | 无 | 列出 `conflict_queue` pending |
| `dy_memory_conflict_resolve` | `id`、`action`(keep/drop)、`side`(old/new) | 解冲突：删掉另一侧/指定侧；写审计 |

### 公开层
| 工具 | 参数 | 说明 |
|---|---|---|
| `dy_memory_group_archive` | `groupId?`、`limit=20` | **家/主人只读**：群全文按需查（`/渠道/qq-群` 最近 N 条，每条 ≤300 字）；不给群号返回最新群；群/陌生人调用返回空并写审计。不自动注入、不写 memories |
| `dy_memory_publish` | `text`、`ttlDays?` | 家/主人专用；写 `[汐的近况] …`（≤300 字，默认 7 天过期，按内容 hash 去重），群聊可经 `publicBrief` 读取。**不要放隐私/地址/密码/聊天原文** |

---

## 3. `dyMemory` 服务（其他插件调用）

调用方式：`ctx.get('dyMemory')`（契约 v1.3），**必须带 header**（`opts.header` 或 `opts.session.header`），子智能体一律 `E_PERMISSION`。

| 方法 | 签名 | 用途 |
|---|---|---|
| `recall` | `recall(query, {limit, allowCrossChannel, header})` | 检索记忆（超时 3s → `[]`） |
| `episodeRecent` | `episodeRecent(days, limit, header)` | 近 N 天插曲（超时 1s → `[]`） |
| `addEpisode` | `addEpisode({text, at, source, actionId, header})` | 写一条插曲；persona 缺失时抛 `E_PERSONA_UNAVAILABLE` |
| `contactOf` | `contactOf(channel, externalId, {header})` | 查联系人（超时 200ms → `null`） |
| `resolveContact` / `bindContact` | 见 `lib/service.js` | 解析/绑定联系人身份 |
| `lastUserMessageAt` | `lastUserMessageAt()` | 最近一条用户消息时间（不敏感，不需 header） |
| `saveDiary` | `saveDiary({text, at, title, mood, tags, header})` | 写日记文件（`diary/日期/HHMMSS-seq.md`），不覆盖、不幂等 |
| `saveEmail` | `saveEmail({...}, {header})` | 邮件入记忆（`渠道/email`，owner 邮箱归 `person:owner`） |
| `saveGroupTranscript` | `saveGroupTranscript({groupId, groupName, messages, at?, messageId?}, {header})` | 群窗口全文（5–20 条）逐条写原话归档（`/渠道/qq-群`，user/self 按说话人），**不写 memories**、不自动注入；按「群号+at+文本片段」去重 |
| `saveGroupDigest` | `saveGroupDigest({groupName, groupId, messages, at?, messageId?}, {header})` | 群→家：确定性摘要写 public 记忆 + 原话归档；按 `group:<群号>:<at>` 去重 |
| `saveGroupTurn` | `saveGroupTurn({groupId, groupName?, incoming?, reply?, at?})` | 群聊一轮写一条 group scope 的 episode（**不要求 header**，供群桥调用）；`group-turn:<群号>:<at>` 去重，1h/1d 限额，meta 记 TTL |
| `publishPublic` | `publishPublic({text, ttlDays?}, {header})` | 家→群：写 `[汐的近况]` public 记忆（仅家/主人，sha1 去重，默认 7 天） |
| `publicBrief` | `publicBrief({limit?})` | 读最近 public 近况（不含 owner/contact scope） |
| `carryover` | `carryover({cwd, limit?, header})` | 只读返回该房间「上次聊到」块 |

---

## 4. 配置（`数据/config.json`，缺省值见 `lib/config.js`）

| 键 | 默认 | 说明 |
|---|---|---|
| `memoryEnabled` / `memoryRecordEnabled` / `memoryInjectEnabled` | `true` | 总开关/记录/注入 |
| `embedEnabled` | `true` | 语义臂（需要 `onnxruntime-node` + bge-small-zh 模型，缺失自动降级关键词） |
| `semanticGate` / `keywordGate` | `0.55` / `0.35` | 两路召回门槛 |
| `injectBudget` | `{facts:420, memory:400, pin:100}` | 常驻块预算（字） |
| `rawTopN` | `5` | 【相关原话】最多条数 |
| `provenance` | `{enabled:true,maxHits:2,window:2,maxRows:10,maxChars:2000}` | 【出处上下文】：每个可用 hit 展开锚点+前后各 `window` 条对白（默认 5 条），每条带想/心情；`maxRows`/`maxChars` 为总预算，超限按命中顺序整窗丢弃（不切窗口）；`enabled:false` 关闭。只 owner 注入 |
| `provenanceMaxHits` / `provenanceWindow` / `provenanceMaxRows` / `provenanceMaxChars` | 空 | 顶层兼容写法（未写 `provenance.*` 时生效；非法值回落默认、越界夹区间） |
| `archiveDir` | `/sdcard/DSHA/记忆/档案` | 旧档案目录（兼容） |
| `archiveCwdPrefixes` | `[]` | 原话归档 cwd 白名单；空=旧前缀；`trustedDirs` 自动并入 |
| `archiveDirs` | `['/sdcard/DSHA/渠道']` | **只用于原话归档/摄取的目录**（群/私聊/email/未来渠道）；**不并入 owner 判定**，`trustedDirs` 边界不变 |
| `factsPath` | `''` | 事实卡路径；空=旧三候选逻辑 |
| `ownerQQ` / `ownerPrivateDir` / `ownerEmails` | 空/空/`['<主人邮箱>']` | 主人身份（代码不写死账号） |
| `trustedDirs` | `[]` | 她的房间等受信任目录，命中按主人处理 |
| `autoExtract` | `{enabled:true,minChars:8,requireSubject:true,maxPerTurn:1}` | P4 规则提炼闸门 |
| `extract.llm` | 见 config | 小模型抽取开关/配额（默认关闭前请确认；`dailyCap` 等） |
| `autoSnapshot` | `true` | 每 30 分钟快照，保留 6 份 |
| `groupMemory` | `{maxPerHour:12,maxPerDay:60,ttlDays:90,maxChars:600}` | 群聊轮次写入限额/正文上限/TTL；非法值回落默认，越界夹区间；TTL 每 6 小时软删（`status='expired'`） |

---

## 5. 数据与运维

- **主库**：`/sdcard/DSHA/记忆/数据/memory.db`（WAL）。表：`memories`、`entities`、`memory_entities`、`relations`、`conflict_queue`、`vectors`、`profiles`、`contacts`、`contact_bindings`、`contact_notes`、`raw_meta`、`raw_fts`、`meta`；`emotion_*` 为退役只读表（memory 不再写）。
- **原话文件**：`数据/raw/<YYYY-MM-DD>/s-<sid>.md`（行首 `HH:MM:SS [seq] 角色：正文`，北京时间）。
- **备份**：`数据/备份/auto-*.db`（自动快照，保留 6）；手工备份 `记忆/备份/*.db`；事实卡备份 `数据/备份/facts-before-*.md`（保留 5）。
- **自愈**：启动时库缺失或 `integrity_check` 失败 → 从最新有效快照恢复，坏库改名 `memory.db.bad-<ts>` 留证。
- **归档/TTL**：原话按天建文件；记忆衰减见 `lib/decay`；public 近况默认 7 天过期；清理逻辑不删 `person_id` 索引。

---

## 6. 典型用法

1. **她想起以前的事**：`dy_memory_recall({query:'看海'})` → 命中条目 + 分数；需要原话再 `dy_memory_quote_search`。
2. **她查今天聊了什么**：`dy_archive_read({limit:20})`（对话）/ `{kind:'reasoning'}`（思考）。
3. **她记下主人的偏好**：`dy_memory_fact_add({section:'主人', text:'怕辣'})`；下次 home 会话按四节规则注入。
4. **群里聊了很多，回家要看**：群桥调 `saveGroupDigest` → 家会话可读到 `[群聊摘要]`；要**全文**再调 `dy_memory_group_archive({limit:20})` 按需取（不占 home 上下文）。
5. **她在家发布近况给群里看**：`dy_memory_publish({text:'今天看了海'})` → 群聊 `publicBrief()` 读取。

---

## 7. 隐私边界

| scope | 谁能看 |
|---|---|
| `owner` | 仅主人私聊/home（`isOwnerCwd` + 绑定/受信任目录） |
| `contact` | 对应联系人自己的私聊；不跨人 |
| `public` | 所有会话（含群）；只允许 `[汐的近况]` 这类主动公开内容 |

- 注入时非主人会话**不注入** owner 内容；`pickFacts` 对非 owner 只给 `## 全局`。
- `dy_memory_publish` 仅家/主人；工具描述明确「不要放隐私/地址/密码/原文」。
- 原话归档只对白名单 cwd；群消息按 `person:contact:qq:group:<群号>` 聚合，不写成 owner。
- 服务调用必须 header，子智能体禁止；跨人 `contact` 不互通。

---

## 8. 测试与同步

```bash
# 测试（必须用临时目录，避免写生产库）
DY_MEMORY_DIR=/tmp/dy-test node --test tests/*.test.mjs

# 健康检查（只读）
node scripts/doctor-memory.mjs --db /sdcard/DSHA/记忆/数据/memory.db --json

# 时区回填（默认 dry-run）
node scripts/doctor-memory.mjs --db ... --fix-archive-tz

# 同步到 SD 卡备份
sh /sdcard/DSHA/插件开发/自建插件/sync-from-ubuntu.sh
```

当前基线：`tests/*.test.mjs` 75 个文件全绿（embedding 测试需要本机 `onnxruntime-node` 与模型；缺库时该用例会红，属环境依赖）。
