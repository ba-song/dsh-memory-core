# MEMORY-REPORT-0024 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 任务标识：v17 `MEM-VALIDITY-BATCH-E-REVERIFY-03` → v18 `MEM-WAKE-CAPTURE-DECISION-01` → **v19 `MEMORY-MINIMAL-INTEGRATION-VERIFY-01`**
> 覆盖任务：Batch A PASS → Batch B PASS → Batch C PASS → Batch D PASS → **Batch E（weekly）第三次复验**
> 仓库：`ba-song/dsh-memory-core`｜本文件覆盖式更新、版本号递增
> 最近更新：2026-11-22 10:4x (Asia/Shanghai) · v24

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001~0011 | 10:15–14:1x | P4 / R5 / helper / 三调用点 / FTS+uncertain / 复核 / Batch A PASS / Batch B PASS |
| MEMORY-REPORT-0012~0013 | 14:4x–16:0x | Batch C 首验 BLOCKED → 修复后 PASS |
| MEMORY-REPORT-0014 | 16:3x | Batch D PASS，302/302 ×3 |
| MEMORY-REPORT-0015 | 17:0x | Batch E 首验 BLOCKED |
| MEMORY-REPORT-0016 | 17:1x | Batch E 二验 BLOCKED（validTo 放错行） |
| MEMORY-REPORT-0017 | 17:4x | **Batch E 三验：PASS（隔离代码验证）** —— 305/305 ×4、30/30 ×3、53/53、7/7 负向对照 |
| MEMORY-REPORT-0018 | 18:2x | 设计决议：自主唤醒回合自动写入（方案 A，待实现） |
| MEMORY-REPORT-0019 | 18:5x | 最小集成分支首验：BLOCKED（缺 `lib/time/anchor.js`） |
| MEMORY-REPORT-0020 | 19:3x | 双任务：A BLOCKED（4 项）、B PASS（143/143） |
| MEMORY-REPORT-0021 | 20:0x | 最小集成修复后复验：BLOCKED（v5/M1 断言超出范围） |
| MEMORY-REPORT-0022 | 09:5x | M1 主线只读复核：HEAD `7548e49`；有效性入口不一致；wake 未集成；selfId 哨兵绕过；测试 258/258 |
| MEMORY-REPORT-0023 | 10:2x | 契约 v1.0 评审：BLOCKED（2.2/3.2/3.3/3.4/4.1 不满足） |
| MEMORY-REPORT-0024 | 10:4x | **契约设计审查 `MEMORY-CONTRACT-REVIEW-01`：READY_FOR_REVIEW** —— 给出 valid_from_kind / superseded_at / 三态 helper 的最小设计；wake 建议延后 |

---

## 0. 最终结论

**BATCH E ISOLATED CODE VERIFICATION PASS**

| 项 | 判定 | 证据 |
|---|---|---|
| HEAD / tree / compare | **PASS** | `4bf92aad…`、tree `efff01dc…`、相对 `e3976101` ahead **2** / behind **0** |
| 仅测试文件变化、业务代码未动 | **PASS** | `weekly.js` 仍 `61083aaa…`；`validity.js` 仍 `7aabea0e…` |
| 三个目标 blob | **PASS** | 与任务给定完全一致 |
| fixture 修复（validTo 移到 member 行） | **PASS** | diff 仅 2 行，断言与业务代码均未改 |
| 定向测试 ×3 | **PASS** | 30/30 ×3，0 fail，0 skip，exit 0 |
| weekly 单文件 | **PASS** | **6/6**，line 53/55 等关键断言未放宽 |
| 六文件回归 | **PASS** | 53/53，0 fail，0 skip，exit 0 |
| 全量 `npm test` ×3（+恢复后 1 次共 4 次） | **PASS** | **305/305、0 fail、0 skip、exit 0** |
| 七组负向对照 E1–E7 | **PASS** | 全部由语义断言失败证明；恢复后逐字节一致 |
| 生产 / 部署 / 合并 | **未触碰** | 见 §7 |

**本 PASS 仅代表 Batch E 隔离代码验证；不代表生产验证、集成、主线合并或部署。**

---

## 1. 基线与文件

| 项 | 值 |
|---|---|
| 分支 | `feat/memory-validity-batch-e` |
| 目标 HEAD（实测） | **`4bf92aad8c069e92f3521e6a7cdf4c7b79559e3c`** |
| tree | **`efff01dc63e8bddcdbeb79c430692cf4e26f18aa`** |
| 基线（Batch E 原始实现） | `e3976101…`；ahead **2** / behind **0** |
| 本轮修复提交 | `4bf92aa` `test(memory): place future valid_to on weekly member fixture`（仅 1 文件、2 行） |
| 环境 | Node **v24.19.0**；独立 worktree `/tmp/memaudit/batchE3`（detached @ 4bf92aad）；未安装/升级依赖 |
| 仓库 AGENTS.md | 仓库树内**无 AGENTS.md**（`git ls-tree -r`）；已遵循工作区 AGENTS.md |
| 协调文档 | HANDOFF blob `4c9c2314…`、REPORT blob `23c9cdcb…`；本轮未修改 |

| 文件 | blob |
|---|---|
| `lib/consolidate/weekly.js` | `61083aaaaff3fbc6927490045a92246ee9b1d05f`（未变） |
| `tests/weekly.test.mjs` | `a8cf3cdb362a76a6fe29072840b495325994471a` |
| `lib/store/validity.js` | `7aabea0efff2b9d5fe40acea19fcc4609f5e87e6`（未变） |

## 2. fixture 修复前后差异

```diff
-  await insertMemory(db, { …, text: '主人喜欢烤生蚝', importance: 0.6, …, scopeType: 'owner' })
-  await insertMemory(db, { …, text: '主人喜欢吃烤生蚝', importance: 0.7, …, scopeType: 'owner', validTo: now + 86400000 })
+  await insertMemory(db, { …, text: '主人喜欢烤生蚝', importance: 0.6, …, scopeType: 'owner', validTo: now + 86400000 })
+  await insertMemory(db, { …, text: '主人喜欢吃烤生蚝', importance: 0.7, …, scopeType: 'owner' })
```
- 未来 `validTo` 已从 **keeper（0.7）** 行移到 **member（0.6）** 行，符合 `clusterMemories` 按 importance 选 keeper 的规则。
- 上一轮已修好的 `weeklyConsolidate(..., now)` 固定时间参数保留。
- 断言（line 53 clamp、line 55 snapshot）**逐字未改**；业务代码未改。

## 3. 测试结果（本轮实测）

### 3.1 定向测试 ×3

```
node --test tests/weekly.test.mjs tests/validity.test.mjs
run1: tests 30 / pass 30 / fail 0 / skipped 0   EXIT=0
run2: tests 30 / pass 30 / fail 0 / skipped 0   EXIT=0
run3: tests 30 / pass 30 / fail 0 / skipped 0   EXIT=0
```

### 3.2 weekly 单文件

```
tests 6 / pass 6 / fail 0 / skipped 0   EXIT=0
```
关键断言原文（未放宽/未删除）：
```js
assert.equal(Number(full.valid_to), now, '原有未来 valid_to 必须收敛到实际 supersede 时刻')
assert.ok(Number(JSON.parse(snapshot.previous_json).valid_to) > now, 'revision 快照必须保留迁移前的未来 valid_to')
assert.equal(Number(full.revision), 2, …); assert.equal(full.temporal_kind, 'historical'); assert.equal(Number(snaps), 1)
```

### 3.3 六文件回归

```
node --test weekly validity validity-integration validity-review-fix preference-merge consolidate
tests 53 / pass 53 / fail 0 / skipped 0   EXIT=0
```

### 3.4 全量 `npm test`

```
run1: 305 / 305 / 0 fail / 0 skip / EXIT=0
run2: 305 / 305 / 0 fail / 0 skip / EXIT=0
run3: 305 / 305 / 0 fail / 0 skip / EXIT=0
（负向对照全部恢复后再跑 1 次：305/305/0/0，EXIT=0）
```

## 4. 七组负向对照（本轮重跑，全部由语义断言失败证明）

| # | 变异 | 实际失败断言 | exit |
|---|---|---|---|
| E1 | 候选退回 `status='active'` | `must not be a weekly candidate: #3` | 1 |
| E2 | helper 去 `valid_from`（保留占位符） | `must not be a weekly candidate: #3` | 1 |
| E3 | helper 去 `valid_to`（保留占位符） | `must not be a weekly candidate: #4` | 1 |
| E4 | helper 去 `superseded` | `must not be a weekly candidate: #5` | 1 |
| E5 | 收敛恢复 `COALESCE(valid_to, ?)` | `原有未来 valid_to 必须收敛到实际 supersede 时刻`（actual 未来值 / expected now） | 1 |
| E6 | 恢复 status-only fallback | `missing history table must not fall back to legacy status-only write` | 1 |
| E7 | 移除 member/keeper CAS 检查 | `assert.equal(r.ok,false)`：`true !== false`（line 134） | 1 |

恢复证据：`lib/consolidate/weekly.js`、`lib/store/validity.js`、`tests/weekly.test.mjs` 与备份 `diff -q` 全部一致；最终 SHA256：
```
02c036b3a08bafa93329ac974dda012a0c57e9900ef79869534b5004e5bc8e0e  lib/consolidate/weekly.js
f4edb5cc43089784674666ca32e8af55cb4a275f66c31f96253e98e8f294442e  tests/weekly.test.mjs
dbbc453c032cbd0cbf0739989cbe8ede204c8a0a1f4f3d9eb5fbdbc20d34390f  lib/store/validity.js
```
scratch 文件已全部删除，`tests/*.test.mjs` = 143。

## 5. 业务代码审查（本轮复核，未发现缺陷）

| # | 检查项 | 结论 |
|---|---|---|
| 1 | current validity 候选过滤 | `loadWeeklyCandidates` 用 `current`；valid_from NULL 兼容；future/expired/superseded/archived 排除（E1–E4） |
| 2 | dry-run 与 apply 同源 | 同一 `loadWeeklyCandidates` |
| 3 | `BEGIN IMMEDIATE` 后重读 keeper/member | 是，`SELECT *` 后复核 |
| 4 | revision 与 validity 复核 | 扫描时 revision 不一致 → `continue`；validity 用 `isValidAt(…, 'current')` |
| 5 | snapshot 与 CAS 同事务 | 同一事务内 INSERT + 带 revision/validity 的 UPDATE |
| 6 | `valid_to = min(原值, now)` | `CASE WHEN valid_to IS NULL OR valid_to>? THEN ? ELSE valid_to END`；探针：NULL→now、future→now |
| 7 | snapshot 保存迁移前原值 | UPDATE 前写入 `JSON.stringify(row)`；探针：快照保留 `now+1d` |
| 8 | 缺表/写入失败/CAS 未命中整体 rollback | 外层 catch → ROLLBACK → `ok:false`（E6/E7） |
| 9 | keeper importance 仅成功后更新 | `clusterApplied > 0` 才 bump，且带 revision/current 条件 |
| 10 | 无 status-only 静默降级 | 已移除；E6 对照证明恢复 fallback 会立即失败 |

独立探针（本轮在验证 HEAD 重跑）：
```
validTo=NULL → valid_to=now；快照 valid_to=null
validTo=now+1d → valid_to=now；快照保留 now+1d
validTo=now-1s → 不进候选，superseded=0，无快照
```

## 6. 工作区与静态检查

```
git status --short → ?? node_modules（既有符号链接）
git diff --check   → 无输出 EXIT=0
git diff --stat    → 空
HEAD=4bf92aad8c069e92f3521e6a7cdf4c7b79559e3c
tree=efff01dc63e8bddcdbeb79c430692cf4e26f18aa
HEAD:lib/consolidate/weekly.js = 61083aaaaff3fbc6927490045a92246ee9b1d05f
HEAD:tests/weekly.test.mjs    = a8cf3cdb362a76a6fe29072840b495325994471a
HEAD:lib/store/validity.js    = 7aabea0efff2b9d5fe40acea19fcc4609f5e87e6
```

## 7. 未执行事项与边界声明

| 项 | 状态 |
|---|---|
| 真实 weekly 调度 / apply | **NOT RUN**（生产行为，未授权） |
| 生产 DB / 插件 / profile / config | **未触碰**；未连接生产库 |
| 部署 / 重启 / staging / 合并 | **NOT RUN** |
| Batch A–E 统一集成 | **NOT RUN**（待 GPT 安排） |

- 本轮只修改了 scratch/隔离 worktree 内的临时文件用于负向对照，全部逐字节恢复；正式分支代码与测试从未被修改。
- 未写生产 DB；未改生产插件目录、`profile`/`config`；未部署、未重启、未启动 staging；未合并主线；未执行真实 weekly 调度/apply。
- 未修改其他调用点、Persona/EI/Autonomy/Android；未修改共享 `HANDOFF.md` / `REPORT.md`；未 force push。
- **明确区分**：
  - 测试代码修复：GPT 在 `tests/weekly.test.mjs` 完成（本轮复验其效果）；
  - 隔离代码验证：本轮 PASS；
  - 生产验证、集成、主线合并、部署：**均未执行**。

## 8. 证据索引

| 内容 | 命令 | 退出码 |
|---|---|---|
| HEAD / tree / compare / blob | `git ls-remote`、`git rev-parse`、`git rev-list --left-right --count` | 0 |
| 定向 ×3 | `node --test tests/weekly.test.mjs tests/validity.test.mjs` | 0（30/30 ×3） |
| weekly 单文件 | `node --test tests/weekly.test.mjs` | 0（6/6） |
| 六文件回归 | 见 §3.3 | 0（53/53） |
| 全量 ×3 + 恢复后 1 | `npm test` | 0（305/305 ×4） |
| clamp/snapshot 探针 | `/tmp/probe-weekly-clamp3.mjs` | 0 |
| 负向对照 E1–E7 | 见 §4 | 1（预期）；恢复后 0 |
| 工作区 | `git status --short`、`git diff --check`、`git diff --stat` | 0 |


---

## 9. 设计决议：自主唤醒回合自动写入（`MEM-WAKE-CAPTURE-DECISION-01`）

> 状态：**已由项目负责人拍板（方案 A），待实现与独立验证；未写任何代码、未动生产。**
> 记录时间：2026-11-21 18:2x；来源：负责人对话「A / 记下来，下次告诉 gpt 就好了」。

### 9.1 背景事实（本轮只读核查，2026-11-21）

- 自主唤醒（`dsh-autonomy` → `home.awake`）的 prompt 走 `source.kind='autonomy-home-wake'`；其内容**会**进 raw 归档（home cwd 在 `trustedDirs` → 归档白名单），**不会**进 memories 表。
- 证据：唤醒提示在 `raw_meta` 出现 497 次，在 `memories` 中 0 次；P4 入库门控为 `user/message` + `source.kind==='user'` + owner cwd，因此唤醒 prompt 与她自己的 `self` 输出均被跳过。
- 现状是“归档全量、记忆精选”的设计；自动写入属于**新能力**，不是缺陷修复。

### 9.2 决议（方案 A：回合摘要 episode）

每次**自主唤醒**回合结束后，把该回合她说的话/做的事压成 1–3 句 `episode` 写入 memories：

| 维度 | 决定 |
|---|---|
| 触发 | `session/event` 的 `turn/end`；仅当本轮首个 user 消息 `source.kind` 为 `autonomy-home-wake` / `autonomy-home-manual` |
| 识别前置 | 把 `source.kind` 落进 `raw_meta.extra`（当前未落，需小改 `lib/ingest/archive.js`） |
| 内容 | 该 turn 的 `self` 行（说出来的话）；`self-thought` 只作摘要输入、不单独成条 |
| 写入 | `insertMemory({ kind:'episode', subject:'汐', layer:'auto', sourceKey:'wake:<sessionId>:<turnSeq>', meta:{ origin:'autonomy-wake', wakeReason } })` |
| 幂等 | `sourceKey` 去重，同一 turn 重跑不重复写 |
| 去重 | 写入前走 `bestMatch`/向量近重复 |
| 频率 | 每天上限（建议 5–8 条）；“确认一下就走”的极短回合不写 |
| 作用域 | 仅 `scope_type='owner'`；**不写** fact/relation（避免冒充主人事实） |
| 失败 | 静默 warn，不影响回合与注入 |
| 不做 | 不逐条把 self 消息送进 P4（避免自我强化/回音室）、不动 daily/weekly、不动 P4 状态机 |

### 9.3 预计改动点（待授权后实施）

- `lib/ingest/archive.js`：user 消息 `extra` 记录 `sourceKind`；
- `lib/index.js`：`turn/end` 钩子 + 调用新模块；
- 新增 `lib/ingest/wake.js`：取回合内容 → 摘要 → 幂等写入；
- 测试：独立临时库；照 Batch 流程做定向/回归/全量/负向对照。

### 9.4 边界

- 本地未写生产 DB、未改插件/profile/config、未部署、未合并；本节仅为决策记录。
- 实施需隔离分支（建议 `feat/memory-wake-capture`）+ GPT 协调 + 独立复验；生产部署另需授权。


---

## 10. `MEMORY-MINIMAL-INTEGRATION-VERIFY-01`（最小集成分支验证）

> 分支 `feat/memory-validity-minimal-integration` @ `b15a07a529e51bdffb1b487f90feb99c96dca056`
> 基线 `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`（main）；compare：ahead 18 / behind 0；15 个文件变更（10 M + 5 A），与任务清单一致。
> 结论：**BLOCKED**（只读、临时库；未改代码、未动生产）。

### 10.1 P0：缺失模块（阻塞全量）

- `lib/consolidate/daily.js:16` → `import { anchorRelativeTime } from '../time/anchor.js'`
- 实际：`lib/time/` 目录在本分支**不存在**（main 也没有；该文件在 `feat/m1-preference-memory` 上，blob `94c8d44aa772f639797840b403d841154e7872b8`，提交 `a77b801`）
- 复现：`node -e "import('lib/index.js')"` → `ERR_MODULE_NOT_FOUND: .../lib/time/anchor.js`
- 影响：`lib/index.js:47` 传递依赖 daily.js → 依赖 index 的测试全部无法加载；全量 **131 tests / 102 pass / 29 fail**（29 个文件级失败）
- 最小修复：把 `lib/time/anchor.js`（blob `94c8d44a…`）加入本分支

### 10.2 P1：补上 P0 后仍 6 个既有测试失败（行为变更未同步测试）

诊断方式：在 `/tmp/memaudit/integ-scratch` 副本加入缺失文件后运行（仅诊断，不代表分支已修）→ **136 tests / 130 pass / 6 fail**：

| 测试 | 失败断言 | 原因 |
|---|---|---|
| `tests/remembered.test.mjs:22` | `block.startsWith('【记得的事】')` | M1 起 preference 不再进常驻块（`preference-managed-separately`），测试仍插 preference |
| `tests/scope.test.mjs:99` | external/home 便签断言 | 同上 |
| `tests/inject-b1b.test.mjs:57` | 「传 db 后应能读到记得的事」 | 同上 |
| `tests/inject-safety.test.mjs:103` | `captured.length === 1`（实得 2） | `agent/created` 现同时挂 `dy-preference` + `dy-memory-stable`，测试只认 1 个且取 `[0]` |
| `tests/prestep.test.mjs:53` | `mountedCalls.length === 1` | 同上 |
| `tests/carryover.test.mjs:35` | `caps.length === 1` | 同上 |

最小修复：从特性分支带入对应测试更新（Batch A 已有更新版 remembered/scope/inject/prestep 断言），或按 M1 语义改这 6 处预期。

### 10.3 P2：新模块零测试覆盖

- 本分支 `tests/` 108 个文件；P4 分支 143 个 → **缺 35 个测试文件**，含 `validity.test.mjs`、`preference-classify/merge/inject/lifecycle/evolution/second-round/round3`、`session-index.test.mjs`、`time-anchor.test.mjs`、`schema-migration-atomic.test.mjs`、`p4-*`、`asof-graph-uncertain` 等。
- 结果：`validity.js` / `classify.js` / `merge.js` / `retry.js` / `session-index.js` / `preference.js` 在本分支**没有测试**；weekly 测试仍是 3 个旧用例（无 CAS/rollback/validity 覆盖）。

### 10.4 迁移测试（临时库，全部实测）

| 场景 | 结果 |
|---|---|
| 全新库初始化 | version=4、valid_from 在、`idx_mem_valid`/`idx_mem_scope_key` 建好 |
| 真实 v3 schema 升级 | version→4；`scope_type/updated_at/revision` 回填正确 |
| 有效性列缺失（从 v4 drop 后重开） | 4 列全部补回、索引重建 |
| 索引缺失 | `idx_mem_valid`、`idx_mem_scope_key` 重建 |
| 重复启动 | 幂等，version=4 |
| schema 版本高于代码（5>4） | 抛 `E_SCHEMA_NEWER_THAN_CODE`，version 保持 5，无结构损伤 |
| 迁移中途结构错误（memory_revisions 缺 invalidation，且先 drop 有效性列） | 抛 `E_SCHEMA_MIGRATION_INCOMPLETE`；**version 保持 3、valid_from 未残留、索引未残留** → 事务回滚成立 |
| 非法版本值（`abc`） | 抛 `E_SCHEMA_VERSION_INVALID` |

补充：main 的 v3 DDL 已含 validity 列，所以「补列」路径需用「drop 后再开」验证（已覆盖）。

### 10.5 负向对照（直接探针，非仓库测试）

| # | 变异 | 结果 |
|---|---|---|
| N1 | current 仅按 status | 断言 `future valid_from must be excluded` 失败 |
| N2 | 去 valid_from | 同上失败 |
| N3 | 去 valid_to | `expired valid_to must be excluded` 失败 |
| N4 | 去 superseded | `superseded must be excluded` 失败 |
| N5 | asOfHistory 误排除 superseded | `as-of history must keep superseded with valid_to` 失败 |
| N8 | 迁移失败仍升级 schema_version | `failed migration must not bump schema_version (got 4)` 失败 |
| N6 | merge 不用事务 | **NOT RUN**：本分支无 merge 测试；无回滚断言可依 |
| N7 | weekly CAS 前不重读 | **NOT RUN**：本分支 weekly 仅 3 个旧用例，无 CAS/rollback 测试 |
| N9 | 非 owner 注入主人偏好 | **NOT RUN**：index.js 受 P0 阻塞；代码审查显示 `ownerSession` 守卫存在 |

### 10.6 代码接口核查（静态）

- 所有相对 import 可解析，唯一例外 `lib/time/anchor.js`（P0）。
- `validity.js` 导出 `validitySql/isValidAt/resolveSourceTs/VALIDITY_PRESETS`，调用方（p4/session-index/daily/weekly/handoff/preference/remembered）用法一致；`resolveSourceTs(undefined)` 取 now、非法值返回 `E_BAD_SOURCE_TS`（实测）。
- `retry.js` 依赖的 `updateMemory(db,id,patch,expectedRevision,{now,invalidation})` 与 `withP4WriteQueue(fn)` 均存在且签名兼容。
- `index.js`：preference 注入按 sid 去重（`preferenceDone`）；session-index 在 `hitsInjectEnabled` 之前执行并独立判定；所有提前返回路径用 `withSessionIndex` 带上已生成块；`dispose` 清理 `preferenceRetryTimer`。
- `SCHEMA_VERSION=4` 与迁移逻辑一致；版本校验在结构检查前，版本写入在结构检查后、事务内。

### 10.7 边界

- 只读验证；未改分支代码、未提交/推送；未连生产库（全部临时目录 + 独立 `DY_MEMORY_DIR`）；未启动插件、未重启、未改 profile/config；未改共享 HANDOFF/REPORT。
- **临时库迁移验证**：已完成（见 10.4）。**真实生产库迁移验证：NOT RUN**。


---

## 11. 双任务复验（2026-11-21 19:3x）

### 11.1 任务 A：`feat/memory-validity-minimal-integration` @ `a9ad91cf9f5099bbfa1e0da9a6cdecb8f1d4f9ff`

- compare vs main `752cd08`：ahead **37** / behind 0；33 文件（15 源码 + 18 测试）。
- P0 已修：`lib/time/anchor.js` 已在（blob `94c8d44a…`），接口与 daily.js 匹配；全库相对 import 扫描无缺失。
- P1 已修：此前 6 个失败测试现全过。
- 全量：**181 tests / 177 pass / 4 fail / 0 skip，exit 1**。
- 4 项失败（须 GPT 修）：
  1. `tests/validity.test.mjs:28` 预设枚举仍为 4 个，实际 7 个（stale）。
  2. `tests/preference-round3.test.mjs:10`：`lib/inject/hits.js` 缺 `filterPersistentPreferenceHits`（P4 分支有；本分支 `index.js` 也未做 preference 命中过滤 → M1 功能缺口）。
  3. `tests/preference-lifecycle.test.mjs:10`：`lib/clarity.js` 缺长期偏好豁免（`persist=true && long_term → vivid`）→ 长期偏好会被衰减 forget。
  4. `tests/schema-migration-atomic.test.mjs`：缺 `tests/fixtures/schema-v4-ddl.mjs`。
- 仍缺 26 个测试文件（asof-graph-uncertain、event-chain、hits-noise/query、graph-scope-isolation、pending-audit、conflict-resolve-closure、rules-* 等）。
- 迁移 8 场景在本 HEAD 全部 PASS（含 S7 回滚：version 保持 3、无半迁移残留）。
- 负向：N1–N8 PASS；N9（非 owner 注入）无观测差异（守卫存在但现有测试不覆盖）。
- 结论：**BLOCKED**。

### 11.2 任务 B：`feat/memory-wake-capture` @ `0fdae98860be9fb71f74081c1cf79fa963227ae2`

- compare vs main：6 文件（`lib/index.js`、`lib/ingest/archive.js`、`lib/ingest/wake.js`(新)、`lib/store/schema.js`、`tests/archive.test.mjs`、`tests/wake-capture.test.mjs`）。
- 全量：**143 tests / 143 pass / 0 fail / 0 skip，exit 0**；定向 8/8；`node --check` 三个文件 OK。
- 归档探针：wake/manual 入 raw 且 `extra.sourceKind` 正确；未授权来源被拒；普通 user 与图片行为不变。
- 回合胶水探针（6 例）：首条 user 判定、未知来源、非 owner、重复 turn/end、跨 session 全符合。
- schema 探针：partial unique index 在老库创建成功；重复 wake key 被 UNIQUE 拒绝。
- 负向 N1–N10 全部由断言失败捕获（来源白名单、首条限制、owner 门禁、sourceKey 幂等、向量去重、每日上限、串行化、sourceKind 持久化、self-thought 独立入库、摘要失败继续写）。
- 结论：**PASS（隔离代码验证）**。

生产库/真实设备/部署：**NOT RUN**。


---

## 12. `MEMORY-MINIMAL-INTEGRATION-REVERIFY-03`（HEAD `8d0f3adc48b1f30f213ad30c3f0330da54ef1c83`）

- compare vs main `752cd08`：ahead **42** / behind 0；相对上一版 `a9ad91c` 仅 5 文件变更，与 GPT 声明一致。
- 5 项修复均在位：
  1. `lib/inject/hits.js` 新增 `filterPersistentPreferenceHits`（meta 对象/JSON 字符串均解析；非法 JSON 保留；只删 `kind='preference' && persist===true && persistence==='long_term'`）。
  2. `lib/index.js:1272` 在普通 recall 命中路径应用过滤；`dy-preference` 走自身 SQL，未受影响。
  3. `lib/clarity.js:29` 三条件豁免 → vivid；普通 preference 仍可衰减。
  4. `tests/validity.test.mjs:29` 断言 7 个预设。
  5. `tests/fixtures/schema-v4-ddl.mjs`（blob `7d879486…`）为冻结 DDL，不动态导入当前 schema。
- 全量：**194 tests / 190 pass / 4 fail / 0 skip，exit 1**。
- 4 项失败（GPT 新增测试断言了本分支没有的 v5/M1 诊断能力）：
  1. `preference-round3.test.mjs:205`：`dy_memory_auto_list` 未输出 `status/retryCount/lastError`（M1 诊断字段未集成）。
  2-4. `schema-migration-atomic.test.mjs:76/199/226`：断言 `SCHEMA_VERSION===5`、`episode_rewrite_snapshots` 表与 FTS5 回滚路径；本分支 `SCHEMA_VERSION=4` 且无该表。
- N9：owner 与主人私聊均挂 `dy-preference`；非 owner 会话 mount 被跳过（无任何注入）→ owner 门禁有效；hits 过滤在带 scope 的 recall 之后执行，不替代 scope 检查。
- 缺失测试 25 个：A（必须补）preference-second-round、pending-audit；B（相关可缓）asof-graph-uncertain、conflict-resolve-closure、event-chain、graph-scope-isolation、hits-noise、hits-query、archive-session-id-isolation、archive-tombstone-context；C（其他专题）eval-*、m3-2b-*、m3-ref-derived-sync、permanent-home-archive、raw-*、rules-*。
- 结论：**BLOCKED**。需 GPT 决定：v5 schema 是否纳入范围（否则改测试断言 v4）；`auto_list` 诊断是否补实现。


---

## 13. `MEM-CURRENT-HEAD-READONLY-01`（M1 主线复核，2026-11-22）

### 13.1 基线
- `feat/m1-preference-memory` HEAD **`7548e49ed0b8d8673818464325d8e72ec7704b27`**，tree `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f`；相对 main `752cd08` ahead **245** / behind 0。
- `feat/memory-validity-minimal-integration` HEAD `a63f994e…`（schema v4）；`feat/memory-wake-capture` HEAD `0fdae98…`（未并入 M1）。
- 仓库无 AGENTS.md；schema v5 新增 `episode_rewrite_snapshots` + `idx_ers_memory` + `rules` DDL；迁移在单事务内，先校验列/索引再写 version（`db.js:migrateSchema`）。

### 13.2 有效性规则逐入口（合成数据实测）
- **recall current**：`status='active'` + `valid_from IS NULL OR <=` + `valid_to >` → normal/unknown 进；future/expired/superseded 出（实测 [1,4]）。
- **recall asOf**：严格 `valid_from IS NOT NULL`（`TEMPORAL_VALID_SQL`）；NULL 起点行只进 uncertain（实测 ids=[]，uncertain=[1,3,4]）。
- **preference 注入**：`status='active'` + `valid_to>`，**无 valid_from 检查 → 未来生效的长期偏好被注入**（实测泄漏 `喜欢茶 future`）。
- **remembered**：`status='active'` + `valid_to>`，**无 valid_from 检查 → 未来 relation 泄漏**（实测）。
- **graph**：lenient 含 NULL 起点、strict 不含；future/expired/superseded 均排除（实测 strict=[]、lenient=[1]）。
- **全库无 `superseded_by` 谓词**：依赖 status 迁移，若历史数据存在 superseded_by 非空但 status='active' 的行会泄漏。

### 13.3 wake-capture 与 M1 兼容性
- M1 **完全未包含**：无 `lib/ingest/wake.js`、`archive.js:307` 直接丢弃非 user 来源、无 `sourceKind` 落 extra、schema 无 wake 唯一索引、index.js 无 wakeTurns。
- 重叠文件：`lib/index.js`、`lib/ingest/archive.js`、`lib/store/schema.js`；新增 `lib/ingest/wake.js` + 两个测试。
- 迁移风险：M1 schema v5，wake 的 partial unique index 需追加到 DDL 并考虑版本号；archive 需加来源白名单 + `sourceKind`；index 需在既有 `session/event` 钩子内加 turn 追踪。最小安全接入：4 处改动 + 2 个测试，不合并分支、cherry-pick。

### 13.4 Persona identity 边界（mock 实测）
- persona DB 不可用 → `selfId()` 返回 **`'self:unknown'`**（哨兵，truthy）。
- Memory `personaSelfId()` 视其为有效 → `addEpisode` **不抛 E_PERSONA_UNAVAILABLE**，写入 `speaker_id='self:unknown'`（实测）。
- persona 服务整体缺失 → 正确抛 `E_PERSONA_UNAVAILABLE`（实测）。
- fresh M1 库 `raw_meta` **无 speaker_id 列**（archive DDL/ALTER 均未加）→ `lib/selfid.js` 回填静默失效；老库有列时降级写入 `speaker_id='self:unknown'` 但 **不带 `extra.pendingIdentity`**。

### 13.5 测试
M1 HEAD 全新 worktree：`npm test` → **258 tests / 258 pass / 0 fail / 0 skip，exit 0**（Node v24.19.0 / npm 11.17.0，140 个测试文件）；`git diff --check` exit 0；仅 `?? node_modules`。

### 13.6 结论
`MEM-CURRENT-HEAD-READONLY-01`：**READY_FOR_REVIEW**。缺陷：有效性入口不一致（future preference/remembered 泄漏，无 superseded_by 谓词）、wake-capture 未集成、Persona selfId 哨兵可绕过 addEpisode 门禁、fresh 库 raw_meta 缺 speaker_id。生产/设备/部署均 NOT RUN。


---

## 14. `MEMORY-PERSONA-INTEGRATION-CONTRACT-01` v1.0 专项评审（2026-11-22）

### 14.1 基线
- Memory：`feat/m1-preference-memory` @ **`7548e49ed0b8d8673818464325d8e72ec7704b27`**（schema v5）。
- Persona：本地插件 `/root/.dsh/plugin-src/dsh-persona-core`（非 git 安装，schema v2，`SCHEMA_VERSION=2`）。
- 全部测试在 `/tmp` 临时库；未触碰生产 memory.db / persona.db。

### 14.2 逐条结论（Memory 侧）
- **2.1 主体分类**：部分符合。Memory 仅有 `speaker_id`（`self:*`/person id/空），无 third_party/unknown 分类字段 → 需新增 `subject_kind`。
- **2.2 self 身份**：**不符合**。persona 降级返回 `'self:unknown'` 被 Memory 当有效 → 写入 `speaker_id='self:unknown'`（实测）；非法 ID `'abc'` 被规范成 `'self:abc'` 写入（实测）；仅 persona 服务整体缺失时抛 `E_PERSONA_UNAVAILABLE`（实测）。
- **2.3 待确认数据**：本版本不要求队列，但必须先禁止 unknown 进 self episode（当前违反）。
- **2.4 speaker_id 存储**：**不符合**。fresh M1 库 `raw_meta` 无 `speaker_id`（DDL 与 ALTER 均未加），`lib/selfid.js` 回填 `try/catch` 静默返回 0 → 契约禁止的静默兼容。
- **3.1 三态**：无 VALID/INVALID/UNCERTAIN 抽象，各入口各自实现。
- **3.2 时间规则**：**不符合**。preference 与 remembered 无 `valid_from` 检查 → 未来生效记录被注入（实测 `PREF leaked future: true`、`REM leaked future: true`）；`valid_from:'abc'` 被 insertMemory 静默转成 NULL，当前召回将其视为有效（实测 `B_current` 含 badtime）。
- **3.3 NULL 语义**：**冲突**。current 召回把 NULL 当"无下限"（有效），asOf 严格路径把 NULL 行排除并归入 uncertain；schema 无法区分 legacy 与 unknown。
- **3.4 superseded**：**不符合**。所有查询仅用 `status`，不判 `superseded_by`（实测允许集中含 `superseded_by=999, status='active'` 的行）；历史 asOf 在替代发生前查询返回空（实测 `B9 ids: []`，期望含被替代行）→ 历史真相丢失；无 `superseded_at`，无法按替代生效时间判定。
- **3.5 入口清单**：recall current/asOf、preference、remembered、graph 候选、graph 最终、其他注入路径——矩阵见下。
- **4.1/4.2 置信度分类**：**不符合**。persona 无 `confidence_kind`/`confidence_source` 列；新 event/appraisal 默认 `confidence=0.5`（实测），无法区分 unknown/校准/历史。
- **4.3 emotion_event.confidence**：当前作为 `certainty` 输入（emotion.js:382），非人格硬门控；需在文档中明确"原始分数"定位。
- **4.4**：intensity/confidence/certainty 三字段分离，符合。
- **5 一致性**：persona `event`/`appraisal`/`episode` 无事务包裹；`applyCoreAppraisal` 的 timeline INSERT 使用 `session_key` 列而表是 `self_id` → **静默失败**（实测 0 行、无异常）；Memory `addEpisode` 先去重后写入，dedupeKey 幂等（实测 duplicate=true，1 行）。
- **6 测试矩阵**：见 14.3。
- **7 范围**：未触碰 EI-2A/生产迁移/部署/wake 合并。

### 14.3 测试矩阵实测
- 身份：A1 有效 self → `self:aaaa` ✅；A2 服务缺失 → `E_PERSONA_UNAVAILABLE` ✅；A3 `self:unknown` → 写入 ❌；A4 非法 `'abc'` → 写入 `self:abc` ❌。
- 时间：current 含 `normal/valid_from NULL/valid_to NULL/坏时间`，排除 future/expired/status=superseded；asOf 仅 1 行 + uncertain 5 行；superseded_by-only 行进入允许集；asOf 替代前为空 ❌。
- graph：lenient 只含 normal；strict 排除 NULL 起点。
- 置信度：event/appraisal 默认 0.5；无 kind/source 列；timeline 静默失败。
- 一致性：dedupe 幂等 ✅；persona 写入非原子（代码级）；timeline 字段不匹配（实测）。

### 14.4 通过标准评估（7 条）
1. 两专项负责人无冲突：**未达成**（需 Persona 侧签署，且当前存在字段冲突）；
2. 所有入口一致：**未达成**；
3. unknown 不写 self episode：**未达成**；
4. 新情绪不被默认标 legacy：**部分**（未标 legacy，但也未标 unknown，仍不满足 4.1）；
5. 历史替代可解释：**未达成**；
6. 准确 HEAD + 临时库测试：**达成**（本轮）；
7. 迁移/设备/生产独立授权：**达成**（均未执行）。

### 14.5 建议修正（Memory 侧提案，需 GPT/负责人裁决）
1. `memories` 增 `subject_kind`（self/owner/third_party/unknown），addEpisode 强制 self。
2. 增 `valid_from_kind`（exact/legacy/unknown）或 `meta.validity_origin`：新写入无 valid_from → unknown（UNCERTAIN）；迁移把旧行标 legacy（按无下限兼容）。
3. 增 `superseded_at`：current 用 `superseded_by` 为空；asOf 用 `superseded_at > asOf` 判历史有效；无法确定 → UNCERTAIN。
4. persona schema v3：`confidence_kind`/`confidence_source`，新数据默认 unknown；迁移显式标 legacy_unclassified/legacy_migration；`emotion_event.confidence` 文档化为原始分数。
5. persona `selfId()` 降级返回值与 Memory 门禁对齐（返回 `null`/抛错；Memory 拒绝 `self:unknown` 与非 `self:<uuid>` 格式）。
6. fresh 库 `raw_meta` 增 `speaker_id`（或明确 v6 迁移），回填失败必须显式报错。
7. persona 写入用单事务包裹 event/appraisal/episode，并修复 timeline 的 `session_key` → `self_id`。

### 14.6 结论
契约评审：**BLOCKED（未达 PASS）**。契约方向可接受，但实现层 2.2/3.2/3.3/3.4/4.1 不满足，需先按 14.5 修正再复审。


---

## 15. `MEMORY-CONTRACT-REVIEW-01` 设计审查（2026-11-22）

- 基线：`feat/m1-preference-memory` @ `7548e49ed0b8d8673818464325d8e72ec7704b27`（schema v5，ahead 245）。
- 结论：**READY_FOR_REVIEW**（设计审查，不是代码 PASS）。

### 15.1 契约兼容性矩阵
| 条款 | 与当前 M1 | 可否实现 |
|---|---|---|
| 2.1 主体分类 | 无 subject_kind；仅 speaker_id | 需新增列 + 问 Persona 第三方身份来源 |
| 2.2 self 身份 | addEpisode 接受 `self:unknown` 与非法格式 | 可实现（Memory 侧严格校验 + Persona 降级语义确认） |
| 2.3 pending | 未实现（契约允许） | 需 2.2 先禁止 unknown 写 self |
| 2.4 speaker_id | fresh raw_meta 无列；回填静默 | 可实现（补列 + 显式错误） |
| 3.1 三态 | 无抽象 | 可实现（单一 helper） |
| 3.2 时间 | preference/remembered 缺 valid_from；坏时间静默转 NULL | 可实现（helper + 写入校验） |
| 3.3 NULL | 入口互相矛盾，schema 不可区分 | **需新增 valid_from_kind** |
| 3.4 superseded | 只判 status；无 superseded_at；历史 asOf 丢行 | **需新增 superseded_at**；无时间戳的历史路径只能 UNCERTAIN |
| 4.1/4.2 置信度 | persona 无 kind/source 列，新数据默认 0.5 | 需 Persona v3 |
| 5 一致性 | persona 非原子；timeline 列名错 | Persona 侧修复 |

### 15.2 最小设计（Memory）
1. schema v6：`valid_from_kind`（exact/legacy/unknown）、`superseded_at`、`subject_kind`、`idx_mem_superseded` partial index；迁移在既有事务内回填：exact = valid_from 非空；legacy = 迁移时 valid_from 为空；superseded_at = COALESCE(valid_to,0)（无 valid_to 的旧 superseded 行保持 0 → UNCERTAIN）。
2. `lib/store/validity.js`：`validityState(row, at, {mode, supersede})` → VALID/INVALID/UNCERTAIN；SQL 预设由同一 spec 生成。
3. 入口：recall current/asOf、preference、remembered、graph、session-index、handoff、daily、weekly 全部改用 helper；UNCERTAIN 仅 recall asOf 进 uncertain 通道，其余入口排除并计数。
4. supersede 写入点统一写 `superseded_at=now`（weekly 两条路径、pref/merge、conflict/resolve、rules）。
5. insertMemory 校验 validFrom/validTo：非有限正整数 → 抛 `E_BAD_VALIDITY_TIME`，不再静默 NULL。
6. 身份：Memory 侧拒绝 `self:unknown`/空/非 `self:` 前缀，抛 `E_PERSONA_IDENTITY_UNKNOWN`；fresh raw_meta 补 speaker_id；selfid 回填失败显式报错。

### 15.3 wake-capture 结论
**建议等契约落地后再接入**：wake episode 需要 subject_kind=self、valid_from_kind=exact、superseded_at=0，且注入走统一 helper；否则会引入第三套语义。

### 15.4 影响面
Memory 15 个文件 + 6 组测试；Persona 4 个文件（selfId 语义、confidence 列、timeline、事务）。详见 §14.5 与提示词 24。

### 15.5 需 Persona 确认
selfId 降级返回值与格式保证；subject_kind 第三方身份来源；confidence_kind/source 枚举与迁移标记；timeline/原子写修复归属。
