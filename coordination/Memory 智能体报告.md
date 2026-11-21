# MEMORY-REPORT-0013 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：v1 P4 → v2 R5 → v3 helper+P4 → v4 recall/graph/event-chain → v5 FTS/uncertain → v6/v7 复核 → v8 Batch A → v9/v10/v11 Batch B → v12 Batch C（BLOCKED）→ **v13 Batch C fixture 修复后复验**
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 16:0x (Asia/Shanghai) · v13

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001~0007 | 10:15–13:0x | P4 / R5 / helper / 三调用点 / FTS+uncertain / 两次复核 / strict lane |
| MEMORY-REPORT-0008 | 13:3x | Batch A：PASS，298/298 |
| MEMORY-REPORT-0009 | 13:5x | Batch B 首验：BLOCKED（NULL fixture） |
| MEMORY-REPORT-0010 | 14:0x | Batch B 二验：BLOCKED（共享 DB 污染） |
| MEMORY-REPORT-0011 | 14:1x | Batch B 三验：PASS，300/300 |
| MEMORY-REPORT-0012 | 14:4x | Batch C 首验：BLOCKED（fixture 主题碰撞，1 fail） |
| MEMORY-REPORT-0013 | 16:0x | **Batch C fixture 修复后复验：PASS（隔离代码验证）** —— 301/301 ×3，25/25 ×3，8 组负向对照复核成立 |

---

## 1. 最终结论：**PASS（BATCH C ISOLATED CODE VERIFICATION PASS）**

| 项 | 判定 | 证据 |
|---|---|---|
| 目标 HEAD / tree / compare | **PASS** | `fecbd09e…`、tree `b770e0b1…`、相对修复前 `906fca93` ahead **1** / behind **0** |
| 修复提交只改一行、且只改测试文件 | **PASS** | `fecbd09`：`tests/preference-merge.test.mjs` +1/−1（`咖啡`→`椰子`） |
| 业务文件与修复前逐字节一致 | **PASS** | `merge.js` / `validity.js` / `validity.test.mjs` diff 均为 **0 行** |
| 定向测试 ×3 | **PASS** | 每次 25/25、0 fail、0 skip、exit 0 |
| preference-merge 单文件 | **PASS** | 1/1、exit 0（顺序执行到 pending 兼容段） |
| 8 文件相关回归 | **PASS** | 42/42、0 fail、0 skip、exit 0 |
| 全量 `npm test` | **PASS** | **301/301 ×3（干净运行）**、0 fail、0 skip、exit 0 |
| 事务/CAS/回滚复核 | **PASS** | P1–P5 本轮在该 HEAD 重跑，全部符合预期 |
| 8 组负向对照复核 | **PASS** | 全部按预期失败，恢复后逐字节一致 |
| 生产 / 部署 / 合并 / staging | **未触碰** | 见 §9 |

**本轮为隔离代码验证 PASS；不代表生产验证、集成、主线合并或部署通过。**

---

## 2. 基线与修复提交

| 项 | 值 |
|---|---|
| 分支 | `feat/memory-validity-batch-c` |
| 目标 HEAD（实测） | **`fecbd09eaa5b5745ef02263b1bd506712c256150`**（与指定一致，未前进） |
| 树 SHA | **`b770e0b19ce6170c331129dc7f9a731dfcee88f1`** |
| 修复前 HEAD | `906fca93ad92a19dcfe871caf3583596fb72fe2b`；ahead 1 / behind 0 |
| 修复提交 | `fecbd09` `test(memory): isolate expired preference fixture`，1 file changed, **1 insertion / 1 deletion** |
| 精确 diff | `['expired valid_to', '咖啡', …]` → `['expired valid_to', '椰子', …]` |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/batchC2`（detached @ fecbd09）；未安装/升级依赖 |
| 文档 | 已重读工作区 AGENTS.md；仓库树内**无 AGENTS.md**（`git ls-tree -r`）；`HANDOFF.md` blob `2923ba9b…`、`REPORT.md` blob `9a9c0bdb…`（均未变，Batch C 仍标"验证中"）；本轮未改共享文件 |

### 四个文件 blob

| 文件 | blob | 对比修复前 |
|---|---|---|
| `lib/pref/merge.js` | `d6d36773a44314030aa8bc65336768c6063e8f6e` | 不变 |
| `lib/store/validity.js` | `7aabea0efff2b9d5fe40acea19fcc4609f5e87e6` | 不变 |
| `tests/preference-merge.test.mjs` | `3907e7d948a743987e14c563a98b1195c43ac3c4` | 仅此文件变更（与任务给定一致） |
| `tests/validity.test.mjs` | `fd00ecff76614f17544e5ac2e244692be38c6089` | 不变 |

## 3. 定向测试（本轮实测）

```
node --test tests/preference-merge.test.mjs tests/validity.test.mjs

run1: tests 25 / pass 25 / fail 0 / skipped 0   EXIT=0
run2: tests 25 / pass 25 / fail 0 / skipped 0   EXIT=0
run3: tests 25 / pass 25 / fail 0 / skipped 0   EXIT=0
```

单文件：

```
node --test tests/preference-merge.test.mjs
✔ tests/preference-merge.test.mjs
tests 1 / pass 1 / fail 0 / skipped 0   EXIT=0
```
该文件为顺序断言脚本，末尾停在 pending 兼容段（`at=9000`，断言 `ok:true`、`action:'inserted'`、状态变 active），通过即证明 expired / future / superseded / 候选侧 / pending 全部执行并通过。

## 4. 相关回归（8 文件）

```
node --test preference-merge preference-lifecycle preference-evolution \
             preference-classify preference-second-round preference-round3 \
             validity-integration validity-review-fix
tests 42 / pass 42 / fail 0 / skipped 0   EXIT=0
```

## 5. 全量测试（本轮实测，干净运行）

```
npm test  →  tests 301 / pass 301 / fail 0 / skipped 0 / EXIT=0   （×3）
```

**如实记录一次受污染的运行**：在负向对照 E2 期间（scratch 文件 `tests/_e2.test.mjs` 存在于 `tests/` 且代码处于变异状态）启动的一次 `npm test` 得到 `302 tests / 301 pass / 1 fail`，失败项即 `tests/_e2.test.mjs`。该文件是负向对照用的临时副本、已删除；清理后重新连续运行 **3 次**均为 **301/301、0 fail、0 skip、exit 0**。此前的污染不影响最终结论。

## 6. 事务 / CAS / 回滚（本轮在该 HEAD 重跑，非引用）

| 探针 | 本轮结果 |
|---|---|
| P2 正常合并 | `action=merged`；旧行 revision **2**；候选 `status=merged`；`memory_revisions` 两条快照 |
| P1 中途失败（`memory_revisions` 不可写） | 抛 `no such table: memory_revisions`；旧行 revision 1、importance 0.6、evidence 1 未变；候选 active → **整体回滚** |
| P3 pending + 开放冲突 | `{ok:true, action:'pending', reason:'open-conflict'}`，状态仍 pending |
| P4 外部写锁（BUSY） | 约 **16.2 s** 后 `database is locked`；无 revision、候选 active → fail-closed |
| P5 CAS 冲突（注入 `changes=0`） | 抛 `E_REVISION_CONFLICT`；revision 行 0、旧行 revision 1、候选 active → 回滚 |

## 7. 八组负向对照复核（本轮重跑，均在 worktree 内临时修改并恢复）

| # | 变异 | 结果 |
|---|---|---|
| 1 | 旧偏好查询恢复旧过滤 | FAIL：`future valid_from old preference must not be merged`（line 47） |
| 2 | 同上 + 仅保留 superseded 案例（scratch） | FAIL：`superseded old preference must not be merged`（line 45） |
| 3 | 移除候选有效性检查 | FAIL：line 58（future 候选 `ok` 期望 false 实得 true） |
| 4 | 候选预设改为严格 `current`（active-only） | FAIL：line 84（pending 期望 `ok:true` 实得 false） |
| 5 | 移除 `current.valid_to != null` 严格检查 | FAIL：line 73（未来 `valid_to` 候选期望 false 实得 true） |
| 6 | helper 去掉 `valid_from` | FAIL：`preference merge candidate preset…` |
| 7 | helper 去掉 `superseded` | FAIL：同上 |
| 8 | 候选查询参数顺序破坏 | FAIL：line 18（首个合并断言 `same.action` 变 undefined） |

恢复校验：`merge.js`、`validity.js`、`preference-merge.test.mjs` 与备份 `diff -q` 全部一致；scratch 文件已删除。八组对照与当前代码/测试仍一一对应，无失效。

## 8. 工作区与静态检查

```
git status --short → ?? node_modules（仅符号链接）
git diff --check   → 无输出 EXIT=0
git diff --stat    → 空
HEAD=fecbd09eaa5b5745ef02263b1bd506712c256150
tree=b770e0b19ce6170c331129dc7f9a731dfcee88f1
tests/*.test.mjs 数量 = 143（无 scratch 残留）
```

## 9. 边界声明

- 未修改任何业务代码或测试文件（负向对照均临时修改并逐字节恢复；scratch 副本已删除）。
- 未写生产 DB 或生产只读副本；未修改生产插件目录、`profile`/`config`。
- 未部署、未重启、未启动 staging；未合并 `feat/m1-preference-memory` 或 `main`。
- 未修改其他 Memory 调用点（daily/weekly 属 Batch D/E，未授权）。
- 未修改 Persona/EI/Autonomy/Android；未修改共享 `HANDOFF.md` / `REPORT.md`。
- 未 force push、未覆盖他人提交。
- **本轮 PASS 仅代表「Batch C 隔离代码验证」通过；不代表生产验证、集成、主线合并或部署通过。**

## 10. 证据索引

| 内容 | 命令 | 退出码 |
|---|---|---|
| HEAD / tree / compare / diff | `git ls-remote`、`git rev-parse`、`git rev-list --left-right --count`、`git show fecbd09` | 0 |
| 四 blob | `git rev-parse fecbd09:<path>` | 0 |
| 定向 ×3 | `node --test tests/preference-merge.test.mjs tests/validity.test.mjs` | 0（25/25 ×3） |
| 单文件 | `node --test tests/preference-merge.test.mjs` | 0（1/1） |
| 回归 8 文件 | 见 §4 | 0（42/42） |
| 全量 ×3 | `npm test` | 0（301/301 ×3） |
| 事务 P1/P2/P3/P5 | `/tmp/probe-batchC2-tx.mjs` | 0 |
| BUSY P4 / P3b | `/tmp/probe-batchC2-tx2.mjs` | 0 |
| 负向对照 1–8 | 见 §7 | 1（预期）；恢复后 0 |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |
