# DSHA「汐」统一交付看板

> 版本：BOARD-0001  
> 更新时间：2026-11-23 21:10（Asia/Shanghai）  
> 维护者：项目负责人 GPT  
> 定位：交付状态快照；以各仓库精确 commit、专项报告和可复核测试证据为准。此看板不替代代码、HANDOFF 或专项报告。

## 状态口径

- **已完成（隔离验收）**：指定开发分支的代码/测试证据已验收；不代表生产集成或部署。
- **进行中**：已有明确目标和执行中的任务，尚未达到验收门槛。
- **待复验**：已有代码交付，但最新目标 HEAD 尚无独立测试结果。
- **阻塞**：存在明确安全、兼容、授权或验证缺口。
- **未验证**：当前没有足够的代码/运行时/测试证据。
- 调研、开发、测试、集成、生产验收分别记录，不互相替代。

## 六条专业工作线

| 工作线 / 智能体职责域 | 权威仓库 | 当前已核对基线 | 当前状态 | 正在执行 / 下一交付 |
|---|---|---|---|---|
| Memory（记忆、事实/经历、来源、召回与修订） | [ba-song/dsh-memory-core](https://github.com/ba-song/dsh-memory-core) | main `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`；minimal-integration `a63f994e001da2e6636ed07c75988fa681ecaf7c) | **待复验 + 集成阻塞**。A–E 累计栈 `4bf92aad...` 隔离代码 PASS，但相对 main 有 300 commits / 117 files；不得直接合并。minimal-integration 新 HEAD 的复验尚未见结果。 | 先对 `a63f994e` 做全量、专项和 N9 复验；独立评估 A–E 窄范围集成策略。禁止将 v3/v5 schema 分支直接混入 v4 最小集成。 |
| Persona / EI（身份、人格、情绪与关系状态） | [ba-song/dsh-persona-core](https://github.com/ba-song/dsh-persona-core) | main `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；EI-1 目标 `3a137618...` | **EI-1 隔离代码 PASS；设备复验未验证；EI-2A 未授权**。EI-2 设计分支与报告分支曾存在 blob 不一致。 | 统一 EI-2 设计与报告基线；整理 EI-1 设备复验所需材料。未获 Owner 授权前不启动 EI-2A，不改变真实情绪/人格行为。 |
| Channel Bridge（QQ/OneBot 收发、会话与群成员身份） | [ba-song/dsh-channel-bridge](https://github.com/ba-song/dsh-channel-bridge) | main `bffcabc306a21e3cbdb7549ab3bfca8e2ec43f13` | **P0-1 阻塞**。群成员 speaker 身份链此前独立审查 REJECT；旧 550/550 测试数字不绑定当前 main HEAD。 | 在精确 main HEAD 复跑 fake-transport 全量测试；修复/验证 sender_id 到 transcript/group-turn 的端到端身份保真，并证明 handover 不把群成员误标 Owner。 |
| Douyin（抖音浏览、通知与私信适配） | [ba-song/dsh-douyin](https://github.com/ba-song/dsh-douyin) | main `da799dd4492ad5093aa0c5cd9376d68919a6ebd3` | **功能代码存在；当前运行配置未验证**。README 声明 watcher 默认关闭；与 Autonomy 通知订阅并启用时有重复投递风险。 | 在不改配置、不发消息前提下核对 main 全量测试与通知/私信事件接口；与 Autonomy 联合审查重复投递和 owner 路由。 |
| Autonomy / Life（目标、Home、唤醒、主动行动与审计） | [ba-song/dsh-autonomy](https://github.com/ba-song/dsh-autonomy) | main `6c4a4753b4737060211955b1f022cab2f1d39521` | **代码含 mock/dry-run 与 realSafe 执行路径；实际 profile 开关未核实**。v4 恢复协议设计对齐，不代表实现或真机运行。 | 只读核对实际 profile 开关、Douyin watcher 订阅、QQ send gate；复核 realSafe 可达路径。未核实前不启动 tick、executor、唤醒或自动回复。 |
| Android / DSHA（宿主、设备桥、后台生命周期与恢复） | [DSH-APP/DSHA](https://github.com/DSH-APP/DSHA) | main `36d89b72294348d0482d509109cf8e76d51fc1cb`（本轮提交搜索所见） | **设计对齐；真机验收未完成**。Android/Autonomy v4 的 60 秒观察窗已由 Autonomy 采纳，但 Android 报告仍有 PARTIAL；kill/reboot、双 worker、fsync、ENOSPC、FGS/OEM/force-stop 等证据未齐。 | 先核对当前 Android main 的 AGENTS/测试规范与报告版本；按风险排序准备真实设备验收矩阵。故障注入、kill/reboot、权限变更须单独授权。 |

> 六条工作线是根据当前可访问仓库与 HANDOFF-0076 中的四专业智能体审计、Autonomy 和 Android 独立工作线归纳的职责域。当前 GitHub 证据未完整证明六个运行中智能体的实际 agent ID、分配人和在线状态；不得虚构名称或宣称已确认运行实例。

## 横向 P0：Host Runtime provenance（临时工程任务，不是第七个常驻业务智能体）

- 仓库：`ba-song/dsh-harness-host-provenance`
- 上轮实现 HEAD：`98f0b832e8a09c277ee4d9f4b36a3706780f786d`
- 上轮报告：`ba-song/dsh-memory-core` 分支 `report/host-tool-exec-provenance`，commit `15085641e46410af97db91514df4503458dddb50`。
- 状态：**PARTIAL / Host 安全验收未通过**。T01–T14 与报告测试日志通过，但 GPT 独立审查发现公开 capability claim 入口与 `get(name).execute()` handler 旁路；本轮已交付第二阶段修复任务，等待临时工程角色交付。
- 下一交付：关闭普通插件 capability 签发与真实 handler 旁路，补真实负向测试、全量回归、typecheck、catalog，并提交 REMEDIATION-REPORT。
- 限制：不注册常驻智能体；不触碰 Memory/Persona/Bridge/Android 业务行为；不合并、部署、重启或操作生产。Host PASS 仅是 Host 阶段 PASS，不代表 P0-1 整体 PASS。

## 跨工作线阻塞与依赖

1. **P0-1 身份与会话隔离**：Host provenance、Memory session capability、Channel Bridge 群成员 sender_id、Persona session binding 必须各自闭环；任一模块的 PASS 不能替代其他模块。
2. **Memory 集成风险**：A–E 累计分支相对 main 范围过大；minimal-integration 与 wake-capture 分支 schema/index 冲突，禁止直接合并。
3. **通知与外发**：Douyin notify watcher 与 Autonomy 订阅可能重复投递；Autonomy 存在真实自动私信回复路径，profile 未核对前不得启用。
4. **情绪数据流**：Persona raw emotion snapshot 已存在；Memory episode emotion link 与情绪召回信号尚未闭环。
5. **设备恢复**：Android/Autonomy v4 设计对齐，不等于设备端 kill/reboot 与后台恢复已验收。
6. **Host → Memory 顺序**：Host 独立验收 PASS 后才申请 Memory 阶段授权；未 PASS 前不启动 Memory provenance 改造。

## 负责人当前执行顺序

| 优先级 | 工作 | 类型 | 交付门槛 |
|---|---|---|---|
| P0-1 | Host capability claim + handler bypass 修复 | 开发 → 测试 → GPT 独立验收 | 真实攻击路径负向测试、原回归、类型检查、catalog、报告齐全 |
| P0-1 | Memory minimal-integration 新 HEAD 复验 | 测试 | 精确 HEAD、全量测试、N9、工作树/日志证据 |
| P0-1 | Channel Bridge 群成员身份链 | 开发/测试 | 精确 main HEAD 的 sender_id 全链路测试，群成员与 Owner 不混淆 |
| P1 | Autonomy/Douyin 实际配置与重复投递只读核查 | 调研（服务执行） | 脱敏 profile 事实、调用链、默认开关与重复投递测试 |
| P1 | Persona EI-1 / EI-2 交付同步 | 集成准备 | 报告/设计 blob 一致；EI-1 设备复验；EI-2A 需单独授权 |
| P1 | Android v4 设备验收准备 | 测试准备 | 与 DSHA 当前源码/设备版本绑定的测试矩阵；执行前授权 |

## 验收与更新规则

- 每项交付必须绑定仓库、分支、精确 HEAD、diff 范围、测试命令/退出码/日志、未验证项和副作用声明。
- DSH/专业智能体的自评不等于负责人独立验收。
- GitHub CI、隔离 worktree 测试、DSHA 实机测试、生产运行验收分别记录。
- 不因分支存在或文档报告存在而推断代码已合并、部署或启用。
- 任何会改变汐实际记忆、人格、情绪、召回、自动写入或行动行为的工作，先说明具体影响并按既有授权规则处理。
- 生产写入、profile/config 修改、合并、部署、重启、真实 QQ/抖音操作和设备故障注入，不因负责人接任自动获得授权。
- 本看板每次只更新真实状态变化；无新证据时标记“未验证/待复验”，不制造管理性进度。
