# MEMORY-REPORT-0003 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：`MEM-P4-TEMPORAL-VERIFY-01`（v1）、`MEM-VALIDITY-R5-01`（v2）、`MEM-VALIDITY-IMPL-01`（v3，本轮）
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 11:1x (Asia/Shanghai) · v3

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001 | 2026-11-21 10:15 | P4 时间有效性隔离验收（1635ccb）：PASS |
| MEMORY-REPORT-0002 | 2026-11-21 10:5x | R5 双模式语义审查：4 种口径、as-of 生产能力缺失、2×2 谓词方案 |
| MEMORY-REPORT-0003 | 2026-11-21 11:1x | 统一谓词 helper 实施 + P4 接入 + 21 例新测试（feat/memory-validity-unified @ 4af81a2） |

---

## 0. 本轮结论

| 交付项 | 状态 | 证据 |
|---|---|---|
| `lib/store/validity.js` 统一谓词 | **PASS** | 新增 228 行；4 预设；`validitySql` / `uncertaintySql` / `resolveSourceTs` |
| P4 两处重复 SQL 改为调用 helper | **PASS** | `p4.js` +22/−20；预过滤与最终查询共用同一 `validitySql()` 对象 |
| `sourceTs` 无效输入处理 | **PASS** | null/NaN/Infinity/0/非数字串 → `E_BAD_SOURCE_TS`，在任何 SQL 之前拒绝 |
| helper + P4 隔离测试 | **PASS** | 新增 `tests/validity.test.mjs` 21 例；负向对照 2 组证明测试非空跑 |
| 定向测试 | **PASS** | `node --test tests/p4.test.mjs` → 1/1、0 skip、exit 0 |
| 全量测试 | **PASS** | `npm test` → **279/279**、0 fail、0 skip、exit 0 |
| 其他调用点 | **NOT TOUCHED（按授权）** | recall / graph / event-chain / preference / session-index / remembered / merge / daily / weekly / brief 未改 |
| as-of 生产能力 | **NOT WIRED（仍未接入）** | `dy_memory_asof` 仍走 recall 的严格谓词 → 生产仍返回 0 条确定结果 |
| 生产数据 / 生产插件目录 | **未触碰** | 只读；无部署/重启/staging/合并主开发分支 |

---

## 1. 基线（本轮实测）

| 项 | 值 |
|---|---|
| 工作分支 | `feat/memory-validity-unified`（GPT 从 P4 候选创建） |
| 基线 commit | `1635ccbaff07ba70d6e42f286ff724b8e55234aa`（已核对为该分支初始 HEAD，且是本轮 HEAD 的祖先） |
| 本轮 HEAD | `4af81a23949b66d5ed9ea9db5241ccfb5f88f43c` |
| 新增提交 | `974944c` feat(store) → `cd8f49e` fix(ingest) → `4af81a2` test(validity) |
| 文件 blob | `validity.js` `f8e86e75…`（10,643 B）｜`p4.js` `fe816084…`（11,503 B）｜`validity.test.mjs` `451009d2…`（18,003 B） |
| 环境 | Node **v24.19.0**、`node:sqlite`、`/tmp/memaudit/validity` 独立 worktree；`node_modules` 为既有目录符号链接，未安装/升级依赖 |

---

## 2. 实施内容（授权范围 1–5 全覆盖）

### 2.1 `lib/store/validity.js`（新，228 行）

唯一谓词来源：**SQL 片段与参数由同一函数返回**，调用方不得自行拼装。

```js
validitySql({ at, preset }) → { sql, params:[at,at], mode, superseded, approximateFrom }
uncertaintySql({ preset })   → { sql, params:[], reasons }
resolveSourceTs(value)       → { ok, value } | { ok:false, code:'E_BAD_SOURCE_TS' }
assertEpochMs / presetOf / VALIDITY_PRESETS / ValidityError
```

预设与已裁决语义逐条一致：

| 预设 | 状态 | 起点 | 终点 | superseded |
|---|---|---|---|---|
| `current` | `='active'` | `valid_from IS NULL OR <=?` | `valid_to IS NULL OR >?` | 强制为空 |
| `asOfHistory` | `NOT IN ('pending','merged')` | `COALESCE(valid_from, created_at_epoch)<=?` | 同上 | `guard`：为空 **或** `valid_to IS NOT NULL` |
| `asOfNeighbor` | 同上 | 同上 | 同上 | `enforce`：强制为空（P4 专用） |
| `asOfStrict` | 同上 | `valid_from IS NOT NULL AND <=?` | 同上 | `guard` |

安全与不变量：
- **alias 白名单** `/^[A-Za-z_][A-Za-z0-9_]{0,31}$/`，`''`/`null` = 不用别名，其余抛 `E_BAD_ALIAS`（阻止 `m; DROP …`、`m.x`、`1m` 等注入形态）。
- **at 必须是有限正数毫秒**，`null/undefined/NaN/±Infinity/0/负数/字符串` 抛 `E_BAD_TIMESTAMP`。
- **参数顺序固定** `[at, at]`：SQL 构造顺序恒为「起点子句 → 终点子句」，测试断言该顺序与 `?` 数量。
- **`current` 只接受 `enforce`**：显式传 `ignore/guard` 抛 `E_BAD_SPEC`（当前视图不允许忽略接班指针），不静默改写。
- **preset 与显式参数互斥**（混用抛 `E_BAD_SPEC`）。
- **近似可识别**：`approximateFrom` 随返回值暴露；`uncertaintySql('asOfStrict')` 额外给出 `missing-valid-from`。
- **superseded 与 valid_to 语义分离**：guard 只放过「有 valid_to 的已替代」；无 `valid_to` 的已替代进入 `uncertain('superseded-without-end')`，不猜。

### 2.2 P4 接入（`lib/ingest/p4.js`，+22/−20）

- 预过滤：`SELECT id FROM memories WHERE ${neighborView.sql}`，参数 `...neighborView.params`。
- 最终邻居：`SELECT id,text,kind FROM memories WHERE id=? AND ${neighborView.sql}`，参数 `(best.id, ...neighborView.params)`。
- `neighborView` 在 `bestMatch` 之前**只构造一次**，两处共用同一对象 → 同一时间基准、同一判断逻辑、同一参数顺序。
- `sourceTs`：参数默认值移除，改为入口统一 `resolveSourceTs()`；`undefined` → `Date.now()`（保留旧行为），其余非法值 → 返回 `{ action:'none', reason:'invalid-source-ts', code:'E_BAD_SOURCE_TS' }`，**发生在任何 SQL / embedding 之前**；落库、`linkMemory` 统一使用已校验的 `at`。
- `ingestClassified` 同步移除 `sourceTs = Date.now()` 默认值，单一来源。

**唯一行为变化（需 GPT 知悉）**：`asOfNeighbor` 的起点从「`valid_from IS NULL` 即通过」变为 `COALESCE(valid_from, created_at_epoch)<=at`。对实时摄取（sourceTs≈now）无影响；对**历史回放**更正确——晚于事件创建的记忆不再被当作该事件的邻居。现有 `tests/p4.test.mjs` 全绿。

---

## 3. 测试证据

### 3.0 P4 原有隔离验收证据（v1，保留、未被本轮覆盖）

- 对象：`1635ccb`（P4 分支），与 d9d50ac 对比 `p4.js` +10/−4、tests +10/−1。
- 时间边界 14 例：1635ccb **14/14 PASS**；对照 d9d50ac **9/14**（B1/B4/B7/B12 误判、B13 抛错）。
- 反向对照：只回退 `conflict.js` → `'queue' != 'merge'`；只回退 `p4.js` → 选中 future-valid 记忆（`3 == 2`）；两者 exit 1。
- 全量：`npm test` **258/258**、0 skip、exit 0（本轮新增 21 例后为 279）。
- 生产数据仿真（只读副本）：旧+旧 → `queue`（邻居 #185，sim 0.6772，复现 #8）；新+新 → `keep`（邻居 #305，0.6583）；交叉组合仍 `queue` → 两处修复缺一不可。
- CI：目标 commit `check-runs=0`（workflow 不触发 `fix/*`）；DSH 正式复验 HANDOFF-0058 仍不存在。
- **注意**：以上是隔离设备证据，不等于生产 PASS，也不等于 DSH 复验。

### 3.1 验收命令（真实执行，本轮）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node --test tests/p4.test.mjs` | tests **1** / pass **1** / fail 0 / skip **0**（`{"ok":true,"test":"p4","pairs":20,…}`，BGE 模型在场，20 对语料真实运行） | **0** |
| `node --test tests/validity.test.mjs` | tests **21** / pass **21** / fail **0** / skip **0** | **0** |
| `npm test` | tests **279** / pass **279** / fail **0** / skip **0**（约 41 s） | **0** |
| `git diff --check` | 无输出（无空白错误） | **0** |
| `git status --short` | 仅 `?? node_modules`（符号链接，不入库） | **0** |
| `git rev-parse HEAD` | `4af81a23949b66d5ed9ea9db5241ccfb5f88f43c` | **0** |

### 3.2 21 例覆盖矩阵

| 分组 | 用例 |
|---|---|
| helper 单元（7） | 预设/枚举完整；current SQL 形状与参数顺序；三种 as-of 预设差异；alias 注入防护；时间与预设参数校验；uncertainty 与预设配套；`resolveSourceTs` 拒绝 null/NaN/Infinity/0/`''`/`abc`/`12abc`/true/{}/[] |
| DB 语义（5） | current 视图（含半开区间与 superseded 排除）；asOfHistory（保留「已替代但历史有效」、archived/expired 可见、pending/merged 排除、NULL 起点近似、创建晚于 at 不参与）；asOfStrict（不接受近似）；asOfNeighbor 与 asOfHistory 的 **N5 不对称**；uncertain 取出的正是被 guard 排除的行 |
| P4 接入（9） | N1 未来 valid_to 参与；N2 `valid_to==sourceTs` 不参与；N3 未来 valid_from 不参与；N4 superseded 且无 valid_to 不参与；N5 邻居视图排除「已替代但历史有效」；预过滤与最终查询同一 helper/同一 sourceTs（Proxy 捕获真实 SQL，断言片段一致、`?` 数 2/3）；无效 sourceTs 在任何 SQL 前拒绝且不落库；未提供 sourceTs 保留默认；数字字符串 sourceTs 可用且写入时间正确 |

### 3.3 负向对照（证明测试不是空跑）

| 对照 | 操作 | 结果 |
|---|---|---|
| 回退 P4 接入 | 仅把 `p4.js` 还原为基线版本（scratch，随后恢复） | **2 例失败**：`预过滤与最终查询使用同一 helper`、`无效 sourceTs 在任何 SQL 之前被拒绝`，exit 1 |
| 变异谓词边界 | `valid_from<=?` → `valid_from<?`、`valid_to>?` → `valid_to>=?`（scratch，随后恢复） | **10 例失败**（SQL 形状、current/asOfHistory/asOfStrict/N5、N1、同源检查），exit 1 |
| 恢复后 | `diff` 与备份逐字节一致，重跑 | 21/21 PASS |

---

## 4. 未改造的调用点（按授权明确保留）

| 调用点 | 现状 | 备注 |
|---|---|---|
| `recall.js:48,71,189` | 严格 as-of / 状态+时间窗 | as-of 生产仍返回 0 条（见 §5） |
| `store/graph.js:51-52,73` | 状态+时间窗（strict 变体） | 无 `superseded_by` |
| `recall/event-chain.js:44-46` | 非严格（当前）/ 严格（as-of） | 无 `superseded_by` |
| `inject/preference.js:40,48` | 状态+`valid_to` | 无 `valid_from`/`superseded_by` |
| `inject/session-index.js:40,66` | 同 B 口径 | 同上 |
| `inject/remembered.js:19` | 同 B 口径 | 同上 |
| `pref/merge.js:116` | 状态+`valid_to` | 同上 |
| `consolidate/daily.js:126`、`weekly.js:72` | 仅 `status='active'` | 无时间窗 |
| `handoff/brief.js:28,38` | 仅状态 | 摘要用途 |

→ 这些点仍在用旧谓词；**R5 的收敛只完成了「单一来源 + P4 首个调用点」，并未完成全仓替换**（不在本轮授权内）。

---

## 5. as-of 生产能力仍未接入（必须如实记录）

- 生产库当前 **225/225 条 `valid_from` 为 NULL**、`temporal_kind` 全 `unknown`。
- `dy_memory_asof`（`index.js:1068`）调用 `recall(..., asOf)`，而 `recall.js:48` 的 `validIdsAsOf()` 仍使用 `TEMPORAL_VALID_SQL`（要求 `valid_from IS NOT NULL`）→ **as-of 允许集恒为空**，结果只进 `uncertain`。
- 本轮**没有**修改 recall，因此：**helper 已具备修复能力，但生产 as-of 仍是空功能**（v2 §5.2 的实测数字 0/0/0 依然成立）。
- 修复路径已由 helper 提供（`asOfHistory` + `COALESCE`），但需要 GPT 另开授权修改 recall/graph/event-chain。

---

## 6. 边界声明

- 未修改生产 DB、生产插件目录、profile、档案；未部署、未重启、未启动 staging。
- 未合并 `feat/m1-preference-memory`；未修改 Persona/EI/Autonomy/Android。
- 未修改 `coordination/HANDOFF.md` / `REPORT.md` / `PROJECT.md`；仅更新本会话报告。
- 未安装或升级任何依赖（`node_modules` 复用既有目录）。
- 未回填任何 `valid_from`；未运行任何维护/衰减/consolidate 脚本。
- **P4 的 PASS 仍限于隔离设备测试，不等于生产 PASS，也不等于 DSH 正式复验。**

---

## 7. 需要 GPT 复核的 4 个点

1. **唯一行为变化**：`asOfNeighbor` 起点改为 `COALESCE(valid_from, created_at_epoch)<=at`（历史回放更正确；实时摄取无影响）。是否认可。
2. **`current` 拒绝 `ignore/guard`**（抛 `E_BAD_SPEC`）：比静默改写更严格，是否符合预期 API。
3. **`uncertaintySql` 语义**：只返回「被排出权威集但应标记」的行（`superseded-without-end`、严格模式下的 `missing-valid-from`），不含全部不一致形态（如 dangling successor）——是否够用。
4. **下一步授权**：是否把 recall / graph / event-chain 接入 `asOfHistory`（这是让生产 as-of 从 0 条变为可用的必要步骤）。

## 8. 证据索引

| 内容 | 命令 / 路径 | 退出码 |
|---|---|---|
| 分支与提交 | `git log --oneline -4`（`4af81a2 / cd8f49e / 974944c / 1635ccb`） | 0 |
| blob | `git rev-parse HEAD:<path>`（3 个文件） | 0 |
| P4 定向 | `node --test tests/p4.test.mjs` | 0 |
| helper 定向 | `node --test tests/validity.test.mjs` | 0 |
| 全量 | `npm test` | 0 |
| 负向对照 1 | 回退 `p4.js`（scratch）→ 2 fail | 1（预期） |
| 负向对照 2 | 变异边界算子（scratch）→ 10 fail | 1（预期） |
| 工作树 | `git status --short`、`git diff --check` | 0 |
