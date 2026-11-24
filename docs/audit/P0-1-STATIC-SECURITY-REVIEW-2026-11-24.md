# DSHA「汐」P0-1 静态安全复核报告

- 日期：2026-11-24
- 仓库：`ba-song/dsh-memory-core`
- 复核基线：`fix/p0-1-trusted-handoff-continuity`，PR #3
- 本报告分支：`audit/p0-1-static-review-20261124`
- 基线提交：`6f20aaae024078653f7fde1dec20a7c1555d181e`
- 性质：GitHub 源码、测试与文档只读复核；未连接 DSHA、未访问设备或生产数据库、未改变运行时行为。

## 1. 结论摘要

**P0-1 仍不应合并或部署。** 当前实现已经为 handoff/carryover 服务增加 host-observed session 检查，并保持跨 Conversation 的 pins/projects/decisions/todos 与 `publicBrief` fail-closed；但原话归档直接工具 `dy_memory_person_archive` 的访问条件仍弱于服务层的 P0-1 设计，且其查询范围按 cwd 而非当前 session 过滤。

此外，live-session registry 没有会话撤销接口，尚未覆盖 Host 生命周期中的 session dispose/revoke。

本报告只提出修复与测试建议，不直接修改 P0-1 运行时代码。

## 2. 发现

### F-01 — 原话归档工具没有执行 live-session trust 校验

**严重性：高；P0-1 合并阻断项**

位置：`lib/index.js`，`dy_memory_person_archive` handler（约 724–755 行）。

当前 handler 检查：
- `sess.id` 非空；
- `sess.cwd` 非空；
- `sess.isOwnerPrivate` 为真。

但没有调用 `liveSessions.matches(...)`，也没有委托给 `createMemoryService` 中已经带 `isTrustedHeader` 的 carryover/handoff 路径。

现有 `tests/p0-1-raw-read-auth.test.mjs` 构造了一个尚未经过 index Host lifecycle event 登记的 `owner-1` exec header，直接调用 `dy_memory_person_archive`，仍能成功读出测试归档内容。该测试证明当前覆盖的条件不是“host-observed session”，而是“带 owner cwd 的 session-shaped header”。

**建议修复：**
1. 对 raw archive 读取统一使用 Host-observed session 校验；无法证明时返回空/权限拒绝。
2. 在工具 handler 测试中明确验证未登记 session、伪造 id/cwd、非 owner session 均拒绝。
3. 不要把模型传入的 header、cwd 或 session id 当作授权证据。

### F-02 — 原话归档查询按 cwd 限定，没有按当前 session 限定

**严重性：高；P0-1 合并阻断项**

位置：`lib/index.js`，`dy_memory_person_archive` handler。

当前 SQL 条件以 `raw_meta.cwd = sess.cwd` 为主，并可附加 person/channel；没有独立的 session ID 过滤条件。因而同一 owner cwd 下多个历史 session 的原话记录可能进入同一查询结果。

测试文件 `tests/p0-1-raw-read-auth.test.mjs` 已构造同一 HOME cwd 下的 `CURRENT_SESSION_RAW` 与 `PREV_SESSION_RAW` 两条记录，但当前断言没有验证 `PREV_SESSION_RAW` 不会被返回。也就是说，测试数据已经覆盖了跨 session 情形，却没有断言当前 Conversation 隔离。

**建议修复：**
1. 先明确 raw archive 的 session locator 与 schema 映射；若文件名/片段键只是间接编码，必须做严格解析和完整性校验，不能靠模糊字符串匹配。
2. 将查询范围收敛到当前 session；无法确定归属的旧记录保持不可读/unknown，而不是回退到 cwd 全量读取。
3. 增加同 cwd、不同 session 的双向拒绝测试，并验证当前 session 仍可读。
4. 不批量回填真实历史记录；旧数据兼容策略另行设计。

### F-03 — live-session registry 没有 dispose/revoke 生命周期

**严重性：中高；安全生命周期缺口**

位置：`lib/session-trust.js`。

当前公开接口只有 `observe`、`matches` 和 `size`。registry 不提供 `remove/revoke`；`matches` 成功后只刷新 LRU；`observe` 会更新同 ID 的 cwd，但不会标记会话结束。

`lib/index.js` 在 `session/event`、`agent/created` 和初始 agent list 中登记会话。当前 registry 没有与 `agent/disposed` 等生命周期事件对应的撤销操作。旧 session 因而可能在逻辑结束后继续匹配，直到被 LRU 淘汰或插件进程重启。

**建议修复：**
1. registry 增加明确的 revoke/remove 操作。
2. 在 Host session dispose/close 生命周期事件中撤销对应 ID。
3. 对 session ID 复用、cwd 变化、dispose 后迟到事件定义安全规则。
4. 测试 dispose 后旧 header 拒绝、同 ID 新 session 重新观察后只匹配新 cwd、LRU 淘汰与 revoke 交互。

### F-04 — owner 路径判断不能替代 Host 认证的 owner 身份

**严重性：架构限制；当前设计已知但必须保持显式**

P0-1 的 owner 判定仍依赖 Memory 本地配置和 cwd 分类（`isOwnerCwd` / `classifyOwner`）。Host 审计指出 Host 没有可信 owner 概念，session ID/cwd 本身也不能证明用户身份。

因此：
- host-observed session ≠ authenticated owner；
- owner cwd classification ≠ host-authenticated owner；
- memory session trust registry ≠ Host security boundary；
- 测试 harness 注入身份只能作为测试数据，不能证明生产授权成立。

**建议：** 保持跨会话披露 fail-closed。未来只有 Host 提供可认证 owner identity 与用户 consent event 后，才继续实现跨 Conversation 授权。

### F-05 — provenance assessor 的 sourceFile 字段只证明路径字符串存在

**严重性：低；诊断语义精度问题**

位置：`lib/ingest/provenance-audit.js`。

`assessMemoryProvenance` 对 `sourceFile` 的判断是 `Boolean(sourceFile)`，它只能说明记录中有非空路径字符串，并未检查文件是否真实存在、是否可读或是否仍在保留期内。

报告/接口描述应明确为“source file locator present”，不能表述成“source file exists”。如需文件存在性，需要由有权限的上游只读 adapter 提供独立证据；纯诊断函数不应自行访问任意路径。

## 3. 已确认的安全正向行为

1. `handoffBrief` 和 `carryover` 服务路径调用 `isTrustedHeader`；不可信 header 会 fail-closed。
2. `publicBrief` 当前直接返回空数组，未启用跨 Conversation 公共简报。
3. 跨会话授权文档明确区分 session trust 与 disclosure consent，并要求 Host-originated consent evidence、短时单次授权、撤销、精确字段白名单及审计失败 fail-closed。
4. `lib/recovery/plan.js` 是纯规划器：只消费上游已经授权的证据记录，不执行文件/DB I/O、不认证调用者、不写记忆。它不是完整恢复功能，也没有接入 raw archive、diary 或 Host 授权层。
5. 用户确认的 `retentionDays` 语义是只清理归档 Markdown 文件，不清理数据库原话、FTS、向量或情绪快照。本报告不建议改变该行为。

## 4. 自动化验证状态

复核时从 GitHub Actions 核验到：
- 基线提交：`6f20aaae024078653f7fde1dec20a7c1555d181e`
- Workflow run：`45331646656`（Node tests，run #173）
- Job：`138234003009`，completed / success
- 日志汇总：155 tests，154 pass，0 fail，1 skipped。

这比 PR #3 当前描述中的 142 tests / 141 pass / 1 skipped 更新。PR 描述应同步最新 CI 事实，但本报告不直接修改 PR 描述。

CI 只证明 GitHub runner 上的自动化测试通过；不证明 Host 身份可信、不证明 DSHA 实机隔离、不证明真实渠道安全。

## 5. 建议修复顺序

1. **先修 F-01 与 F-02**：原话归档 handler 必须落实 host-observed session 与当前 session scope；补充缺失的回归断言。
2. **再修 F-03**：为 live session 增加明确的撤销生命周期和测试。
3. **同步修订 F-05 的诊断字段语义**，避免把 locator present 误报成文件存在。
4. 保持 F-04 架构边界：Host 未提供可信 owner/consent API 前，不实现跨 Conversation 授权，不恢复 pins/projects/decisions/todos，不开放 `publicBrief`。
5. 所有代码修复继续只在独立分支与隔离测试环境验证；不部署、不触碰真实记忆数据。

## 6. 明确未做事项

- 未连接 Android/DSHA 设备。
- 未读取、复制、修改或删除生产数据库/原话档案。
- 未改 Memory、Persona、Autonomy、Bridge 的运行时代码或配置。
- 未合并 PR #3 / PR #4，未部署。
- 未恢复跨会话记忆披露、情绪写入或自主外发。

---
