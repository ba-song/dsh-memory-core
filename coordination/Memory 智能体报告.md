# MEMORY-REPORT-0006 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：`MEM-P4-TEMPORAL-VERIFY-01`（v1）→ `MEM-VALIDITY-R5-01`（v2）→ `MEM-VALIDITY-IMPL-01`（v3）→ `MEM-VALIDITY-INTEGRATION-01`（v4）→ `MEM-VALIDITY-INTEGRATION-REVIEW-FIX-01`（v5）→ `MEM-VALIDITY-GPT-FIX-VERIFY-01`（v6，本轮）
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 12:5x (Asia/Shanghai) · v6

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001 | 2026-11-21 10:15 | P4 时间有效性隔离验收（1635ccb）：PASS |
| MEMORY-REPORT-0002 | 2026-11-21 10:5x | R5 双模式语义审查：4 种口径、as-of 生产缺失、2×2 谓词方案 |
| MEMORY-REPORT-0003 | 2026-11-21 11:1x | 统一谓词 helper + P4 接入（4af81a2）：21 例新测试、279/279 |
| MEMORY-REPORT-0004 | 2026-11-21 11:5x | recall / graph / event-chain 接入（38844d1）：13 例新测试、292/292 |
| MEMORY-REPORT-0005 | 2026-11-21 12:2x | FTS 状态域 + uncertain 时间边界（4b4f927）：5 例新测试、297/297 |
| MEMORY-REPORT-0006 | 2026-11-21 12:5x | 复核 GPT `697de1e`+`b4606e1`：**PARTIAL**（top-N 修复 PASS；graph-only 诊断回归 FAIL，全量 297/298） |

---

## 0. 结论：**PARTIAL**

| 验证项 | 判定 | 证据 |
|---|---|---|
| 基线 HEAD 与两个提交 | **PASS** | HEAD = `b4606e1`，`4b4f927 → 697de1e → b4606e1` 父子链正确 |
| 文件 blob 与 HANDOFF-0058 一致 | **PASS** | `recall.js` `75b4fb7f…`、`asof-graph-uncertain.test.mjs` `28425c24…`，与 HANDOFF §55.1 记载完全相同 |
| 修改 A：`unknown-validity` 限定 unknownHop | **PASS（实现如述）** | `uncertainRows` 新增 `unknownIds`，SQL 仅对该集合检查 `TEMPORAL_UNKNOWN_SQL`；参数顺序正确 |
| 修改 B：top-N 回归测试 | **PASS** | 新用例通过；负向对照 1 证明撤掉限定后它确实失败 |
| **要求 5：graph-only unknownHop 既有诊断保留** | **FAIL** | `tests/asof-graph-uncertain.test.mjs:40` 既有用例失败；根因见 §6 |
| 全量测试 0 fail / 0 skip | **FAIL** | 298 tests / **297 pass / 1 fail / 0 skip**，exit **1** |
| 两组负向对照 | **对照组 1 PASS；对照组 2 不可区分** | 见 §5 |
| 生产 DB / 部署 / staging | **未触碰** | 见 §8 |

**判定理由**：GPT 的 top-N 误报修复本身正确且有回归测试保护；但「graph-only unknownHop 的既有诊断行为必须保留」这一条在当前实现下无法同时成立——既有测试直接失败。按任务要求「先定位和报告，不要擅自扩展修复范围」，本轮不修改代码，只提交证据与选项供 GPT 裁决。

---

## 1. 基线与提交核对

| 项 | 值 |
|---|---|
| 仓库 / 分支 | `ba-song/dsh-memory-core` / `feat/memory-validity-unified` |
| 本轮开始前 HEAD（任务给定） | `4b4f92751b6c8cc41c0935fc2b4c267cd9cbd4c9` |
| **实际 HEAD（实测）** | **`b4606e1c66f1afb94cb154b7ec96423103477029`**（与预期一致） |
| 提交 1 | `697de1ee11ec12fb41d2d5a701851635c9192827`，parent `4b4f92751b6c8cc41c0935fc2b4c267cd9cbd4c9` |
| 提交 2 | `b4606e1c66f1afb94cb154b7ec96423103477029`，parent `697de1ee11ec12fb41d2d5a701851635c9192827` |
| 本轮 diff（4b4f927→b4606e1） | `lib/recall/recall.js` ±28 / `tests/asof-graph-uncertain.test.mjs` +39，共 +57/−10 |
| `recall.js` blob @ HEAD | `75b4fb7f184e1c614d8056ce7ab39f6d650a6f28`（HANDOFF-0058 §55.1 记载一致） |
| `asof-graph-uncertain.test.mjs` blob @ HEAD | `28425c24c1f516305dd69bc9dc5ab4b63da13edb`（记载一致） |
| coordination HEAD | `cabc7065b5c06867f76cda139267cd6ea1e3c9b3`（HANDOFF-0058"Memory and EI status"） |
| `HANDOFF.md` / `REPORT.md` blob | `e439d51f3fcb830734f4bc69ec802327f42ab0b9` / `f1add923426b11b39a702e435597e184159800c9`（本轮已完整读取相关章节，未修改） |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/verify`（detached @ b4606e1）；`node_modules` 复用既有目录，未安装/升级 |

---

## 2. 代码核对（`697de1e`）

`uncertainRows()` 新增 `unknownIds` 参数：

```js
const unknownList = [...new Set(unknownIds)].filter((id) => list.includes(id)).slice(0, 200)
const unknownPh = unknownList.length ? unknownList.map(() => '?').join(',') : null
const unknownClause = unknownPh ? `(id IN (${unknownPh}) AND (${TEMPORAL_UNKNOWN_SQL}))` : '0'
...
WHERE id IN (${ph}) AND ${w.sql} AND ${domain.sql} AND ${win.sql}
  AND ((${guard.sql}) OR ${unknownClause}) LIMIT ?
.all(...list, ...w.params, ...win.params, ...unknownList, Math.max(1, Number(limit) || 10))
```

`recall()` 调用改为 `unknownIds: g.unknownHop.keys()`。

**参数顺序核对**：SQL 文本顺序为 `id IN (list)` → `scope` → `domain`（无参） → `win`（3 参） → `guard`（无参）/ `unknownPh` → `LIMIT`；绑定顺序 `list, w.params, win.params, unknownList, limit` 一一对应 ✅。
**空集处理**：`unknownList` 为空时 `unknownClause='0'` 且不追加参数 ✅（负向对照 2 即走此路径）。

---

## 3. 定向测试（真实执行）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node --test tests/asof-graph-uncertain.test.mjs` | tests **2** / pass **1** / fail **1** / skip 0 | **1** |
| `node --test tests/validity-review-fix.test.mjs` | tests 5 / pass 5 / fail 0 / skip 0 | **0** |
| `node --test tests/asof.test.mjs` | tests 1 / pass 1 / fail 0 / skip 0 | **0** |
| `node --test tests/validity-integration.test.mjs` | tests 13 / pass 13 / fail 0 / skip 0 | **0** |
| 完整有效性集合（上述 + validity / p4 / event-chain / graph / graph-scope-isolation，9 文件） | tests **47** / pass **46** / fail **1** / skip 0 | **1** |

失败用例与断言：

```
✖ as-of recall reports graph-only unknown-validity neighbours as uncertain
  tests/asof-graph-uncertain.test.mjs:40
  assert.ok(rows.uncertain.some((row) => Number(row.id) === unknownId))
  → actual false
```

其余单文件：`validity.test` 21/21、`validity-review-fix` 5/5、`p4.test` 1/1、`event-chain` 2/2、`graph` 1/1、`graph-scope-isolation` 1/1，全部 exit 0。

---

## 4. 全量测试

```
npm test
tests 298 / pass 297 / fail 1 / skipped 0
EXIT=1
```

比上一轮 297 增加 1（即 `b4606e1` 新增的 top-N 用例），与预期数量一致；**但未达 0 fail**，唯一失败项即 §3 的既有 graph-only 用例。

---

## 5. 负向对照（scratch，恢复后逐字节一致）

### 对照组 1：撤销 `unknownIds` 限定（回到 v5 的"全部候选"规则）

| 配置 | graph-only 用例 | top-N 用例 | 退出码 |
|---|---|---|---|
| 撤销限定后 | ✔ PASS | **✖ FAIL** | 1 |
| 恢复 GPT 代码 | **✖ FAIL** | ✔ PASS | 1 |

→ **符合预期**：新 top-N 测试确实是有效守卫（撤掉修复它就失败）。但也证明两组行为在现有 graph 设计下**互斥**。

### 对照组 2：`recall()` 不传 `unknownHop`（改传 `[]`）

| 配置 | graph-only 用例 | 退出码 |
|---|---|---|
| 传 `[]` | ✖ FAIL | 1 |
| GPT 原实现（传 `g.unknownHop.keys()`） | ✖ FAIL | 1 |

→ **未按预期区分**。原因不是对照写错，而是该 fixture 的 `unknownHop` 本来就是空集（见 §6），所以「传/不传」结果相同。**不能据此声称"恢复了就通过"。**

---

## 6. 根因分析（关键证据）

用与失败用例完全相同的 fixture 直接观测 `graphCandidates()` / `recall()`（临时 DB，只读）：

| 场景 | direct | hop | unknownHop | 结果 | uncertain |
|---|---|---|---|---|---|
| **A 可近似**（`valid_from IS NULL`，`created_at = at-1000`，与非种子共享实体） | `[1]` | **[2]** | **[]** | `[1]` | `[]`（用例期望 `[2:unknown-validity]`） |
| **B 已替代无终点**（同上但 `superseded_by=9`） | `[1]` | `[]` | `[2]` | `[1]` | `['2:superseded-without-end']` |
| **C 创建晚于判定点**（`created_at = 2026-12-01`） | `[1]` | `[]` | `[2]` | `[1]` | `[]`（被时间窗排除） |

**机理**：`graphCandidates()` 的 hop 查询使用 `asOfHistory` 过滤，而 `unknownHop` 的定义是「连接到的实体邻居中**不在 hop 里**的 unknown 行」。
- 场景 A：该行通过 `asOfHistory`（近似有效）→ 进入 **hop** → 被排除出 unknownHop → `unknownIds` 为空 → 永远不会产生 `unknown-validity`。
- 场景 B：该行被 guard 排除出 hop → 进入 unknownHop，但因为 `superseded_by≠0`，reason 优先判为 `superseded-without-end`。
- 场景 C：进入 unknownHop，但被 `uncertaintyWindowSql`（`created_at<=at`）排除。

**结论**：`697de1e` 之后，`unknown-validity` 这个 reason **在三条可能路径上全部不可达**。既有用例断言的正是场景 A 的诊断行为，因此必然失败。
这与我上一轮（MEMORY-REPORT-0005 §7）标注的风险一致：近似起点接管后 `unknown-validity` 已趋近死分支；本轮改动把它彻底关闭，并触发回归。

---

## 7. 供 GPT 裁决的选项（本轮未实施）

| 选项 | 做法 | 影响 |
|---|---|---|
| **A** | graph 的 hop 在 as-of 下改用 `asOfStrict`（近似有效行不进入 hop，落入 unknownHop） | graph-only 诊断恢复；但图臂看不到近似有效节点，与关键词/语义臂语义不一致 |
| **B** | 保留当前实现，改写/删除既有 graph-only 用例，承认 `unknown-validity` 已停用（或仅在 `asOfStrict` 调用方保留） | 少一条诊断；需明确 reason 生命周期 |
| **C** | 让 graph 同时返回 `hopStrict`（asOfStrict 集合）用于 unknownHop 归属判断，hop 仍用 asOfHistory | 两全；但同一行会同时是「近似有效结果」与「诊断候选」，需定义是否重复（现有 `uncertain` 已剔除结果） |

无论选哪条，**当前 HEAD `b4606e1` 不能标 PASS**（全量 1 fail）。

---

## 8. 边界声明

- 未写入、删除、回填、迁移生产 DB；本轮未打开生产库（仅 `readOnly` 临时库）。
- 未修改生产插件目录、profile/config；未部署、未重启、未启动 staging。
- 未合并 `feat/m1-preference-memory` 或 main；未改 Persona/EI/Autonomy/Android。
- 未修改共享 `HANDOFF.md` / `REPORT.md`（已核对 blob 未变，仅更新本会话报告）。
- 负向对照全部在 scratch 副本进行，`diff` 与备份逐字节一致后恢复；工作区 `git status --short` 仅 `?? node_modules`。
- **本轮是隔离开发验证，不是生产 as-of 验证，也不构成合并/部署授权。**

---

## 9. 证据索引

| 内容 | 命令 | 退出码 |
|---|---|---|
| 远端 HEAD / 提交链 | `git ls-remote`；`git log -1 --format='%H parent=%P'` | 0 |
| blob | `git rev-parse b4606e1:<path>` | 0 |
| 定向（4 文件） | 见 §3 | 1 / 0 / 0 / 0 |
| 完整有效性集合（9 文件） | `node --test …` | **1**（47/46/1） |
| 全量 | `npm test` | **1**（298/297/1/0） |
| 负向对照 1 | 撤销 `unknownIds` 限定 → top-N 用例失败 | 1（预期） |
| 负向对照 2 | 传 `[]` → graph-only 仍失败（不可区分） | 1 |
| 根因观测 | `/tmp/dbg-why.mjs` 三场景输出（A/B/C） | 0 |
| 工作树 | `git status --short`、`git diff --check` | 0 |
