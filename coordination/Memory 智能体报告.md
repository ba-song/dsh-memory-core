# MEMORY-REPORT-0014 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：v1 P4 → v2 R5 → v3 helper+P4 → v4 recall/graph/event-chain → v5 FTS/uncertain → v6/v7 复核 → v8 Batch A → v9/v10/v11 Batch B → v12/v13 Batch C → **v14 Batch D（daily 日结候选）**
> 任务标识：`MEM-VALIDITY-BATCH-D-VERIFY-01`
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 16:3x (Asia/Shanghai) · v14

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001~0007 | 10:15–13:0x | P4 / R5 / helper / 三调用点 / FTS+uncertain / 两次复核 / strict lane |
| MEMORY-REPORT-0008 | 13:3x | Batch A：PASS，298/298 |
| MEMORY-REPORT-0009~0011 | 13:5x–14:1x | Batch B：两轮 BLOCKED → 三验 PASS，300/300 |
| MEMORY-REPORT-0012~0013 | 14:4x–16:0x | Batch C：首验 BLOCKED → 修复后 PASS，301/301 ×3 |
| MEMORY-REPORT-0014 | 16:3x | **Batch D（daily 日结候选）：PASS（隔离代码验证）** —— 302/302 ×3、4 组负向对照全部按预期失败 |

---

## 0. 最终结论

**BATCH D ISOLATED CODE VERIFICATION PASS**

| 项 | 判定 | 证据 |
|---|---|---|
| 目标 HEAD / tree / compare | **PASS** | `5500d04e…`、tree `836b260f…`、相对 `fecbd09e` ahead **2** / behind **0** |
| 仅两个预期文件变更 | **PASS** | `lib/consolidate/daily.js`、`tests/consolidate.test.mjs`；`validity.js` 未改 |
| 两个目标 blob | **PASS** | `394138a1…`、`2ce8f522…`（与任务一致） |
| 定向测试 ×3 | **PASS** | 28/28 ×3、0 fail、0 skip、exit 0 |
| consolidate 单文件 | **PASS** | 4/4，含新增「日结去重候选」测试实际执行 |
| 五文件回归 | **PASS** | 47/47、0 fail、0 skip、exit 0 |
| 全量 `npm test` | **PASS** | **302/302 ×3**、0 fail、0 skip、exit 0 |
| 四组负向对照 | **PASS** | 全部按预期失败，恢复后逐字节一致 |
| 生产 / 部署 / 合并 | **未触碰** | 见 §7 |

**本 PASS 仅代表 Batch D 隔离代码验证；不代表生产验证、集成、主线合并或部署通过。**

---

## 1. 基线与文件

| 项 | 值 |
|---|---|
| 分支 | `feat/memory-validity-batch-d` |
| 目标 HEAD（实测） | **`5500d04e0e49ebb8168e7356de3c082a9e0e722e`**（未前进） |
| tree | **`836b260faeed0f5e0540f7d735542a4c491eb455`** |
| 基线（Batch C PASS） | `fecbd09eaa5b5745ef02263b1bd506712c256150`；ahead 2 / behind 0 |
| 本批提交 | `7684b1f`（daily 接入）、`5500d04e`（仅澄清测试标题） |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/batchD`（detached @ 5500d04e）；未安装/升级依赖 |
| 仓库 AGENTS.md | `git ls-tree -r` 确认**仓库树内无 AGENTS.md**；已遵循工作区 AGENTS.md 与本报告/提示词路径规则 |
| 协调文档 | 已读最新 `HANDOFF.md`（blob `04e8d690…`：§61 HANDOFF-0064 = Batch C PASS、§62 HANDOFF-0065 = Batch D IMPLEMENTED/VERIFYING）与 `REPORT.md`（blob `d6c24696…`）；本轮未修改 |

| 文件 | 实际 blob |
|---|---|
| `lib/consolidate/daily.js` | `394138a185d176e87b789ca23c51f5d1ae16fa13` |
| `tests/consolidate.test.mjs` | `2ce8f5227f896a84261657982111603eea9ba064` |
| `lib/store/validity.js`（未改） | `7aabea0efff2b9d5fe40acea19fcc4609f5e87e6` |

## 2. 独立代码审查结论

| # | 检查项 | 结论 |
|---|---|---|
| 1 | helper `at` 与 daily `until` 同一基准 | `const until = Number(now)`（daily.js:119）；`loadDailyDedupCandidates(db, until)`（:139）；helper `at: Number(at)` → **同一时间基准** |
| 2 | SQL 参数顺序 | SQL：`created_at_epoch >= ? AND ${validity.sql}`（含 2 个 `?`）；绑定 `[Number(at) - 90*86400000, ...validity.params]` → **顺序正确** |
| 3 | 90 天下限未错位 | 下限仍是 `at - 90*86400000`，作为第一个参数绑定 |
| 4 | SELECT 字段未变 | 新旧投影逐字相同：`id, kind, text, importance, created_at_epoch, last_access_epoch, access_count, pinned, meta` |
| 5 | 排序 / LIMIT 未变 | `ORDER BY id DESC LIMIT 500` 保持 |
| 6 | 只影响 bestMatch 相似去重 | `existing` 仅在 `for (const f of candidates)` 中交给 `bestMatch`；无其他引用 |
| 7 | exact-text duplicate guard 原样 | 仍为独立 `SELECT id FROM memories WHERE text=? LIMIT 1`（facts 写入段），未接入 helper |
| 8 | dryRun / 正式写入未重构 | dryRun 报告、facts/lessons/shortterm/profile/meta 写入路径均无 diff |
| 9 | 无循环依赖 / 导入问题 | `validity.js` 无任何 import（纯函数模块）；`daily.js` 单向导入 helper |
| 10 | 未改其他调用点 | `git diff --name-only fecbd09e 5500d04e` 仅两个文件；weekly / 其他调用点未动 |

## 3. 定向测试（本轮实测）

### 3.1 连跑三次

```
node --test tests/consolidate.test.mjs tests/validity.test.mjs

run1: tests 28 / pass 28 / fail 0 / skipped 0   EXIT=0
run2: tests 28 / pass 28 / fail 0 / skipped 0   EXIT=0
run3: tests 28 / pass 28 / fail 0 / skipped 0   EXIT=0
```
新测试使用独立 `mkdtempSync` 临时 DB，`finally` 中关闭并删除 → **无共享 fixture 污染**（三轮结果完全一致可佐证）。

### 3.2 consolidate 单文件

```
node --test tests/consolidate.test.mjs
✔ 日结解析：过滤临时状态/隐私/坏主语，保留合法条目
✔ 对话摘录：只收 user/self，排除工具事件与群聊，取最近 N 条
✔ 日结去重候选：只比较 current 记忆，同时保留 90 天窗口和倒序语义
✔ 多因子：最近访问/情绪/关系都会加权重
tests 4 / pass 4 / fail 0 / skipped 0   EXIT=0
```

## 4. 相关回归

```
node --test tests/consolidate.test.mjs tests/validity.test.mjs \
             tests/validity-integration.test.mjs tests/validity-review-fix.test.mjs \
             tests/preference-merge.test.mjs
tests 47 / pass 47 / fail 0 / skipped 0   EXIT=0
```

## 5. 全量测试（本轮实测，干净运行）

```
npm test → tests 302 / pass 302 / fail 0 / skipped 0 / EXIT=0   （×3）
```
两次在负向对照前、一次在全部恢复后。每轮执行前均确认：`git status` 无 scratch 文件、`tests/*.test.mjs` = 143、代码未处于变异状态。测试总数较 Batch C（301）增加 1，即本批新增的「日结去重候选」测试。

## 6. 四组负向对照（worktree 内临时修改，恢复后逐字节一致）

| # | 变异内容 | 结果 | 恢复 |
|---|---|---|---|
| D1 | daily 候选退回旧版 `WHERE status='active' AND created_at_epoch >= ?` | **FAIL**：`无效/超窗记录不应参与日结去重：#3`（future valid_from） | `diff -q` 一致 |
| D2 | helper 去除 `valid_from` 时间条件 | **FAIL**：`#3`（future 泄漏） | `diff -q` 一致 |
| D3 | helper 去除 `valid_to` 时间条件 | **FAIL**：`#4`（expired 泄漏） | `diff -q` 一致 |
| D4 | helper 去除 `superseded` 条件 | **FAIL**：`#5`（已替代泄漏） | `diff -q` 一致 |

补充如实记录：D2/D3 第一次采用「整段替换为 `1=1` / 删除子句」的变异，测试以 `Error: column index out of range`（占位符与绑定参数数量不匹配）失败；为验证**语义断言**本身有效，改为保留占位符的 `? IS NOT NULL` 变异后，分别以 `#3`、`#4` 断言失败。两次都属预期失败，且后者直接证明新测试能捕获时间条件缺失。

D2/D3/D4 的 helper 变异同时作用于 `current` 预设，但本轮只在隔离 worktree 内执行定向测试后立即恢复，未污染正式验证状态。

## 7. 工作区 / 静态检查 / 边界

```
git status --short → ?? node_modules（仅符号链接）
git diff --check   → 无输出 EXIT=0
git diff --stat    → 空
HEAD=5500d04e0e49ebb8168e7356de3c082a9e0e722e
tree=836b260faeed0f5e0540f7d735542a4c491eb455
tests/*.test.mjs = 143（无 scratch 残留）
```

- 未修改代码或测试（负向对照均临时修改并逐字节恢复）。
- 未写生产 DB、未修改生产插件目录 / `profile` / `config`。
- 未部署、未重启、未启动 staging；未合并 `feat/m1-preference-memory` 或 `main`。
- 未修改 weekly、其他 Memory 调用点、Persona/EI/Autonomy/Android。
- 未修改共享 `HANDOFF.md` / `REPORT.md`（blob `04e8d690…` / `d6c24696…` 未变）。
- 未 force push、未覆盖他人提交。
- **本轮 PASS 仅代表 Batch D 隔离代码验证；不代表生产验证、集成、主线合并或部署通过。**

## 8. 证据索引

| 内容 | 命令 | 退出码 |
|---|---|---|
| HEAD / tree / compare / 文件 | `git ls-remote`、`git rev-parse`、`git rev-list --left-right --count`、`git diff --name-only` | 0 |
| 两 blob | `git rev-parse 5500d04e:<path>` | 0 |
| 定向 ×3 | `node --test tests/consolidate.test.mjs tests/validity.test.mjs` | 0（28/28 ×3） |
| 单文件 | `node --test tests/consolidate.test.mjs` | 0（4/4） |
| 五文件回归 | 见 §4 | 0（47/47） |
| 全量 ×3 | `npm test` | 0（302/302 ×3） |
| 负向对照 D1–D4 | 见 §6 | 1（预期）；恢复后 0 |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |
