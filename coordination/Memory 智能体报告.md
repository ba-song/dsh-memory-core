# MEMORY-REPORT-0010 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：v1 P4 → v2 R5 → v3 helper+P4 → v4 recall/graph/event-chain → v5 FTS/uncertain → v6 复核 `697de1e`+`b4606e1` → v7 strict graph lane → v8 Batch A → v9 Batch B（BLOCKED）→ **v10 Batch B 修复后复验（本轮）**
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 14:0x (Asia/Shanghai) · v10

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001~0007 | 10:15–13:0x | P4 / R5 / helper / 三调用点 / FTS+uncertain / 两次复核 / strict lane（均 PASS 或已记录） |
| MEMORY-REPORT-0008 | 13:3x | Batch A（preference + remembered）：PASS，298/298 |
| MEMORY-REPORT-0009 | 13:5x | Batch B 首验：BLOCKED（`status=NULL` 与 NOT NULL 冲突，4 fail） |
| MEMORY-REPORT-0010 | 14:0x | **Batch B 修复后复验：BLOCKED（剩 1 个确定性失败：共享 DB 污染）** |

---

## 1. 结论：**BLOCKED**（仅剩 1 个确定性失败）

| 项 | 判定 | 证据 |
|---|---|---|
| HEAD / tree / compare | **PASS** | `e1db9795…`、tree `a7f69948…`、相对 `5797324` ahead **9** / behind **0** |
| 三测试 blob / 三业务 blob | **PASS** | 6 个 blob 全部与任务书一致；业务文件与 Batch B 首验时**逐字节相同** |
| 三个 fixture 已无 `status=NULL` | **PASS** | `grep -c` 均为 0；只保留 `isValidAt({status:null})` 纯 JS 镜像断言 |
| session-index 定向 | **PASS** | 1/1，exit 0 |
| handoff brief 定向 | **PASS** | 1/1，exit 0 |
| validity 定向 | **FAIL（1 项）** | 22/23，`db: current 视图` 失败 |
| 回归集合（7 文件） | **PASS** | 19/19，exit 0 |
| 全量 `npm test` | **FAIL** | **299/300、1 fail、0 skip、exit 1**（连跑两次一致） |
| 负向对照 ×6 | **5 组符合预期，1 组暴露测试覆盖缺口** | 见 §8 |
| 兼容性（SQL/JS/隔离/预算/只读） | **PASS** | 见 §9/§10 |

**唯一确定性失败**：`tests/validity.test.mjs:196` `db: current 视图`（`actual [1,4,11,12,13,16]` vs `expected [1,4,11,12,13]`）。
**根因**：同一文件新增的 `legacy todo JS mirror…` 用例（`:178`）在**共享 DB** 中插入 2 条 todo（`active`、`''`），没有清理；其中 active 那条第 `current` 视图测试的精确集合断言，多出 id 16。
**证据**：`--test-name-pattern="db: current 视图"` 单跑 **PASS**；与 `legacy todo JS mirror` 一起跑 **FAIL**。
**结论**：fixture 修复方向正确且大部分生效，但引入了**测试隔离缺陷**，尚不满足 0 fail 验收。

---

## 2. 基线核验

| 项 | 值 |
|---|---|
| 仓库 / 分支 | `ba-song/dsh-memory-core` / `feat/memory-validity-batch-b` |
| HEAD（实测） | **`e1db97952f3b8ed1266f8ce7a025fed381143281`**（与指定一致） |
| 树 SHA | `a7f69948543ecbc36d16d9541ddac78c68b5c07c` |
| 相对 Batch A | `5797324…` → ahead **9** / behind **0** |
| 本轮三提交 | `049add3`（session-index 测试）、`cb81f33`（handoff 测试）、`e1db979`（validity 测试） |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/batchB2`（detached @ e1db979）；未安装/升级依赖 |
| 文档 | 已重读最新 `HANDOFF.md`（blob `250f911c…`，最新章 §58 = HANDOFF-0061 Batch A）与 `REPORT.md`（blob `c98f6d54…`）；**Batch B 尚未写入交接文档**（预期，待 GPT 整合）；仓库树内无 AGENTS.md |
| 工作区 | `git status --short` → `?? node_modules`（既有符号链接）；`git diff --check` → exit 0；`git diff --stat` → 空 |

### 六个文件 blob（全部与任务一致）

| 文件 | 实际 blob |
|---|---|
| `lib/store/validity.js` | `e2be1294e52e33724e1cd8c815dd418b8a883f2b`（未变） |
| `lib/inject/session-index.js` | `e155f1ce1ab147828c381d05532323e2cce0cebc`（未变） |
| `lib/handoff/brief.js` | `e8938ffc924f374d553017263d506472a5cacca0`（未变） |
| `tests/session-index.test.mjs` | `f7328ed7be54b4cafef901e87c101a85d334bcc3` |
| `tests/handoff-brief.test.mjs` | `98b6891a9d5cb8a2c7028e4f7c812598b0dfd452` |
| `tests/validity.test.mjs` | `39fcb39241dbe502d34dc35e27faeec253805966` |

## 3. 三个 fixture 修复内容核对

- `tests/session-index.test.mjs`：删除「legacy NULL 状态待办」行与其断言；保留「legacy 空状态待办应保留」；episode 的 future/superseded 断言保留。
- `tests/handoff-brief.test.mjs`：删除 NULL todo 与其断言；保留空串 todo；`future/superseded/过期` 断言保留。
- `tests/validity.test.mjs`：删除 NULL 数据库行及其集合断言；**保留**三条纯 JS 镜像断言（`isValidAt({status:null}, …, 'currentTodoLegacy') === true`、`… 'currentTodoActiveEmpty' === false`）；`active`/`''` 的 SQL 集合断言保留。
- 业务代码 0 改动（`git diff 29a18fd e1db9795 -- lib/` 为空）；未删除谓词、未放宽其他断言。

## 4. 定向测试（真实输出）

```
node --test tests/session-index.test.mjs   → tests 1 / pass 1 / fail 0 / skip 0   EXIT=0
node --test tests/handoff-brief.test.mjs   → tests 1 / pass 1 / fail 0 / skip 0   EXIT=0
node --test tests/validity.test.mjs        → tests 23 / pass 22 / fail 1 / skip 0 EXIT=1
   ✖ db: current 视图  (line 196)
```

## 5. 回归测试（真实输出）

```
node --test tests/preference-inject.test.mjs tests/remembered.test.mjs \
             tests/preference-lifecycle.test.mjs tests/preference-merge.test.mjs \
             tests/session-index.test.mjs tests/handoff-brief.test.mjs \
             tests/validity-integration.test.mjs
tests 19 / pass 19 / fail 0 / skipped 0
EXIT=0
```

## 6. 全量测试（真实输出）

连续两次：

```
npm test  →  tests 300 / pass 299 / fail 1 / skipped 0 / EXIT=1
失败：db: current 视图
```

另有一次（第二次运行前的同一份代码）出现 `tests/doctor.test.mjs` 额外失败，已定位为**与本批无关的既有环境性 flake**（见 §11），再跑未复现。

## 7. 静态检查

```
git diff --check → 无输出 (EXIT=0)
git status --short → ?? node_modules
git diff --stat → 空
```

## 8. 负向对照（6 组，全部在 worktree 内临时修改并逐字节恢复）

| 组 | 变异 | 结果 |
|---|---|---|
| A | session-index 恢复旧 todo 过滤 `status IN ('active','') AND (valid_to IS NULL OR valid_to>?)` | **测试仍 PASS（exit 0）**；泄漏探针 `{"leaksFuture":true,"leaksSuperseded":true}` → **暴露覆盖缺口**：该测试只用 episode 覆盖 future/superseded，**没有 todo 的 future/superseded 用例**。 |
| B | handoff brief 恢复旧 todo 过滤 | **测试 FAIL（exit 1）**，断在 `owner 有项目/决策/待办`（旧的 3 条 todo 被泄漏行挤出）；探针 `{"leaksFuture":true,"leaksSuperseded":true}` → 能捕获。 |
| C1 | helper 去掉 `valid_from` 条件 | `legacy todo presets…` **FAIL** |
| C2 | helper 去掉 `superseded_by` 条件 | **FAIL** |
| C3 | 把 `active-empty-null` 域改成 `active-empty` | **FAIL** |
| C4 | `isValidAt` 的 NULL 镜像改为 false | `legacy todo JS mirror…` **FAIL** |

恢复校验：三文件 `diff -q` 与备份一致；恢复后 session-index 1/1、handoff 1/1、helper 两测试 PASS。

## 9. SQL / JS 状态域一致性（实测）

```
currentTodoActiveEmpty : (status='active' OR status='')                     params=[at,at]
currentTodoLegacy      : (status='active' OR status='' OR status IS NULL)   params=[at,at]
两者均附带: (valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>?) AND (superseded_by IS NULL OR superseded_by=0 OR superseded_by='')
```

JS 镜像：

| status | activeEmpty | legacy |
|---|---|---|
| `'active'` | true | true |
| `''` | true | true |
| `null` / `undefined` | false | **true** |
| `'pending'` | false | false |

SQL 与 JS 逐格一致；NULL 仅由纯 JS 镜像覆盖（DB 不可存储，符合裁决）。

## 10. 隔离、预算、排序、只读兼容性（独立探针）

- session-index：`活跃待办 true｜空状态待办 true｜未来待办 false｜过期待办 false｜已替代待办 false｜群聊待办 false｜正常经历 true｜未来经历 false｜已替代经历 false`。
- handoff：`活跃待办 true｜空状态待办 true｜未来待办 false｜过期待办 false｜已替代待办 false`；`标签：待办 1 / 经历 1`（只计 owner + current active；空串不计）；群/陌生人不泄漏（`group leaks: false`、`stranger leaks: false`）。
- `decisions` 仍为 `status='decided'` 原查询；两调用点均纯 SELECT（无 access_count/revision/状态写）；排序、LIMIT、截断、`shouldInjectSessionIndex` 未改。

## 11. 风险与未执行事项

| 项 | 状态 | 说明 |
|---|---|---|
| **共享 DB 污染（P0，本轮唯一确定性失败）** | 未修复（不属本轮授权） | `tests/validity.test.mjs:178` 插入 2 条 todo 未清理，污染 `:192` 的精确集合断言。建议：在该用例 `finally` 删除插入行、或改用独立临时库、或把断言改为相对集合。 |
| **session-index todo 覆盖缺口（P1）** | 未修复 | 负向对照 A 证明：旧 todo 过滤下该测试仍通过；需补 `future valid_from` 与 `superseded` 的 **todo** 用例。 |
| `doctor.test.mjs` 偶发失败（既有 flake） | 非本批问题 | `/tmp` 中累积 **1,825** 个 `dy-doctor-*` 目录；测试只清理 `DIR`，不清理 `DIR+'-fts'`（`tests/doctor.test.mjs:16-18`），pid 复用时旧库已含 `raw_fts` rowid 424242 → `constraint failed`（`tests/doctor.test.mjs:82`）。三个最新 `-fts` 库均已存在该 rowid。`doctor.test.mjs` 在 `5797324→e1db9795` 之间**未被改动**。 |
| 生产验证 / 集成 / 合并 / 部署 | **NOT RUN** | 见 §12 |

## 12. 边界声明

- 未修改业务代码、测试代码（负向对照均在 worktree 内临时修改并逐字节恢复）。
- 未修改生产 DB、生产插件目录、`profile`/`config`；未部署、未重启、未启动 staging。
- 未合并 `feat/m1-preference-memory` 或 `main`；未修改其他 Memory 调用点。
- 未修改 Persona/EI/Autonomy/Android；未修改共享 `HANDOFF.md` / `REPORT.md`（blob `250f911c…` / `c98f6d54…` 未变）。
- 未 force push、未覆盖他人提交。
- **隔离测试结果不等于生产设备验证、集成验证或部署授权。**

## 13. 建议（给 GPT，未实施）

1. **修共享 DB 污染**（必做，最小改动）：在 `tests/validity.test.mjs` 的新用例末尾/`finally` 删除 `active`/`empty` 两行，或为该用例单开临时 DB；随后全量应回到 300/300。
2. **补 session-index todo 的 future/superseded 用例**（P1）：当前 todo 臂的修复没有回归守卫。
3. `doctor.test.mjs` 的清理范围建议扩到 `-fts/-fail/-fix/-imp/-warn`（或每次用唯一随机目录），但这属既有测试卫生问题，需另批授权。

## 14. 证据索引

| 内容 | 命令 / 路径 | 退出码 |
|---|---|---|
| HEAD / tree / compare | `git ls-remote`；`git rev-parse e1db9795^{tree}`；`git rev-list --left-right --count` | 0 |
| 六 blob | `git rev-parse e1db9795:<path>` | 0 |
| NULL fixture 检查 | `git show e1db9795:<test> \| grep -c status=NULL`（3 文件均 0） | 0 |
| 定向 ×3 | 见 §4 | 0 / 0 / **1** |
| 回归（7 文件） | 见 §5 | 0 |
| 全量 ×2 | `npm test` | **1**（299/300） |
| 污染隔离证明 | `--test-name-pattern="db: current 视图"` 单跑 PASS；与 mirror 一起 FAIL | 0 / 1 |
| 负向对照 A–C4 | 见 §8 | 0 / 1 / 1 / 1 / 1 / 1 |
| doctor flake 证据 | `tests/doctor.test.mjs:16-18,82`；1,825 个 `/tmp/dy-doctor-*`；3 个 `-fts` 库含 rowid 424242 | — |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |
