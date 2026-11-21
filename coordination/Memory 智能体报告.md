# MEMORY-REPORT-0016 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 任务标识：`MEM-VALIDITY-BATCH-E-REVERIFY-02`
> 覆盖任务：Batch A PASS → Batch B PASS → Batch C PASS → Batch D PASS → **Batch E（weekly，本轮为修复后第二次复验）**
> 仓库：`ba-song/dsh-memory-core`｜本文件覆盖式更新、版本号递增
> 最近更新：2026-11-21 17:1x (Asia/Shanghai) · v16

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001~0007 | 10:15–13:0x | P4 / R5 / helper / 三调用点 / FTS+uncertain / 两次复核 / strict lane |
| MEMORY-REPORT-0008~0011 | 13:3x–14:1x | Batch A PASS；Batch B 两轮 BLOCKED → PASS |
| MEMORY-REPORT-0012~0013 | 14:4x–16:0x | Batch C 首验 BLOCKED → 修复后 PASS |
| MEMORY-REPORT-0014 | 16:3x | Batch D PASS，302/302 ×3 |
| MEMORY-REPORT-0015 | 17:0x | Batch E 首验 BLOCKED（测试断言/fixture 不一致） |
| MEMORY-REPORT-0016 | 17:1x | **Batch E 修复后复验：仍 BLOCKED** —— `now` 已修，但 `validTo` 加在 keeper 行而非被 supersede 的 member 行 |

---

## 0. 最终结论

**BATCH E BLOCKED**

| 项 | 判定 | 证据 |
|---|---|---|
| HEAD / tree / compare | **PASS** | `37fb441f…`、tree `d4616122…`、相对 `e3976101` ahead **1** / behind **0** |
| 仅测试文件变化、业务代码未动 | **PASS** | `weekly.js` blob 仍 `61083aaa…`；`validity.js` 仍 `7aabea0e…` |
| 目标 blob | **PASS** | `tests/weekly.test.mjs` = `c9f998af91a26cc136b294345585bed0de7f8a50` |
| 修复 1：apply 传入固定 `now` | **PASS（已生效）** | diff 显示 `weeklyConsolidate({…, now, dataDir: DIR })` |
| 修复 2：member fixture 设未来 `validTo` | **FAIL（放错行）** | 加在了 keeper（importance 0.7）行；被 supersede 的是 member（0.6）行 |
| 定向测试 ×3 | **FAIL（确定性）** | 30 / 29 / 1 ×3 |
| weekly 单文件 | **FAIL（确定性）** | 6 / 5 / 1 |
| 六文件回归 | **FAIL** | 53 / 52 / 1 |
| 全量 `npm test` ×3 | **FAIL** | **305 / 304 / 1 / skip 0** ×3 |
| 七组负向对照 E1–E7 | **PASS** | 全部由语义断言失败证明；恢复后逐字节一致 |
| 生产 / 部署 / 合并 | **未触碰** | 见 §6 |

**唯一失败**：`tests/weekly.test.mjs` 用例「周结 apply：只把重复条标 superseded，保留 keeper，不删正文」line 55：
`AssertionError: revision 快照必须保留迁移前的未来 valid_to`（`actual false` / `expected true`）。

**根因**：
- `clusterMemories` 的 keeper 取 **importance 最高** 的行（0.7 = `主人喜欢吃烤生蚝`），member 是 0.6 那行。
- 本轮把 `validTo: now + 86400000` 加在了 **keeper** 行（0.7），而被 supersede、写快照的是 **member**（0.6，原 `valid_to = NULL`）。
- 因此 line 53（`valid_to === now`，NULL→now）已通过，line 55（快照保留「迁移前未来 valid_to」）仍失败。

**独立验证**：把同一 `validTo` 从 keeper 行移到 member 行后整文件 **6/6 PASS**；业务实现无需改动。

---

## 1. 基线与修复内容

| 项 | 值 |
|---|---|
| 分支 | `feat/memory-validity-batch-e` |
| 目标 HEAD（实测） | **`37fb441fbe39dee715340f8204c16e3a3fe4782e`** |
| tree | **`d4616122fbe968ae7921c95a250603b2b8c72844`** |
| 修复前 HEAD | `e3976101…`；ahead 1 / behind 0 |
| 环境 | Node **v24.19.0**；独立 worktree `/tmp/memaudit/batchE2`（detached @ 37fb441f）；未安装/升级依赖 |
| 仓库 AGENTS.md | 仓库树内**无 AGENTS.md**（`git ls-tree -r`） |
| 协调文档 | HANDOFF blob `4c9c2314…`、REPORT blob `23c9cdcb…`；coord HEAD `3e337d6`（记录 Batch E 测试修复与复验门禁）；本轮未修改 |

| 文件 | blob | 对比修复前 |
|---|---|---|
| `lib/consolidate/weekly.js` | `61083aaaaff3fbc6927490045a92246ee9b1d05f` | 未变 |
| `tests/weekly.test.mjs` | `c9f998af91a26cc136b294345585bed0de7f8a50` | 唯一变更 |
| `lib/store/validity.js`（未改） | `7aabea0efff2b9d5fe40acea19fcc4609f5e87e6` | 未变 |

修复 diff（仅测试）：dry-run 用例的 0.7 行加 `validTo: now + 86400000`；apply 调用加 `now`；clamp 与 snapshot 断言均保留。

## 2. 代码审查（本轮复核，未发现缺陷）

| 检查项 | 结论 |
|---|---|
| 统一 current validity 候选过滤 | `loadWeeklyCandidates` 使用 `current`；valid_from NULL 兼容；future/expired/superseded/archived 排除（E1–E4 证明） |
| dry-run / apply 候选集一致 | 同一 `loadWeeklyCandidates` |
| 事务内重读 + revision 检查 | `BEGIN IMMEDIATE` 后 `SELECT *` keeper/member，复核 `isValidAt`、layer、kind、lookback、revision |
| snapshot 与 CAS 同事务 | 同事务 INSERT + 带 `revision=?`/validity 的 UPDATE |
| `valid_to = min(原值, now)`，NULL→now | `CASE WHEN valid_to IS NULL OR valid_to>? THEN ? ELSE valid_to END`（探针验证） |
| snapshot 保留迁移前原值 | snapshot 在 UPDATE 前写入 `JSON.stringify(row)`（探针：未来值保留） |
| 缺表/写入失败/CAS 未命中整体 rollback | 外层 catch → ROLLBACK → `ok:false`；无 status-only fallback（E6/E7 证明） |
| keeper importance 带 revision/current、仅成功后提升 | `clusterApplied > 0` 才 bump，`changes !== 1` 抛错 |

## 3. 测试统计（本轮实测）

| 命令 | tests | pass | fail | skip | exit |
|---|---|---|---|---|---|
| `node --test weekly validity`（×3） | 30 ×3 | 29 ×3 | **1** ×3 | 0 | **1** |
| `node --test tests/weekly.test.mjs` | 6 | 5 | **1** | 0 | **1** |
| 六文件回归 | 53 | 52 | **1** | 0 | **1** |
| `npm test`（×3） | **305** | 304 | **1** | 0 | **1** |

三轮全量完全一致，无环境 flake。

## 4. 七组负向对照（本轮重跑，全部由语义断言失败证明）

| # | 变异 | 实际失败断言 |
|---|---|---|
| E1 | 候选退回 `status='active'` | `must not be a weekly candidate: #3` |
| E2 | helper 去 `valid_from` | `#3` |
| E3 | helper 去 `valid_to` | `#4` |
| E4 | helper 去 `superseded` | `#5` |
| E5 | 收敛恢复 `COALESCE(valid_to, ?)` | `原有未来 valid_to 必须收敛到实际 supersede 时刻`（在 validTo 位于 member 行的 scratch 上触发；该 scratch 原状态 6/6 PASS） |
| E6 | 恢复 status-only fallback | `missing history table must not fall back to legacy status-only write`（`true !== false`） |
| E7 | 移除 member/keeper CAS 检查 | `assert.equal(r.ok,false)`：`true !== false`（line 134） |

恢复校验：`weekly.js`、`validity.js`、`weekly.test.mjs` 与备份 `diff -q` 全部一致；scratch 文件已删除。

## 5. 工作区与静态检查

```
git status --short → ?? node_modules
git diff --check   → 无输出 EXIT=0
git diff --stat    → 空
HEAD=37fb441fbe39dee715340f8204c16e3a3fe4782e
tree=d4616122fbe968ae7921c95a250603b2b8c72844
HEAD:lib/consolidate/weekly.js = 61083aaaaff3fbc6927490045a92246ee9b1d05f
HEAD:tests/weekly.test.mjs    = c9f998af91a26cc136b294345585bed0de7f8a50
tests/*.test.mjs = 143（无 scratch 残留）
```

## 6. 风险与未执行事项

| 项 | 状态 |
|---|---|
| **测试 fixture 放错行（P0，本轮阻塞）** | 未修（无授权）。建议：把 `validTo: now + 86400000` 从 0.7 的 keeper 行移到 0.6 的 member 行（`主人喜欢烤生蚝`），断言无需改动；已验证此改动使 6/6 PASS |
| weekly 业务代码 | 未改动，且经代码审查与探针验证正确 |
| 真实 weekly 调度 / apply | **NOT RUN**（生产行为，未授权） |
| 生产 DB / 插件 / profile / config | **未触碰**，未连接生产库 |
| 部署 / 重启 / staging / 合并 | **NOT RUN** |

## 7. 边界声明

- 未修改业务代码或测试代码；负向对照均临时修改并逐字节恢复；scratch 已清理。
- 未写生产 DB；未修改生产插件目录 / `profile` / `config`。
- 未部署、未重启、未启动 staging；未合并主线；未执行真实 weekly 调度/apply。
- 未修改其他调用点、Persona/EI/Autonomy/Android；未修改共享 `HANDOFF.md` / `REPORT.md`。
- 未 force push。
- **本轮 BLOCKED；即使后续修复通过，也只能标记 Batch E 隔离代码验证 PASS，不代表生产验证、集成、主线合并或部署。**

## 8. 证据索引

| 内容 | 命令 | 退出码 |
|---|---|---|
| HEAD / tree / compare / blob | `git ls-remote`、`git rev-parse`、`git rev-list --left-right --count` | 0 |
| 定向 ×3 | `node --test tests/weekly.test.mjs tests/validity.test.mjs` | **1**（30/29/1 ×3） |
| weekly 单文件 | `node --test tests/weekly.test.mjs` | **1**（6/5/1） |
| 六文件回归 | 见 §3 | **1**（53/52/1） |
| 全量 ×3 | `npm test` | **1**（305/304/1 ×3） |
| 正确放置 scratch | 临时副本（已删除） | 0（6/6） |
| 负向对照 E1–E7 | 见 §4 | 1（预期）；恢复后 0 |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |
