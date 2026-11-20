# REPORT-0009 · EI-1 纯函数首轮实测与复核
## 2026-11-21 00:10 · DSHA 本地隔离 · HANDOFF-0052

> 目标：persona `feat/ei1-emotion-composition` @ `5813a769974972a112d3dd8df5f32773746f01e0`
> 基线：`a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；main 未变。
> 工作树：`/tmp/ei1`（独立 worktree，不是生产目录）。
> 本轮未改源码/DB/profile；未启动 staging/host；未部署/重启。

## 1. 版本与文件

- HEAD：`5813a769974972a112d3dd8df5f32773746f01e0`（worktree detached）
- `git diff --name-status a84c7ba..HEAD`：
  - `A lib/emotion-compose.js`
  - `A tests/emotion-compose.test.mjs`
- SHA256：
  - `lib/emotion-compose.js`：`0b79f4d03f59253e164665670271735cb1196822a65654707f740d006e581db8`
  - `tests/emotion-compose.test.mjs`：`68ee79987c15391ca656b253c679dcbff4a440d4a9f507038322524ff1a0503c`
- main `a84c7ba` 未改；生产目录未复制。

## 2. 测试结果

### 新增测试
命令：`node --test tests/emotion-compose.test.mjs`
日志：`/tmp/ei1-compose.log`
```
tests 8 / pass 8 / fail 0 / skipped 0 / exit 0
```
覆盖：confidence 分类、同 label/target 取最大衰减强度、不同 target 隔离、正负并存、过期/低强度不删除源、legacy 兼容、确定性排序/分页、非数组/displayLimit 错误。

### 全量
命令：`npm test`
日志：`/tmp/ei1-full.log`
```
tests 311 / pass 311 / fail 0 / skipped 0 / exit 0
```

**结论：现有测试全绿；但测试未覆盖下列关键边界，不能据此判实现完全正确。**

## 3. 代码复核

### PASS
- 纯函数、无 I/O、无 DB、无全局状态；只导出 `classifyEmotionConfidence` / `composeEmotionEpisodes`。
- 同 `(experiencer,target,emotion)` 合并；强度取衰减后最大值；不求和；正负不抵消。
- 不同 target 不合并；排序有 intensity/confidence/at/target/emotion/experiencer tie-break。
- 过期/低于 minIntensity 直接 omit，不修改输入；测试用 structuredClone 验证。
- `confidence` 缺失为 null/unknown，不当 1.0；`legacy/isLegacy` 才绕过新阈值。
- displayLimit 只限制 `emotions`；`allEmotions` 保留完整；`total/hasMore` 正确。
- 未来 `at` 用 `Math.max(0, now-at)`，不会产生 >1 衰减；异常输入多数返回 null 而非污染。

### 问题（按严重度）

#### P1 · sourceIds 丢失 appraisalId
`lib/emotion-compose.js:61-63`：
```js
episodeId: episode.id ?? episode.episodeId ?? null,
appraisalId: episode.appraisalId ?? episode.appraisal_id ?? null,
sourceIds: [episode.id ?? episode.episodeId ?? episode.appraisalId ?? episode.appraisal_id ?? null].filter(...)
```
当 episode 同时有 `id` 和 `appraisal_id`（现有 `emotion_episodes` 正是如此）时，`sourceIds` 只保留 id，**丢失 appraisal_id**。契约要求 source 完整保留；这会削弱 why/追溯。
最小修复：分别收集 id、episodeId、appraisalId、appraisal_id（若提供 sourceIds 数组也合并），去重排序；补测试同时含 id+appraisal_id。

#### P2 · `localeCompare` 的跨环境确定性
`:107/108/113/121-123` 使用 `localeCompare`；结果依赖 ICU/locale，DSHA 与 GitHub runner 可能不同。要求“输入顺序变化输出确定”在单环境成立，但跨环境不保证。
最小修复：用 codepoint 比较（`a < b ? -1 : a > b ? 1 : 0`）替代 `localeCompare`；测试加多 source/同分 tie。

#### P2 · 坏数据边界测试不足
当前 8 个测试没有覆盖：
- `null` episode、缺 emotion/target/half_life_s；
- NaN/Infinity intensity/confidence/expires_at；
- intensity >1 或 <0（当前 >1 被 clamp01 静默压到 1）；
- confidence 缺失 + legacy/isLegacy 两种拼写；
- 未来时间戳；
- sourceIds 同时有 id/appraisalId；
- displayLimit 非整数/过大。
要求“坏数据不污染”不等于“静默 clamp”；建议对明显越界值返回 null 或明确 validation error，并补测试。

#### P3 · `expires_at` 非有限值被忽略
`:39` 只有 `Number.isFinite(expiresAt)` 才检查过期；`Infinity/NaN` 会被当作不过期。若上游坏数据，可能让 episode 永久 active。建议：显式处理非有限 expiresAt（拒绝或记录 unknown），补测试。

#### P3 · legacy 兼容仅纯函数层
实际旧 345 条 episode 没有 `legacy` 标记；纯函数按契约要求显式标记才保留旧规则，正确；但 EI-1 接入旧数据时必须先做迁移/适配，否则旧数据全被新阈值过滤。这是 EI-2/EI-3 的前置，不是纯函数 bug。

## 4. 架构边界
- `git diff` 仅新增两个文件；未修改 `composeEmotionView`、`activeEpisodes`、`appraisal.js`、`db.js`、`service.js`、注入逻辑；
- 未新增表/迁移/生产 API；未改变 345 条 episode 状态；
- 生产目录未使用。

## 5. 结论

**EI-1 IMPLEMENTATION REVIEW BLOCKED。**

原因：`sourceIds` 在真实 episode 形状（id + appraisal_id）下会丢失 appraisalId，违反契约的 source 完整保留；另有跨环境排序确定性和边界测试缺口。实现主体正确、测试全绿，但不能在第一轮判定 PASS。

最小修复：
1. `sourceIds` 同时保留 id/episodeId/appraisalId/appraisal_id；
2. 用 codepoint 比较替代 `localeCompare`；
3. 补异常输入/sourceIds/未来时间/越界测试；
4. 明确非有限 expires_at 处理。
修复后 DSH 复跑新增测试 + 全量 311。

## 6. 状态
| 项 | 状态 |
|---|---|
| 目标 commit/工作树 | PASS |
| 新增测试 8/8 | PASS |
| 全量 311/311 | PASS |
| 多情绪合成/合并/隔离 | PASS |
| 衰减/过期/不修改源 | PASS |
| legacy/confidence | PASS（纯函数） |
| sourceIds 完整性 | **FAIL/P1** |
| 跨环境确定性 | **风险/P2** |
| 异常输入覆盖 | 不足/P2 |
| 非有限 expires_at | 风险/P3 |
| EI-2/EI-3 接入 | NOT RUN |
| 生产写入/部署 | NOT RUN/禁止 |

## 7. 副作用
只读/隔离工作树；未改生产源码/DB/profile；未启动 staging/host；未部署/重启。
