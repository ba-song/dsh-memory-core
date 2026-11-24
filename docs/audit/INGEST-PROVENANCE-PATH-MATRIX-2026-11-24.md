# DSHA「汐」记忆写入来源路径矩阵（源码审计）

- 日期：2026-11-24
- 仓库：`ba-song/dsh-memory-core`
- 审计基线分支：`fix/p0-1-trusted-handoff-continuity`
- 范围：只读审查已定位的记忆写入、日记保存、原话归档和恢复读取路径；不访问真实用户数据库。
- 证据等级：下表“源码证实”只表示对应函数/字段在所读源码中存在；自动化测试证实见单独列；不代表 DSHA 设备运行时行为。

## 1. 路径矩阵

| 路径 | 代码位置 | 是否写 memories | provenanceMode / quote gate | 关键字段与边界 | 当前结论 |
|---|---|---:|---|---|---|
| 唯一记忆插入入口 | `lib/store/memories.js::insertMemory` | 是 | 仅调用方传 `provenanceMode` 才调用 `resolveQuote`；未传时 gate=null，仍可写入 | 存储 source_msg_id/source_ts/source_file/source_channel/source_ref/quote/confidence/extractor_version/meta；schema 未见 source_session_id | “唯一入口”不等于“所有调用都经过来源门禁”；这是全仓高优先级治理点 |
| 显式“记住” | `lib/ingest/explicit.js::ingestExplicit` | 是 | `provenanceMode:'session'`，`sourceText` 为当前消息 | source_msg_id 为 `explicit:<sessionId>:<seq>`；session ID 编入 locator key，但没有独立认证字段 | quote gate 在该路径启用；locator 仍不是 Host session authentication |
| P4 规则/模型候选 | `lib/ingest/p4.js::ingestCandidate` / `ingestClassified` | 是 | 先调用 `resolveQuote`；最终 insert 也传 `provenanceMode:'session'` 与 sourceText | 规则抽取与模型兜底共用候选写入路径；merge/pending/active 均保存 provenance | 已看到统一门禁调用；需继续检查所有上游调用是否传入真实本轮 sourceText/sourceKey |
| 离线迁移 | `lib/ingest/migrate.js::applyAll` | 是 | 未传 `provenanceMode`，也未传 quote/sourceText | 写 sourceFile/sourceMsgId/extractorVersion/meta.sourceKey；meta 不写 provenance | 迁移记录应保持 legacy-unknown；不能因 sourceFile/sourceKey 存在而升级 |
| 手工/兼容插入 | 直接调用 `insertMemory` 且不传 provenanceMode | 是 | 不触发 quote gate | 可有 locator/file/timestamp，但没有 provenance label | 兼容性允许写入，但审计必须标 unknown；后续需盘点全部调用点 |
| 日记 | `lib/diary/store.js::saveDiary` | 否（独立文件） | 无 memories provenance gate | 写入 `diary/YYYY-MM-DD/HHMMSS-seq.md`，frontmatter author=self；原子不覆盖；不写 memories/raw_meta | 日记是独立存储路径；未来若导入记忆需另建 provenance 适配，不可假设它已有 memory evidence |
| 原话归档 | `lib/ingest/archive.js` | 否（写 raw_meta/raw_fts 与归档文件） | 不走 memories quote gate | Host session/event 驱动；raw_meta 保存 cwd/role/speaker/channel 等；撤回设置 tombstone 并移除 FTS | 属于原始来源候选；仍需由恢复 adapter 做 owner/session scope 检查 |
| Q149 原话恢复读取 | `lib/recovery/raw-archive.js::createRawArchiveRecoveryAdapter` | 否（只读） | 不写入 memories | 先从 exec Host session 取 id/cwd，匹配 liveSessions，再检查 isOwnerCwd 与 owner scope；SQL 先按 cwd/tombstone/role 过滤，再取 excerpt | 当前适配器只允许可信当前 Owner session 读取本 cwd；不代表跨 Conversation consent |
| 来源审计 | `lib/ingest/provenance-audit.js::assessMemoryProvenance` | 否 | 纯诊断 | 缺失 source_session_id 会报 gap；source_msg_id 被明确视为 locator，不是认证 | 只读审计，不会修复/回填/改变召回 |

## 2. 已有测试证据

`tests/ingest-provenance-paths.test.mjs` 使用隔离临时数据库，覆盖：
- 显式“记住”路径：provenance=derived，存在 quote，source key 包含 fixture session，但审计仍报告 missing explicit source session ID。
- P4 候选路径：通过共同写入路径，provenance=derived 且 quote 存在。
- 离线迁移路径：不写 provenance，审计结果为 legacy-unknown。
- 不带 provenanceMode 的手工 insertMemory：不写 provenance，审计结果为 legacy-unknown。
- correction-like locator/meta 不构成来源证据。

这些测试证实的是合成 fixture 下的函数行为，不是设备实测或真实用户数据审计。

## 3. 主要风险与缺口

1. **insertMemory 的门禁是 opt-in**：只在调用方传 `provenanceMode` 时触发；遗漏参数的路径仍能落库。需通过静态调用点盘点和路径测试防止新增旁路。
2. **source session 字段缺失**：显式路径把 session ID 编入 source_msg_id，但数据库没有独立 source_session_id；不能用于可信身份或授权判断。
3. **迁移与手工数据**：缺少 provenance 是 legacy-unknown，不应回填为 verified/derived；任何回填须独立审批和可逆方案。
4. **diary/raw archive 与 memories 是不同存储面**：不能把日记 frontmatter 或 raw_meta locator 直接当作 memory provenance。
5. **当前 raw archive recovery 是当前会话 Owner scope**：不包含跨会话披露授权；不能复用其 access=allowed 推断 disclosureConsent=granted。
6. **上游 sourceText 真实性仍依赖 Host/调用边界**：quote gate 只验证 quote 与给定 sourceText 的字面关系，不认证 sourceText 的来源。

## 4. 下一批可安全工程工作

- 静态枚举所有 `insertMemory(` 调用点，按是否传 provenanceMode 分类；为每个路径增加合成 fixture 测试。
- 将 quote gate 的 opt-in 设计风险形成兼容迁移提案；不在本阶段强制改为默认拒绝，以免改变现有记忆写入行为。
- 为未来 schema 设计独立 source_session_id 和 host-origin proof 引用；不改生产 schema。
- 将 diary/raw archive → memory 的任何导入路径显式标为独立 adapter，要求来源和角色映射。
- 保持所有跨 Conversation 原文读取 fail-closed，直到可信 Host consent API 与单次授权消费存在。

## 5. 未验证项

- 未检查所有仓库/插件的外部写入调用点；本矩阵限于当前仓库已定位的核心路径。
- 未运行 DSHA Android 设备。
- 未读取真实用户 memories/diary/raw archive 数据。
- 未证明 Host consent API 存在；现有设计文档明确要求缺失时 fail-closed。
- 未改变数据库 schema、生产配置、记忆写入/召回/衰减/删除或人格行为。
