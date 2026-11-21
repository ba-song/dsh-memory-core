# MEMORY-REPORT-0004 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：`MEM-P4-TEMPORAL-VERIFY-01`（v1）、`MEM-VALIDITY-R5-01`（v2）、`MEM-VALIDITY-IMPL-01`（v3）、`MEM-VALIDITY-INTEGRATION-01`（v4，本轮）
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 11:5x (Asia/Shanghai) · v4

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001 | 2026-11-21 10:15 | P4 时间有效性隔离验收（1635ccb）：PASS |
| MEMORY-REPORT-0002 | 2026-11-21 10:5x | R5 双模式语义审查：4 种口径、as-of 生产缺失、2×2 谓词方案 |
| MEMORY-REPORT-0003 | 2026-11-21 11:1x | 统一谓词 helper + P4 接入（4af81a2）：21 例新测试、279/279 |
| MEMORY-REPORT-0004 | 2026-11-21 11:5x | recall / graph / event-chain 接入统一 helper（38844d1）：13 例新测试、292/292 |

---

## 0. 本轮结论（MEM-VALIDITY-INTEGRATION-01）

| 交付项 | 状态 | 关键证据 |
|---|---|---|
| recall 接入 | **PASS** | 一次查询单一 view：允许集 / FTS 臂 / 图臂 / 最终读取共用；as-of 改用 `asOfHistory` |
| graph 接入 | **PASS** | 新增 `preset`（优先于 `strictAsOf`）；默认 `current`；`strictAsOf:true` → `asOfStrict` 兼容 |
| event-chain 接入 | **PASS** | SQL 与 seed/候选复核都走 helper；`current` / `asOfHistory`（历史默认）/ `asOfStrict` 可选 |
| 近似时间可识别 | **PASS** | as-of 结果新增可选字段 `validFromApproximated`（`valid_from IS NULL` → true） |
| 不确定性不丢失 | **PASS** | `uncertain` 保留遗留 `unknown-validity`，并新增 `superseded-without-end` |
| 定向测试 | **PASS** | `tests/validity-integration.test.mjs` **13/13**；`tests/validity.test.mjs` 21/21；`tests/p4.test.mjs` 1/1 |
| 全量测试 | **PASS** | `npm test` **292/292**、0 fail、**0 skip**、exit 0 |
| 负向对照 | **PASS** | 三个领域各做一次回退/变异，各 **2 例失败**；恢复后 13/13 |
| 生产数据 / 部署 | **未触碰** | 只读；无部署、无重启、无 staging、无合并 |

**总判定：隔离开发验收 PASS。不等于生产 as-of 通过验证，也不代表生产环境已完成修复。**

---

## 1. 基线（本轮实测）

| 项 | 值 |
|---|---|
| 分支 | `feat/memory-validity-unified` |
| 本轮起点 | `4af81a23949b66d5ed9ea9db5241ccfb5f88f43c`（已核对为分支 HEAD） |
| **本轮 HEAD** | **`38844d1`**（完整：`38844d1…`，2026-11-21 11:4x +0800） |
| 本轮提交 | `71152b7` feat(validity) → `9dd62a7` refactor(recall) → `f4227ba` refactor(graph) → `3d4db15` refactor(event-chain) → `38844d1` test(validity) |
| blob | `validity.js` `82fc4519…`｜`recall.js` `3127e9ae…`｜`graph.js` `bd169366…`｜`event-chain.js` `c38c8c15…`｜`validity-integration.test.mjs` `7a239fb9…` |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/validity`；未安装/升级依赖 |
| 文档核对 | 仓库无 `AGENTS.md`（`git ls-tree` 确认）；已读 `README.md` §8/§9 测试约定、`docs/` 既有设计文档、`coordination/HANDOFF.md`（blob `f8ffa40d…`，最新章 54）与 `REPORT.md`（blob `e219f707…`，REPORT-0014）— 两者仍**未记录** 4af81a2 / 38844d1 |

---

## 2. 修改文件清单与理由

| 文件 | 变更 | 理由 |
|---|---|---|
| `lib/store/validity.js` | +59/−? | 新增 `validityDomainSql()`（状态域单一来源）、内部 `domainFor()`、`isValidAt()`（JS 镜像，供 event-chain 单行复核）；`validitySql` 改用 `domainFor` |
| `lib/recall/recall.js` | 81 行改动 | 删除 `temporalFilter/validIdsAsOf/scopedIds` 三处重复谓词；一次查询构造单个 `view` 复用于允许集、FTS、图臂、最终读取；`uncertainRows` 改为「遗留 unknown-validity ∪ superseded-without-end」；as-of 结果标记 `validFromApproximated` |
| `lib/store/graph.js` | 11 行改动 | `temporalSql` 换为 `preset`（默认 `current`，`strictAsOf` → `asOfStrict`，显式 `preset` 优先）；状态域与时间窗由 helper 提供 |
| `lib/recall/event-chain.js` | 31 行改动 | 删除本地 `validAt` 与手写时间 SQL；`preset` 参数（历史默认 `asOfHistory`）；seed 与候选复核都走 `isValidAt` |
| `tests/validity-integration.test.mjs` | 新增 13 例 | 三个领域定向测试 + 边界/近似/严格/参数化/时间基准一致性 |

> 未改：`daily.js`、`weekly.js`、`brief.js`、`preference.js`、`session-index.js`、`remembered.js`、`pref/merge.js`、`index.js`（见 §6 待办）。

---

## 3. 各调用点的 preset 与语义说明

### 3.1 recall（`lib/recall/recall.js`）

| 场景 | preset | 理由 |
|---|---|---|
| 不传 `asOf`（当前召回） | `current` | 语义裁决 A：只回当前有效，必须排除 superseded；`at` 取本次查询的 `nowAt`（一次查询一个时间基准） |
| 传 `asOf`（历史时点） | `asOfHistory` | 语义裁决 B：起点 `COALESCE(valid_from, created_at_epoch)`，终点 `valid_to > at`；保留「已替代但当时有效」；排除 pending/merged |

实现要点：
- `allowedIds(db, scope, view)`：`WHERE ${scopeWhere.sql} AND ${view.sql}`，参数 `[...scope.params, ...view.params]`。
- FTS 臂：`keywordScores(..., view)` → `combineFilters(scopeFilter, view)`，与允许集同源。
- 图臂：`graphCandidates(..., { asOf, preset })`。
- 最终读取：`SELECT * FROM memories WHERE id=? [AND scope] AND ${view.sql}` —— **与预过滤同一 view 对象**，不再回退到 `status='active'` 或 `now`。
- `uncertainRows`：`domain(asOfHistory) AND (legacy unknown-validity OR uncertaintySql(asOfHistory))`，逐行给 `reason`。
- `validFromApproximated`：仅 as-of 结果出现，`valid_from == null` 时为 `true`（可选字段，不改变既有字段）。

### 3.2 graph（`lib/store/graph.js`）

| 场景 | preset |
|---|---|
| 默认（recall 当前模式、测试默认） | `current` |
| `strictAsOf: true`（旧调用方） | `asOfStrict`（保持旧严格行为） |
| 显式 `preset` | 以显式为准（优先于 `strictAsOf`） |

理由：图臂与召回主路径必须同语义，否则「召回看得到、图臂看不到」。默认改为 `current` 后，图臂也开始排除 superseded（此前漏掉）。

### 3.3 event-chain（`lib/recall/event-chain.js`）

| 场景 | preset | 理由 |
|---|---|---|
| 不传 `asOf` | `current` | 与当前召回一致；superseded seed 不再展开 |
| 传 `asOf` | `asOfHistory` | 历史链条应按当时是否有效判断；允许近似起点 |
| 显式 `preset` | 以显式为准 | 需要「不猜」时传 `asOfStrict` |

**行为变化（如实记录）**：`asOf` 路径从「严格 `valid_from`」改为 `asOfHistory`。既有测试 `as-of event chain excludes unknown-validity` 仍通过——它的无起点候选 `created_at` 晚于判定时点，被 `COALESCE` 正确排除；但语义上「无起点但创建早于判定时点」的记录现在会进入历史链条。若 GPT 认为 event-chain 必须保持严格，可传 `preset:'asOfStrict'`（已测试）。

---

## 4. 关键 SQL 与参数一致性证据

1. **单一来源**：允许集、最终读取、图臂、事件链时间窗都包含 `validitySql()` 生成的同一片段；测试 `recall: as-of 的 SQL 全部来自 helper` 用 Proxy 捕获真实 SQL 并断言：
   - 允许集查询含片段且 `?` 数 = **2**
   - 最终读取含同一片段且 `?` 数 = **3**（id + 两个时间参数）
   - 不存在手写 `valid_from IS NOT NULL AND valid_from <=` 谓词命中 memories 查询。
2. **参数顺序**：`validitySql` 恒返回 `[at, at]`，SQL 构造顺序为「起点子句 → 终点子句」；调用方按 `scope.params + view.params` / `[id, scope..., view.params]` 拼接，与 SQL 文本顺序一致。`tests/validity.test.mjs` 断言子句顺序与占位符数量。
3. **alias 安全**：图臂/事件链使用 `alias:'m'`（helper 白名单校验），其余不带 alias。
4. **注入风险**：所有调用点参数化；测试覆盖 alias 非法形态（`m; DROP…`、`m.x`、`1m`）。

---

## 5. 近似时间与严格时间的处理证据

| 场景 | 行为 | 证据 |
|---|---|---|
| as-of + `valid_from IS NULL` + `created_at <= at` | 进入权威结果，`validFromApproximated: true` | 集成测试「as-of 使用近似起点并标记」 |
| as-of + `valid_from IS NULL` + `created_at > at` | **不进入**结果（近似不能提前生效） | 同上 |
| `asOfStrict` | 无 `valid_from` 一律不进确定结果 | graph / event-chain 各 1 例 |
| 严格模式的不确定性 | `uncertaintySql('asOfStrict')` 增加 `missing-valid-from` | `tests/validity.test.mjs` |
| 近似不得冒充精确 | 仅在 `valid_from == null` 时置位；`false` 时表示真实 `valid_from` | 集成测试「已替代但当时有效」断言 `false` |

**生产口径影响（只读副本，225 条，10:42 快照）**：

| 指标 | 旧实现 | 新实现 |
|---|---|---|
| current 允许集 | 211 | **211**（差 0 行；`superseded 且 valid_to IS NULL` 为 0） |
| as-of 2026-11-08 | **0** | **48** |
| as-of 2026-11-15 | **0** | **162** |
| as-of 2026-11-20 | **0** | **211** |

> 这组数字只说明**代码层谓词行为**；生产仍运行旧插件，未验证。

---

## 6. 测试结果

### 6.1 定向

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node --test tests/validity-integration.test.mjs` | 13 / pass **13** / fail 0 / skip 0 | **0** |
| `node --test tests/validity.test.mjs` | 21 / pass 21 / fail 0 / skip 0 | **0** |
| `node --test tests/p4.test.mjs` | 1 / pass 1 / fail 0 / skip 0 | **0** |
| `node --test tests/asof.test.mjs tests/asof-graph-uncertain.test.mjs tests/event-chain.test.mjs tests/graph.test.mjs tests/graph-scope-isolation.test.mjs` | 6 / pass 6 / fail 0 | **0** |

### 6.2 全量

`npm test` → tests **292** / pass **292** / fail **0** / **skipped 0** / exit **0**（约 41 s）。为 279 + 13 新增。

### 6.3 负向对照（scratch 回退后恢复，逐字节比对一致）

| 对照 | 操作 | 结果 |
|---|---|---|
| recall | as-of preset 改回 `asOfStrict` | **2 例失败**，exit 1 |
| graph | 强制 `asOfHistory`（当前视图也走历史） | **2 例失败**，exit 1 |
| event-chain | 强制 `current` | **2 例失败**，exit 1 |
| 恢复 | diff 三文件与备份一致 | 13/13 PASS |

### 6.4 工作区

`git diff --check` → 无输出、exit 0；`git status --short` → 仅 `?? node_modules`（符号链接）。

---

## 7. 未解决问题 / 未覆盖调用点

| 项 | 状态 | 说明 |
|---|---|---|
| `preference.js` / `session-index.js` / `remembered.js` / `pref/merge.js` / `daily.js` / `weekly.js` / `brief.js` | **未改（按授权）** | 仍用旧谓词；列为后续待办 |
| `dy_memory_asof` 工具输出 | **未映射新字段** | recall 已返回 `validFromApproximated`，但 `lib/index.js:1109` 的显式映射未包含它；需 1 行改动 + 测试（本轮不动 index.js） |
| `countBlockedMatches` | **未改** | 只做越权计数，仍用 `status='active'`；非权威结果集 |
| graph `unknownHop` 过滤 | **保留原样** | 仍 `status='active' AND valid_from IS NULL`（未纳入 superseded 语义），避免改变图臂候选集 |
| **生产 as-of 验证** | **NOT RUN** | 生产插件为旧版；本轮只到隔离代码与测试 |
| 不一致形态的自动修复 | **不实施** | 按裁决 E 只分类、不发明修复规则 |

**不一致形态分类（只读副本实测，未输出正文）**：

| 形态 | 计数 | 处理 |
|---|---|---|
| `superseded_by≠0` 且 `valid_to IS NULL` | 0 | `uncertain('superseded-without-end')` |
| `superseded_by` 指向已删除 id | 0 | 未纳入 `uncertaintySql`，如需请另行裁决 |
| `valid_from >= valid_to`（空窗） | 0 | 两模式均不返回 |
| `valid_from` 为 NULL | **225/225** | as-of 用 `created_at` 近似并标记 |
| `superseded_by≠0` 且 `status='active'` | 2（#131/#185） | 其 `valid_to` 已过期，current 与 as-of 均正确排除 |

---

## 8. 边界声明

- 未写/删/迁移/回填生产数据库；未改生产插件目录、profile/config；未部署、未重启、未启动 staging。
- 未合并 `feat/m1-preference-memory` 或 main；未改 Persona/EI/Autonomy/Android。
- 未修改共享 `HANDOFF.md` / `REPORT.md` / `PROJECT.md`；仅更新本会话报告。
- 未安装或升级依赖；未执行生产召回或真实注入。
- 所有测试使用 `/tmp` 临时库；生产数据仅通过只读副本查询且不输出正文。
- **隔离开发 PASS ≠ 生产 as-of 验证通过 ≠ DSH 正式复验。**

---

## 9. 需要 GPT 复核的 4 个点

1. **event-chain as-of 默认改为 `asOfHistory`**（此前严格）：既有测试仍通过，但语义确实放宽。若要保持严格，调用方传 `preset:'asOfStrict'`；请裁决默认值。
2. **recall `uncertain` 的口径**：现在 = 遗留 `unknown-validity` ∪ `superseded-without-end`（`reason` 区分）。此前只有前者。是否符合预期。
3. **`validFromApproximated` 的暴露**：目前只在 recall 返回值里；`dy_memory_asof` 工具尚未映射。是否授权下一步改 `index.js`（1 行 + 测试）。
4. **下一批接入**：`preference.js` / `session-index.js` / `remembered.js` / `merge.js` / `daily.js` / `weekly.js` / `brief.js` 是否按同一模式继续。

## 10. 证据索引

| 内容 | 命令 / 路径 | 退出码 |
|---|---|---|
| 分支与提交 | `git log --oneline -6`（`38844d1 … 4af81a2`） | 0 |
| blob | `git rev-parse HEAD:<path>`（5 个文件） | 0 |
| 集成定向 | `node --test tests/validity-integration.test.mjs` | 0 |
| helper 定向 | `node --test tests/validity.test.mjs` | 0 |
| P4 回归 | `node --test tests/p4.test.mjs` | 0 |
| 受影响既有测试 | 5 个文件合并运行 | 0 |
| 全量 | `npm test`（292） | 0 |
| 负向对照 ×3 | scratch 回退/变异 → 各 2 fail | 1（预期） |
| 工作树 | `git diff --check`、`git status --short` | 0 |
| 生产影响量化 | 只读副本 SQL（current 211/211；as-of 0→48/162/211） | 0 |
