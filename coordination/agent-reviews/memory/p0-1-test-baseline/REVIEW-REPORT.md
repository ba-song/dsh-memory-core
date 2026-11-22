# P0-1 Memory Core 测试基线修复 · 报告

- 任务：P0-1 Memory Core 测试基线修复（仅测试文件）
- 时间：2026-11-22 23:1x–23:4x (Asia/Shanghai)
- 性质：开发分支内有限测试修复；未改生产行为/Schema/DB/配置；未合并/部署/重启。
- 结论：**PASS（137/137、0 fail、0 skip、exit 0）**

## 1. 基线核对

| 项 | 值 |
|---|---|
| 仓库/分支 | `ba-song/dsh-memory-core` / `fix/p0-1-cross-conversation-memory-outputs` |
| 任务目标 HEAD（修复前） | **`4bcfc1d4e2544d643ae689e7fcc62f1ad786ef20`**（与任务指定一致） |
| 修复后 HEAD | **`16020381656986e0cea585928e7009ef5341b70d`**（仅 test 提交） |
| tree（修复后） | `288fa31d5bee109ccc3bd1f152303b97e7e1b671` |
| 与目标差异 | 仅 `tests/pins.test.mjs`（72+/12-）；无生产代码变更 |
| 环境 | Node v24.19.0 / npm 11.17.0；临时 worktree `/tmp/p0-1-verify` |
| 依赖 | `npm ci` exit 0（onnxruntime postinstall allow-scripts 警告，不阻断） |

## 2. 修改内容

**唯一修改文件**：`tests/pins.test.mjs`

将 2 个旧断言（要求 handoff 输出 `【话头】`、`标签：`）改为验证 P0-1 的安全契约，并新增 1 个 recent 契约测试：

1. **pins CRUD 与 handoff 隔离**：
   - pins 的 add/done/drop/list/render 仍正常（`renderPins` 含 `【话头】`）；
   - `handoffBrief` 空 recent → `text=''`，不出现 `【话头】`；
   - 有 recent → 只含调用方传入消息，仍不含 pins。
2. **Owner 全局信息隔离**：
   - 插入 preference/todo + project/decision；
   - 空 recent → `text=''`，`sections` 的 project/decisions/todos 为空；
   - 有 recent → 不含 `【话头】`/`标签：`/`项目：`/`决策：`/`待办：`/preference/todo/decision 文本；sections 仍为空。
3. **recent 明确传入消息仍按契约处理**：
   - 未回 → `最后没回：…`；
   - 已回 → 不含 `最后没回`，含 `最近话题`；
   - `maxChars` 截断；
   - 仅 assistant → 空。

未恢复任何旧注入行为；未改 `handoffBrief`、`carryover`、`publicBrief`、digest 生产逻辑、Schema、DB。

## 3. 命令与结果

| 命令 | 目录 | 结果 |
|---|---|---|
| `npm ci` | `/tmp/p0-1-verify` | exit 0 |
| `node --test tests/pins.test.mjs` | 同上 | 3/3 pass，exit 0 |
| `npm test` | 同上 | **137 tests / 137 pass / 0 fail / 0 skip，exit 0** |

完整日志：`/tmp/p0-1-test-baseline-full.log`（本机临时；关键输出见下）。

关键输出：
```
ℹ tests 137
ℹ pass 137
ℹ fail 0
ℹ skipped 0
EXIT=0
```

测试数从 136 变为 137：原 2 个旧测试被改写，另新增 1 个 recent 契约测试。

## 4. Commit

| 项 | 值 |
|---|---|
| 修复 commit | `16020381656986e0cea585928e7009ef5341b70d` |
| 分支 | `fix/p0-1-cross-conversation-memory-outputs` |
| 变更 | `tests/pins.test.mjs` only（72 insertions, 12 deletions） |
| 生产代码 diff | 无 |
| 合并/部署/重启 | 未执行 |

## 5. 验收对照

| 验收项 | 结果 |
|---|---|
| 目标分支全量 `npm test` 通过、exit 0 | **PASS**（137/137，exit 0） |
| 报告测试总数/通过/失败/跳过 | **137 / 137 / 0 / 0** |
| 实际命令、环境、日志位置 | 见 §1/§3（日志 `/tmp/p0-1-test-baseline-full.log`） |
| 修改文件、commit、变更摘要 | 见 §2/§4 |
| 未通过恢复旧风险实现 | 是：未改生产代码，测试改为验证 fail-closed；`handoffBrief` 仍不读 pins/owner 全局信息 |
| 报告路径 | `coordination/agent-reviews/memory/p0-1-test-baseline/REVIEW-REPORT.md` |

## 6. 边界与 NOT RUN

- 未修改生产行为、Schema、DB、配置；未合并、部署、重启；未操作真实渠道。
- 未执行生产 DB、设备、Memory v6/Persona v3/EI-2A、迁移。
- 报告 commit（本文件）见下。

## 7. 状态

**PASS**（测试基线修复完成，等待 GPT 复核）。
