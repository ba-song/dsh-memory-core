# MEMORY–PERSONA 联合数据契约 v1.1.1 · Memory 同版本只读复审（第二轮）

- 任务：`MEMORY-PERSONA-CONTRACT-V1.1.1-READONLY-REVIEW-03`
- 审查时间：2026-11-22 13:2x–13:4x (Asia/Shanghai)
- 性质：只读复审；未改源码/测试/schema/数据库，未迁移，未部署，未启动 v6/Persona v3/EI-2A。

> 路径说明：指定路径 `coordination/agent-reviews/memory/contract-v1.1.1/REVIEW-REPORT.md` 已存在于上一轮分支 `review/memory-contract-v1.1.1`（commit `72986e0c0780a1d4c8ac133c2f196ed5eb26c405`）。按要求不覆盖，本报告使用独立分支 `review/memory-contract-v1.1.1-r2` 与文件名 `REVIEW-REPORT-R2.md`。

## 1. 审查基线

| 项 | 值 |
|---|---|
| 仓库 | `ba-song/dsh-memory-core` |
| 审查分支 | `feat/m1-preference-memory` |
| **HEAD** | **`7548e49ed0b8d8673818464325d8e72ec7704b27`** |
| tree | `3020e9b7e2ac19ea20486bbce76e2d83ed7b2b7f` |
| main HEAD | `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`（compare ahead 245 / behind 0） |
| 工作区 | `/tmp/memaudit/m1` 独立 worktree；`git status` 仅 `?? node_modules`；`git diff --check` 干净 |
| 环境 | Node v24.19.0；npm 11.17.0 |
| 上一轮基线 | 同为 `7548e49`（未变化；本轮结论仍在本 HEAD 重新取证） |

## 2. 权威依据（已核对）

| 文件 | commit | blob |
|---|---|---|
| `coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.1.1-DRAFT.md` | `006bb5bfce5d031b49a60271fe0406b228b43e00`（分支 `docs/memory-persona-contract-v1.1.1-owner-decisions`） | `10a62b64dff6219d00a1e25be09a39ddccb50e1a` |
| `coordination/agent-reviews/persona/contract-v1.1.1/REVIEW-REPORT.md` | `4053341f9da5b30cf2469b280d80c2c86f208c08`（分支 `review/persona-contract-v1.1.1`） | `17d1fc1e2a3fff891fa86092164d0cb203473916` |
| 上一轮 Memory 报告 §19 | `8956f1c3a62c522e83527add8d37c26c50b2e657` | — |

契约正文 323 行，逐节读取；Persona 报告 362 行，读取 selfId/identityOf/binding/会话/owner/group/三位证据/接口建议章节。

## 3. 审查范围

已审：`lib/service.js`、`lib/index.js`、`lib/store/{schema,memories,graph,episode-rewrite,db}.js`、`lib/ingest/{archive,p4,conflict}.js`、`lib/inject/{preference,remembered,session-index,rules,stable,digest,carryover}.js`、`lib/handoff/brief.js`、`lib/recall/recall.js`、`lib/consolidate/{daily,weekly}.js`、`lib/scope.js`、`lib/selfid.js`、`lib/pref/merge.js`、现有测试。

未审/跨仓库：Channel Bridge（不在本仓库）、Persona 运行时、生产 DB、Android 设备、生产注入。

---

## 4. 47 项矩阵（逐项）

### A. 身份与主体

| # | 检查项 | 状态 | 证据 |
|---|---|---|---|
| 1 | speaker_id 与 experiencer 分离 | REJECT | 无 `experiencer_type/id` 列（`schema.js` 无；`grep -rn experiencer lib` 仅 EI 文档）；`speaker_id` 仅发言者（`memories.js:45`） |
| 2 | self/owner/third_party/unknown 语义 | NOT_IMPLEMENTED | 无类型字段；`speaker` 语义 self/user 与 `speaker_id` 混用（`archive.js`） |
| 3 | 群实体作为 third_party、非成员 | PARTIAL | 群实体 ID 前缀存在（`archive.js:285`），但群消息 speaker 即群实体 → 实体与成员未分离 |
| 4 | 无稳定 ID 群成员保留 unknown | REJECT | 群消息统一返回 `person:contact:qq:group:<gid>`（`archive.js:282-285`），无成员 ID 时用群 ID 替代 |
| 5 | subject 仅显示、不作身份主键 | PARTIAL | `subject TEXT`（`memories.js:44`）；无自然语言身份推断代码；但无“禁止作过滤键”的约束 |
| 6 | self episode 拒绝 sentinel/非法/任意串 | REJECT | 实测 `self:unknown`→写入；`abc`→`self:abc`；`self:`→写入（`r2-id2.mjs`） |
| 7 | E_PERSONA_IDENTITY_UNKNOWN/INVALID 存在且触发准确 | NOT_IMPLEMENTED | `grep` 0 命中；仅有 `E_PERSONA_UNAVAILABLE`（`service.js:37`） |
| 8 | 可信 self 来源、不依赖 meta | REJECT | `personaSelfId()` 只判空（`service.js:192-198`）；`meta` 在 `PATCHABLE_COLUMNS`（`memories.js:8-12`） |
| 9 | experiencer_evidence 存在且不可 PATCH | NOT_IMPLEMENTED | 无字段；`updateMemory(metaPatch)` 可写 meta |

### B. 会话与来源

| # | 检查项 | 状态 | 证据 |
|---|---|---|---|
| 10 | 保存真实 speaker 与来源会话 | PARTIAL | `speaker_id` 有（老表），但 `conversation_scope` 恒 `''`（`memories.js:45`、`service.js:322/457`） |
| 11 | 私聊/群聊稳定 conversation 身份 | NOT_IMPLEMENTED | 无 `conversation_id` 列；房间仅由 cwd 推导（`scope.js`） |
| 12 | 群消息错误归属 owner/群实体 | REJECT | 群消息 speaker=群实体（`archive.js:285`）；不是成员个人 |
| 13 | runtime session 与长期 conversation 映射 | NOT_IMPLEMENTED | 运行时 `header.id` 不落库；`session_bindings` 只在 Persona |
| 14 | Channel Bridge 缺字段时 fail closed/unknown | PARTIAL | 私聊无号时回退 owner（`archive.js:292-293`）属猜测；群无 gid → `''`（unknown-ish） |

### C. 历史兼容

| # | 检查项 | 状态 | 证据 |
|---|---|---|---|
| 15 | 旧记忆缺字段仍可回忆 | PASS | current recall 放行 NULL 起点（`recall.js:71`）；实测 normal/nullfrom 返回 |
| 16 | 原文保留、补全字段分离 | PARTIAL | 无自动补全；`episode-rewrite` 显式改 `text`（`episode-rewrite.js:120-126`），带快照/回滚 |
| 17 | 不整体降级历史 | PASS | 无按字段缺失排除的路径 |
| 18 | cutover 机制 | NOT_IMPLEMENTED | `grep cutover` 0 命中 |
| 19 | historical_record/unknown/legacy/approximated 区分 | NOT_IMPLEMENTED | 无 evidence_source/valid_from_kind/approximated 字段 |
| 20 | 证据支持的补全流程 | NOT_IMPLEMENTED | 仅 `selfid.js` 对 `self:unknown` 做目标回填；无通用元数据补全/审计 |

### D. 有效性与时间

| # | 检查项 | 状态 | 证据 |
|---|---|---|---|
| 21 | 统一 validityState | NOT_IMPLEMENTED | `grep validityState` 0 命中 |
| 22 | VALID/INVALID/UNCERTAIN 三态 | NOT_IMPLEMENTED | 仅有布尔式内联条件 |
| 23 | 所有入口一致 | REJECT | 矩阵见 §5 |
| 24 | valid_from_kind 四态 | NOT_IMPLEMENTED | 无列；`insertMemory` 把 `'abc'`→NULL（`memories.js:31` 同层 `Number()`） |
| 25 | superseded_at | NOT_IMPLEMENTED | 无列；supersede 仅写 `valid_to`/status（`weekly.js:116`、`resolve.js:92`） |
| 26 | 无替代时间旧记录不被误判 | REJECT | sup-only 行在 8 入口泄漏；asOf 丢历史 |
| 27 | as-of 恢复历史 | REJECT | 实测 ids=[]，uncertain=[normal,nullfrom,badtime,suponly,expired] |
| 28 | future/expired/superseded-only 不泄漏 | REJECT | 见 §5 矩阵 |

### E. 三维证据与情绪字段

| # | 检查项 | 状态 | 证据 |
|---|---|---|---|
| 29 | evidence_source 独立 | NOT_IMPLEMENTED | `grep` 0 |
| 30 | verification_status 独立 | NOT_IMPLEMENTED | `grep` 0 |
| 31 | confidence_level 独立 | NOT_IMPLEMENTED | `grep` 0；仅 `confidence REAL` |
| 32 | 三者不互相推导 | REJECT | 单一数值承担全部语义；默认 `confidence=1.0`（`memories.js:31`、`schema.js:79`） |
| 33 | 旧 numeric confidence 不作概率 | REJECT | 无 kind/source；1.0 默认即“确定” |
| 34 | 新数据不默认 0.5 | REJECT | Memory 默认 1.0；Persona event/appraisal 默认 0.5 |
| 35 | 重复拷贝不提升可信度 | REJECT | 同极性偏好 `confidence+0.02`、`evidenceCount+1`（`merge.js:128-131`） |
| 36 | source ID 与证据关系可追溯 | PARTIAL | `source_msg_id/source_file/quote` 有；无证据独立性/关联表 |
| 37 | 情绪 score/intensity/certainty 与记忆可信度分离 | PARTIAL | Memory 不消费情绪分数（无引用）；但无契约字段、默认值仍危险 |
| 38 | disputed/retracted 保留原记录与纠正 | PARTIAL | `conflict_queue` 存在、status `corrected` 保留行；无 verification_status/retracted 关系 |

### F. 自主补全、审计与迁移

| # | 检查项 | 状态 | 证据 |
|---|---|---|---|
| 39 | 只读扫描 + 补全候选 | NOT_IMPLEMENTED | 无通用扫描/候选表 |
| 40 | 补全审计（来源/方法/时间/原值/新值/操作者） | NOT_IMPLEMENTED | 无字段；`selfid` 只记 batch/时间 |
| 41 | 不覆盖原文/不删冲突 | PARTIAL | 无自动补全；`episode-rewrite` 改正文（有快照/回滚，owner 确认） |
| 42 | inference 不自动升级 confirmed | NOT_IMPLEMENTED | 无 inference→确认链路（不存在该能力） |
| 43 | migration 单事务 | PASS | `db.js:48` BEGIN IMMEDIATE；实测失败回滚 |
| 44 | 先校验后写 version | PASS | `db.js:103-104` |
| 45 | 校验失败整体回滚 | PASS | `mig-m1-fail3.mjs`：`E_SCHEMA_MIGRATION_INCOMPLETE`，version 保持 4、valid_from/索引未残留 |
| 46 | 前后计数/完整性校验/快照 | PARTIAL | 有结构校验；无迁移前后计数/快照 |
| 47 | raw_meta.speaker_id 独立迁移/幂等/失败语义 | NOT_IMPLEMENTED | fresh DDL 无该列（`archive.js:174-185`）；ALTER 列表无 speaker_id；回填 `catch{return []}` 静默（`selfid.js:47-50`） |

---

## 5. 有效性泄漏矩阵（实测，HEAD 7548e49）

| 入口 | future | expired | sup(status) | sup-only | NULL 起点 | 坏时间 |
|---|---|---|---|---|---|---|
| recall current | 排除 | 排除 | 排除 | 包含 | 包含 | 包含 |
| recall asOf | 排除→uncertain | 排除→uncertain | 排除 | 包含 | 排除→uncertain | 排除→uncertain |
| preference | 注入 | 排除 | 排除 | 注入 | 注入 | 注入 |
| remembered | 注入 | 排除 | 排除 | 注入 | 注入 | 注入 |
| session-index | 注入 | 排除 | 排除 | 注入 | 注入 | 注入 |
| handoff | 注入 | 注入 | 排除 | 注入 | 注入 | 注入 |
| episodeRecent | 返回 | 返回 | 排除 | 返回 | 返回 | 返回 |
| rules block | 排除 | 排除 | 排除 | 注入 | 注入 | 注入 |
| stable group | 注入 | 注入 | 排除 | 注入 | 注入 | 注入 |
| graph lenient | 排除 | 排除 | 排除 | 包含 | 包含 | 包含 |
| graph strict | 排除 | 排除 | 排除 | 排除 | 排除 | 排除 |
| merge | 候选被合并 | 旧行排除 | 旧行排除 | 旧行包含 | 包含 | 包含 |
| P4 邻居 | 可选中 | 可选中 | 可选中 | 可选中 | 可选中 | 可选中 |

关键位置：`preference.js:40/48`、`remembered.js:18`、`session-index.js:40/67`、`brief.js:28`、`service.js:271`、`rules.js:113`、`stable.js:204`、`graph.js:51-73`、`p4.js:93`、`merge.js:105/116`、`recall.js:71/189`。

## 6. 会话层专项（契约 §2）

| 要求 | 现状 | 结论 |
|---|---|---|
| 私聊独立窗口 | cwd 房间 + contact scope 精确匹配；`carryoverFor` 按 cwd（`carryover.js:6-16`） | PARTIAL（可用，但无稳定 conversation ID） |
| 群聊独立窗口 | group scope_id 精确匹配（`scope.js:110-130`） | PARTIAL |
| 群成员 speaker | 群消息 speaker=群实体（`archive.js:282-285`） | REJECT |
| 群实体 ≠ 成员 | 群实体 ID 存在，但被当成员 speaker | REJECT |
| 原文不跨会话注入 | `buildDigest` 合入 home+全部 QQ 私聊+群+email（`digest.js:5-21`），owner 会话注入（`index.js:1218`） | REJECT（P1） |
| 运行 session vs 长期 conversation | `conversation_scope` 恒空；session id 不落库 | NOT_IMPLEMENTED |

## 7. 与 Persona 报告的一致点/差异/接口依赖

**一致**：selfId sentinel/nullable、binding 不校验同源、无 identityOf、无 experiencer_evidence、无三维字段、群成员身份缺失、timeline 列名/非原子写入。双方均判定对应项 REJECT/NOT_IMPLEMENTED。

**差异**：
1. Persona 建议 Memory 存储 `identityEvidence`；Memory 侧当前无 `experiencer_evidence` 列，且 `meta` 可 PATCH → 双方都未实现，需统一定义（Memory 建议专用只写列，不加入 `PATCHABLE_COLUMNS`）。
2. 会话 ID 责任：Persona 报告指出 `session_bindings.session_id` 是 runtime `header.id`，Channel Bridge 责任冲突；Memory 侧 `conversation_scope` 恒空 → 必须由三方协议确定 `conversation_id` 产生方。

**Memory 侧最小接口建议**（不代表已批准）：
- Persona：`selfId()` 返回 canonical `self:<uuid>` 或 null（禁止 sentinel）；`identityOf(header)`（可选）返回 `{self_id, subject_type, subject_id, source, issued_at, valid}`；`bindingOf()` 必须校验 `persona_id===selfId()`。
- Channel Bridge：`speaker_id`、`experiencer_type/id`（若可判）、`conversation_id`（稳定）、`session_id`（运行期）、`chat_type/peer_id/group_id/sender_external_id`。
- Memory：校验 self/ID、生成/存储 `experiencer_evidence`、people/contacts 映射、有效性、证据三维、按用途检索。

**owner/group 建议**：
- `person:owner` 在 D1 未决前只作占位，owner episode 建议 fail closed（拒绝或 unknown），不得伪造 owner ID。
- `role_only` 仅展示；群实体 `person:contact:qq:group:<gid>` 存 group；成员无稳定 ID → `experiencer_type=unknown`，不得用群 ID 代替成员。
- 群实体不新增 experiencer_type（按契约）。

## 8. 测试记录

| 命令 | 目录 | HEAD | 结果 |
|---|---|---|---|
| `npm test` | `/tmp/memaudit/m1` | `7548e49` | **258 pass / 0 fail / 0 skip，exit 0**（140 文件，Node v24.19.0） |
| `node /tmp/memaudit/v111probe.mjs` | `/tmp/memaudit` | `7548e49` | 矩阵见 §5 |
| `node /tmp/memaudit/rulesProbe.mjs` | 同上 | `7548e49` | rules block 含 sup-only；listRules 含 future/expired/sup-only |
| `node /tmp/memaudit/identityM1.mjs` | 同上 | `7548e49` | P1–P5（sentinel 写入/无列/无 pendingIdentity） |
| `node /tmp/memaudit/r2-id2.mjs` | 同上 | `7548e49` | `abc`→`self:abc`、`self:`→写入、`self:unknown`→写入、空→`E_PERSONA_UNAVAILABLE` |
| `node /tmp/memaudit/mig-m1-fail3.mjs` | 同上 | `7548e49` | 迁移校验失败 → version 4、无 valid_from、无索引 |

说明：现有全量测试通过只证明当前基线未回归，不覆盖契约新增语义（experiencer/三维/会话 ID 等均无测试）。

## 9. 历史兼容风险

1. 旧 NULL 时间与“被清洗的坏时间”不可区分；current 召回两者都放行（实测 badtime 注入）→ 历史“可用”成立，但“可信时间”不成立。
2. 无 cutover/approximated 标记 → 无法按契约呈现时间不确定性。
3. `episode-rewrite` 可改正文（有快照/回滚、owner 确认）；若未来被自动补全复用，将违反“不得覆盖原文”。
4. 旧记录缺 speaker/experiencer 时，current 仍会注入为普通事实，但不携带 unknown 标记。

## 10. 未决问题

1. D1 canonical owner ID 与 owner episode 写入策略。
2. 各平台 conversation key 字段组合；跨平台账号合并。
3. runtime session ↔ long conversation 映射与写入责任（Persona/Channel Bridge 冲突）。
4. `experiencer_evidence` 物理存储与不可 PATCH 机制。
5. 三维字段命名/枚举/旧 numeric confidence 映射。
6. legacy 近似规则、cutover 时间与 approximated 审计格式。
7. 自主补全写入的授权/事务/审计/回滚。
8. `subject` 是否 deprecated；rules 适配统一 helper。
9. 群成员 ID 不可用时的补录/合并策略。

## 11. 风险分级

- **P0**：群消息 speaker 用群实体代替成员（错误归属）；digest 跨会话注入原文；self sentinel/非法 ID 可直接写入；merge 提升同源重复可信度。
- **P1**：future/expired/sup-only 在 8+ 入口泄漏；asOf 丢历史；坏时间静默 NULL 并注入；fresh raw_meta 无 speaker_id。
- **P2**：无 cutover/approximated；无三维字段；无补全审计；rules 管理视图展示无效行。

## 12. 是否具备冻结条件

**否**。身份、会话、有效性、历史兼容、三维证据五大类均存在未解决缺口；Memory v6 未实施（NOT_STARTED）。需先发布 v1.1.1 正式版（非 draft）、完成跨仓库接口裁决、实现并验证 v6 语义，才可进入冻结评审。

## 13. 边界声明

本轮未修改业务源码、测试、schema、数据库、生产配置；未执行迁移；未部署/重启；未连接设备；未启动 Memory v6 / Persona v3 / EI-2A；未合并任何实现分支。所有 probe 均使用 `/tmp` 隔离临时库与合成数据。

## 14. 状态

- Memory 本轮审查：**READY_FOR_REVIEW**
- Memory 当前实现对 v1.1.1：**REJECT**
- 联合契约状态：**BLOCKED**（不能冻结）
- Memory v6：**NOT_STARTED**
- Persona v3：**NOT_STARTED**
- EI-2A：**NOT_STARTED**
