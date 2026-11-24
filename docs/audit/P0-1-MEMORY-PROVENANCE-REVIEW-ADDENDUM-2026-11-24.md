# DSHA「汐」P0-1 记忆来源链静态审查补充

- 日期：2026-11-24
- 仓库：`ba-song/dsh-memory-core`
- 审查分支：`fix/p0-1-trusted-handoff-continuity`
- 审查基线：`6f20aaae024078653f7fde1dec20a7c1555d181e`
- 关联报告：`docs/audit/P0-1-STATIC-SECURITY-REVIEW-2026-11-24.md`
- 性质：只读源码/测试/文档审查；未连接 DSHA，未访问生产数据库，未改变运行时行为。

## 1. 核心结论

当前记忆写入路径并非统一具备同等来源证据。需要严格区分以下三件事：

1. **定位键存在**：例如 source_msg_id/sourceKey/source_file。
2. **引文与调用方提供的文本字面匹配**：quote gate 的 verified/derived。
3. **文本确实来自某个 Host 认证会话，且调用方有权使用它**：当前 Host/Memory 还不能普遍证明。

前两项不能自动推出第三项。尤其是手工写入工具可以把调用参数中的 source_text 交给 quote gate；匹配成功只证明 quote 是该参数文本的子串，不证明该文本是 Host 提供的当前会话原文。

本补充不建议现在统一改变写入语义，也不建议回填真实数据。先补齐入口级测试与诊断语义，再设计统一来源 DTO/schema。

## 2. 写入入口逐项审查

### W-01 — 显式“记住”入口

代码：`lib/ingest/explicit.js` → `insertMemory`

当前行为：
- sourceKey 为 `explicit:<sessionId>:<seq>`；
- sourceText 使用本轮传入的消息文本；
- `provenanceMode: 'session'`；
- quote gate 可产生 verified / derived / no-overlap 等标记；
- sourceKey 中编码 sessionId，但 memories schema 没有独立 source_session_id。

判断：
- 相较手工补录，该入口的 sourceText 来自消息处理调用链，证据基础更强。
- 仍不能把 sourceKey 当作 Host 认证 session identity。
- 应增加测试断言：来源消息、sessionId、seq 的传递关系；独立 session identity 缺失时 provenance audit 仍报告缺口。

### W-02 — P4 规则抽取与 LLM 兜底

代码：`lib/ingest/p4.js`、`lib/extract/pipeline.js`、`lib/extract/llm.js`

当前行为：
- 规则抽取与 LLM 候选最终共用 `ingestCandidate`；
- 默认 sourceText 回退到本轮 text；
- quote 在统一写入前执行逐字校验；
- sourceKey/sourceTs 由上游传入；
- 当前调用链没有建立独立 source_session_id。

判断：
- 共用写入路径减少了 LLM 直接绕过 quote gate 的风险。
- 逐字 quote gate 仍只验证字面关系，不验证命题语义真实性。
- 应覆盖错误 quote 拒绝、sourceText 缺失、规则/LLM 共用门禁、merged/pending 状态保留。

### W-03 — 手工工具 dy_memory_add

代码：`lib/index.js`，工具注册约 453–498 行。

当前行为：
- 工具要求 owner private cwd；
- source_text/source_quote 均由工具参数提供；
- 当 source_text 非空时，使用 `provenanceMode: 'session'`；
- quote gate 因而可能把与参数 source_text 匹配的 quote 标记为 verified；
- 该调用没有独立传入 sourceMsgId/sourceTs/sourceChannel/sourceRef/source_session_id；
- 当前 handler 的入口条件没有体现 P0-1 live-session registry 检查。

**风险解释：** 这里的 verified 只代表 quote 与调用参数 source_text 匹配。代码没有证明 source_text 是 Host 认证的当前会话原文，也没有证明它对应哪条原始消息。因此不能把该路径的 verified 解释为“来源会话已认证”或“用户已确认”。

建议：
1. 对手工补录明确区分“用户/模型提供的引用文本”与“Host 事件提供的原始消息”。
2. 若 source_text 来自工具参数，诊断标签不应表达为 Host-verified；可保留 quote 字面匹配结果，同时单独标记 source authenticity unknown。
3. 仅 owner cwd 判断不足以建立 Host-observed session trust；是否为该工具增加 live-session gate 应与 P0-1 全局权限模型一致。
4. 增加测试：伪造 source_text + 匹配 quote 只能得到“字面匹配、来源未认证”；缺少来源 locator/session identity 时不伪造完整来源链。
5. 不要为了补齐字段而自动从模型参数推导 session identity。

### W-04 — 离线迁移

代码：`lib/ingest/migrate.js` → `applyAll`

当前行为：
- 迁移以合成 sourceKey/sourceFile/extractor 写入；
- 未传 sourceText、quote 或 provenanceMode；
- 统一写入入口因此不运行 quote gate；
- meta 保存 sourceKey、migratedAt；source_file/source_msg_id 仅是迁移定位信息。

判断：
- 迁移记录应保持 legacy-unknown / provenance incomplete。
- 不应仅因存在文件路径或 sourceKey 而升级为 verified。
- 应增加只读诊断测试，验证迁移行 provenance audit 为 legacy-unknown，并保留迁移来源类别。

### W-05 — 主人纠错反馈

代码：`lib/index.js` 约 1190–1225 行。

当前行为：
- 识别主人对最近注入记忆的纠错；
- 对被纠正记忆降低 importance；
- 新增一条 correction 类型记忆；
- correction 写入未传 quote/sourceText/provenanceMode，meta 标记 correction 与被降权条目 ID。

判断：
- 当前新 correction 行没有 provenance 标签，诊断为 legacy-unknown 是合理的，不应自动升级为原话 verified。
- 纠错反馈是“用户曾纠正我”的事件记录，不等同于被纠正命题的反向事实证明。
- 应增加测试：纠错行保留 correction 语义；不能将其作为用户已确认某个相反命题的证据；被降权条目与纠错记录之间的关联可追溯。

### W-06 — 原话归档 RawArchive

代码：`lib/ingest/archive.js`；读取工具位于 `lib/index.js`。

当前行为：
- raw archive 与 memories 派生记忆分开；
- raw_meta 保存 role、speaker、channel、cwd、person_id 等信息；
- 部分 schema 版本还有 speaker_id、account_id、thread_id、external_id 等列；
- tombstone 会删除相应 raw_fts 行并将 raw_meta 标记为 tombstone；
- 原话可包含 user、self、tool、system/context 等不同角色事件，不是每一行都能作为用户事实；
- `dy_memory_person_archive` 当前按 cwd 查询 raw_meta，未按当前 session 的归档文件/会话标识收敛查询范围。

判断：
- 恢复证据必须过滤 tombstone、角色、事件类型、保留期和访问权限。
- 同一 cwd 下不同 session 的记录应单独测试，不能只验证不同 cwd 不互通。
- person archive 的 session 级限制需与前一份报告 F-01/F-02 一起修复；当前测试虽然构造了 CURRENT_SESSION_RAW 与 PREV_SESSION_RAW，但没有断言 person_archive 排除 PREV_SESSION_RAW。
- 不能把 raw archive 行直接等同于用户确认事实。

### W-07 — 日记与事实卡

代码：`lib/diary/store.js`、`lib/facts/edit.js`。

当前行为：
- 日记是独立 Markdown 文件路径，不写 memories/raw_meta，不自动进入普通检索/注入；
- 事实卡是人工维护文件，写入前保留有限备份，不等同于带逐条来源证据的 memories 行；
- 日记作者标记为 self，不能直接等同于用户陈述或用户确认的共同经历。

判断：
- 当前分离边界是合理的，不应为了“统一记忆来源”而强行把日记/事实卡迁入 memories。
- 将来若用于 Q149 恢复，只能通过明确授权的只读 adapter 接入，并保留 diary/self、人工维护事实卡等原始类型。
- 适配器必须返回来源定位、访问结果、作者/角色、时间、撤回/过期状态；不能由恢复规划器自行猜测。

## 3. 统一写入入口的关键限制

代码：`lib/store/memories.js`。

`insertMemory` 是 memories 表写入入口，但 quote gate 只有调用方传入 `provenanceMode` 时才执行。这是现有兼容策略的一部分，不应简单把所有旧路径改成强制拒绝，否则可能改变迁移/纠错/历史调用行为。

建议下一阶段先建立一份显式 WriteEvidence DTO 草案，区分：
- `locator`：source_msg_id/source_file/source_ref 等定位键；
- `source_session_id`：来源会话标识（目前 schema 缺少）；
- `host_session_evidence`：Host 生命周期观察证据；
- `source_text_origin`：host_event / user_supplied / migrated_file / correction / diary / manual_file；
- `quote_match`：exact / derived / no_overlap / absent；
- `claim_confirmation`：unconfirmed / user_confirmed / disputed；
- `lineage`：派生自哪些原始证据及 extractor version；
- `uncertainty`：未知、冲突、过期、来源缺失等原因。

此 DTO 先用于纯函数与 fixture 测试，不落库、不迁移、不改变运行时行为。

## 4. Q149 恢复规划器的边界复核

代码：`lib/recovery/plan.js`。

当前规划器：
- 不执行 I/O，不连接 store/Host；
- 只消费调用方传入的 evidence；
- 将 access 状态限制为 allowed/denied/missing/expired；
- 把 independenceKey/copiedFrom 明确视为上游断言；
- 输出 dry-run proposal，不修改记忆、归档、日记或 Persona；
- supported 可能仅代表单一可读证据谱系，不能解释为多源交叉印证。

建议未来 adapter 契约必须做到：
1. 先授权，再读取；不能先读后交给 planner 判权限。
2. 访问拒绝、文件缺失、保留期过期、tombstone 必须是不同结果。
3. 同一原始事件的多个副本不能被计作独立证据。
4. diary/self、user utterance、tool output、system/context、manual fact card 必须保留各自来源类型。
5. planner 的 supported 只能描述证据支持情况；恢复写入必须走独立授权与用户确认路径。
6. 当前阶段不接入真实 archive/diary/database，不自动恢复或重写任何记忆。

## 5. 建议的纯测试补齐清单

优先级按风险排序：

1. **手工 source_text 真实性边界**：source_text/quote 字面匹配不能被描述为 Host-verified；伪造文本测试。
2. **raw archive 当前 session 范围**：同 cwd、不同归档 session，person_archive 不得返回前一 session 原话。
3. **live session 生命周期**：session dispose/revoke 后旧 header 立即拒绝；覆盖 ID 复用。
4. **所有写入路径 provenance matrix**：explicit、P4 rule、LLM、manual、migration、correction 的预期标签和缺失字段。
5. **迁移与纠错 unknown 保持**：不得因 sourceFile/sourceKey/correction 标记自动升级来源等级。
6. **角色/撤回/过期过滤**：raw archive 中 self/tool/system/user 与 tombstone/expired 状态分别处理。
7. **恢复 adapter fixtures**：相同 lineage 的复制件不算独立来源；access denied/expired/missing 区分。
8. **日记/事实卡边界**：未来只读 adapter 不把 self 日记或人工事实卡伪装成用户原话。

## 6. 不变更项与明确边界

- 不新增数据库列，不执行 schema migration。
- 不回填真实历史记忆，不重写 provenance 标签。
- 不改变 recall、ranking、decay、forgetting、importance、emotion 或 Persona 行为。
- 不接入真实 archive、diary 或 facts adapter。
- 不恢复跨 Conversation pins/projects/decisions/todos，不启用 publicBrief。
- 不连接 DSHA、不部署、不重启、不操作设备。
- 不触碰生产数据，不做任何外部发送。

