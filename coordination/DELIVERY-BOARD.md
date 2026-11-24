# DSHA「汐」统一交付看板

- 版本：BOARD-0008
- 更新时间：2026-11-24 11:28（Asia/Shanghai）
- 负责人：现任项目负责人（GPT）
- 权威原则：代码状态以精确仓库/分支/commit 为准；自动化测试以绑定该 commit 的 CI/原始日志为准；设备状态以 DSH 实机证据为准。
- 本看板区分“历史专项报告结论”和“本轮重新核实结论”，不把历史 PASS 自动延续到新 HEAD。

## 1. 六条常驻专业工作线

| 智能体/工作线 | 权威仓库 | 最新可核实基线 | 当前状态 | 正在推进 / 下一交付 |
|---|---|---|---|---|
| Memory | ba-song/dsh-memory-core | main `752cd086`；P0-1 分支 `61ea91ef` | **IN_PROGRESS；RawArchive adapter CI PASS，planner 输入防御测试 CI PASS** | 独立审查 adapter 的 scope/lineage；补 planner lineage 测试；adapter 暂不接入运行时；跨分支 schema/历史栈仍隔离 |
| Persona / EI | ba-song/dsh-persona-core | main `a84c7bad`；EI-1 验收目标 `3a137618` | **EI-1 代码隔离 PASS；设备复验 NOT RUN；EI-2A BLOCKED** | EI-2 设计与报告 blob 已同步（55cd080）；独立复核设计边界；准备 EI-1 设备复验材料；EI-2A 仍不启动 |
| Channel Bridge | ba-song/dsh-channel-bridge | main `bffcabc3` | **MAIN 基线 CI PASS；群记忆重试修复 PR CI PASS** | main `bffcabc3`：562/560/0/2；修复分支 PR #3 最新 HEAD `4f74b4d`：566/564/0/2；增加写入结果不确定时保持稳定幂等轮次 ID 的回归测试，fake-only |
| Douyin | ba-song/dsh-douyin | main `da799dd4` | **EXACT-HEAD CI PASS（隔离分支）** | check PASS；310 tests / 310 pass / 0 fail / 0 skipped；fake/local tests |
| Autonomy / Life | ba-song/dsh-autonomy | main `6c4a4753` | **DESIGN/STATIC REVIEW；REAL EXECUTION BLOCKED** | 只做静态与 fake 测试；核对 realSafe/自动回复调用链；不得启动 tick、Home、执行器或真实发送 |
| Android | DSH-APP/DSHA | main `36d89b72`（build357） | **DEVICE VALIDATION NOT RUN** | 同步 60 秒观察窗文档状态；准备只读设备基线与验收步骤；kill/reboot/权限变更/安装需另行授权 |

> 六条工作线的专业负责人/智能体报告是最近可恢复的职责证据；我当前不能直接观测各智能体是否在线或是否正在运行。看板中的“状态”是仓库、报告与测试证据状态，不伪称六个智能体此刻均在后台执行。

## 2. 本轮新交付（2026-11-24）

### Memory / P0-1 RawArchive 范围修复与 planner normalization

- 仓库：`ba-song/dsh-memory-core`
- 分支：`fix/p0-1-trusted-handoff-continuity`
- PR：[#3](https://github.com/ba-song/dsh-memory-core/pull/3)，Draft / open / not merged
- RawArchive adapter HEAD：`85c419b1ae6328b48c3edec6f6ea47c5b170f149`；planner hardening HEAD：`61ea91efadc9cdefe05debb0c5e81c9e456626ed`

提交：
- `475c813d28278c05ae1df0827137248908d57f2e`：语义向量命中回查增加 cwd 范围限制；上下文窗口命中行与邻近行均限制同 cwd 并排除 tombstone。
- `8481d9f881c7614bab49f61105802a86826ac745`：新增 3 组语义检索/上下文范围回归测试。
- `485af1fb7955515e5ace1b2e3c3a4c351825f628`：新增 host-authorized、owner-private、精确 cwd 限制的只读 recovery adapter。
- `cffd82192802891aee9f2fbd3032ae33b3d299a9` / `85c419b1ae6328b48c3edec6f6ea47c5b170f149`：adapter 测试和 host cwd 精确匹配修正。

验证：
- Push CI：run [45315021052](https://github.com/ba-song/dsh-memory-core/actions/runs/45315021052) — SUCCESS
- PR CI：run [45315015204](https://github.com/ba-song/dsh-memory-core/actions/runs/45315015204) — SUCCESS
- RawArchive scope 修复 HEAD `8481d9f` 的两份原始 job log：147 tests / 146 pass / 0 fail / 1 skipped。
- Recovery adapter 最终 HEAD `85c419b` 的两份原始 job log：151 tests / 150 pass / 0 fail / 1 skipped。
- Planner hardening Push CI：run [45317824146](https://github.com/ba-song/dsh-memory-core/actions/runs/45317824146) — SUCCESS，151 tests / 150 pass / 0 fail / 1 skipped，绑定 HEAD `61ea91e`。\n- Adapter 尚未注册到运行时，也未连接 planner；因此不代表汐已获得主动恢复功能。此结果只证明 GitHub 隔离 CI；DSHA 本地/真机验证仍未完成。

### Channel Bridge / Douyin 精确 HEAD CI 工作线

- Channel Bridge：Draft PR [#2](https://github.com/ba-song/dsh-channel-bridge/pull/2)，分支 `ci/exact-head-tests-20261124`，workflow commit `2db5480`，基于 main `bffcabc3`；CI 成功，562 tests / 560 pass / 0 fail / 2 skipped。只执行 fake/local tests。\n- Channel Bridge 群记忆可靠性修复：Draft PR [#3](https://github.com/ba-song/dsh-channel-bridge/pull/3)，分支 `fix/group-turn-memory-retry`，HEAD `7a30c34ded5c7dd09ef3cc1e354311a526b6562d`；新增失败保留/成功后游标提交/每群单飞，Push CI run `45317155429` 和 PR CI run `45317162736` 均 SUCCESS，原始日志：中间 HEAD `7a30c34` 为 564/562/0/2；最新 HEAD `296388f` Push CI run `45317781456` SUCCESS，**565/563/0/2**。
- Douyin：Draft PR [#1](https://github.com/ba-song/dsh-douyin/pull/1)，分支 `ci/exact-head-tests-20261124`，最新 workflow commit `bb288a8`，基于 main `da799dd4`；`npm run check` PASS；两份原始 job log 均为 310 tests / 310 pass / 0 fail / 0 skipped。测试只用 fake/local transport。

## 3. 历史成果与当前不可混淆的状态

| 工作项 | 最近可用证据 | 当前结论 |
|---|---|---|
| P0-1 trusted session registry | `8bf81ae` 对应历史 CI 142 tests / 141 pass / 0 fail / 1 skip | 历史代码验证 PASS；不替代当前 HEAD CI |
| Provenance audit / recovery planner | 历史 CI 与只读原型报告 | 只读诊断/规划原型；未接真实 archive、diary、授权层或记忆写入 |
| Source adapter design | `be51e3b` CI run `45314484228` SUCCESS | 设计完成；不是运行时适配器 |
| 情绪系统 | 用户明确确认 Android 设备上至少部分情绪系统实际运行；仓库默认配置不代表设备配置 | 尊重设备侧事实；具体子功能/跨轮次表现未由本轮实机验证；不擅改情绪配置 |
| Memory minimal-integration | `a63f994` | 历史状态 WAITING REVERIFY；不可用旧 HEAD 测试代替 |
| Memory wake-capture | `0fdae988` | 隔离测试历史 PASS；与 minimal-integration 有 schema/index 冲突，未获真实写入接入授权 |
| Memory A–E validity stack | `4bf92aad` | 历史隔离测试 PASS；约 300 commits / 117 files 相对 main，禁止整栈直接合并 |
| EI-1 | `3a137618` | 定向 21/21、全量 324/324 的历史代码隔离 PASS；设备 NOT RUN |
| EI-2 / EI-2A | 设计文件已同步至 blob `670e5a34`（commit `5fc6d70`）；报告追加同步记录（`55cd080`） | 文档基线一致；EI-2A 仍 NOT RUN / 未获授权，不实施 |
| Channel Bridge | main 基线 PR #2 CI `562/560/0/2`；群记忆修复 PR #3 最新 CI `566/564/0/2` | 修复分支通过隔离 CI；仍需 code review 和 fake failure replay 扩展，未合并 |
| Douyin | 历史审计未运行；本轮 Draft PR #1 CI `310/310/0/0` | 当前 main 基线 check/test 隔离 CI PASS；自动回复/重复通知审查未完成 |
| Autonomy | 历史 main CI 有成功记录；默认 disabled/dryRun | 不代表设备 profile 状态；真实执行路径不启动 |
| Android | main build357 源码/文档可读 | 无本轮真机证据；恢复协议设计对齐不等于运行验收 |

## 4. 并行安排与依赖

1. **Memory（主线）**：由项目负责人推进 P0-1 只读 adapter 与安全测试；先完成可信 session → owner/scope → source adapter 的只读链路，不写真实记忆。
2. **Channel Bridge（可并行）**：群记忆失败/限流重试与 in-flight 新回复二次调度修复已完成隔离 CI；下一步独立审查幂等和时间戳边界，只 fake transport。
3. **Douyin（可并行）**：精确 main check/test 与 watcher 契约专项；只 fake transport。Autonomy 联合评审通知去重，不启动真实自动回复。
4. **Persona/EI（可并行）**：只同步 EI-2 设计基线和 EI-1 验收材料；不实施 EI-2A，不改 Memory 仓库。
5. **Autonomy（可并行）**：静态审查 realSafe/自动回复门禁与 fake contract tests；不得启动真实执行器。
6. **Android（准备线）**：只读设备版本/profile/权限基线和验收脚本准备；任何 kill/reboot/安装/权限变化等故障注入先单独授权。

跨模块依赖：
- Memory / Persona / Channel Bridge：speaker、experiencer、conversation、group scope 身份一致性。
- Douyin / Autonomy：通知只能有明确唯一投递责任方；自动私信回复需独立授权。
- Android / Autonomy：后台恢复设计必须用设备证据验收；设计一致不能代替运行结果。
- Host Runtime 是临时工程线，不计入六条常驻专业工作线。

## 5. 授权与验收门禁

- GPT 可自主进行常规代码、测试、审查、分支、PR 和文档工作。
- 不合并 PR、不部署、不重启、不写生产数据库、不改生产 profile/config、不执行真实渠道外发。
- 不启用真实 tick、Home 唤醒、自动记忆写入、自动回复或其他会改变汐实际行为的路径。
- 不改变汐人格、记忆、情绪、自主决策或关系行为，除非先向 Owner 说明具体影响并取得批准。
- DSH 实机验证由用户/DSH 执行；GPT 不声称已连接设备。
- 每个 PASS 必须绑定精确 commit、测试命令与原始结果；CI PASS、DSH 本地 PASS、Android 真机 PASS、生产 PASS 分层记录。

## 6. 本负责人下一轮交付顺序

1. 对已实现的 RawArchive adapter 做独立安全审查，补 planner-normalization 防御测试；保持未注册、只读、不触碰真实记忆数据。
2. Channel Bridge 审查 PR #3 并补并发边界测试；Douyin/Autonomy 审查 watcher 双投递和自动 dmSend 门禁，均只做 fake/static。
3. 独立复核 Persona 已同步的 EI-2 设计，保持 EI-2A BLOCKED；准备 EI-1 设备复验资料。
4. 对 Autonomy 做静态/fake contract 检查，找出可在不运行真实执行器情况下闭合的缺口。
5. 准备 Android 只读验收包，等待用户参与设备验证。
6. 每轮只更新本看板和必要 HANDOFF 记录；不新增大量研究文档。
