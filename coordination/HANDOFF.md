# GPT ↔ DSH 项目交接状态

> 文件：`coordination/HANDOFF.md`  
> 交接分支：`coordination/project-handoff`  
> 仓库：`ba-song/dsh-memory-core`  
> 版本：`HANDOFF-0019`  
> 更新时间：2026-11-20 13:50（Asia/Shanghai）  
> 更新者：DSH  
> 性质：当前协作状态的单一入口；覆盖式维护，Git commit 历史保留旧版本。

---

## 0. 首要规则：上下文与记忆提醒

GPT 与 DSH 每次开始工作前，必须完整阅读本文件，不得只看最后更新摘要。DSH尤其容易丢失跨会话背景，必须同时遵守本文件中的项目总纲、已确认决策、角色边界、阶段状态、证据要求和授权门禁。

- 不得猜测缺失事实，不得把计划写成已执行结果，不得把CI结果说成DSHA本地或生产验收。
- 不得重复已经有充分证据完成的工作；不确定是否完成时先核对证据。
- 遇到本文件与代码、数据库、日志或用户最新明确指示冲突时，停止受影响操作，报告冲突并等待负责人裁决。
- 信息缺失、证据不足、环境/版本不明、授权不明确时，先停在只读核查或报告阶段。
- 用户是唯一项目负责人、GPT与DSH之间的唯一中转人及生产操作最终授权人。GPT不得绕过用户直接联系DSH。
- 本文件是交接状态，不是自动授权书。**任何生产操作仍须用户在当前对话中单独、明确授权具体范围。**

## 1. 角色与协作边界

### GPT负责
- GitHub开发分支源码审查、实现、测试设计、代码修改与提交。
- 架构分析、技术决策建议、评测设计、审查DSH证据和更新本交接文件。
- 不把GPT能够独立完成的GitHub开发/源码审查转交给DSH。

### DSH负责
- DSHA本地环境、真实数据库与文件系统的只读核查。
- 隔离环境脚本运行、设备端测试、真实模型测试、运行时验收并提交可复核证据。
- 按本文件协议更新交接状态；未经用户单独授权不得触碰生产数据或部署。

### 用户负责
- GPT与DSH之间的唯一中转。
- 对生产写入、迁移、删除、部署、重启及其他有副作用操作作最终授权和决策。
- 文件内容不得推定用户已经批准任何未明确授权的操作。

## 2. 仓库与分支

- 仓库：`ba-song/dsh-memory-core`
- 主开发分支：`feat/m1-preference-memory`
- 交接专用分支：`coordination/project-handoff`
- 本文件：`coordination/HANDOFF.md`
- 开发分支最后一次已知基线（来自上一轮GPT记录，当前交接创建时尚未重新独立核实）：`ecad69d9386e731b86d6dd4306d2d5379581d47f`
- 该基线对应的GitHub Actions #35：225 passed、0 failed、2 skipped。Actions页面： https://github.com/ba-song/dsh-memory-core/actions/runs/44671923888
- 开发分支：https://github.com/ba-song/dsh-memory-core/tree/feat/m1-preference-memory
- 交接分支：https://github.com/ba-song/dsh-memory-core/tree/coordination/project-handoff

**开始源码工作前仍须重新读取开发分支HEAD并记录实际SHA。** 本次HEAD已核实，但后续可能变化。

## 3. 文件维护协议（覆盖式更新）

本文件是当前状态的单一入口，不是无限增长的流水账。更新时重写完整文件，保留仍有效的决策、约束、待办和证据链接；删除过时状态前必须确认其已被新证据取代。Git提交历史保留旧版本。

### 每次读取
1. 从 `coordination/project-handoff` 分支读取本文件最新版本。
2. 记录当前版本号、文件blob SHA、更新时间和开发分支HEAD。
3. 先阅读全部章节，再开始任务。

### 每次写入
1. 先重新读取最新文件，不能使用会话缓存中的旧副本覆盖。
2. 基于最新文件完整合并自己的更新。
3. 更新版本号（例如 `HANDOFF-0002`）、时间、更新者和摘要。
4. 更新时使用刚读取的blob SHA作为乐观并发条件；GitHub Contents API更新必须提交当前文件SHA。
5. 如果SHA冲突、push被拒绝或分支HEAD已变化，禁止强制覆盖；重新拉取、合并双方内容后再提交。
6. GPT和DSH不得并行对同一文件做无条件覆盖。建议一次只由一方更新；另一方先拉取最新版本再继续。
7. 每次更新必须写明：完成事项、未完成事项、证据/commit/日志路径、测试结果及副作用。
8. 只更新交接分支，不把交接文件合并进插件开发分支，除非用户另行决定。

### 更新摘要格式
- 更新者 / 时间 / HANDOFF版本
- 基于的旧文件blob SHA（可写短SHA）
- 本次改变
- 证据链接、代码commit或DSHA报告路径
- 状态变化与仍待处理事项

## 4. 状态标签与证据标准

只允许使用以下明确状态：
- `已完成（有证据）`
- `进行中`
- `待GPT`
- `待DSH`
- `待用户决定/授权`
- `阻塞（说明原因）`
- `未验证`

报告必须区分：
- GitHub CI测试 ≠ DSHA本地测试 ≠ 生产运行时验收。
- 代码已提交 ≠ 已部署。
- 只读检查 ≠ 写入操作。
- 测试跳过 ≠ 测试通过。
- 未拿到日志/命令/退出码/原始统计时，标记“证据不足/未证实/未运行”，不得报告PASS。

DSH提交本地证据时至少包含：设备/OS/Node/SQLite/插件版本、实际commit、DB和文件目录（必要时脱敏）、执行命令与参数、统计口径、原始结果、日志和退出码、产物实际路径、副作用说明。不得输出密码、token、个人邮箱或其他凭据。

## 5. 总体目标

建设可靠、可追溯、可解释、可纠错且权限安全的记忆系统，使汐能准确保存和召回偏好、事实、经历、关系、项目决策与未完成事项；重要记忆能追溯原始消息/会话窗口/时间/来源/引用；支持偏好变化、事实纠正、有效时间和修订历史；更新时保证正文、FTS、向量、实体、关系、引用和撤回状态一致；自然交流中避免盘问；建立只读、离线、可复现的检索评测。

优先增强现有架构，不为形式而重写，不引入缺乏证据支持的复杂结构。

## 6. 已确认的长期安全与授权门禁

以下操作没有用户针对具体操作的单独明确授权时一律禁止：
- 生产数据库写入、删除、迁移、清理或状态变更。
- 生产源码、profile、配置修改；部署、重启或服务切换。
- 真实episode/memory/原话的改写、归档、失效、撤回、删除。
- 改变汐的记忆、人格、行为或规则。
- 可能产生副作用的dryRun、整理、衰减、向量补算、评测或维护任务。
- 对真实数据执行任何批量操作。

开发分支代码修改与生产操作授权严格分离。隔离测试也必须确认不会连接生产DB或真实数据目录。已知 `dailyConsolidate()` 的dryRun并非完全无副作用（会写style file和operation ledger），不得把它当成安全只读操作。

## 7. 项目阶段与已完成事项

### M1 / M2 / M3
- M1：已生产部署验收。
- M2：已生产部署，182/182复验通过。最近一次只读统计：pending=0、memories=212、vectors=210、revisions=14、persist=3。观察期内不得重复M2数据收口、向量补算或状态迁移。
- M3-1：已生产部署并通过运行时验收；跨会话经历索引真正新会话首轮运行时证据仍待补验。
- Q3-A规则机制：已生产上线，规则表0行符合预期。规则预算400字、最多5条、单条70字；owner私聊/家，首版无群规则；冲突人工处理；更新supersedes，撤销revoked。未授权不得添加真实规则或测试规则。

### M3-2历史episode治理只读盘点
已完成生产只读盘点，报告路径：
`/sdcard/DSHA/插件优化/M3-2_生产episode只读盘点与技术评估.md`

主要结论：
- 80条episode，active79 archived1；owner37/group43；pinned0；valid_to全空。
- 来源：group-turn43、multimodal17、email8、chatlog4、handoff3、service2、p4 1、manual2；layer auto71/manual9。
- source_msg_id77、source_ts>0为72、source_file7（路径均不存在）、source_ref10、quote0、meta有效80/80。
- 证据完整度分类A8/B71/C1/D0。此分类不是改写适格分类。
- 质量问题：2条自动化测试邮件；17条多模态（16图片，其中8条完全相同占位）；4条chatlog长摘录323-354字；3条handoff碎片；43条群聊原文；12条少于20字、3条超过300字。
- 向量80/80（dim512、孤儿0）；FTS80/80（孤儿1，ghost rowid80）；实体关联7/80；revision仅1条（archived #63）。
- 重复：8条完全相同图片占位；30对≥0.8近似（多为图片）；同一抖音source_ref两条（#83正常、#86验收残留）。
- 改写适格分类A=0、B=2（其中一条验收残留）、C=78。不得与证据完整度分类混淆。
- 没有任何条目同时满足来源可靠、确有质量问题且可安全改写；不可自动改写。
- #83是真实抖音观看记录；#86是验收残留，不可连带处理#83。
- `updateMemory()` 更新正文同步FTS，但不自动同步vectors、memory_entities等；不可直接批量调用。
- `dailyConsolidate()` dryRun有副作用。

## 8. 当前待办与阻塞

### A. M3-2A-REPORT-01
状态：**待DSH（已授权的只读报告任务，尚未收到结果）**。
目标：只读生成episode候选报告。
约束：不得进入M3-2B；不得清理或改写episode；不得运行有副作用的dryRun。
等待DSH提交报告和证据后，GPT审查，不得预先声称完成。
DSH原报告/交付应按任务书要求提供实际路径、命令、原始统计、日志和退出码。

### B. M3-REF-06
状态：**待DSH（已提供只读验证任务书，尚未收到结果）**。
原WritingBlock任务书ID：`62418`。
报告目标路径：
`/sdcard/DSHA/插件优化/M3-REF-06_DSHA本地只读验证与风险复核.md`
范围：
1. 核对本地生产版本/commit/Node/SQLite/DB路径/raw目录/embedding路径。
2. 临时DB复现旧版 `searchArchive(withContext)` tombstone相邻消息泄漏。
3. 临时DB验证tombstone是否跨cwd误标。
4. 临时目录验证cleanup是否只删文件并保留DB索引。
5. 生产DB只读统计30天以上raw及关联表，不输出正文。
6. 临时DB验证updateMemory对FTS/vector/entities/relations/revisions/quote的一致性和回滚能力。
7. 评测脚本安全复核。
8. 隔离worktree/clone运行npm test重点provenance/tombstone/archive-window/session-index/revision-cas/access-count/recall-count。
9. 核对M3-2A-REPORT-01是否执行。
禁止：代码修复、GitHub写操作、生产DB写、生产配置/源码改动、部署、重启、改写/清理真实数据。
收到结果后GPT审查证据，必要时要求补证。

### C. M3-1跨会话索引运行时补验
状态：**待DSHA真实运行时证据**。不得把已有部署验收误当作该专项证据。

### D. 评测工具可信度
状态：**已完成（有证据，GitHub CI通过）；DSHA本地/真实数据评测仍未验证**。
- `10a514317566794e5f627f74dcd7bc9023ad7e80`（`fix(eval): verify runtime commit for graded recall runs`）新增 `verifyCodeCommit()`。
- 正式人工标注评测（存在正向grade标签）必须显式提供 `--code-commit`；脚本独立执行`git rev-parse HEAD`并检查`git status --porcelain --untracked-files=all`，要求真实工作树clean；CLI SHA、数据集`codeCommit`、检测到的HEAD三者完全一致，否则拒绝正式评测。
- 未标注探索性评测可在非Git/dirty目录运行，但只能显示未验证；报告新增`actualCodeCommit`、`suppliedCodeCommit`、`sourceCheckout`和`codeCommitVerification`，不能冒充已验证。
- 新增回归测试覆盖缺少参数、commit不匹配、格式错误、匹配成功及未标注探索性评测不宣称verified。
- README已补充运行命令：`--code-commit "$(git rev-parse HEAD)"`。
- `10a514...` 对应Actions run #36成功（job `test` / `Run test suite` 均success）：https://github.com/ba-song/dsh-memory-core/actions/runs/44672947093
- 随后的文档提交 `22003dbc1cb99eedf911c3e4fbf1ee6de1d9b924` 对应Actions run #37成功：https://github.com/ba-song/dsh-memory-core/actions/runs/44673062260
- CI成功不等于DSHA设备端模型评测或生产运行时验收。

### E. 多路召回与注入边界
状态：**待GPT继续源码审查**。
上一轮GPT检查记录：三路召回使用RRF排序；`explainRrf()`可解释候选的召回通道、排名与贡献；`eventChainCandidates()`是只读候选扩展，不直接改变召回排名或自动注入；自动注入另有语义分数、关键词重合度和字符预算门槛。
当前策略：不贸然改变生产注入排序。进一步检查融合分数、注入门槛、排序解释和离线指标是否一致，先做只读审查/隔离测试。

### F. CI跳过的模型测试
状态：**待DSHA补证**。
GitHub Actions #35结果225通过、0失败、2跳过；两个跳过项为 `p4-vector-conflict-corpus` 与 `p4-ingest-pipeline`，原因是GitHub Runner没有安装DSHA的BGE模型。真实embedding模型检索没有因此得到验证。DSHA设备具备模型时可在隔离测试环境补测；不可连接生产库或更改生产状态。

## 9. home 永久档案并行专题（不阻塞主线）

### 已确认的产品决策
1. 插件双写。
2. raw写成功优先；永久档案尽力而为，允许失败。
3. 每15天导出补齐。
4. raw删除不影响永久档案。
5. 撤回消息保留正文并标“已撤回”。
6. 工具调用/结果保留全文。
7. 明文。
8. 永久保留。
9. 不自动删除、不覆盖历史，只追加。
10. 只处理home，cwd=`/sdcard/DSHA/生活/数据/home`；group/email不写。
11. 不改变raw语义、recall/hits、M3-1、注入和预算。
12. 本阶段不部署调度，可先手动执行导出脚本。

### 路径与数据格式
- 永久目录：`/sdcard/DSHA/记忆/档案/永久/home/`
- 首次导出已存在：16天、1902轮、约5.3MB；按天Markdown、turn单元；尚未持续写入。
- 预期结构：
  - `home/_events/YYYY-MM-DD.jsonl`
  - `home/YYYY-MM-DD.md`
  - `home/INDEX.json`
  - `home/README.md`
- JSONL事件字段：`raw_id,day,seq,role,time,at,text,tombstone,extra,emotion`；raw_id唯一。
- 撤回追加 `{"type":"tombstone","raw_id":123,"at":"..."}`，不修改旧事件。
- 情绪写入时可用则写，不可用留空供导出器回填。
- 工具全文保留；机制事件（事/步/量/境/系）不进入可见档案。

### GPT已在开发分支实现的第一版（尚未DSHA本地验收）
最近已知提交：
- `ffa7a351a5107b6c686845e77d728a68ab764a50`：home永久档案第一版，新增 `lib/permanent/home-archive.js`、`scripts/export-home-archive.mjs`、`tests/permanent-home-archive.test.mjs`，并修改 `lib/ingest/archive.js`、`lib/config.js`、`lib/index.js`、`package.json`。
- 目标行为：raw成功后best-effort双写；raw_id去重；撤回追加事件；精确home路径限制；DB只读补齐和Markdown生成。
- `2ecb329538dd659af70a2c2af898705cc76c9237`：增加归档root、`_events`目录、JSONL文件符号链接拒绝；读取/追加日志使用`O_NOFOLLOW`。
- `630cfb1d571ec5252b5ff5e7c88a2bfd47bed3ec`：补导出器输出root、`_events`及派生`INDEX.json`符号链接拒绝测试；Actions #42成功（231 tests / 229 pass / 0 fail / 2 skipped）。
- `d96b11bed6edeb70e23ce2facef2fcaa343211d2`：导出器情绪读取改为仅按home raw_id集合分批查询，不再全表扫描其他cwd的`raw_emotion_archive`；Actions #43成功（231 tests / 229 pass / 0 fail / 2 skipped）。
- `27d0806fdeb788c2f2e9dae204bfeb8ac402602c`：永久档案home cwd固定为`/sdcard/DSHA/生活/数据/home`，阻止配置/CLI把范围改成group/email；新增回归测试；Actions #45成功（232 tests / 230 pass / 0 fail / 2 skipped）。
- `c89bff441002441c375df67bc80a904659ca7add`：评测脚本独立检测Git HEAD和clean working tree，CLI SHA仅作额外交叉校验；正式人工标注评测拒绝无Git/dirty工作树；新增git fixture测试；Actions #46成功（233 tests / 231 pass / 0 fail / 2 skipped）。
- `cd34c2f8a624021ccbf18b803b4030b16b82193b`：`graphCandidates()`的direct候选按memory_id稳定排序，hop/unknown-hop按共享实体数降序、memory_id升序稳定排序，避免无ORDER BY导致的RRF graph arm及前10个seed选择不确定；反向插入关联的回归测试；Actions #47成功（233 tests / 231 pass / 0 fail / 2 skipped）。
- `7995f250a5562ad825378edd92d8ec62f21386a5`：离线评测生产DB保护增加文件系统`dev/ino`比对，拒绝生产DB硬链接别名；Actions #48成功（233 tests / 231 pass / 0 fail / 2 skipped）。
- `dd381d53672eefd749b8abf9df795fdf1b7bab9e`：永久归档写入前检查整条目录祖先链，拒绝符号链接父目录；仅允许Android常见的精确`/sdcard`系统别名；追加前先校验，确保拒绝时不会先在外部目录创建文件。
- `bc7a10be8acf2bd3c8e5393e09e22a2d295c72d4`：补导出器祖先路径符号链接测试；`8d5943443d4951046c9f3cf1ba421dee03d4decd`修正测试错误消息断言；Actions #51成功（234 tests / 232 pass / 0 fail / 2 skipped）。
- Actions #50仅因测试断言使用了错误的错误消息正则失败，实际符号链接拒绝已触发；#51修正断言后通过。#49因后续push自动取消。
- `fc5537b...`首次符号链接保护提交因多余右括号导致Actions #38失败；`2ecb329...`修正语法后Actions #39成功（230 tests / 228 pass / 0 fail / 2 skipped）。
- Actions #40因GitHub Runner npm访问超时（ETIMEDOUT）未进入测试；#41暴露导出器测试夹具未初始化raw_meta，随后#42修复测试夹具并通过。#44因后续push被自动取消。
- 保护范围是归档root、`_events`目录、journal文件及派生文件的最终路径组件；父目录链的真实路径/符号链接祖先尚未在DSHA上验证，不能声称已彻底解决所有路径别名风险。
- 尚未取得DSH本地测试报告或生产运行验收；不能称已部署或已在手机端持续写入。

### 导出器要求与验收
- `scripts/export-home-archive.mjs`读取journal按raw_id去重；扫描DB raw_meta的home记录找缺失ID；补journal并生成每日Markdown；不依赖raw目录；raw删除后仍能从journal生成。
- 只追加journal；Markdown/INDEX/README是派生视图；DB只读，不调用有副作用函数；先手动执行，不部署调度。
- Markdown按天、turn单元，保留用户、汐、思考、工具调用、工具结果role及全文；已撤回正文保留并可见标注；有情绪则附。
- 必测：永久写成功；永久写失败mock但raw成功并warn；DB有journal无补齐；raw目录删除后仍可从journal生成；tombstone保留正文并可见标注；重复raw_id幂等；非home cwd不写；原197项测试不回退。
- 额外必测：并发去重、跨日/时区、异常中断/尾部半行、磁盘满/权限拒绝/目录不可用。
- 关键风险：JSONL追加原子性和尾部半行恢复；幂等检查与追加竞态；tombstone不得跨cwd误标；day/time明确DSHA本地时区；DB字段映射必须按真实schema；明文永久保留隐私风险（负责人已确认，但必须严格限home）；DB tombstone状态补齐时不得重新导出成未撤回。
- `RawArchive.tombstone(sid8,seq)`没有显式cwd条件，可能跨cwd误标，待M3-REF-06 fixture验证。
- `RawArchive.cleanup()`默认30天，只删除raw目录过期日期文件夹，不同步删除DB raw_meta/raw_fts/raw_vectors/raw_emotion_archive；30天只作用于磁盘Markdown。
- `RawArchive.verify(day)`每日SHA256摘要截16 hex，没有可信基准/前向链，不是完整防篡改账本。

## 10. 已完成的GPT开发分支修复记录

以下commit来自此前GPT会话记录，后续必须以GitHub实际HEAD和diff重新核验：
- `339f28a...`：修复旧版 `searchArchive(withContext)` tombstone泄漏；新增测试；修订 `scripts/eval-recall.mjs`使SQLite readOnly、query_only ON、trackAccess false。
- `e2e2c21...`：快照SHA256指纹验证、显式要求 `--db`离线快照、不允许默认生产DB；拒绝非空WAL。
- `53f2eea...`：检查生产数据库路径及symlink别名，拒绝生产DB作为评测快照。
- `1929c129...`：评测证据覆盖率从实际召回memory行来源锚点字段计算，避免指标虚高。
- `0a7b2f...`：事件链召回支持p4/explicit两种source_msg_id前缀在相同session内联结。
- `ecad69d...`：修复事件链测试fixture顺序（先按seq时间顺序写消息，避免后续撤回事件因序号倒退被忽略）。
- `10a514317566794e5f627f74dcd7bc9023ad7e80`：正式人工标注评测增加实际运行commit校验；缺失/不匹配拒绝，报告标明实际commit与校验状态；新增回归测试。Actions #36成功。
- `22003dbc1cb99eedf911c3e4fbf1ee6de1d9b924`：README补充离线评测`--code-commit`命令；Actions #37成功。
- `2ecb329538dd659af70a2c2af898705cc76c9237`：home永久档案拒绝符号链接root/events/journal leaf，O_NOFOLLOW保护文件打开；Actions #39成功。
- `630cfb1d571ec5252b5ff5e7c88a2bfd47bed3ec`：补导出器符号链接边界测试；Actions #42成功。
- `d96b11bed6edeb70e23ce2facef2fcaa343211d2`：限制情绪数据读取范围为home raw_id；Actions #43成功。
- `27d0806fdeb788c2f2e9dae204bfeb8ac402602c`：固定home cwd范围，拒绝将归档目标重定向至群聊/email；Actions #45成功。
- Actions #34失败原因：fixture先写seq=9再发seq=8 tombstone，系统将旧seq撤回作为过期事件忽略；修复fixture顺序后#35通过。
- 历史run #21因CI权限测试mode差异失败，后续已修复。多个旧run cancelled是push更新取消旧run。

## 11. 重要技术结论（避免重复调查或误操作）

### Provenance / tombstone / cleanup
- `raw_meta.id`是最可靠锚点；兼容source_msg_id/source_ts，降级定位要记录方式/置信度。
- 新版 `buildProvenanceBlock().loadDialogRows()`过滤tombstone=0。
- 旧版 `searchArchive(...,withContext:true)` 的 `hitWindow()` SQL未过滤tombstone=0，主命中正常时相邻撤回消息可能泄漏；GPT已在开发分支修复。
- tombstone跨cwd误标风险待fixture验证。
- 原话撤回不自动推断事实错误；记忆修订不抹去原话证据。
- 重要记忆来源状态建议verified/degraded/unavailable/revoked（不可假设现有系统已实现完整状态机）。
- 原话保留策略必须同时覆盖文件与DB。
- 防篡改审计需要可信基准或追加链路。

### Revisions / consistency
- `updateMemory` 有事务、expectedRevision乐观锁、修改前JSON revision、revision递增、正文更新同步FTS；不自动同步vector/entities/relations/quote。
- `getRevision`可读快照，但尚未确认存在完整通用安全回滚入口。
- 安全回滚应验证历史版本、expectedRevision CAS、当前版本先存revision、以新revision恢复旧正文（不倒退revision编号）、同步FTS/vector/entities/relations/quote、检查冲突队列、事务、失败整体回滚、记录操作者/原因/时间/来源审计。

### Offline evaluation
- 离线评测必须使用独立一致性快照、SQLite readOnly true、trackAccess:false；不运行整理/衰减/向量补算。
- 固定数据集版本、源码commit、模型参数和结果摘要。
- 目标指标：Recall@1/3/5、MRR、nDCG@5、Precision@K、注入覆盖、错误注入率、越权召回数（目标0）、证据覆盖、稳定性。
- 安全集覆盖事实经历、偏好变化、项目决策、时间、多轮、相似不同经历、撤回/失效/纠正、群聊/owner权限、不确定/不记得。
- `scripts/eval-recall.mjs`旧版普通openDb可能写访问统计，禁止生产库运行。
- `scripts/eval-m3-recall.mjs`使用SQLite readOnly=true、trackAccess:false，是只读评测基础，后续增加了严格快照校验。
- `scripts/m3-eval-queries.json`曾只有15条且仅5条有expectedContains，需核对当前数据集是否已扩充。
- createArmMonitor不是完整Recall@K/MRR/nDCG人工标注评测。
- commit bb77de2 checks=0/status pending且statuses空，只说明无CI记录，不代表测试成功或失败。

### MEMCORE参考
用户曾提供 `https://github.com/LYF-749/MEMCORE`，GPT已审查主要模块。结论：
- 可借鉴：多路召回+RRF融合、事件链闪回、记忆关联图/可视化检查器、私密记忆隔离、离线巩固。
- 不照搬：自制HMAC XOR加密、IdentityStore同key覆盖不留历史、retrieve写metrics、consolidate副作用、BM25指纹可能漏掉等长度正文更新、无独立标准测试、DB初始化有迁移副作用、四轴/五行结构无证据提升准确率。
- P0：事件链召回、时间顺序重建、来源证据展示；多路召回独立评测和融合贡献解释。
- P1：关联图/检查器；私密记忆隔离标准加密设计。
- 不引入四轴、五行、自定义加密。不要要求DSH重新研究MEMCORE。

## 12. GPT下一步执行顺序

1. **继续多路召回融合与注入边界只读审查**；graph arm SQL无序问题已通过稳定排序修复，语义分数/门槛/融合权重未改变。除非发现明确缺陷并有回归测试，不改变生产排序策略。
2. **继续home永久档案剩余验证**：审查多进程并发写入行为、异常恢复/半行；Asia/Shanghai时间逻辑已固定，仍需DSHA本地核对实际文件时间与设备时区。
3. **评测工具源码版本绑定与DB路径保护已在CI层完成**：正式标注要求干净Git工作树，三方比对dataset/HEAD/CLI SHA；生产DB路径、symlink及hardlink别名均拒绝。后续需要DSH在隔离worktree中用真实DSHA模型与离线DB快照运行，提交设备证据。
4. DSH本地需验证Android/Termux/DSHA环境支持`O_NOFOLLOW`，以及`/sdcard`是否为系统预期别名；当前CI只证明Ubuntu Runner，未证明设备真实文件系统行为。
5. GPT侧能完成的工作先完成，再更新交接文件，避免过早要求DSH重复转发大段任务书。
6. 之后由用户将交接文件链接交给DSH，要求DSH读取最新文件、按待DSH任务执行并更新同一文件。旧任务若内容仍完整且未完成，可引用本文件任务章节，不得擅自扩大范围。

## 13. DSH读取后的执行规则

DSH首次接入时：
1. 从 `coordination/project-handoff` 分支完整读取 `coordination/HANDOFF.md`。
2. 先回报读取到的HANDOFF版本、开发分支HEAD、当前待办和授权边界。
3. 不要立刻执行所有待办；先根据任务状态和明确授权判断可执行范围。
4. 优先检查是否已有M3-2A-REPORT-01、M3-REF-06的结果，避免重复工作。
5. 对已授权只读任务按原范围执行；对生产写入、清理、部署、重启或任何副作用操作一律停下等待用户在当前对话明确授权。
6. 完成后更新本文件完整内容，使用最新文件blob SHA进行并发保护；在“最新交接”中附报告路径、证据和状态。
7. 若DSH没有GitHub写权限，不得声称已更新；应向用户说明阻塞原因并给出最小必要更新内容，不能用旧文件覆盖。

## 14. 最新交接

- 版本：`HANDOFF-0019`
- 更新者：DSH
- 时间：2026-11-20 13:50（Asia/Shanghai）
- 基于旧文件 blob SHA：`375d35c749740032bd57217d58ef56b4d3fb641b`
- 开发分支 HEAD：`4b4b5f17a123533cceef7a0cd05f3a08ff5f2004`
- 生产版本：`bb77de2`（永久档案新实现**未部署**；生产 schema 4）

### 本轮执行概况
- 执行者：DSH（DSHA Android/proot，Node v24.19.0）
- 工作包：`M3-2A-REPORT-01`、`M3-REF-06`、`HOME-ARCHIVE-ANDROID-VERIFY-01`
- 最新 HEAD 全量测试：**238/238，0 fail，0 skipped，exit 0**（本地 BGE 模型可用，CI 的 2 项跳过在本机通过）
- 永久档案专项：`tests/permanent-home-archive.test.mjs` **20/20 pass**

### M3-2A-REPORT-01
- 状态：**已完成（有证据）**
- 报告：`/sdcard/DSHA/插件优化/M3-2A_生产episode治理候选报告.md`
- 当前生产 episode：**69**（清理 11 条测试/空图片/验收残留后的状态；清理记录 `/sdcard/DSHA/插件优化/81-M3-2A清理执行记录.md`）
- 分类：A 0、B 1、C 68、D 0；B 仅 #83（抖音观看记录，需负责人判断）
- 证据：当前库只读统计、逐条 69 行候选表、#83/#86 历史区分
- 未做：改写、归档、失效、清理；未进入 M3-2B

### M3-REF-06
- 状态：**部分 PASS / 部分 FAIL（有证据）**
- 报告：`/sdcard/DSHA/插件优化/M3-REF-06_DSHA本地只读验证与风险复核.md`
- FAIL（临时库复现）：
  1. `searchArchive(withContext=true)` 可带出 tombstone 相邻消息（`lib/archive/tools.js:66-73` 无 `tombstone=0`）；
  2. `RawArchive.tombstone(sid8,seq)` 无 cwd 条件，不同 cwd 同 file+seq 两条均被标记、FTS 均删（`lib/ingest/archive.js:468-473`）；
  3. `updateMemory()` 只更新 FTS；vectors/entities/relations/quote 不更新；删除后 `memory_revisions`/`relations` 留孤儿（`lib/store/memories.js:99-106/128-136`）。
- PASS：cleanup 只删 raw 日期目录、不删 DB；`eval-m3-recall.mjs` 只读安全；`eval-recall.mjs` 不可用于生产；全量 238/238。
- 生产只读统计：raw_meta 58,320；raw_old 0（最早 10-27，约 11-26 才会过期）；tombstone 61；raw_fts 58,259；raw_vectors 57,896；emotion 1,889；raw 目录 24 天/65 文件；memory 引用 raw 27/p4 87/explicit 3，raw 失效 0。

### HOME-ARCHIVE-ANDROID-VERIFY-01
- 状态：**部分 PASS / 1 项 FAIL / 部分 BLOCKED**
- 报告：`/sdcard/DSHA/插件优化/HOME-ARCHIVE-ANDROID-VERIFY-01_实机验证报告.md`
- PASS：Android `/sdcard`+`/storage/emulated/0` 别名、O_NOFOLLOW 可用、wx 排他创建、非 home 跳过；锁/符号链接/半行/导出一致性/派生文件安全单测 20/20；raw 优先（永久失败不影响 raw）。
- FAIL：12 个 Node 子进程同一瞬间并发追加 → 成功 2、失败 10（`home-archive writer lock is busy`），journal 未损坏；说明永久写是 best-effort，需 15 天补齐（或加重试）。
- 平台差异：Android FUSE 下 fchmod 后实测 mode 660，不等于桌面 600/640。
- BLOCKED：磁盘满、真实进程崩溃未在共享存储模拟。
- NOT RUN：生产部署双写（未授权）；生产永久档案仍为 DSH 静态首次导出（16 天/1,902 轮/约 5.3MB），不是插件双写实机运行。

### 负责人最新决定与后续（2026-11-20 14:02）

- #83 抖音观看记录：**保留**，不整理、不删除；仍是 B 类候选，未进入 M3-2B。
- 群聊 43 条 / 邮件 6 条：**保留**；群聊只进群会话，邮件仍可能被 owner 召回；不做“不注入”改造。
- 永久档案备份：**负责人手动操作**；DSH 不再代做外部复制。DSH 已在本机生成一份压缩备份：`/sdcard/DSHA/备份/永久档案-home-20261120-134037.tar.gz`（sha256 `2b9cffab…`），仅作本地副本，不代替电脑/移动硬盘。
- 15 天导出/备份：负责人选 **autonomy 调度**；DSH 已出实现提示词 `/sdcard/DSHA/插件优化/86-给GPT的15天永久档案导出与备份调度提示词.md`；**代码未实现、未部署**，待 GPT 实现并经负责人授权。
- M3-2B：负责人选 **先做快照 + dry-run**；DSH 已出提示词 `/sdcard/DSHA/插件优化/85-给GPT的M3-2B快照dryrun实现提示词-20261120.md`；**代码未实现**，在快照/回滚验证前不改任何 episode。
- 本轮未写生产数据库、未改源码/配置、未部署/重启；只新增备份 tar 与两份提示词。

### 待转发给 GPT 的提示词清单（负责人只需转发提示词）

DSH 本地文件不在 GitHub；以下为需要负责人转给 GPT 的提示词，均自包含：

**只需转发 1 份（已合并 85/86/87）：**

1. `/sdcard/DSHA/插件优化/88-给GPT的M3合并实现提示词.md`
   - 任务 A：修 M3-REF-06 三项 FAIL（撤回上下文泄漏、tombstone cwd、updateMemory 一致性/删除孤儿），并评估永久档案并发短重试；
   - 任务 B：M3-2B 快照 + dry-run（preview/apply/rollback，默认关闭、不自动、不批量）；
   - 任务 C：autonomy 每 15 天导出 + 备份（不写 raw/不写记忆/不部署）；
   - 原 85/86/87 已被本份合并，**不要再转发旧三份**。

报告本身（M3-2A/M3-REF/HOME-ARCHIVE）不需要转发全文；GPT 可读本交接文件中的摘要与路径。负责人只负责转发 88 号这一份，以及后续 GPT 要求补充的信息。

### 生产安全与副作用
- 未写生产数据库；未改 raw_meta/memories/FTS/vectors；
- 未改生产源码/配置/profile；未部署、未重启；
- 新增了永久档案首次导出的可见文件（负责人指定路径），未写 raw 数据；
- 未调用 updateMemory/dailyConsolidate/cleanup；未输出真实原话正文到报告。

### GPT 下一步需要处理
1. 审查并修复 M3-REF-06 的 3 个 FAIL：`hitWindow` tombstone、`tombstone()` cwd、`updateMemory` 关联一致性；
2. 按 85 号提示词实现 M3-2B 快照 + dry-run（默认关闭，不自动改写）；
3. 按 86 号提示词实现 autonomy 的 15 天导出 + 备份调度（需负责人授权后部署）；
4. 按 87 号提示词修复 M3-REF-06 三项 FAIL，并补永久档案并发重试评估；
2. 决定是否给永久档案双写增加短重试/退避，以缓解 12 并发下 10/12 失败；
3. 审查 `HOME-ARCHIVE-ANDROID-VERIFY-01` 的 FUSE 权限差异与派生文件安全实现；
4. M3-2B 仍应先做快照+dry-run，不得直接批量 `updateMemory()`；
5. 需要负责人决定：#83 、群聊/邮件保留/注入、15 天导出调度、永久档案备份。

### 交接链接
- 文件：https://github.com/ba-song/dsh-memory-core/blob/coordination/project-handoff/coordination/HANDOFF.md
- 开发分支：https://github.com/ba-song/dsh-memory-core/tree/feat/m1-preference-memory
- 本轮证据报告均在 `/sdcard/DSHA/插件优化/`。
