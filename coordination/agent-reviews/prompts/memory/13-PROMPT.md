# Memory 只读审查提示词：联合契约 v1.1.1

任务 ID：`MEMORY-PERSONA-CONTRACT-V1.1.1-READONLY-REVIEW-02`

你是 DSHA「汐」项目 Memory 专项负责人。请只读审查以下联合契约草案：
`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.1.1-DRAFT.md`

## 交付规则（必须遵守）
1. 将本提示词保存到你的 Memory 专项工作区下一个未占用序号的提示词文件（本副本编号 13；若本地 13 已被占用，使用下一个序号，不覆盖历史），例如 `13-PROMPT.md`。
2. 完整审查报告直接写入 GitHub：`coordination/agent-reviews/memory/contract-v1.1.1/REVIEW-REPORT.md`。目录不存在时，只能在自己的审查分支/PR 中创建。
3. 不要在聊天中粘贴完整提示词或完整报告。聊天仅返回：状态、GitHub 报告路径、commit SHA、PR URL（如有）、阻塞项，以及本地提示词文件路径/文件。
4. 使用独立分支和 PR；不得直接写 main，不得修改/覆盖共享 HANDOFF.md、REPORT.md 或历史报告。
5. 报告提交后提供准确 commit SHA；无可验证证据不得宣称 PASS。

## 工作范围
- 记录当前 Memory 仓库实际 HEAD、分支、tree、工作区状态。
- 阅读契约全文及已有 MEMORY-REPORT-0028 §19；旧报告只作为历史证据，不得把旧 HEAD 当当前 HEAD。
- 只读审查 Memory 当前实现是否符合契约：speaker/experiencer 分离、私聊/群聊会话键与隔离、历史记忆兼容、validityState 全入口、valid_from_kind/superseded_at、三维证据可信度、自主补全边界、迁移/回滚设计。
- 对每项给 PASS/PARTIAL/REJECT/NOT_IMPLEMENTED/BLOCKED/NOT_RUN，并给出路径、行号/符号和测试证据。
- 特别核查本契约是否与 Memory 既有 people/contacts、group ID、raw archive、speaker_id、P4、recall、preference、remembered、session-index、handoff、rules、stable、graph、merge、daily/weekly 等入口兼容。
- 明确哪些字段由 Memory 负责、哪些必须由 Persona 或 Channel Bridge 提供。
- 对历史原文可信策略提出具体技术映射，但不得把原文存在自动等同于其中每个事实都已验证。
- 对三维可信度字段提出兼容现有 numeric confidence 与旧 confidence_kind/source 讨论的方案；不得擅自改源码。
- 标出契约自身的矛盾、遗漏、不可实现项及你需要 GPT/项目负责人决定的问题。

## 严格禁止
- 不修改业务源码、测试、schema、数据库、配置、插件目录。
- 不运行写入生产数据库的命令；不得连接生产 DB。
- 不实施 Memory v6，不做迁移、部署、合并、重启。
- 不启动 EI-2A 或任何 Persona v3 实施。
- 不执行真实 recall injection、自动补全写入或其他生产行为；仅可用既有测试/只读检查或临时隔离数据库探针，且必须明确说明。
- 不得把建议写成负责人已批准的决定。

## 报告必须包含
1. 契约版本、报告时间、准确 HEAD/tree/branch。
2. 审查范围和未触碰事项。
3. C1–C8 与会话层新增条款逐项矩阵。
4. 每项源码证据（路径、行号、符号）和测试命令/结果。
5. 历史数据兼容方案及风险。
6. 三维可信度字段/迁移建议。
7. 所有入口有效性过滤矩阵。
8. 未覆盖、BLOCKED、风险与未决事项。
9. 最终结论：只对当前实现给结论，不得将测试通过等同契约 PASS。

本任务是只读复审，不是实现任务。若契约有问题，请在报告中提出修订建议，等待 GPT/项目负责人处理。
