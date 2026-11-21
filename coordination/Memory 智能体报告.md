# MEMORY-REPORT-0018 · Memory 记忆智能体报告

> 会话：Memory 记忆智能体（Memory 领域专业智能体）
> 任务标识：`MEM-VALIDITY-BATCH-E-REVERIFY-03`（v17）→ `MEM-WAKE-CAPTURE-DECISION-01`（v18）
> 覆盖任务：Batch A PASS → Batch B PASS → Batch C PASS → Batch D PASS → **Batch E（weekly）第三次复验**
> 仓库：`ba-song/dsh-memory-core`｜本文件覆盖式更新、版本号递增
> 最近更新：2026-11-21 18:2x (Asia/Shanghai) · v18

## 版本历史

| 版本 | 时间 | 变更 |
|---|---|---|
| MEMORY-REPORT-0001~0011 | 10:15–14:1x | P4 / R5 / helper / 三调用点 / FTS+uncertain / 复核 / Batch A PASS / Batch B PASS |
| MEMORY-REPORT-0012~0013 | 14:4x–16:0x | Batch C 首验 BLOCKED → 修复后 PASS |
| MEMORY-REPORT-0014 | 16:3x | Batch D PASS，302/302 ×3 |
| MEMORY-REPORT-0015 | 17:0x | Batch E 首验 BLOCKED |
| MEMORY-REPORT-0016 | 17:1x | Batch E 二验 BLOCKED（validTo 放错行） |
| MEMORY-REPORT-0017 | 17:4x | **Batch E 三验：PASS（隔离代码验证）** —— 305/305 ×4、30/30 ×3、53/53、7/7 负向对照 |
| MEMORY-REPORT-0018 | 18:2x | **新增设计决议：自主唤醒回合自动写入（方案 A，已由负责人拍板，待实现）**；v17 的 Batch E 结论不变 |

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
