# MEMORY-REPORT-0011 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：v1 P4 → v2 R5 → v3 helper+P4 → v4 recall/graph/event-chain → v5 FTS/uncertain → v6 复核 `697de1e`+`b4606e1` → v7 strict graph lane → v8 Batch A → v9/v10 Batch B 两次 BLOCKED → **v11 Batch B 第三轮复验（本轮）**
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 14:1x (Asia/Shanghai) · v11

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001~0007 | 10:15–13:0x | P4 / R5 / helper / 三调用点 / FTS+uncertain / 两次复核 / strict lane |
| MEMORY-REPORT-0008 | 13:3x | Batch A（preference + remembered）：PASS，298/298 |
| MEMORY-REPORT-0009 | 13:5x | Batch B 首验：BLOCKED（NULL fixture 与 NOT NULL 冲突，4 fail） |
| MEMORY-REPORT-0010 | 14:0x | Batch B 二验：BLOCKED（共享 DB 污染，1 fail；session-index todo 覆盖缺口） |
| MEMORY-REPORT-0011 | 14:1x | **Batch B 三验：PASS（隔离代码验收）** —— 300/300 ×3，8 组负向对照全部符合预期 |

---

## 1. 结论：**PASS（仅限隔离代码验收）**

| 项 | 判定 | 证据 |
|---|---|---|
| HEAD / tree / compare | **PASS** | `2a93031`、tree `3d5e305e…`、相对 `5797324` ahead **11** / behind **0** |
| 三个业务文件未变 | **PASS** | `validity.js e2be1294…`、`session-index.js e155f1ce…`、`brief.js e8938ffc…`（与首验逐字节相同） |
| 两个新测试 blob | **PASS** | `validity.test f19e124e…`、`session-index.test 3f51f279…`；handoff 测试未变 `98b6891a…` |
| NULL fixture 已清除 | **PASS** | 三个测试文件 `status=NULL` 计数均为 0 |
| validity 共享 DB 污染已修 | **PASS** | try/finally `DELETE FROM memories WHERE id IN (?,?)`；删掉 finally 可复现污染（对照 8） |
| session-index todo 覆盖已补 | **PASS** | 新增 future/superseded todo fixture + 两条排除断言；对照 1/2 证明各自能失败 |
| 定向测试 ×3 | **PASS** | 1/1、1/1、23/23，均 exit 0 |
| validity 连续 3 次 | **PASS** | 每次 23/23、0 fail、0 skip、exit 0 |
| 回归集合（7 文件） | **PASS** | 19/19，exit 0 |
| 全量 `npm test` | **PASS** | **300/300、0 fail、0 skip、exit 0**（本轮共 3 次，含负向对照恢复后一次） |
| 8 组负向对照 | **PASS** | 全部按预期失败，恢复后逐字节一致 |
| 兼容性（SQL/JS/隔离/预算/只读） | **PASS** | 见 §6/§7 |
| 生产验证 / 集成 / 合并 / 部署 | **NOT RUN** | 见 §9 |

**本轮为隔离代码验收 PASS；不代表生产设备验证、集成、合并或部署已完成。**

---

## 2. 基线与 blob 核验

| 项 | 值 |
|---|---|
| 分支 | `feat/memory-validity-batch-b` |
| HEAD（实测） | **`2a93031db3dfa1a1c7c34b7376aebe395493c57f`**（与指定一致，未前进） |
| 树 SHA | `3d5e305ecf53f70b6f6090e4514346b8ce54ef91`（与指定一致） |
| 相对 Batch A | `5797324…` → ahead **11** / behind **0** |
| 本轮提交 | `62cef99`、`2a93031`（`test(memory): isolate validity fixtures and guard todo temporal filters`） |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/batchB3`（detached @ 2a93031）；未安装/升级依赖 |
| 文档 | 已重读最新 `HANDOFF.md`（blob `250f911c…`，§58 = HANDOFF-0061 Batch A）与 `REPORT.md`（blob `c98f6d54…`）；**Batch B 尚未写入交接文档**（预期，待 GPT 整合）；仓库树内无 AGENTS.md |
| 工作区 | `git status --short` → `?? node_modules`；`git diff --check` → exit 0；`git diff --stat` → 空；HEAD/tree 与指定一致 |

| 文件 | 实际 blob |
|---|---|
| `lib/store/validity.js` | `e2be1294e52e33724e1cd8c815dd418b8a883f2b` |
| `lib/inject/session-index.js` | `e155f1ce1ab147828c381d05532323e2cce0cebc` |
| `lib/handoff/brief.js` | `e8938ffc924f374d553017263d506472a5cacca0` |
| `tests/validity.test.mjs` | `f19e124edf6f93b298ab707469ba3e446bab0492` |
| `tests/session-index.test.mjs` | `3f51f279815337b56e36c3b1605118327ae295e2` |
| `tests/handoff-brief.test.mjs` | `98b6891a9d5cb8a2c7028e4f7c812598b0dfd452` |

## 3. 两个 fixture 修复内容核对

**validity 隔离**：`legacy todo JS mirror…` 插入 active/empty 两条 todo 后，主体放入 `try`，`finally` 执行 `DELETE FROM memories WHERE id IN (?,?)`；NULL 仅保留纯 JS 镜像断言（`isValidAt({status:null}, …, 'currentTodoLegacy') === true`、`'currentTodoActiveEmpty' === false`）。

**session-index 覆盖**：新增
```js
await insertMemory(db, { kind:'todo', text:'未来待办不应进入索引。', createdAt: now-350, validFrom: now+60_000 })
const supersededTodo = await insertMemory(db, { kind:'todo', text:'已替代待办不应进入索引。', createdAt: now-325 })
db.prepare('UPDATE memories SET superseded_by=? WHERE id=?').run(999999, supersededTodo)
...
assert.ok(!block.includes('未来待办不应进入索引'))
assert.ok(!block.includes('已替代待办不应进入索引'))
```
断言行号：fixture 18/19，断言 42/43。

## 4. 三项定向测试

```
node --test tests/session-index.test.mjs  → 1/1，fail 0，skip 0   EXIT=0
node --test tests/handoff-brief.test.mjs  → 1/1，fail 0，skip 0   EXIT=0
node --test tests/validity.test.mjs       → 23/23，fail 0，skip 0 EXIT=0
```

## 5. validity 连续三次 + 污染路径

```
run1: 23/23 pass, 0 fail, 0 skip  EXIT=0
run2: 23/23 pass, 0 fail, 0 skip  EXIT=0
run3: 23/23 pass, 0 fail, 0 skip  EXIT=0
```
污染路径专门验证：`--test-name-pattern="legacy todo JS mirror|db: current 视图"` → **两测同跑 PASS**（上一轮此处 FAIL，多出 id 16）。

## 6. 回归与全量

```
回归 7 文件 → tests 19 / pass 19 / fail 0 / skip 0  EXIT=0

npm test（负向对照前 ×2、恢复后 ×1）
→ tests 300 / pass 300 / fail 0 / skipped 0 / EXIT=0
```
本轮三次全量均 300/300，`doctor.test.mjs` 历史 flake 未复现。

## 7. 静态检查

```
git diff --check → 无输出 (EXIT=0)
git status --short → ?? node_modules
git rev-parse HEAD → 2a93031…；HEAD^{tree} → 3d5e305e…
```

## 8. 八组负向对照（worktree 内临时修改，恢复后逐字节一致）

| # | 变异 | 结果 |
|---|---|---|
| 1 | session-index 恢复旧 todo 过滤（`status IN ('active','') AND valid_to`） | 测试 **FAIL**（exit 1）。默认 `agreements: 2` 时先断在 line 38（`M3-1 评测` 被泄漏行挤出）；为单独证明新断言，用 scratch 副本把 `agreements` 提到 10 → **失败在 line 42 = `未来待办不应进入索引`** ✅ |
| 2 | 同上 + 去掉 future fixture/断言（scratch） | **失败在 line 41 = `已替代待办不应进入索引`** ✅ |
| 3 | handoff 恢复旧过滤 | **FAIL**（line 19 `owner 有项目/决策/待办`，泄漏行挤出期望内容） |
| 4 | helper 去 `valid_from` | `legacy todo presets…` **FAIL** |
| 5 | helper 去 `superseded` | **FAIL** |
| 6 | helper 改状态域（legacy → active-empty） | **FAIL** |
| 7 | `isValidAt` NULL 镜像改为 false | `legacy todo JS mirror…` **FAIL** |
| 8 | validity mirror 用例删除 `finally` 清理 | **复现污染**：`db: current 视图` FAIL，`actual [1,4,11,12,13,16]` vs `expected [1,4,11,12,13]`；恢复后连续 3 次 23/23 PASS |

恢复校验：5 个被改文件 `diff -q` 与备份全部一致；`git status` 仅 `?? node_modules`。

## 9. SQL / JS 状态域与兼容性（独立探针）

```
currentTodoActiveEmpty : (status='active' OR status='')                     params=[at,at]
currentTodoLegacy      : (status='active' OR status='' OR status IS NULL)   params=[at,at]
两者均带 (valid_from IS NULL OR <=?) AND (valid_to IS NULL OR >?) AND superseded 为空
```

| status | activeEmpty | legacy |
|---|---|---|
| `'active'` | true | true |
| `''` | true | true |
| `null` / `undefined` | false | **true** |
| `'pending'` | false | false |

行为探针：session-index `活跃 true｜空串 true｜未来待办 false｜过期待办 false｜已替代待办 false｜群聊待办 false｜未来经历 false｜已替代经历 false`；handoff `活跃 true｜空串 true｜未来/过期/已替代 false`；`标签：待办 1 / 经历 1`（仅 owner+current active）；`group leaks: false`、`stranger leaks: false`；`decisions` 未接入 helper；两调用点纯 SELECT，排序/LIMIT/截断/`shouldInjectSessionIndex` 未改；参数顺序均为「validity 先、LIMIT（或 pj.id）后」。

## 10. 风险与未执行事项

| 项 | 状态 |
|---|---|
| `doctor.test.mjs` 历史环境 flake | 本轮 3 次全量均未复现。机理（上轮已取证）：`/tmp` 累积 1,825 个 `dy-doctor-*`，测试只删 `DIR` 不删 `DIR+'-fts'`（`tests/doctor.test.mjs:16-18`），pid 复用时旧库已含 `raw_fts` rowid 424242（`:82`）。该文件在本批 diff 中未改动 → 非 Batch B 业务失败 |
| Batch B 尚未写入 HANDOFF/REPORT | 预期；由 GPT 统一整合（本轮未改共享文件） |
| 其他调用点（merge / daily / weekly 等） | 仍未接入（按批次授权） |
| 生产 as-of / 设备验证 / 集成 / 合并 / 部署 | **NOT RUN** |
| 测试命名 | `legacy todo JS mirror…NULL/empty distinctions` 中的 NULL 现仅由 JS 镜像覆盖（DB 不可存 NULL），名称略陈旧，非缺陷 |

## 11. 边界声明

- 未修改业务代码与测试代码（所有负向对照均在 worktree 内临时修改并逐字节恢复；scratch 副本已删除）。
- 未修改生产 DB、生产插件目录、`profile`/`config`；未部署、未重启、未启动 staging。
- 未合并 `feat/m1-preference-memory` 或 `main`；未修改其他 Memory 调用点。
- 未修改 Persona/EI/Autonomy/Android；未修改共享 `HANDOFF.md` / `REPORT.md`。
- 未 force push、未覆盖他人提交。
- **隔离代码验收 PASS ≠ 生产设备验证 ≠ 集成/合并/部署已完成。**

## 12. 证据索引

| 内容 | 命令 | 退出码 |
|---|---|---|
| HEAD / tree / compare | `git ls-remote`；`git rev-parse HEAD^{tree}`；`git rev-list --left-right --count` | 0 |
| 六 blob | `git rev-parse 2a93031:<path>` | 0 |
| 定向 ×3 | 见 §4 | 0 |
| validity ×3 | 见 §5 | 0 |
| 回归 7 文件 | 见 §6 | 0 |
| 全量 ×3 | `npm test` | 0（300/300/0/0） |
| 对照 1–8 | 见 §8 | 1（预期）；恢复后 0 |
| 兼容探针 | `/tmp/probe-batchB3.mjs` | 0 |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |
