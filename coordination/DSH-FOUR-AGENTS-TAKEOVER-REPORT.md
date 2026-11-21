# DSH-FOUR-AGENTS-TAKEOVER-REPORT

审计日期：2026-11-22 UTC  
审计性质：GitHub 仓库与文档只读审计；不代表设备或生产验收。  
审计范围：Memory、Persona/EI、Channel Bridge、Douyin 四个专业仓库；并交叉核对 Autonomy 与 Android 宿主 DSHA。

## 0. 执行摘要

1. 四个专业仓库均可读取；默认分支均为 main。四仓库均未发现 AGENTS.md（含嵌套路径），均无开放 PR。
2. Memory 与 Persona 有多条未合并工作分支。Memory 的多个功能栈不能直接拼接：最小集成、wake-capture、M1 与 Batch E 的提交历史/代码范围存在分叉。
3. EI-1 有隔离测试报告，但没有设备复验；EI-2A 仍是设计提案，未获实施授权。Persona 报告分支的设计文件与修订分支不一致。
4. Channel Bridge 的 550/550 测试报告来自并发编辑中的工作树，不绑定当前 main HEAD；且当前代码已写入群聊轮次记忆/原话归档，与 README 顶部“不写记忆”的概述不一致。
5. Douyin watcher 默认关闭，代码提供了 Autonomy 可调用的只读事件接口；但 Autonomy 中存在自动私信回复路径，调用时自动传入 confirm:true。通知 watcher 也可能与 Autonomy 重复投递。
6. Autonomy 默认关闭、dryRun=true、sendEnabled=false，但源码存在真实执行器注册路径。不能仅凭 README 的“tick 只有 mock”认定不存在真实执行能力。
7. Android 宿主仓库 DSH-APP/DSHA 当前可读取。main 为 build357；Android/Autonomy 的恢复协议文档已在 60 秒观察窗上对齐，但 Android 侧报告仍保留 PARTIAL 状态。相关真机/文件系统/后台运行验证仍 NOT RUN。

**本轮 GPT 没有运行 Node/Android 测试，没有连接真实 QQ/抖音，没有访问生产数据库或设备 profile，没有修改任何产品源码、配置或生产数据。** 测试结果仅按 GitHub Actions 或专项报告分别标明来源。

## 1. 仓库基线

| 专业线 | 仓库 | 默认分支 HEAD | 分支数 | 开放 PR | Actions 证据 |
|---|---|---|---:|---:|---|
| Memory | ba-song/dsh-memory-core | 752cd0861e9c86c9f7be4bdf18302fa72a3b95dd | 12 | 0 | M1 分支 7548e49 有完整 npm test 成功记录；其他主要分支未找到 Actions run |
| Persona/EI | ba-song/dsh-persona-core | a84c7badd1e6c971a66b6c39dd4f7ab795df4b90 | 4 | 0 | 未找到 Actions run |
| Channel Bridge | ba-song/dsh-channel-bridge | bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13 | 1 | 0 | 未找到 Actions run |
| Douyin | ba-song/dsh-douyin | da799dd4492ad5093aa0c5cd9376d68919a6ebd3 | 1 | 0 | 未找到 Actions run |

四个专业仓库的递归 Git tree 均未发现 AGENTS.md。后续如新增规范文件，修改前必须重新扫描根目录与目标目录的嵌套规范。

## 2. Memory 分支地图与状态

相对 main 的 compare 结果：

| 分支 | HEAD | Ahead / Behind | 当前判断 |
|---|---|---:|---|
| coordination/project-handoff | c4d435dc94fb0361a931fd6a982ef36c73909a4f | 334 / 0 | 共享交接文档分支；与 Batch E compare 为 diverged 143/109，但文件差异仅列出六个 coordination 文档，不能把提交图关系误读为普通 docs-only 分支 |
| feat/m1-preference-memory | 7548e49ed0b8d8673818464325d8e72ec7704b27 | 245 / 0 | M1 功能线；GitHub Actions 在该精确 HEAD 上 npm test 成功 |
| feat/memory-validity-batch-b | 2a93031db3dfa1a1c7c34b7376aebe395493c57f | 285 / 0 | Batch B 栈 |
| feat/memory-validity-batch-c | fecbd09eaa5b5745ef02263b1bd506712c256150 | 292 / 0 | Batch C 栈 |
| feat/memory-validity-batch-d | 5500d04e0e49ebb8168e7356de3c082a9e0e722e | 294 / 0 | Batch D 栈 |
| feat/memory-validity-batch-e | 4bf92aad8c069e92f3521e6a7cdf4c7b79559e3c | 300 / 0 | Batch E 栈，117 个文件变更 |
| feat/memory-validity-minimal-integration | a63f994e001da2e6636ed07c75988fa681ecaf7c | 44 / 0 | GPT 两项低风险修订后的新 HEAD；等待全新 worktree 复验 |
| feat/memory-validity-unified | 5797324175f345ff82337f409d8406e5256ddfc3 | 274 / 0 | unified 栈；Batch E 相对它再 ahead 26 |
| feat/memory-wake-capture | 0fdae98860be9fb71f74081c1cf79fa963227ae2 | 14 / 0 | wake-capture 独立线；隔离测试报告通过 |
| fix/p0-atomic-schema-migration | dd939cc74c7d406c7b5fe4dd9f8309e6f7a711b5 | 235 / 0 | P0 迁移修复线 |
| fix/p4-active-neighbors-semantic-opposition | 1635ccbaff07ba70d6e42f286ff724b8e55234aa | 254 / 0 | P4 语义邻居线 |
| main | 752cd0861e9c86c9f7be4bdf18302fa72a3b95dd | 0 / 0 | 默认主线 |

### 2.1 关键分叉与合并风险

- minimal-integration 与 wake-capture 比较为 diverged：wake 相对 minimal ahead 14、behind 44；两者共同改动 lib/index.js 与 lib/store/schema.js，schema 口径不同（minimal 为 v4，wake 线为 v3）。禁止直接合并。
- minimal-integration 与 M1 分支比较为 diverged：M1 ahead 245、behind 44，涉及 107 个文件。不得把 M1 整栈并入最小集成分支。
- Batch E 相对 unified ahead 26；Batch E 不是可直接合并 main 的小补丁，而是大范围功能栈。
- coordination/project-handoff 与 Batch E 的提交图 diverged；compare 文件清单只有六个 coordination 文档。合并前仍须按 tree/blob 核对，不按分支名推断其内容范围。

### 2.2 当前任务状态

| 工作项 | 状态 | 证据与缺口 |
|---|---|---|
| minimal-integration | IN_PROGRESS | 当前 HEAD a63f994；HANDOFF-0075 记录两个 GPT 提交：auto_list 只读诊断字段与 v4 适用迁移测试范围修订。当前状态明确为 IMPLEMENTED / WAITING REVERIFY；GPT 未运行 Node 测试，需新 worktree 全量、专项与 N9 复验 |
| wake-capture | READY_FOR_REVIEW | 专项报告记录 143/143、定向 8/8、N1–N10 负向探针通过；仅隔离代码验证，生产库/设备/部署 NOT RUN；与 minimal 分支冲突未解决 |
| Batch E | READY_FOR_REVIEW | MEMORY-REPORT-0021 记录 305/305、0 fail/skip，多轮定向与负向验证；仅隔离代码验证，统一集成、真实调度、生产和设备验证 NOT RUN |
| M1 preference | BLOCKED | 57 条既有 preference 仍需主人逐条授权；不能自动回填或推断同意 |
| M3 event chain | IN_PROGRESS | 设计与实现存在，但未接入主召回/自动注入；15 条召回评测查询尚无人工标注 |
| updateMemory 派生索引一致性 | IN_PROGRESS | 仍需事务/派生索引一致性审查 |
| Home 永久档案 | READY_FOR_REVIEW | 隔离代码与测试存在；Android 真机文件系统、权限、故障恢复验收未完成 |

### 2.3 测试证据与文档滞后

- GitHub Actions run 44751203163 在 feat/m1-preference-memory 的精确 HEAD 7548e49 上成功；该分支 workflow 明确执行 npm test。
- minimal-integration、wake-capture、Batch E 未找到对应 Actions run；其测试数字来自专项智能体报告，不应改写为 GPT 独立实测。
- MEMORY-REPORT-0021 仍记录 minimal 分支旧 HEAD 8d0f3adc 的 194 tests / 190 pass / 4 fail；它不是 a63f994 的复验结果。共享 HANDOFF-0075 已记录新 HEAD 和待复验要求，但 Memory 智能体报告尚未同步新 HEAD。
- 下一步先复验 a63f994，不升级 schema，不合并 wake/M1/Batch E，不触碰生产数据库。

## 3. Persona / EI 分支地图与状态

| 分支 | HEAD | Ahead / Behind main | 文件差异 |
|---|---|---:|---|
| fix/ei1-source-ref-experiencer-contract | 8ccb8a922a789d8d15157b9d99f9de0c20c8807b | 26 / 0 | EI-2 设计、EI-1 纯函数与测试 |
| ei/pre-ei2a-review-01 | 4992a313f72326caa4b5e84558005a53db239af0 | 27 / 0 | 报告 0004/0005、EI-2 设计及 EI-1 代码/测试 |
| feat/ei1-emotion-composition | 950eb423856663dd744cdd702f391527a4c36a6f | 13 / 0 | 较早 EI-1 组合线 |
| main | a84c7badd1e6c971a66b6c39dd4f7ab795df4b90 | 0 / 0 | 默认主线 |

### 3.1 EI-1

- EI-REPORT-0003/0004 报告 EI-1 目标 commit 3a1376184491d94b02d4c3ad4990a957e85acb48：定向 21/21、全量 324/324，0 fail/skip。
- 当前修复分支的源码/测试 blob 分别为 cf033ec8400ea38e717481a46a5bfe834276a4a5 与 eb17cb0f2c67450a145f38d1a582bef6d90b07c8，与报告记录一致。
- 状态只能是“代码隔离验收 PASS，DSHA/负责人设备复验 NOT RUN”；Persona 仓库没有 Actions run，当前审计也未重新执行 Node 测试。

### 3.2 EI-2 设计不一致

- 修订分支 fix/ei1-source-ref-experiencer-contract 的 EI-2-PERSISTENCE-DESIGN-01.md blob 为 670e5a34a1916a8b104ebfd1004b525236677d4c。
- 报告分支 ei/pre-ei2a-review-01 中同名设计文件 blob 仍为 d79bd124167dec45968fc5aece7060017fc75057。
- EI-REPORT-0005 却引用修订版 blob 670e5a34；因此报告分支内的报告与同分支实际设计文件不一致。需由 Persona 专项与 GPT 统一基线，不得把旧设计当作最新裁决。
- EI-2A 仍 NOT RUN、未获负责人授权。owner 稳定 ID 仍待负责人确认；旧 348 条 appraisal/episode 只允许 shadow 分类，不得批量认定为 self；Memory inbox/outbox 与 ACK/重试被设计为 EI-2D，不属于 EI-2A。
- 需保留 sourceRefs 的 raw → raw_message 归一化要求、未知 source type 拒绝、timeline 旧 schema 兼容问题等未完成事项。

## 4. Channel Bridge 审计

仓库：ba-song/dsh-channel-bridge  
main HEAD：bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13；仅 main；0 开放 PR；未找到 Actions run。

- package 为 0.18.0；README 默认 enabled=false，未启用时不连 WS、不注册工具、不建库。
- docs/VERIFY-20261116.md 记录 node --test tests/*.test.mjs 两次 550/550；但文档明确数字来自并发编辑中的工作树，没有绑定当前 main SHA。报告同时明确未连接真实 OneBot/QQ，未验证真实媒体、真实 429/退避、真实并发群消息、凭证轮换和长连接资源。
- 当前代码已提供 dyChannel.sendText；只有 mode=send 才实际发送，其他模式返回 MODE_NOT_SEND。
- 当前代码也已实现群聊轮次记忆：groupMemory 默认 true（但插件总开关默认 false），调用 dyMemory.saveGroupTurn 写 group scope episode；群窗口关闭时 saveGroupTranscript 还会写 raw 原话归档。README 顶部“桥不写记忆”的概述与现有实现不一致，应修作文档或明确分层说明。
- saveGroupTurn 失败时调用方记录错误但不自动重试；group-turn-memory 在写入前推进 lastAt，失败可能导致该批 incoming 不再重放。建议纳入可靠性专项审查。
- 下一步：在精确 main HEAD 的干净 worktree 复跑全量 550 项测试并更新报告；只做 fake transport，不连接真实 QQ、不发送消息。

## 5. Douyin 审计

仓库：ba-song/dsh-douyin  
main HEAD：da799dd4492ad5093aa0c5cd9376d68919a6ebd3；仅 main；0 开放 PR；未找到 Actions run。

- package 为 0.1.0，Node >=24；提供 npm run check 与 npm test；当前 tree 有 17 个测试文件（另有 helpers），本轮未运行。
- dmWatchEnabled 与 notifyWatchEnabled 默认 false；dmWatch/notifyWatch 的 status、poll、subscribe API 在插件服务中注册，供 Autonomy 只读消费。
- 真实点赞、收藏、评论、删除、通知回复、私信发送均有 confirm 门禁；评论真实提交和通知真实回复仍有未验收说明。
- dmSend 要求 confirm:true；Autonomy 的自动回复实现会在满足其自身启用/dryRun/暂停门禁后自动调用 dmSend 并传 confirm:true。因此“confirm 参数存在”不等于每条自动回复都经过主人逐条确认。
- notifyWatchDeliver 默认 true；Autonomy 也能订阅通知并自行路由。若两个通知投递路径同时启用，可能重复投递；必须由联合评审确定唯一投递责任方，或明确关闭其中一方。
- 下一步：在精确 main HEAD 运行 npm run check 与 npm test；只用 fake transport，不登录真实账号、不发送、不点赞、不评论、不改 profile。

## 6. Autonomy 与 Android 宿主交叉审计

### 6.1 Autonomy

仓库：ba-song/dsh-autonomy  
main HEAD：6c4a4753b4737060211955b1f022cab2f1d39521；仅 main；0 开放 PR。

- package 0.4.0，Node >=24。默认 enabled=false、dryRun=true、sendEnabled=false、home.enabled=false、douyinInbox.enabled=false、homeArchiveMaintenance.enabled=false；allowedKinds 默认仅 read_archive、organize_memory。
- GitHub Actions run 44720665021 在精确 main HEAD 成功；workflow 执行 npm test 和 home-archive-maintenance 定向测试。
- README/package 描述 tick 仍是 dry_run + mock；但源码存在 cfg.tick.realSafe=true 时注册真实执行器的路径，包括 write_diary、browse_douyin、send_qq。write_diary 会调用 dyMemory.saveDiary；browse_douyin 调用 dyDouyin.feed；send_qq 调用 dyChannel.sendText。
- send_qq 还受 dryRun=false、sendEnabled=true、ownerAllowlist、行动白名单及 Channel Bridge mode=send 等条件限制。默认配置不会进入该路径，但真实 profile 的开关值尚未只读核对。
- Douyin inbox 还有自动回复路径：其他联系人消息进入统一会话，回合结束后按原 conversationId 调 dyDouyin.dmSend，自动传 confirm:true；需 Autonomy/Douyin 联合审查，且必须由负责人明确授权后才能启用。
- Autonomy 与 Douyin 通知 watcher 同时投递可能重复；Autonomy 与 Channel Bridge 的 dyChannel 发送接口必须按服务契约联合验证。
- 最高优先级下一步是让 DSH 只读核对真实 profile 的 enabled、dryRun、tick.realSafe、allowedKinds、sendEnabled、douyinInbox、home、notify 与渠道 mode；只回报值，不改配置、不启动 tick、不发送、不写记忆。

### 6.2 Android 宿主 DSHA

仓库：DSH-APP/DSHA  
main HEAD：36d89b72294348d0482d509109cf8e76d51fc1cb；CHANGELOG 标记 0.2.2 / build357。

- 当前已能读取 Android 宿主源码。main 根 AGENTS.md 已读；同时发现 dsh-web-mobile 的 client 与 effects 两份嵌套 AGENTS.md。四个专业插件仓库没有 AGENTS.md。
- Android AGENTS 规定：一任务一 worktree、改动前核对 main、不要在主检出直接改代码、设备/安装/发布按当次授权执行、外部 PR 需逐行审查且合并需用户明确同意。
- DSHA 当前只有 Standard，Android 11+/API30+、arm64；build357 是版本码更新，不能从版本号推断设备验收。
- main 有 9 个开放 PR；release/0.2.2 相对 main behind 14；dev/1.1.x diverged 126/160；stable diverged 59/160；codex/source-build150 ahead 2/behind 118；codex/rc2-build147 behind 131。不得将旧分支当作当前主线。
- 当前 main 的可见 Actions 包含 main HEAD 的 Source checks、Documentation checks 成功，以及 2026-11-16 Fixed inputs health 成功；本轮没有取得当前 build357 真机验收证据。
- Android 专项报告 ANDROID-REPORT-0004 的 E 项 60 秒观察窗仍标 PARTIAL；Autonomy 专项 AUTONOMY-REPORT-0004 v4-r2 已采纳 60 秒并标 DESIGN ALIGNED。两份文档需统一状态。
- Autonomy v4-r2 报告仍将 DSH kill/reboot、fs.watch 长稳、fsync、ENOSPC、f2fs/PRoot link/rename、双 worker 真并发、Android 真实实现、staging 与生产迁移标为 NOT RUN。force-stop、FGS/OEM 限制与重启恢复也不能用设计对齐代替真机证据。
- Android 设备侧只允许先做只读 profile/版本/权限/服务状态检查。kill、reboot、force-stop、权限扩大、安装或重启都不是本次授权范围。

## 7. 任务地图与推荐分工

| 任务 | 负责人 | 依赖/协作 | 状态与验收 |
|---|---|---|---|
| Memory minimal-integration 精确 HEAD 复验 | Memory 专项 | GPT 提供当前 HEAD 与测试清单 | IN_PROGRESS；新 worktree，全量/专项/N9，保留原始输出，不改代码 |
| Memory wake-capture 与 minimal schema 冲突评审 | GPT 统筹；Memory 专项提供事实 | Memory 专项 | BLOCKED；先定义兼容方案，不直接合并 |
| Batch A–E / M1 整栈关系与可拆分集成方案 | GPT 统筹；Memory 专项 | 需要明确主线目标与依赖 | IN_PROGRESS；禁止整栈直接合并 |
| EI-1 代码与设计报告同步 | Persona 专项 | GPT 核对两个分支 blob | IN_PROGRESS；统一设计 blob 与报告基线，不做 EI-2A |
| EI-2A schema/migration | Persona 专项仅准备设计 | GPT + 负责人 | BLOCKED；等待负责人明确授权 |
| Channel Bridge 精确 HEAD 测试与群记忆契约审查 | Bridge 专项 | Memory 专项联合审查 | IN_PROGRESS；fake transport，检查失败不重放与文档一致性 |
| Douyin watcher / dmSend 契约测试 | Douyin 专项 | Autonomy 专项联合审查 | IN_PROGRESS；fake transport，不触发真实写 |
| Autonomy realSafe 与自动回复门禁审查 | Autonomy 专项 | Douyin、Channel Bridge | BLOCKED（真实执行）；先静态审查与测试，严禁启动 |
| 生产 profile 开关只读盘点 | DSH 设备检查 | GPT 统一报告 | READY_FOR_REVIEW；只读回报实际值，不改配置 |
| Android 恢复协议真机验证准备 | Android 专项 | Autonomy 专项 | NOT_STARTED；先核对设备/版本与只读环境，故障注入需另行授权 |
| Home 永久档案文件系统验收 | Android + Memory 专项分别负责设备/记忆侧 | GPT 统筹 | NOT_STARTED；fsync、ENOSPC、权限、重启等按独立授权执行 |

### 并行边界

- Memory 与 Persona 各自只改自己的仓库；EI 的 Memory inbox/outbox 接口先联合评审，不能由 EI 直接改 Memory。
- Douyin 与 Autonomy 可以并行做 fake transport 接口测试，但真实自动回复不得启用。
- Channel Bridge 可独立复跑单测；与 Memory 的 group scope 写入契约由双方分别给意见，GPT 汇总。
- Android 专项只负责宿主与设备证据，不替 Autonomy/Memory 宣称测试通过。
- GPT 负责最终架构整合、文档一致性和跨仓库验收。

## 8. 需负责人批准的事项

本报告没有授予以下权限：

1. EI-2A schema/migration、EI-2B/C/D/E/F 或任何 persona 生产迁移。
2. M1 既有 57 条 preference 的自动授权/回填。
3. Memory wake-capture 对汐真实记忆写入行为的接入或生产启用。
4. Autonomy tick.realSafe、自动日记、自动抖音浏览、QQ 外发、Douyin 自动私信回复。
5. Home 自动唤醒、通知/屏幕触发、自主调度或真实执行器启动。
6. Channel Bridge / Douyin 真实账号写操作、profile 开关修改、渠道发送模式切换。
7. Android 权限扩大、FGS/OEM 后台行为改变、安装/升级、重启、force-stop、kill/reboot 故障注入。
8. 生产 DB 写入/删除/迁移、生产源码/配置修改、staging、部署或重启。

## 9. 本次审计边界

- 仅读取 GitHub 仓库元数据、分支、compare、文件树、代码/文档和 Actions 元信息。
- GPT 未运行 Node 测试、Android 构建、真机测试或真实渠道调用。
- 未修改产品源码、插件配置、生产 profile、数据库或 Android 权限。
- 本报告是当前审计快照；所有 HEAD、分支、Actions 状态均应在下一次代码操作前重新核对。
