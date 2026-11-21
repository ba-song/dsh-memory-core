# MEMORY-REPORT-0009 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 覆盖任务：v1 P4 时间有效性 → v2 R5 语义 → v3 helper+P4 → v4 recall/graph/event-chain → v5 FTS/uncertain → v6 复核 `697de1e`+`b4606e1` → v7 strict graph lane → v8 Batch A → **v9 Batch B（本轮）**
> 仓库：`ba-song/dsh-memory-core`｜迭代规则：本文件覆盖式更新、版本号递增，不新增同类文件
> 最近更新：2026-11-21 13:5x (Asia/Shanghai) · v9

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001 | 10:15 | P4 时间有效性隔离验收（1635ccb）：PASS |
| MEMORY-REPORT-0002 | 10:5x | R5 双模式语义审查 |
| MEMORY-REPORT-0003 | 11:1x | 统一谓词 helper + P4 接入（4af81a2）：279/279 |
| MEMORY-REPORT-0004 | 11:5x | recall / graph / event-chain 接入（38844d1）：292/292 |
| MEMORY-REPORT-0005 | 12:2x | FTS 状态域 + uncertain 时间边界（4b4f927）：297/297 |
| MEMORY-REPORT-0006 | 12:5x | 复核 `697de1e`+`b4606e1`：PARTIAL |
| MEMORY-REPORT-0007 | 13:0x | strict graph lane（c437c46）：PASS，298/298 |
| MEMORY-REPORT-0008 | 13:3x | Batch A（preference + remembered）：PASS，298/298 |
| MEMORY-REPORT-0009 | 13:5x | **Batch B（session-index + handoff brief）：BLOCKED** —— 3 处 fixture 与 `status NOT NULL` 冲突，4 个测试失败 |

---

## 0. 结论：**BLOCKED**

| 项 | 判定 | 证据 |
|---|---|---|
| 基线 HEAD / 树 / ahead-behind | **PASS** | `29a18fd`、tree `9b1218e4…`、ahead 6 / behind 0 |
| 六个文件 blob | **PASS** | 与任务给定 6 个 SHA 逐一相同 |
| helper 两个新预设的 SQL 形态 | **PASS** | 逐字核对（§10） |
| SQL ↔ `isValidAt()` 镜像 | **PASS（JS 直测）** | 矩阵一致；镜像变异对照能捕获（§11/§16） |
| session-index 实现行为 | **PASS（独立探针）** | active/'' 收，future/expired/superseded/group 不收（§13） |
| handoff brief 实现行为 | **PASS（独立探针）** | active/'' 收，future/expired/superseded/pending 不收；隔离正确（§14） |
| **提交的测试能否运行** | **FAIL（阻塞）** | 3 处 `SET status=NULL` 违反 `memories.status NOT NULL` → 4 个测试失败 |
| 定向 / 回归 / 全量 | **FAIL** | validity 21/23；session-index 0/1；handoff 0/1；全量 **296/300、4 fail、0 skip、exit 1** |

**阻塞点唯一且明确**：`tests/session-index.test.mjs:19`、`tests/handoff-brief.test.mjs:15`、`tests/validity.test.mjs:183` 都执行 `UPDATE memories SET status=NULL`，而 `memories.status` 在仓库 DDL（`lib/store/schema.js:77`）与生产库（`PRAGMA table_info` → `notnull=1`）都是 `TEXT NOT NULL DEFAULT 'active'`。该 UPDATE 必然抛 `NOT NULL constraint failed: memories.status`，测试无法到达断言。
**代码层实现经独立探针验证符合设计**；按任务要求「不删除断言、不跳过测试、不放宽预期」，本轮不修改测试，提交证据与修复选项待 GPT 决定。

---

## 1. 仓库、分支、基线

| 项 | 值 |
|---|---|
| 仓库 / 分支 | `ba-song/dsh-memory-core` / `feat/memory-validity-batch-b` |
| 分支 HEAD（实测） | **`29a18fdcbaf95ff6042c8ef8eb5b678577e26129`**（与指定值一致，未前进） |
| 相对 Batch A 基线 | `5797324…` → ahead **6** / behind **0** |
| 树 SHA | `9b1218e42f1b7b1050bf5d71baa6730fd31d5736`（与任务一致） |
| 六个提交 | `ebe3cb8` feat → `621aedd` test → `e52aa6d` fix mirror → `54c1f77` test → `901fadc` correct assertions → `29a18fd` preserve fixtures |
| 环境 | Node **v24.19.0**、`node:sqlite`；独立 worktree `/tmp/memaudit/batchB`（detached @ 29a18fd）；未安装/升级依赖 |
| 仓库 AGENTS.md | `git ls-tree -r` 确认**仓库树内无 AGENTS.md**；已遵循工作区 AGENTS.md 与会话目录规则，并重读最新 `HANDOFF.md`(`bee03e17…`) / `REPORT.md`(`fc4d01dd…`) |

## 2. 六个文件实际 blob（全部与预期一致）

| 文件 | 实际 blob |
|---|---|
| `lib/store/validity.js` | `e2be1294e52e33724e1cd8c815dd418b8a883f2b` |
| `lib/inject/session-index.js` | `e155f1ce1ab147828c381d05532323e2cce0cebc` |
| `lib/handoff/brief.js` | `e8938ffc924f374d553017263d506472a5cacca0` |
| `tests/session-index.test.mjs` | `8739a4021f2eb940bc4bbf2d7538bbbbf2849a98` |
| `tests/handoff-brief.test.mjs` | `a900ff121118beaaae29d1920aad1cfbe922d179` |
| `tests/validity.test.mjs` | `d4c0a164eb19875f836090156b859653a019fc75` |

## 3. 工作区

```
git status --short → ?? node_modules   （仅符号链接）
git diff --check   → 无输出            EXIT=0
git diff --stat    → 空
```

---

## 4. session-index 定向测试

```
node --test tests/session-index.test.mjs
✖ tests/session-index.test.mjs
tests 1 / pass 0 / fail 1 / skipped 0
EXIT=1
Error: NOT NULL constraint failed: memories.status   (tests/session-index.test.mjs:19)
```

## 5. handoff brief 定向测试

```
node --test tests/handoff-brief.test.mjs
✖ tests/handoff-brief.test.mjs
tests 1 / pass 0 / fail 1 / skipped 0
EXIT=1
Error: NOT NULL constraint failed: memories.status   (tests/handoff-brief.test.mjs:15)
```

## 6. validity helper 定向测试

```
node --test tests/validity.test.mjs
tests 23 / pass 21 / fail 2 / skipped 0
EXIT=1
✖ validity: legacy todo JS mirror and SQL sets preserve NULL/empty distinctions   → line 183 NOT NULL
✖ db: current 视图                                                                → line 198（级联：前一测试留下的 3 条 todo 污染共享 DB 的精确集合断言）
```

单测隔离证据（`--test-name-pattern`）：
- `legacy todo presets preserve distinct status domains…` → **PASS**（SQL 形态正确）。
- `legacy todo JS mirror …` → FAIL（仅在 NULL fixture 处失败）。

## 7. 相关回归测试

```
node --test tests/preference-inject.test.mjs tests/remembered.test.mjs \
             tests/preference-lifecycle.test.mjs tests/preference-merge.test.mjs \
             tests/session-index.test.mjs tests/handoff-brief.test.mjs \
             tests/validity-integration.test.mjs
tests 19 / pass 17 / fail 2 / skipped 0
EXIT=1
```
失败即上述两个 Batch B 测试文件；其余 5 个文件全绿。

## 8. 全量测试

```
npm test
tests 300 / pass 296 / fail 4 / skipped 0
EXIT=1
```
失败 4 项：`handoff-brief.test.mjs`、`session-index.test.mjs`、`validity: legacy todo JS mirror…`、`db: current 视图`。

## 9. `git diff --check`

无输出，`EXIT=0`。

---

## 10. 两种 todo status domain 的真实 SQL 与参数顺序（实测字符串）

```
currentTodoActiveEmpty
  sql    = (status='active' OR status='') AND (valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>?) AND (superseded_by IS NULL OR superseded_by=0 OR superseded_by='')
  params = [at, at]   （长度 2）
  domain = (status='active' OR status='')
currentTodoLegacy
  sql    = (status='active' OR status='' OR status IS NULL) AND (valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>?) AND (superseded_by IS NULL OR superseded_by=0 OR superseded_by='')
  params = [at, at]   （长度 2）
  domain = (status='active' OR status='' OR status IS NULL)
current（未改动）
  sql    = status='active' AND (valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>?) AND (superseded_by IS NULL OR superseded_by=0 OR superseded_by='')
  params = [at, at]
```

调用点参数顺序：`session-index` 与 `handoff brief` 均为 `${validity.sql}` 在前、`LIMIT ?` 在后；绑定 `[...validity.params, limit]`（brief 为 `[pj.id, ...validity.params]`）与 SQL 文本顺序一致。

## 11. SQL ↔ `isValidAt()` 镜像一致性

JS 直测矩阵（不落库，规避 NOT NULL）：

| status | `current` | `currentTodoActiveEmpty` | `currentTodoLegacy` |
|---|---|---|---|
| `'active'` | true | true | true |
| `''` | false | **true** | **true** |
| `null` | false | false | **true** |
| `undefined` | false | false | **true** |
| `'pending'` | false | false | false |
| `'archived'` | false | false | false |

与 SQL 域逐格对照一致：`current` = active；`active-empty` = active/''；`active-empty-null` = active/''/NULL。

## 12. NULL / 空字符串 / active 三种状态的实测

- **active**：三个预设均收（探针：session-index 含「活跃待办」，brief 含「活跃待办A」）。
- **空字符串**：`active-empty` / `active-empty-null` 收（session-index 含「空状态待办」，brief 含「空状态待办B」）；`current` 不收。
- **NULL**：**在当前 schema 下无法写入**（`NOT NULL`）。生产实测也无 NULL（`status` 分布：active 213 / archived 8 / merged 3 / pending 1，无 NULL、无空串）。JS 镜像对 NULL 的行为符合 `active-empty-null` 设计，但无法通过 DB 路径验证。

## 13. future / valid_to / superseded 实测（独立探针，不依赖被阻塞的 fixture）

session-index（`buildSessionIndex(db,{now})`）：

```
block = 【跨会话经历】|- 11-21 正常经历|- 约定：空状态待办|- 约定：活跃待办|【跨会话经历结束】
活跃待办: true   空状态待办: true   未来待办: false   过期待办: false
已替代待办: false  群聊待办: false  正常经历: true   未来经历: false  已替代经历: false
```

handoff brief（`handoffBrief({cwd, isOwner:true})`）：

```
标签：待办 1
项目：工作区（/sdcard/DSHA/工作区）
待办：- 空状态待办B  - 活跃待办A
活跃待办A: true   空状态待办B: true   未来待办C: false
过期待办D: false  已替代待办E: false  pending 待办F: false
```

→ future `valid_from`、`valid_to` 过期、`superseded_by` 均已正确排除；旧状态兼容未被破坏。

## 14. owner / group / external / project 隔离

- session-index：群聊 episode/todo 未进入（探针 `群聊待办: false`；`scope_type='owner'` 保持）。
- handoff brief：`isOwner:false` 分支不读项目/决策/todo（`group leaks project/todos: false`；`stranger leaks: false`），不输出「标签」；owner 分支项目、决策、待办正常。
- 标签统计：`标签：待办 1` —— 只计 owner + `current`（active）记录；空串状态不计入标签，符合第 11/12 条。
- `decisions` 仍为原 `status='decided'` 查询，未接入 memory helper。

## 15. 只读 / 预算 / 排序 / 截断兼容性

- 两个调用点均为纯 SELECT；未更新 `access_count`、`revision`、状态字段（diff 仅替换 WHERE 条件与参数）。
- session-index：episode `ORDER BY created_at_epoch DESC LIMIT ?`、todo `ORDER BY id DESC LIMIT ?`、36/40 字截断、去重 `seen` 不变。
- handoff brief：todo `ORDER BY id DESC LIMIT 3`、`clipBlock(maxChars)`、pins/conversationSection/lastUnanswered/topics 未改。
- `shouldInjectSessionIndex` 未改。

## 16. 负向对照（全部在 worktree 内临时修改，恢复后逐字节一致）

### A. session-index 恢复旧 todo 过滤

```js
kind='todo' AND status IN ('active','') AND scope_type='owner' AND (valid_to IS NULL OR valid_to>?)
```
- 测试：**仍失败**，但错误同样是 `NOT NULL constraint failed: memories.status`（line 19）→ **不具备区分力**（fixture 先崩，断言未执行）。
- 独立泄漏探针（旧过滤下）：
```json
{"leaksFuture":true,"leaksSuperseded":true,
 "block":"【跨会话经历】|- 约定：已替代待办|- 约定：未来待办|【跨会话经历结束】"}
```
- 说明：代码修复确有必要，但提交的测试目前无法守护它。

### B. handoff brief 恢复旧 todo 过滤

- 测试：同样 **在 line 15 的 NULL fixture 处失败**（非断言失败）→ 不具备区分力。
- 泄漏探针：`{"leaksFuture":true,"leaksSuperseded":true,"keepsEmpty":true,"keepsActive":false}`（`keepsActive:false` 仅因 `LIMIT 3` + id DESC 把最旧的活跃待办挤出，不是语义缺陷）。

### C. helper 负向对照（4 组，全部按预期失败）

| 变异 | 结果 |
|---|---|
| 去掉 `valid_from` 条件 | `legacy todo presets…` **FAIL**（exit 1） |
| 去掉 `superseded_by` 条件 | **FAIL** |
| 把 `active-empty-null` 域改成 `active-empty` | **FAIL** |
| 镜像变异：`isValidAt` 不再容纳 NULL | JS 直测 `got=[false,true,true]`，`expected=[true,true,true]`，**MISMATCH=true** |

恢复后：`diff -q` 与备份一致；`legacy todo presets…` 单测 PASS。

---

## 17. 新问题 / 阻塞与修复选项

**阻塞（P0，本轮验收无法通过）**：3 处 fixture 假设 `status` 可为 NULL，与 schema 冲突。修复选项（需 GPT 决定，本轮未实施）：

1. **删掉 NULL 用例**（最小改动），并把 `currentTodoLegacy` 的 NULL 分支标注为「防御性、当前 schema 不可达」；保留 `''`/active 覆盖。
2. **用 legacy 表 fixture 测 NULL**：在临时库中重建一张 `status` 可空的 `memories` 表（或在插入前 `PRAGMA writable_schema`/表重建），仅用于验证 SQL/JS 的 NULL 语义。
3. **重新裁定 NULL 兼容是否必要**：生产 `memories.status` 为 `NOT NULL` 且现存值无 NULL/空串 → 该兼容分支可能只是历史防御；若确认无用，可直接把 brief 的 todo 预设改为 `currentTodoActiveEmpty`，删除 `currentTodoLegacy`。

非阻塞观察：
- `db: current 视图` 的失败是前一测试崩溃后遗留 3 条 active todo 造成的**级联污染**，不是独立缺陷；修复 NULL fixture 后应恢复。
- `VALIDITY_PRESETS` 枚举从 4 → 6；`tests/validity.test.mjs` 已更新枚举断言，未发现其他调用方按枚举长度硬编码（已 grep）。
- 生产状态分布无 `''` 与 NULL，说明两个 todo 预设的兼容分支目前都是防御性代码。

## 18. 生产边界声明

- 未写入、删除、回填、迁移生产 DB；本轮**未打开生产库本体**（仅使用此前 `/tmp` 只读副本做 schema 只读核对）。
- 未修改生产插件目录、`profile`/`config`；未部署、未重启、未启动 staging。
- 未合并 `feat/m1-preference-memory` 或 `main`；未修改 preference merge / daily / weekly / 其他未接入调用点。
- 未修改 Persona/EI/Autonomy/Android；未修改共享 `HANDOFF.md` / `REPORT.md`（blob `bee03e17…` / `fc4d01dd…` 未变）。
- 负向对照全部在 worktree 内临时修改并逐字节恢复；未 force push、未覆盖他人提交。
- **本轮为隔离验证；即使后续测试修复通过，也不代表生产验证通过或获准合并/部署。**

## 19. 证据索引

| 内容 | 命令 / 路径 | 退出码 |
|---|---|---|
| HEAD / 树 / 提交链 | `git ls-remote`；`git rev-parse 29a18fd^{tree}`；`git log` | 0 |
| 六 blob | `git rev-parse 29a18fd:<path>` | 0 |
| schema 约束 | `lib/store/schema.js:77`；生产副本 `PRAGMA table_info(memories)` | 0 |
| session-index 定向 | `node --test tests/session-index.test.mjs` | **1** |
| handoff 定向 | `node --test tests/handoff-brief.test.mjs` | **1** |
| validity 定向 | `node --test tests/validity.test.mjs`（23/21/2） | **1** |
| 回归集合（7 文件） | `node --test …`（19/17/2） | **1** |
| 全量 | `npm test`（300/296/4/0） | **1** |
| helper 对照 ×4 | 变异后单测/直测失败，恢复后 PASS | 1（预期） |
| 调用点对照 ×2 | 测试仍失败于 NULL fixture；泄漏探针 true | 1 |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |
