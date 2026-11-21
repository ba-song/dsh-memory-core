# MEMORY-REPORT-0007 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：`MEM-P4-TEMPORAL-VERIFY-01`（v1）→ `MEM-VALIDITY-R5-01`（v2）→ `MEM-VALIDITY-IMPL-01`（v3）→ `MEM-VALIDITY-INTEGRATION-01`（v4）→ `MEM-VALIDITY-INTEGRATION-REVIEW-FIX-01`（v5）→ `MEM-VALIDITY-GPT-FIX-VERIFY-01`（v6）→ `MEM-VALIDITY-GRAPH-STRICT-LANE-VERIFY-02`（v7，本轮）
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 13:0x (Asia/Shanghai) · v7

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001 | 2026-11-21 10:15 | P4 时间有效性隔离验收（1635ccb）：PASS |
| MEMORY-REPORT-0002 | 2026-11-21 10:5x | R5 双模式语义审查：4 种口径、as-of 生产缺失、2×2 谓词方案 |
| MEMORY-REPORT-0003 | 2026-11-21 11:1x | 统一谓词 helper + P4 接入（4af81a2）：21 例新测试、279/279 |
| MEMORY-REPORT-0004 | 2026-11-21 11:5x | recall / graph / event-chain 接入（38844d1）：13 例新测试、292/292 |
| MEMORY-REPORT-0005 | 2026-11-21 12:2x | FTS 状态域 + uncertain 时间边界（4b4f927）：5 例新测试、297/297 |
| MEMORY-REPORT-0006 | 2026-11-21 12:5x | 复核 `697de1e`+`b4606e1`：PARTIAL（top-N PASS、graph-only 回归 FAIL） |
| MEMORY-REPORT-0007 | 2026-11-21 13:0x | 复核 C 方案 `d6521c1`+`1d0a163`+`c437c46`：**PASS**（298/298、三组负向对照符合预期） |

---

## 0. 结论：**PASS**

| 验证项 | 判定 | 证据 |
|---|---|---|
| 基线 HEAD 与三个提交链 | **PASS** | HEAD = `c437c46`；`b4606e1 → d6521c1 → 1d0a163 → c437c46` 父子关系逐一核对 |
| 修改 1：`hopStrict` 独立诊断通道 | **PASS（如述）** | 仅 `!direct.has(id)` 过滤；`unknownHop` 保留为同一 Map 的兼容别名 |
| 修改 2：recall 使用 strict 通道 | **PASS（如述）** | `unknownIds: (g.hopStrict ?? g.unknownHop).keys()`；权威结果仍只来自 direct+hop |
| 修改 3：重叠断言 | **PASS** | 同一记录可同时出现在 `graph.hop` 与 `graph.hopStrict` |
| 定向测试 | **PASS** | 2/2、5/5、1/1、13/13，全部 exit 0 |
| 有效性集合 | **PASS** | 47/47、0 fail、0 skip、exit 0 |
| 全量测试 | **PASS** | **298/298**、0 fail、0 skip、exit **0** |
| 三组负向对照 | **PASS（全部按预期失败）** | 见 §6 |
| 生产 DB / 目录 / 部署 / staging | **未触碰** | 见 §8 |

**本轮为隔离开发验证；不代表生产 as-of 验证通过，也不构成合并/部署授权。**

---

## 1. 基线与提交链

| 项 | 值 |
|---|---|
| 仓库 / 分支 | `ba-song/dsh-memory-core` / `feat/memory-validity-unified` |
| 修正前基线 | `b4606e1c66f1afb94cb154b7ec96423103477029` |
| **实际 HEAD** | **`c437c460d8378cbf6493a5e4e12d673c4334d50f`**（与预期一致，分支未前进） |
| 提交 1 | `d6521c10d8ff4c01cdaa0cd5712f3921b7ac43b4`，parent `b4606e1…`，`fix(graph): keep strict diagnostic hops alongside approximate hops` |
| 提交 2 | `1d0a163c3878208af8f9f523dd56575cc4b06687`，parent `d6521c1…`，`refactor(recall): consume explicit strict graph diagnostic lane` |
| 提交 3 | `c437c460d8378cbf6493a5e4e12d673c4334d50f`，parent `1d0a163…`，`test(graph): cover overlap between approximate and strict diagnostic hops` |
| diff（b4606e1→c437c46） | `graph.js` +9/−3、`recall.js` +1/−1、测试 +9/−1；共 3 文件 +19/−5 |
| `lib/store/graph.js` blob | `94a196c27455a0a8601ef40889352eb46d2086ac` |
| `lib/recall/recall.js` blob | `6fda81efb6cc21ef5f9daf913ceea944e5bb2dbb` |
| `tests/asof-graph-uncertain.test.mjs` blob | `3a0d514661643fd34db804f9492620223b39c9f3` |
| coordination HEAD / HANDOFF / REPORT | `cabc706` / `e439d51f…` / `f1add923…`（文件内容与 v6 轮一致，未再变更；本轮已按 §1.2 复核 blob） |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/verify2`（detached @ c437c46）；`node_modules` 复用既有目录，未安装/升级 |

---

## 2. 代码语义核对（逐条对照任务 §3）

| 要求 | 实现 | 判定 |
|---|---|---|
| 普通 hop 仍用 `asOfHistory` | recall 传 `preset:'asOfHistory'`（`lib/recall/recall.js` 图臂调用未变） | PASS |
| 不改成 `asOfStrict` | `graph.js` 仅新增 `hopStrict`，`filterSql`/`hop` 完全未动 | PASS |
| 不影响关键词/语义/图谱正式召回 | `graphList` 仍只取 `direct + hop`（`recall.js:183`）；`hopStrict` 未进入 ranked | PASS |
| `hopStrict` 独立、可重叠 | `graph.js:90` `if (!direct.has(id)) hopStrict.set(...)`；`hop` 用 `filterSql` | PASS |
| 缺 `valid_from` 的邻居可进入 | 诊断查询仍是 `temporal_kind='unknown' AND valid_from IS NULL` | PASS |
| 直接命中不作为一跳诊断 | `!direct.has(id)` 保留 | PASS |
| `unknownHop` 兼容别名 | `graph.js:94` `unknownHop: hopStrict`（同一 Map 引用） | PASS |
| strict 不混入权威结果 | recall 只把 `hopStrict` 传给 `unknownIds`，不加入 `graphList` | PASS |
| uncertain 去重 | `candidateIds` 构造后 `for (const row of out) candidateIds.delete(row.id)`；结果不会重复进 uncertain | PASS |
| 时间窗仍生效 | `uncertainRows` 继续使用 `uncertaintyWindowSql({ at })` | PASS |
| `superseded-without-end` 来自全部候选 | SQL 的 `guard` 分支作用于整个 `list`，与 `unknownIds` 无关 | PASS |
| top-N 保护 | 只有 `unknownIds`（strict 通道）能触发 `unknown-validity` | PASS |

**参数顺序**：`unknownIds` 集合占位符位于 `win`（3 参）之后、`LIMIT` 之前；绑定 `...list, ...w.params, ...win.params, ...unknownList, limit` 与 SQL 文本顺序一致。`unknownList` 为空时 `unknownClause='0'` 且不追加参数。

---

## 3. 定向测试（真实执行）

| 命令 | tests | pass | fail | skip | exit |
|---|---|---|---|---|---|
| `node --test tests/asof-graph-uncertain.test.mjs` | 2 | **2** | 0 | 0 | **0** |
| `node --test tests/validity-review-fix.test.mjs` | 5 | 5 | 0 | 0 | **0** |
| `node --test tests/asof.test.mjs` | 1 | 1 | 0 | 0 | **0** |
| `node --test tests/validity-integration.test.mjs` | 13 | 13 | 0 | 0 | **0** |

重点确认：
1. graph-only unknown-validity 测试 **通过**；
2. top-N 近似有效关键词候选 **不误报**（通过）；
3. 重叠断言通过：`graph.hop.has(unknownId)` 与 `graph.hopStrict.has(unknownId)` 同时成立；
4. `superseded-without-end` 既有行为未回归（`validity-integration` 第 11 例、`validity-review-fix` 第 3 例均通过）；
5. 未来创建 / 过期仍被时间窗排除（`validity-review-fix` 第 3、4 例通过）。

## 4. 完整有效性测试集合

9 个文件（asof、asof-graph-uncertain、validity-integration、validity、validity-review-fix、p4、event-chain、graph、graph-scope-isolation）：

```
tests 47 / pass 47 / fail 0 / skipped 0    EXIT=0
```

## 5. 全量测试

```
npm test
tests 298 / pass 298 / fail 0 / skipped 0
EXIT=0
```

数量与上一轮一致（298；本轮新增的是既有用例内的重叠断言，不新增测试条目）。**未修改、未删除任何测试以求通过。**

---

## 6. 三组负向对照（scratch 副本，逐字节恢复）

### 对照 A：恢复旧过滤条件（`!hop.has(id)`）

改动：`if (!direct.has(id)) hopStrict.set(...)` → `if (!direct.has(id) && !hop.has(id)) hopStrict.set(...)`

| 结果 | 详情 |
|---|---|
| **失败（预期）** | `✖ as-of recall reports graph-only unknown-validity neighbours as uncertain`，exit 1 |
| 失败断言 | `AssertionError: strict diagnostic lane must retain the same missing-valid_from hop`（`actual: false`） |
| 说明 | 同一测试内的 recall 断言因 `hopStrict` 变空而同样无法成立（由对照 B 独立证明空集合会使其失败） |
| 恢复后 | 2/2 PASS，`diff` 与备份一致 |

### 对照 B：切断 strict 诊断输入（`unknownIds: []`）

| 结果 | 详情 |
|---|---|
| **失败（预期）** | `✖ as-of recall reports graph-only unknown-validity neighbours as uncertain`，exit 1；top-N 用例仍 PASS |
| 恢复后 | 2/2 PASS，`diff` 一致 |

### 对照 C：撤销 top-N 来源限制（所有候选都检查 `TEMPORAL_UNKNOWN_SQL`）

| 结果 | 详情 |
|---|---|
| **失败（预期）** | `✖ as-of recall does not mislabel approximate-valid keyword hits omitted by top-N`，exit 1；graph-only 用例 PASS |
| 恢复后 | 2/2 PASS，`diff` 一致 |

**三组均按预期失败、恢复后全绿，无一组"未按预期失败"的情况。**

---

## 7. 工作区与 diff-check

```
git rev-parse HEAD   → c437c460d8378cbf6493a5e4e12d673c4334d50f
git status --short   → ?? node_modules      （仅符号链接，不入库）
git diff --check     → 无输出               EXIT=0
git diff --stat      → 空（工作树与 HEAD 一致）
```

---

## 8. 生产边界确认

- 未写入、删除、回填、迁移生产 DB；本轮未打开生产库（测试全部使用 `/tmp` 临时库）。
- 未修改生产插件目录、`profile`/`config`；未部署、未重启、未启动 staging。
- 未合并 `feat/m1-preference-memory` 或 `main`；未改 Persona/EI/Autonomy/Android。
- 未修改共享 `HANDOFF.md` / `REPORT.md`（blob `e439d51f…` / `f1add923…` 未变）；未改 `validity.js` helper，未扩展其他调用点。
- 未安装/升级依赖。
- **隔离开发验证 PASS ≠ 生产 as-of 验证通过 ≠ 获准合并或部署。**

---

## 9. 残留风险与建议（不阻塞本轮）

| 项 | 说明 |
|---|---|
| `candidateIds` 仍用兼容别名 | `recall.js:228` 使用 `g.unknownHop.keys()`，而 `unknownIds` 使用 `(g.hopStrict ?? g.unknownHop)`。当前二者是同一 Map，行为一致；若未来移除别名，候选集会静默丢失 strict 通道。建议后续统一为 `(g.hopStrict ?? g.unknownHop)`（本轮未改，避免越界）。 |
| `hopStrict` 的状态域仍是 `status='active'` | 诊断查询硬编码 `m.status='active' AND ... valid_from IS NULL`，与 `asOfHistory` 的 domain（排除 pending/merged、允许 archived/expired）不完全一致。archived/expired 的 unknown 行不会进入 strict 诊断通道；属既有权衡，需另行裁决是否放宽。 |
| `hopStrict` 与 `hop` 重叠时的诊断语义 | 同一行既可能是近似有效结果（若进入 top-N），也可能是诊断候选；现实现用「从 uncertain 候选集删除已返回结果」处理，未进入结果的才诊断，符合本轮裁决。 |
| 其他调用点 | preference / session-index / remembered / merge / daily / weekly / brief 仍未接入统一谓词（按授权）。 |
| 生产 as-of | **NOT RUN**：生产插件仍为旧版。 |

## 10. 证据索引

| 内容 | 命令 / 路径 | 退出码 |
|---|---|---|
| HEAD / 提交链 | `git ls-remote`；`git log -1 --format='%H parent=%P'` ×3 | 0 |
| blob | `git rev-parse c437c46:<path>` ×3 | 0 |
| 定向 4 文件 | 见 §3 | 0 / 0 / 0 / 0 |
| 完整性集合（9 文件） | `node --test …` | 0（47/47） |
| 全量 | `npm test` | 0（298/298/0/0） |
| 对照 A | `graph.js` 回退旧过滤 → 1 fail | 1（预期） |
| 对照 B | `recall.js` → `unknownIds: []` → 1 fail | 1（预期） |
| 对照 C | 撤销来源限制 → top-N 用例 1 fail | 1（预期） |
| 恢复校验 | `diff -q` 三次均与备份一致 | 0 |
| 工作区 | `git status --short`、`git diff --check` | 0 |
