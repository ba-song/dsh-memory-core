# MEMORY-REPORT-0005 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：`MEM-P4-TEMPORAL-VERIFY-01`（v1）、`MEM-VALIDITY-R5-01`（v2）、`MEM-VALIDITY-IMPL-01`（v3）、`MEM-VALIDITY-INTEGRATION-01`（v4）、`MEM-VALIDITY-INTEGRATION-REVIEW-FIX-01`（v5，本轮）
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 12:2x (Asia/Shanghai) · v5

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001 | 2026-11-21 10:15 | P4 时间有效性隔离验收（1635ccb）：PASS |
| MEMORY-REPORT-0002 | 2026-11-21 10:5x | R5 双模式语义审查：4 种口径、as-of 生产缺失、2×2 谓词方案 |
| MEMORY-REPORT-0003 | 2026-11-21 11:1x | 统一谓词 helper + P4 接入（4af81a2）：21 例新测试、279/279 |
| MEMORY-REPORT-0004 | 2026-11-21 11:5x | recall / graph / event-chain 接入（38844d1）：13 例新测试、292/292 |
| MEMORY-REPORT-0005 | 2026-11-21 12:2x | 复核修正：FTS 状态域、uncertain 时间边界（4b4f927）：5 例新测试、297/297 |

---

## 0. 本轮结论（MEM-VALIDITY-INTEGRATION-REVIEW-FIX-01）

| 复核项 | 判定 | 证据 |
|---|---|---|
| 发现一：FTS 臂硬编码 `status='active'` | **FIXED / PASS** | 两处 FTS 子查询已移除硬编码；状态域只由 helper 决定；新增 FTS-only 回归测试 |
| 发现二：uncertain 未尊重 as-of 时间边界 | **FIXED / PASS** | 新增 `uncertaintyWindowSql`（`created_at<=at`、`valid_from<=at`、`valid_to>at`），uncertain 现在接收 `at` |
| 两个 reason 保持区分 | **PASS** | `unknown-validity` / `superseded-without-end` 分支独立；同一记录只出现一次 |
| 定向测试 | **PASS** | `validity-review-fix` **5/5**；受影响 8 个测试文件 **46/46** |
| 全量测试 | **PASS** | `npm test` **297/297**、0 fail、0 skip、exit 0 |
| 负向对照 | **PASS** | 恢复 FTS 硬编码 → 1 例失败；移除 uncertain 时间窗 → 2 例失败；恢复后全绿 |
| 生产数据 / 部署 | **未触碰** | 无部署、无重启、无 staging、无合并、无生产写入 |

**总判定：隔离开发复核修正 PASS。不代表生产验证通过，也不代表获准合并或部署。**

---

## 1. 基线与提交

| 项 | 值 |
|---|---|
| 分支 | `feat/memory-validity-unified` |
| 起点（复核基线） | `38844d120c25797f3a7cd2e41de3942a809b82b7`（已核对为分支 HEAD，未变化） |
| **最终 HEAD / 远端** | **`4b4f927`**（`4b4f927…`，本地与远端一致） |
| 本轮提交 | `1e468db` feat(validity) → `78c1556` fix(recall) → `4b4f927` test(validity) |
| blob | `validity.js` `00c4d948…`｜`recall.js` `6cdd5a9e…`｜`validity-review-fix.test.mjs` `e050666e…`｜`asof.test.mjs` `b66a6bcd…`｜`asof-graph-uncertain.test.mjs` `f8edc284…`｜`validity-integration.test.mjs` `87e31509…` |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree；未安装/升级依赖 |

---

## 2. 修正说明一：FTS 关键词臂的状态域

**问题**：`searchBigramExpr()` / `searchTrigramExpr()` 在拼接 filter 时多写了一层 `status='active'`：

```sql
-- 修正前
SELECT rowid AS id FROM fts_bigram WHERE fts_bigram MATCH ?
  AND rowid IN (SELECT id FROM memories WHERE status='active' AND ${filter.sql}) LIMIT ?
```

`filter.sql` 就是 `validitySql()` 的片段，已经包含状态域（current → `status='active'`；as-of → `NOT IN ('pending','merged')`）。再叠一层 `status='active'` 导致 as-of 下 FTS 臂永远看不到 `archived` / `expired`，而 allowedIds / graph / semantic 却能看到 → 各臂语义不一致。

**修正后**：

```sql
SELECT rowid AS id FROM fts_bigram WHERE fts_bigram MATCH ?
  AND rowid IN (SELECT id FROM memories WHERE ${filter.sql}) LIMIT ?
```

**保持不变**：scope 过滤位置、`[expr, ...filter.params, 50]` 的参数顺序、rowid 子查询形态、LIMIT。
**证据**：新测试构造无实体词的语料，先断言 `graphCandidates(db,'极光')` 的 direct/hop/unknownHop 全为空（排除 graph 兜底），再断言 as-of 能找到 archived/expired、current 找不到、pending/merged 始终排除。

---

## 3. 修正说明二：uncertain 必须尊重 as-of 时间边界

**问题**：`uncertainRows()` 没有 `at`，只查状态域 + 两个 reason 条件。于是「创建于判定之后」「valid_from 晚于判定点」「valid_to 不晚于判定点」这类**已能判定**的行会被误报成 uncertain。

**修正**：新增 `uncertaintyWindowSql({ at })`（helper 单一来源），并在 `uncertainRows` 中与候选集取交集：

```sql
created_at_epoch <= ?
AND (valid_from IS NULL OR valid_from <= ?)
AND (valid_to IS NULL OR valid_to > ?)
-- params 顺序固定 [at, at, at]（创建 / 起点 / 终点）
```

与裁决逐条对应：

| 裁决 | 实现 |
|---|---|
| 1. `created_at_epoch > at` 排除 | `created_at_epoch<=?` |
| 2. `valid_from > at` 排除 | `(valid_from IS NULL OR valid_from<=?)` |
| 3. `valid_to <= at` 排除 | `(valid_to IS NULL OR valid_to>?)` |
| 4. 遗留 unknown-validity 仅当无真实 `valid_from` 且 `created<=at` | `TEMPORAL_UNKNOWN_SQL`（含 `valid_from IS NULL`）+ 上述窗口 |
| 5. superseded-without-end 仅当已创建/开始且无明确结束 | `uncertaintySql` + 上述窗口 |
| 6. 两个 reason 明确区分 | 单行按 `superseded_by≠0 且 valid_to IS NULL` → `superseded-without-end`，否则 `unknown-validity`；每行只出现一次 |
| 7. 只标记、不进权威结果 | 候选集先剔除已返回结果；权威结果仍由 `validitySql` 决定 |

**一个必须让 GPT 知道的事实**：在 `asOfHistory`（允许 `COALESCE(valid_from, created_at_epoch)` 近似）下，`valid_from IS NULL` 且 `created<=at` 的行**已经是权威结果**（带 `validFromApproximated`），因此不会被标成 `unknown-validity`。也就是说：**`unknown-validity` 这个 reason 在当前 asOfHistory 路径上几乎不可触发**（只在候选因 top-N 截断而未被返回时可能出现）。
本轮按裁决保留了该分支与 reason 区分（不作死代码清理），并在测试中把「创建晚于 at 必须不误报」作为回归守卫。**是否需要给某些调用方改用 `asOfStrict` 以恢复 unknown-validity 语义，需 GPT 裁决。**

**既有测试的调整（必要且需说明）**：`tests/asof.test.mjs`、`tests/asof-graph-uncertain.test.mjs`、`tests/validity-integration.test.mjs` 里各有一条 fixture 把「创建于 as-of 之后的无起点行」断言为 uncertain——这正是本轮要修的误分类。已按新裁决调整：
- `asof.test.mjs`：新增一条「valid_from 已过 + 已替代但无终点 + created<=at」的行承担 uncertain 透传断言；原 unknown 行改为断言「不得误报」；`before`（去年 12 月）断言 uncertain 为 0。
- `asof-graph-uncertain.test.mjs`：unknown 行 `createdAt` 改为 `at - 1000`（创建于判定之前），保留 `unknown-validity` 覆盖。
- `validity-integration.test.mjs`：inconsistent 行补 `createdAt: JAN`（否则被新边界正确排除）。

---

## 4. 新增测试（`tests/validity-review-fix.test.mjs`，5 例）

| # | 用例 | 断言要点 |
|---|---|---|
| 1 | FTS 臂：as-of 命中 archived / expired | 前置 graph 臂全空；as-of 结果含 archived+expired；current 不含；pending/merged 始终排除 |
| 2 | `uncertaintyWindowSql` 契约 | `params=[at,at,at]`；3 个占位符；子句顺序 created→valid_from→valid_to；alias 前缀；NaN → `E_BAD_TIMESTAMP` |
| 3 | uncertain 边界（6 行 fixture） | 近似起点行属权威结果；created>at / valid_from>at / valid_to≤at 均不进 uncertain；只有 inconsistent 进 `superseded-without-end`；同一 id 不重复 |
| 4 | created>at 不得误报 unknown-validity | 未来创建的无起点行既不在结果也不在 uncertain |
| 5 | current 视图无 `uncertain` 字段 | 既有 API 行为不变 |

---

## 5. 测试与负向对照

### 5.1 定向 / 回归 / 全量（真实执行）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node --test tests/validity-review-fix.test.mjs` | tests **5** / pass **5** / fail 0 / skip 0 | **0** |
| `node --test tests/asof.test.mjs tests/asof-graph-uncertain.test.mjs tests/validity-integration.test.mjs tests/validity.test.mjs tests/validity-review-fix.test.mjs tests/p4.test.mjs tests/event-chain.test.mjs tests/graph.test.mjs tests/graph-scope-isolation.test.mjs` | tests **46** / pass **46** / fail 0 | **0** |
| `npm test` | tests **297** / pass **297** / fail **0** / **skipped 0**（约 41 s） | **0** |
| `git diff --check` | 无输出 | **0** |
| `git status --short` | 仅 `?? node_modules`（符号链接） | **0** |

> 297 = 上一轮 292 + 本轮新增 5。

### 5.2 负向对照（scratch 修改后恢复，逐字节比对一致）

| 对照 | 操作 | 结果 |
|---|---|---|
| FTS 状态域 | 把 `status='active' AND` 加回两处 FTS 子查询 | **1 例失败**（FTS 历史状态测试），exit 1 |
| uncertain 时间边界 | 从 `uncertainRows` 移除 `uncertaintyWindowSql` 及其参数 | **2 例失败**（边界用例 + 未来误报守卫），exit 1 |
| 恢复 | `diff` 与备份一致 | 5/5 PASS |

---

## 6. 生产与边界

- 未写/删/迁移/回填生产 DB；生产库仅此前只读副本，本轮**未再查询**；未执行生产召回或注入。
- 未改生产插件目录、profile/config；未部署、未重启、未启动 staging。
- 未合并 `feat/m1-preference-memory` 或 main；未改 Persona/EI/Autonomy/Android。
- 未改 `lib/index.js`（未映射 `validFromApproximated`）；未接入 preference / session-index / remembered / merge / daily / weekly / brief。
- 未修改共享 `HANDOFF.md` / `REPORT.md`；仅更新本会话报告。
- 未安装/升级依赖；所有测试使用 `/tmp` 临时库。
- **隔离开发复核修正 PASS ≠ 生产 as-of 验证通过 ≠ 获准合并或部署。**

---

## 7. 尚存风险与未覆盖路径

| 项 | 说明 |
|---|---|
| `unknown-validity` 在 asOfHistory 下几乎不可触发 | 近似起点把这些行变成权威结果；需裁决定是否保留/改调用方为 asOfStrict（见 §3 末） |
| 排序元数据查询仍 `status=? 'active'` | `recall.js` 中只取 importance/created_at 用于排序权重；历史行会落到默认值（不影响是否返回），属既有权重近似，未在本轮范围 |
| `countBlockedMatches` 仍 `status='active'` | 越权审计计数，非权威结果集，未改 |
| graph `unknownHop` 仍以 `status='active'` 限定 | 保持图臂候选集不漂移；与 as-of 状态域不完全一致，属已知残留 |
| top-N 截断可能让「已近似有效的行」落进 uncertain | 遗留 reason 分支在有大量关键词候选时才可能触发；属 reason 语义问题，需随上一条裁决一起处理 |
| 生产 as-of | **NOT RUN**（生产插件为旧版） |
| 其他调用点 | preference / session-index / remembered / merge / daily / weekly / brief 仍用旧谓词（按授权未动） |

## 8. 证据索引

| 内容 | 命令 | 退出码 |
|---|---|---|
| HEAD / 提交 | `git log --oneline -4`（`4b4f927 / 78c1556 / 1e468db / 38844d1`） | 0 |
| blob | `git rev-parse HEAD:<path>`（6 个文件） | 0 |
| 新增定测 | `node --test tests/validity-review-fix.test.mjs` | 0 |
| 回归 | 8 个受影响测试文件合并运行（46） | 0 |
| 全量 | `npm test`（297） | 0 |
| 负向对照 ×2 | FTS 回退 → 1 fail；时间窗移除 → 2 fail | 1（预期） |
| 工作树 | `git diff --check`、`git status --short` | 0 |
