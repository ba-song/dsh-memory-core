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
