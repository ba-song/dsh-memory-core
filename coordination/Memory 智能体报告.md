# MEMORY-REPORT-0015 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 任务标识：`MEM-VALIDITY-BATCH-E-VERIFY-01`
> 覆盖任务：P4 → R5 → helper → 三调用点 → FTS/uncertain → 复核 → Batch A（PASS）→ Batch B（PASS）→ Batch C（PASS）→ Batch D（PASS）→ **Batch E（weekly）**
> 仓库：`ba-song/dsh-memory-core`｜本文件覆盖式更新、版本号递增
> 最近更新：2026-11-21 17:0x (Asia/Shanghai) · v15

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001~0007 | 10:15–13:0x | P4 / R5 / helper / 三调用点 / FTS+uncertain / 两次复核 / strict lane |
| MEMORY-REPORT-0008 | 13:3x | Batch A：PASS，298/298 |
| MEMORY-REPORT-0009~0011 | 13:5x–14:1x | Batch B：两轮 BLOCKED → 三验 PASS，300/300 |
| MEMORY-REPORT-0012~0013 | 14:4x–16:0x | Batch C：首验 BLOCKED → 修复后 PASS，301/301 ×3 |
| MEMORY-REPORT-0014 | 16:3x | Batch D（daily）：PASS，302/302 ×3 |
| MEMORY-REPORT-0015 | 17:0x | **Batch E（weekly）：BLOCKED** —— 1 个确定性测试失败（测试自身断言与 fixture 不匹配），业务逻辑经探针验证正确 |

---

## 0. 最终结论

**BATCH E BLOCKED**

| 项 | 判定 | 证据 |
|---|---|---|
| HEAD / tree / compare | **PASS** | `e3976101…`、tree `b3bf2e8a…`、相对 Batch D ahead **4** / behind **0** |
| 仅两个预期文件变更 | **PASS** | `lib/consolidate/weekly.js`、`tests/weekly.test.mjs`；`validity.js` 未改 |
| 两个目标 blob | **PASS** | `61083aaa…`、`42f0234b…`（与任务一致） |
| 代码审查（候选/事务/历史/失败关闭） | **PASS（代码层）** | 见 §2；独立探针验证 clamp/snapshot 语义正确 |
| 定向测试 ×3 | **FAIL（确定性）** | 30 / 29 / 1，三次一致 |
| weekly 单文件 | **FAIL（确定性）** | 6 / 5 / 1 |
| 六文件回归 | **FAIL** | 53 / 52 / 1 |
| 全量 `npm test` ×3 | **FAIL** | **305 / 304 / 1 / skip 0**，三次一致，exit 1 |
| 七组负向对照 | **PASS** | 全部由语义断言失败证明；恢复后逐字节一致 |
| 生产 / 部署 / 合并 | **未触碰** | 见 §7 |

**失败项**：`tests/weekly.test.mjs` 已存在用例 `周结 apply：只把重复条标 superseded，保留 keeper，不删正文`，断言 `原有未来 valid_to 必须收敛到实际 supersede 时刻`（line 53）：`actual 1795250069164` / `expected 1795250069033`（相差 131 ms）。
**根因（测试缺陷，不是业务缺陷）**：
1. 该用例调用 `weeklyConsolidate` 时**未传 `now`**，函数内部默认 `Date.now()` 比模块级 `now` 晚若干毫秒，故 `valid_to === now` 永不成立；
2. 该用例的 fixture（`主人喜欢烤生蚝`）**没有设置未来 `validTo`**，紧接着的 line 55 断言「快照必须保留迁移前的未来 valid_to」在 NULL 上也不可能成立。

**独立证据**：把两处测试侧问题修正后的 scratch 副本（`now` 传入 + member 设未来 `validTo`）**6/6 PASS**；独立探针显示实现语义完全正确（见 §2.3）。因任务要求「任何关键测试失败必须 BLOCKED，不得降低验收标准」，本轮判定 BLOCKED，不自行修改测试。

---

## 1. 基线与文件

| 项 | 值 |
|---|---|
| 分支 | `feat/memory-validity-batch-e` |
| 目标 HEAD（实测） | **`e3976101a14356819a15d09b69ee4328f194887b`**（未前进） |
| tree | **`b3bf2e8a8a4a18aa6cca18b7bf022c9f0d2a2378`** |
| 基线（Batch D PASS） | `5500d04e…`；ahead 4 / behind 0 |
| 本批提交 | `1bcd2f3`（实现）、`4cefcab`（测试）、`fef2cb7`（valid_to 收敛）、`e397610`（边界断言） |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/batchE`（detached @ e3976101）；未安装/升级依赖 |
| 仓库 AGENTS.md | `git ls-tree -r` 确认**仓库树内无 AGENTS.md**；已遵循工作区 AGENTS.md |
| 协调文档 | 已读最新 `HANDOFF.md`（blob `495f98b3…`：HANDOFF-0066 Batch D PASS、HANDOFF-0067 Batch E IMPLEMENTED/VERIFYING）与 `REPORT.md`（blob `83bd20bd…`）；本轮未修改 |

| 文件 | 实际 blob |
|---|---|
| `lib/consolidate/weekly.js` | `61083aaaaff3fbc6927490045a92246ee9b1d05f` |
| `tests/weekly.test.mjs` | `42f0234bb5475c740dcdc6c451de7c498659f2b0` |
| `lib/store/validity.js`（未改） | `7aabea0efff2b9d5fe40acea19fcc4609f5e87e6` |

## 2. 代码审查（逐项）

### 2.1 候选查询（A）

| 检查项 | 结论 |
|---|---|
| helper 过滤 status/valid_from/valid_to/superseded | `loadWeeklyCandidates` 使用 `validitySql({at:Number(at),preset:'current'})` → `status='active'` + 时间窗 + superseded；✓ |
| `valid_from IS NULL` 旧记录保留 | helper `current` 语义 `valid_from IS NULL OR <=at`；探针：legacy 记录进入候选；✓ |
| future/expired/superseded/archived 排除 | 测试与负向对照 E1–E4 证明；✓ |
| lookbackDays / layer / kind / 排序 | `created_at_epoch >= since`、`layer='auto'`、`kind IN (fact,preference,relation)`、`ORDER BY id ASC` 全部保留；✓ |
| dry-run 与 apply 同一候选集 | 两次均调用 `loadWeeklyCandidates`；✓ |
| 是否存在 status-only 旁路 | 无；`grep status='active'` 仅出现在旧代码注释外无残余 candidate 查询；✓ |

### 2.2 事务与 CAS（B）

- `BEGIN IMMEDIATE` 后重新 `SELECT *` keeper 与 member，复核 `isValidAt(current)`、layer、kind、lookback、revision；不再沿用事务外快照。
- member：先 `INSERT OR REPLACE INTO memory_revisions`（保存旧行 JSON），再执行带 `revision=? AND layer='auto' AND created_at_epoch >= ? AND kind IN (…) AND ${validity.sql}` 的 UPDATE；`changes !== 1` → 抛 `E_WEEKLY_MEMBER_CAS_CONFLICT`。
- keeper importance：带 `revision=?` 与 current 谓词；仅 `clusterApplied > 0` 才提升；`changes !== 1` → 抛 `E_WEEKLY_KEEPER_CAS_CONFLICT`。
- 外层 `catch` → `ROLLBACK` → 返回 `{ok:false, error}`；meta 写入与 COMMIT 同事务。
- **不存在**“snapshot 已写但状态未改/状态已改但 snapshot 未写”的窗口：二者同事务，CAS 未命中即抛错回滚（E7 验证）。

### 2.3 历史时间语义（C）—— 独立探针（临时库）

| 场景 | 结果 |
|---|---|
| 原 `valid_to = NULL` | supersede 后 `valid_to = now`；快照 `valid_to = null` |
| 原 `valid_to = now + 1d` | supersede 后 `valid_to = now`（收敛）；**快照保留原未来值** `now+1d` |
| 原 `valid_to = now - 1s` | 不进入候选（`current` 排除），`superseded = 0`，无快照 |
| status/superseded_by/revision/updated_at/valid_to/temporal_kind | 同一 UPDATE 内一致更新（探针 `rows` 显示 revision 2、temporal_kind historical） |

### 2.4 失败关闭（D）

- `memory_revisions` 缺失 → INSERT 抛错 → 外层 ROLLBACK → `ok:false`，不退回 status-only（E6 对照证明：恢复 fallback 后该测试失败）。
- UPDATE `changes !== 1` → 抛错 → 整体回滚（E7 对照证明）。
- 回滚同时撤销 snapshot、状态修改、keeper importance、meta（测试断言 revision 计数 0、importance 0.8、无 `weeklyLastAt`）。

## 3. 测试结果（本轮实测）

### 3.1 定向测试 ×3

```
node --test tests/weekly.test.mjs tests/validity.test.mjs
run1: tests 30 / pass 29 / fail 1 / skipped 0   EXIT=1
run2: tests 30 / pass 29 / fail 1 / skipped 0   EXIT=1
run3: tests 30 / pass 29 / fail 1 / skipped 0   EXIT=1
```

### 3.2 weekly 单文件

```
node --test tests/weekly.test.mjs
✔ 相似度…
✔ 周结 dry-run…
✖ 周结 apply：只把重复条标 superseded，保留 keeper，不删正文   ← line 53
✔ 周结候选：统一 current validity 排除 future/expired/superseded/archived/超窗
✔ 周结 apply：缺少 revision 快照表时失败关闭并整体回滚
✔ 周结 apply：CAS 更新未命中时快照和状态迁移一起回滚
tests 6 / pass 5 / fail 1 / skipped 0   EXIT=1
```

### 3.3 六文件回归

```
node --test weekly validity validity-integration validity-review-fix preference-merge consolidate
tests 53 / pass 52 / fail 1 / skipped 0   EXIT=1
```

### 3.4 全量 `npm test` ×3

```
run1: tests 305 / pass 304 / fail 1 / skipped 0 / EXIT=1
run2: tests 305 / pass 304 / fail 1 / skipped 0 / EXIT=1
run3: tests 305 / pass 304 / fail 1 / skipped 0 / EXIT=1
```
三次一致，失败恒为同一用例；不存在环境 flake。

### 3.5 失败根因的独立验证（scratch，未改正式文件）

- 修正版 scratch（`weeklyConsolidate` 调用传入 `now`；member fixture 设 `validTo: now+86400000`）→ **6/6 PASS**。
- 探针结果见 §2.3：实现正确。
- 结论：已提交测试自身存在两处不一致（未传 `now`、fixture 未设未来 `valid_to`），不是 weekly 业务逻辑错误。

## 4. 七组负向对照（全部由语义断言失败证明，恢复后逐字节一致）

| # | 变异 | 实际失败断言 |
|---|---|---|
| E1 | 候选退回 `status='active'` | `must not be a weekly candidate: #3` |
| E2 | helper 去 `valid_from`（保留占位符） | `must not be a weekly candidate: #3` |
| E3 | helper 去 `valid_to`（保留占位符） | `must not be a weekly candidate: #4` |
| E4 | helper 去 `superseded` | `must not be a weekly candidate: #5` |
| E5 | `valid_to` 收敛恢复为 `COALESCE(valid_to, ?)` | `原有未来 valid_to 必须收敛到实际 supersede 时刻`（actual 未来值 / expected now） |
| E6 | 恢复 status-only fallback | `missing history table must not fall back to legacy status-only write` |
| E7 | 移除 member/keeper CAS 检查 | `assert.equal(r.ok, false)`：`true !== false`（line 134） |

方法说明：E5 需在**整文件**下运行（提交的基线用例因上述测试缺陷无法到达 clamp 断言，故用修正版 scratch 验证 clamp 语义）；首次误用 `--test-name-pattern` 会跳过插入 fixture 的 dry-run 测试导致候选为空，已改用整文件运行并重做，最终结果如上。

恢复校验：`lib/consolidate/weekly.js`、`lib/store/validity.js` 与备份 `diff -q` 全部一致；scratch 文件已删除。

## 5. 工作区与静态检查

```
git status --short → ?? node_modules（既有符号链接）
git diff --check   → 无输出 EXIT=0
git diff --stat    → 空
HEAD=e3976101a14356819a15d09b69ee4328f194887b
HEAD:lib/consolidate/weekly.js = 61083aaaaff3fbc6927490045a92246ee9b1d05f
HEAD:tests/weekly.test.mjs    = 42f0234bb5475c740dcdc6c451de7c498659f2b0
tests/*.test.mjs = 143（无 scratch 残留）
```

## 6. 风险与未执行事项

| 项 | 状态 |
|---|---|
| **测试缺陷（P0，本轮阻塞）** | 未修（无授权）。建议最小修复：① apply 用例给 `weeklyConsolidate` 传 `now`；② 该用例 member fixture 设未来 `valid_to`（与断言文案一致）或放宽 line 55 断言 |
| 真实 weekly 调度 / apply | **NOT RUN**（属生产行为，未授权） |
| 生产 DB / 插件 / profile / config | **未触碰**；未连接生产库 |
| 部署 / 重启 / staging / 合并 | **NOT RUN** |
| 测试环境异常 | 无 flake；三次全量一致；`node_modules` 为既有符号链接 |

## 7. 边界声明

- 未修改业务代码或测试代码；负向对照均临时修改并逐字节恢复，scratch 已清理。
- 未写生产 DB、未修改生产插件目录 / `profile` / `config`。
- 未部署、未重启、未启动 staging；未合并主线。
- 未修改 weekly 之外的调用点、Persona/EI/Autonomy/Android。
- 未修改共享 `HANDOFF.md` / `REPORT.md`（blob `495f98b3…` / `83bd20bd…` 未变）。
- 未 force push。
- **本轮结论 BLOCKED；即使后续修复通过，也只能标记 Batch E 隔离代码验证 PASS，不代表生产验证、集成、主线合并或部署。**

## 8. 证据索引

| 内容 | 命令 | 退出码 |
|---|---|---|
| HEAD / tree / compare / blob | `git ls-remote`、`git rev-parse`、`git rev-list --left-right --count` | 0 |
| 定向 ×3 | `node --test tests/weekly.test.mjs tests/validity.test.mjs` | **1**（30/29/1 ×3） |
| weekly 单文件 | `node --test tests/weekly.test.mjs` | **1**（6/5/1） |
| 六文件回归 | 见 §3.3 | **1**（53/52/1） |
| 全量 ×3 | `npm test` | **1**（305/304/1 ×3） |
| clamp/snapshot 探针 | `/tmp/probe-weekly-clamp.mjs` | 0 |
| 修正版 scratch | 临时副本（已删除） | 0（6/6） |
| 负向对照 E1–E7 | 见 §4 | 1（预期）；恢复后 0 |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |
