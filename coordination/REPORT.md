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
