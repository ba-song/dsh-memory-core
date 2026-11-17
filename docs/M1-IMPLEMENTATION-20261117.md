# M1 第二轮修复交接与验收说明

## 基本信息

- Repository: `ba-song/dsh-memory-core`
- Branch: `feat/m1-preference-memory`
- Base main: `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`
- 第二轮修复已写入开发分支；验收时请以远端分支 HEAD 为准。
- 本轮只修改 GitHub 开发分支；未修改 main、生产源码、生产配置、生产数据库或运行服务。
- 未部署、未迁移、未重启、未同步 SD 卡。

## 用户确认的设计决策

1. 默认召回采用当前视图：不传 `asOf` 只返回当前有效记录；显式传入 `asOf` 才查询历史时间窗。
2. 偏好合并与修订使用 SQLite `BEGIN IMMEDIATE` 事务；旧记录修订和新候选状态变化必须一起提交或一起回滚。
3. 长期偏好只由独立 `dy-preference` 块注入；通用 remembered 不再注入任何 `preference`。
4. 非长期 preference（temporary / unspecified）不进入 remembered 常驻块。
5. 只有明确持久性证据才能将 preference 标记为 long_term；单独出现“偏好、习惯、默认、固定、通常”等词不构成长期证据。

## 第二轮修复内容

### I1 — 原有测试同步
- `tests/asof.test.mjs` 更新为验证默认当前视图只返回当前有效版本；显式 asOf 仍能查询历史版本。
- `carryover`、`inject-b1b`、`inject-safety`、`prestep` 测试不再假定 owner 只有一个 context；改为按 context name 验证 `dy-preference` 和 `dy-memory-stable`，并检查同 sid 不重复挂载。

### I2 — 合并原子性
- `lib/pref/merge.js` 使用 `writeTx` 的 `BEGIN IMMEDIATE`。
- 事务内直接完成 CAS revision 检查、`memory_revisions` 快照、旧记录更新和候选状态更新。
- 任一 SQL 写失败会回滚整个事务。
- P4 对明确长期 preference 先以 `pending` 落库；合并成功后在同一事务内激活、合并或 supersede。事务失败时保留 pending，不让未完成候选作为第二条 active 记忆注入。
- 不新增 DDL，不改 schema version。

### I3 / I4 — 注入职责
- `pickRemembered` 对所有 `kind='preference'` 跳过。
- 长期偏好由 `dy-preference` 单独注入。
- 临时和持久性未明确的 preference 不进入 remembered。
- relation / skill 等原有类别继续按旧规则处理。

### I5 — 抽取正则
- 恢复排除真实换行的字符类 `[^\n…]`。
- 新测试覆盖 ASCII 字母 n、换行截断。

### I6 — 持久性分类
- 移除“偏好、习惯、固定、默认、通常”等宽泛词作为长期证据。
- 保留明确时长/持续性标记，如“长期”“一直”“始终”“以后每次”“往后每次”“今后每次”等。
- 临时标记优先于长期标记。
- 不包含任何偏好主题词表或表达风格词表。

### 额外修复
- `preferenceDone` 从 WeakSet(agent) 改为按 session id 去重，避免 agent 重建时重复挂载同一个偏好 context。
- 默认 recall 的当前视图过滤 `valid_from` 尚未生效及 `valid_to` 已过期记录；asOf 历史查询保留历史时间窗语义。

## 新增第二轮专项测试

新增 `tests/preference-second-round.test.mjs`，覆盖：
- 单独的“偏好/习惯/默认”不升级为长期；
- 明确长期表达可以升级；
- ASCII n 与换行抽取边界；
- 长期、临时、未确认 preference 均不进入 remembered；
- 使用 SQLite trigger 人为制造合并第二步失败，验证事务回滚：旧记录 revision/evidence 不变，候选仍 pending，active 重复记录数不增加。

原有 preference 专项测试和全量测试也必须复跑。

## 必须由 DSH 独立完成的审核

1. 在全新 `/tmp` 目录克隆此分支，核对实际 HEAD、main 基线和 diff。
2. 在与上一轮相同或更完整的宿主依赖环境运行 `npm test`，保留完整原始输出、Node/npm 版本、退出码。
3. 验证所有原有失败已消除，且没有新增失败。
4. 复跑新增 `preference-second-round.test.mjs`，确认 trigger 故障注入确实回滚整个事务。
5. 检查 pending → active / merged 的所有路径；重点确认异常后 pending 记录可诊断、可恢复，不会永久静默丢失。
6. 检查不同 SQLite connection 并发写入时 `BEGIN IMMEDIATE` 的行为；确认 BUSY 重试策略符合宿主调用方式。
7. 验证长期 preference 只在 dy-preference 出现；临时/未确认 preference 不在 remembered。
8. 验证 owner/contact/group 隔离、3 条/180 字上限、空块行为。
9. 验证默认当前视图与显式 asOf 历史视图；keyword / semantic / graph 三路都必须服从有效 id 集合。
10. 检查 source、tests、docs、prompt 没有固化具体说话风格、主题词表或人格约束。
11. 只使用合成数据和临时数据库。不得读取或写入生产 memory.db。

## 权限边界

本轮 DSH 只读审核。不得修改 GitHub 分支、main、生产源码、配置、数据库；不得部署、迁移、重启或同步。发现问题只报告，不自行修复。

## 验收报告

请给出：
- 实际 HEAD SHA、main SHA、diff stat；
- 全量测试原始输出、测试汇总和退出码；
- 原失败 5 项是否全部解决；
- I1–I6 逐项结果；
- 原子性故障注入、并发/CAS、scope 隔离、注入去重、正则、分类和 asOf 专项证据；
- 剩余问题、严重程度和生产风险；
- 最终结论：通过 / 有条件通过 / 不通过；
- 是否建议进入部署准备阶段。

不得因为 ChatGPT 已提交修复而预设通过。以实际运行结果为准。


---

# M1 第三轮修复交接（2026-11-17）

## 本轮边界

- 仅修改 `feat/m1-preference-memory` 开发分支；未修改 `main`。
- 未修改生产源码、profile、数据库或服务；未部署、未重启、未同步。
- 未执行任何存量偏好回填或归档；57 条存量 preference 仍待主人逐条授权。
- 未新增 DDL、schema version、依赖；未修改 dyMemory 服务契约、工具参数签名或人格插件。
- 未写入具体用户偏好正文、风格词表或 prompt 规则。

## T1–T6 改动清单

### T1 — 测试语义修正
- `tests/carryover.test.mjs`：修复 `assert.ok` 括号与 message 参数位置。
- `tests/inject-b1b.test.mjs`：remembered 测试使用 relation 数据，保留原有注入验证。
- `tests/remembered.test.mjs`：默认测试数据改为 relation；增加 persist 长期 preference 被跳过及 `preference-managed-separately` 原因断言。
- `tests/scope.test.mjs`：scope 注入隔离测试使用 relation 数据，保留原 scope 行为断言。
- 未删除测试或减少 assert 断言数。

### T2 — hits 去重
- `lib/inject/hits.js` 新增 `filterPersistentPreferenceHits` 纯函数。
- `lib/index.js` 在 recall 返回后、hits/quotes/provenance 三个块构建前统一过滤。
- 仅过滤 `kind='preference'` 且 `meta.persist=true`、`meta.persistence='long_term'`；meta 缺失或解析失败时保守保留。
- recall 公共接口及主动召回工具未过滤。

### T3 — P4 串行化
- `lib/ingest/p4.js` 新增模块级 Promise 写队列。
- `ingestCandidate` 整个执行体进入同一队列，包含 embedding、所有提前返回及写入步骤。
- 不修改全局 `writeTx`。

### T4 — pending 状态与重试
- `dy_memory_auto_list` 增加 `status`、`retryCount`、`lastError`，保留原有字段。
- 新增 `lib/pref/retry.js`：只扫描明确长期 preference pending，每次最多 3 条；与 P4 共用写队列；每条最多重试 3 次。
- 记录 `retryCount`、`lastRetryAt`、`lastError`；达到上限设置 `needsReview=true` 并告警。
- 插件挂载完成后延迟 30 秒执行一次；不阻塞启动，失败保留 pending。
- 普通 conflict pending 不满足查询条件，不会进入该重试路径。

### T5 — 长期偏好名额分配
- `lib/inject/preference.js` 保持 180 字预算和最多 3 条。
- 1 个近期证据槽：按 `meta.lastEvidenceAt`，缺失时回退 `created_at_epoch`；近期槽要求 confidence ≥0.6、文本非空、长度 ≤60 且不含占位符。
- 2 个稳定重要性槽：`pinned DESC`、`importance DESC`、`id ASC`。
- 近期槽与稳定槽去重；超预算候选跳过并继续补位；不使用 `last_access_epoch` 作为近期证据。

### T6 — 专项测试与文档
- 新增 `tests/preference-round3.test.mjs`，覆盖名额、预算、确定性、hits 过滤、主动 recall、pending 重试、重试诊断、混合句分类、P4 并发及旧 preference 兼容。
- 本文档记录改动范围、测试命令和已知残留。

## 测试状态

**ChatGPT 未运行测试。没有测试通过数字或通过结论。**

请 DSH 在全新临时目录克隆该开发分支后运行：

```bash
DY_MEMORY_DIR=/tmp/m1-round3-test npm test
```

请保留 Node/npm 版本、完整原始输出、测试总数、通过/失败/跳过数及退出码。测试结果以 DSH 实测为准。

## 已知风险与残留

1. `lib/clarity.js:78-80` 仍有裸 UPDATE（无事务）。
2. `lib/consolidate/daily.js` 仍逐条调用 `insertMemory`，每条各自事务。
3. `lib/maintain/snapshot.js:104` 的 `VACUUM INTO` 仍可能与写入窗口冲突；现有 busy_timeout/重试只能缓解，不能视为已消除并发风险。
4. P4 Promise 队列只保证同一 Node 进程内串行；其他进程或实例仍依赖 SQLite 锁与 busy_timeout。
5. pending 每次启动最多扫描 3 条、每条最多重试 3 次；达到上限转为 `needsReview`，需人工处理。
6. hits 过滤只覆盖自动注入通道；主动 recall 工具仍可查到长期 preference，这是有意保留的行为。
7. preference merge 仅支持归一化后的同键比较，不做近义语义合并。
8. merge 事务与 pending 重试的完整行为仍需 DSH 在目标 Node/SQLite 宿主环境验证。

## DSH 复验要求

- 确认本轮实际 HEAD、main 基线及 `git diff main...HEAD --stat`。
- 运行全量 `npm test`，不可删除、跳过或弱化失败测试。
- 重点复验 4 个旧失败、hits/quotes/provenance 去重、普通 preference recall、pending 故障注入与恢复、auto_list 字段、P4 并发 20 轮、名额预算与确定性、混合句 temporary 优先。
- 检查所有变更 diff，确认没有生产配置/人格/prompt/具体偏好正文或 schema 变更。
- DSH 只读验收；生产部署与存量数据回填必须另行授权。
