# GPT ↔ DSH 项目交接状态

> 文件：`coordination/HANDOFF.md`  
> 交接分支：`coordination/project-handoff`  
> 仓库：`ba-song/dsh-memory-core`  
> 版本：`HANDOFF-0024`  
> 更新时间：2026-11-20 19:25（Asia/Shanghai）  
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

## 14. 上一版交接（HANDOFF-0019）

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


---

## 15. GPT最新执行（HANDOFF-0020）

> 本节为当前最新状态。第 14 节保留 DSH 的 HANDOFF-0019 历史报告，不得将其生产版本/开发 HEAD 当作当前代码版本。

### 15.1 本轮范围与安全边界

- 执行者：GPT。
- 用户授权范围：只修改 GitHub 开发分支 feat/m1-preference-memory 与 ba-song/dsh-autonomy 的 main 分支；不部署、不重启、不写生产数据库、不改生产 profile/config。
- 本轮没有连接 DSHA 生产数据库，没有执行本地生产操作。
- 本轮没有更改生产部署版本；HANDOFF-0019 中的生产版本 bb77de2 仍仅为历史记录，永久档案新实现和本轮 M3 实现均未部署。
- 本轮只通过 GitHub 源码提交和 GitHub Actions CI 验证。CI 不等同于 Android/DSHA 本地验收。

### 15.2 当前 GitHub HEAD

- ba-song/dsh-memory-core 开发分支 feat/m1-preference-memory：
  - HEAD：c0645fb629b71e00949d6ec6d031294a059cbce7
  - 链接：https://github.com/ba-song/dsh-memory-core/tree/feat/m1-preference-memory
  - Actions #76：251 tests / 249 pass / 0 fail / 2 skipped，成功。
  - CI 链接：https://github.com/ba-song/dsh-memory-core/actions/runs/44689222083
  - 两项 skipped 仍是 GitHub runner 未安装 DSHA BGE 模型的向量冲突语料与 ingest pipeline 测试；必须由 DSH 本机模型复验。
- ba-song/dsh-autonomy：
  - main HEAD：7a3dc5181fa5377ad977a430c8a5fc51bb141844
  - 链接：https://github.com/ba-song/dsh-autonomy/tree/main
  - 专项 Actions #3：4 tests / 4 pass / 0 fail，成功。
  - CI 链接：https://github.com/ba-song/dsh-autonomy/actions/runs/44689136510

### 15.3 任务 A：M3-REF-06 修复与永久档案并发

#### A1 撤回上下文泄漏

- 当前开发分支 lib/archive/tools.js 的 hitWindow() 已对锚点、邻近对话和 self-thought 查询使用 tombstone=0；情绪数据仅按已筛选的非 tombstone raw_id 读取，不读取撤回消息正文。
- 这部分过滤逻辑在本轮基线中已经存在，本轮没有重复改写生产查询。
- 回归测试覆盖 withContext=true 时邻近 tombstone 不进入上下文，以及 withContext=false 保持普通搜索路径。
- 生产旧版本仍需等待 DSH 升级后验证，不能把开发分支测试当成生产修复已生效。

#### A2 tombstone 跨 cwd

- 当前 RawArchive.tombstone() 查询已经包含 cwd 约束；本轮增加双 cwd、相同 file+seq fixture。
- 测试确认只标记指定 cwd 的 raw_meta 行，只删除匹配 id 的 FTS，另一 cwd 的记录保留；重复撤回幂等。
- 该项在开发分支 CI 通过；仍需 DSH 在隔离副本验证真实 Android 路径归一化与生产版本差异。

#### A3 updateMemory 派生数据一致性

- updateMemory(...,{syncDerived:true}) 增加受控正文更新路径，事务内完成 revision 快照、正文、FTS、向量、实体链接、关系处理、quote 处理和 conflict_queue pending→stale。
- 提供 embedding 函数时重算向量；没有 embedding 函数时删除旧向量并在 meta 中明确标记 vectorStatus='stale'，不会静默保留旧向量。
- quote 有来源正文时走 resolveQuote 校验；没有来源正文时清空旧 quote，并设置 provenance review 标记。
- entities 先 unlink 再按新正文重建；删除记忆时清理其 memory_revisions、relations，并清理引用不存在 memory/entity 的 relation 孤儿。
- 事务内嵌入/关系处理失败时整单回滚；CI 已覆盖 embedding 失败回滚、向量 stale 标记、FTS/entities/relations/quote/revision/conflict_queue 一致性。
- 关系语义限制：仓库目前没有可验证的通用 relation extractor。普通 syncDerived 若发现该 memory 已有关联 relations、又没有 relationBuilder，会 fail closed，返回 E_RELATION_REBUILDER_REQUIRED，避免不可逆地丢弃关系。调用方提供经过验证的 relationBuilder 后才会重建关系。
- M3-2B apply 因为先保存完整快照，当前允许把旧关系标记为 invalidated 并清除，工具返回 relationsStatus='invalidated-no-builder'；rollback 可从快照恢复关系。这不是关系语义重建，不能报告为 A3/B 全部满足。需要后续确定关系的业务语义或提供经过验证的 relationBuilder。

#### A4 永久档案并发

- appendPermanentEvent 对短暂 ELOCKED 增加 100/250/500ms 有界退避重试；超过重试仍失败时继续保持 best-effort，不回滚 raw 写入。
- 新增 12 个 Node 子进程并发追加测试；CI 全部成功，journal 行数/JSONL 解析无错误。
- 这是 Ubuntu GitHub runner 结果，尚未证明 Android FUSE/Termux 真实文件锁表现；DSH 仍须复验。

### 15.4 任务 B：M3-2B 快照、preview、apply、rollback

- schema version：5。
- 新增 episode_rewrite_snapshots 表，保存完整 previous_json、vector_dim/blob、entities_json、relations_json、quote、FTS 文本、revision、reason、status 和 rolled_back_at。
- 新增模块 lib/store/episode-rewrite.js。
- 新增工具：
  - dy_episode_rewrite_preview(id, proposed_text)
  - dy_episode_rewrite_apply(id, proposed_text, confirm:true)
  - dy_episode_rewrite_rollback(snapshot_id)
- 配置 m3_2b.enabled 默认 false；未显式启用时不注册这些工具。
- 工具只允许 owner 私聊/家；拒绝非 owner；拒绝额外批量参数；apply 要求 confirm=true；不提供批量入口。
- preview 只读，返回长度、主体/实体、数字/时间变化、quote 状态和注入预算影响，并用 SQLite total_changes() 前后相等检查无写入。
- apply 需要 embedding 可用；先写快照，再事务更新正文、FTS、vector、entities、quote/provenance review 和 conflict_queue。嵌入失败整单回滚。
- rollback 以新 revision 恢复历史正文、quote、vector、entity links/metadata、relations 和 FTS，并把原 snapshot 标记 rolled_back；revision 编号不倒退。
- CI 覆盖 preview 无写、apply 快照、rollback 恢复、embedding 失败回滚、默认关闭、owner 权限、批量拒绝。
- 未解决限制：当前没有通用关系抽取器，apply 会把旧 relations 作为快照保留并标记 invalidated；rollback 可恢复。若负责人要求 apply 后关系必须重新生成，需要先明确 relation 类型/方向/权重语义，再实现并测试 relationBuilder。不得用未经确认的 co-mention 等猜测关系冒充原关系。

### 15.5 任务 C：autonomy 每 15 天导出与备份

- 仓库：ba-song/dsh-autonomy，main HEAD 如 15.2。
- 新增 lib/run/home-archive-maintenance.js。
- 配置 homeArchiveMaintenance.enabled 默认 false；Config schema 与 loadConfig 已加入相应字段。间隔固定 15 天，不允许 profile 把间隔改短。
- 需要同时满足 autonomy 总开关开启与 homeArchiveMaintenance.enabled=true 才挂载定时器；每 60 分钟检查一次。首次不自动运行，等待 owner 手动验收成功后，才以 lastSuccessAt 为基准进入 15 天周期。
- owner-only 工具 dy_life_home_archive_export 可手动触发；功能开关关闭时返回 E_DISABLED。
- 导出通过 Node 子进程调用 scripts/export-home-archive.mjs，参数包含 memory DB、home cwd 和永久档案输出目录；成功后调用 tar 压缩整个永久档案根目录。
- 默认路径是配置默认值，必须由 DSH 对照 DSHA 实际路径核验：
  - exporter：/root/.dsh/plugin-src/dsh-memory-core/scripts/export-home-archive.mjs
  - memory DB：/sdcard/DSHA/记忆/数据/memory.db
  - home cwd：/sdcard/DSHA/生活/数据/home
  - archive root：/sdcard/DSHA/记忆/档案/永久
  - backup dir：/sdcard/DSHA/备份
- 默认失败重试 1 次；单实例锁；异步子进程不阻塞聊天/raw；记录 exit code、日志、backup bytes 和 SHA256；同一天已有备份时拒绝覆盖；不上传云端。
- 新增 autonomy 专项 GitHub Actions workflow；4/4 mock tests 通过，覆盖默认关闭、15 天 due、手动首次验收、重试、备份 hash/size、同日不覆盖和跨实例锁。
- 没有执行真实 DSHA 导出、真实 tar 或生产调度。CI 使用 mock 子进程，不能证明 DSHA tar 命令、SQLite 路径、FUSE 锁和真实导出脚本参数在设备上可用。
- 当前没有部署、没有改生产 profile、没有重启。

### 15.6 本轮未做事项与授权边界

- 没有部署任何开发分支代码。
- 没有改生产 profile/config。
- 没有重启 DSH/DSHA。
- 没有写生产 memory DB、raw、episode、vectors、FTS 或永久档案。
- 没有执行真实 episode 改写、归档、失效或删除。
- 没有开启 m3_2b.enabled 或 homeArchiveMaintenance.enabled 的生产配置。
- 没有运行真实 15 天调度。

### 15.7 DSH 下一步必须完成

1. 在 DSHA 隔离 worktree/clone 对 c0645fb629b71e00949d6ec6d031294a059cbce7 运行全量测试，报告实际数量、失败、跳过、退出码；用本机 BGE 模型复验 CI skipped 的两项。
2. 在临时 DB 复验 A1/A2/A3：撤回上下文/思考/情绪关联、双 cwd tombstone、updateMemory vector fresh/stale、quote、FTS、entities、relations builder、conflict_queue、失败回滚和删除孤儿。
3. 在临时 DB 复验 M3-2B：默认关闭、preview total_changes 不变、owner/非 owner、批量拒绝、apply snapshot、embedding 失败回滚、rollback 完整恢复。
4. 只读调查当前 relation 表的真实语义、写入来源、消费位置和是否仍有活跃数据。不要自行设计 co-mention 语义；形成报告，交负责人决定是否定义 relationBuilder。
5. 在 DSHA 隔离目录验证永久档案 12 子进程并发重试、锁回收、半行、O_NOFOLLOW、/sdcard 别名、FUSE 权限、journal 变化 consistent=false。
6. 在 autonomy 隔离环境验证配置 schema 是否能从 Cordis profile 传入；确认 exporter/memory DB/archiveRoot/backupDir 实际路径；确认 tar 可用；使用临时 DB 和临时输出目录手动触发，不触碰生产 archiveRoot。
7. 对真实生产 DB 只读核对 schema 版本和实际路径，不写入、不部署、不重启。
8. 完成本地复验后，更新本文件为 HANDOFF-0021：先读取最新全文和 Blob SHA，再基于最新版本更新；报告路径、命令、日志、退出码、PASS/FAIL/BLOCKED/NOT RUN/INCONCLUSIVE 和生产副作用。不得覆盖 GPT 本轮记录。
9. 如需部署、生产 profile 开关、真实手动导出到永久目录或真实 episode 改写，必须先向负责人请求当前对话中的单独明确授权。

### 15.8 最新交接文件信息

- 版本：HANDOFF-0020
- 更新者：GPT
- 基于上一版 Blob SHA：1c931727207e237b2f3c8b0a2e47d161b2db31a6
- 开发分支 HEAD：c0645fb629b71e00949d6ec6d031294a059cbce7
- autonomy main HEAD：7a3dc5181fa5377ad977a430c8a5fc51bb141844
- 下一位更新者必须重新读取远程最新 Blob SHA；不要沿用本节的旧 SHA。

---

## 16. DSH 本地复验（HANDOFF-0021）

> 本节为当前最新状态。第 15 节 GPT 的 HANDOFF-0020 记录保留，不得改写。

### 16.1 范围与安全边界
- 执行者：DSH（DSHA Android/proot）。
- 授权来源：负责人转发 GPT 的 HANDOFF-0020 后续本地复验任务书。
- 只做隔离 clone 测试 + 临时库测试 + 生产库只读核对；**未部署、未重启、未改生产 profile/config、未写生产库**。
- 报告路径：`/sdcard/DSHA/插件优化/M3-MERGED-LOCAL-VERIFY-01.md`
- 日志：`/tmp/m3v/logs/`（full-test.log、concurrent-fail.log、au-test.log）

### 16.2 版本核对（实际读取）
- 交接文件：HANDOFF-0020，blob `c7f9b2e7ddd67363060385690a29e7d836ac5b55`，分支 HEAD `4f7921099e05d4b0ec46b93f18d7364b3457ba89`（更新前已重新拉取并与缓存一致，无他人并发更新）。
- dsh-memory-core 开发分支：`c0645fb629b71e00949d6ec6d031294a059cbce7`（与 0020 一致）。
- dsh-autonomy main：`7a3dc5181fa5377ad977a430c8a5fc51bb141844`（一致）。
- 生产库：schema_version=4；memories=216；entities=19；**relations=0**；无 `episode_rewrite_snapshots` 表。
- 已部署插件 `/root/.dsh/plugin-src/dsh-memory-core` 无 `.git`，无法用 git 独立核实部署版本；按 HANDOFF-0019 记录生产为 `bb77de2`。该目录**无 `scripts/export-home-archive.mjs`、无 `lib/permanent/`、无 `lib/store/episode-rewrite.js`**。

### 16.3 测试结果（DSHA 实机）
| 项 | 结果 |
|---|---|
| memory-core 全量 `npm test`（c0645fb） | 251 tests / **250 pass** / **1 fail** / **0 skipped** / exit 1 |
| BGE 两项 CI skipped | 本机真实模型执行并 **PASS**（p4 1/1） |
| archive-tombstone-context | 2/2 pass |
| raw-tombstone-cwd | 1/1 pass |
| m3-ref-derived-sync | 5/5 pass |
| m3-2b-snapshots | 4/4 pass |
| m3-2b-tool-permissions | 1/1 pass |
| autonomy 专项 home-archive-maintenance | 4/4 pass |
| autonomy 全量 `npm test` | 410 tests / 407 pass / **2 fail** / 1 skipped / exit 1 |

- 唯一 memory-core 失败：`permanent-home-archive` → 「12 concurrent child processes append distinct events with bounded lock retry」。单测连跑 6 次 **5 次失败**，典型 12 个进程里 1–2 个退出码为 2（有界重试 100/250/500 ms 用尽仍锁忙，append 既非 appended 也非 duplicate）。日志见 `concurrent-fail.log`。→ CI 通过，DSHA 实机 **FAIL**。
- autonomy 两处 FAIL：`Config：volatile 只标在设置卡片的 4 个字段上`、`设置服务：describe 只暴露 4 个 volatile 字段，mutate 写入嵌套路径`。原因是新增 `homeArchiveMaintenance` 后这两个断言未同步更新；CI workflow 只跑 `tests/home-archive-maintenance.test.mjs`，故 CI #3 全绿但全量红。**待 GPT 修断言，并让 CI 覆盖全量。**

### 16.4 路径与平台核对
- exporter 默认 `/root/.dsh/plugin-src/dsh-memory-core/scripts/export-home-archive.mjs` → **当前部署下不存在**；调度启用前必须部署新版插件或改默认路径。
- memory.db / home cwd / archive root / backup dir 四个默认路径均存在；archive root 现 5.3 MB（README.md、home/）。
- `/sdcard` 与 `/storage/emulated/0` 同 dev/ino（别名成立）；`/sdcard` 为 bind mount(FUSE)。
- GNU tar 1.35 可用；中文路径打包正常（实测 `永久档案/home/2026-11-20.md`）；SHA256 可复算。
- FUSE 实测：O_CREAT|O_EXCL 排他创建 OK；`/sdcard` 文件 mode 实测 **660**；rename OK；`/sdcard` 上创建 symlink **EACCES 拒绝**；`/tmp` 上 O_NOFOLLOW 打开 symlink 被拒（ELOOP）。

### 16.5 relations 只读调查结论
- 结构：`src,dst,relation,weight,memory_id,created_at`，无主键/外键/CHECK。
- 唯一写入点：`updateMemory()` 内 relationBuilder（无 builder 且有旧关系时 fail-closed `E_RELATION_REBUILDER_REQUIRED`）；仓库无通用 extractor。
- 读取点只有 `episode-rewrite.js`（快照/回滚）与删除时孤儿清理；**召回不使用 relations**（graph 走 memory_entities+entities）。
- 生产 relations=0 行。
- src/dst 为 entities.id，relation 为自由文本，方向 src→dst 无消费方验证。类型/权重/业务语义需负责人定义，**不得自行设计 co-mention**。

### 16.6 M3-2B 与 autonomy 配置核对
- `m3_2b.enabled` 默认 false；`lib/index.js:502` 仅在显式开启时注册三工具 → 默认不注册。
- preview 只读、apply 先快照、embedding 失败整单回滚、rollback 恢复且 revision 不倒退：均由 `m3-2b-snapshots.test.mjs` 覆盖并本机通过。
- apply 对旧 relations 走 `invalidated-no-builder` + 快照保存，**不是关系重建**，rollback 可恢复；不得报告为 A3/B 全部满足。
- `homeArchiveMaintenance.enabled` 默认 false；intervalDays 固定 15；retryCount=1；pollMinutes=60；未启用工具返回 `E_DISABLED`；`dy_life_home_archive_export` owner-only。

### 16.7 本轮未做（授权边界）
- 未部署任何开发分支代码；未改生产 profile/config；未重启 DSH/DSHA。
- 未写生产 memory DB、raw、episode、vectors、FTS、relations、永久档案。
- 未执行真实 episode 改写；未开启 m3_2b 或 homeArchiveMaintenance 生产开关；未运行真实 15 天调度。
- 未把真实永久档案目录作为测试输出（并发/tar 均在 /tmp 隔离目录）。

### 16.8 交 GPT 的待办
1. 永久档案并发：Android FUSE 下 12 路并发仍有 1–2 个失败，需决定加大退避、串行写队列，或明确接受 best-effort 并依赖 15 天补齐。
2. autonomy 两个陈旧断言需修，且 CI 应覆盖全量 `npm test`。
3. autonomy 默认 exporter 路径与当前部署不匹配，部署前需对齐。
4. relations 的语义（类型/方向/权重/是否参与召回）待负责人定义后再做 relationBuilder。
5. 生产 schema 4 → 开发 5；M3-2B 未部署，升级与部署仍需负责人单独授权。

### 16.9 本次交接文件信息
- 版本：`HANDOFF-0021`
- 更新者：DSH
- 基于旧文件 blob SHA：`c7f9b2e7ddd67363060385690a29e7d836ac5b55`
- 开发分支 HEAD：`c0645fb629b71e00949d6ec6d031294a059cbce7`
- autonomy main HEAD：`7a3dc5181fa5377ad977a430c8a5fc51bb141844`
- 下一位更新者必须重新读取远程最新 blob SHA。


---

## 17. 交 GPT 的后续修复提示词（HANDOFF-0022）

- 基于：HANDOFF-0021，旧 blob `133b797ba346c9508a293a845a04e4a330fd0209`
- 本地复验报告：`/sdcard/DSHA/插件优化/M3-MERGED-LOCAL-VERIFY-01.md`

**负责人只需转发这一份：**

`/sdcard/DSHA/插件优化/89-给GPT的HANDOFF-0021后续修复提示词.md`

要求 GPT：
1. 修 autonomy 两个陈旧断言，并让 CI 覆盖全量 `npm test`；
2. 处理永久档案 12 路并发：串行队列/更大退避，或明确 best-effort 且稳定测试；
3. 对齐 exporter 默认路径与当前部署，缺失时明确报错；
4. relations 语义仍待负责人定义，不自行实现；
5. 不改生产 profile/config、不部署/重启、不写生产库。

本地证据：memory-core 251/250/1（并发项失败）；autonomy 410/407/2 fail；BGE 两项本机 PASS；修改类测试 A2/A3/A4/B1–B3/C1/C3/C4 均通过（详见报告与 HANDOFF-0021 §16）。

- 本轮未部署、未重启、未写生产库；无生产副作用。
- 下一位更新者必须重新读取远程最新 blob SHA，不能沿用本节。


---

## 18. GPT 后续修复（HANDOFF-0023）

> 依据负责人转交的 HANDOFF-0021 后续修复任务。已先读取并保留 DSH 最新 HANDOFF-0022；本节为 GPT 开发分支修改与 GitHub CI 结果。未进行任何 DSHA 本地或生产操作。

### 18.1 本轮范围与边界

- 执行者：GPT。
- 仅修改 GitHub 开发分支：
  - `ba-song/dsh-memory-core` / `feat/m1-preference-memory`
  - `ba-song/dsh-autonomy` / `main`
- 未部署、未重启、未修改生产 profile/config、未写生产 DB/raw/episode/vector/FTS/relations/永久档案。
- 本轮没有接触 DSHA 设备；Android FUSE 实测仍由 DSH 复验。
- relations 语义不在本轮实现；仍等待负责人定义关系类型、方向、权重和是否参与召回。

### 18.2 最新开发 HEAD 与 CI

#### dsh-memory-core

- 分支：`feat/m1-preference-memory`
- 最新 HEAD：`732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`
- 最新提交：https://github.com/ba-song/dsh-memory-core/commit/732e3fa3381ed4b3b4242e0e6fd6e411b35ab972
- GitHub Actions #79：251 tests / 249 pass / 0 fail / 2 skipped，成功。
- CI：https://github.com/ba-song/dsh-memory-core/actions/runs/44720477406
- 两项 skipped 仍是 GitHub runner 缺少 DSHA BGE 模型的向量冲突语料与 ingest pipeline 测试；HANDOFF-0021 记录的 DSHA 本机 BGE 两项曾通过，但本轮没有重跑设备端测试。

#### dsh-autonomy

- 分支：`main`
- 最新 HEAD：`6c4a4753b4737060211955b1f022cab2f1d39521`
- 最新提交：https://github.com/ba-song/dsh-autonomy/commit/6c4a4753b4737060211955b1f022cab2f1d39521
- GitHub Actions #7：全量 `npm test` 为 411 tests / 408 pass / 0 fail / 3 skipped；专项 scheduler suite 5/5 pass。workflow 成功。
- CI：https://github.com/ba-song/dsh-autonomy/actions/runs/44720665021
- 三项 skipped 的原因：
  1. Ubuntu runner 没有 `/root/.dsh/profiles/web/cordis.patch.yml`，profile 读取测试跳过。
  2. GitHub runner 未安装可选宿主包 `@deepseek-ai/dsh-settings`，设置服务集成测试跳过；该测试在 DSHA 本地有包时应实际执行，不能把 skip 说成通过。
  3. autonomy 仓库 CI 没有 sibling `dsh-memory-core` checkout，真实 dyMemory 集成测试跳过。
- workflow 现在执行 `npm install --ignore-scripts`、全量 `npm test`，并额外执行 `node --test tests/home-archive-maintenance.test.mjs`。触发路径包括 scheduler、Config、`lib/index.js`、`package.json`、相关测试与 workflow。
- `@deepseek-ai/schemastery ^3.19.0` 已加入 autonomy runtime dependencies，因为 `lib/index.js` 实际导入它；不再将 `@deepseek-ai/dsh-settings` 强行安装为 CI 依赖，保留其宿主可选集成性质。

### 18.3 任务 A：autonomy 陈旧 volatile 断言

- 原因：新增 `homeArchiveMaintenance` 后，其字段被错误标记为 `.volatile()`，导致 dsh-settings 将调度开关和路径等内部配置纳入即时设置表单。
- 修复：`lib/index.js` 中 `homeArchiveMaintenance` 的所有字段取消 `.volatile()`，保留 schema/default/范围验证和 profile 配置解析能力。
- 这样调度仍默认关闭，仍可通过明确的 profile 配置控制，但不会暴露为普通即时设置卡片字段。
- 更新 `tests/config-schema.test.mjs`：
  - 精确断言原设置卡片 volatile 路径集合；
  - 明确断言 `homeArchiveMaintenance` 子树没有 volatile 字段；
  - 检查解析后 `loadConfig` 保留调度配置；
  - 设置服务描述的预期字段保持不包含 `homeArchiveMaintenance`，mutate 仍只修改原表单字段。
- GitHub 全量 CI 中 Config volatile 精确测试 PASS。设置服务 integration 在 GitHub 因缺少宿主可选包而 SKIPPED，必须由 DSH DSHA 本地复验。

### 18.4 任务 B：永久档案并发明确 best-effort

- 选择负责人任务书方案 3：明确接受 best-effort，不继续扩大同步锁等待。
- 理由：DSHA 已实测 12 个独立 Node 子进程在 Android FUSE 下有 1–2 个因 ELOCKED 退出；同进程串行队列无法解决跨进程竞争。扩大阻塞重试会增加 raw 写入路径等待，仍无法保证共享存储锁永不竞争。
- 维持当前有限重试 100/250/500ms；锁竞争耗尽抛出明确 ELOCKED。调用点 `RawArchive.appendPermanentRow()` 已捕获异常并 warn，永久档案失败不回滚已成功 raw/DB 写入。
- 15 天 exporter 从只读 `raw_meta` 补齐 journal 缺失 raw_id；永久档案失败依靠后续导出补齐。
- 在调用点补充 best-effort 策略注释。
- 重写 12 子进程测试：
  - 每个子进程都必须正常退出并输出机器可解析的结果；
  - 只接受成功追加或明确 `ELOCKED`，其他错误失败；
  - 至少一个 writer 成功；
  - 逐行解析 JSONL，检查没有解析错误、没有重复 raw_id；
  - journal 中的 raw_id 必须与成功追加结果完全一致；
  - 失败的 raw_id 不得出现半截记录。
- GitHub Actions #79 该测试 PASS；Ubuntu runner 并发结果不能代替 Android FUSE 实测。DSH 必须在设备上重复执行，确认 ELOCKED 仅造成可见 warn，raw 行仍存在且下次 exporter 可补齐。

### 18.5 任务 C：exporter 路径对齐与缺失错误

- autonomy 已有 `homeArchiveMaintenance.exportScript` 配置项，允许明确指定实际 exporter 路径。
- 新增启动前路径校验：`lstat` 检查 exporter 存在且是普通非符号链接文件。
- 缺失时返回明确 `E_EXPORT_SCRIPT_NOT_FOUND: <path>`；未配置时 `E_EXPORT_SCRIPT_NOT_CONFIGURED`；非普通文件/符号链接时 `E_EXPORT_SCRIPT_INVALID: <path>`。
- 校验在获取锁、创建备份目录和启动子进程之前执行；缺失脚本不会静默失败，也不会生成备份产物。
- 新增测试：缺失路径明确报错、不 spawn、不创建 backupDir；存在路径可进入导出/备份流程（CI 用 fake child process）。
- **路径尚未自动发现，也未改成未经证实的新默认值。** DSH 已确认当前生产部署目录缺少 exporter，因此当前默认路径仍会明确报错。后续需在隔离环境把配置指向开发 clone 中真实脚本并验证；生产配置仍不得修改。部署候选必须保证插件部署目录实际包含脚本，或经负责人批准配置正确绝对路径。

### 18.6 任务 D：relations

- 本轮未修改 relation schema、类型、方向、权重、extractor 或召回逻辑。
- 继续保持 M3-2B 默认关闭。
- 生产 relations=0 是 HANDOFF-0021 的历史只读证据，本轮没有重新读取生产库。

### 18.7 交付后 DSH 必须复验

1. 完整读取 HANDOFF-0023，核对两个仓库 HEAD。
2. 在 DSHA 隔离 clone/worktree 对 memory-core `732e3fa3381ed4b3b4242e0e6fd6e411b35ab972` 执行全量 `npm test`；使用本机 BGE 模型验证原来 GitHub skipped 的两项。
3. Android FUSE 上重复 12 个独立子进程并发测试至少 10 轮；按新 best-effort 断言，记录 appended/ELOCKED 数量、日志、JSONL parse errors、重复 raw_id。
4. 在临时 DB + 临时永久目录验证：某个永久追加因 ELOCKED 失败时，raw_meta 已写入；运行 exporter 后该 raw_id 被补入 journal；不得写真实永久目录。
5. 在 DSHA 对 autonomy `6c4a4753b4737060211955b1f022cab2f1d39521` 执行全量 `npm test`；确认原两项 volatile 问题消失。DSHA 安装有 `@deepseek-ai/dsh-settings` 时，必须实际执行设置服务集成测试，不得跳过。
6. 在隔离配置下设置 exporter 指向开发 clone 的 `scripts/export-home-archive.mjs`，使用临时 memory DB、临时 archiveRoot 和 backupDir 实际执行 Node 子进程 + tar；验证缺失路径报错、存在路径跑通、hash 可复算。不得使用生产 archiveRoot/backupDir。
7. 只读确认当前生产部署路径仍缺脚本，不修改生产配置，不部署、不重启。
8. relations 仅沿用已知只读调查结论，不实现。
9. 完成后重新读取最新 HANDOFF.md 全文和 Blob SHA，追加 HANDOFF-0024，记录所有命令、日志、退出码、PASS/FAIL/BLOCKED/NOT RUN、产物路径与副作用。不得覆盖本节。
10. 任何部署、生产 profile 开关、真实永久目录导出或生产数据变更，必须另行取得负责人当前对话中的明确授权。

### 18.8 最新交接文件信息

- 版本：`HANDOFF-0023`
- 更新者：GPT
- 基于 HANDOFF-0022 Blob SHA：`201362a3ae7cdbcbd0f1ecb23509a0257955eace`
- 交接分支父 commit：`6a4e3d1a2a14aefbaff8b79e29684a6d5eb8719e`
- memory-core HEAD：`732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`
- autonomy HEAD：`6c4a4753b4737060211955b1f022cab2f1d39521`
- 后续更新者必须重新读取 HANDOFF.md 全文及最新 Blob SHA；不得沿用本节 SHA。


---

## 19. DSH 本地复验（HANDOFF-0024）

### 19.1 范围与边界
- 执行者：DSH（DSHA Android/proot）。
- 依据：HANDOFF-0023（核对旧 blob `9940393b…`，分支 HEAD `dc74bcd6…`）。
- 只做隔离 clone/临时库/临时目录测试 + 生产只读核对；未部署、未重启、未改 profile/config、未写生产库。
- 报告：`/sdcard/DSHA/插件优化/M3-MERGED-LOCAL-VERIFY-02.md`
- 日志：`/tmp/m3v2-mem.log`、`/tmp/m3v2-au2.log`、`/tmp/m3v2-conc-rounds.json`、`/tmp/au-exp3.json`

### 19.2 版本
- memory-core HEAD：`732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`
- autonomy HEAD：`6c4a4753b4737060211955b1f022cab2f1d39521`
- 生产库：schema 4、memories 216、relations 0
- 生产插件：`/root/.dsh/plugin-src/dsh-memory-core` 仍无 `scripts/export-home-archive.mjs`、无 `lib/permanent/`

### 19.3 测试结果（DSHA 实机）
| 项 | 结果 |
|---|---|
| memory-core 全量 | **251 / 251 pass / 0 fail / 0 skip / exit 0** |
| BGE 两项 CI skipped | 本机真实模型 **PASS** |
| archive-tombstone-context / raw-tombstone-cwd / m3-ref-derived-sync | 2/2、1/1、5/5 PASS |
| m3-2b-snapshots / tool-permissions | 4/4、1/1 PASS |
| 12 路并发 10 轮 | **PASS（best-effort）**：appended 4–6，ELOCKED 6–8，其他失败 0；journal 行=appended，无解析错误/重复 raw_id |
| raw 优先 + 导出补齐 | PASS：临时 DB 1 行、journal 空，导出后 `repaired:1` |
| autonomy 全量 | **411 / 411 pass / 0 fail / 0 skip / exit 0**（需 sibling `dsh-memory-core`，设置服务 integration 实际执行） |
| exporter 真实 Node+tar | PASS（隔离）：exportExit=0、tarExit=0、backupBytes=1484、sha256=`5772f82c…`、中文路径正常 |
| 同一天二次导出 | `E_BACKUP_EXISTS`（不覆盖） |
| exporter 缺失/symlink | `E_EXPORT_SCRIPT_NOT_FOUND` / `E_EXPORT_SCRIPT_INVALID` |
| 生产默认 exporter 路径 | **FAIL/阻塞**：当前部署不存在，部署前必须对齐 |
| 生产部署/开关 | **NOT RUN**（未授权） |

### 19.4 结论
- HANDOFF-0021 的两个 autonomy 陈旧断言已消失；
- memory-core 原有 1 个并发失败已被“明确 best-effort + 稳定测试”替代，DSHA 10 轮无损坏/重复；
- 永久档案仍为 best-effort：ELOCKED 会产生漏写，靠 15 天导出补齐；
- 生产部署仍缺 exporter，且 M3-2B/schema 5 未部署；本轮未改生产。

### 19.5 交 GPT
1. 部署前对齐 exporter 真实路径（插件目录包含脚本或配置正确绝对路径）；
2. 永久档案并发策略保持 best-effort；若要求更高成功率，再考虑串行队列；
3. relations 语义仍未定义，不实现 relationBuilder；
4. M3-2B/自动调度不得在生产开启，等负责人单独授权。

### 19.6 交接信息
- 版本：`HANDOFF-0024`
- 更新者：DSH
- 基于旧 blob：`9940393baef9067cf1ce1101e75a2b0ac8437f2b`
- 开发 HEAD：`732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`
- autonomy HEAD：`6c4a4753b4737060211955b1f022cab2f1d39521`
- 下一位更新者必须重新读取远程最新 blob SHA。
