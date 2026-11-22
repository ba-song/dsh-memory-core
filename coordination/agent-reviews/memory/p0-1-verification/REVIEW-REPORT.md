# P0-1 Memory Core 跨会话输出隔离 · 验证报告

- 任务：P0-1 Memory Core 跨会话输出隔离验证
- 时间：2026-11-22 22:5x–23:1x (Asia/Shanghai)
- 性质：只读验证（临时 worktree + 临时 DB）；未改代码/测试/schema/DB；未部署/重启；未合并 PR。
- 结论：**功能隔离项大部分 PASS；全量 `npm test` FAIL（2 项旧测试未更新）；整体 FAIL（分支未绿）**

## 1. 实际 HEAD 与环境

| 项 | 值 |
|---|---|
| 仓库/分支 | `ba-song/dsh-memory-core` / `fix/p0-1-cross-conversation-memory-outputs` |
| **实际 HEAD** | **`4bcfc1d4e2544d643ae689e7fcc62f1ad786ef20`**（与目标一致） |
| tree | `77487c2dccd8f68eb10fc8713c06d983f1e0e52f` |
| 相对 main | ahead 8 / behind 0（main `752cd08…`） |
| 工作区 | 独立 detached worktree `/tmp/p0-1-verify` |
| Node / npm | v24.19.0 / 11.17.0 |
| 依赖安装 | `npm ci` → exit 0；onnxruntime-node postinstall 被 allow-scripts 警告（未阻断，测试可加载） |

## 2. 命令与退出码

| 命令 | 目录 | 结果 |
|---|---|---|
| `npm ci` | `/tmp/p0-1-verify` | exit 0（有 allow-scripts 警告） |
| `npm test` | 同上 | **exit 1**：tests 136 / pass 134 / fail 2 / skipped 0 / cancelled 0 |
| `node --test tests/digest-once.test.mjs` | 同上 | exit 0：1/1 pass |
| `node --test tests/handoff-brief.test.mjs` | 同上 | exit 0：1/1 pass |
| `node --test tests/public-brief.test.mjs` | 同上 | exit 0：1/1 pass |

完整日志：`/tmp/p0-1-verify-full.log`（本机临时文件，摘要见下）。

## 3. 全量测试失败（2 项）

均在 `tests/pins.test.mjs`，为 P0-1 移除 handoff 旧行为后**未同步更新的旧断言**：

| 测试 | 失败断言 | 行号 | 原因 |
|---|---|---|---|
| 话头：add/done/去掉，最多 5 条进交接简报 | `brief.text.includes('【话头】')` | `tests/pins.test.mjs:21` | P0-1 后 `handoffBrief` 不再注入 pins（`lib/handoff/brief.js` 已移除 `renderPins`） |
| 交接简报带标签：记忆类型摘要 | `brief.text.includes('标签：')` | `tests/pins.test.mjs:31` | P0-1 后 `handoffBrief` 不再输出 owner 标签摘要 |

> 失败是“测试期望 vs 新行为”不一致，不是新代码回归；但分支当前全量测试为红，不能标 PASS。

## 4. 逐项验证

### 4.1 确认 HEAD 与目标 SHA —— **PASS**

`git rev-parse HEAD` = `4bcfc1d4e2544d643ae689e7fcc62f1ad786ef20`，与目标一致；worktree 干净（除 `node_modules`）。

### 4.2 依赖安装 —— **PASS（带警告）**

`npm ci` exit 0；`onnxruntime-node` postinstall 被 allow-scripts 拦截，但测试运行期间 onnxruntime 可加载（仅 GPU 设备发现告警）。

### 4.3 全量 `npm test` —— **FAIL**

136/134/2/0，exit 1；失败见 §3。

### 4.4 三个指定测试 —— **PASS**

`digest-once`、`handoff-brief`、`public-brief` 各 1/1 pass，exit 0。

### 4.5 跨渠道原始摘要自动注入是否停止 —— **PASS**

- `lib/index.js` 已删除 `buildDigest` 导入与 `dy-digest` 注册块（`git diff main..HEAD -- lib/index.js`：删除 23 行；现仅 `dy-memory-stable` 一个 `systemPrompt.context`，`lib/index.js:1112`）。
- `tests/digest-once.test.mjs` 断言同一/不同/异常 getter agent 均不注入 `dy-digest`，通过。
- 注意：`lib/inject/digest.js` 仍保留 `buildDigest` 导出（死代码，无 lib 调用；仅 `tests/digest-conflicts.test.mjs`、`tests/digest-shared.test.mjs` 直接测试函数）。若未来误接回注入会重新泄漏，建议后续删除或加禁用标记（本轮不改代码）。

### 4.6 空 `recent` 不回退 Owner 全局信息 —— **PASS**

`lib/handoff/brief.js` 现签名为 `handoffBrief(_db, { recent, maxChars })`，完全忽略 `db`/`isOwner`/`cwd`/项目/决策/todo/pins；`recent` 为空直接返回 `text: ''`（`brief.js` 新逻辑）。
`tests/handoff-brief.test.mjs` 断言空 recent 不出现项目/决策/待办/pins，通过。

### 4.7 `publicBrief` 无法验证授权时 fail-closed —— **PASS**

`lib/service.js` 中 `publicBrief` 已改为无条件 `return []`（注释：source/target/purpose/authorization 未可验证前 fail-closed）。
`tests/public-brief.test.mjs` 断言返回 `[]`，通过。

### 4.8 `carryoverFor` 读取范围 —— **PASS（自动注入）/ PARTIAL（服务 API）**

- `lib/inject/carryover.js:6-16`：SQL 严格 `WHERE cwd=? AND tombstone=0 AND role IN (...)`，并用 `file NOT LIKE %s-<sid>.md` 排除当前会话；读取范围限于同一 `cwd`。
- 自动注入路径 `lib/index.js:1106` 使用当前 session 的 `cwd` + `sid`，符合隔离。
- **风险**：`lib/service.js:673-680` 的 `carryover(input)` 授权只检查 header 为 owner，但 `cwd` 取自 `input.cwd`（调用方可传任意路径）→ owner 会话可通过服务 API 读取其他房间 raw。该路径不是自动注入，但属于“其他输出入口”的越权面，建议后续改为仅接受 header.cwd 或白名单校验（本轮只报告）。

### 4.9 其他可能绕过当前会话范围的输出入口 —— **PARTIAL**

| 入口 | 结论 | 证据 |
|---|---|---|
| `dy-memory-stable` 注入 | 通过 scope 决定；owner 事实卡/话头读当前 cwd，group 块按 `scope.groupId` 精确查 | `lib/index.js:1112`、`lib/inject/stable.js:154-210` |
| `renderPins` | 仅工具 `dy_memory_pin list` 返回，不自动注入；handoff 已移除 | `lib/index.js:442` |
| `handoffBrief` 服务 | 只接收调用方 `recent`，不读 db；无跨会话回退 | `lib/service.js:673-690`、`brief.js` |
| `publicBrief` | 已 `[]` fail-closed | `lib/service.js:529-533` |
| `carryover` 服务 | owner 可传任意 `cwd`（见 4.8） | `lib/service.js:673-680` |
| `recall` / `episodeRecent` / `shorttermRecent` | 按 scope 过滤；owner 可见 owner scope 长期记忆（非 raw 原文）；属长期记忆而非摘要注入 | `recall`/`episodeRecent`/`shorttermRecent` 代码 |
| `buildDigest` | 死代码，无 lib 调用；测试仍直接测函数 | `lib/inject/digest.js:12`；`grep` 无 lib 调用 |
| `shareNewMemory` | 写入/通知路径，不是当前会话注入 | 未在本次输出范围 |

## 5. 发现的问题与复现

1. **P1（测试红）**：全量测试 2 项失败（`tests/pins.test.mjs:21,31`），因 P0-1 移除 handoff 的 pins/标签但测试未更新。复现：`cd /tmp/p0-1-verify && npm test` → exit 1。修复建议（不由本任务实施）：更新 pins 测试为“handoff 不含 pins/标签”，或保留 pins 注入但明确 current 边界。
2. **P2（服务 API 越权面）**：`dyMemory.carryover({cwd})` 允许 owner 传任意 cwd 读取其他房间 raw。复现：owner header 调 `carryover({cwd:'/root/qq-agent/QQ会话/私聊_<other>'})` → 返回该房间 `【上次聊到】`。建议后续限制为 header.cwd 或白名单。
3. **P3（死代码）**：`buildDigest` 仍导出且测试仍测；无注入调用。建议后续删除或加 `@deprecated` 禁用标记，防误接回。
4. **P3（测试覆盖）**：未发现针对 `publicBrief` 授权失败、`handoffBrief` 空 recent、`digest` 不注入以外的正向隔离矩阵（如 `stable` group/owner、`shorttermRecent` scope）的新增测试；本任务只验证现有测试与代码，未新增。

## 6. 未执行 / NOT RUN

- 未运行生产 DB、真实 QQ/渠道、设备、部署、重启。
- 未合并 PR、未修改代码/测试/schema/DB。
- 未运行 Memory v6、Persona v3、EI-2A。
- 全量测试仅在本机临时 worktree 执行一次（Node v24.19.0）。

## 7. 结论

| 项 | 结果 |
|---|---|
| HEAD 一致 | PASS |
| 依赖安装 | PASS（警告） |
| 全量 npm test | **FAIL（134/136，2 fail，exit 1）** |
| 三个指定测试 | PASS（1/1 ×3） |
| digest 自动注入停止 | PASS |
| 空 recent 不回退 Owner 全局信息 | PASS |
| publicBrief fail-closed | PASS |
| carryoverFor 自动路径同 cwd | PASS |
| carryover 服务 API 任意 cwd | **PARTIAL（越权面）** |
| 其他输出入口 | PARTIAL（死代码/长期记忆/权限面） |
| **整体** | **FAIL（分支全量测试未绿；隔离目标项基本达成）** |
