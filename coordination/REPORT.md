# REPORT-0013 · EI-1 第三轮复验 + 记忆冲突误判记录
## 2026-11-21 00:45 · DSHA 隔离 worktree · HANDOFF-0056

> Persona 分支 `feat/ei1-emotion-composition` @ `92a763bfc096c490ba65878f7593961f982ea20a`
> 基线 `a84c7ba...`；main 未变；工作树 `/tmp/ei1c`，不是生产目录。
> 只读/隔离测试；未改源码/DB/profile；未启动 staging/host；未部署/重启。

## 1. EI-1 版本与文件

- HEAD：`92a763bfc096c490ba65878f7593961f982ea20a`
- diff vs baseline：仅新增 `lib/emotion-compose.js`、`tests/emotion-compose.test.mjs`
- Git blob：
  - source `4f460b2b10f0dea87cffaf550d2fbe66dde591c0`（与任务一致）
  - tests `9f813b973546d41fe933b75b1f18178b2e8418a4`（与任务一致）
- SHA256：
  - source `44828deb5303257b0233d5d93f62afc5af093d71c948cff90690f940410ab20d`
  - tests `9abd115a9304b6adc482b0069ce502da873993cd72475be125e339a26e3467c1`

## 2. EI-1 测试

### 新增
命令：`node --test tests/emotion-compose.test.mjs`
日志：`/tmp/ei1c-compose.log`
```
tests 14 / pass 14 / fail 0 / skipped 0 / exit 0
```

### 全量
命令：`npm test`
日志：`/tmp/ei1c-full.log`
```
tests 317 / pass 317 / fail 0 / skipped 0 / exit 0
```

## 3. confidence 修复复核

`lib/emotion-compose.js:16-28`：
```js
if (!finite(confidence)) return 'unknown'
const numericConfidence = Number(confidence)
if (numericConfidence < 0 || numericConfidence > 1) return 'unknown'
const value = numericConfidence
```
- `-0.1/1.1/NaN/Infinity/-Infinity` → unknown；
- `0` → uncertain；`1` → active_candidate；
- 不再先 clamp 后分类；
- `normalizeEpisode` 仍把越界 confidence 转 null，未被破坏。

**PASS。**

## 4. 旧问题回归检查

- sourceIds：仍收集 `id/episodeId/appraisalId/appraisal_id/sourceIds[]`，去重 codepoint 排序；测试覆盖双 ID 混合。
- codepoint 排序：`compareCodepoint` 仍用于 sourceIds/target/emotion/experiencer/cause；无 `localeCompare`。
- 异常输入：null/缺字段/NaN/Infinity/expiry/intensity 越界/未来时间测试通过。
- legacy/displayLimit/allEmotions：测试通过。
- 架构边界：仅两个新文件；未改 composeEmotionView/activeEpisodes/appraisal/db/service/注入；未改 345 条生产 episode。

## 5. 结论

**EI-1 IMPLEMENTATION REVIEW PASS（纯函数层）。**

只代表纯函数层通过；不代表 EI-2/EI-3/生产集成通过。

## 6. 记忆冲突误判（并行问题，未修数据）

用户报告“记忆冲突又误判了”。只读核对：

- pending 冲突 #8：memory_a=185、memory_b=355，原因 `sim=0.677 opposition`。
- #185：`status=active`，但 `superseded_by=320`、`valid_to` 有值、meta `supersedeReason=duplicate-of-320`；数据状态不一致。
- #355：`主人喜欢带有语气词的句子`；#185：`主人希望汐说话带语气词、活泼些，不要冷冰冰的`。
- `lib/ingest/p4.js` 邻居查询只取 `id,text,kind`，未过滤 `status/superseded_by/valid_to`；向量表也包含旧记录，所以拿 #355 与已废弃的 #185 比较。
- `lib/ingest/conflict.js` 按整段文本取极性；“不要冷冰冰”被当成负极性，和“喜欢语气词”共享“语气词” → 误判 opposition。

负责人决定：**先修代码，数据后修**。
- 代码（GPT）：P4 邻居/向量只考虑 active + 未 superseded + valid_to 为空；冲突极性按分句/同一对象判定；补回归测试。
- 数据（后修，需负责人单独授权）：#185 状态与 superseded_by 一致；#8 置 resolved/stale；#355 与 #320 合并/处理。
- 本轮未写生产 DB/冲突队列。

## 7. 状态
| 项 | 状态 |
|---|---|
| EI-1 目标 commit/blob | PASS |
| 新增 14/14 | PASS |
| 全量 317/317 | PASS |
| confidence 边界 | PASS |
| sourceIds/codepoint/异常输入 | PASS |
| 架构边界 | PASS |
| 记忆冲突 #8 误判 | 已确认，代码待 GPT 修；数据未修 |
| EI-2/EI-3/生产 | NOT RUN/禁止 |

## 8. 副作用
只读/隔离 worktree；未改生产源码/DB/profile；未启动 staging/host；未部署/重启。


---

# REPORT-0014 · Memory P4 邻居过滤与语义冲突误判修复

## 2026-11-21 · GPT 开发分支修改 · 等待 DSH 隔离验证

## 1. 背景与决策

依据 HANDOFF-0056 / REPORT-0013：
- pending #8：memory_a=185、memory_b=355，原因 `sim=0.677 opposition`。
- #185 数据显示 `status=active`，但 `superseded_by=320`、`valid_to` 有值；向量仍存在。
- #355：“主人喜欢带有语气词的句子”。
- #185：“主人希望汐说话带语气词、活泼些，不要冷冰冰”。
- 旧 P4 从传入 vectors 直接 bestMatch，neighbor 查询只取 id/text/kind；旧 conflict 极性按整段判断，容易把不同语义对象的正负词拼接。

负责人明确决策：**先修代码，数据后修**。

## 2. 实施

开发分支：`fix/p4-active-neighbors-semantic-opposition`，基于 `feat/m1-preference-memory`。

### 2.1 P4 active neighbor filtering

在向量 bestMatch 前，查询 memories 的有效 ID：
- `status='active'`
- `superseded_by IS NULL OR superseded_by=0 OR superseded_by=''`
- `valid_to IS NULL`

仅用有效 ID 过滤传入 vectors Map，再执行 bestMatch。选出 best 后，最终 neighbor SQL 再次施加相同条件，避免过期/被 supersede 的记忆参与冲突判断。向量表/历史数据本身未删除或改写。

### 2.2 Clause-scoped opposition

`hasOpposition` 改为成对比较分句：
- 两边分句必须有明确相反极性；
- 必须共享至少一个非停用主题字；
- ANTONYMS 词对必须在同一对共享主题的分句内出现；
- “不要冷冰冰”不能单独与“喜欢语气词”拼接成反义。
保留主题匹配要求，避免只因“喜欢/讨厌”等泛词判冲突。

### 2.3 Regression tests

在 `tests/p4.test.mjs` 新增：
- 已 supersede 且仍 status=active、仍有最高相似度向量的旧记录，不得成为邻居；应选中有效 active 记录。
- “主人喜欢带有语气词的句子” + “主人希望汐说话带语气词，活泼些，不要冷冰冰”不判 opposition。
- 对上述文本在相似度 0.95 时，`decideConflict` 应返回 merge。
既有喜欢海/讨厌海、爱吃辣/讨厌吃辣等正向冲突测试仍保留。

## 3. GitHub 文件核验

| 文件 | Blob SHA |
|---|---|
| `lib/ingest/p4.js` | `e05b9c30b31d9e8546d67eb256ebdfdbea6bfdb8` |
| `lib/ingest/conflict.js` | `cb960430d163d1c40be60a778162af19b5904ce4` |
| `tests/p4.test.mjs` | `4ed68ce0de11a7c3b89de21a6c723c6421ef4100` |

最新 commit：`d9d50ac087e40cef0de03f96e2a05248cfe4e5e2`。GPT 已重新 fetch 文件并核对 blob SHA。

## 4. 验证状态

- GPT 未运行 Node 测试。
- P4 定向测试：NOT RUN。
- conflict 定向测试：NOT RUN。
- Memory 全量测试：NOT RUN。
- DSH 隔离 worktree 复验：待执行。
- 生产 DB/冲突队列/记忆状态：未改。
- staging/host、部署、重启：NOT RUN。

当前代码状态：**已提交开发分支，等待 DSH 验证；不得标记修复 PASS。**

## 5. 数据后修门禁

只有代码验证通过后，才由负责人单独授权处理：
- #185：修正 active 与 superseded_by/valid_to 不一致；
- #8：根据真实证据决定 resolved/stale，不自动清理；
- #355 与 #320：核对后合并/处理。

本轮不执行任何数据修复，不更新生产向量，不改生产冲突队列。
