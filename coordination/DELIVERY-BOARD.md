# DSHA「汐」统一交付看板

> 版本：BOARD-0002
> 更新时间：2026-11-23
> 维护者：项目负责人 GPT
> 本看板是交付状态快照；代码事实以精确 commit 为准，实机状态以 DSH 对应 commit 的测试证据为准。

## 一、六个常驻智能体

| 智能体 | 职责 | 当前安排 |
|---|---|---|
| Memory | 长期记忆、事实/事件/关系、来源、召回、有效性和连续性 | 当前重点推进 |
| Persona / EI | 自我身份、人格、情绪认知与状态 | 当前重点推进 |
| Channel Bridge | QQ/OneBot 收发、消息路由、联系人/群成员身份和会话上下文 | 保持身份边界工作 |
| Douyin | 抖音相关能力 | Owner 明确要求暂不推进 |
| Autonomy / Life | Home、目标、唤醒、主动思考、计划和行动 | 保持现有成果；未经授权不启用真实行动 |
| Android | Android 宿主、后台运行、生命周期、恢复和设备能力 | 保持设备运行与恢复工作 |

Host 不属于六个常驻智能体。Host 是 Owner 另行新开的临时工程智能体，专门执行 Host Runtime 安全改造，不注册为汐的常驻第七个业务角色。

## 二、基本开发协作闭环

**GPT 负责 GitHub 侧开发；DSH 负责本地与实机验证；GPT 负责独立验收并继续开发。**

1. GPT：读取仓库规范、HANDOFF/REPORT、精确 HEAD 和代码；作技术决策；在独立分支直接修改 GitHub 源码、测试和必要文档；提交并记录 SHA。
2. DSH：检出 GPT 指定的精确 commit，在本地和真实 Android/运行环境测试；提供命令、环境、日志、设备观察和结果。
3. GPT：核对证据是否对应精确 commit，独立审查代码与测试覆盖，给出 PASS/PARTIAL/REJECT；未通过时由 GPT 分析并继续修改 GitHub。
4. Owner：保留最终授权权。GPT 不得因接任负责人扩大生产权限；生产写入、部署/重启、真实外发、自动执行、不可逆操作及设备故障注入均遵守既有明确授权要求。

验收分层：
- 静态审查/隔离测试 PASS 不等于 DSH 本地验证 PASS。
- DSH 本地测试 PASS 不等于 Android 真机验证 PASS。
- 真机验证 PASS 不等于生产部署或生产运行 PASS。
- 所有测试必须绑定精确 commit SHA；不得用旧 HEAD 的测试数字证明新 HEAD。

## 三、当前重点交付

### P0：Host Runtime 安全改造（临时工程智能体）

- 仓库：ba-song/dsh-harness-host-provenance
- 上轮实现 HEAD：98f0b832e8a09c277ee4d9f4b36a3706780f786d
- 上轮报告 commit：15085641e46410af97db91514df4503458dddb50
- 状态：PARTIAL。GPT 独立审查发现公开 capability claim 入口及 get(name).execute() handler 旁路。
- 当前执行者：Owner 新开的临时 Host 智能体，执行第二阶段修复。
- GPT 负责复核代码、测试证据与独立验收。
- 不合并、不发布、不部署、不重启、不操作生产。

### P0：Memory

- 仓库：ba-song/dsh-memory-core
- main 本轮提交搜索所见 HEAD：752cd0861e9c86c9f7be4bdf18302fa72a3b95dd
- minimal-integration 目标 HEAD：a63f994e001da2e6636ed07c75988fa681ecaf7c
- HANDOFF-0076 记录：minimal-integration 新 HEAD 等待 Memory 本地复验；与 wake-capture 分支 schema/index 冲突，不可直接合并。
- A–E 累计栈曾报告隔离代码 PASS，但相对 main 范围较大（约 300 commits / 117 files），不能直接集成。
- P0-1 session capability 与 archive 访问边界仍须独立处理。
- 下一交付：验证精确 HEAD 的全量测试、专项测试和 N9 scope 隔离；GPT 分析并直接推进最小可集成代码改动；DSH 对指定 commit 做本地/实机验证，GPT 复核验收。
- 任何改变汐真实记忆写入、召回或自动行为的修改，先说明具体影响并取得 Owner 授权。

### P0：Persona / EI

- 仓库：ba-song/dsh-persona-core
- main 本轮提交搜索所见 HEAD：a84c7badd1e6c971a66b6c39dd4f7ab795df4b90
- EI-1 代码隔离验收曾 PASS（21/21 定向、324/324 全量），设备复验 NOT RUN。
- EI-2 设计文档曾有报告与分支 blob 不一致问题；EI-2A 未获 Owner 授权，不得启动。
- 下一交付：GPT 核对 EI-1/EI-2 实际代码和设计基线；先闭合身份绑定、canonical self、conversation 边界与 Memory/Channel 契约；GPT 直接实施已获授权且不改变汐实际行为的代码/测试优化；DSH 按指定 commit 做本地/设备验证，GPT 独立验收。
- 改变真实人格、情绪或持久化行为的修改，先说明影响并请求 Owner 授权。

## 四、其他常驻工作线状态

### Channel Bridge
- 仓库：ba-song/dsh-channel-bridge
- 已知 main HEAD：bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13（执行新任务前重新核对）。
- 历史 P0-1 审查发现群消息 sender_id 未贯通，可能把群号/群成员错误归属为 speaker/Owner。
- 下一交付：精确 HEAD 的全量测试与 sender_id 到 session、group-turn、transcript、handover 的身份链修复和验证。
- 不发送真实 QQ 消息；真实外发需 Owner 明确授权。

### Douyin
- 当前状态：暂停。
- Owner 明确要求暂不做 Douyin 内容。不得自行安排实现、调研或占用其他智能体资源。

### Autonomy / Life
- 仓库：ba-song/dsh-autonomy
- 已知 main HEAD：6c4a4753b4737060211955b1f022cab2f1d39521（执行前重新核对）。
- v4 恢复协议设计与 Android 对齐不代表实机运行通过。
- 源码存在 realSafe 执行路径；实际 profile 开关需以合法只读证据确认。
- 不擅自启动 tick、Home 唤醒、真实 executor、自动回复或 QQ 外发。

### Android
- 仓库：DSH-APP/DSHA
- 已知 main 提交线索：36d89b72294348d0482d509109cf8e76d51fc1cb（执行前重新核对）。
- v4 后台恢复设计仍需真机证据；kill/reboot、双 worker、fsync、ENOSPC、FGS/OEM/force-stop 等项目不可用文档对齐替代。
- 故障注入、权限变更、重启等操作需单独授权。

## 五、跨模块依赖

1. Memory、Persona、Channel Bridge 必须共同保证身份、conversation、speaker/experiencer 归属正确。
2. Host provenance 是工具执行信任边界；Host 阶段通过不代表 Memory 或 P0-1 整体通过。
3. Android 与 Autonomy 的设计协议一致不代表设备恢复已经验证。
4. Douyin 暂停，不作为当前主线依赖。
5. 六个常驻智能体可以并行，但同一代码文件/同一分支必须避免并发冲突；GPT 统一控制 GitHub 修改和集成节奏。

## 六、负责人执行原则

- GPT 是 GitHub 侧实际开发者与项目技术负责人，不只是任务提示词编写者。
- DSH 是本地环境、真实设备和运行期验证执行者；GPT 不假称已操作设备。
- 用户是 Owner、最终决策与授权人，也是 GPT 与 DSH 的唯一中转人。
- 优先 Memory 与 Persona 优化；Douyin 暂停。
- 任务以代码、测试、实机证据和可用能力交付衡量，不以报告数量衡量。
- 每次交付记录仓库、分支、基线、HEAD、diff、测试命令/exit code、实机证据和未解决风险。
- 生产默认只读；未经明确授权不合并、部署、重启、迁移、写生产 DB、修改生产配置、真实外发或执行不可逆操作。
