# MEMORY-REPORT-0012 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：v1 P4 → v2 R5 → v3 helper+P4 → v4 recall/graph/event-chain → v5 FTS/uncertain → v6/v7 复核 → v8 Batch A → v9/v10/v11 Batch B → **v12 Batch C（preference merge）**
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 14:4x (Asia/Shanghai) · v12

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001~0007 | 10:15–13:0x | P4 / R5 / helper / 三调用点 / FTS+uncertain / 两次复核 / strict lane |
| MEMORY-REPORT-0008 | 13:3x | Batch A（preference + remembered）：PASS，298/298 |
| MEMORY-REPORT-0009 | 13:5x | Batch B 首验：BLOCKED（NULL fixture 冲突） |
| MEMORY-REPORT-0010 | 14:0x | Batch B 二验：BLOCKED（共享 DB 污染） |
| MEMORY-REPORT-0011 | 14:1x | Batch B 三验：PASS（300/300） |
| MEMORY-REPORT-0012 | 14:4x | **Batch C（preference merge）：BLOCKED（1 个确定性失败：新用例主题与既有 fixture 冲突）** |

---

## 1. 结论：**BLOCKED**

| 项 | 判定 | 证据 |
|---|---|---|
| HEAD / tree / compare | **PASS** | `906fca93…`、tree `3da58899…`、相对 `2a93031` ahead **6** / behind **0** |
| 四个文件 blob | **PASS** | 与任务书给定 4 个 SHA 完全一致 |
| 业务语义（候选/旧偏好/事务） | **PASS（代码层 + 独立探针）** | 见 §4、§7 |
| validity 定向 | **PASS** | 24/24，exit 0 |
| preference-merge 定向 | **FAIL（确定性）** | `tests/preference-merge.test.mjs:47`：`actual 'merged'`、`expected 'unchanged'`；连跑 3 次全一致 |
| 相关回归（8 文件） | **FAIL** | 42 tests / 41 pass / **1 fail** |
| 全量 `npm test` | **FAIL** | **301 tests / 300 pass / 1 fail / 0 skip / exit 1**（两次一致） |
| 负向对照 ×8 | **PASS** | 全部按预期失败；恢复后逐字节一致 |
| 事务/冲突/CAS/回滚 | **PASS** | 见 §7（P1–P5） |
| 生产 / 部署 / 合并 | **未触碰** | 见 §10 |

**唯一确定性失败**：新用例 `['expired valid_to', '咖啡', …]` 的主题 `咖啡` 与**测试文件前半段既有 fixture**（`priorId='不喜欢咖啡'` → `nextId='喜欢咖啡'` 且 supersede 后 `nextId` 保持 active）碰撞。`now=5000` 时该既有 `nextId` 仍在 `current` 比较集合中，因此候选**正确地**合并进它，而不是返回 `unchanged`。
**代码行为正确**：独立探针证明被过期的旧行确实被排除（`expiredOld excluded: true`），合并目标是另一条当前有效同主题行（`targetId=2`），过期行 `revision` 保持 1；把碰撞行移出当前视图后，同一场景返回 `unchanged`。
**因此这是测试 fixture 隔离缺陷，不是业务缺陷**；但按验收标准（0 fail）本轮不能标 PASS。

---

## 2. 基线核验

| 项 | 值 |
|---|---|
| 仓库 / 分支 | `ba-song/dsh-memory-core` / `feat/memory-validity-batch-c` |
| HEAD（实测） | **`906fca93ad92a19dcfe871caf3583596fb72fe2b`**（与指定一致） |
| 树 SHA | **`3da58899395587f8a37f999a63d4f5945412bdc9`** |
| 相对 Batch B | `2a93031…` → ahead **6** / behind **0**；仅 4 个文件变更 |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/batchC`（detached @ 906fca93）；未安装/升级依赖 |
| 仓库 AGENTS.md | `git ls-tree -r` 确认**仓库树内无 AGENTS.md**；已遵循工作区 AGENTS.md 与会话目录规则 |
| 协调文档 | 已重读最新 `HANDOFF.md`（blob `2923ba9b…`，§59 = Batch B PASS、§60 = Batch C 验证中）与 `REPORT.md`（blob `9a9c0bdb…`）；本批边界与任务书一致 |

| 文件 | 实际 blob |
|---|---|
| `lib/pref/merge.js` | `d6d36773a44314030aa8bc65336768c6063e8f6e` |
| `lib/store/validity.js` | `7aabea0efff2b9d5fe40acea19fcc4609f5e87e6` |
| `tests/preference-merge.test.mjs` | `54fc93520937d86c3cfa8d865edc8e0a8923d333` |
| `tests/validity.test.mjs` | `fd00ecff76614f17544e5ac2e244692be38c6089` |

## 3. 业务语义审查（逐条）

### 3.1 候选（`currentPreferenceCandidate`）

| 要求 | 实现 | 判定 |
|---|---|---|
| 保留 `kind='preference' AND status IN ('active','pending')` 取行 | 原查询未改（`merge.js:98`） | PASS |
| 预设状态域 active/pending | `statusDomain:'active-pending'` → `(status='active' OR status='pending')` | PASS |
| 时间窗 `valid_from IS NULL OR <=now`、`valid_to IS NULL OR >now` | 预设 same as current | PASS |
| `superseded_by` 为空 | 预设 `superseded:'enforce'` | PASS |
| **原有更严格规则**：`valid_to != null` 即拒绝（含未来） | `if (!candidateIsCurrent \|\| current.valid_to != null) return candidate-invalidated` | PASS |
| future valid_from 候选 | 探针/测试：`candidate-invalidated`，不写 revision、不激活 | PASS |
| superseded 候选 | 同上 | PASS |
| 过期 `valid_to` 候选 | 同上 | PASS |
| 未来 `valid_to` 候选 | 仍拒绝（严格规则保留） | PASS |
| pending 且当前有效 | 走原激活路径，`status → active` | PASS |
| active 且当前有效 | 走原合并/保持路径 | PASS |

### 3.2 旧偏好比较集合（`current`）

| 要求 | 实现/证据 | 判定 |
|---|---|---|
| 使用 `validitySql({preset:'current', at:Number(now)})` | `merge.js` 新增 `oldValidity` | PASS |
| future valid_from 旧偏好不参与 | 对照 1 恢复旧过滤即触发该断言失败 | PASS |
| `valid_to <= now` 不参与 | 探针：`expiredOld excluded: true` | PASS |
| superseded 不参与 | 对照 2 触发对应断言失败 | PASS |
| `valid_to` 在未来仍参与 | 半开区间 `valid_to > now`，与原规则一致 | PASS |
| 非 active 不参与 | `current` 状态域 `status='active'` | PASS |
| scope_type/scope_id 精确隔离 | WHERE 条件未改，参数顺序 `id, scope_type, scope_id, ...validity.params` | PASS |

### 3.3 事务与冲突语义

`writeTx`、`reviseInTransaction`、`hasOpenConflict`、同极性合并、反极性 supersede、pending 激活、新主题/polarity 不确定分支**均未被改动**（diff 仅两处查询 + 一个 import）。运行期验证见 §7。

## 4. 定向 / 回归 / 重复 / 全量（真实输出）

### 4.1 定向（连跑 3 次，结果一致）

```
node --test tests/preference-merge.test.mjs tests/validity.test.mjs
tests 25 / pass 24 / fail 1 / skipped 0   EXIT=1   （×3 次均相同）
```
拆开：`validity.test.mjs` **24/24 PASS**；`preference-merge.test.mjs` **FAIL**（见 §1/§5）。

### 4.2 相关回归（8 文件）

```
node --test preference-merge preference-lifecycle preference-evolution \
             preference-classify preference-second-round preference-round3 \
             validity-integration validity-review-fix
tests 42 / pass 41 / fail 1 / skipped 0   EXIT=1
```
唯一失败仍是 preference-merge。

### 4.3 全量

```
npm test → tests 301 / pass 300 / fail 1 / skipped 0 / EXIT=1   （两次一致）
```

### 4.4 失败定位与复现

```
✖ tests/preference-merge.test.mjs
  AssertionError [ERR_ASSERTION]: expired valid_to old preference must not be merged
  actual: 'merged'   expected: 'unchanged'      (line 47)
```

**根因证据（独立探针，临时库）**：
```
pre-block: {"changed":"superseded","nextStatus":"active","nextRevision":1}
current comparison set ids: [2]  expiredOld excluded: true  next included: true
merge result: {"action":"merged","targetId":2,"candidateStatus":"merged",
               "expiredOldRevision":1,"nextRevision":2,"nextEvidence":2}
without collision: {"action":"unchanged","expiredOld2Revision":1,"candidate2Status":"active"}
```
→ 被过期的旧行**没有**被合并（revision 仍 1）；合并发生在另一条当前有效的同主题偏好。断言把「过期行未被合并」与「没有任何合并」混为一谈。

**最小修复建议（未实施，待 GPT 决定）**：把该用例主题改成未使用的唯一值（如 `'椰子'`），或让 Batch C 段落使用独立临时 DB。仅改测试 fixture，不动业务代码。

## 5. 八组负向对照（scratch，恢复后逐字节一致）

为避免既有 fixture 碰撞干扰，对照组在**修正后的 scratch 副本**上执行（把过期用例主题换成 `'椰子'`；该副本单独运行 **PASS**，证明其余断言全部有效）。

| # | 变异 | 结果 |
|---|---|---|
| 1 | 旧偏好查询恢复旧过滤 | 失败于 `future valid_from old preference must not be merged` |
| 2 | 同上 + 仅保留 superseded 案例 | 失败于 `superseded old preference must not be merged` |
| 3 | 移除候选有效性检查（只留 `valid_to != null`） | 失败：future 候选 `ok` 期望 false 实得 true（line 58） |
| 4 | 候选预设改为严格 `current`（active-only） | 失败：pending 候选期望 `ok:true` 实得 false（line 84） |
| 5 | 移除 `current.valid_to != null` 严格检查 | 失败：未来 `valid_to` 候选期望 `ok:false` 实得 true（line 73） |
| 6 | helper 去掉 `valid_from` | `preference merge candidate preset…` FAIL |
| 7 | helper 去掉 `superseded` | 同上 FAIL |
| 8 | 候选查询参数顺序破坏（`...(params), id`） | FAIL（首个合并断言 `same.action` 变 undefined） |

恢复校验：`lib/pref/merge.js`、`lib/store/validity.js` 与备份 `diff -q` 一致；scratch 副本已删除；`git status` 仅 `?? node_modules`。

## 6. SQL / JS 状态域

```
currentPreferenceCandidate = (status='active' OR status='pending')
  AND (valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>?)
  AND (superseded_by IS NULL OR superseded_by=0 OR superseded_by='')      params=[at,at]
current（旧偏好集合）      = status='active' + 同一时间窗 + superseded 为空   params=[at,at]
```
JS 镜像（`isValidAt`）新增分支：`active`/`pending` 通过状态域；future `valid_from`、`valid_to<=at`、superseded 均 false；`archived` false。`tests/validity.test.mjs` 已覆盖上述断言（24/24 PASS）。

参数顺序：
- 候选查询：`WHERE id=? AND ${candidateValidity.sql}` → 绑定 `(id, at, at)` ✅
- 旧偏好查询：`WHERE kind='preference' AND id<>? AND scope_type=? AND scope_id=? AND ${oldValidity.sql}` → 绑定 `(id, scope_type, scope_id, at, at)` ✅

## 7. 事务 / 冲突 / revision / CAS / 回滚核验（临时库探针）

| 探针 | 结果 |
|---|---|
| **P2 正常合并** | `action=merged`；旧行 revision **2**；候选 `status=merged`；`memory_revisions` 两条快照（各 revision 1） |
| **P1 中途失败回滚**（`memory_revisions` 重命名） | 抛 `no such table: memory_revisions`；旧行 revision **1**、importance 0.6、evidenceCount 1 全部未变；候选仍 `active` → **整体回滚** ✅ |
| **P3 未解决冲突保护** | pending 候选 + `conflict_queue.status='pending'` → `{ok:true, action:'pending', reason:'open-conflict'}`，状态仍 `pending` ✅ |
| **P4 BUSY 重试** | 外部连接持 `BEGIN IMMEDIATE` → 约 20.9s（3× busy_timeout + backoff）后抛 `database is locked`；无 revision、候选仍 active → fail-closed ✅ |
| **P5 CAS 冲突** | 注入 `UPDATE ... changes=0` → 抛 `E_REVISION_CONFLICT`；revision 行数为 0、旧行 revision 1、候选 active → 回滚 ✅ |

结论：`writeTx` 的 `BEGIN IMMEDIATE / COMMIT / ROLLBACK / BUSY 重试`、`reviseInTransaction` 的快照 + revision+1 + CAS、`hasOpenConflict` 保护均**未被本批改动破坏**。

## 8. 工作区与静态检查

```
git status --short → ?? node_modules（仅符号链接）
git diff --check   → 无输出 EXIT=0
git diff --stat    → 空
HEAD=906fca93ad92a19dcfe871caf3583596fb72fe2b
tree=3da58899395587f8a37f999a63d4f5945412bdc9
```

## 9. 风险与未执行事项

| 项 | 状态 |
|---|---|
| **测试 fixture 主题碰撞（P0，本轮唯一确定性失败）** | 未修（无授权）。建议：唯一主题（如 `'椰子'`）或独立 DB；预计修完全量 → 301/301 |
| 该失败导致后续 4 组断言（候选侧/pending）未在原文件中执行 | 已用修正副本验证全部通过（1/1），覆盖有效 |
| preference merge 之外的其他调用点 | 未接入（daily/weekly 属 Batch D/E，需另授权） |
| 生产 DB / 插件 / profile / config | **未触碰**（本轮未打开生产库） |
| 部署 / 重启 / staging / 主线合并 | **NOT RUN** |

## 10. 边界声明

- 未修改代码或测试（负向对照均在 worktree 内临时修改并逐字节恢复；scratch 副本已删除）。
- 未写生产 DB、生产只读副本；未改生产插件目录、`profile`/`config`；未部署、未重启、未启动 staging。
- 未合并 `feat/m1-preference-memory` 或 `main`；未修改其他 Memory 调用点。
- 未修改 Persona/EI/Autonomy/Android；未修改共享 `HANDOFF.md` / `REPORT.md`。
- 未 force push、未覆盖他人提交。
- **本轮若修复后通过，最多只能标记「Batch C：隔离代码验证 PASS」，不等于生产验证、集成、主线合并或部署。**

## 11. 证据索引

| 内容 | 命令 / 路径 | 退出码 |
|---|---|---|
| HEAD/tree/compare/blob | `git ls-remote`、`git rev-parse`、`git rev-list --left-right --count` | 0 |
| 定向 ×3 | `node --test tests/preference-merge.test.mjs tests/validity.test.mjs` | **1**（25/24/1） |
| 回归 8 文件 | 见 §4.2 | **1**（42/41/1） |
| 全量 ×2 | `npm test` | **1**（301/300/1） |
| 失败复现/根因 | `/tmp/probe-batchC-collision.mjs` | 0 |
| 事务探针 P1/P2/P3/P5 | `/tmp/probe-batchC-tx.mjs` | 0 |
| BUSY 探针 P4 | `/tmp/probe-batchC-tx2.mjs` | 0 |
| 负向对照 1–8 | scratch 副本 + 变异 | 1（预期）；恢复后 0 |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |
