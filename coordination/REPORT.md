# REPORT-0011 · EI-1 修复后第二轮复验
## 2026-11-21 00:35 · DSHA 隔离 worktree · HANDOFF-0054

> Persona 分支 `feat/ei1-emotion-composition` @ `ad809910801983be61165ff037a2e138676854aa`
> 基线 `a84c7ba...`；main 未变。工作树 `/tmp/ei1b`，非生产目录。
> 未改源码/DB/profile；未启动 staging/host；未部署/重启。

## 1. 版本与文件

- HEAD：`ad809910801983be61165ff037a2e138676854aa`
- diff vs baseline：仅新增 `lib/emotion-compose.js`、`tests/emotion-compose.test.mjs`
- Git blob：
  - source `547ff177a02bd80152ccb3914d54f287f775befa`（与任务一致）
  - tests `a92aacf1e04bcb5852eb7308ce3d0a7a2892580b`（与任务一致）
- SHA256：
  - source `6d5dece865d8977dace322b07f6293e2752cfb194f7c82cc5c1755baaaea90db`
  - tests `0f690563c1f668d9f23d806cdb72ec2868e49d40eee617736406b13221a6d351`

## 2. 测试结果

### 新增测试
命令：`node --test tests/emotion-compose.test.mjs`
日志：`/tmp/ei1b-compose.log`
```
tests 14 / pass 13 / fail 1 / skipped 0 / exit 1
```
唯一失败：
```
✖ confidence outside [0,1] is unknown and cannot activate a new episode
AssertionError: expected 'uncertain' to equal 'unknown'
at tests/emotion-compose.test.mjs:112
```
实际值 `classifyEmotionConfidence(-0.1)` 返回 **uncertain**，期望 **unknown**。

### 全量
命令：`npm test`
日志：`/tmp/ei1b-full.log`
```
tests 317 / pass 316 / fail 1 / skipped 0 / exit 1
```
失败同上，不是偶发。

## 3. 失败原因

`lib/emotion-compose.js:16-24`：
```js
const value = clamp01(confidence)
if (value >= activeMin) return 'active_candidate'
...
```
`clamp01(-0.1)` → 0 → `uncertain`；`clamp01(1.1)` → 1 → `active_candidate`。  
但契约要求 **confidence outside [0,1] = unknown**；直接 API 违反。

最小修复：在 clamp 前检查 `Number(confidence) < 0 || > 1` → `unknown`；或 `clamp01` 前拒绝。不要只靠 `normalizeEpisode` 把 null 过滤（直接 API 仍错）。
注意 `normalizeEpisode` 已把 out-of-range confidence 设为 null，因此 compose 的 total 0 断言通过；但 `classifyEmotionConfidence` 单独测试暴露了真实 API 缺陷。

## 4. 其他修复复核

- **sourceIds**：`normalizeEpisode` 现在收集 `id/episodeId/appraisalId/appraisal_id/sourceIds[]`，去重；新增测试覆盖 id+appraisalId 混合；通过。
- **codepoint 排序**：`compareCodepoint` 替代 `localeCompare`；sourceIds/target/emotion/experiencer/cause 均使用；新增非 ASCII/输入顺序测试通过。
- **异常数据**：新增测试覆盖 null/缺字段/NaN/Infinity/越界/未来时间/expires_at；通过（除 confidence 直接分类）。
- **过期/强度**：有 expiry 才检查；NaN/Infinity expiry 拒绝；intensity >1 拒绝；通过。
- **无副作用/边界**：仅两个文件；未改 composeEmotionView/activeEpisodes/appraisal/db/service/注入；未改 345 条生产 episode。
- **旧数据**：纯函数未读取/迁移生产 DB；未自动改 legacy；旧 345 条 grandfathering 仍需 EI-2/EI-3 设计。

## 5. 结论

**EI-1 IMPLEMENTATION REVIEW BLOCKED。**

原因：新增测试 1 项失败（confidence 越界直接分类错误），全量 316/317。修复 sourceIds/排序/异常边界的其余部分已通过。

最小修复：
1. `classifyEmotionConfidence` 对 `<0` 或 `>1` 返回 `unknown`；
2. 保留现有 `normalizeEpisode` 的 null 处理；
3. 补/保留 direct API 测试；
4. 修复后 DSH 复跑新增测试（14/14）+ 全量（317/317）。

## 6. 状态
| 项 | 状态 |
|---|---|
| 目标 commit/blob | PASS |
| 新增测试 13/14 | **FAIL**（confidence 越界） |
| 全量 316/317 | **FAIL**（同一项） |
| sourceIds 完整性 | PASS |
| codepoint 排序 | PASS（源码+测试） |
| 异常输入边界 | 部分 PASS；confidence 直接分类 FAIL |
| 架构边界/旧数据 | PASS（无生产改动） |
| EI-2/EI-3/生产 | NOT RUN/禁止 |

## 7. 副作用
只读/隔离 worktree；未改生产源码/DB/profile；未启动 staging/host；未部署/重启。
