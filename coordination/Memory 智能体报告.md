# MEMORY-REPORT-0008 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：`MEM-P4-TEMPORAL-VERIFY-01`（v1）→ `MEM-VALIDITY-R5-01`（v2）→ `MEM-VALIDITY-IMPL-01`（v3）→ `MEM-VALIDITY-INTEGRATION-01`（v4）→ `MEM-VALIDITY-INTEGRATION-REVIEW-FIX-01`（v5）→ `MEM-VALIDITY-GPT-FIX-VERIFY-01`（v6）→ `MEM-VALIDITY-GRAPH-STRICT-LANE-VERIFY-02`（v7）→ `MEM-VALIDITY-BATCH-A-VERIFY-01`（v8，本轮）
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 13:3x (Asia/Shanghai) · v8

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001 | 10:15 | P4 时间有效性隔离验收（1635ccb）：PASS |
| MEMORY-REPORT-0002 | 10:5x | R5 双模式语义审查 |
| MEMORY-REPORT-0003 | 11:1x | 统一谓词 helper + P4 接入（4af81a2）：279/279 |
| MEMORY-REPORT-0004 | 11:5x | recall / graph / event-chain 接入（38844d1）：292/292 |
| MEMORY-REPORT-0005 | 12:2x | FTS 状态域 + uncertain 时间边界（4b4f927）：297/297 |
| MEMORY-REPORT-0006 | 12:5x | 复核 `697de1e`+`b4606e1`：PARTIAL |
| MEMORY-REPORT-0007 | 13:0x | 复核 strict graph lane（c437c46）：PASS，298/298 |
| MEMORY-REPORT-0008 | 13:3x | **Batch A（preference + remembered）验证：PASS**，298/298，两组负向对照按预期失败 |

---

## 0. 结论：**PASS**

| 验证项 | 判定 | 关键证据 |
|---|---|---|
| 基线 HEAD 与四提交 | **PASS** | HEAD `5797324`；`c437c46 → 9546471 → 0edc81a → 4bd4644 → 5797324` |
| 四文件 blob 与任务预期一致 | **PASS** | 与任务书给定的 4 个 SHA 完全相同 |
| preference 接入语义（A.1–A.10） | **PASS** | 单一 `validity` 实例、参数顺序、owner/kind/meta/预算/排序全保持 |
| remembered 接入语义（B.1–B.10） | **PASS** | 新增可注入 `now`、默认不变、参数顺序正确、跳过原因不变 |
| 定向测试 | **PASS** | 2/2、exit 0 |
| 回归测试 | **PASS** | 16/16、exit 0 |
| 全量 `npm test` | **PASS** | **298/298、0 fail、0 skip、exit 0** |
| 负向对照 ×2 | **PASS** | 两组均按预期失败，恢复后全绿 |
| 生产 / 部署 / 合并 | **未触碰** | 见 §10 |

---

## 1. 基线与提交（已核对）

| 项 | 值 |
|---|---|
| 仓库 / 分支 | `ba-song/dsh-memory-core` / `feat/memory-validity-unified` |
| 上一基线 | `c437c460d8378cbf6493a5e4e12d673c4334d50f` |
| **验证 HEAD** | **`5797324175f345ff82337f409d8406e5256ddfc3`**（与任务一致，分支未前进） |
| 提交 1 | `9546471391117c40668049f32bf8800d4aae8b90`（preference 接入，parent `c437c46`） |
| 提交 2 | `0edc81ae0c375305ca885ac7027d2ae6c407788f`（remembered 接入，parent `9546471`） |
| 提交 3 | `4bd4644653ffa80dd136c192c9335213352ff81b`（preference 测试，parent `0edc81a`） |
| 提交 4 | `5797324175f345ff82337f409d8406e5256ddfc3`（remembered 测试，parent `4bd4644`） |
| diff（c437c46→5797324） | 4 文件 +36/−19；无其他文件 |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/batchA`（detached @ 5797324）；`node_modules` 复用既有目录，未安装/升级 |
| 仓库 AGENTS.md | `git ls-tree -r` 确认**仓库树内无 AGENTS.md**；已遵循项目 AGENTS.md（工作区版）与本会话目录规则 |
| 协调文档 | 已重读最新 `HANDOFF.md`（blob `bee03e17…`，含 §56/§57）与 `REPORT.md`（blob `fc4d01dd…`）；本轮未修改 |

## 2. 四个文件实际 blob（与任务预期一致）

| 文件 | 实际 blob | 任务预期 |
|---|---|---|
| `lib/inject/preference.js` | `d28bacc5a0c1477a751dada0040243581213b4e5` | 一致 |
| `lib/inject/remembered.js` | `4d3a5f2af4e61531581ed01fe778dffdd567f14e` | 一致 |
| `tests/preference-inject.test.mjs` | `08f170ce8ddf7cb4907ebec77c38fc18666454c6` | 一致 |
| `tests/remembered.test.mjs` | `3bf6dbf49cf6062e9e39e41810bd629219ac8f35` | 一致 |

`lib/store/validity.js` blob `00c4d948ccb2973d48d95aebb07d230c8f44854c` —— **与 v7 相同，helper 未被改动**（符合"不改 validity helper"边界）。

---

## 3. 代码语义核对

### 3.1 preference（A.1–A.10）

| 检查项 | 结论 | 证据 |
|---|---|---|
| A.1 使用 `validitySql({preset:'current', at:Number(now)})` | PASS | `lib/inject/preference.js` 新增 `const validity = validitySql(...)`，位于 `try` 块内 |
| A.2 两路查询共享同一 SQL 与时点 | PASS | 同一个 `validity` 对象被 recentRows/stableRows 复用；探针捕获 2 条查询，均含同一片段 |
| A.3 参数顺序：先有效性、再 scope | PASS | SQL 文本 `${validity.sql}` 在 `${w.sql}` 之前；绑定 `...validity.params, ...w.params`；探针显示 2 个占位符且 validity 片段在前 |
| A.4 仅 owner scope | PASS | `if (scope?.level !== 'owner') return ''`（未改）；外部 scope 测试仍返回 `''` |
| A.5 kind / scope_type / scope 隔离不变 | PASS | `kind='preference' AND scope_type='owner' AND ${w.sql}` 保持；contact 私有记录仍不注入 |
| A.6 meta persist / long_term 筛选不变 | PASS | `if (!meta || meta.persist !== true \|\| meta.persistence !== 'long_term') continue`（未改） |
| A.7 排序/去重/门槛/条数/预算不变 | PASS | `ORDER BY` 两路原样；`rowsById` 合并去重、`PREFERENCE_MAX_ITEMS=3`、`PREFERENCE_BUDGET=180`、`fit()` 未改；`tests/preference-round3` 通过 |
| A.8 future / 过期 / superseded 不进入 | PASS | 定向测试断言 `!block.includes('未来才生效')`、`'已过期'`、`'已被替代'`；负向对照证明旧过滤会泄漏 |
| A.9 损坏 meta 安全跳过 | PASS | `json_valid(meta)` 仍在 SQL；探针：插入 `meta='{bad json'` 后 block 正常返回且不含该行 |
| A.10 `now` 默认值与调用兼容 | PASS | 默认 `now = Date.now()` 未改；`lib/index.js:1239` 显式传 `now: Date.now()` 行为不变 |

### 3.2 remembered（B.1–B.10）

| 检查项 | 结论 | 证据 |
|---|---|---|
| B.1 使用同一 `current` helper | PASS | `const validity = validitySql({ preset:'current', at:Number(now) })` |
| B.2 `now` 可由调用方注入 | PASS | 签名新增 `now = Date.now()`；测试注入固定 `now` |
| B.3 默认行为不变 | PASS | 默认值即 `Date.now()`；`lib/inject/stable.js:218` 不传 `now`，行为不变 |
| B.4 参数顺序：先有效性、再 scope | PASS | SQL `${validity.sql} AND ${w.sql}`；绑定 `...validity.params, ...w.params`；探针（external scope，3 个 scope 参数）显示共 5 个占位符且 validity 在前 |
| B.5 kind 白名单 / scope / 排序 / LIMIT 80 不变 | PASS | `kind IN ('preference','relation','skill')`、`ORDER BY pinned DESC, importance DESC, COALESCE(...) DESC`、`LIMIT 80` 均未改 |
| B.6 preference 跳过原因不变 | PASS | `skipped.push({ reason: 'preference-managed-separately' })` 未改；测试断言仍成立 |
| B.7 fact 不进入 | PASS | kind 白名单未含 fact；测试 `!block.includes('[fact]')` |
| B.8 stableText 去重/连接词/字符/预算不变 | PASS | `overlaps`、`truncated-connector`、`MAX_ITEMS=8`、`MAX_ITEM_CHARS=50`、400 字预算均未改；`tests/remembered` 覆盖 |
| B.9 future / superseded 不进入 | PASS | 测试断言 + 负向对照证明旧过滤会泄漏 |
| B.10 DB 异常返回空结构 | PASS | `catch { return { block:'', count:0, skipped:[] } }`；探针在已关闭 DB 上调用返回该结构 |

### 3.3 重点风险（C）

| 风险 | 结论 |
|---|---|
| 占位符与参数顺序 | 两文件均为「先 validity(2 参) 再 scope」，探针实证 |
| `scopeWhere` 参数拼接 | external scope 3 参场景查询返回正确记录，参数未错位 |
| 两路 preference 是否共享同一 `now` | 同一 `validity` 对象，共享 |
| remembered 新参数是否改变旧调用方 | 默认 `Date.now()`，`stable.js` 不传参行为不变 |
| 空结果 / scope 不匹配 / 异常时返回结构 | 与旧版一致（`''`、`{block,count,skipped}`） |
| 是否有其他文件被意外修改 | `git diff --name-only c437c46 5797324` 仅 4 个预期文件 |

---

## 4. 定向测试（真实输出）

```
node --test tests/preference-inject.test.mjs tests/remembered.test.mjs
tests 2 / pass 2 / fail 0 / skipped 0
EXIT=0
```

## 5. 回归测试

```
node --test tests/preference-lifecycle.test.mjs tests/preference-merge.test.mjs \
             tests/session-index.test.mjs tests/validity-integration.test.mjs
tests 16 / pass 16 / fail 0 / skipped 0
EXIT=0
```

## 6. 全量测试

```
npm test
tests 298 / pass 298 / fail 0 / skipped 0
EXIT=0
```
（控制组恢复后再次运行仍为 298/298/0/0、exit 0。）

## 7. 工作区

```
git rev-parse HEAD   → 5797324175f345ff82337f409d8406e5256ddfc3
git status --short   → ?? node_modules        （仅符号链接）
git diff --check     → 无输出                 EXIT=0
git diff --stat      → 空（工作树与 HEAD 一致）
```

---

## 8. 两项负向对照（scratch 修改，逐字节恢复）

### 对照 1：preference 恢复旧过滤（`status='active'` + `valid_to`）

- 改动：两路查询的 `${validity.sql}` → `status='active' ... AND (valid_to IS NULL OR valid_to>?)`，绑定改回 `...w.params, Number(now)`。
- 结果：**定向测试失败**（exit 1）。失败位置在 `block.includes('长期记录 A'/'长期记录 B')`（line 27/28 —— 两次运行因 `created_at_epoch` 毫秒并列、排序不同而在 27 与 28 间摆动；这是**被破坏代码下的不稳定**，恢复后稳定通过）。
- 直接泄漏证据（独立探针，旧过滤下）：

```json
{"block":"【长期偏好】\n- 未来才生效的记录\n- 已被替代的记录\n- 正常长期记录\n【长期偏好结束】",
 "leaksFuture":true,"leaksSuperseded":true}
```

- 恢复：`diff -q` 与备份一致；定向测试 **2/2 PASS**。

### 对照 2：remembered 恢复旧过滤

- 改动：`${validity.sql}` → `status='active' ... AND (valid_to IS NULL OR valid_to>?)`，绑定改回 `...w.params, Number(now)`。
- 结果：**定向测试失败**（exit 1），断言为 `future valid_from 不得进入当前注入`（`tests/remembered.test.mjs:34`）。
- 直接泄漏证据（独立探针）：

```json
{"block":"【记得的事】\n- [relation] 正常关系记录\n- [relation] 未来才生效的事\n- [relation] 已经被替代的事\n【记得的事结束】",
 "leaksFuture":true,"leaksSuperseded":true}
```

- 恢复：`diff -q` 一致；定向测试 **2/2 PASS**。

> 两组均按预期失败；未删除断言、未跳过测试、未放宽预期。

---

## 9. 兼容性检查结论（逐项）

- **scope**：preference 仅 owner（`level !== 'owner'` 直接返回空）；remembered 的 contact/group/owner 隔离沿用 `scopeWhere`，external 用例返回正确记录。
- **kind**：preference 固定 `kind='preference'`；remembered 白名单 `preference/relation/skill`，fact 不进入。
- **meta persist**：`persist === true && persistence === 'long_term'` 判定位置与逻辑未变；损坏 meta 走 `json_valid` + JS 跳过。
- **排序**：两路 preference 的 `ORDER BY` 一字未改；remembered 的 `pinned/importance/last_access` 排序未改。
- **预算**：`PREFERENCE_BUDGET=180`、`MAX_ITEMS=3`、remembered 400 字 / 8 条 / 50 字截断全部未改。
- **跳过原因**：`preference-managed-separately`、`truncated-connector`、`dup-stable` 均保留，测试断言通过。

## 10. 新问题 / 阻塞

**无阻塞。** 记录一项非阻塞行为差异（P3）：

- 当调用方显式传入非法 `now`（如 `0`/`null`）时，`validitySql` 抛 `E_BAD_TIMESTAMP`，被两个函数的 `try/catch` 吞掉，分别返回 `''` / 空结构；旧实现会按 `valid_to > 0` 返回部分结果。
  - 现有调用方 `lib/index.js:1239` 传 `Date.now()`、`stable.js:218` 不传（默认 `Date.now()`），**生产路径不受影响**。
  - 建议：如需防御性兼容，可在入口做 `Number.isFinite` 回退（本轮未改，避免越界）。

其他残留（与 v7 相同、不在本轮范围）：preference-merge / session-index / handoff brief / daily / weekly 仍未接入；生产 as-of **NOT RUN**。

## 11. 边界声明

- 未写入、删除、回填、迁移生产 DB；本轮未打开生产库（全部 `/tmp` 临时库）。
- 未修改生产插件目录、`profile`/`config`；未部署、未重启、未启动 staging；未合并 `feat/m1-preference-memory` 或 `main`。
- 未修改 `session-index`、`handoff brief`、`preference merge`、`daily`、`weekly` 等其他调用点；未修改 `validity.js`。
- 未修改 Persona/EI/Autonomy/Android；未修改共享 `HANDOFF.md` / `REPORT.md`（blob `bee03e17…` / `fc4d01dd…` 未变）。
- 负向对照全部在 worktree 内临时修改并逐字节恢复；未 force push、未覆盖他人提交。
- **隔离开发验证 PASS ≠ 生产验证通过 ≠ 获准合并或部署。**

## 12. 证据索引

| 内容 | 命令 / 路径 | 退出码 |
|---|---|---|
| HEAD / 提交链 | `git ls-remote`；`git log -1 --format='%H parent=%P'` ×4 | 0 |
| blob ×4 | `git rev-parse 5797324:<path>` | 0 |
| 定向 | `node --test tests/preference-inject.test.mjs tests/remembered.test.mjs` | 0（2/2） |
| 回归 | 4 个文件合并运行 | 0（16/16） |
| 全量 | `npm test` ×2（对照前/恢复后） | 0（298/298/0/0） |
| 对照 1 | preference 旧过滤 → 定向失败 + 探针 leaksFuture/leaksSuperseded | 1（预期） |
| 对照 2 | remembered 旧过滤 → 定向失败（line 34）+ 探针泄漏 | 1（预期） |
| 恢复校验 | `diff -q` 两次均一致；定向复跑 2/2 | 0 |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |
