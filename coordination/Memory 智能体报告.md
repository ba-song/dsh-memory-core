# MEMORY-REPORT-0001 · Memory 记忆智能体报告（P4 时间有效性隔离验收）

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 本轮任务：`MEM-P4-TEMPORAL-VERIFY-01`（P4 邻居检索 active + 时间边界过滤隔离验收）
> 仓库：`ba-song/dsh-memory-core`｜分支：`fix/p4-active-neighbors-semantic-opposition`｜目标 commit：`1635ccbaff07ba70d6e42f286ff724b8e55234aa`
> 迭代规则：本文件覆盖式更新、版本号递增（MEMORY-REPORT-0002…），不新增同类文件。
> 最近更新：2026-11-21 10:1x (Asia/Shanghai) · v1
> 边界：仅 `dsh-memory-core`；未涉及 Persona/EI；未改源码/测试/共享交接文件；未触碰生产。

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001 | 2026-11-21 10:1x | 首版：P4 时间边界修复隔离验收（1635ccb） |

---

## 1. 基线（已核实）

| 项 | 实测值 | 证据 |
|---|---|---|
| 目标分支 HEAD | `1635ccbaff07ba70d6e42f286ff724b8e55234aa`（2026-11-21 10:09:07 +0800，`test(memory): retain memories valid until a future timestamp`） | `git ls-remote` + `git log -1` |
| 主开发基线 | `feat/m1-preference-memory` @ `7548e49ed0b8d8673818464325d8e72ec7704b27` | `git ls-remote` |
| 分支相对开发分支 | 领先 **9** 个提交；仅改动 3 个文件 | `git log 7548e49..1635ccb`、`git diff --name-only` |
| 本轮新增提交（相对 d9d50ac） | `53c27b6` fix、`0d1a03b` test、`bc241d5` fix、`1635ccb` test | `git log d9d50ac..1635ccb` |
| 本轮 diff 规模 | `lib/ingest/p4.js` +10/−4；`tests/p4.test.mjs` +10/−1 | `git diff --stat d9d50ac 1635ccb` |
| `lib/ingest/p4.js` blob | `f39adebc92ce1222b355f2082ade64d2f16592e9` | `git rev-parse 1635ccb:<path>` |
| `lib/ingest/conflict.js` blob | `cb960430d163d1c40be60a778162af19b5904ce4`（**与 d9d50ac 完全相同**） | 同上 |
| `tests/p4.test.mjs` blob | `9c2c9f8031b6a43539026d1a7404defd6c30f283` | 同上 |
| coordination HEAD | `de9b319ea1d747aa76e90d488ad315c1970c9e39` | `git ls-remote` |
| `coordination/HANDOFF.md` | blob `f8ffa40d4c27c04d23ff74b123bf2b7044821976`（229,420 B，最新章 `## 54` = HANDOFF-0057） | `git rev-parse` |
| `coordination/REPORT.md` | blob `e219f707cc4363c53704fbe389f786148142326e`（7,387 B = REPORT-0014） | 同上 |
| CI（目标 commit） | `check-runs.total_count=0`；`status.state=pending`、`statuses` 长度 0 | `gh api .../check-runs`、`gh api .../status` |
| 环境 | Node `v24.19.0`、`node:sqlite`（SQLite 3.45.1）、BGE 模型 `/opt/qqai/models/bge-small-zh` 存在 | `node --version`；模型目录存在性检查 |

**重要事实**：目标 commit `1635ccb` **尚未写入 HANDOFF/REPORT**（HANDOFF 仍为 0057、REPORT 仍为 0014，blob 与上一轮一致）。本报告是本轮唯一结构化记录。

---

## 2. 本轮任务与边界

任务：独立核验 P4 邻居检索的「有效状态 + 时间边界」过滤，重点 7 项（见 §3）；只负责 Memory，不涉及 Persona/EI。

执行边界（全部遵守）：
- 在独立临时 worktree `/tmp/memaudit/p4v2`（detached @ 1635ccb）检查与测试；`node_modules` 以符号链接复用到既有 `/tmp/dsh-memory-core/node_modules`，**未安装、未升级任何依赖**。
- 未修改源码、测试、配置；worktree `git status --porcelain` 仅 `?? node_modules`（符号链接）。
- 未合并、未部署、未启动 staging、未重启 DSH、未连接生产数据库。
- 未修改 `HANDOFF.md` / `REPORT.md` / `PROJECT.md`；本文件为**新增**会话报告。

---

## 3. P4 时间有效性代码核查

### 3.1 变更内容（d9d50ac → 1635ccb，仅 `lib/ingest/p4.js`）

预过滤（向量 Map 过滤前）：

```sql
SELECT id FROM memories
WHERE status='active'
  AND (superseded_by IS NULL OR superseded_by=0 OR superseded_by='')
  AND (valid_to IS NULL OR valid_to > ?)
  AND (valid_from IS NULL OR valid_from <= ?)
-- .all(Number(sourceTs), Number(sourceTs))
```

最终邻居查询：

```sql
SELECT id,text,kind FROM memories
WHERE id=?
  AND status='active'
  AND (superseded_by IS NULL OR superseded_by=0 OR superseded_by='')
  AND (valid_to IS NULL OR valid_to > ?)
  AND (valid_from IS NULL OR valid_from <= ?)
-- .get(best.id, Number(sourceTs), Number(sourceTs))
```

即：把 d9d50ac 的严格 `valid_to IS NULL` 改为**半开区间 `valid_to > t` **，并新增 `valid_from <= t` 下界；`t = sourceTs`（候选时间）。

### 3.2 逐条判定

| # | 验收点 | 判定 | 证据 |
|---|---|---|---|
| 1 | 只有 active 且未被替代的记忆参与匹配 | **PASS** | `status='active'` + `superseded_by∈{NULL,0,''}`；边界用例 B10（`status=active` 但 `superseded_by=999`）实测被排除，B11（`archived`）被排除 |
| 2 | `valid_from` 晚于候选时间不得提前参与 | **PASS** | `valid_from IS NULL OR valid_from <= t`；B4（`valid_from=t+1ms`）排除；B5（`=t`）参与 |
| 3 | `valid_to` 不晚于候选时间不得参与 | **PASS** | `valid_to IS NULL OR valid_to > t`；B2（`valid_to=t`）排除、B3（`t-1ms`）排除 |
| 4 | `valid_to` 晚于候选时间仍有效 | **PASS** | B1（`valid_to=t+60s`）参与；B7（双边界窗口）参与 |
| 5 | 预过滤与最终 SQL 用同一时间基准与判断逻辑 | **PASS** | 两处均 `Number(sourceTs)`；捕获真实 SQL 后逐字比较时间谓词**完全一致**；结果集等价（见 3.3） |
| 6 | SQL 参数顺序 | **PASS** | 预过滤 2 个占位符、最终 3 个；最终顺序 `id → valid_to → valid_from`，绑定 `(best.id, t, t)`；见 3.3 |
| 7 | conflict.js 分句语义是否引入误判 | **PASS（无新增）** | `conflict.js` blob 与 d9d50ac 完全相同；15 例对抗集错误数与错误集合**一致**（见 §4） |

### 3.3 SQL 一致性与参数绑定证据（设备实测）

方法：用 Proxy 包装真实 `db` 捕获 `ingestCandidate` 实际执行的 SQL（不是抄写源码），再用捕获到的 SQL 对同一临时 DB 求值。

```
prefilter captured: true | final captured: true
prefilter ?count: 2 | final ?count: 3
validity predicate identical: true
param order (pre): true
final WHERE order id→valid_to→valid_from: true
ids prefilter: 1,2
ids final-ok : 1,2
RESULT_SET_EQUAL: true
EXPECTED_SET_OK: true
EXIT=0
```

构造的 5 条记忆（t=T）：①无窗口 → 参与；②`[T-1s, T+1s]` → 参与；③`valid_from=T+1s` → 排除；④`valid_to=T-1s` → 排除；⑤`valid_to=T` → 排除。实际集合 `{1,2}` 与预期一致。
说明：两个 `?` 绑定**同一个值**（`sourceTs`），因此“交换两个时间参数”在行为上不可观测；参数顺序的验证依赖占位符计数 + `id` 必须为第一参数（换序会立即取不到邻居）。

### 3.4 时间边界行为表（14 例，独立脚本，非仓库测试）

脚本：`/tmp/memaudit/tv/time-bounds.mjs`（临时 DB，`/tmp`；不连生产）

| 用例 | 目标记忆 | 候选时间 t | 期望 | 1635ccb | d9d50ac（对照） |
|---|---|---|---|---|---|
| B0 | 无 `valid_from/valid_to` | T | 参与 | PASS | PASS |
| B1 | `valid_to=t+60s` | T | 参与 | **PASS** | **FAIL**（被误排除） |
| B2 | `valid_to=t`（边界） | T | 排除 | PASS | PASS |
| B3 | `valid_to=t-1ms` | T | 排除 | PASS | PASS |
| B4 | `valid_from=t+1ms` | T | 排除 | **PASS** | **FAIL**（提前参与） |
| B5 | `valid_from=t`（边界） | T | 参与 | PASS | PASS |
| B6 | `valid_from=t-1ms` | T | 参与 | PASS | PASS |
| B7 | `[t-60s, t+60s]` | T | 参与 | **PASS** | **FAIL** |
| B8 | `[t+60s, t+120s]` | T | 排除 | PASS | PASS |
| B9 | `[t-120s, t-60s]` | T | 排除 | PASS | PASS |
| B10 | `status=active`、`superseded_by=999` | T | 排除 | PASS | PASS |
| B11 | `status=archived` | T | 排除 | PASS | PASS |
| B12 | `valid_to = now-30min`，`sourceTs` 取 1 小时前 | 过去 | 参与 | **PASS** | **FAIL** |
| B13 | `sourceTs=null` | `Number(null)=0` | 记录行为 | 参与（t=0 语义） | 抛错 |

- 1635ccb：`TOTAL=14 PASS=14 FAIL=0`，`EXIT=0`。
- d9d50ac：`TOTAL=14 PASS=9 FAIL=5`（B1/B4/B7/B12 误判 + B13 抛错）。
- **B12 是关键证据**：它证明实现使用**候选时间 `sourceTs`** 而非 `Date.now()`；若用 `now`，该用例会被误排除。

---

## 4. conflict.js 语义检查

- `lib/ingest/conflict.js` 在本轮 4 个提交中**未被修改**（blob `cb960430…` 与 d9d50ac 相同）→ 本轮不存在 conflict 语义变更。
- 回归验证（同一 15 例对抗集，`/tmp/memaudit/tv/adv-v2.mjs`）：`WRONG=6/15`，错误用例与 d9d50ac **完全一致**（无新增、无减少）：
  - 漏判（修复前同样漏判）：`不吃香菜 / 爱吃香菜`、`爱喝咖啡 / 不喝咖啡`、`不讨厌辣 / 不吃辣`、`熬夜 / 早点睡`、`猫毛过敏 / 养三只猫`；
  - 误判（修复前同样误判）：`喜欢音乐 / 讨厌噪音`（`topicShare` 单字“音”命中）。
- 结论：**本轮未引入新的分句误判**；上述 6 例属既有启发式边界（P2，不在本轮范围）。

---

## 5. 测试执行（DSHA 设备，隔离 worktree）

| 项 | 命令 | 结果 | 退出码 | 日志 |
|---|---|---|---|---|
| P4 定向 | `node --test tests/p4.test.mjs` | tests **1** / pass **1** / fail **0** / skipped **0**；`{"ok":true,"test":"p4","pairs":20,...}`（BGE 模型存在 → 20 对冲突语料**真实运行**，未跳过） | **0** | 见附录 A |
| 全量 | `npm test`（= `node --test tests/*.test.mjs`） | tests **258** / pass **258** / fail **0** / cancelled **0** / skipped **0**；36.7 s | **0** | 见附录 A |
| 负向对照 | 仅把 `lib/ingest/p4.js` 回退为 d9d50ac 版本（scratch 副本，不改仓库） | 新增断言失败：`AssertionError: 3 == 2`（期望 `targetId=currentId`，实际选中 `futureId`） | **1** | 见附录 A |

说明：`tests/p4.test.mjs` 是顶层断言脚本（node:test 记为 1 个测试文件），新增的时间边界断言为其中的顺序断言。
**未把任何未执行测试计为通过**：本轮所有“PASS”均来自上述实际执行。

---

## 6. 尚未解决 / 残留观察（不阻塞本轮结论）

| ID | 观察 | 影响 | 归属 |
|---|---|---|---|
| R1 | 预过滤与最终邻居查询的时间谓词**重复书写**两遍（当前逐字一致） | 后续修改易只改一处而漂移；建议抽 `activeValidityWhere()` 单一来源 | 建议 GPT |
| R2 | `sourceTs=null` → `Number(null)=0`，实际按 epoch 0 过滤（与 `undefined→Date.now()` 不同） | 已核对现有调用方均不会传 null（`index.js:310`、`extract/pipeline.js:32`、`consolidate/daily.js:181`、`multimodal.js:102`） | P2 健壮性 |
| R3 | `sourceTs=NaN` → 写入时 `NOT NULL constraint failed: memories.source_ts` → P4 摄取 promise 拒绝，被调用方 `.catch` 吞为 warn | **既存行为**（d9d50ac 同样抛错）；仅当 `event.time` 非数值时可达 | P2 健壮性 |
| R4 | 若 `best.id` 在预过滤与最终查询之间状态变化导致最终查询落空，代码退回 `insert/no-neighbor`，**不会尝试次优邻居** | 竞争窗口极小；会漏一次冲突检测 | P2 既存 |
| R5 | P4 用「active + superseded_by + 时间窗」，而 recall/preference/session-index 仍用「active + 时间窗」（不看 `superseded_by`） | `superseded_by≠0` 且 `valid_to IS NULL` 的行会被召回但不参与 P4；生产当前 2 行不一致数据均带过期 `valid_to`，暂无实际影响 | P1 跨模块口径（需 GPT 统一） |
| R6 | 每个候选都对 `memories` 做一次全表 `SELECT id ...`（无覆盖索引） | 当前 219 行无感；增长后为 O(N)/候选 | P2 性能 |
| R7 | conflict.js 6 例既有误判/漏判（见 §4） | 与本轮无关，未引入 | P2 既有 |

---

## 7. 结论

**判定：`PASS`（范围限定：源码核验 + DSHA 隔离设备测试 + 时间边界行为）**

- 7 项验收点全部通过（§3.2）。
- 时间边界行为 14/14 符合设计；半开区间 `[valid_from, valid_to)` 语义与 recall 的 B 口径一致。
- 修复真实有效：对照 d9d50ac，B1/B4/B7/B12 由误判转正确；负向对照证明新增测试确实守护该行为。
- 无回归：全量 258/258、0 跳过；conflict.js 未被修改且对抗集错误集合不变。
- **NOT RUN（不属本轮授权）**：GitHub CI（目标 commit 0 个 check-run，workflow 不触发 `fix/*`）；DSH 正式复验（HANDOFF-0058 仍不存在）；合并到开发分支；部署/生产验证。
- **PARTIAL 提示**：R5（跨模块“当前有效”口径未统一）会在 P4 合入后成为系统性不一致，建议合入前由 GPT 决定统一方案。

---

## 8. 证据索引（可复现）

| 用途 | 命令 / 路径 | 退出码 |
|---|---|---|
| 远端 refs / 目标 commit | `git ls-remote origin`；`git log -1 1635ccb` | 0 |
| 本轮 diff | `git diff d9d50ac 1635ccb -- lib/ingest/p4.js tests/p4.test.mjs` | 0 |
| blob 核对 | `git rev-parse 1635ccb:lib/ingest/p4.js` 等 | 0 |
| CI | `gh api repos/ba-song/dsh-memory-core/commits/1635ccb.../check-runs` | 0（返回 0 条） |
| P4 定向测试 | `node --test tests/p4.test.mjs`（`/tmp/memaudit/p4v2`） | 0 |
| 全量测试 | `npm test`（`/tmp/memaudit/p4v2`） | 0 |
| 时间边界 14 例 | `/tmp/memaudit/tv/time-bounds.mjs` | 0（14/14） |
| 上一版对照 | `/tmp/memaudit/tv/time-bounds-prev.mjs`（@ d9d50ac） | 0（9/14） |
| SQL 一致性 | `/tmp/memaudit/tv/sql-consistency.mjs` | 0 |
| conflict 对抗集 | `/tmp/memaudit/tv/adv-v2.mjs` | 0（6/15 既有边界） |
| 负向对照 | `/tmp/memaudit/negctl2`（回退 p4.js 的 scratch 副本） | 1（预期的断言失败） |

> 说明：`/tmp` 日志与容器路径 GPT 不可见，以上均已在本报告内转写为“命令 + 结果 + 退出码”。

## 9. 边界声明

- 未修改仓库任何文件；未破坏 worktree（仅符号链接 `node_modules`）。
- 未触碰生产数据库、生产插件目录、profile、档案目录。
- 未执行合并、推送、部署、重启、staging。
- 未修改 `HANDOFF.md` / `REPORT.md` / `PROJECT.md`；本文件为首版新增会话报告。
- 未分析或修改 Persona / EI。
