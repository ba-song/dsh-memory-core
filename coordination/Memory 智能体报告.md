# MEMORY-REPORT-0002 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：`MEM-P4-TEMPORAL-VERIFY-01`（v1）、`MEM-VALIDITY-R5-01`（v2，本轮）
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 10:5x (Asia/Shanghai) · v2

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001 | 2026-11-21 10:15 | P4 时间有效性隔离验收（1635ccb）：PASS |
| MEMORY-REPORT-0002 | 2026-11-21 10:5x | R5 当前有效性 / 历史时间语义专项：SQL 清单、双模式语义、统一谓词方案、测试矩阵、P4 合入建议 |

---

## 0. 一句话结论

**R5 应当用 current / as-of 双谓词解决，但不能只有两个谓词：需要「时间维度 × 替代维度」的 2×2 参数化（P4 = as-of + 强制排除已替代）。**
**P4（`1635ccb`）本身语义正确，不建议因 R5 暂缓合入；但合入必须附带三项条件（见 §10）。**
**另外发现一个比 R5 更严重的问题：生产环境的 as-of 视图实际返回 0 条（`valid_from` 全为 NULL），`dy_memory_asof` 当前是空功能（见 §5.2）。**

---

## 1. 基线（本轮实测）

| 项 | 值 | 证据 |
|---|---|---|
| P4 分支 HEAD | `1635ccbaff07ba70d6e42f286ff724b8e55234aa` | `git log -1 origin/fix/p4-active-neighbors-semantic-opposition` |
| 开发分支 HEAD | `7548e49ed0b8d8673818464325d8e72ec7704b27` | `git ls-remote` |
| coordination HEAD | `5e0159beff49e798101b11dc647030218f4fd4d6` | 同上 |
| `lib/recall/recall.js` | `16f0759d8bdb71a68f9480b4277d2ed0f08b7405` | `git rev-parse <ref>:<path>`，与 GPT 提供一致 |
| `lib/pref/merge.js` | `2a801eefb4647b8ce3d1e31e2c1c0ad43e92cdf9` | 一致 |
| `lib/inject/preference.js` | `086b3e180050c1156af12b05affd89dbad69c8df` | 一致 |
| `lib/inject/session-index.js` | `355eb7a1bbc88d86e692b13f0bc511359cd0f33a` | 一致 |
| `lib/store/graph.js` | `ac9767070b7639489ff70cba57d41e54b6474773` | 一致 |
| P4 `lib/ingest/p4.js`（验收分支） | `f39adebc92ce1222b355f2082ade64d2f16592e9` | 一致 |
| 生产 DB 只读副本 | `/tmp/memaudit/prod-copy2`，`memory.db` SHA-256 `f8201f8eff2c3f619fea61265bad03054bf51b845b665e422ce84a6d725b830f`，`mode=ro` | 10:42 复制，未打开生产库本体 |

> 5 个非 P4 文件在开发分支与验收分支**完全相同**；只有 `p4.js` 不同（开发分支 `3eaad1b…` = 未修复版）。

---

## 2. R5 定性

当前仓库对「一条记忆是否有效」存在 **3 种互不等价的判定**，且**同一列 `valid_from` 有两种 NULL 政策**：

| 口径 | 谓词 | 使用方 |
|---|---|---|
| **A 仅状态** | `status='active'` | `handoff/brief.js:28,38`、`consolidate/daily.js:126`、`weekly.js:72`、`group/ttl.js:29`、`recall.js:176,239` |
| **B 状态+时间窗** | `status='active' AND (valid_from IS NULL OR <=t) AND (valid_to IS NULL OR >t)` | `recall.js:71`（当前视图）、`preference.js:40,48`、`remembered.js:19`、`session-index.js:40,66`、`graph.js:51`（非严格）、`event-chain.js:45`、`pref/merge.js:116` |
| **C 状态+替代+时间窗** | B + `superseded_by∈{NULL,0,''}` | 仅 P4 `p4.js:98-101,115-118`（验收分支） |
| **D 严格 as-of** | `status='active' AND valid_from IS NOT NULL AND <=t AND (valid_to IS NULL OR >t)` | `recall.js:19,48,189`、`graph.js:51`（strictAsOf）、`event-chain.js:46` |

**判定：FAIL（口径不统一）**。B 与 C 的差异当前只影响 2 行（且这 2 行已被过期 `valid_to` 排除，见 §5.1）；D 的差异是致命的（见 §5.2）。

---

## 3. 全部相关 SQL 查询清单（逐条核实）

| # | 位置 | 场景 | 现有谓词 | 缺失 | 判定 |
|---|---|---|---|---|---|
| 1 | `recall.js:71` `scopedIds()` | 当前召回允许集 | B | `superseded_by` | FAIL |
| 2 | `recall.js:48` `validIdsAsOf()` | as-of 允许集 | D | NULL `valid_from` 被排除；`superseded_by`（应忽略而非强制） | **FAIL（致命）** |
| 3 | `recall.js:61` `uncertainRows()` | as-of 不确定集 | `status='active'` + `valid_from IS NULL` | 缺 `superseded-without-end` 等不一致原因 | PARTIAL |
| 4 | `recall.js:102,111` FTS 子查询 | 关键词臂 | 仅 scope/as-of 时附加时间窗；owner 当前模式靠 JS `allowed` 集过滤 | 无 `superseded_by` | FAIL（依赖 #1） |
| 5 | `recall.js:189` 最终读取 | 结果读取 | `status=?` + as-of 严格时间窗 | 当前模式不复核时间窗（依赖 #1）；无 `superseded_by` | PARTIAL |
| 6 | `recall.js:176` 排序元数据 | 排序 | 仅 `status='active'` | 无时间窗/替代（按 id 取自允许集，可接受） | PASS（受限） |
| 7 | `recall.js:239` `countBlockedMatches()` | 越权探测 | 仅 `status='active'` | 无 | PASS（只数，不返回正文） |
| 8 | `pref/merge.js:98` 候选行 | 偏好合并 | `status IN ('active','pending')` | 无（候选取 active/pending 合理） | PASS |
| 9 | `pref/merge.js:116` 旧偏好行 | 偏好合并 | B | `superseded_by`；`valid_from` | FAIL |
| 10 | `pref/merge.js:145-152` 写替代 | 写路径 | 同时写 `valid_to`+`superseded_by` | — | PASS（自洽） |
| 11 | `inject/preference.js:40,48` | 常驻偏好注入 | B | `superseded_by`；`valid_from` | FAIL |
| 12 | `inject/session-index.js:40` | episode 索引 | B | `superseded_by`；`valid_from` | FAIL |
| 13 | `inject/session-index.js:66` | todo 约定 | `status IN ('active','')` + `valid_to` | `superseded_by`；`valid_from` | FAIL |
| 14 | `store/graph.js:51-52` 直接命中 | 图臂 | B（非严格）/ D（strictAsOf） | `superseded_by` | FAIL |
| 15 | `store/graph.js:56-60` 1 跳 | 图臂 | 同上 | `superseded_by` | FAIL |
| 16 | `store/graph.js:73` unknown-hop | 图臂 | `status='active'` + `valid_from IS NULL` | 无 `superseded_by`；只用于 as-of 补充 | PARTIAL |
| 17 | `inject/remembered.js:19` | 常驻「记得」块 | B | `superseded_by`；`valid_from` | FAIL |
| 18 | `recall/event-chain.js:44-46` | 事件链扩展 | 非严格（当前）/ 严格（as-of） | `superseded_by` | FAIL |
| 19 | `consolidate/daily.js:126` | 日结输入 | A | 时间窗、替代 | FAIL |
| 20 | `consolidate/weekly.js:72` | 周结输入 | A | 时间窗、替代 | FAIL |
| 21 | `handoff/brief.js:28,38` | 交接摘要 | A | 时间窗、替代 | FAIL（低风险，摘要用途） |
| 22 | `ingest/p4.js:98-101` 预过滤 | P4 邻居 | C（`at=sourceTs`） | 谓词重复书写（R1） | PASS（语义正确） |
| 23 | `ingest/p4.js:115-118` 最终邻居 | P4 邻居 | C（`at=sourceTs`） | 同上 | PASS |
| 24 | `inject/rules.js:36,112` | rules 表（独立表） | `status='active'` + `valid_to>?` + `superseded_by` 状态由 `status` 表达 | 不在 memories 范围 | PASS（表独立，另行评审） |

> 说明：`lib/store/db.js`、`schema.js`、`episode-rewrite.js`、`index.js` 中的 `valid_from/valid_to/superseded_by` 是 DDL、迁移、参数透传，不是判定点。

---

## 4. 双模式语义定义（建议采用）

### 4.1 两个正交维度

| 维度 | 取值 | 含义 |
|---|---|---|
| **时间维度** | `current` | 以「现在」为判定点：这条记忆**此刻**是否仍然成立 |
| | `asOf(t)` | 以「历史时刻 t」为判定点：这条记忆**在 t 时**是否成立 |
| **替代维度** | `enforce` | 已显式标记被替代 → 一律不参与（当前状态优先） |
| | `ignore` | 不读 `superseded_by`：历史有效性只由 `valid_to` 表达 |
| | `guard` | 只在 `superseded_by≠0 且 valid_to IS NULL`（无法判定结束时间）时排除，并进 `uncertain` |

### 4.2 2×2（+guard）矩阵与推荐预设

| 预设 | 时间 | 替代 | 用于 |
|---|---|---|---|
| **`current`** | now | **enforce** | 当前偏好注入、常驻块、当前召回、图臂、当前会话索引 |
| **`asOfHistory`** | t | **ignore** | 历史回忆（`dy_memory_asof`）、事件链、历史审计 |
| **`asOfNeighbor`** | sourceTs | **enforce** | P4 邻居（当前实现），语义 = 「在候选时刻有效 **且** 至今未被替代」 |
| （可选）`asOfStrict` | t | **guard** | 需要「不猜」的审计视图 |

### 4.3 为什么不能只用一个谓词

- 「`superseded_by≠0` 就排除」在 **current** 是对的：当前代表已被接班。
- 在 **asOf** 是错的：一条在 T1 有效、T2 被替代（`valid_to=T2`）的记忆，**在 T1 是历史事实**；按 `superseded_by` 排除会丢失「历史上确实如此」。**必须用 `valid_to` 表达，而不是用 `superseded_by`。**
- 「`status='active'`」是**当前管理状态**，不是历史属性：`superseded`/`corrected`/`archived`/`expired` 的行在历史上都可能有效。as-of 必须换用**状态集合**（排除 `pending`/`merged`），而不是 `='active'`。
- `superseded_by≠0` 且 `valid_to IS NULL` 是**数据不一致**，不能猜：current 保守排除；as-of 排除出权威集并标记 `uncertain`。

### 4.4 生产数据验证该语义（只读副本）

当前 225 条：`active 213 / archived 8 / merged 3 / pending 1`。`superseded_by≠0` 仅 2 条（#131、#185），**均 `status=active`**、`valid_to=2026-11-18 13:50`（已过期）；`superseded_by` 指向缺失行 0 条；`valid_from>=valid_to` 0 条；`superseded_by≠0 且 valid_to IS NULL` 0 条。

- 按 current：这 2 条已被过期 `valid_to` 排除 → **加 `superseded_by` 后当前视图变化 = 0 行**（211 → 211）。
- 按 as-of（历史）：#131/#185 在 `valid_to` 之前仍应作为历史事实可见 —— 若按 `superseded_by` 排除，就丢掉历史（这正是 §4.3 的结论）。

---

## 5. 关键发现（比 R5 更严重）

### 5.1 current 视图：加 `superseded_by` 是「今天无变化、明天防漂移」

```
CUR_OLD = status='active' AND (valid_from IS NULL OR valid_from<=now) AND (valid_to IS NULL OR valid_to>now)
CUR_NEW = CUR_OLD AND (superseded_by IS NULL OR superseded_by=0 OR superseded_by='')
@now=2026-11-21 10:41 → old=211, new=211, delta=∅
```
**判定：PASS（无行为风险）**；价值在于防止未来出现「superseded 但 valid_to 为空」时被漏掉。

### 5.2 as-of 视图：生产实际返回 0 条（**FAIL，P1**）

`recall.js:19` 的 `TEMPORAL_VALID_SQL` 要求 `valid_from IS NOT NULL`；生产 **225/225 条 `valid_from` 为 NULL、`temporal_kind` 全为 `unknown`** → as-of 允许集恒为空：

| as-of 时点 | 现实现（严格） | 建议实现（`COALESCE(valid_from, created_at_epoch)`） |
|---|---|---|
| 2026-11-08 12:00 | **0** | **48** |
| 2026-11-15 12:00 | **0** | **162** |
| 2026-11-20 12:00 | **0** | **211** |

后果：`dy_memory_asof` 工具（`index.js:1068`）在生产只会返回 `uncertain`，永远没有确定结果；`event-chain` 的 as-of 扩展、`graphCandidates(strictAsOf:true)` 同样失效。
**这不是 R5 的不统一，而是 as-of 能力从未真正启用。**

### 5.3 `status` 是当前管理状态，但被当作历史状态使用

- as-of 路径要求 `status='active'`（`recall.js:48,189`、`event-chain.js:54`）→ 现在 `archived`（8 条）、将来 `superseded/corrected` 的历史都会在 as-of 中消失。
- 反例证据：`group/ttl.js:34` 把到期群记忆改 `status='expired'`，**不写 `valid_to`**；`clarity.js:78` 改 `status='archived'`，**也不写 `valid_to`** → 这两类「不再展示」不等于「历史上不存在」，as-of 应包含它们（实测把 archived 纳入后，11-15 时点多出 7 条）。

### 5.4 数据不一致分类（当前全为 0，但必须定义处理方式）

| 编号 | 形态 | 生产计数 | current 建议 | as-of 建议 |
|---|---|---|---|---|
| D1 | `superseded_by≠0` 且 `valid_to IS NULL` | **0** | 排除 + 记不一致 | 排除出权威集，进 `uncertain('superseded-without-end')` |
| D2 | `superseded_by≠0` 且 `valid_to>at`（未来结束） | **0** | 排除 + 记不一致 | 若 `at<valid_to` 无法判定 → `uncertain` |
| D3 | `superseded_by≠0` 且 `status='active'` | **2**（#131/#185） | 由过期 `valid_to` 排除；仍应记不一致告警 | 不受影响（`valid_to` 已过） |
| D4 | `superseded_by` 指向已删除记忆 | **0** | 视为已替代 | 视为已替代 + 记不一致 |
| D5 | `valid_from>=valid_to`（空窗） | **0** | 排除 | 排除 + 记不一致 |
| D6 | `archived`/`expired` 无 `valid_to` | `archived 8` / `expired 0` | 排除（status） | **包含**（历史有效） |
| D7 | `valid_from` 全 NULL | **225** | 视为 −∞（现行为） | 以 `created_at_epoch` 近似（见 §6） |

---

## 6. 统一谓词方案（建议，未实施）

### 6.1 单一来源模块 `lib/store/validity.js`

```js
// 时间维度 × 替代维度；params 恒为 [at, at]
export function validitySql({ at, mode = 'current', superseded = null, alias = '' }) {
  const a = alias ? alias + '.' : ''
  const SUP = `(${a}superseded_by IS NULL OR ${a}superseded_by=0 OR ${a}superseded_by='')`
  const WIN = `(${a}valid_from IS NULL OR ${a}valid_from<=?) AND (${a}valid_to IS NULL OR ${a}valid_to>?)`
  if (mode === 'current') {
    // current 默认 enforce
    return { sql: `${a}status='active' AND ${WIN} AND ${SUP}`, params: [at, at] }
  }
  // as-of：状态集合 + 时间窗；NULL valid_from 用 created_at 近似，并在结果标注 unknown
  const ASOF_WIN = `(COALESCE(${a}valid_from, ${a}created_at_epoch)<=?) AND (${a}valid_to IS NULL OR ${a}valid_to>?)`
  const base = `${a}status NOT IN ('pending','merged') AND ${ASOF_WIN}`
  if (superseded === 'enforce') return { sql: `${base} AND ${SUP}`, params: [at, at] }
  if (superseded === 'guard')   return { sql: `${base} AND (${SUP} OR ${a}valid_to IS NOT NULL)`, params: [at, at] }
  return { sql: base, params: [at, at] }            // ignore（默认 as-of）
}

// 不一致检测（只读审计用）
export function inconsistencyOf(row, at) // → null | 'superseded-without-end' | 'superseded-future-end' | 'dangling-successor' | 'empty-window' | 'unknown-valid-from'
```

**预设**：`current`、`asOfHistory`（ignore）、`asOfNeighbor`（enforce，P4）、`asOfStrict`（guard）。

### 6.2 为什么用 `COALESCE(valid_from, created_at_epoch)`

- **不写数据**、可回滚、确定性：解决「as-of 全空」而无需 225 行回填。
- 语义近似：记忆最早可能在它被写下的时刻生效，这是**保守上界**（只会减少、不会伪造历史）。
- 结果必须带 `validFromApproximated: true`（或 `temporal_kind='unknown'` 原样透传），调用方知道这是近似。
- 未来如获授权，可一次性回填 `valid_from=created_at_epoch` 并置 `temporal_kind='current'`，届时 helper 自动退化为精确判定（**迁移可逆**）。

### 6.3 调用点改造清单（按风险排序）

| 优先级 | 调用点 | 目标预设 |
|---|---|---|
| P0 | `recall.js:48,71,189` + `event-chain.js:44-46` | current / asOfHistory |
| P0 | `store/graph.js:51-52,73` | 同上（按 `strictAsOf` 选） |
| P1 | `inject/preference.js:40,48`、`remembered.js:19`、`session-index.js:40,66` | current |
| P1 | `pref/merge.js:116` | current（候选人仍 active/pending） |
| P2 | `consolidate/daily.js:126`、`weekly.js:72` | current |
| P2 | `handoff/brief.js:28,38` | current（摘要可宽松） |
| — | `p4.js:98-101,115-118` | asOfNeighbor（改为调用 helper，行为不变） |

---

## 7. 测试矩阵（建议，未执行）

| # | 场景 | 预设 | 期望 |
|---|---|---|---|
| C1 | active，无时间窗 | current | 在 |
| C2 | active，`valid_from`=now+1h | current | 不在 |
| C3 | active，`valid_to`=now | current | 不在（半开区间） |
| C4 | active，`valid_to`=now+1h | current | 在 |
| C5 | active，`superseded_by=9`，`valid_to`=now−1d | current | 不在（时间窗已排除，且替代） |
| C6 | active，`superseded_by=9`，`valid_to IS NULL` | current | **不在 + 记 D1** |
| C7 | `archived` / `expired` | current | 不在 |
| C8 | `pending` / `merged` | current | 不在 |
| A1 | `valid_from`=T−1d，`valid_to IS NULL`，T 时点查询 | asOfHistory | 在 |
| A2 | `valid_from`=T+1h | asOfHistory | 不在 |
| A3 | `valid_to`=T | asOfHistory | 不在 |
| A4 | **`valid_to`=T+1d 且 `superseded_by=9`** | asOfHistory | **在**（历史有效；不许按 `superseded_by` 排除） |
| A5 | `valid_to`=T−1d 且 `superseded_by=9` | asOfHistory | 不在 |
| A6 | `superseded_by=9`，`valid_to IS NULL` | asOfHistory / asOfStrict | 不在权威集，进 `uncertain('superseded-without-end')` |
| A7 | `archived`，无 `valid_to` | asOfHistory | **在**（历史有效） |
| A8 | `pending` / `merged` | asOfHistory | 不在 |
| A9 | `valid_from IS NULL`，`created_at`=T−3d | asOfHistory | 在，且标记 `validFromApproximated` |
| A10 | `valid_from IS NULL`，`created_at`=T+3d | asOfHistory | **不在**（COALESCE 后才正确；现实现靠“严格”偶然也对） |
| A11 | `valid_from`=T+1d 且 `valid_to`=T−1d | 两模式 | 不在 + 记 D5 |
| A12 | `superseded_by` 指向不存在 id | 两模式 | 视为已替代 + 记 D4 |
| N1 | P4：邻居 `valid_to`=sourceTs+1h、`superseded_by=0` | asOfNeighbor | 参与 |
| N2 | P4：邻居 `valid_to`=sourceTs−1ms | asOfNeighbor | 不参与 |
| N3 | P4：邻居 `valid_from`=sourceTs+1h | asOfNeighbor | 不参与 |
| N4 | P4：邻居 `superseded_by=9`、`valid_to IS NULL` | asOfNeighbor | 不参与（一致性守门） |
| N5 | P4：邻居 `superseded_by=9`、`valid_to`=sourceTs+1h | asOfNeighbor | 不参与（**enforce**；与 asOfHistory 的 A4 故意不同，需在文档写明） |

> N5 是本方案唯一的「故意不对称」：历史视图保留、邻居视图排除。理由：P4 目的是「当前代表是否冲突」，与「历史上是否存在过」不是一个问题。若未来需要历史回放式冲突检测，应显式使用 `asOfHistory` 而不是复用 P4。

---

## 8. 对现有数据的影响判断

| 变更 | 现网影响 | 风险 |
|---|---|---|
| current 加 `superseded_by` | **0 行变化**（211→211） | 无 |
| as-of 改状态集合（排除 pending/merged，含 archived/expired） | 现在 0 → 仍需 NULL 政策才能生效 | 低（仅 8 条 archived 会出现在历史视图） |
| as-of 用 `COALESCE(valid_from, created_at_epoch)` | 0 → 48/162/211（三个时点） | 中：会把「未知生效时间」当「创建即生效」，属**近似**，必须标注 |
| P4 改用 helper（行为不变） | 0 行变化 | 无（若 helper 的 as-of 默认改为 COALESCE，则历史回放场景会**变好**：不再把「晚于事件创建的记忆」当邻居） |
| 数据回填 `valid_from`（需负责人授权） | 225 行 | 需备份 + 可回滚；不做也能工作 |

---

## 9. 结论：两个明确回答

**Q1：R5 是否应该通过 current/as-of 双谓词解决？**
**是，但必须是「时间维度（current/asOf）× 替代维度（enforce/ignore/guard）」的 2×2 参数化**，而不是两个写死的字符串，也不是把 P4 的 `superseded_by` 复制到所有查询。
依据：§4.3 的 T1/T2 反例、§5.3 的 status 语义、§6.3 的调用点差异。
**判定：PASS（方案成立）**。

**Q2：P4 是否应该暂缓合入？**
**不建议暂缓。** P4 的谓词在语义上属于 `asOfNeighbor`（as-of 时间窗 + 替代守门），是自洽且保守的；它修复的是已发生的误判（#8），不修复则会持续产生假冲突。R5 是口径收敛问题，不会让 P4 的结果变错。
**合入前阻塞条件（3 项，缺一不可）**：
1. 在 HANDOFF 明确记录「仓库当前存在 A/B/C/D 四种有效性判定，R5 未收敛」，不得把 P4 合入写成「有效性口径已统一」。
2. 合入同时给出 helper 提案编号（本报告 §6），并承诺 P4 是 helper 的第一个调用点；若无法同批落地，P4 保持现状但**禁止再复制第三份谓词**。
3. 补 §7 的 N1–N4 边界测试（N5 的故意不对称需在测试注释中写明理由）。
**判定：PASS（可合入，附条件）**。

**Q3（附加，必须让 GPT 知道）：as-of 能力当前是空功能。**
`dy_memory_asof` 在生产恒返回 0 条确定结果 + 全部进 `uncertain`。这比 R5 优先级更高（P1），且**不需要写生产数据**即可用 `COALESCE` 方案修复。
**判定：FAIL（功能缺陷）**。

---

## 10. 边界与证据

- 全程**只读**：未修改源码、测试、配置、数据库；未合并 P4、未部署、未启动 staging、未重启。
- 未修改 `HANDOFF.md` / `REPORT.md` / `PROJECT.md`；仅更新本会话报告。
- 未处理 Persona / EI / Autonomy / Android。
- 生产数据仅通过 `/tmp/memaudit/prod-copy2`（`mode=ro`，SHA-256 `f8201f8e…`）查询，不输出正文。
- 本报告的 P4 PASS 仍限于**隔离设备测试**，**不等于生产 PASS**，也不等于 DSH 正式复验。

### 证据索引

| 内容 | 命令 | 退出码 |
|---|---|---|
| HEAD / blobs | `git ls-remote`、`git rev-parse <ref>:<path>` | 0 |
| 谓词使用点 | `grep -rn "valid_to\|valid_from\|superseded_by" lib/` | 0 |
| 行号复核 | `sed -n '<n>p' <file>`（16 处） | 0 |
| current 视图差异 | sqlite3（副本）CUR_OLD/CUR_NEW | 0（211/211，∅） |
| as-of 差异 | sqlite3（副本）三时点 strict vs COALESCE | 0（0/0/0 → 48/162/211） |
| 不一致分类 | sqlite3（副本）D1–D7 计数 | 0（仅 D3=2、D6=8、D7=225） |
