# REPORT-0015 · Memory 有效性复核、EI-2 设计裁决与平台状态同步

## 2026-11-21 · GPT 统筹复核 · HANDOFF-0058

> 本轮覆盖 Memory 的 validity review-fix 后续复核、EI-1/EI-2A 前置审查，以及 Android/Autonomy v4 状态保留。
> 只修改 GitHub 隔离开发分支源码/设计文档与协调报告；未访问或修改生产 DB、生产插件目录、profile/config；未部署、未重启、未启动 staging。

## 1. Memory：统一有效性谓词与 uncertain 语义

### 1.1 Memory 智能体本轮交付

- 仓库：`ba-song/dsh-memory-core`
- 分支：`feat/memory-validity-unified`
- Memory 智能体提交：`4b4f92751b6c8cc41c0935fc2b4c267cd9cbd4c9`
- 专项报告：`MEMORY-REPORT-0005`
- 报告 commit：`9f04ed3ef9c5ab8073f6fc3f417617007de1ea65`
- 报告 blob：`949e2512893445db778443b3988acc5927668c73`

已完成修正：
1. FTS bigram/trigram 子查询移除额外硬编码 `status='active'`，状态域由统一 validity helper 决定；as-of 可查 archived/expired，pending/merged 仍排除。
2. `uncertainRows` 增加 as-of 时间窗口：`created_at_epoch<=at`、`valid_from IS NULL OR valid_from<=at`、`valid_to IS NULL OR valid_to>at`。
3. 新增 FTS-only 与 uncertain 时间边界回归测试。

Memory 智能体提供的隔离测试证据：
- 新增定向测试 5/5；
- 受影响 8 个测试文件 46/46；
- 全量 `npm test`：297/297、0 fail、0 skip；
- 负向对照：恢复 FTS 硬编码 1 例失败；移除 uncertain 时间窗 2 例失败。
- 这些是 Memory 智能体报告的本地隔离证据，不是 GPT 在本轮亲自执行的测试，也不是生产验证。

### 1.2 GPT 复核发现与后续修正

GPT 检查 `lib/recall/recall.js`、`lib/store/graph.js` 后确认：

- `asOfHistory` 允许用 `created_at_epoch` 近似缺失的 `valid_from`，并通过 `validFromApproximated` 明确标记。
- 图谱 `unknownHop` 是单独的保守候选路径，不能与普通关键词 top-N 候选混为一谈。
- 旧逻辑把普通关键词候选也交给 `TEMPORAL_UNKNOWN_SQL`；因此一条仅因 top-N 截断未进入结果、但可按 created_at 近似的记录，可能被错误标为 `unknown-validity`。

GPT 已在同一隔离分支提交两项修改：

| Commit | 内容 |
|---|---|
| `697de1ee11ec12fb41d2d5a701851635c9192827` | `unknown-validity` 只适用于 graph 明确产生的 `unknownHop`；`superseded-without-end` 仍检查全部相关候选 |
| `b4606e1c66f1afb94cb154b7ec96423103477029` | 新增 top-N 回归测试，防止近似有效关键词候选因排名截断而误报 uncertain |

最新已核对的文件 blob：
- `lib/recall/recall.js`：`75b4fb7f184e1c614d8056ce7ab39f6d650a6f28`
- `tests/asof-graph-uncertain.test.mjs`：`28425c24c1f516305dd69bc9dc5ab4b63da13edb`

### 1.3 当前状态

**状态：等待 Memory 本地复验。**

GPT 两个新提交尚未经过 Memory 专项本地复跑，不能标记 PASS。预期测试数约 298 项，以实际执行结果为准。

已向负责人提供转交给 Memory 智能体的验证提示词（WritingBlock ID `62041`），要求：
- 定向与全量测试；
- 两组负向对照：top-N 误报守卫、graph unknownHop 保留；
- 工作区与 blob 核验；
- 通过后更新 Memory 专项报告为 MEMORY-REPORT-0006。

未合并主开发分支，未写生产 DB，未部署、未启动 staging。

## 2. EI：EI-1 收口与 EI-2A 实施前设计裁决

### 2.1 EI-1

- 仓库：`ba-song/dsh-persona-core`
- EI-1 代码验收目标：`3a1376184491d94b02d4c3ad4990a957e85acb48`
- 当前修订分支起点：`1572e49ce0fd9c713f119ff8300af91db3c2bb1e`
- source blob：`cf033ec8400ea38e717481a46a5bfe834276a4a5`
- tests blob：`eb17cb0f2c67450a145f38d1a582bef6d90b07c8`

EI-REPORT-0004 记录的复验结果：
- 定向 21/21；
- 全量 324/324；
- 0 fail、0 skip；
- 工作树 clean、`git diff --check` 通过。

结论只能写：**EI-1 代码隔离验收 PASS，DSHA/负责人设备复验 NOT RUN**。不代表生产集成 PASS。

### 2.2 EI-2 设计文档修订

GPT 已更新 `EI-2-PERSISTENCE-DESIGN-01.md`：

- 文档提交：`8ccb8a922a789d8d15157b9d99f9de0c20c8807b`
- 新 blob：`670e5a34a1916a8b104ebfd1004b525236677d4c`

本轮设计裁决：
1. **B1 confidence**：`emotion_appraisal` 与 `emotion_appraisal_items` 增加 `confidence_kind` / `confidence_source`；区分 unknown、rule_default、calibrated、legacy_unclassified。旧数值不反推来源。
2. **B2 dedupe_key**：旧 event 行回填公式冻结为 `legacy:event:<event_id>`；保留已有非空 key，迁移 fixture 必须证明唯一、幂等、不覆盖。
3. **D3 生命周期**：`effective_end_at = min(non-null ended_at, expires_at)`；较早者退出，end_reason 只解释显式结束，不延长自然到期。
4. **D1 owner ID**：建议跨受信任设备共享的 opaque UUID，不直接绑定 DSH 登录 ID/手机号/外部账号；最终由负责人确认。EI-2A 可先用 unknown/空 ID。
5. **D2 third_party**：会话内 opaque 临时 ID，不跨会话关联，不默认读取联系人 ID。
6. **D4 旧 348 条**：先全部 unknown；known-self/owner/third_party 只做 shadow 候选统计，不自动升级。
7. **D5 0.65/0.45**：保留为未校准工程 shadow 阈值，不作为心理学真值。
8. **D6 legacy fallback**：旧 self 视图必须带 `legacyFallback:true`，不得成为可信 self 注入。
9. **D7 outbox/inbox**：EI-2A 不建、不运行，相关 DDL/传输/ACK/重试留到 EI-2D。

新增独立报告：
- `EI-REPORT-0005.md`
- 分支：`ei/pre-ei2a-review-01`
- commit：`4992a313f72326caa4b5e84558005a53db239af0`
- blob：`e23d98c920f1a9979e1e83400123288e3ee8c88f`

### 2.3 当前状态与门禁

- EI-1：代码隔离 PASS；设备复验 NOT RUN。
- EI-2：设计文档已补齐 B1/B2/D3，其他决策已按上表收口。
- D1 owner ID 等待负责人最终确认。
- **EI-2A 未获授权、未启动**。
- 未修改 Persona 生产 DB/插件目录/profile/config；未部署、未重启、未启动 staging；未合并 main。

## 3. Android 与 Autonomy：v4 设计对齐继续保留

两条线当前没有运行中的任务，但仍是项目主线，不得因 Memory/EI 优先推进而搁置。

### Android v4
- commit：`3dd5d321929b8f3e308663f48bc55292bce4de8a`
- blob：`76924c81f6b5b165e55dd797f3927408b84bfac9`
- 后台恢复协议 v4 与 Autonomy v4 已完成设计对齐。

### Autonomy v4
- commit：`1925037998a301550e96112e042ed6eb05df2440`
- blob：`26584df51148547baa357b109bf55aac43865ac0`
- 关键约定：请求一文件、回执不自动清理、原始字节 SHA256、60 秒半写观察窗、80% 告警每天最多一次、BACKPRESSURE 后 6 小时仅紧急请求、ledger 明细 TTL 与永久 tombstone 分离。

两线仍未完成 DSHA 真机 kill/reboot、双 worker、目录 watch、fsync、ENOSPC、f2fs 发布路径和 staging 验证。下一阶段目标是推进真实设备验证前置工作，但不得擅自启动 staging、真机压力测试或生产变更；需要负责人明确安排/授权。

## 4. 本轮副作用与下一步

### 已完成
- Memory 隔离分支代码/测试修改（GPT 提交，等待 Memory 专项验证）。
- EI-2 设计文档修订与 EI-REPORT-0005。
- 本报告与 HANDOFF 状态同步。

### 等待
1. Memory 智能体复跑 GPT 两个新提交并回报 MEMORY-REPORT-0006。
2. D1 owner ID 最终确认；EI-2A 仍等待负责人当前对话明确授权。
3. Android/Autonomy v4 真机验证仍待后续安排与授权。

### 未做
- 未写/迁移/删除生产 DB；
- 未改生产源码、profile/config；
- 未部署、未重启、未启动 staging；
- 未合并 Memory 或 Persona 主开发分支；
- 未执行 DSHA 真机后台恢复测试；
- 未将 EI-1 隔离测试结果表述为生产通过。


---

## 2026-11-21 · GPT 统筹复核 · REPORT-0016（对应 HANDOFF-0059）

### 1. Memory：strict graph diagnostic lane 隔离复验 PASS

- 仓库：`ba-song/dsh-memory-core`
- 分支：`feat/memory-validity-unified`
- 验收 HEAD：`c437c460d8378cbf6493a5e4e12d673c4334d50f`
- 提交链：`b4606e1c66f1afb94cb154b7ec96423103477029` → `d6521c10d8ff4c01cdaa0cd5712f3921b7ac43b4` → `1d0a163c3878208af8f9f523dd56575cc4b06687` → `c437c460d8378cbf6493a5e4e12d673c4334d50f`
- Memory 专项报告：`MEMORY-REPORT-0007`；commit `5109676ac15a06e830ea15df2a5cfe77b9b19506`；blob `1eca4afcaa8e5606b2193a0451b6c9d08d0c1da7`。

GPT 独立核对：
1. GitHub compare 确认分支相对 `b4606e1` ahead 3、behind 0，修改范围仅 `graph.js`、`recall.js`、`asof-graph-uncertain.test.mjs。
2. 分支 HEAD 确认是 `c437c460d8378cbf6493a5e4e12d673c4334d50f`。
3. 三个文件当前 blob 分别为 `94a196c27455a0a8601ef40889352eb46d2086ac`、`6fda81efb6cc21ef5f9daf913ceea944e5bb2dbb`、`3a0d514661643fd34db804f9492620223b39c9f3`，与报告一致；并确认 hopStrict、recall strict lane 和 hop/hopStrict 重叠断言存在。

Memory 智能体报告的隔离测试证据：
- 定向：2/2、5/5、1/1、13/13；
- 完整有效性集合：47/47；
- 全量 `npm test`：**298/298、0 fail、0 skip、exit 0**；
- 三组负向对照 A/B/C 均按预期失败，恢复后测试全绿。
- 测试执行主体是 Memory 智能体；GPT 本轮未亲自运行 Node 测试。此证据不等同生产验证。

**裁决：C 方案（普通 hop + 独立 hopStrict 诊断通道）隔离开发验证 PASS。**

### 1.1 残留风险（不阻塞本轮）

- `candidateIds` 仍通过 `g.unknownHop` 兼容别名取候选，而 `unknownIds` 使用 `g.hopStrict ?? g.unknownHop`；当前是同一 Map，建议后续统一。
- `hopStrict` 状态域仍限定 `status='active'`，与 asOfHistory 允许 archived/expired 的范围不一致；需独立裁决。
- preference / session-index / remembered / merge / daily / weekly / brief 等其他调用点尚未接入统一 validity helper。
- 生产 as-of **NOT RUN**；本轮未触碰生产 DB/插件目录/profile/config，未部署、重启、启动 staging，未合并主开发分支。

### 1.2 下一步

- 本轮只完成 strict graph lane 验证与共享状态同步；不自动扩大到其他调用点。
- 后续可按风险分批规划其他 Memory 调用点接入；生产 as-of、主线合并、部署/迁移均需单独评估与负责人当前授权。
- EI、Android、Autonomy 维持原状态；Android/Autonomy v4 设计对齐继续保留主线，当前无任务运行，真实设备验证待后续安排与授权。


---

## 2026-11-21 · GPT 统筹只读审查 · REPORT-0017（对应 HANDOFF-0060）

### 1. 审查范围

基于 `feat/memory-validity-unified` @ `c437c460d8378cbf6493a5e4e12d673c4334d50f`，只读核对七个剩余调用点与统一 helper：
- `lib/inject/preference.js` blob `086b3e180050c1156af12b05affd89dbad69c8df`
- `lib/inject/session-index.js` blob `355eb7a1bbc88d86e692b13f0bc511359cd0f33a`
- `lib/inject/remembered.js` blob `dc11425f2cdcc78ff5b9b86418b2fb44b5666ad5`
- `lib/pref/merge.js` blob `2a801eefb4647b8ce3d1e31e2c1c0ad43e92cdf9`
- `lib/consolidate/daily.js` blob `643d8026bf482dc0a5c76db9be8243f7ef77059a`
- `lib/consolidate/weekly.js` blob `a2d1178196f89dfd46d64f79f6e4136b76e6436f`
- `lib/handoff/brief.js` blob `0a111c003f2e0ac8cad746d5f16f2b412381555a`
- helper `lib/store/validity.js` blob `00c4d948ccb2973d48d95aebb07d230c8f44854c`

### 2. 关键发现

- preference 与 remembered 是最适合先做的只读调用点：现有 active + valid_to 过滤缺少 valid_from/superseded_by 统一检查，可评估 current helper 接入；remembered 需要增加可注入 now 以稳定测试。
- session-index 的 todo 支持 active/空字符串状态；handoff brief 的 project todo 支持 NULL/空/active。helper current 只允许 active，机械替换会改变旧数据兼容行为。decisions 表不属于 memories。
- preference merge 的 incoming candidate 允许 pending，不能对 candidate 直接使用 current preset；旧记录候选查询可考虑 helper，但要保护事务、scope、conflict_queue、revision/CAS 语义。
- daily 的 existing 候选查询可考虑 current helper；exact-text duplicate guard 是另一种全局去重语义，不能无差别套 helper。日结另含 LLM、文件、profile、短期记忆和DB写入副作用。
- weekly 既有候选查询又有 supersede 写路径；必须同时处理事务内 UPDATE 条件、revision 快照、valid_to 与旧 schema fallback，风险最高。

### 3. 建议顺序

| 批次 | 调用点 | 主要边界 |
|---|---|---|
| A | preference + remembered | 只读注入，优先使用 current helper，保持 scope/meta/排序/预算 |
| B | session-index + handoff brief | 先裁决 legacy todo status 兼容，再接 helper |
| C | preference merge | 单独审查事务候选与 pending 激活语义 |
| D | daily consolidate | 仅处理 existing 候选查询，不碰其它副作用 |
| E | weekly consolidate | 最后单独处理事务、CAS、历史快照与 fallback |

### 4. 状态与授权

- 本轮是只读审查，没有修改源码、测试、生产数据或插件配置。
- 以上 Batch A–E 均为建议，不视为已授权实施。
- 推荐下一步先推进 Batch A；需负责人明确授权后，才启动 GPT 隔离分支代码修改与 Memory 智能体本地验证。


---

## 2026-11-21 13:22 · GPT 统筹复核 · REPORT-0018（对应 HANDOFF-0061）

### 1. Memory Batch A：preference + remembered 接入统一 current validity

- 仓库：`ba-song/dsh-memory-core`
- 分支：`feat/memory-validity-unified`
- 基线：`c437c460d8378cbf6493a5e4e12d673c4334d50f`
- 验证 HEAD：`5797324175f345ff82337f409d8406e5256ddfc3`
- compare：ahead 4、behind 0；变更仅四个预期文件。
- Memory 专项报告：`MEMORY-REPORT-0008`；commit `08835ca19fbeca1823be4b72b32adc7fac128b14`；blob `06515f1fd05ed54483a98c1cf67025caff3e9749`。

GPT 独立核对：
1. `lib/inject/preference.js` blob `d28bacc5a0c1477a751dada0040243581213b4e5`。
2. `lib/inject/remembered.js` blob `4d3a5f2af4e61531581ed01fe778dffdd567f14e`。
3. `tests/preference-inject.test.mjs` blob `08f170ce8ddf7cb4907ebec77c38fc18666454c6`。
4. `tests/remembered.test.mjs` blob `3bf6dbf49cf6062e9e39e41810bd629219ac8f35`。
5. helper `lib/store/validity.js` blob `00c4d948ccb2973d48d95aebb07d230c8f44854c` 未变。
6. compare 确认恰好四个提交、四个文件，无其他变更。

代码语义复核：
- preference recentRows/stableRows 共用同一个 `validitySql({preset:'current',at:Number(now)})` 结果，参数先 validity 后 scope。
- remembered 同样接入 current helper，`now` 可注入且默认 `Date.now()`。
- scope、kind、meta persist、排序、去重、预算、最大条数、跳过原因、DB异常返回结构保持原有约定。
- future valid_from、已过期、superseded 记录不进入当前注入。
- Memory 智能体两组负向对照恢复旧过滤后均能复现泄漏与测试失败；恢复后定向测试全绿。

### 2. 测试证据

以下均由 Memory 智能体在隔离 worktree 执行并报告，GPT 未亲自运行 Node 测试：
- 定向：2/2，exit 0。
- 相关回归：16/16，exit 0。
- 全量 `npm test`：**298/298、0 fail、0 skip、exit 0**（恢复后再次运行同样通过）。
- 两项负向对照按预期失败；逐字节恢复后定向测试通过。
- `git diff --check` exit 0；工作树与 HEAD 一致。报告中的 `?? node_modules` 为复用依赖目录的符号链接，不是源码修改。

**GPT 裁决：Batch A 隔离开发验证 PASS。** 不等同于生产运行时验证、主线合并或部署通过。

### 3. 非阻塞观察与后续范围

- P3：显式传入非法 `now`（如 0/null）会令 helper 抛出时间戳错误，并被注入调用方捕获为空结果；现有已知调用路径传有效 `Date.now()` 或使用默认值，暂不阻塞本批次。可在后续单独决定是否统一入口防御策略。
- 尚未接入的调用点：session-index、handoff brief、preference merge、daily、weekly。
- 下一建议为 Batch B（session-index + handoff brief），**尚未获负责人明确授权，不启动修改**。
- 未写生产 DB，未修改生产插件/profile/config，未部署/重启/staging，未合并主线；未触碰 EI/Persona、Android、Autonomy。


---

## 2026-11-21 · GPT 统筹复核 · REPORT-0019（对应 HANDOFF-0062）

### 1. Memory Batch B：session-index + handoff brief 接入统一 current validity

- 仓库：`ba-song/dsh-memory-core`
- 分支：`feat/memory-validity-batch-b`
- 基线：`5797324175f345ff82337f409d8406e5256ddfc3`
- 验证 HEAD：`2a93031db3dfa1a1c7c34b7376aebe395493c57f`
- Tree：`3d5e305ecf53f70b6f6090e4514346b8ce54ef91`
- GitHub compare：ahead 11、behind 0；六个预期文件变更。
- Memory 专项报告：`MEMORY-REPORT-0011`；commit `a8454b87bc3fdd45bbc755dfff532056120599c7`；blob `f04a7ea62df8bed4d8829c20bf29800bf514ef22`。

### 2. GPT 独立复核

GPT 实际读取专项报告、六个变更文件和 GitHub compare，核对 HEAD、tree、blob 均与报告一致。业务语义核对结果：

- session-index episode 使用 current；todo 使用 `currentTodoActiveEmpty`，保留 active/空字符串旧状态域，并统一过滤 valid_from、valid_to、superseded_by。
- handoff brief 项目 todo 使用 `currentTodoLegacy`，保留 active/空字符串/NULL兼容状态域和 project_id 限定；owner 标签统计使用严格 current。
- decisions 不属于 memories，保持原查询。
- owner scope、项目隔离、排序、LIMIT、文本截断及只读行为保留。
- validity fixture 的 try/finally 清理和 session-index future/superseded todo 断言均已在实际 blob 中核实。
- 三个测试文件没有 SQL `status=NULL` fixture；NULL差异由 JS 镜像覆盖。

### 3. 隔离测试证据（由 Memory 智能体执行）

GPT 未亲自运行 Node 测试。Memory 智能体第三轮报告：

- 定向测试：session-index 1/1、handoff 1/1、validity 23/23。
- validity 连续三次：23/23 × 3。
- 相关七文件回归：19/19。
- 全量 `npm test`：**300/300 × 3，0 fail、0 skip、exit 0**。
- 八组负向对照全部按预期失败；恢复后逐字节一致。
- `git diff --check` exit 0。
- 前两轮发现的共享 DB fixture 污染和 session-index todo 覆盖缺口均已修复并复验。

**GPT 裁决：Batch B 隔离代码验收 PASS。** 这不是生产运行时验证、集成、主线合并或部署 PASS。

### 4. 风险、未执行事项与下一步

- `doctor.test.mjs` 历史环境 flake 本轮三次全量均未复现；该文件不在本批 diff 中。
- 生产 DB / 生产插件 / profile / config 未触碰；生产 as-of、设备验证、staging、集成、合并、部署均 NOT RUN。
- 尚未接入调用点：preference merge、daily、weekly。
- 下一建议批次为 **Batch C：preference merge**，必须等待负责人另行明确授权；不因 Batch B PASS 自动启动。
- Android / Autonomy v4 仍保留在整体计划，真实设备验证另行安排与授权。
