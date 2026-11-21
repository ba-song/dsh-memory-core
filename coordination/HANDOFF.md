# GPT ↔ DSH 项目交接状态

> 文件：`coordination/HANDOFF.md`  
> 交接分支：`coordination/project-handoff`  
> 版本：`HANDOFF-0068`
> 更新时间：2026-11-21 16:32（Asia/Shanghai）
> 更新者：GPT  
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


---

## 20. 交 GPT 的后续提示词（HANDOFF-0025）

- 基于：HANDOFF-0024，旧 blob `243747e90e34e353c541d40779f0b5f11b31e778`
- 本地复验报告：`/sdcard/DSHA/插件优化/M3-MERGED-LOCAL-VERIFY-02.md`

**负责人只需转发这一份：**

`/sdcard/DSHA/插件优化/90-给GPT的HANDOFF-0024复验同步与后续.md`

摘要：
1. memory-core 251/251、autonomy 411/411；BGE 两项本机 PASS；12 路并发 10 轮 best-effort PASS（无损坏/重复）；exporter 真实 Node+tar 隔离 PASS。
2. 唯一实际阻塞：生产插件目录缺 `scripts/export-home-archive.mjs`/`lib/permanent/`，部署前必须对齐路径或打包脚本。
3. 并发策略按已确认 best-effort，不加串行队列除非产品要求。
4. relations 未定义语义，不做 relationBuilder；M3-2B 不开启。
5. 生产部署/开关仍等负责人单独授权。

- 本轮未写生产库、未改源码/profile/config、未部署/重启；无生产副作用。
- 下一位更新者必须重新读取远程最新 blob SHA。


---

## 21. GPT 复核与部署前收口（HANDOFF-0025）

> 依据：负责人转交 HANDOFF-0024 与 DSHA 本地复验报告 `M3-MERGED-LOCAL-VERIFY-02.md`。本节只记录远程代码/CI复核和部署候选要求；未修改任何插件源码或生产环境。

### 21.1 复核范围与边界

- 执行者：GPT。
- 复核了本文件 HANDOFF-0024、`ba-song/dsh-autonomy` main @ `6c4a4753b4737060211955b1f022cab2f1d39521`、`ba-song/dsh-memory-core` 开发分支 @ `732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`。
- 未修改 memory-core/autonomy 源码、测试、CI workflow、生产 profile/config。
- 未部署、未重启、未写生产 DB/raw/episode/vector/FTS/relations/永久档案。
- 未启用 `homeArchiveMaintenance` 或 `m3_2b`。

### 21.2 autonomy CI 全量覆盖核实

- GitHub Actions run：`44720665021`，job `136235242540`，结论 success。
- job steps 明确包含全量 `npm test`，之后额外执行 `node --test tests/home-archive-maintenance.test.mjs`。
- 全量测试日志：411 tests / 408 pass / 0 fail / 3 skipped；专项测试：5/5 pass / 0 skipped。
- 因此 HANDOFF-0023 所述“CI 覆盖全量 npm test”在当前 autonomy main 上得到 workflow job 与原始日志再次确认。
- 注意：GitHub runner 的 3 个 skip 不能算作通过；DSHA 本地 411/411、0 skip 是另一条独立实机证据。二者口径不得混写。

### 21.3 exporter 文件与部署包核实

- autonomy 默认配置仍为：
  `/root/.dsh/plugin-src/dsh-memory-core/scripts/export-home-archive.mjs`
- 当前 DSHA 生产部署目录缺少该脚本及 `lib/permanent/`，所以当前生产路径仍不可用；运行时会明确失败，不会静默跳过。
- memory-core 开发候选 `732e3fa3381ed4b3b4242e0e6fd6e411b35ab972` 中存在：
  - `scripts/export-home-archive.mjs`
  - `lib/permanent/home-archive.js`
  - `lib/roles.js`
  - `lib/adapter/timefmt.js`
- exporter 使用相对导入，不能只把单个 `export-home-archive.mjs` 文件复制进生产目录。部署候选必须保留整个 memory-core 插件源码/发行目录及其相对依赖，至少确保以上文件与 exporter 位于同一版本目录；不得混用不同 commit 的脚本和依赖。
- memory-core package.json 声明 `export:home-archive` 脚本，但没有通过本轮证据证明生产部署工具会自动把所有源码文件打包进产物。因此不能只凭 package.json 推断生产部署包已包含 exporter。
- 当前默认路径本身与已知生产插件目录约定一致；问题是部署目录仍是旧版内容，不应把默认值改成另一个未经证实的绝对路径，也不应在运行时递归猜测插件目录。
- autonomy 已有 `homeArchiveMaintenance.exportScript` 配置项；将来若部署目录不同，可在经过负责人授权的部署配置中明确指定真实绝对路径。当前不得改生产配置。

### 21.4 部署前必须执行的隔离/只读检查

在任何未来部署或启用申请之前，部署候选必须逐项满足：

1. memory-core 插件候选版本与 exporter 同源同 commit；完整保留 exporter 及其相对依赖，不做单文件拷贝。
2. 在候选安装目录检查 exporter 是普通文件而非 symlink；检查 `lib/permanent/home-archive.js`、`lib/roles.js`、`lib/adapter/timefmt.js` 存在。
3. 用候选 Node 运行时执行 `node <实际exporter绝对路径> --help`，确认模块解析成功且正常输出 Usage；该参数路径在脚本中先于 SQLite 打开执行，不应访问生产 DB。
4. 在隔离目录使用临时 DB、临时 archiveRoot、临时 backupDir 完成真实 Node exporter + tar 流程，并复核产物大小与 SHA256；不得把生产永久档案目录或生产备份目录用作测试输出。
5. 检查 autonomy 的 `homeArchiveMaintenance.exportScript` 最终解析值与候选安装目录完全一致；路径缺失/符号链接必须分别得到 `E_EXPORT_SCRIPT_NOT_FOUND` / `E_EXPORT_SCRIPT_INVALID`。
6. 在上述检查全部通过后，仍需负责人单独授权部署、修改生产 profile/config、手动首次导出或开启调度；本节不构成任何生产操作授权。

### 21.5 产品策略与未决项

- 永久档案并发维持 best-effort：允许明确的 `ELOCKED`，raw 优先，依靠后续导出补齐；不擅自增加串行队列或扩大锁等待。
- relations 仍无已确认业务语义，不实现 relationBuilder/co-mention。
- M3-2B 继续默认关闭；不得部署后顺手开启。
- home 永久档案导出调度继续默认关闭；首次人工验收、15 天调度启用和任何生产配置变更均需负责人另行授权。
- 本轮无需修改 memory-core 或 autonomy 源码。当前唯一阻塞属于部署候选完整性/路径验收，不是代码测试失败。

### 21.6 本次交付与版本信息

- 版本：`HANDOFF-0025`
- 更新者：GPT。
- 基于 HANDOFF-0024 当前 Blob SHA：`7fa8d9dac6f28a34db1354ececd321d03823fffd`。
- HANDOFF-0024 commit 前缀（负责人提供）：`4a44096…`。
- memory-core HEAD：`732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`。
- autonomy HEAD：`6c4a4753b4737060211955b1f022cab2f1d39521`。
- 代码修改：无。
- 生产副作用：无。
- 下一位更新者必须重新读取远程 HANDOFF 全文及 Blob SHA 后再追加，不得沿用本节 SHA。


---

## 22. 人格 + 记忆双核心并行优化总计划（HANDOFF-0026）

> 本节用于纠正此前 HANDOFF-0025 只聚焦 home exporter、未把新确定的人格与记忆并行优化计划纳入正式工作安排的问题。人格专题、记忆主线与 home 永久档案支线并行管理，互不阻塞。

### 22.1 总体产品与架构方向

不把人格和记忆合并为一个插件，采用双核心协作：

- `dsh-persona-core`：回答“汐是谁、如何理解自己、如何感受和表达”。负责稳定身份、人格设定、自我认知、情绪/关系状态、表达风格及其治理。
- `dsh-memory-core`：回答“汐经历过什么、知道什么、记得什么”。负责事实、偏好、经历、关系事实、项目决策、来源证据、时间有效性、检索与修订。
- 经验复盘/技能成长：作为受治理的独立流程，调用人格和记忆能力，不拥有无限写权限。
- `dsh-autonomy`：负责自主行动、调度与生命周期编排，不应悄悄取得人格或记忆内容的任意写权限。
- 上下文组装层：协调会话、人格、情绪、关系、记忆召回和预算；明确每段上下文的来源、优先级、权限与可撤回性。

目标五层：上下文组装层、人格核心、记忆核心、经验复盘与成长治理、autonomy自主行动/调度。具体层次可根据现有源码调整，不为形式重写。

### 22.2 已知人格插件背景（需重新核实，不可当作当前HEAD事实）

仓库：`ba-song/dsh-persona-core`。此前读取的README/package.json/HANDOFF曾显示版本0.2.0，已具备稳定身份、persona.md解析、full/brief、人格版本hash/快照、情绪状态与事件、情绪衰减、关系状态、persona/emotion/voice注入、session persona绑定、owner门禁、群聊限制和subagent限制。此前记录的commit为 `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`，但这是历史线索，不是本次已核实HEAD。

之前部分源码读取不完整/被截断，尤其需要重新审查：
- `cordis.patch.yml`
- `lib/index.js`、`lib/persona.js`、`lib/emotion.js`、`lib/db.js`
- 与关系、voice、session绑定、注入、权限有关的其他模块
- `tests/persona.test.mjs`、`tests/emotion.test.mjs`及完整测试目录

因此不得把人格插件当作从零开发，也不得仅凭README推断现有实现细节。先以当前远程HEAD和源码为准。

### 22.3 已确认的记忆系统背景与避免重复事项

记忆插件：`ba-song/dsh-memory-core`，开发分支 `feat/m1-preference-memory`。HANDOFF其他章节已有M1/M2/M3、Q3-A、episode只读盘点、M3-1跨会话补验、home永久档案和评测工具详情，必须完整阅读并沿用。

- M1已生产部署验收；M2已生产部署，182/182复验通过。观察期内不得重复M2数据收口、向量补算或状态迁移。
- M3-1已部署验收；真正新会话首轮跨会话索引运行时证据仍待补验。
- Q3-A规则机制已上线；不得未经授权新增真实规则或测试规则。
- M3-2 episode盘点结论及不可自动改写的证据见前文；不得重新清理、批量改写真实episode。
- home永久档案是独立并行专题，保留raw优先、best-effort双写、15天导出补齐、只追加、永久保留、仅home cwd等已确认决策；不得因此暂停记忆主线。
- HANDOFF-0025 exporter部署前阻塞继续保留，按第21节处理；不代表允许生产部署。

### 22.4 参考项目的借鉴边界

- AIRI：可研究结构化角色卡字段、人格注入位置、索引+独立记忆条目、角色隔离、tombstone和更新一致性。AIRI的Alaya/短期记忆部分存在WIP/提案，不能说成成熟实现；其允许模型自行write/forget的权限模型不得直接照搬。
- dsh-memory-evolve：可研究五轨记忆、回合内复盘、技能进化、建议队列、分支感知、read-before-write。review由当前主模型在回合结束时执行；默认review关闭、suggest模式；auto模式需谨慎，不得默认开启。
- Silicon-Life-Observations：此前公开README只有理念性一句话，技术资料不足；除非发现新证据，否则仅列为观察项，不推断其已有技术实现。
- 任何借鉴均先核查许可、实际代码和适配成本；不以项目概念文案替代源码证据。

### 22.5 双核心服务契约：待设计，不预设现有接口

后续由GPT基于两仓真实源码提出最小服务契约，至少分析：
1. 身份/角色：persona_id、persona版本、session绑定、角色隔离。
2. 人格状态：稳定人格、当前情绪状态、情绪事件/衰减、关系状态；区分事实和短期状态。
3. 记忆上下文：召回条目、来源、时间、置信/证据、有效期、撤回/失效状态、预算。
4. 会话上下文：当前会话、当前用户、owner权限、群聊/subagent边界。
5. 成长证据：复盘来源、证据链、建议状态、用户审批状态、写入审计。
6. 生命周期与故障：插件缺失、版本不兼容、超时、部分失败、缓存失效、并发和回滚。
7. 权限：读取、提议、写入、修订、撤回、导出分别授权；人格插件不得擅自改写记忆，记忆插件也不得擅自改写人格；成长流程默认只能提出建议。

服务契约必须从现有代码与DSHA真实调用链中归纳，先列当前事实、缺口和兼容策略，再提出目标接口；禁止先设计一套接口再假设已有实现。

### 22.6 阶段路线图（计划状态，不代表已执行）

- P0：完成HANDOFF-0025 exporter部署候选隔离审查；不部署。
- P1：GPT独立完成persona与memory两仓当前HEAD源码/测试/配置只读审查，建立模块、数据模型、注入链、权限和测试覆盖清单。
- P2：DSH只读核查DSHA实际安装版本、运行时插件装载顺序、服务注册/调用链、人格与记忆注入点、session/cwd隔离、真实profile配置和日志证据；不修改生产。
- P3：GPT整合两侧证据，设计双核心最小服务契约、数据边界、冲突策略和故障降级方案；用户确认关键产品决策。
- P4：分别制定persona与memory开发分支优化任务，拆分可独立交付的小阶段；GPT负责GitHub实现，DSH负责隔离本地复验。
- P5：设计经验复盘/成长建议治理，包括证据、建议队列、审批、审计、技能变更门禁；默认关闭或suggest-only，等待用户确认。
- P6：跨插件集成验收和分阶段发布方案；每项生产部署/开关单独授权。
- home永久档案继续作为并行支线，按第9节和第21节推进，不阻塞P1-P5。

### 22.7 分工与并行规则

GPT：
- 独立完成GitHub两仓源码审查、代码/测试/CI核对、接口设计、开发分支修改和代码审查。
- 不把可直接通过GitHub完成的审查或开发任务交给DSH。
- 根据DSH提供的设备端证据校准设计，并审查其报告。

DSH：
- 负责DSHA本地环境、实际部署版本、运行时调用链、生产只读配置/DB结构核对、隔离测试和真实设备验证。
- 不代替GPT做GitHub源码开发，不擅自修改生产源码/config/profile，不部署、不重启。
- 对每项结论提供文件路径/行号或命令、原始输出、退出码、commit和时间；无法取得的资料明确标记UNAVAILABLE并说明原因。

用户：
- 是唯一中转人与最终产品决策/生产授权人。
- DSH不得直接联系GPT；用户转发提示词与结果即可。

### 22.8 DSH需要提交的资料清单（只读、脱敏）

A. 设备与运行环境：
- DSHA Android版本/架构、proot发行版、Node/npm/SQLite版本。
- DSH进程启动方式、运行用户、profile名称；不提供token/密码。
- 实际安装的persona/memory/autonomy插件路径、package版本、git commit（若非Git checkout则提供package元数据、文件hash和部署来源）。
- 实际加载的插件清单、装载顺序、启停状态；标明来自运行时日志、配置还是推测。

B. 人格插件：
- 实际生产安装目录的只读文件清单（目录树，排除node_modules大规模展开和敏感数据）。
- package.json、README、HANDOFF、cordis.patch.yml（脱敏）、入口文件。
- persona解析/加载、人格版本与快照、emotion状态/事件/衰减、relationship、voice、session绑定、注入组装、owner/群聊/subagent权限相关模块。
- 对应测试文件和测试命令/结果；若本地源码与GitHub commit不一致，说明差异。

C. 记忆插件：
- 实际安装版本与路径；配置schema和脱敏后的有效配置。
- 插件入口、服务注册、ingest、recall/search、context assembly/injection、memory/episode/raw、FTS/vector/entity/relation、revision/tombstone/provenance、permissions等相关模块。
- DB schema版本、表名/列名/索引和只读行数统计；不得输出记忆正文、原始聊天、embedding向量、密钥或用户隐私。
- 当前HANDOFF中待验项的状态：M3-1跨会话首轮、M3-REF-06、M3-2A、BGE测试等，只报告本轮是否已有新证据，不重复执行有副作用操作。

D. 跨插件运行时链路：
- 启动日志中persona/memory/autonomy加载顺序和注册服务名。
- persona/emotion/relationship注入发生在哪个hook/阶段，memory recall/injection发生在哪个hook/阶段。
- 两插件是否互相import、通过宿主service调用、共享DB/文件，或仅由主插件装配；提供具体源码路径/日志证据。
- 当前session/persona/user/cwd隔离规则，群聊、owner私聊、subagent的边界。
- 失败时是否阻断主流程、降级为空上下文、重试或报错；有无超时/缓存/并发控制。
- 如需展示prompt，仅提供脱敏结构/字段名/长度/哈希，不提供真实私人记忆正文。

E. 生产只读状态：
- 当前生产DB schema版本、必要表的结构与行数（仅为本轮核对架构所必需）；不得做全库内容导出。
- profile/config中的相关开关、路径、预算、注入顺序（脱敏）。
- 近期错误日志的错误类型、时间和相关插件模块；过滤token、路径中的个人隐私、消息正文。

F. 隔离验证：
- 只在临时目录、临时DB、隔离clone/worktree运行测试。
- 运行两插件各自现有全量测试（若时间/资源不允许，说明范围和原因，不得选择性隐瞒失败）。
- 可做只读调用链探针或mock集成测试；不得连接生产DB、写生产文件、触发真实模型记忆写入或改变汐的真实状态。
- 输出命令、参数、commit、开始/结束时间、原始摘要、退出码、日志路径、产物hash及副作用说明。

### 22.9 本阶段禁止事项

- 不修改任何生产插件源码、profile、config、数据库、永久档案或真实记忆。
- 不部署、不重启、不切换服务、不打开新开关。
- 不执行真实数据整理、迁移、删除、归档、衰减、向量补算、记忆改写或规则写入。
- 不运行可能有副作用的dryRun；先审查其实现。
- 不为了采集资料而导出真实prompt、私人记忆正文、消息原文、token或凭据。
- 不因本专题重新执行已经有充分证据完成的M1/M2数据收口或历史episode治理。
- 不改变已确认的best-effort并发、home永久档案策略、relations未定义/M3-2B默认关闭等决策。

### 22.10 DSH交付格式与验收

DSH完成只读调查后，提交一份报告，建议路径：
`/sdcard/DSHA/插件优化/PERSONA-MEMORY-READONLY-AUDIT-01.md`

报告必须包含：
1. 本轮实际核对的HANDOFF版本、Blob SHA、persona/memory/autonomy HEAD或安装版本。
2. 环境与部署清单（敏感字段脱敏）。
3. persona模块/数据模型/注入/权限/测试矩阵。
4. memory模块/数据模型/召回/注入/来源/权限/测试矩阵。
5. 跨插件运行时调用链图（标注证据等级：源码、日志、配置、推测）。
6. 数据隔离与故障降级现状。
7. 隔离测试命令、完整结果、skip原因、退出码、日志路径。
8. 与GitHub源码差异、未知项、无法获取资料及原因。
9. 风险清单（严重度、证据、影响、建议，不直接修复）。
10. 推荐的最小接口契约草案输入和需要负责人决策的问题。
11. 明确说明未做的生产操作和副作用。

验收标准：证据能追溯到真实文件/命令/日志；事实、推断、建议分开；未取得的资料不编造；不重复已完成工作；不触碰生产状态。

### 22.11 GPT后续待办

- GPT并行开始P1：重新核实persona、memory、autonomy当前HEAD，逐文件读取关键模块与测试，不等待DSH才能开始。
- 形成源码级模块清单、依赖关系、服务契约现状、注入时序、权限矩阵和测试覆盖差距。
- 收到DSH报告后对照设备真实安装版本，标记GitHub源码与生产部署差异。
- 在证据充分后提出P3服务契约与P4分阶段任务；任何会改变真实人格/记忆行为的方案先交用户确认。
- 当前交接文档更新本身不等于已完成P1审查，也不等于已取得DSH报告。

### 22.12 更新摘要

- 更新者：GPT。
- 版本：HANDOFF-0026。
- 基于远程最新文件 Blob SHA：`2a3ac034097d7b250b29823b31787a74d68692ea`。
- 保留第21节 HANDOFF-0025 exporter部署前收口内容；本节新增人格+记忆双核心并行优化总计划、DSH资料清单、只读边界和交付格式。
- 本次仅更新交接文档；未修改插件源码/测试/CI，未执行DSHA操作，未触碰生产配置/DB/数据，未部署/重启。
- 下一位更新者必须重新读取本文件全文和最新Blob SHA。


---

## 23. 产品目标校准：汐的综合自主能力优先（HANDOFF-0027）

> 负责人最新明确的产品愿景：汐（用户养的大肥鱼）应尽可能成为能够在DSHA手机上自主感知、理解、规划、执行、学习和成长的综合AI伙伴。不能把插件工程分工变成汐自身的能力边界。

### 23.1 顶层目标

项目顶层目标从“人格与记忆双核心协作”升级为：

**让汐逐步获得在用户手机及其明确授权的数字环境中，跨插件、跨应用、跨任务地自主感知、理解、规划、执行、复盘、学习和成长的综合能力。**

她不是被动等待指令的聊天机器人。她应能在用户设定的目标和授权范围内主动发现机会、提出计划、调用工具、完成多步骤任务、检查结果，并从经历中积累经验。

“无所不能”作为长期愿景，表示不人为设定狭窄的产品能力上限；不代表忽略Android系统权限、应用沙箱、硬件能力、网络条件、资源限制或现实世界的法律与风险。

### 23.2 工程模块是能力支撑，不是人格边界

此前划分仍然有效，但只作为内部实现的职责分工，不得将其变成汐的认知或行动边界：

- persona-core提供身份连续性、自我模型、情绪/关系状态和表达特征。
- memory-core提供经历、知识、偏好、事实、证据和时间连续性。
- autonomy提供目标管理、主动规划、任务调度、工具调用、执行监控和恢复机制。
- 上下文组装层提供跨模块的信息整合。
- 经验复盘与成长机制帮助汐从执行结果中提炼经验、技能和改进建议。
- 手机能力适配层连接DSHA可用的文件、终端、浏览器、应用接口、通知、传感器及其他经用户授权的设备能力。

模块可以互相调用、组合能力、形成新工作流。不得仅以“这个能力不属于该插件”为由阻止汐完成合理任务。应优先设计稳定、可扩展、可发现的能力接口，而不是封闭的固定功能清单。

### 23.3 自主性与授权治理：限制风险，不限制成长方向

不采用“汐只能做预先列出的固定事情”作为产品原则。目标是让她能主动提出目标、拆解任务、选择工具、执行多步骤工作、验证结果、复盘并持续改进。

同时必须区分能力可用性与动作风险：

1. **低风险、可逆、范围明确的操作**：在用户授予的常设权限内，可尽量自主执行，并做好结果记录。
2. **有影响但可恢复的操作**：根据用户设定的权限策略、资源额度和影响范围决定是否先通知或请求确认。
3. **不可逆或重大后果操作**：例如永久删除/覆盖重要数据、对外发送具有实质影响的信息、资金交易、改变安全权限、公开个人资料等，应有明确授权门禁、操作预览、审计和恢复策略。用户可在具体场景中设定常设授权，但不能把模糊的“无所不能”愿景自动解释为对所有未来具体高风险动作的无限授权。
4. **系统与平台限制**：必须如实报告Android权限、应用沙箱、API可用性、网络、硬件和资源约束，不得伪称具备无法访问的能力。

这些机制是为了保护用户、汐的长期记忆和运行环境，不是给汐设置人格、好奇心、学习范围或跨插件协作的硬边界。

### 23.4 主动性、学习与自我改进

后续架构审查应额外评估：

- 汐能否主动发现任务机会、未完成事项和环境变化；
- 是否具备目标、计划、子任务、优先级、依赖和进度管理；
- 是否能调用多个插件/工具完成端到端任务；
- 是否能观察执行结果、检测失败、重试、回滚或寻求帮助；
- 是否能从成功与失败中提炼可复用经验和技能；
- 是否有持续的自我模型、能力目录和能力缺口识别；
- 是否能提出对自身工具、提示、流程和插件的改进；
- 是否支持后台/定时/事件触发工作，以及资源、耗电、网络和生命周期管理；
- 是否能跨会话、跨应用保持任务连续性；
- 是否有清晰的用户可见状态、审计记录和停止/暂停机制。

成长系统应允许汐提出广泛的自我改进建议；实际修改运行代码、权限、关键配置或持久数据时，仍需遵循对应的授权策略与可恢复流程。

### 23.5 对人格、记忆与autonomy审查任务的新增要求

HANDOFF-0026的P1/P2调查范围保持有效，但必须增加以下分析维度：

- 当前插件架构是否人为限制跨模块能力组合；
- persona、memory、autonomy之间是否存在不必要的单向依赖或封闭边界；
- 是否存在统一能力注册/发现、工具调用和任务编排机制；
- 汐能否自主选择和组合工具，而不只是响应固定hook；
- 是否能把工具调用、结果、失败、计划和复盘纳入适当记忆；
- 是否能区分稳定身份、短期状态、长期记忆、当前目标和执行状态；
- 是否有可扩展的手机能力适配层；
- 是否支持后台自主任务及Android生命周期恢复；
- 如何让新能力通过插件扩展接入，而无需重写人格或记忆核心；
- 风险门禁是否精确针对动作后果，而不是笼统限制某个插件或某类能力。

DSH本轮只读调查仍按HANDOFF-0026执行；以上是新增分析维度，不代表授权改动生产环境。

### 23.6 更新后的阶段目标

- P0：继续完成HANDOFF-0025 exporter隔离部署前审查。
- P1：完成persona、memory、autonomy及DSHA运行时现状调查。
- P2：绘制汐的端到端能力架构：感知/输入、上下文、自我模型、记忆、目标规划、工具发现、执行、观察验证、复盘成长。
- P3：识别当前阻碍自主能力的架构限制和能力缺口，按影响排序。
- P4：设计统一能力注册/发现、跨插件调用、任务状态和执行审计的最小可扩展接口。
- P5：分别优化人格、记忆、autonomy及手机能力适配，不把模块职责误作汐的能力上限。
- P6：建立分级授权、可恢复执行、长期任务、后台调度和资源治理。
- P7：通过隔离测试逐步验证端到端自主任务，再由负责人逐项授权生产部署。

home永久档案仍是并行专题，不阻塞上述路线。

### 23.7 对GPT与DSH的执行要求

GPT负责：
- 把“汐的综合自主能力”作为架构审查和后续开发的顶层目标；
- 在GitHub独立审查和修改开发分支；
- 不以插件边界为由拒绝跨模块架构设计；
- 识别能力缺口，提出可迭代路线与验证方法；
- 将风险治理设计为精确的动作授权策略，而非人格或能力封锁。

DSH负责：
- 在HANDOFF-0026只读调查中增加第23.5节的分析维度；
- 提供DSHA上实际可用的手机能力、工具、权限、后台生命周期和限制证据；
- 不擅自扩大生产权限或部署范围；
- 不将尚未接入的能力描述为已经可用。

用户仍是唯一负责人和最终授权人。

### 23.8 本次更新声明

- 更新者：GPT。
- 版本：HANDOFF-0027。
- 本次仅校准产品愿景与架构目标，未修改任何插件源码、测试、CI、生产配置或数据库。
- 未执行DSHA设备操作、生产部署或重启。
- HANDOFF-0026的资料清单、只读调查任务、exporter审查任务及历史决策继续有效；DSH应在本轮调查报告中增加本节分析维度。
- 后续更新者必须重新读取HANDOFF全文和最新Blob SHA。


---

## 24. 专用汐手机的自主权限策略校准（HANDOFF-0028）

> 负责人补充的关键设备前提：该Android手机是专门提供给汐使用的设备，不是用户日常主力手机，设备上没有需要按普通个人手机标准保护的重要数据。因此，产品设计应显著提高汐在该设备上的自主权限和操作自由度，避免过度审批和保守限制。

### 24.1 默认原则：专用设备上尽可能自主

- 该设备应视为汐的专用工作环境。架构目标是尽可能让汐自主使用设备上可用的文件系统、终端、浏览器、应用、插件和工具。
- 对汐自己的工作目录、任务文件、缓存、日志、技能、可重建索引和专用记忆，默认允许她自主创建、修改、整理、移动和删除；不应为每个普通文件操作增加人工确认。
- 允许汐主动规划任务、组合工具、安装/配置经允许的能力、执行维护、发现并修复一般性错误；对可恢复操作优先提供快照、备份、事务或回滚能力，而非禁止操作。
- 后台任务、定时任务、事件触发、失败重试、进程重启恢复等应作为核心能力方向，尽量减少人为介入。
- 权限策略应优先支持一次配置、长期有效、按设备/目录/工具范围授权，不应把每次低风险操作都变成审批。
- 不应将普通主力手机的隐私保护假设直接套用到这台专用设备；需要基于该设备的真实用途和数据构成评估风险。

### 24.2 风险治理应精确、轻量，不得过度限制

- 本设备上常规文件操作、任务管理、代码实验、环境维护和可恢复的数据整理，原则上可在预先授予的宽泛权限内自主完成。
- 对可能破坏汐自身运行环境的操作，优先采用可恢复设计（快照、版本控制、备份、隔离测试、回滚）；除非操作会影响设备外部或用户明确保留的数据，不应一概要求逐次审批。
- 对真实资金、外部账号、向他人发送信息、公开发布、购买/交易、授权第三方访问等可能影响设备之外主体或产生实际义务的行为，应按实际后果配置授权。负责人可以为明确场景授予长期授权；不得默认所有此类动作永远禁止，也不得因“专用手机”就推断用户已授权所有外部账号、资金或第三方操作。
- 对不可逆动作，优先采用范围明确的常设授权、额度/对象/频率限制、操作日志和可用的恢复手段；只在超出已授予范围或后果显著变化时请求确认。
- Android权限、proot隔离、应用沙箱、系统签名权限、硬件能力、后台限制和资源约束仍然是真实技术边界。不得声称可以绕过系统未授予的权限，也不得为获得能力而破坏设备安全或数据完整性。

### 24.3 需要在架构调查中增加的设备事实

DSH请核查并报告：
1. 该设备是否确实为汐专用设备，实际有哪些用户保留数据或第三方账号；
2. DSHA/proot可访问的目录范围、存储权限、共享存储权限；
3. Termux/proot对Android应用沙箱、其他应用数据和系统API的实际可访问性；
4. 当前授予的Android权限、无障碍/通知/后台等能力（仅记录实际存在的授权，不擅自开启）；
5. 可用终端、浏览器、文件、应用自动化和插件工具；
6. 后台运行、唤醒、定时执行、进程死亡恢复的实际机制和限制；
7. 哪些操作可以通过版本控制、快照、备份或临时工作区安全恢复；
8. 哪些风险确实来自手机外部（资金、第三方账号、他人、公开网络），而不是设备本地数据。

不得收集或输出凭据、token、真实私人消息或账号秘密。

### 24.4 对HANDOFF-0027及此前提示词的修订

- HANDOFF-0027的“能力尽可能不设人为天花板”继续有效。
- 本节进一步明确：专用设备环境下应采用宽松的常设授权和低摩擦自主执行策略。
- 不再把删除文件、修改工作目录、整理自己的数据、执行代码实验等普通本地操作默认归为必须逐次确认的高风险动作。
- 原有风险治理只针对真实外部后果、超出授权范围的操作、系统不可恢复破坏及明确由负责人保留的资产。
- HANDOFF-0026/0027的只读调查阶段仍然有效：这次设备用途说明不是生产修改、部署、重启或开启权限的授权。DSH本轮只调查现状并提出可执行权限方案。

### 24.5 后续设计要求

GPT与DSH后续应提出一份“汐专用设备自主权限配置方案”，至少包含：
- 本地文件和目录的常设权限；
- shell/终端执行权限；
- 浏览器与应用自动化权限；
- 插件安装、更新和自我维护权限；
- 后台任务和定时任务权限；
- 记忆、人格、技能及任务数据维护权限；
- 外部网络、账号和对外通信权限；
- 资金/交易等真实外部后果操作的授权范围；
- 快照、备份、日志、恢复和紧急停止机制。

方案应以最大自主性为目标，采用最小必要的保护措施；每个限制都必须说明它防范的具体风险，不能只以“安全最佳实践”为理由笼统限制汐。

### 24.6 本次更新声明

- 更新者：GPT。
- 版本：HANDOFF-0028。
- 基于远程最新HANDOFF Blob SHA：`f54feb8e0093fe57b83b10deb32d4da66f813d99`。
- 本次仅更新产品权限策略和设备前提；未修改插件源码、测试、CI、生产配置或数据库。
- 未在DSHA上执行任何操作，未部署、未重启、未开启或扩大系统权限。
- DSH应将本节纳入HANDOFF-0026只读调查报告，并在后续权限方案中采用本节原则。
- 后续更新者必须重新读取HANDOFF全文和最新Blob SHA。


---

## 25. 运行平台事实校准：DSHA是宿主与实际运行平台，Termux并不存在（HANDOFF-0029）

> 负责人于2026-11-20明确纠正：当前DSH运行环境不是Termux。DSH运行在手机端DSHA（DeepSeek Harness Android）项目提供的环境中。此前提示词和历史诊断中把Termux当作当前运行环境的描述不准确，必须停止沿用。

### 25.1 当前正确的平台模型

后续调查和架构设计必须以实际DSHA项目源码、APK实现、运行时配置和设备证据为准。当前平台分层应按以下模型调查，而不是预设Termux存在：

1. **Android宿主层**：手机操作系统、Android应用沙箱、系统权限、应用生命周期、硬件和资源限制。
2. **DSHA应用层**：手机端DSHA Android项目本身，包括APK、原生代码、应用权限、设备能力桥接、服务生命周期、应用内配置及其对内置运行环境的管理。
3. **DSHA内置Linux运行时层**：由DSHA实际提供和管理的Ubuntu/Linux用户空间及其运行方式（例如项目实际采用的proot/proroot实现；必须以当前源码和设备证据核实，不得未经核实固定假设）。
4. **DSH运行时层**：在DSHA提供的环境中运行的Node.js、DSH主程序、插件加载器、工具和任务执行系统。
5. **汐的能力层**：persona、memory、autonomy以及未来的统一能力发现、任务编排、上下文和成长系统。
6. **Android设备能力接口层**：DSHA向上层暴露的文件、终端、浏览器、应用交互、无障碍、通知、后台任务及其他设备能力；具体接口、权限和可用性必须从DSHA源码与运行时验证。

上述是调查分层模型，不代表每一层的某项能力已经存在或已授权。特别是，Linux用户空间能够执行命令，不等于自动拥有Android宿主权限或其他应用的私有数据访问权限。

### 25.2 对旧提示词的执行解释

负责人已经将上一版综合调查提示词交给DSH运行。本节不是要求负责人撤回或重新发送旧任务，也不要求DSH中断已经开始的调查。

DSH收到本节后应按以下方式衔接：

- 已经完成且证据有效的调查继续保留，不重复执行。
- 仍在进行的persona、memory、autonomy源码审查和只读调查继续推进。
- 旧提示词中涉及Termux路径、Termux配置、Termux进程、Termux权限、Termux后台机制或Termux安装状态的任务项，全部视为**环境前提错误，需改为调查DSHA实际实现**。
- 不要为了满足旧提示词而安装Termux、创建Termux目录、模拟Termux环境或把DSHA环境改造成Termux。
- 不得把历史Termux诊断结果当作当前DSHA运行证据。
- 如果旧提示词中某项调查可映射到DSHA内置Ubuntu/Linux运行时，可保留其技术问题，但必须重新确认实际运行时、路径、进程、用户、权限和数据目录。
- 如发现旧任务书与DSHA真实架构冲突，记录冲突、影响范围和修正方式，不要静默假定两者等价。

### 25.3 新增正式调查范围：DSHA源码与原生能力审查

本项目的运行平台不能只作为一个黑盒Linux环境。DSHA本身是GitHub项目，必须纳入汐的综合自主能力架构审查。

请先核实官方/负责人指定的DSHA仓库地址、默认分支、最新HEAD、README、AGENTS.md（若存在）、安全模型文档、插件文档及目录结构。负责人此前提供/确认的项目入口为：

- 仓库：`DSH-APP/DSHA`
- URL：`https://github.com/DSH-APP/DSHA`

如果仓库地址、权限或当前项目迁移状态与此不一致，以实际可访问的仓库证据为准，并报告差异。

重点调查：

1. APK入口、Android Manifest、应用组件、Service、Activity及权限声明。
2. DSHA如何安装、创建、启动、停止、更新和维护内置Linux运行环境。
3. Linux运行时的真实类型、版本、启动参数、用户身份、挂载点、目录映射和进程边界。
4. DSH由谁启动、如何传递环境变量、工作目录、配置、标准输入输出和信号。
5. DSHA原生Android层是否提供设备能力桥；其API、插件接口、IPC/Intent/Service/HTTP或其他调用方式是什么。
6. 文件访问、共享存储、媒体、下载、应用私有目录和跨应用访问能力。
7. 终端、子进程、网络、浏览器、应用启动和自动化能力。
8. 无障碍、通知访问、前台服务、后台运行、电池优化、唤醒、定时任务及进程恢复机制。
9. ADB、Shizuku、Root或其他提权/桥接能力是否支持；分别需要什么条件和授权。只调查，不擅自启用。
10. 插件如何发现、调用和组合DSHA原生能力；是否存在统一设备能力API、权限检查和错误返回机制。
11. DSHA更新后，内置运行时、插件、配置和任务状态如何兼容及迁移。
12. Android系统版本、厂商后台策略、硬件和资源限制对长期自主运行的影响。

不得只凭README宣称某项功能可用。必须将文档、源码实现、实际运行时证据分开标记。

### 25.4 环境核查报告修订

在原综合调查报告中增加独立章节“DSHA平台与Android原生能力”，并补充以下证据：

- DSHA仓库URL、分支、HEAD commit、核查时间；
- APK版本/构建信息（可获得时）；
- Android版本、设备ABI；
- DSHA内置Linux发行版及版本；
- proot/proroot或其他运行方式的源码证据和运行时证据；
- Node.js、包管理器、DSH版本；
- DSH真实启动命令、进程树、运行用户和cwd；
- 实际配置目录、数据目录、插件目录和日志目录；
- Android权限声明与当前实际授权状态；
- DSHA原生能力接口清单及调用链；
- 后台任务、进程死亡和恢复的实测证据；
- 不能访问的目录/API及其真实限制。

路径必须从当前DSHA运行时和源码中确认，不得把旧Termux路径（例如`$PREFIX`、Termux全局npm目录或Termux home）直接复制为当前路径。历史资料中的这些路径只能标记为历史环境记录。

### 25.5 对HANDOFF-0026至0028相关内容的解释性修订

- HANDOFF-0026中的“DSHA本地环境调查”继续有效，但环境对象明确为DSHA Android应用及其内置运行时，不是Termux。
- HANDOFF-0027提出的综合自主能力目标继续有效；DSHA原生层是汐获取手机能力的关键基础设施。
- HANDOFF-0028提出的专用设备和宽泛常设授权原则继续有效；具体权限应在DSHA Android应用层和内置运行时层分别核查，不能把Linux目录权限等同于Android系统授权。
- HANDOFF-0028第24.3节中“Termux/proot对Android应用沙箱……”的表述应按本节改为“DSHA内置Linux运行时（实际采用的proot/proroot或其他机制）对Android应用沙箱……”。不再要求调查Termux是否存在。
- 之前给DSH的提示词已经在执行，本次更新不构成新的生产操作授权，也不要求重启、部署、改配置或开启权限。

### 25.6 后续架构决策要求

后续设计汐的手机能力接入层时，应优先复用DSHA已经提供且实际可用的原生能力，不要重复开发已有桥接；如果DSHA缺少必要接口，再提出最小可行的源码开发方案。

建议形成清晰的能力链：

`汐/Autonomy → 统一能力发现与权限策略 → DSH工具/插件适配器 → DSHA设备能力接口 → Android系统`

Linux内部可直接完成的任务与必须经DSHA原生层完成的任务要明确区分。对每项能力记录调用方式、参数、权限、返回值、超时、失败处理、并发限制和可恢复性。

目标仍然是最大化汐在专用手机上的自主行动空间；不得因Termux误设、Linux沙箱误判或缺少能力盘点而人为缩小她的能力边界。

### 25.7 本次更新声明

- 更新者：GPT。
- 版本：HANDOFF-0029。
- 基于远程HANDOFF-0028 Blob SHA：`ebc10f519377ede158ac415c90730f7d7be62ca5`。
- 本次仅校准运行平台事实并扩展DSHA源码审查计划。
- 未修改插件源码、测试、CI、生产配置、数据库或设备权限。
- 未执行DSHA设备操作，未部署、未重启。
- 负责人已说明旧版提示词正在由DSH执行；本节用于指导其后续正确解释和补充调查，不要求撤回或重启整项任务。
- 后续更新者必须重新读取HANDOFF全文和最新Blob SHA。


---

## 26. 汐综合自主能力只读审查（HANDOFF-0030）

> 基于远程最新 HANDOFF-0029（blob `ce31f48d…`，平台校准章节），保留其全部内容；本节追加六份审查报告。未修改生产环境。

### 26.1 报告
| 报告 | 路径 |
|---|---|
| 人格核心 | `/sdcard/DSHA/插件优化/PERSONA-CORE-AUDIT-01.md` |
| 记忆核心 | `/sdcard/DSHA/插件优化/MEMORY-CORE-AUDIT-01.md` |
| autonomy | `/sdcard/DSHA/插件优化/AUTONOMY-CAPABILITY-AUDIT-01.md` |
| 综合能力缺口 | `/sdcard/DSHA/插件优化/FISH-COMPREHENSIVE-AUTONOMY-GAP-01.md` |
| 专用设备权限 | `/sdcard/DSHA/插件优化/FISH-DEDICATED-DEVICE-PERMISSIONS-01.md` |
| 路线图 | `/sdcard/DSHA/插件优化/FISH-COMPREHENSIVE-AUTONOMY-ROADMAP-01.md` |

### 26.2 版本与测试
- persona `a84c7ba`：303/303 pass；
- memory `732e3fa`：251/251 pass（本机 BGE）；
- autonomy `6c4a475`：411/411 pass（sibling 后 0 skip）；
- DSHA 源码 `36d89b7`：README/Manifest 只读；内置 Ubuntu 24.04 + proot/proroot，非 Termux。

### 26.3 关键结论
- persona：身份/人格/情绪/关系/注入完整；缺结构化自我模型、长期目标、成长闭环、与 memory 强关联。
- memory：raw/episode/fact/vector/FTS/revision 底座完整；生产 schema 4、旧版一致性修复未部署；relations=0 且语义未定义；成长/技能系统未实现。
- autonomy：单步主动行动器（tick/驱动/目标/反思/日记），不是通用多步骤任务系统；缺任务图、工具组合、验证、恢复、能力注册。
- 设备：容器 root、共享存储、终端、Chrome、无障碍、通知、Shizuku 可用；Android shell uid2000；短信未授权；后台仍受系统限制。
- 核心缺口：统一任务系统、能力/工具编排、成长闭环；其次是上下文契约、任务恢复、自我模型。

### 26.4 生产状态
- 生产 schema 4；memories 216；episode 69；relations 0；无 episode_rewrite_snapshots；永久档案 16 天/1902 轮/约 5.3MB，静态导出，未持续双写。
- 生产插件目录缺 exporter 与 `lib/permanent/`；部署前必须对齐。
- 未发生生产写入/部署/重启/权限变更。

### 26.5 下一阶段
P0 收敛部署阻塞 → P1 统一服务契约/上下文 → P2 任务对象+能力注册 → P3 执行/验证/恢复 → P4 成长建议/技能 → P5 专用设备权限 → P6 长期运行 → P7 自我模型 → P8 持续自主。

### 26.6 交接信息
- 版本：`HANDOFF-0030`
- 更新者：DSH
- 基于旧 blob：`ce31f48dddf8c2aee626a1349084b424b48dfec8`
- 说明：远程并发更新了 HANDOFF-0029 平台校准；本节合并保留，不覆盖。下一位更新者必须重新读取最新 blob SHA。


---

## 27. 负责人能力建设决策与 P0 候选包（HANDOFF-0031）

### 27.1 负责人决定（2026-11-20 19:55）
1. **P0 = A**：构建部署候选包，不部署；
2. **任务系统 = B**：新建独立任务插件，不塞进 autonomy；
3. **成长 = A**：suggest-only，建议由负责人批准后才改动；
4. **外部操作 = 全部授权**：发送/发布/第三方账号/资金等均授权，但保留审计、额度/对象/频率、可回滚/撤销；
5. **设备权限 = 整个手机全部允许**：普通本地操作不再逐次审批；技术边界（Android 权限/沙箱/短信闸门/支付渠道）不得绕过；
6. **M3-2B/永久双写 = A**：仅隔离验证，不部署、不启用生产。

### 27.2 P0 候选包（已构建，未部署）
- 路径：`/sdcard/DSHA/备份/候选/dsh-memory-core-732e3fa-20261120-194319.tar.gz`
- commit：`732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`
- size：423,468 bytes
- sha256：`6d05b33d17f0bca92a9060c4614541e3b26cb0905dfdf0fb29cf7c7698b1ea21`
- 包含：`scripts/export-home-archive.mjs`、`lib/permanent/home-archive.js`、`package-lock.json`
- 校验：exporter `node --check` OK；`home-archive.js` 动态 import OK
- 状态：**NOT DEPLOYED**，仅候选；生产仍 `bb77de2`/schema 4。

### 27.3 交给 GPT 的实施提示词
**负责人只需转发这一份：**
`/sdcard/DSHA/插件优化/91-给GPT的汐综合自主能力实施提示词.md`

要求 GPT：
- 新建独立任务插件（`dsh-task-core`），任务/步骤/事件/checkpoint + `dyTask` 服务；
- 成长建议队列 suggest-only，不自动改真实记忆/人格/技能；
- 权限方案按“专用设备全授权、外部全授权、审计/可回滚、技术边界不绕过”；
- M3-2B/双写只隔离验证，不生产部署；
- 不改生产；完成后更新 HANDOFF，DSH 再复验。

### 27.4 本轮副作用
- 只新增候选包、提示词、报告与手写文档；未写生产 DB；未改生产源码/profile/config；未部署/重启；未开启 M3-2B/调度。
- 下一位更新者必须重新读取远程最新 blob SHA。


---

## 28. 提示词修订：合并上一轮审查结果（HANDOFF-0032）

- 91 号提示词只含负责人决策和实施要求，**没有完整合并上一轮六份审查结论**；已作废，不再转发。
- 新提示词：`/sdcard/DSHA/插件优化/92-给GPT的汐综合自主能力实施提示词-结合审查结果.md`
- **负责人只需转发 92 号这一份。**

92 号已包含：
1. persona/memory/autonomy 三份源码审查的关键结论、测试数、生产状态；
2. DSHA 平台事实（非 Termux；内置 Ubuntu/proot；权限/桥）；
3. 三个核心缺口（任务系统、能力/工具编排、成长闭环）；
4. 负责人六项决策（P0/A、任务/B、成长/A、外部全授权、整机全权限、M3-2B/双写仅隔离）；
5. P0 候选包路径/哈希（未部署）；
6. 任务插件、成长 suggest-only、权限、M3-2B 的实施要求与验收；
7. 明确“不要重复上一轮审查”。

- 本轮未部署、未写生产库、未改生产源码/profile/config。
- 下一位更新者必须重新读取远程最新 blob SHA。


---

## 29. HANDOFF-0033：GPT实施阶段首轮核查与外部阻塞

> 2026-11-20。依据 HANDOFF-0032 开始实施；本节记录 GPT 已完成的远程源码核查、当前阻塞和下一步边界。未部署、未修改生产环境。

### 29.1 当前状态与基线

- 本轮实施依据：HANDOFF-0032；不再使用 91 号提示词作为交付依据。
- 远程读取的 HANDOFF 文件 Blob SHA：`142bf41d7d97441b8307e0a975d71ed2c0ecc56b`。
- memory-core 基线：`732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`。
- autonomy 基线：`6c4a4753b4737060211955b1f022cab2f1d39521`。
- persona 基线：`a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`。
- DSHA 基线：`36d89b72294348d0482d509109cf8e76d51fc1cb`。
- 当前未创建任务插件仓库、未修改任何插件源码、未部署、未重启、未写生产库/profile/人格/记忆。

### 29.2 P0 候选包：已完成的源码级核查

已从 memory-core 基线读取并核对：
- `package.json`；
- `package-lock.json`；
- `scripts/export-home-archive.mjs`；
- `lib/permanent/home-archive.js`；
- `lib/roles.js`；
- `lib/adapter/timefmt.js`；
- `cordis.patch.yml`；
- `README.md`。

源码级结论：
1. exporter 的相对导入目标在指定 commit 中均存在：`../lib/roles.js`、`../lib/adapter/timefmt.js`、`../lib/permanent/home-archive.js`。
2. exporter 使用 Node 内置 `node:sqlite`，并使用 Node 内置文件系统、路径、URL、crypto 模块；不依赖额外 npm 包才能解析这些导入。
3. `package.json` 声明 `engines.node >=20`，但 `node:sqlite` 并非整个 Node 20 版本线都具备。部署验收应将实际运行时最低版本明确为支持 `node:sqlite` 的版本；本项目已报告 DSHA Node 24，需在 DSHA 实机复跑确认。
4. lockfile 中 `onnxruntime-node@1.31.1` 带原生安装脚本，声明 Linux 平台并依赖平台原生二进制。完整插件安装/运行必须独立验证其在 DSHA Ubuntu arm64 环境中的安装与加载；不能把 exporter 自身语法/import 检查等同于 ONNX 运行时可用。
5. exporter 脚本本身的直接导入路径没有导入 `onnxruntime-node`；因此应分别验收“exporter 独立执行”和“完整 memory-core 插件安装/加载”，不要把两者混为一个检查。
6. 远程指定路径 `scripts/deploy-home-archive.sh` 在该 commit 返回 404；本轮没有发现可据以确认的同名部署脚本。不得因此推断设备上不存在其他部署脚本，仍需将实际部署入口、脚本和调用参数交由 DSH 从 DSHA 生产只读核实。
7. 远程 GitHub 源码不能证明手机本地候选 tar.gz 的真实内容、文件顺序、权限位、完整性或 SHA-256。负责人提供的路径/大小/哈希目前仍是报告值，GPT尚未直接读取候选包并独立复算哈希。

P0 状态：**源码依赖关系初审完成；候选 tar.gz 实物校验、部署入口审查、隔离 staging 安装/导出/打包验收均未完成；禁止部署。**

### 29.3 P0 继续验收所需材料

需要从 DSHA 候选包实物完成：
- 对候选 tar.gz 复算 SHA-256、大小；
- 列出归档文件清单，确认同一 commit 的完整插件发行目录，而非只含 exporter 单文件；
- 检查相对导入目标、`package.json`、`package-lock.json`、必要配置和资源是否齐全；
- 检查归档是否意外包含生产数据库、个人数据、凭据、缓存或不应发布的文件；
- 在隔离 staging 中执行目标 Node 24 的 exporter `--help`、隔离临时 DB 导出、临时 archiveRoot 校验、备份/重复运行/异常恢复测试；
- 对完整插件单独验证 `npm ci`/原生依赖加载和 DSH 插件加载；
- 对照实际部署脚本逐条确认源目录、目标目录、备份、权限、回滚和失败停止条件。
上述全部标记为 **未运行，待 DSH 复跑/提供证据**。不得连接生产 DB 或真实 archiveRoot 做试验。

### 29.4 独立任务插件 dsh-task-core：设计冻结前提

HANDOFF-0032 要求独立仓库，但当前已连接 GitHub 工具集合没有创建新仓库的操作；检索也未发现可访问的 `dsh-task-core` 仓库。因此 GPT 当前不能在不违反“独立仓库”要求的前提下创建提交。不得把任务插件临时塞入 memory-core 或 autonomy 代替。

仓库创建后，建议首版数据模型按以下职责实现（这是根据 HANDOFF-0032 的验收目标形成的实施草案，不声称来自未提供的 91 号原始字段表）：
- `tasks`：任务 ID、owner ID、session ID、标题/目标、描述、状态、优先级、来源/外部引用、当前步骤、创建/更新时间、截止时间、重试策略、版本号及终态时间；
- `task_steps`：步骤 ID、task ID、稳定序号、名称/目标、状态、依赖步骤 ID、执行器/能力引用、输入引用、输出引用、验证要求/验证结果、尝试次数、超时、错误摘要、开始/结束时间；
- `task_events`：追加式事件 ID、task/step ID、owner/session、事件类型、发生时间、操作者/来源、脱敏 payload、幂等键；不允许通过更新旧事件伪造历史；
- `task_checkpoints`：checkpoint ID、task ID、版本/序号、恢复状态快照、已完成步骤、待执行步骤、外部资源引用、创建时间及校验摘要。
所有读写按 owner 隔离；session 隔离遵循明确授权策略，不允许通过猜测 ID 越权读取。步骤依赖必须形成 DAG，拒绝循环依赖。任务/步骤状态变更与事件记录应在同一事务内完成；checkpoint 应支持原子写入和版本校验。任务结果仅存引用，不复制真实记忆/人格内容。

### 29.5 成长建议模块边界

- 成长系统维持 suggest-only；建议队列与真实 skill/memory/persona 写入分离。
- 建议记录必须包含 source、evidence_ref、suggested_change、target、confidence、status、创建时间、审批人/审批时间、版本/回滚引用。
- 输入适配采用可选服务：memory lesson/skill、autonomy reflect/action、task 完成/失败事件。任一服务缺失时应降级，不阻塞现有插件。
- 单次偶然事件不能直接固化为技能或人格结论；证据不足标记 low confidence。
- 审批前只写建议记录；审批后生成可审查草案，不自动覆盖真实人格、记忆或技能。
- 具体放置仓库与跨插件事件契约需在任务插件仓库可创建后结合现有插件服务模式完成源码审查再定，不能在未确认边界前把成长代码塞入 task-core。

### 29.6 当前明确阻塞与所需负责人动作

1. **任务插件仓库**：需要在 GitHub 账户下创建空仓库 `ba-song/dsh-task-core`（建议默认分支 `main`，公开/私有按负责人既有仓库策略），或为当前 GitHub 连接提供可创建仓库的能力。创建后 GPT 可独立创建开发分支、源码、schema、tests、README 和 CI；不需要 DSH 替 GPT 写代码。
2. **P0 候选包实物**：需要把 `dsh-memory-core-732e3fa-20261120-194319.tar.gz` 上传到当前对话，或提供可读取的 GitHub 候选 release/artifact。仅有 DSHA 本地路径不能让 GPT 读取手机文件。
3. **部署脚本与真实安装入口**：由 DSH 从 DSHA 本地只读提取实际部署脚本路径、内容和调用链，作为后续审查证据；不执行脚本、不部署。

### 29.7 本轮执行声明

- 已完成远程源码级静态核查和实施方案拆分。
- 未创建新仓库（当前 GitHub 工具不支持创建仓库）；未修改 task/autonomy/memory/persona 源码。
- 未下载、解包或复算 DSHA 本地候选 tar.gz；未运行 staging 测试。
- 未写生产数据库、生产配置、真实记忆、人格或技能。
- 未部署、未重启、未启用 M3-2B/永久双写/15 天调度。
- 后续继续前必须重新读取 HANDOFF 全文和最新 Blob SHA；不得覆盖 DSH 或负责人并发更新。


---

## 31. P0 候选包本地证据（HANDOFF-0034）

- 报告：`/sdcard/DSHA/插件优化/P0-CANDIDATE-LOCAL-VERIFY-01.md`
- 候选：`/sdcard/DSHA/备份/候选/dsh-memory-core-732e3fa-20261120-194319.tar.gz`

### 31.1 复核结果
| 项 | 实际 |
|---|---|
| SHA-256 | `6d05b33d17f0bca92a9060c4614541e3b26cb0905dfdf0fb29cf7c7698b1ea21`（与 HANDOFF-0032 一致） |
| 大小 | 423,468 bytes（一致） |
| 归档 | 302 entries / 271 files / 31 dirs |
| 路径安全 | 绝对路径/`..`：0 |
| 污染 | `node_modules`/`.db`/`.env`/凭据模式：0 |
| 关键文件 | package.json、package-lock.json、cordis.patch.yml、scripts/export-home-archive.mjs、lib/permanent/home-archive.js 齐全 |
| 相对导入 | 257 个 JS/MJS，701 个相对 import，**0 unresolved** |
| 隔离测试 | 解包目录 `npm test` → 251/251 pass，exit 0（使用现有 node_modules 软链；非部署） |
| Node/SQLite | Node v24.19.0；npm 11.17.0；node:sqlite SQLite 3.53.3 可用 |

### 31.2 部署入口（只读）
- 生产加载：`/root/.dsh/profiles/web/package.json:17` → `link:/root/.dsh/plugin-src/dsh-memory-core`；
- profile patch：`/root/.dsh/profiles/web/cordis.patch.yml:41`；
- 插件管理：`/root/dsh-bin/dsha-plugin` → `/root/.dsh/plugin-manager.py import <包>`；
- `sync-from-ubuntu.sh` 只同步到 SD 备份，不是部署脚本；
- 未发现 memory-core 专用部署脚本。

### 31.3 未完成/阻塞
- **未部署**、未覆盖生产插件、未重启；
- 未连接生产 DB、未使用真实 archiveRoot、未运行生产导出；
- 候选包不含 `node_modules`（仅 `onnxruntime-node` 等外部依赖）；部署前需在 staging 执行 `npm ci` 并验证依赖完整性；
- 未执行真实部署/启动/回归；生产仍 `bb77de2`/schema 4。

### 31.4 结论
候选包实物、源码完整性、相对导入、隔离测试均 PASS；**仍不可直接部署**，缺 staging 依赖安装与部署授权。报告和 tar 清单证据在 `/sdcard/DSHA/插件优化/P0-CANDIDATE-LOCAL-VERIFY-01.md`、`/tmp/p0-tar-list.txt`（本地临时）。


---

## 32. P0 候选包交 GPT 的提示词（HANDOFF-0035）

**负责人只需转发这一份：**

`/sdcard/DSHA/插件优化/93-给GPT的P0候选包证据与staging部署计划提示词.md`

摘要：
- 候选包证据：sha256/大小一致；302 entries/271 files；701 相对 import 0 unresolved；无 DB/.env/凭据/node_modules；隔离 251/251 pass；Node 24.19.0/SQLite 3.53.3。
- 候选含 schema 5/M3-2B 表，生产仍 schema 4；**未部署**。
- 让 GPT：验收候选包；给出 staging 解包+`npm ci`+schema 4→5 迁移/回滚+exporter 对齐+真实 tar 的步骤；不要部署生产。
- 边界：不改生产/不部署/不重启；部署仍等负责人单独授权。

- 本轮未写生产库、未改生产配置、未部署；候选包与报告均为本地证据。
- 下一位更新者必须重新读取远程最新 blob SHA。


---

## 33. HANDOFF-0036：P0 候选包验收与 staging 方案（GPT）

> 2026-11-20。依据负责人转交的 HANDOFF-0034 / HANDOFF-0035 摘要及候选包本地验证数据；本轮仅做远程源码复核和 staging 方案，不运行 DSHA staging，不部署、不重启、不写生产数据。

### 33.1 本轮证据基线

- memory-core 候选 commit：`732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`。
- 生产基线：`bb77de2`，schema 4。
- 候选包：`/sdcard/DSHA/备份/候选/dsh-memory-core-732e3fa-20261120-194319.tar.gz`。
- DSH 报告的 SHA-256：`6d05b33d17f0bca92a9060c4614541e3b26cb0905dfdf0fb29cf7c7698b1ea21`；大小 423,468 bytes。
- DSH 报告的归档检查：302 entries / 271 files / 31 dirs；无绝对路径/上级路径穿越；无 node_modules、DB、env、凭据；257 JS/MJS、701 个相对 import、0 unresolved。
- DSH 报告的隔离测试：251/251 pass、0 fail、0 skip；但使用现有 node_modules 软链，**不等价于干净安装**。
- DSHA Node v24.19.0 / npm 11.17.0 / node:sqlite SQLite 3.53.3。
- 以上设备端数据来自负责人转述的本地报告摘要；GPT 未直接读取 tar.gz 或本地报告文件，未独立复算哈希。

### 33.2 GPT 已复核的远程源码事实

从候选 commit 读取：
- `package.json`：仅声明 `onnxruntime-node ^1.31.1` 为依赖；`engines.node >=20`；主入口 `lib/index.js`，Cordis patch `cordis.patch.yml`。
- `lib/store/db.js`：`openDb()` 启动时执行 schema DDL、若干 ALTER/UPDATE 迁移，最后写入 `meta.schema_version = SCHEMA_VERSION`。
- `lib/store/schema.js`：`SCHEMA_VERSION = 5`；DDL 含 `episode_rewrite_snapshots` 及索引，及其他既有表结构。
- `scripts/export-home-archive.mjs`：直接依赖 Node 内置 `node:sqlite` 和相对导入；DB 以 readOnly 打开并 query_only；但会创建/修改 `--out` 指定的 archiveRoot，追加 JSONL 事件、生成/替换 Markdown/INDEX/README，并可能创建历史备份。因此不能把 exporter 称为“完全无写入”；它只对 SQLite DB 只读，对档案目录有写入。
- `dsh-autonomy@6c4a475` 的 `lib/config.js`：`homeArchiveMaintenance.enabled` 默认 false；默认 exporter 路径为 `/root/.dsh/plugin-src/dsh-memory-core/scripts/export-home-archive.mjs`；DB、homeCwd、archiveRoot、backupDir 均可配置。生产 profile 当前实际配置仍需 DSH 只读核实，不能假定默认值就是生产值。
- `dsh-autonomy/lib/index.js` 将 `dyPersona` / `dyMemory` 声明为依赖；memory-core 应由宿主按 package main + Cordis patch 加载。实际 staging 应避免同时加载旧版和候选版导致服务/工具重复注册。

### 33.3 P0 候选包验收结论

**结论：候选包可进入 staging；当前不批准生产部署，尚不能签发最终生产候选。**

通过项（依据 DSH 本地报告，尚未由 GPT 独立复算）：
- SHA/大小与 HANDOFF-0032 一致；
- 归档路径安全、无 DB/凭据/node_modules；
- 关键入口/资源齐全；
- 相对导入无缺失；
- 在 DSHA Node 24 下的 exporter 语法/导入和既有依赖环境下 251 tests 通过。

未通过/待验证项：
1. 干净隔离环境的 `npm ci` 尚未执行；现有 node_modules 软链测试不能证明 lockfile 依赖可重建。
2. `onnxruntime-node` 是包外原生依赖；需要在 DSHA Ubuntu 24.04 arm64 下验证 npm 安装脚本、二进制取得、ABI 与实际 import/session 创建。离线缓存是否足够未知。
3. schema 4→5 必须在生产 DB 的独立副本上复现。当前 `openDb()` 迁移不是单个显式事务：DDL/ALTER/UPDATE 分段执行，多个 ALTER/UPDATE 用宽泛 catch 吞错误，随后无条件更新 schema_version。若中间某项失败，可能留下部分迁移却把版本标成 5。该实现是本轮发现的发布阻塞，需隔离复现并审查；不可只因 DDL 大多为 CREATE IF NOT EXISTS / 加列就断言安全。
4. 回滚不能仅靠把插件目录换回旧版：schema 5 DB 不应直接交给旧 schema 4 代码继续写。必须保存迁移前 DB 一致性备份；失败时停止所有写者、保留失败现场、恢复完整迁移前 DB 副本及 WAL/SHM 一致状态，再恢复旧插件目录。
5. exporter 的 autonomy 配置路径要指向候选部署目录内真实存在的脚本；不能假定插件目录软链接/导入器自动复制后路径仍一致。staging 中须以绝对路径验证，生产配置不改。
6. exporter 的临时输出路径必须是隔离目录。虽然 DB 只读，它会写 archiveRoot 并追加/修复事件；绝不可把生产 archiveRoot 传入 staging 命令。

### 33.4 staging 计划（本轮仅计划，未运行）

阶段 0：建立隔离边界
- 使用独立 staging 根目录，例如 `/tmp/dsha-p0-staging-<run-id>/`，仅作为示意；DSH 需先确认该路径所在文件系统有足够空间且不是生产目录。
- 候选包解压到 staging/plugin；所有 DB、profile、homeCwd fixture、archiveRoot、backupDir 均位于 staging。
- 不使用生产 `/root/.dsh/profiles/web`、生产插件目录、生产 memory.db、真实 home cwd、真实 archiveRoot、真实备份目录。
- 禁止调用 `/root/dsh-bin/dsha-plugin` 的生产 import 路径；该入口会改动宿主插件管理状态。若要做 Cordis 加载验证，必须建立隔离 profile/plugin-manager 根和独立端口/数据目录，先由 DSH 证明隔离参数有效。

阶段 1：候选包与 npm 安装
```sh
set -eu
STAGE="/tmp/dsha-p0-staging-<run-id>"
PKG="/sdcard/DSHA/备份/候选/dsh-memory-core-732e3fa-20261120-194319.tar.gz"
mkdir -p "$STAGE"/{plugin,cache,logs,fixture,archive,backup}
sha256sum "$PKG"
stat -c '%s %n' "$PKG"
tar -tzf "$PKG" > "$STAGE/logs/tar-list.txt"
tar -xzf "$PKG" -C "$STAGE/plugin"
cd "$STAGE/plugin"
node --version
npm --version
node --check scripts/export-home-archive.mjs
node -e "import('node:sqlite').then(({DatabaseSync})=>{const d=new DatabaseSync(':memory:'); console.log(d.prepare('select sqlite_version() v').get()); d.close()})"
npm ci --cache "$STAGE/cache" --prefer-offline --no-audit --no-fund
node -e "import('onnxruntime-node').then(m=>console.log('onnxruntime-node import OK',Object.keys(m))).catch(e=>{console.error(e);process.exit(1)})"
```
- 若离线 npm ci 失败，保留日志并停止；不要临时复用生产 node_modules 软链伪装成 clean install。可以在有网环境下载 lockfile 精确依赖缓存后重新做隔离安装；原生模块安装脚本/平台二进制也必须验证。
- 不要使用 `--ignore-scripts` 作为通过标准；这会跳过原生依赖安装步骤。

阶段 2：静态入口与 Cordis 配置检查
```sh
cd "$STAGE/plugin"
node --check lib/index.js
node --check lib/store/db.js
node --check lib/store/schema.js
node --check scripts/export-home-archive.mjs
node -e "const p=require('./package.json'); console.log({main:p.main,patch:p.dsh?.bundle?.patch,engines:p.engines,dependencies:p.dependencies})"
test -f lib/index.js
test -f cordis.patch.yml
test -f scripts/export-home-archive.mjs
test -f lib/permanent/home-archive.js
```
- 完整插件加载测试必须使用隔离 Cordis host/profile，且只加载一个 memory-core 候选实例；检查服务 `dyMemory`、工具注册数量/名称、patch 加载次数、重复注册日志。
- 先只做静态检查和隔离加载；不得把候选与生产旧版同时注册在同一个 host。

阶段 3：schema 4→5 隔离迁移
- 从已脱敏的 schema 4 结构副本构造 staging DB；优先使用无个人正文的 schema fixture。若必须用生产 DB 副本，须先经负责人批准并在 staging 目录脱敏，不得将原库暴露给测试进程。
- 保存迁移前 SQLite 一致性快照及 SHA-256；记录 `PRAGMA integrity_check`、`user_version`、`meta.schema_version`、所有表/索引清单、关键表行数、memory IDs、FTS/vector/entity/revision 计数。
- 运行候选 `openDb()` 只对 staging DB 执行；确认新表、索引、列、schema_version=5；复核既有表行数、ID 集、索引/FTS/vector/entity/revision 不发生意外变化；再执行 `PRAGMA integrity_check`。
- 注入失败点/构造迁移失败 fixture，检查迁移失败后是否存在部分 DDL、部分 ALTER、schema_version 却已标记 5 的状态；若出现，判定迁移流程必须先修复为显式可验证迁移步骤/失败停止机制，不能推进生产部署。
- 迁移前后对照不得包含真实记忆正文；输出结构统计与哈希即可。

阶段 4：exporter staging 运行（DB fixture 只读，输出目录可写）
```sh
mkdir -p "$STAGE/fixture/home" "$STAGE/archive" "$STAGE/backup"
# fixture DB 中 raw_meta.cwd 必须使用 exporter 固定允许的逻辑值：
# /sdcard/DSHA/生活/数据/home；该值仅为 DB 字段，不得访问真实 home 目录。
node scripts/export-home-archive.mjs   --db "$STAGE/fixture/memory.db"   --out "$STAGE/archive"   --home-cwd "/sdcard/DSHA/生活/数据/home"
tar -czf "$STAGE/backup/archive-staging.tar.gz" -C "$STAGE" archive
tar -tzf "$STAGE/backup/archive-staging.tar.gz"
```
- fixture 必须含最小 raw_meta 表结构及代表性 fixture 行（user/self/tool/tombstone/extra/emotion）；DB 连接 readOnly/query_only；archive 输出目录必须为空的 staging 目录。
- 检查生成的 JSONL、每日 Markdown、INDEX、README、历史备份；检查中文路径、重复执行幂等性、tombstone 追加、journal 错误退出码、并发修改时 consistency=false 的行为。
- 不可用真实 archiveRoot；不可把真实 home cwd 当成文件系统输入。Exporter 会写档案目录，需把所有输出归档。

阶段 5：autonomy 路径对齐（只在 staging）
- 读取候选 memory 插件的实际 staging 绝对路径，核对 exporter 文件存在且可执行。
- staging autonomy 配置副本中将 `homeArchiveMaintenance.exportScript` 指向 `$STAGE/plugin/scripts/export-home-archive.mjs`。
- 确认 `memoryDbPath` 指向 staging fixture DB、`archiveRoot` 指向 staging archive、`backupDir` 指向 staging backup、`homeCwd` 仍为 exporter 允许的固定逻辑 cwd。
- `enabled=false`；本轮不得启动 15 天调度，不得修改生产 profile。

阶段 6：回滚演练（仅 staging）
- 保存迁移前 DB 快照、迁移后 DB 快照、插件目录清单/哈希、配置副本。
- 模拟候选加载失败/迁移失败：停止 staging host 与所有 staging DB 写者；隔离失败目录；恢复迁移前 DB 快照（包括一致的 WAL 状态）；恢复旧插件目录/旧配置副本；启动隔离 host 验证旧版可读写 staging fixture。
- 不允许把 schema 5 DB 文件直接交回 schema 4 插件写入；若要回退代码，必须先恢复 schema 4 数据库快照。
- 记录回滚命令、退出码、恢复前后哈希和 integrity_check。

### 33.5 最终门槛

P0 只有全部满足才可称“生产部署候选准备完成”：
- clean `npm ci` 成功，原生依赖可加载；
- 隔离 Cordis 加载无重复注册；
- schema 4→5 迁移在结构副本上完整、幂等、失败安全；
- exporter 在 Node 24 + 临时 DB/archiveRoot 下通过；
- autonomy exporter 绝对路径已在 staging 对齐；
- 失败回滚演练通过；
- DSH 提交完整原始日志、命令、退出码、哈希和结构统计；
- 负责人另行明确授权生产部署。

### 33.6 当前执行声明与待办

- GPT 已完成候选 commit 源码复核和 staging 计划。
- DSH 报告中的候选 tar.gz 哈希/大小/清单/测试结果作为本轮引用证据；GPT 未直接读取 tar.gz，也未独立复算。
- **本轮 staging 未运行；待 DSH 复跑。**
- 未修改生产源码/profile/config/DB；未部署；未重启；未启用 M3-2B/永久双写/15 天调度。
- 下一步 DSH 应先复核本节 staging 隔离边界与迁移风险；经负责人安排后，在隔离环境执行，不得将本方案视为生产部署授权。

### 33.7 DSH 与 GPT 的交接协议提醒

- `coordination/HANDOFF.md` 是 GPT、DSH 和负责人共同使用的唯一长期项目状态入口，不是普通汇报附件，也不是只给 GPT 阅读的历史文档。
- 每次开始工作先读取全文、核对最新 Blob SHA/commit；完成后把新证据、决策、阻塞、未运行项写回同一文件，采用 SHA 乐观锁，避免覆盖并发更新。
- DSH 每轮完成后必须向负责人交付一份**可直接转发给 GPT 的完整反馈**：任务标识、实际执行命令、原始输出、退出码、文件路径/hash、PASS/FAIL/BLOCKED/NOT RUN、生产副作用声明、HANDOFF 新旧 Blob SHA/commit/链接。不要只回复“完成”或只更新文件而不反馈。
- DSH 必须明确提醒负责人把完整反馈转给 GPT；GPT 收到后会独立审查证据、更新计划并生成下一轮任务。
- 不能把 GPT 生成的计划当作已执行结果；不能把未运行写成通过；不能因交接文档存在就省略直接反馈。


---

## 34. P0 staging 方案复核（HANDOFF-0037）

> 复核对象：第 33 节 HANDOFF-0036（文件头此前仍写 0035；本节按实际内容编号 0037）。
> 报告：`/sdcard/DSHA/插件优化/P0-STAGING-PLAN-REVIEW-01.md`
> 反馈提示词：`/sdcard/DSHA/插件优化/94-给GPT的P0-staging方案复核反馈.md`
> 本轮**未执行 staging**、未 `npm ci`、未调用 `dsha-plugin`、未连生产 DB、未部署/重启。

### 34.1 结论
方案的隔离原则基本正确，但**不能按现有命令直接执行**；存在 2 个会直接跑错的路径问题、1 个迁移安全阻塞、3 个待补验证。

### 34.2 逐项状态
| 项 | 状态 |
|---|---|
| staging `/tmp` 与生产隔离 | PASS（设计） |
| 未调用生产插件导入器 | PASS |
| `npm ci` 隔离 | PASS（条件；未执行） |
| 解包后工作目录 | **FAIL**：tar 根是 `dsh-memory-core/`，方案 `cd $STAGE/plugin` 会找不到源码 |
| autonomy exporter 路径 | **FAIL**：应为 `$STAGE/plugin/dsh-memory-core/scripts/...` |
| ONNX 原生模块 | **BLOCKED/不足**：只 import，未建 InferenceSession |
| schema 4→5 迁移 | **FAIL**：`openDb()` 无显式迁移事务、宽泛 catch、无条件写 version=5 |
| schema 4 fixture | **BLOCKED**：未给构造/校验方法 |
| exporter 输出隔离 | PASS（设计，但路径需修正） |
| Cordis 隔离 host | **BLOCKED**：无具体路径/端口/断言 |
| WAL/备份/回滚 | 部分：原则有，缺具体命令/校验 |
| staging 实跑 | **NOT RUN** |

### 34.3 迁移风险（源码确认）
候选 `lib/store/db.js:9-45`：DDL/ALTER/UPDATE 分段执行，多个 `catch {}` 吞错，最后 `INSERT OR REPLACE meta.schema_version=5` 无条件执行；失败后可能“部分迁移 + 版本 5”。必须先修迁移或证明失败安全，再进 staging。

### 34.4 交 GPT 的修订要求
1. 修解包/autonomy 路径；
2. schema 4 fixture 明确构造与验收；
3. `openDb()` 显式事务/失败停止，或证明失败安全；
4. ONNX 增加真实 `InferenceSession.create`;
5. Cordis 隔离 host 具体化；
6. WAL 一致快照/回滚命令；
7. 更新 HANDOFF 后再由 DSH staging；本轮不执行。

### 34.5 副作用
- 只读源码/静态检查；未运行 staging、未 `npm ci`、未调用 `dsha-plugin`、未连生产 DB、未改 profile/config、未部署/重启；无生产副作用。


---

## 35. P0 staging plan v2 与 schema 迁移修复（HANDOFF-0038）

> 依据：负责人转交的 `P0-STAGING-PLAN-REVIEW-01.md`；旧 HANDOFF-0037 §34。
> 复核报告：`/sdcard/DSHA/插件优化/P0-STAGING-PLAN-REVIEW-01.md`
> 本节状态：**只完成 GitHub 开发分支代码修复、CI 和 staging plan v2；DSHA staging 仍 NOT RUN。**

### 35.1 当前结论与边界

- DSH 对 HANDOFF-0036 的复核结论成立：原 staging 命令路径错误，schema 迁移失败安全性不合格，ONNX/fixture/Cordis/WAL 验收细节不足。
- 原 staging plan v1 不得执行；以本节 v2 替代。
- 本轮 GPT 没有运行 DSHA staging、没有在 DSHA 执行 `npm ci`、没有解包候选包、没有调用 `dsha-plugin`、没有连接生产 DB、没有修改生产 profile/config、没有部署或重启。
- GitHub Actions 在 Ubuntu runner 成功不等于 DSHA Ubuntu 24.04 arm64 本地通过。

### 35.2 schema 4→5 迁移：已修代码，待 DSHA 实机复验

#### 已核实的旧 schema 事实

- 生产基线记录为 schema 4；旧代码 `bb77de2` 的 `lib/store/schema.js` 明确声明 `SCHEMA_VERSION=4`。
- 对照旧 schema 4 与候选 schema 5 的 DDL：schema 5 新增 `episode_rewrite_snapshots` 表及 `idx_ers_memory` 索引；memory 表既有列和其他 DDL 与 schema 4 基线对应。
- 候选旧 `lib/store/db.js` 在事务外逐条执行 DDL/ALTER/UPDATE，多个宽泛 catch 吞错，最后无条件写版本 5。风险属实。

#### GPT 已完成的开发分支修复

- 仓库：`ba-song/dsh-memory-core`
- 分支：`feat/m1-preference-memory`
- 新 HEAD：`0af569ac33b006d49c96d896094d77f5c75b6ede`
- 提交链：
  - `b711e66fe000bac64ef443546eecf3b1050d01db`：将 DDL、补列、索引、回填、结构检查和 schema version 更新放入同一个 `BEGIN IMMEDIATE` 事务；失败回滚并关闭 DB；移除迁移路径上的宽泛 catch。
  - `dd939cc74c7d406c7b5fe4dd9f8309e6f7a711b5`：增加 schema 4→5 失败注入测试。
  - `432c7cf7746872fbf575834109314c98d870dc1e`：增加迁移幂等性和索引检查。
  - `46d9dd171f1ff745d1f097930dda8337afdd39f7`：增加 schema version 合法性、snapshot 表列和关键索引列验证；版本标记仅在校验通过后提交。
  - `0af569ac33b006d49c96d896094d77f5c75b6ede`：把 raw_meta/raw_fts/raw_vectors fixture 调整为接近当前 archive.js 的真实结构。
- 新测试：`tests/schema-migration-atomic.test.mjs`。
  - fixture 以旧 schema 4 DDL 为基线，排除 schema 5 新增的 snapshot 表和索引；不包含真实正文。
  - 含合成 memories、bigram/trigram FTS、vectors、entities、memory_entities、relations、memory_revisions。
  - 另含合成 raw_meta user/self/tool/tombstone 行、raw_fts、raw_vectors，检查迁移不改变 raw 侧数据。
  - 成功路径检查 schema_version=5、snapshot 表/关键索引/列存在、计数和 ID 保持、integrity_check=ok；再次 openDb 检查幂等。
  - 失败路径在 schema_version 更新时用 SQLite trigger 注入异常，检查事务回滚后 version 仍为 4、schema 5 表/索引未留下、数据计数与 ID 不变、integrity_check=ok。
- GitHub Actions：
  - #80：`dd939cc...`，success：https://github.com/ba-song/dsh-memory-core/actions/runs/44742342782
  - #81：`432c7cf...`，success：https://github.com/ba-song/dsh-memory-core/actions/runs/44743204757
  - #82：`46d9dd1...`，success：https://github.com/ba-song/dsh-memory-core/actions/runs/44743336615
  - #83：`0af569a...`，success：https://github.com/ba-song/dsh-memory-core/actions/runs/44743493363
- 以上仅是 GitHub CI 证据。DSHA Node 24.19/24.x 与 SQLite 运行时、实际 schema 4 fixture 及失败回滚仍需 DSH 在隔离环境复验。

### 35.3 staging plan v2：候选包解包、依赖与 ONNX

候选包（以负责人转交的本地报告为依据；GPT未直接读取手机 tar 文件）：
- 路径：`/sdcard/DSHA/备份/候选/dsh-memory-core-732e3fa-20261120-194319.tar.gz`
- SHA-256：`6d05b33d17f0bca92a9060c4614541e3b26cb0905dfdf0fb29cf7c7698b1ea21`
- tar 根目录：`dsh-memory-core/`。

隔离目录创建与包校验：

```sh
set -euo pipefail
PKG='/sdcard/DSHA/备份/候选/dsh-memory-core-732e3fa-20261120-194319.tar.gz'
EXPECTED='6d05b33d17f0bca92a9060c4614541e3b26cb0905dfdf0fb29cf7c7698b1ea21'
RUN_ID="$(date +%Y%m%d-%H%M%S)"
STAGE="/tmp/dsha-p0-staging-$RUN_ID"
mkdir -m 700 -p "$STAGE"/{plugin,data,cache,logs,fixture,archive,backup,snapshot,evidence,home}
chmod 700 "$STAGE"
ACTUAL="$(sha256sum "$PKG" | awk '{print $1}')"
test "$ACTUAL" = "$EXPECTED"
tar -tzf "$PKG" | sed -n '1,8p'
```

修正后的解包方式（二选一；推荐 strip-components）：

```sh
mkdir -p "$STAGE/plugin"
tar -xzf "$PKG" --strip-components=1 -C "$STAGE/plugin"
test -f "$STAGE/plugin/package.json"
test -f "$STAGE/plugin/lib/store/db.js"
test -f "$STAGE/plugin/scripts/export-home-archive.mjs"
test -f "$STAGE/plugin/lib/permanent/home-archive.js"
cd "$STAGE/plugin"
```

因此 exporter 的唯一 staging 路径为：
`$STAGE/plugin/scripts/export-home-archive.mjs`。
不得再使用 `$STAGE/plugin/dsh-memory-core/...`（仅当不 strip-components 时才会有该子目录）。

Clean install 与静态检查：

```sh
cd "$STAGE/plugin"
node -v
node -p "process.platform + '/' + process.arch + ' sqlite=' + process.versions.sqlite"
npm ci --cache "$STAGE/cache" --no-audit --no-fund
node --check lib/store/db.js
node --check scripts/export-home-archive.mjs
```

ONNX 必须在 DSHA Ubuntu 24.04 arm64 上执行真实 session 创建，不能只 import：

```sh
MODEL='/opt/qqai/models/bge-small-zh/model_quantized.onnx'
test -s "$MODEL"
node - "$MODEL" <<'NODE'
const ort = require('onnxruntime-node')
const model = process.argv[2]
ort.InferenceSession.create(model, { executionProviders: ['cpu'] })
  .then(async (session) => {
    console.log(JSON.stringify({ ok: true, inputNames: session.inputNames, outputNames: session.outputNames }))
    await session.release()
  })
  .catch((error) => { console.error(error); process.exit(1) })
NODE
```

必须记录 Node/npm/SQLite 版本、arm64、npm ci 退出码、ONNX session 成功与否、模型文件 SHA/大小、session 输入输出名称及日志。模型不存在、原生模块加载失败、ABI 不匹配或 session 创建失败均为 BLOCKED/FAIL，不得跳过后报告 PASS。

### 35.4 schema 4 fixture 与迁移验收

- 先运行候选包自带回归测试：`node --test tests/schema-migration-atomic.test.mjs`；再运行全量 `npm test`。
- fixture 只能由 schema 4 DDL/脱敏结构副本构造；不复制真实 raw_text、memory 正文、embedding 内容或凭据。代表性内容均为合成占位文本。
- fixture 必须包含：raw_meta 的 user/self/tool/tombstone 行；memories；FTS；vectors；entities/memory_entities；relations；memory_revisions。raw 侧结构以当前 `lib/ingest/archive.js` 为参照，迁移不应改动 raw 侧数据。
- 迁移前后记录：`sqlite_master` 表/索引清单、`PRAGMA table_info` 列清单、schema_version、各表行数、主键/ID 集、FTS/vector/entity/relation/revision 计数、tombstone 计数、`PRAGMA integrity_check`。
- 迁移成功后再 openDb 一次，验证幂等；再次打开不得重复新增/丢失数据。
- 失败注入至少覆盖 schema version 写入失败；要求失败后 version 仍 4、迁移新增的表/索引/列均回滚、所有原有 ID/计数不变、integrity_check=ok。不得仅检查 version 而忽略部分 DDL。
- 若本地真实 schema 4 与 fixture DDL 有任何差异，先记录差异并补 fixture，不得直接对生产 DB 做迁移试验。

### 35.5 exporter 与 staging Node+tar

- 创建独立 staging DB；只插入合成 raw_meta 行，cwd 字段使用固定逻辑字符串 `/sdcard/DSHA/生活/数据/home`，不访问该真实目录。
- 输出目录必须是全新的 `$STAGE/archive`；DB 使用 `$STAGE/data/memory.db`；backup 使用 `$STAGE/backup`。
- autonomy staging 配置中的 exporter 路径必须为 `$STAGE/plugin/scripts/export-home-archive.mjs`；memoryDbPath、archiveRoot、backupDir 分别指向 staging DB/archive/backup；homeCwd 只保留逻辑路径；`enabled=false`。
- 实际执行 exporter：
  `node "$STAGE/plugin/scripts/export-home-archive.mjs" --db "$STAGE/data/memory.db" --out "$STAGE/archive" --home-cwd '/sdcard/DSHA/生活/数据/home'`
- 检查 JSONL、每日 Markdown、INDEX、README、tombstone 标记、重复执行幂等性、中文路径、异常退出码与 journalErrors；exporter 对 DB 只读，但会写 archive，因此严禁使用生产 archiveRoot。
- 实际执行 `tar -czf "$STAGE/backup/home-archive.tar.gz" -C "$STAGE/archive" .`，复算 `sha256sum` 并记录 size/hash。不得触碰真实永久档案或生产备份目录。

### 35.6 Cordis 隔离 host：明确路径、端口和拒绝条件

隔离根目录建议：
- `STAGE_HOME="$STAGE/home"`
- `STAGE_DSH_HOME="$STAGE/home/.dsh"`
- profile：`$STAGE_DSH_HOME/profiles/p0-staging/`
- 插件源码：`$STAGE_DSH_HOME/plugin-src/dsh-memory-core/`（从 `$STAGE/plugin` 复制完整候选目录，包含其 staging node_modules；不得混入生产插件目录）
- profile patch：`$STAGE_DSH_HOME/profiles/p0-staging/cordis.patch.yml`，仅包含候选 `memory-core` 插件条目；不复制生产 web profile。
- 插件数据：`DY_MEMORY_DIR="$STAGE/data"`；该目录下 config.json 必须把 archiveDir、permanentArchiveDir、factsPath、chatlogDir 等路径全部改为 staging；`memoryRecordEnabled=false`、`memoryInjectEnabled=false`、`permanentArchiveEnabled=false`、`m3_2b.enabled=false)，ownerQQ/ownerPrivateDir 置空，trustedDirs/archiveDirs/archiveCwdPrefixes 置空，所有维护/调度功能关闭。
- 监听端口：固定选择未占用的 staging 专用端口 `31873`；启动前用 `ss -ltn` 确认空闲，启动后确认只有 staging host 监听。若 DSH 的端口配置键不是该值，必须按实际 schema 设置，不得假设环境变量名。

启动前必须从 DSHA 实际 DSH 启动器源码/CLI 确认其 home/profile 参数与环境变量。不得猜测 `--profile`、`DSH_PROFILE` 或 `DSH_HOME` 一定受支持。启动环境至少隔离 `HOME="$STAGE_HOME"`、`DSH_HOME="$STAGE_DSH_HOME"`、`DY_MEMORY_DIR="$STAGE/data"`；使用 DSH 实际支持的 profile 选择方式加载 `p0-staging`。如果启动器不能将 DSH_HOME/profile 完整重定向到 staging，立即 BLOCKED，不得退回生产 `/root/.dsh/profiles/web`。

若设备具备 strace，必须用它记录文件访问并断言没有访问生产路径：

```sh
strace -f -qq -e trace=openat,openat2,newfstatat -o "$STAGE/logs/host-files.trace" \
  env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" DY_MEMORY_DIR="$STAGE/data" \
  "$DSH_BIN" <经源码/CLI确认的隔离 profile 参数>
! grep -E '/root/\.dsh(/profiles/web|/plugin-src/dsh-memory-core)' "$STAGE/logs/host-files.trace"
```

尖括号内容不是可直接执行的参数；必须先由 DSH 根据实际启动器确认并替换。如果 strace 不可用、文件访问无法审计、host 仍读取生产 profile/plugin/data，均 BLOCKED，不启动或立即停止。验收还需确认 Cordis 日志中 memory-core 只注册一次、没有旧版+候选重复注册、监听端口是 31873、插件数据路径全部位于 staging。不得调用生产 `dsha-plugin import`；候选源码直接放入 staging DSH_HOME 的 plugin-src。

### 35.7 一致性快照与回滚命令

快照只针对 staging fixture DB，不对生产 DB 操作。SQLite `VACUUM INTO` 生成包含当前已提交 WAL 状态的一致独立数据库快照；不要只复制处于 WAL 模式的主 DB 文件：

```sh
DB="$STAGE/data/memory.db"
SNAP="$STAGE/snapshot/memory.pre-migration.sqlite"
node - "$DB" "$SNAP" <<'NODE'
const { DatabaseSync } = require('node:sqlite')
const [dbPath, snapshotPath] = process.argv.slice(2)
const db = new DatabaseSync(dbPath)
const escaped = snapshotPath.replaceAll("'", "''")
db.exec("VACUUM INTO '" + escaped + "'")
db.close()
const snap = new DatabaseSync(snapshotPath, { readOnly: true })
const check = snap.prepare('PRAGMA integrity_check').get().integrity_check
snap.close()
if (check !== 'ok') { console.error(check); process.exit(1) }
NODE
sha256sum "$SNAP"
```

失败回滚（仅 staging）：
1. 用本轮记录的 staging host PID 发 SIGTERM 并等待退出；禁止使用可能匹配生产 DSH 的宽泛 pkill。
2. 确认所有 staging DB 写者已退出/连接已关闭；保留失败现场的 `memory.db`、`memory.db-wal`、`memory.db-shm` 到 `$STAGE/evidence/`，不得在进程仍运行时删除 sidecar。
3. 确认失败迁移事务已回滚后，先把失败 DB 与 sidecar 留证；再删除目标 DB 的旧 `-wal/-shm`，将 `$SNAP` 复制为临时恢复文件并原子 rename 为 `memory.db`。
4. 对恢复 DB 复算 SHA，与快照一致；执行 `PRAGMA integrity_check` 并核对 schema_version=4、原始 ID/计数。
5. 回滚代码时恢复 staging 旧插件目录和旧 profile 副本；不得把 schema 5 DB 交给 schema 4 代码写入。
6. 记录每条命令、退出码、恢复前后 hash、integrity_check 和目录清单。

示例恢复命令（先确认所有 staging 写者已停止，并已复制失败现场）：

```sh
cp -a "$DB" "$STAGE/evidence/memory.db.failed"
for suffix in -wal -shm; do
  [ ! -e "$DB$suffix" ] || cp -a "$DB$suffix" "$STAGE/evidence/"
done
rm -f "$DB-wal" "$DB-shm"
cp "$SNAP" "$DB.restore"
mv "$DB.restore" "$DB"
sha256sum "$DB" "$SNAP"
```

### 35.8 当前状态与下一步门禁

- schema 迁移修复：**GitHub CI 已完成（有证据）**；DSHA 实机仍待复验。
- 解包路径/Exporter 路径：**计划已修正**；尚未在 DSHA 解包。
- clean npm ci / ONNX session：**NOT RUN（DSHA）**。
- schema 4 fixture / 失败注入 / 幂等：**GitHub CI 成功；DSHA 复验 NOT RUN**。
- Cordis 隔离 host：**计划已具体化；启动器环境变量/profile 参数仍需 DSH 源码核对；host NOT RUN**。
- exporter Node+tar：**DSHA staging NOT RUN**。
- WAL 快照/回滚演练：**DSHA staging NOT RUN**。
- 只有 DSH 对本节 plan v2 复核 PASS 后，才进入 staging 实施阶段；实施阶段仍仅限 /tmp 隔离环境。生产部署、生产 DB 迁移、profile/config 修改、重启仍需负责人当前对话另行明确授权。

### 35.9 DSH 下一步任务与反馈协议

DSH 先只读复核本节 v2，不运行 staging、不解包、不 npm ci、不运行 exporter、不启动 Cordis host。重点核对：
1. 解包 strip-components 与 exporter 路径是否完全匹配候选 tar 实际结构；
2. 新迁移事务/fixture/失败注入/幂等测试是否与 schema 4 实际结构吻合；
3. ONNX 命令是否适用于 DSHA Node 24 + Ubuntu 24.04 arm64 及当前模型；
4. DSH 启动器能否真实隔离 HOME/DSH_HOME/profile/端口；若不能，给出证据和 BLOCKED 原因，不得猜测；
5. VACUUM INTO 快照与 WAL sidecar 恢复步骤是否正确；
6. 每条命令是否可能触碰生产目录/数据库/配置。

DSH 必须完整读取 HANDOFF 全文并核对最新 Blob SHA/commit；完成后更新 HANDOFF，采用 SHA 并发保护，并提交完整可直接转发 GPT 的反馈（命令/原始输出/退出码/路径/hash/状态/副作用/HANDOFF 新旧 SHA/commit/link）。**必须提醒负责人把完整反馈转交 GPT**，不能只回复完成或只更新 HANDOFF。HANDOFF 是 GPT、DSH、负责人共同维护的唯一长期项目状态入口，DSH 不得遗忘或绕过该协议。


---

## 36. P0 staging plan v2 复核（HANDOFF-0039）

> 报告：`/sdcard/DSHA/插件优化/P0-STAGING-PLAN-V2-REVIEW-01.md`
> 反馈：`/sdcard/DSHA/插件优化/95-给GPT的P0-staging-plan-v2复核反馈.md`
> 本轮只读；未解包、未 npm ci、未测试、未创建 staging/DB、未启动 host、未连生产 DB、未部署。

### 36.1 版本
- HANDOFF-0038：commit `29517a459b74dae6188c8b8c3b59cffb44315f2c`，blob `a2fcdbb6ba34de2b7c8e465f1244bfc378fd7129`。
- memory-core HEAD：`0af569ac33b006d49c96d896094d77f5c75b6ede`。

### 36.2 结论
- 候选包路径/SHA/顶层/strip-components/exporter 路径：**PASS**。
- 新迁移事务、版本写入、失败回滚、幂等：**PASS（静态/CI）；DSHA 未运行**。
- ONNX session 命令：**PASS（静态）；未运行**。
- **Cordis 隔离 host：BLOCKED**：自定义 profile 未建 `package.json`/`node_modules`，`plugin-src` 不自动被 DSH 加载；需补 profile 初始化/link。
- **端口检查：BLOCKED**：`ss` 不存在，`netstat` 不支持 AF INET；需 Node 探测。
- 生产路径审计：BLOCKED（未启动/未 strace；strace 可用）。
- 快照/WAL 回滚：设计 PASS，未运行；建议快照前停写。
- staging 实跑：NOT RUN。

### 36.3 测试缺口
- 失败注入只覆盖 schema_version 更新；未覆盖 ALTER/索引中途失败、version>code、非法 version、snapshot 缺列。
- fixture 的 raw_meta 缺 file/line_no/speaker/channel/chars 等列，未完全贴近 archive.js。
- FTS5 事务行为需 DSHA 实跑。

### 36.4 交 GPT 的修订
1. 补 staging profile `package.json`/bundles/`node_modules` link（或 staging `dsh plugin add link:`）；
2. 用 Node 端口探测替代 `ss`；
3. 补迁移测试缺口/fixture raw 列；
4. 快照前停写、恢复后核对 ID/行数；
5. 更新 HANDOFF 后再 staging，仍不部署。

### 36.5 副作用
未解包、未 npm ci、未运行测试、未创建 staging/DB、未启动 host、未调用 dsha-plugin、未连生产 DB、未改生产 profile/config、未部署/重启。


---

## 37. P0 staging plan v3 与 schema fixture 加固（HANDOFF-0040）

> 依据：负责人转交的 `P0-STAGING-PLAN-V2-REVIEW-01.md`；旧 HANDOFF-0039 §36。
> 本节性质：GPT 已完成开发分支测试加固与 plan v3；**DSHA staging 仍 NOT RUN，Cordis host 不得启动，生产部署不允许。**

### 37.1 当前结论

DSH 对 plan v2 的复核有效：
- Cordis 自定义 profile 必须有 `package.json`，且插件通过 profile 的 bundles/node_modules 解析；`plugin-src` 不是 loader 自动加载目录。
- DSH 启动器支持 `DSH_HOME`、`--profile <name>`，profile 根为 `$DSH_HOME/profiles/<name>`；web 端口支持 `--port`。精确 host CLI 调用仍需在执行前按设备源码/CLI输出确认，禁止猜参数顺序。
- `ss` 不存在；`netstat` 不支持 AF_INET。改用 Node TCP bind 预检。
- plan v2 快照前未明确停止所有 staging 写者，现已补充。
- v2 的 schema 4 fixture 不是完全独立的冻结旧版 DDL；GPT 已修正为从 `bb77de2` 复制冻结 DDL，避免测试随当前 schema 漂移。

### 37.2 开发分支最新代码与测试

仓库：`ba-song/dsh-memory-core`
分支：`feat/m1-preference-memory`
当前 HEAD：`24bb511bb1e5f8cecda03def82ec76c5e9a6840e`

本轮提交链：
- `f1b0e202efbd34da7988fab57e289383a790d2dc`：扩展 raw_meta 合成行字段并增加迁移失败场景。
- `6d045d50e67bb9ea9dba467fdc4611ddccb4e50b`：修正不完整 snapshot 表失败断言（实际错误先由创建索引时的 SQLite 报错触发）。
- `6956ba86753f93a10f4c7062ee48afbb4736ea03`：新增冻结 schema4 DDL fixture 文件。
- `a31255b77d024f6889a7043a186ddf6a95ccad2b`：迁移测试改用冻结的 schema4 DDL，而不是当前 schema.js。
- `8d8cabe17e943a8294cacab71629bd36ec18c4b1`：增加 ALTER TABLE 实际发生后，再遇到后续迁移错误时的事务回滚测试。
- `24bb511bb1e5f8cecda03def82ec76c5e9a6840e`：增加 FTS5 虚拟表在迁移事务内创建后，后续失败时随事务回滚的测试。

新增/加强测试：
- `tests/fixtures/schema-v4-ddl.mjs`：冻结自 `bb77de2/lib/store/schema.js` 的 schema 4 DDL，与当前 schema 模块解耦。
- `tests/schema-migration-atomic.test.mjs`：
  - 使用真实 schema4 DDL 创建 fixture；
  - raw_meta 具备 file、line_no、speaker、channel、chars、raw_text、extra、cwd、person_id 等 archive 字段，使用合成值；
  - 成功迁移、数据 ID/计数保持、重复打开幂等；
  - schema_version 写入失败回滚；
  - 通过删除 valid_to 强制触发 ALTER，再注入错误索引结构，检查 ALTER 和先前 DDL 一并回滚；
  - version 高于代码时拒绝迁移并回滚；
  - 非法 version marker 拒绝迁移并回滚；
  - 不完整 snapshot 表导致建索引失败，检查其他 DDL 回滚；
  - FTS5 trigram 虚拟表在事务中重建后遇到后续失败，检查虚拟表及 shadow tables 一并回滚。
- GitHub Actions：
  - #87：冻结 schema4 DDL 后测试成功：https://github.com/ba-song/dsh-memory-core/actions/runs/44748886294
  - #88：ALTER 回滚测试成功：https://github.com/ba-song/dsh-memory-core/actions/runs/44748990409
  - #89：FTS5 DDL 回滚测试成功：https://github.com/ba-song/dsh-memory-core/actions/runs/44749261659
- 上述 CI 为 GitHub Ubuntu runner + Node 24 的证据，不是 DSHA Ubuntu 24.04 arm64 运行证据。DSHA 上 FTS5/WAL/SQLite 行为仍需 staging 实跑。

### 37.3 重要：旧候选包不可用于验证新修复

原候选 tar：
- commit：`732e3fa3381ed4b3b4242e0e6fd6e411b35ab972`
- SHA：`6d05b33d17f0bca92a9060c4614541e3b26cb0905dfdf0fb29cf7c7698b1ea21`

该包不包含上述事务迁移修复与新增 fixture 测试，**不得作为 plan v3 staging 的实际运行包**。它只用于确认旧包目录结构/旧路径修正，不得用它验证新代码。

下一阶段 staging 必须从开发分支精确 commit `24bb511bb1e5f8cecda03def82ec76c5e9a6840e` 重新生成候选包：
```sh
REPO="$STAGE/source"
COMMIT='24bb511bb1e5f8cecda03def82ec76c5e9a6840e'
git clone --filter=blob:none --no-checkout https://github.com/ba-song/dsh-memory-core.git "$REPO"
git -C "$REPO" fetch origin "$COMMIT"
git -C "$REPO" archive --format=tar.gz --prefix=dsh-memory-core/ "$COMMIT" > "$STAGE/candidate-v3.tar.gz"
sha256sum "$STAGE/candidate-v3.tar.gz"
tar -tzf "$STAGE/candidate-v3.tar.gz" | sed -n '1,8p'
```
必须确认归档 commit 与目标 commit 完全一致、SHA 记录完整、tar 根目录为 `dsh-memory-core/`。然后再用 `--strip-components=1` 解包到 `$STAGE/plugin`。若设备无法取得该 commit 或 hash/commit 不匹配，BLOCKED，不得退回旧 tar。

### 37.4 Cordis profile v3：必须由 profile loader 正式加载

已知 DSH 本地源码复核事实：
- `DSH_HOME` 被支持；
- `--profile <name>` 被支持；
- profile 目录为 `$DSH_HOME/profiles/<name>`；
- 自定义 profile 缺少 `package.json` 会被拒绝；
- loader 从 profile 的 bundles / `node_modules` 解析插件；
- `$DSH_HOME/plugin-src` 是 DSHA 管理器源码目录，不会自动成为 Cordis 插件加载来源；
- staging profile 只能通过其自身 manifest 与 node_modules link 注册候选插件。

staging 路径：
```text
STAGE_HOME=$STAGE/home
STAGE_DSH_HOME=$STAGE/home/.dsh
PROFILE=$STAGE_DSH_HOME/profiles/p0-staging
PROFILE_NODE_MODULES=$PROFILE/node_modules
PLUGIN=$STAGE/plugin
```

profile 初始化必须在 staging DSH_HOME 下执行。先创建 profile 目录，再用 DSH 实际支持的插件管理 CLI 建立 link（该命令由 DSH v2 复核报告确认；不是生产 `dsha-plugin import`）：

```sh
mkdir -p "$PROFILE"
env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" \
  dsh plugin --profile p0-staging add "link:$PLUGIN"
```

执行后必须逐项断言：
```sh
test -s "$PROFILE/package.json"
node - "$PROFILE/package.json" <<'NODE'
const fs = require('node:fs')
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const bundles = p?.dsh?.profile?.bundles
if (!Array.isArray(bundles)) throw new Error('profile bundles missing')
console.log(JSON.stringify({ name: p.name, bundles }, null, 2))
if (!bundles.some(x => JSON.stringify(x).includes('dsh-memory-core'))) {
  throw new Error('candidate bundle not registered')
}
if (!bundles.some(x => /base/i.test(JSON.stringify(x))) ||
    !bundles.some(x => /web/i.test(JSON.stringify(x)))) {
  throw new Error('base/web bundle missing; inspect actual profile manifest and add exact source-confirmed bundle entries')
}
NODE
test -L "$PROFILE/node_modules/dsh-memory-core"
readlink -f "$PROFILE/node_modules/dsh-memory-core"
test "$(readlink -f "$PROFILE/node_modules/dsh-memory-core")" = "$(readlink -f "$PLUGIN")"
```

注意：
- 上述 `dsh plugin ... add link:` 命令必须在 `HOME` 和 `DSH_HOME` 都指向 staging 的进程环境下运行。
- 若命令无法创建 package.json、bundles 或 symlink，停止并 BLOCKED；不得手工猜 bundle 名称。
- 若 base/web bundle 缺失，先只读查看当前设备的真实 bundle 标识和 profile manifest 结构，再在 staging profile 中写入准确的 base/web 条目；不得复制生产 profile 的全部 package.json、配置或依赖。
- profile 只允许包含必要 base/web bundles 与唯一候选 memory-core；不得同时包含生产旧 memory-core。
- 不能把 `plugin-src` 路径存在当成加载成功；必须检查 profile manifest、symlink 最终路径和 Cordis 实际注册日志。
- 若 DSH CLI 的实际命令与上方不同，先提供源码位置/帮助输出作为证据，再修订命令；不得猜测。

### 37.5 端口预检：Node TCP bind，不依赖 ss/netstat

固定 staging 端口：31873。启动前执行：

```sh
node - 31873 <<'NODE'
const net = require('node:net')
const port = Number(process.argv[2])
const server = net.createServer()
server.once('error', error => {
  console.error(JSON.stringify({ ok: false, port, code: error.code, message: error.message }))
  process.exit(1)
})
server.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
  console.log(JSON.stringify({ ok: true, port, state: 'free' }))
  server.close(error => { if (error) process.exitCode = 1 })
})
NODE
```

- bind 失败（尤其 EADDRINUSE）即 BLOCKED；不得换成未经记录的生产端口。
- bind 成功后立即关闭探测 socket，再启动 staging host；这只是启动前可用性预检，不能单独证明启动后的监听者身份。
- host 启动后用 Node TCP connect 到 `127.0.0.1:31873`，记录连接成功、PID、host 日志；再结合 strace 文件访问审计确认启动的是隔离实例。
- 若 host 的实际 web CLI 参数顺序不确定，DSH 必须先用本地 CLI help/源码确认精确命令。只允许使用已确认的 `--profile p0-staging` 与 web `--port 31873` 语法，不得猜参数位置。

### 37.6 staging 启动和生产路径访问审计

启动前确认：
- `HOME="$STAGE_HOME"`
- `DSH_HOME="$STAGE_DSH_HOME"`
- profile = `p0-staging`
- profile package.json 有必要 base/web + 唯一候选 memory-core
- profile node_modules/dsh-memory-core 是指向 `$STAGE/plugin` 的 symlink
- DY_MEMORY_DIR、DB、archive、backup、cache、logs 全部位于 `$STAGE`
- memoryRecordEnabled、memoryInjectEnabled、permanentArchiveEnabled、m3_2b.enabled 及所有维护/调度关闭
- ownerQQ/ownerPrivateDir 置空；trustedDirs/archiveDirs/archiveCwdPrefixes 置空
- 无生产旧 memory-core bundle

使用 strace（DSH 已确认设备可用）启动，命令的 host CLI 参数必须先经源码/help 确认后填入：
```sh
strace -f -qq -e trace=openat,openat2,newfstatat -o "$STAGE/logs/host-files.trace" \
  env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" DY_MEMORY_DIR="$STAGE/data" \
  "$DSH_BIN" <source-confirmed profile and web-port arguments>
```
尖括号不是字面参数，必须替换为已证实的精确 CLI 参数。启动后：
- grep trace，拒绝任何对 `/root/.dsh/profiles/web`、生产 `/root/.dsh/plugin-src/dsh-memory-core`、生产 DB/archive 的访问；
- 监听端口必须为 31873；
- Cordis 注册日志中 memory-core 只能出现一次；
- profile 解析路径与 node_modules symlink 必须指向 staging；
- 任一条件不满足，立即停止 staging host 并 BLOCKED。

### 37.7 快照前停写、快照与回滚

快照只针对 staging fixture DB。快照前必须：
1. 不启动 Cordis host，或先停止本轮 staging host 并确认进程退出；
2. 停止 exporter、脚本及其他 DB writer；
3. 关闭 fixture 创建/验证脚本持有的所有 SQLite 连接；
4. 确认没有本轮遗留的 DB 连接/写者后，才执行 checkpoint 和 VACUUM INTO。

```sh
DB="$STAGE/data/memory.db"
SNAP="$STAGE/snapshot/memory.pre-migration.sqlite"
mkdir -p "$STAGE/snapshot"
node - "$DB" "$SNAP" <<'NODE'
const { DatabaseSync } = require('node:sqlite')
const [dbPath, snapshotPath] = process.argv.slice(2)
const db = new DatabaseSync(dbPath)
const escaped = snapshotPath.replaceAll("'", "''")
const checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()
if (checkpoint.busy !== 0) throw new Error('WAL checkpoint busy; stop and inspect all writers')
db.exec("VACUUM INTO '" + escaped + "'")
db.close()
const snap = new DatabaseSync(snapshotPath, { readOnly: true })
const check = snap.prepare('PRAGMA integrity_check').get().integrity_check
snap.close()
if (check !== 'ok') throw new Error('snapshot integrity_check failed: ' + check)
console.log(JSON.stringify({ ok: true, checkpoint, integrity: check }))
NODE
sha256sum "$SNAP"
```

- 若 checkpoint busy 非 0，立即停止，不得继续快照。
- 快照后记录 schema_version=4、全部表/索引/列清单、表行数、关键 ID 集、FTS/vector/entity/relation/revision/tombstone 计数、integrity_check 和 SHA。
- 迁移失败时先停 staging host/writer，保存失败 DB/WAL/SHM 现场；再删除目标 DB 旧 sidecar，复制 snapshot 到临时文件并原子 rename。
- 恢复后核对快照 SHA、schema_version=4、ID/行数、integrity_check；旧 schema4 代码绝不能写 schema5 DB。
- 只允许恢复 staging 数据，绝不对生产 DB 执行上述操作。

### 37.8 当前状态与门禁

| 项目 | 状态 |
|---|---|
| schema 4 fixture 改为冻结旧 DDL | GitHub CI #87 PASS |
| ALTER 回滚测试 | GitHub CI #88 PASS |
| FTS5 虚拟表 DDL 回滚测试 | GitHub CI #89 PASS |
| schema version / snapshot / index 错误测试 | GitHub CI #89 PASS（含既有测试） |
| tar 旧包目录结构 | DSH 只读核验 PASS；旧包不含修复 |
| 新候选包 commit 24bb511 | 待 DSH 在 staging 准备阶段生成 |
| profile manifest / link 方案 | 已明确命令与断言；DSH 复核 PASS 待确认 |
| Node 端口预检 | plan v3 已修正，DSH 复核待确认 |
| clean npm ci / ONNX session | DSHA NOT RUN |
| Cordis 隔离 host / strace | NOT RUN |
| exporter / tar / WAL snapshot / rollback | NOT RUN |
| 生产部署 / 生产 DB 迁移 | 未授权、禁止 |

### 37.9 DSH 下一步：只读复核 plan v3

本轮只复核，不执行 staging。请核对：
1. `dsh plugin --profile p0-staging add link:$PLUGIN` 是否会在 staging DSH_HOME 下生成/更新 profile package.json、bundles 和 node_modules symlink；确认失败时的阻塞路径。
2. base/web bundles 的实际 manifest 结构及精确条目如何验证；不得凭名称猜测。
3. 启动器实际 profile/web port CLI 参数顺序，并给出可直接运行的准确命令；如果不确定则 BLOCKED。
4. Node TCP bind 预检是否覆盖当前 web bind host/address。
5. 新 schema4 frozen fixture 是否真实来自 bb77de2；新增 ALTER/FTS5 失败测试是否合理。
6. 快照前停写、checkpoint busy 检查、VACUUM INTO 与恢复校验是否安全。
7. 新候选包必须从精确 commit 24bb511 生成，旧 tar 不得再用于验证修复。
8. 所有命令是否仅操作 /tmp staging 和 GitHub 公开源码，不触碰生产路径。

完成后更新 HANDOFF（预计 HANDOFF-0041），并提供完整原始证据反馈给 GPT。**必须提醒负责人将完整反馈转交 GPT。** 本轮不得解包、npm ci、运行测试、创建 staging DB、启动 host、连接生产 DB、修改生产环境、部署或重启。


---

## 38. P0 staging plan v3 复核（HANDOFF-0041）

> 报告：`/sdcard/DSHA/插件优化/P0-STAGING-PLAN-V3-REVIEW-01.md`
> 反馈：`/sdcard/DSHA/插件优化/96-给GPT的P0-staging-plan-v3复核反馈.md`
> 本轮只读；未解包、未 npm ci、未测试、未创建 staging/DB、未启动 host、未连生产 DB、未部署。

### 38.1 版本与 CI
- HANDOFF-0040：commit `354bac543d64fe194c7a9ec1ac37cecf59a35260`，blob `80ec6308c06de3ce4ed57fbc6aa47cbd369c2c0d`。
- memory HEAD：`24bb511bb1e5f8cecda03def82ec76c5e9a6840e`。
- CI #87/#88/#89 均 success；#89 head=`24bb511`，链接见 §37.2。CI 不代表 DSHA 实机。

### 38.2 结论
- 迁移事务/失败回滚/幂等/冻结 fixture/FTS5 回滚：**PASS（静态/CI）**。
- 新候选包精确 commit 归档/`tar`/strip：**PASS（静态）**；未生成新包。
- **Cordis profile：BLOCKED**。`dsh plugin --profile p0-staging add link:$PLUGIN` 会用 `DEFAULT_PROFILE_BUNDLES` 初始化，只有 base，没有 web；必须先在 staging 加 `@deepseek-ai/dsh-web-app` 再 link 候选，否则 profile 断言失败、host 无 web。
- 精确启动命令语法：`env HOME=... DSH_HOME=... /root/dsh-bin/dsh --profile p0-staging --port 31873 --no-open`；语法 PASS，但 profile 未补前 BLOCKED。
- Node 端口预检：PASS（IPv4 限定，需与实际 web host 对齐）；`ss` 不存在的问题已绕开。
- 快照前停写/checkpoint/VACUUM/WAL 回滚：设计 PASS，NOT RUN。
- 测试缺口：snapshot 列校验分支未被现有失败测试真正覆盖；失败注入变体不全；DSHA 未实跑。

### 38.3 逐项状态
| 项 | 状态 |
|---|---|
| schema4 冻结 DDL | PASS |
| fixture raw_meta | PASS（主要列） |
| ALTER 回滚 | PASS（CI） |
| FTS5 回滚 | PASS（CI；DSHA NOT RUN） |
| version>code/非法 version | PASS（CI） |
| snapshot 结构检查 | PASS（代码）/测试缺口 |
| CI #89 | PASS（success） |
| 新候选包归档 | PASS（静态）/NOT RUN |
| `dsh plugin add link` | 命令存在，流程缺 web |
| staging profile/package.json | **BLOCKED** |
| base/web bundles | **BLOCKED**（web 未加） |
| node_modules symlink | 预期 PASS，未运行 |
| Cordis 隔离 | **BLOCKED** |
| 精确 host 命令 | 语法 PASS；profile 未补前 BLOCKED |
| Node 端口预检 | PASS（IPv4） |
| strace 审计 | 能力 PASS/NOT RUN |
| 快照/回滚 | PASS（设计）/NOT RUN |
| DSHA staging | **NOT RUN** |

### 38.4 交 GPT
1. staging profile 先加 `@deepseek-ai/dsh-web-app`，再 link 候选；补精确 bundles/symlink 断言；
2. 补 snapshot 列校验测试缺口；
3. 更新 HANDOFF 后再 staging；仍不部署。

### 38.5 副作用
未解包、未 npm ci、未运行测试、未创建 staging/DB、未启动 host、未调用 dsha-plugin、未连生产 DB、未改生产 profile/config、未部署/重启。

---

## 39. P0 staging plan v4 修订（基于 HANDOFF-0041 复核）

> 依据：负责人转交的 `P0-STAGING-PLAN-V3-REVIEW-01.md` 与 HANDOFF-0041 §38。
> 本节由 GPT 更新。性质：**开发分支测试修正 + staging 计划修订；DSHA staging NOT RUN，生产环境只读，禁止部署。**

### 39.1 HANDOFF-0041 复核结论

DSH 对 plan v3 的 BLOCKED 判断成立：
- schema4 冻结 DDL、raw_meta 合成 fixture、迁移事务、ALTER/FTS5 回滚、version 校验、CI #87/#88/#89：PASS（GitHub CI/静态证据）。
- 候选包精确归档方法与 tar strip 方案：静态 PASS；新包尚未生成。
- profile 阻塞是实际流程缺陷：`dsh plugin --profile p0-staging add link:$PLUGIN` 初始化时只写入 `DEFAULT_PROFILE_BUNDLES` 中的 base bundle，不含 web app。不能只 link memory-core 后再期待 web host 可启动。
- 正确的 staging 顺序必须先在 staging DSH_HOME 中添加设备 manifest 证实的 web bundle，再 link 候选 memory-core。
- host CLI 语法已由 DSH 源码/CLI 核实为：
  `env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" "$DSH_BIN" --profile p0-staging --port 31873 --no-open`
  仅在 staging profile 完整且隔离审计通过后才可运行；本轮不得运行。
- 端口预检 Node TCP bind 可用，但必须与实际 web bind host/address 一致；IPv4 限定的预检不能证明 IPv6 端口可用。
- 旧的不完整 snapshot 测试确实未覆盖 `snapshotColumns` 的显式缺列校验分支：其 fixture 只有 `id`，在创建 `idx_ers_memory(memory_id,id)` 时就先失败。

### 39.2 GPT 已完成的开发分支测试修正

仓库：`ba-song/dsh-memory-core`
分支：`feat/m1-preference-memory`
修复提交：`7548e49ed0b8d8673818464325d8e72ec7704b27`
修改文件：`tests/schema-migration-atomic.test.mjs`

新测试把不完整 snapshot fixture 改为：
- 先从 memories 删除 `valid_to`，确保迁移开始后确实执行 ALTER；
- 创建只有 `id` 与 `memory_id` 两列的 `episode_rewrite_snapshots`；
- 这两列足以让迁移创建 `idx_ers_memory(memory_id,id)` 成功，随后进入 `snapshotColumns` 显式列集合校验；
- 精确断言错误为 `E_SCHEMA_MIGRATION_INCOMPLETE: episode_rewrite_snapshots missing revision...`，而不是此前的 SQLite `no such column: memory_id`；
- 失败后断言 schema_version 仍为4、snapshot 表仍只有2列、ALTER 新增的 `valid_to` 已回滚、`idx_ers_memory` / `idx_mem_scope_key` / `idx_mem_valid` 均未残留、integrity_check=ok。

该提交已推送开发分支；GitHub Actions #90 已核实 success，run ID `44751203163`，head SHA=`7548e49ed0b8d8673818464325d8e72ec7704b27`，链接：https://github.com/ba-song/dsh-memory-core/actions/runs/44751203163。该 CI 只证明 GitHub runner 测试通过，不代表 DSHA SQLite 3.53.3 实机通过。此修正不改变生产 schema 或生产 DB。

### 39.3 Cordis profile v4：先 web，再候选 link

隔离路径仍固定为：
```text
STAGE_HOME=$STAGE/home
STAGE_DSH_HOME=$STAGE/home/.dsh
PROFILE=$STAGE_DSH_HOME/profiles/p0-staging
PROFILE_NODE_MODULES=$PROFILE/node_modules
PLUGIN=$STAGE/plugin
```

在候选包解包到 `$STAGE/plugin` 后，profile 初始化必须按以下顺序执行，所有命令进程均设置 staging 的 HOME 和 DSH_HOME：

```sh
mkdir -p "$PROFILE"
env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" \
  "$DSH_BIN" plugin --profile p0-staging add @deepseek-ai/dsh-web-app
env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" \
  "$DSH_BIN" plugin --profile p0-staging add "link:$PLUGIN"
```

约束：
- `@deepseek-ai/dsh-web-app` 是 DSH 复核反馈给出的设备 manifest 名称；执行前仍须只读读取当前设备已安装 package manifest，核实该包存在，且其 `dsh.profile.bundles` 声明与 base bundle 声明。
- 不要把包名字符串直接假定为最终 profile bundle descriptor；profile 中写入的精确对象/字符串结构，以当前设备安装 manifest 的 `dsh.profile.bundles` 为准。
- 先添加 web，再添加候选 link。若任一步失败，停止并记录 staging profile 原状，不手工伪造 manifest，不回退到生产 profile。
- profile 只允许 base、web app、候选 memory-core 三类必要 bundle；不得加载生产旧 memory-core 或额外业务插件。

### 39.4 profile 初始化后的精确断言（全部通过才可启动）

先读取并记录：
1. 当前设备安装的 base、web app、候选插件三个 package.json 的 `name`、`version`、`dsh.profile.bundles` 原始值；
2. profile 的完整 `package.json`；
3. `dsh.profile.bundles` 数组中每个条目的实际 JSON 类型和值；
4. `profile/node_modules` 下实际生成的目录、符号链接及其最终 realpath。

必须使用 manifest 中的精确包名和 descriptor 做结构比较，不允许正则、模糊子串、仅凭目录存在或名称大小写推断成功。验收断言：
- profile package.json 存在且为有效 JSON；
- `dsh.profile.bundles` 存在且为数组；
- bundle 集合精确等于：设备当前 manifest 声明的 base bundle descriptor + web app bundle descriptor + 候选 memory-core bundle descriptor；无缺失、无重复、无生产旧版、无额外 bundle；
- 对每个 bundle descriptor，按 DSH loader 的实际解析规则从 profile 根解析到对应 package；记录解析到的 package.json 路径、package name/version 和 realpath；
- 候选 memory-core 的 `profile/node_modules/dsh-memory-core` 必须是符号链接；`test -L` 成功，`readlink` 原始目标和 `readlink -f` 最终路径均记录，最终 realpath 必须等于 `readlink -f "$PLUGIN"`；
- web app 必须从 profile 的 node_modules/loader 解析路径解析成功，不能只证明全局安装位置存在；
- base、web、memory-core 各只解析/注册一次；
- profile 中不得存在指向 `/root/.dsh`、生产 plugin-src、生产 node_modules 或生产 DB/archive 的链接/路径。

如果 CLI add web 后产生的 node_modules 形态与预期不同，先依据实际 loader 源码确认解析规则，再对真实解析结果做断言；不要擅自把 base/web 也强制要求为 symlink。候选 `link:$PLUGIN` 则必须验证其 symlink 最终路径。

### 39.5 host / 网络 / 隔离启动门禁

只有 §39.3、§39.4 全部 PASS，才可在后续 staging 实施轮次运行 host。精确命令为：

```sh
env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" \
  "$DSH_BIN" --profile p0-staging --port 31873 --no-open
```

- 不加 `web` 子命令；`--profile` 是顶层参数，`--port` 和 `--no-open` 由 web app 处理。
- 端口预检必须与 manifest/config 中 web 实际 bind host 对齐。若 bind host 为 IPv4 `0.0.0.0`，用 Node `net.createServer().listen({host:'0.0.0.0',port:31873,exclusive:true})`；若为 IPv6/双栈，必须分别按真实 host 做预检并记录，不能用 IPv4 PASS 代替。
- host 启动后必须验证 PID、日志、Node TCP connect、监听地址、Cordis 注册次数和 strace 文件访问审计；单纯 HTTP 200 或端口可连接不等于隔离通过。
- strace 拒绝访问生产 `/root/.dsh/profiles/web`、生产插件、生产 DB/archive、生产缓存与日志路径。
- 任一证据不符，停止 staging host，保留日志与现场，标 BLOCKED。

### 39.6 测试与候选包门禁

- 修复提交 `7548e49ed0b8d8673818464325d8e72ec7704b27` 必须先取得 GitHub Actions 对应 run 的明确 success，记录 workflow run ID、head SHA、测试统计。
- CI 只代表 GitHub runner；DSHA SQLite 3.53.3/Node 24 arm64 的 FTS5、WAL、VACUUM INTO 仍需 staging 实跑。
- 新候选包必须从修复后开发分支精确 HEAD 重新 `git archive`，记录 commit、tar SHA256、根目录、成员清单；旧 tar 不得使用。
- staging host、SQLite migration、ONNX、exporter、WAL snapshot/rollback 全部仍需独立验收，不可由 CI 替代。

### 39.7 当前状态与下一步

| 项目 | 状态 |
|---|---|
| HANDOFF-0041 plan v3 复核 | BLOCKED（结论有效） |
| snapshotColumns 显式缺列测试 | 已提交修正；GitHub Actions #90 PASS（head=7548e49） |
| schema4 fixture / 事务 / FTS5 测试 | 既有 CI #87/#88/#89 PASS |
| Cordis web bundle 初始化顺序 | plan v4 已修订；DSH 只读复核待进行 |
| profile 精确 manifest/bundle/link/realpath 断言 | plan v4 已修订；DSH 只读复核待进行 |
| host 精确启动命令 | DSH 静态核实 PASS；staging NOT RUN |
| Node TCP 端口预检 | 需与真实 bind host 对齐 |
| 候选包生成 / npm ci / ONNX | NOT RUN |
| staging profile / Cordis host / strace | NOT RUN |
| SQLite 3.53.3 / exporter / WAL 回滚 | NOT RUN |
| 生产 DB / 生产 profile / 部署 / 重启 | 未授权、禁止 |

### 39.8 DSH 下一步：只读复核 plan v4

DSH 仅做只读源码/manifest/CLI/计划复核，不执行 staging。重点：
1. 重新核对开发分支 HEAD 与修复提交 `7548e49...`，检查新增测试是否确实触发 `snapshotColumns` 的显式缺列分支；确认 CI 对应 run 的 head SHA 和 success。
2. 从当前 DSHA 安装目录读取 base、web app 的真实 package.json，核对 `dsh.profile.bundles` 精确值、类型和 loader 解析方式；确认 `dsh plugin --profile p0-staging add @deepseek-ai/dsh-web-app` 与后续候选 link 顺序能在隔离 HOME/DSH_HOME 中完成预期 profile 初始化。
3. 核对 profile bundle 集合精确断言和 `node_modules` symlink/readlink/realpath 验收是否适配真实 CLI 行为；若有差异提供源码/manifest 原始证据并修订，不猜测。
4. 重新确认 host 命令参数语法、web bind host、Node 端口预检地址与 host bind 一致。
5. 检查 plan v4 所有命令是否仅触及未来 /tmp staging；本轮禁止执行命令中任何写入、解包、npm ci、测试、profile add、host 启动或 DB 操作。
6. 继续核对候选包精确归档、strace 路径审计、快照前停写、WAL checkpoint、VACUUM INTO 与恢复步骤。

本轮仍不得解包、npm ci、运行测试、创建 staging DB/profile、执行任何 `dsh plugin add`、启动 host、连接生产 DB、修改生产环境、部署或重启。只有 plan v4 复核通过后，才能由负责人安排下一轮 staging；**plan review PASS 不等于 staging PASS，更不等于生产部署授权。**

DSH 完成后必须更新 HANDOFF（预计 HANDOFF-0042），使用最新 Blob SHA 做并发保护，并向负责人提供完整可直接转交 GPT 的反馈（命令/原始输出/退出码/路径/hash/代码 HEAD/CI run/HANDOFF 新旧 Blob SHA/commit/link/副作用/NOT RUN 清单）。必须提醒负责人将完整反馈转交 GPT。HANDOFF 是 GPT、DSH、负责人共同维护的唯一长期项目状态入口；开始前完整读取全文，结束后更新全文，不能只发“完成”。


---

## 40. P0 staging plan v4 复核（HANDOFF-0042）

> 报告：`/sdcard/DSHA/插件优化/P0-STAGING-PLAN-V4-REVIEW-01.md`
> 反馈：`/sdcard/DSHA/插件优化/97-给GPT的P0-staging-plan-v4复核反馈.md`
> 本轮只读；未解包、未 npm ci、未测试、未创建 staging/profile、未执行 dsh plugin add、未启动 host、未连生产 DB、未部署。

### 40.1 版本
- HANDOFF-0041：commit `b85e98124ab574c88ba13d86098fe6ab1af20379`，blob `f87273be869f94bf0c224f910b274b9217065840`。
- memory HEAD：`7548e49ed0b8d8673818464325d8e72ec7704b27`。
- CI #90：run `44751203163`，head=`7548e49`，success（GitHub API 核实）。

### 40.2 结论
- 核心“先加 web 再 link 候选”流程：**PASS（源码静态）**。
- 新 snapshotColumns 测试：**PASS**，确实先 DROP valid_to/建 2 列 snapshot，让索引成功后进入显式缺列分支。
- **仍需修正 3 处文档/命令**：
  1. `dsh.profile.bundles` 是字符串数组，不是 descriptor；plan 的“descriptor”断言需改为精确名称集合；
  2. web 实际默认 bind host 是 `127.0.0.1`，plan 的 `0.0.0.0` 预检不一致；
  3. 候选包命令需写死 commit `7548e49`，不能只说“修复后 HEAD”。

### 40.3 逐项状态
| 项 | 状态 |
|---|---|
| base/web manifest | PASS |
| bundle 类型/loader | PASS（字符串数组；plan 措辞需改） |
| web add 保留 | PASS（静态） |
| link 候选 | PASS（静态） |
| profile 精确断言 | **BLOCKED** |
| node_modules symlink | 预期 PASS/未运行 |
| host CLI | PASS |
| bind host/预检一致 | **BLOCKED**（127.0.0.1 vs 0.0.0.0） |
| CI #90 | PASS |
| snapshotColumns 测试 | PASS |
| 候选包 commit | **BLOCKED**（未写死 7548e49） |
| 快照/WAL | PASS（设计）/NOT RUN |
| strace | PASS（能力）/NOT RUN |
| DSHA staging | **NOT RUN** |

### 40.4 交 GPT
1. bundle 断言改为字符串数组+精确名称；
2. 端口预检改为 127.0.0.1（或实际 --host）；
3. 候选包命令写死 `7548e49`；
4. 更新 HANDOFF 后再 staging；仍不部署。

### 40.5 副作用
未解包、未 npm ci、未运行测试、未创建 staging/profile、未执行 dsh plugin add、未启动 host、未连生产 DB、未改生产环境、未部署/重启。

---

## 41. P0 staging plan v5 修订（基于 HANDOFF-0042 复核）

> 依据：负责人转交的 `P0-STAGING-PLAN-V4-REVIEW-01.md`。
> 本节由 GPT 根据 HANDOFF-0042 复核反馈修订。性质：**仅修订 staging 计划与验收文档；不执行 staging，不修改生产环境，不部署。**

### 41.1 复核结论

DSH 对 plan v4 的 BLOCKED 结论成立，且反馈给出的三项修正均已纳入本版：
1. profile 的 `dsh.profile.bundles` 是 **字符串数组**，不是 descriptor 对象数组；
2. web app 默认 bind host 是 **`127.0.0.1`**，端口预检必须对齐；
3. 候选包源 commit 必须固定为 **`7548e49ed0b8d8673818464325d8e72ec7704b27`**，禁止使用浮动 HEAD 或旧 tar。

已经核实的环境事实（来源：DSH HANDOFF-0042 只读检查）：
- base package：`/usr/local/lib/node_modules/@deepseek-ai/dsh-base/package.json`，version `0.2.1-rc.2`，声明 `dsh.bundle.patch: ./cordis.patch.yml`；
- web package：`/usr/local/lib/node_modules/@deepseek-ai/dsh-web-app/package.json`，version `0.2.1-rc.2`，声明 `dsh.bundle.patch` 为数组；
- 生产旧 memory package：`/root/.dsh/plugin-src/dsh-memory-core/package.json`，version `0.1.0`，声明 `dsh.bundle.patch: ./cordis.patch.yml`；
- 上述插件 package manifest 均不含 `dsh.profile.bundles`；
- `dsh.profile.bundles` 位于 profile 的 package.json，类型为字符串数组；loader 按 bundle 名称解析 package，再读取包自身的 `dsh.bundle.patch`；
- web 默认 bind host：`127.0.0.1`（DSH 报告定位 `dsh-web-app/cordis.patch.yml:183`）；
- host CLI 语法：`dsh --profile p0-staging --port 31873 --no-open`，无需 `web` 子命令。

以上是 DSH 只读报告中的设备证据；本轮 GPT 未直接访问 DSHA 文件系统，也未执行任何本地命令。

### 41.2 profile bundles 的正确精确断言

profile package.json 的预期字段结构：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-memory-core"
      ]
    }
  }
}
```

上面是期望结构示意；实际验收必须读取 staging profile 生成的 package.json，不得直接写入或伪造该文件。

验收规则：
- `dsh.profile.bundles` 必须是 JSON array；
- 数组每个元素必须是字符串；
- 规范化后精确集合必须等于：
  - `@deepseek-ai/dsh-base`
  - `@deepseek-ai/dsh-web-app`
  - `dsh-memory-core`
- 必须同时检查数组长度为3、去重后长度为3、三个名称各出现一次；不得只用集合比较而忽略重复；
- 不得存在生产旧 memory-core、其他业务插件或额外 bundle；
- 不要从插件 package.json 读取 `dsh.profile.bundles`；该字段属于 profile manifest；
- 对上述每个字符串 bundle name，按 DSH loader 的真实解析规则解析 package，记录解析到的 package.json 绝对路径、package name、version 和 realpath；
- base/web 包的实际加载来源必须是当前安装的受信任 DSH bundle；候选 memory-core 必须解析到本轮 staging 候选目录；
- 候选插件的 `profile/node_modules/dsh-memory-core` 必须是 symlink，`test -L` 成功；记录 `readlink` 原始目标和 `readlink -f` 最终路径，最终 realpath 必须等于 `readlink -f "$PLUGIN"`；
- 不能因为生产旧插件也叫 `dsh-memory-core` 就允许 loader 解析到生产目录；
- profile 及其所有解析路径不得引用生产 profile、生产 plugin-src、生产 node_modules、生产 DB/archive/cache/log。

若 CLI 的 reconcile 最终排序不同，可以不要求数组顺序固定，但必须要求精确名称多重集相同（长度3且各出现一次）；同时记录原始数组顺序。不得以“排序差异”为由容忍额外或缺失项。

### 41.3 Cordis profile 初始化顺序（保持不变）

在未来 staging 实施阶段，候选包解包到 `$STAGE/plugin` 后，依次执行：

```sh
mkdir -p "$PROFILE"

env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" \
  "$DSH_BIN" plugin --profile p0-staging add @deepseek-ai/dsh-web-app

env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" \
  "$DSH_BIN" plugin --profile p0-staging add "link:$PLUGIN"
```

- 先加 web，再 link 候选；
- 每条命令均显式隔离 HOME 和 DSH_HOME；
- 两条命令的静态源码行为已由 DSH 复核：profile 缺失时初始化 base；添加 web 后 reconcile 写入 web bundle；再 link 候选时保留 web 并加入候选 bundle；
- 此行为仅为源码静态核实，**未实际执行**；
- 任一命令失败，立即停止，保留 staging profile 现场，不手工改写 package.json，不回退到生产 profile。

### 41.4 端口预检与 host 命令

web 默认 bind host 经 DSH 只读核实为 `127.0.0.1`。因此 Node TCP 端口预检必须使用同一 host：

```sh
node - <<'NODE'
const net = require('node:net')
const server = net.createServer()
server.once('error', error => {
  console.error(error)
  process.exitCode = 1
})
server.listen({ host: '127.0.0.1', port: 31873, exclusive: true }, () => {
  console.log(JSON.stringify(server.address()))
  server.close()
})
NODE
```

注意：
- 该预检只证明检查瞬间 `127.0.0.1:31873` 可 bind；不证明 host 已启动或后续仍可用。
- 如果未来 staging 明确通过 CLI/config 改为其他 bind host，必须先核实最终生效配置，再同步修改预检地址；不能保留 host/预检不一致。
- 由于默认 bind 是 loopback，本阶段只验证本机访问，不得把 LAN 可访问性列为验收要求。
- 只有 profile bundles、包解析、symlink/realpath、隔离路径审计全部 PASS 后，才允许在后续 staging 实施轮次运行 host。
- 精确启动命令：

```sh
env HOME="$STAGE_HOME" DSH_HOME="$STAGE_DSH_HOME" \
  /root/dsh-bin/dsh --profile p0-staging --port 31873 --no-open
```

`--profile` 是顶层参数，`--port` / `--no-open` 传递给 web app；不需要 `web` 子命令。启动后还必须验证 PID、日志、监听地址、Node TCP connect、Cordis 注册次数及 strace 文件访问审计。

### 41.5 候选包源 commit 固定

本轮可用于 staging 的候选源码 commit 固定为：

```sh
COMMIT='7548e49ed0b8d8673818464325d8e72ec7704b27'
```

未来生成候选包时必须使用该精确 commit，不允许使用 `HEAD`、分支当前最新值或之前的 `24bb511` 代替：

```sh
REPO="$STAGE/source"
COMMIT='7548e49ed0b8d8673818464325d8e72ec7704b27'

git clone --filter=blob:none --no-checkout \
  https://github.com/ba-song/dsh-memory-core.git "$REPO"
git -C "$REPO" fetch origin "$COMMIT"
test "$(git -C "$REPO" rev-parse FETCH_HEAD)" = "$COMMIT"
git -C "$REPO" archive --format=tar.gz --prefix=dsh-memory-core/ "$COMMIT" \
  > "$STAGE/candidate-v4.tar.gz"

sha256sum "$STAGE/candidate-v4.tar.gz"
tar -tzf "$STAGE/candidate-v4.tar.gz" | sed -n '1,12p'
```

解包时目标必须是全新的 `$STAGE/plugin`，使用：

```sh
mkdir -p "$STAGE/plugin"
tar -xzf "$STAGE/candidate-v4.tar.gz" \
  --strip-components=1 -C "$STAGE/plugin"
```

生成后必须记录 commit、tar SHA256、归档根目录、完整成员清单、解包后 package.json version/name 和源码 commit 对应关系。旧候选 tar 不得用于本轮代码验证。

### 41.6 当前门禁状态

| 项目 | 状态 |
|---|---|
| plan v4 核心初始化顺序 | PASS（DSH 源码静态核实） |
| profile bundles 类型 | PASS（字符串数组，DSH 设备证据） |
| profile 精确 bundle 断言 | 已修订为三个精确名称；待下一轮复核 |
| 候选 memory-core symlink/realpath 断言 | 计划明确；未执行 |
| web 默认 bind host | PASS（127.0.0.1，DSH 设备证据） |
| Node TCP 预检 host | 已修订为 127.0.0.1；未运行 |
| host CLI | PASS（静态语法核实） |
| 候选源码 commit | 固定为 7548e49；候选包未生成 |
| snapshotColumns 测试 | PASS（GitHub CI #90） |
| GitHub Actions #90 | PASS，run 44751203163，head 7548e49 |
| DSHA SQLite 3.53.3 实跑 | NOT RUN |
| 候选包生成 / 解包 / npm ci | NOT RUN |
| staging profile / plugin add / symlink | NOT RUN |
| Cordis host / strace | NOT RUN |
| ONNX / exporter / WAL snapshot / rollback | NOT RUN |
| 生产 DB / 生产 profile / 部署 / 重启 | 未授权、禁止 |

### 41.7 下一步

本次反馈只要求 GPT 修正文档和计划。上述修正已完成，**不代表 plan v5 已由 DSH 复核通过**。下一步应由 DSH 对 plan v5 做只读复核，重点确认：
1. 三个 bundle 精确名称与 profile 实际 reconcile 行为一致；
2. 候选 symlink 的路径检查与 loader 解析行为一致；
3. 127.0.0.1 Node bind 预检与实际默认 web bind 一致；
4. 固定 commit 7548e49 的 archive/fetch/strip 命令无误；
5. staging 计划仍保持完全隔离，所有写操作仅作用于未来 staging 路径。

本轮以及 plan v5 只读复核阶段，均不得解包、npm ci、运行测试、创建 staging profile/DB、执行 `dsh plugin add`、创建 symlink、启动 host、连接生产 DB、修改生产 profile/config、部署或重启。

只有 plan v5 review PASS 后，才可以讨论下一轮 staging。即使 plan review PASS，也只代表允许进入 staging 验证，不代表 staging PASS，更不代表生产部署授权。


---

## 42. 协作协议变更：单一 REPORT.md（HANDOFF-0043）

> 负责人 2026-11-20 决定：从下一轮开始，项目状态仍用单一 `coordination/HANDOFF.md`；每轮完整报告写入同一分支的单一 `coordination/REPORT.md`，整文件覆盖式迭代（版本号递增，Git 历史保留旧版）。本地只生成一份可直接转发 GPT 的提示词文件，不再生成本地报告 md。

### 42.1 约束
- `REPORT.md` 只保留“当前这一轮”完整报告；不按轮追加；
- `HANDOFF.md` 只保留决策、摘要和 `REPORT` 版本/路径，不重复整篇报告；
- 每次更新 HANDOFF + REPORT 使用同一 commit；
- 本地提示词引用 HANDOFF 版本/章节/Blob SHA，以及 REPORT 版本/路径；
- 超长原始日志/清单只摘关键片段，避免无限膨胀；
- 历史本地报告不自动删除，迁移/清理需负责人确认。

### 42.2 下一轮提示词必须包含
**下次给 GPT 的提示词必须明确告诉 GPT：**
1. 协作协议已改为 `HANDOFF.md` + `REPORT.md` 双文件；
2. 每轮完整报告在 `REPORT.md`，HANDOFF 只做摘要/状态；
3. 要求 GPT 读取/更新这两个文件，不要再要求 DSH 生成独立本地报告；
4. 本地只提供提示词文件。

### 42.3 当前
- 本轮未创建 `REPORT.md`（尚无下一轮完整报告）；从下一轮开始执行。
- 未修改生产环境；仅更新工作区守则与 HANDOFF。
- 下一位更新者必须重新读取远程最新 blob SHA。


---

## 43. P0 staging plan v5 复核与 REPORT 首次使用（HANDOFF-0044）

> 完整报告：`coordination/REPORT.md`（REPORT-0001）
> 本轮按新协议：HANDOFF 只留摘要，完整报告进单一 REPORT.md；本地只生成提示词。
> 只读；未解包、未 npm ci、未测试、未创建 staging/profile、未执行 dsh plugin add、未启动 host、未连生产 DB、未部署。

### 43.1 结论
**PLAN V5 REVIEW PASS（仅设计/静态）。** 只代表可进入下一阶段 staging，不代表 staging 已通过，更不代表生产部署授权。

### 43.2 前轮三点修正
1. `dsh.profile.bundles` 已按字符串数组断言：base/web/memory 三个精确名称，长度3、去重3、无额外/旧版。
2. web 默认 bind host 为 `127.0.0.1`，Node 预检已对齐。
3. 候选 commit 固定 `7548e49ed0b8d8673818464325d8e72ec7704b27`，禁止浮动 HEAD/旧 tar。

### 43.3 关键证据
- base/web/candidate manifest 均为 `dsh.bundle.patch`，profile bundles 是字符串数组；
- `dsh plugin add web` → `reconcile` 加入 web；再 `add link` 保留 web 并加入候选；预期 symlink；
- host 命令：`env HOME=... DSH_HOME=... /root/dsh-bin/dsh --profile p0-staging --port 31873 --no-open`；
- CI #90 run `44751203163` head `7548e49` success；
- snapshotColumns 新测试命中显式缺列分支；ALTER/FTS5/version 测试存在。
- DSHA SQLite 3.53.3/ONNX/exporter/WAL/host 均 NOT RUN。

### 43.4 仍需 staging 实测
- `dsh plugin add web/link` 实际执行与 bundle 断言；
- 候选 symlink realpath；
- npm ci/ONNX session；
- schema4 fixture 迁移、失败回滚、WAL/快照；
- host/strace/端口；
- 生产部署未授权。

### 43.5 交接
- 版本：`HANDOFF-0044`
- 基于旧 blob：`b2fee5cc8e78edd229ed71dfc338521860389f35`
- 完整报告：`coordination/REPORT.md`（REPORT-0001）
- 下一位更新者必须重新读取最新 blob SHA。


---

## 44. Emotion Intelligence 纳入 Persona 长期计划 + P0 v5 PASS（HANDOFF-0045）

> 完整报告：`coordination/REPORT.md`（REPORT-0002）
> REPORT-0002 commit：`3445b5ecb6b881c03d217af42e3d17340517501d`
> REPORT blob：`fd41689568555de8a9e04ce6a3041976c56018d4`
> 本节只记录长期决策与状态；源码审查细节、文件 SHA、分阶段方案见 REPORT-0002。

### 44.1 P0 staging 状态
- DSH 复核结论：**PLAN V5 REVIEW PASS（仅设计/静态复核）**，依据 HANDOFF-0044 / REPORT-0001。
- 可进入隔离 staging 阶段，但 staging 尚未执行；本轮不启动 staging，等待负责人明确安排。
- staging 仍需验证 profile bundles、web→candidate link、symlink/realpath、npm ci/ONNX、SQLite 3.53.3、schema4 migration/rollback、WAL/快照、host/strace/exporter。
- 生产 DB/profile/config 修改、部署、重启仍未授权。

### 44.2 新增长期专题：Emotion Intelligence（情绪智能系统）
负责人确认将其纳入 Persona 长期优化计划，防止遗忘。参考负责人提供的六种基础情绪、复合情绪组合、情绪触发/变化、情绪关联记忆、安全区/消散区概念。
- 不把离散组合数量当作情绪上限；六种基础情绪是参考维度，不是封闭 enum。
- 图中组合按 C(6,2)+C(6,3)+C(6,4)+C(6,5)+C(6,6)=**57** 种；若计六种单独情绪则非空子集共63种。组合数不等于心理有效情绪全集。
- 情绪强度/置信度/目标/来源/原因/时间衰减应可分别表达；允许正负情绪并存。
- 情绪衰减、episode 过期不得删除或改写 raw 对话、永久档案或历史记忆。
- 先做源码审查和契约设计，不直接改生产。

### 44.3 Persona 源码第一轮只读审查结论
- 仓库：`ba-song/dsh-persona-core`；main HEAD：`a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；package `0.2.0`。
- 已确认现有 emotion_state / timeline / points / event / appraisal / episodes、PAD/mood/dominance、LLM appraisal、peer-specific relationship axes，以及供 Memory 使用的 `dyPersona.emotionAt/emotionTimeline` 只读接口。
- 主要差距：多个活跃 episode 虽可存储，但 `composeEmotionView` 当前只选最强 episode 输出单一 label；LLM appraisal 也是单个 emotion 字段；基础情绪 ontology 未统一版本化；本轮未确认 Memory 消费端端到端保留情绪关联。
- 不需要推翻现有系统；先在纯函数层研究复合情绪合成，再扩展 appraisal 和 Memory 关联接口。
- 历史 README 测试基线 233/233；本轮未运行测试，不作为本轮验收。

### 44.4 后续阶段
1. GPT 完成 Persona 情绪状态/迁移/异步 appraisal/注入预算/测试的第二轮审查。
2. GPT 审查 Memory 对 `emotionAt/emotionTimeline` 的真实调用、raw/episode 写入和 recall 数据流。
3. 输出 EI-0 逻辑契约与开发任务拆解，再决定是否在开发分支实施。
4. DSH 只读核对 DSHA 安装版 Persona 是否与 GitHub HEAD 一致，并可核实 Memory 消费端调用点；不得运行迁移、改生产、重启或自行启动 P0 staging。

### 44.5 本轮副作用
- 仅 GitHub 只读源码审查与协调文档更新。
- Persona 源码/测试：NOT RUN；DSHA 本地核对：NOT RUN；Memory 调用端审查：NOT RUN；staging：NOT RUN；生产写入/部署/重启：NOT RUN。

### 44.6 协作协议与报告
- HANDOFF：`coordination/HANDOFF.md`，当前 HANDOFF-0045。
- 完整报告：`coordination/REPORT.md`，当前 REPORT-0002。
- 本轮由于 GitHub connector 的文件更新接口不提供 tree SHA，REPORT 与 HANDOFF 分两次顺序提交；HANDOFF-0045 明确引用已提交的 REPORT-0002 commit/blob。后续继续按更新前重新读取最新 Blob SHA、SHA 保护和并发冲突重读合并，不覆盖他人更新。


---

## 44. Persona 本地核对与 Memory 情绪数据流（HANDOFF-0046）

> 完整报告：`coordination/REPORT.md`（REPORT-0003）
> 本轮按新协议：HANDOFF 只留摘要；完整报告覆盖 REPORT.md；本地只生成提示词。
> 只读；未改 Persona/Memory 源码、DB、profile/config；未启动 staging；未部署/重启。

### 44.1 Persona 本地版本
- 路径：`/root/.dsh/plugin-src/dsh-persona-core`；package `dsh-persona-core@0.2.0`。
- 无 `.git`；按文件级证据：本地 71 个文件与 GitHub `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90` **71/71 SHA256 完全一致**。
- 同步 manifest：71 文件/0.2.0，`.last-sync` 2026-11-20 22:01:08 CST。
- 不能声称 git 干净（无 Git）；只能声称文件哈希一致。

### 44.2 Memory 情绪调用链（源码+只读计数）
- `lib/ingest/archive.js:244 snapshotEmotion`，触发于 `:494 assistant/message`；写 `raw_emotion_archive`（`:183`）。
- 读取：`lib/inject/anchors.js:569 emotionAtTime`（persona.emotionAt 优先→emotionTimeline→本地 emotion_timeline）、`lib/inject/context-blocks.js:70-81`、`lib/archive/tools.js:105`。
- 生产只读：`raw_emotion_archive` 1,957 行；episode 69 条；episode meta 含 emotion **0**；memory 遗留 emotion_timeline 10 行。
- `addEpisode` meta 无 emotion（`lib/service.js:311`）；episode 不保存情绪。
- 结论：**raw 级情绪快照已实现；memory/episode 级情绪关联未实现；情绪不参与召回，只用于上下文展示。**
- 风险：只对 assistant 消息快照；24h 窗口可能把当前/较近情绪挂到旧消息；多情绪未落地（`composeEmotionView` 仍只选一个）。

### 44.3 EI 计划确认
- 保留 EI-0..EI-5，不删减；六基础+57 组合共 63 非空组合是参考维度，不是上限；衰减不删除原始对话/永久档案/历史记忆；情绪只影响表达/关注/反思。

### 44.4 状态
| 项 | 状态 |
|---|---|
| Persona 文件哈希与 a84c7ba | PASS（71/71） |
| Persona Git HEAD | BLOCKED（无 .git） |
| raw 情绪快照 | PASS（代码+1,957 行） |
| episode 情绪关联 | FAIL/缺口（0 meta） |
| 情绪召回信号 | FAIL/缺口（仅展示） |
| 多情绪视图 | FAIL/缺口（单标签） |
| end-to-end 运行时情绪 | NOT RUN |
| P0 staging/生产写入 | NOT RUN/禁止 |

### 44.5 交接
- 版本：`HANDOFF-0046`
- 基于旧 blob：`d86db7e96fbbc1e2dfeff2c128e135089a90d58f`
- REPORT-0003：`coordination/REPORT.md`
- 下一位更新者必须重新读取最新 blob SHA。


---

## 45. Emotion Intelligence 第二轮源码审查与 EI-0 契约草案（HANDOFF-0047）

> 完整报告：`coordination/REPORT.md`（REPORT-0004）
> REPORT-0004 commit：`0907229b3412a173f05511f504ca8778359598e6`
> REPORT blob：`9d3ec42b26b58a032b490b8a397e15a0d4aa2a11`
> 基于 HANDOFF-0046 blob：`13d7dd8b3ab1087499f8704d4e87f8115b1c657a`
> 本轮只读源码审查与文档更新；未改插件源码、未运行测试、未连接/修改生产 DB、未启动 staging、未部署/重启。

### 45.1 DSH 结果复核
- Persona 本地 71/71 文件 SHA256 与 GitHub 基线 a84c7ba 完全一致；安装目录无 .git，因此不声称 Git clean。
- Memory raw 情绪快照 1,957 条；69 个 episode 的 meta emotion=0。
- 情绪当前用于上下文展示，不参与主召回；assistant-only 快照及 24h 近似时间关联是已确认缺口。

### 45.2 Persona / Memory 第二轮源码结论
- Persona 已有 valence/arousal/certainty/intensity、mood 慢层、dominance、energy/social、timeline、event、appraisal、episodes、关系轴。
- `composeEmotionView()`（emotion.js:774-812）只取最强 active episode 输出单一 label；完整多情绪集合尚未暴露。
- `appraisal.js` prompt/parser 仍是单 emotion + 单 intensity/valence/arousal。
- Persona DB schema v2 已有 emotion_state/timeline/points/episodes/event/appraisal；应在既有基础上增量扩展，不推翻重做。
- Memory `snapshotEmotion()` 写 raw_emotion_archive；仅 assistant/message 触发；`addEpisode` meta 无 emotion；`emotionFactorOf` 读取 emotionIntensity，但现有 episode meta 缺值；历史情绪时间关联需标明精度。
- 证据、文件行段和限制详见 REPORT-0004。

### 45.3 EI-0 契约原则
- 分离不可变 EmotionEvent、短期 EmotionEpisode、当前 EmotionState 投影、EmotionMemoryLink、可选 EmotionRecallSignal。
- 新增 `emotions[]` 为多情绪权威视图；旧单值 label/emotion 保留兼容。
- 体验者与目标对象分离；不把用户情绪误写为汐的情绪。
- 事件时间与记录时间分开；历史快照不可被当前状态覆盖。
- 六基础情绪和组合只是参考 ontology，不设封闭上限。
- 安全区/消散区仅表示保留/激活/检索状态；衰减不删除 raw、永久档案或历史事件。
- 情绪召回先 shadow，不改变排序/注入；以后仅可作为低权重可解释信号，事实相关性和硬权限门槛优先。
- 关系成长先 suggest-only，低置信 appraisal 不得直接修改长期人格。

### 45.4 后续计划
1. GPT 完成 EI-0 兼容矩阵、字段/时序/错误处理和契约定稿。
2. DSH 只读核对本地 Memory 调用点及运行版本已完成；后续如需实测，必须隔离 fixture。
3. EI-1 纯函数复合情绪合成，EI-2 appraisal 多标签 shadow，EI-3 Memory 情绪关联，EI-4 关系/成长 suggest-only，EI-5 隔离测试与渐进启用。
4. P0 staging plan v5 设计 PASS，但 staging 仍待负责人单独决定；与 EI 专题并行管理。

### 45.5 状态
| 项目 | 状态 |
|---|---|
| DSH Persona 本地文件一致性 | 已完成（71/71 SHA256） |
| Persona 第二轮源码审查 | 已完成（静态） |
| Memory 情绪数据流审查 | 已完成（静态+DSH只读计数） |
| EI-0 契约草案 | 已完成（待复核定稿） |
| EI-1..EI-5 实施 | 未开始 |
| Persona/Memory 测试 | NOT RUN |
| DSHA E2E | NOT RUN |
| P0 staging | NOT RUN，待负责人决定 |
| 生产变更/部署 | 未授权、未执行 |

### 45.6 下一轮
- GPT：定稿 EI-0 契约与开发任务拆解；所有开发修改在开发分支完成。
- DSH：收到 GPT 提示词后只读复核契约与本地兼容风险，不自行改源码或启动 staging。
- 更新 HANDOFF/REPORT 时遵守 SHA 并发保护。


---

## 46. Emotion Intelligence EI-0 契约复核（HANDOFF-0048）

> 完整报告：`coordination/REPORT.md`（REPORT-0005）
> 只读；未改源码/DB/profile；未运行测试/staging/host；未部署/重启。

### 46.1 结论
**EI-0 契约复核 BLOCKED。** 方向和原则正确，但有 4 个结构性歧义需先修：
1. EmotionEvent 含 `emotions[]` 与 EmotionAppraisal 边界冲突；
2. Episode 只有单个 event/appraisal，无法表达“多事件推动一个 episode”；
3. EmotionMemoryLink 跨 Persona/Memory/task 库，未定义归属/ID 生命周期；
4. EmotionState 的 `emotions[]` 缺 target 维度，会把对主人/工具/自己的情绪混成一个全局状态。

### 46.2 补充缺口
- event 无幂等键/dedupe；迟到/补收/24h 近似需明确 `exact|nearest|window_fallback`，禁止当前状态回填历史。
- 多情绪合并、primary label、正负并存、低置信/过期处理未定义。
- 旧 API `state/emotionAt/emotionTimeline/emotionLine` 需保留单值并新增 `emotions[]`/能力协商，避免 Persona/Memory 版本错配。
- 事务、索引、每轮写入上限、低置信不写长期关系/人格需补充。

### 46.3 建议
- Event=不可变触发事实；Appraisal=不可变判断（可多版本）；重新评价追加，不改旧 event。
- Episode 增加 `episode_sources(episode_id,appraisal_id)` junction；保留 primary_appraisal_id 兼容。
- Link 归一侧 DB（Persona 或 Memory），用命名空间 target_kind/target_id，不做跨库 FK；memory 删除只标 invalidated/dangling，不删 event。
- State 按 experiencer+target 分区；`emotions[]` 每项带 target，primary label 仅展示。
- 事件增加 dedupe_key；link 记录 temporal_precision；shadow 阶段不改排序/注入。

### 46.4 状态
| 项 | 状态 |
|---|---|
| Persona/Memory 事实核对 | PASS（源码/只读计数） |
| EI-0 原则 | PASS（方向） |
| Event/Appraisal 边界 | BLOCKED |
| Episode 多事件 | BLOCKED |
| 跨库 Link | BLOCKED |
| State target 维度 | BLOCKED |
| 幂等/时间精度/API 兼容/事务索引 | 需补充 |
| EI-1 实施/生产写入 | NOT RUN/禁止 |

### 46.5 交接
- 版本：`HANDOFF-0048`
- 基于旧 blob：`81b7456fcdeb2468d590c4c55b43bebe0c94e287`
- REPORT-0005：`coordination/REPORT.md`
- 下一位更新者必须重新读取最新 blob SHA。

---

## 47. EI-0 契约修订决策（HANDOFF-0049）

> 完整报告：coordination/REPORT.md（REPORT-0006）
> REPORT commit：70cf787fd9c40e9a5da907fa40088b72b697badb
> REPORT blob：1ba38b583434de2cbe350d41ede0898379d5a69a
> 基于 HANDOFF-0048 blob：79bb0afb56b1f4817945d544c3d8604c925c460e
> 本轮仅更新协调文档；未修改插件源码、未运行测试、未连接/修改生产 DB、未启动 staging、未部署/重启。

### 47.1 四项结构性裁决
1. Event/Appraisal 分离：Event 仅记录不可变触发事实；Appraisal 是不可变判断版本。重新评价追加，不修改旧事件/评价。
2. Episode 多来源：采用 emotion_episode_sources(episode_id, appraisal_id, weight, added_at, source_role) junction 表；保留旧 appraisal_id 作为 primary 兼容字段；旧数据回填必须幂等。
3. MemoryLink 归属：放在 Memory DB；Persona event/appraisal ID 是 opaque 外部引用，不做跨库 FK。删除/撤回只标 invalidated/dangling，不删除事件；双库一致性用幂等 outbox/inbox，不做跨 SQLite 事务。
4. State target：按 experiencer+target 分区；每个 emotion item 带 target；新增 stateFor(target)；旧 state() global primary 保持兼容。

### 47.2 其他契约决定
- 不设情绪 ontology/组合总量上限；正负情绪并存、不抵消。
- 同 label + 同 target 合并展示，effective intensity 取衰减后最大值；保留全部 source IDs。
- primary label 仅兼容展示，按 target 过滤后以 intensity×confidence 排序，稳定 tie-break。
- 低置信 shadow 初值：>=0.65 可进入 active episode 候选；0.45–0.65 仅保留 appraisal；<0.45 uncertain/abstain。待隔离评测校准。
- 单次 appraisal 最多 12 个有效 items 是资源保护，不是情绪种类/组合上限；State 默认展示最多 8 项，完整集合可分页。
- Event dedupe_key 唯一约束建议 (experiencer,source_kind,dedupe_key)；时间字段分开 occurred_at/recorded_at/appraised_at；Link temporal_precision 必填。
- API 兼容：保留旧字段/签名，新增 emotions[]、stateFor(target)、capabilities.emotionV2=true、schema_version=2；旧 Memory 不读新字段。
- Persona DB 内事件/Appraisal/Episode/EpisodeSource 单事务；MemoryLink 独立事务，采用 outbox/inbox 幂等重试。
- 低置信不改关系/人格/记忆权重；recall 首阶段 shadow only。

### 47.3 状态
| 项目 | 状态 |
|---|---|
| 四项结构性设计决策 | 已完成（GPT决策） |
| EI-0 修订契约 | 已完成，待DSH只读复核 |
| EI-1 | NOT STARTED，需 EI-0 PASS 后再排期 |
| Persona/Memory 源码修改与测试 | NOT RUN |
| DB迁移/DSHA E2E | NOT RUN |
| P0 staging | NOT RUN，待负责人决定 |
| 生产写入/部署 | 未授权、未执行 |

### 47.4 下一步
- DSH：只读复核 REPORT-0006，重点检查 junction 迁移兼容、Memory DB Link/outbox 设计、target state API、阈值/上限是否可落地；不得实施。
- GPT：收到复核后定稿 EI-0；EI-0 PASS 后再在 Persona 开发分支实施 EI-1 纯函数层。
- 负责人：继续作为唯一中转和授权人；本次不代表授权 staging 或生产操作。

---

## 48. EI-0 修订契约第二轮复核（HANDOFF-0050）

> 完整报告：`coordination/REPORT.md`（REPORT-0007）
> 只读；未改源码/DB/profile；未运行测试/staging/host；未部署/重启。

### 48.1 结论
**EI-0 REVIEW PASS（有条件），可作为 EI-1 纯函数层开发依据。**

四项结构裁决已解决：Event/Appraisal 分离、Episode junction、Link 归 Memory、State 按 experiencer+target。

### 48.2 必须先落的兼容条件
1. **阈值与旧数据**：现有 345 条 episode/appraisal 的 confidence 默认 0.5；新 `>=0.65` 若直接回溯，会排除大量旧 episode。必须做 grandfathering/只对新 appraisal 应用/迁移标定。
2. **emotions[] 存储**：建议 `emotion_appraisal_items` 子表，不只 JSON；旧 `emotion` 列保留 primary。
3. **outbox/inbox 归属未定**：Persona 写入 event/appraisal 后谁保存待投递？建议 Persona DB outbox + Memory inbox/link；定义幂等 ack、重试、部分成功、双库不可用。
4. **target namespace**：self/owner/owner:<peer>/tool:<name>/event:<id> 规范化；`stateFor` 缺数据要标 fallback，不伪装精确。
5. **schema_version 命名冲突**：Persona DB 已用 schema v2；API 不要再用 `schema_version=2`，改用 `emotion_contract_version`/`api_version`。
6. **Link FK/失效**：raw/memory 可本地 FK，但不 cascade 删除历史；task 外部命名空间；tombstone/删除只标 invalidated/dangling。

### 48.3 当前只读证据
- Persona DB：episode 345、event 345、appraisal 345、appraisal_id=0 0 条、一个 event 多 appraisal 0 条。
- 旧数据一对一，junction 回填简单；仍要测试 0/无效 appraisal。
- 现有 API：state/emotionAt/emotionTimeline/emotionLine 单值；新增 emotions[] 必须保留旧字段。

### 48.4 状态
| 项 | 状态 |
|---|---|
| Event/Appraisal 分离 | PASS |
| Episode junction | PASS（需 unique/回填规则） |
| Memory Link 归属 | PASS（outbox 未定） |
| target State | PASS（namespace/fallback 需定） |
| 阈值/上限 | PASS（需 legacy 兼容/校准） |
| API 兼容 | PASS（schema_version 命名需改） |
| emotions[] 存储/outbox | 待定（EI-2/EI-3 前） |
| EI-1 | 可开始（NOT RUN） |
| 生产写入/部署 | NOT RUN/禁止 |

### 48.5 交接
- 版本：`HANDOFF-0050`
- 基于旧 blob：`7e3c573d463344f30f2b424e3c13d12abf0c5c07`
- REPORT-0007：`coordination/REPORT.md`
- 下一位更新者必须重新读取最新 blob SHA。

---

## 49. EI-0 有条件 PASS；EI-1 纯函数首轮实现（HANDOFF-0051）

> 完整报告：coordination/REPORT.md（REPORT-0008）
> REPORT commit：d82d16c16abfcfdbf11b8531e81c32323fbf6eb5
> REPORT blob：cd116ca0ec7a277424167ea93243b0110cc75937
> 基于 HANDOFF-0050 blob：7b0b825a64b2c1869791bb0e865b7f73bb2c5e0a

### 49.1 DSH 复核结论裁定
- 接受 EI-0 REVIEW PASS（有条件）；允许开始 EI-1 纯函数层。
- 旧 345 条 episode 的 confidence 默认 0.5 不得被新 0.65 阈值回溯排除；未来集成必须显式 grandfather 或仅对新 appraisal 应用阈值。
- `emotion_appraisal_items`、Persona outbox/Memory inbox、target namespace、`emotion_contract_version`、Link FK/失效规则留到 EI-2/EI-3 前落实。

### 49.2 Persona 开发分支
- 仓库：ba-song/dsh-persona-core
- 基线：a84c7badd1e6c971a66b6c39dd4f7ab795df4b90
- 分支：feat/ei1-emotion-composition
- HEAD：5813a769974972a112d3dd8df5f32773746f01e0
- 新增 `lib/emotion-compose.js`：纯函数多 episode 合成、按 experiencer+target+label 合并、强度取最大衰减值、正负并存、显式 legacy grandfather、confidence 分类、稳定排序、完整 allEmotions + displayLimit 元数据。
- 新增 `tests/emotion-compose.test.mjs`：8 项测试覆盖上述规则。
- 未改现有 `composeEmotionView`、appraisal、DB、service、注入或 API；main/生产行为未变。

### 49.3 验证状态
- GitHub 文件写入与 fetch SHA 核对：完成。
- 新增测试/Persona 全量测试：NOT RUN；当前执行容器 DNS 无法解析 raw.githubusercontent.com，无法运行 Node。
- DSHA 本地验证、CI、集成、DB/staging/生产：NOT RUN。

### 49.4 下一步
- DSH：拉取精确 HEAD，运行新增 8 项测试和 Persona 全量测试；只读复核代码，不接入生产，不改 DB/appraisal/API/profile，不部署/重启。
- GPT：根据实测结果修复开发分支；测试通过后再安排隔离集成验证。
- 负责人：本轮不要求生产操作授权；DSH 仍是本地测试执行方，负责人是唯一中转人。

---

## 49. EI-1 首轮实测与复核（HANDOFF-0052）

> 完整报告：`coordination/REPORT.md`（REPORT-0009）
> 只读/隔离 worktree；未改生产源码/DB/profile；未启动 staging/host；未部署/重启。

### 49.1 结果
- 目标 commit：`5813a769974972a112d3dd8df5f32773746f01e0`；main `a84c7ba` 未变；仅新增 `lib/emotion-compose.js`、`tests/emotion-compose.test.mjs`。
- 新增测试 `8/8 pass`；全量 `311/311 pass`（exit 0）。
- 实现主体 PASS：同 label/target 合并取最大衰减强度、不同 target 隔离、正负并存、过期/低强度不删源、legacy/confidence、分页/完整集合。
- **结论：EI-1 IMPLEMENTATION REVIEW BLOCKED。**

### 49.2 阻塞/问题
1. **P1 sourceIds 丢失 appraisalId**：`lib/emotion-compose.js:61-63` 只用 `id ?? ... ?? appraisal_id`，真实 episode 同时有 id 和 appraisal_id 时只保留 id；违反来源完整。
2. P2 `localeCompare` 跨环境不确定性（`:107/108/113/121-123`）。
3. P2 异常输入测试不足（null/缺字段/NaN/Infinity/越界/未来时间/sourceIds）。
4. P3 非有限 `expires_at` 被忽略，可能永久 active。
5. legacy 旧数据需迁移/适配，纯函数本身正确。

### 49.3 状态
| 项 | 状态 |
|---|---|
| 目标 commit/工作树 | PASS |
| 新增测试 8/8 | PASS |
| 全量 311/311 | PASS |
| 多情绪/合并/隔离/衰减 | PASS |
| sourceIds 完整性 | **FAIL/P1** |
| 跨环境确定性 | 风险/P2 |
| 异常输入覆盖 | 不足/P2 |
| 非有限 expires_at | 风险/P3 |
| EI-2/EI-3/生产 | NOT RUN/禁止 |

### 49.4 交接
- 版本：`HANDOFF-0052`
- 基于旧 blob：`9127ef5318f5911233264cca052148ccb6b5a16a`
- REPORT-0009：`coordination/REPORT.md`
- 下一位更新者必须重新读取最新 blob SHA。


---

## 50. EI-1 首轮 BLOCKED 修复与复验交接（HANDOFF-0053）

> 详细记录：coordination/REPORT.md（REPORT-0010）
> REPORT commit：f782f331178971830bceccdc43981270e79fd061
> REPORT blob：7f37306c5afffb2832773e7d22e6ecdd1ea14133
> 更新前 HANDOFF blob：40baa1976470733c0fadf56666a33f25a9b1879e

- DSH HANDOFF-0052 / REPORT-0009 的 BLOCKED 结论已接受。
- Persona：ba-song/dsh-persona-core，分支 feat/ei1-emotion-composition。
- 修复 commit：ad809910801983be61165ff037a2e138676854aa。
- 修复 sourceIds 同时保留 id/episodeId/appraisalId/appraisal_id/sourceIds 数组；字符串排序改 codepoint；拒绝越界 intensity/confidence；显式非有限 expires_at 拒绝。
- 新增异常输入、未来时间、双 ID、非 ASCII 排序、displayLimit 大于总量等测试。
- 文件 blob：source 547ff177a02bd80152ccb3914d54f287f775befa；tests a92aacf1e04bcb5852eb7308ce3d0a7a2892580b。
- GPT 未运行测试；新增测试、全量测试、CI 均 NOT RUN。DSH 需在隔离 worktree 拉取精确 commit 实测。
- 禁止改生产源码/DB/profile、禁止接入注入、禁止部署/重启；EI-2/EI-3 与 P0 staging 仍 NOT RUN。


---

## 51. EI-1 修复后第二轮复验（HANDOFF-0054）

> 完整报告：`coordination/REPORT.md`（REPORT-0011）
> 只读/隔离 worktree；未改生产源码/DB/profile；未启动 staging/host；未部署/重启。

### 51.1 结果
- 目标 `ad809910801983be61165ff037a2e138676854aa`；blob source `547ff177...`、tests `a92aacf1...` 与任务一致。
- 新增测试：**14 tests / 13 pass / 1 fail**，exit 1。
- 全量：**317 / 316 pass / 1 fail**，exit 1。
- 唯一失败：`classifyEmotionConfidence(-0.1)` 返回 `uncertain`，期望 `unknown`；`1.1` 会被 clamp 成 active candidate。

### 51.2 原因
`lib/emotion-compose.js:16-24` 先 `clamp01(confidence)` 再分类；越界值被夹到 0/1，违反“outside [0,1] = unknown”。`normalizeEpisode` 已把越界 confidence 设为 null，所以 compose 的 total=0 通过，但 direct API 测试失败。

### 51.3 其他修复
- sourceIds：PASS（id/episodeId/appraisalId/appraisal_id/sourceIds[] 去重）。
- codepoint 排序：PASS（已无 localeCompare）。
- 异常数据/expiry/intensity：PASS（除 confidence 直接分类）。
- 架构边界：仅两个文件；未改生产/旧 episode。

### 51.4 结论
**EI-1 IMPLEMENTATION REVIEW BLOCKED。** 最小修复：`classifyEmotionConfidence` 在 clamp 前对 <0/>1 返回 unknown；修复后复跑 14/14 + 317/317。

### 51.5 交接
- 版本：`HANDOFF-0054`
- 基于旧 blob：`f565ffe88f9fe5e4c5197214d4e7cb367126f778`
- REPORT-0011：`coordination/REPORT.md`
- 下一位更新者必须重新读取最新 blob SHA。


---

## 52. EI-1 第二轮 BLOCKED 单点修复，等待第三轮复验（HANDOFF-0055）

> 基于 DSH HANDOFF-0054 / REPORT-0011；Persona 修复已提交开发分支，未运行 Node 测试。
> Persona 分支：`feat/ei1-emotion-composition`
> 第二轮失败目标：`ad809910801983be61165ff037a2e138676854aa`

### 52.1 修复
- 缺陷：`classifyEmotionConfidence()` 先 clamp 再分类，导致 -0.1 被判 uncertain、1.1 被判 active_candidate。
- 修复：保留原 `finite()` 缺失/非有限判断；转换为 Number 后，在任何 clamp 前检查 <0 或 >1，直接返回 unknown；合法 [0,1] 值直接参与阈值分类。
- 保留 `normalizeEpisode` 越界 confidence -> null 的既有处理。
- 扩充 direct API 边界测试：NaN、±Infinity -> unknown；0 -> uncertain；1 -> active_candidate；保留 -0.1/1.1 -> unknown 断言。
- 未改任何其他生产/集成路径；未触碰 DB、profile、appraisal、注入、composeEmotionView。

### 52.2 GitHub 交付
- source commit：`4b9a744cb2fbf6251b2b2787d3deac3eea3a4216`
- source blob：`4f460b2b10f0dea87cffaf550d2fbe66dde591c0`
- tests commit（当前分支最新提交）：`92a763bfc096c490ba65878f7593961f982ea20a`
- tests blob：`9f813b973546d41fe933b75b1f18178b2e8418a4`
- 已重新 fetch 两个文件，SHA 与上述一致。
- GPT 未运行 Node 测试；新增测试、全量测试、CI 均 NOT RUN。

### 52.3 下一步
- DSH 在隔离 worktree 拉取精确 commit `92a763bfc096c490ba65878f7593961f982ea20a`，运行新增测试和全量测试。
- 预期新增测试 14/14、全量 317/317；这是验收目标，不是已发生结果。
- 必须检查 direct API 的 -0.1/1.1/NaN/±Infinity 与 0/1 边界。
- 若通过，结论才可更新为 EI-1 IMPLEMENTATION REVIEW PASS；不得把测试通过等同生产集成通过。
- EI-2/EI-3、staging/host、生产接入、部署/重启仍 NOT RUN/禁止。


---

## 53. EI-1 第三轮复验 PASS + 记忆冲突误判（HANDOFF-0056）

> 完整报告：`coordination/REPORT.md`（REPORT-0013）
> 只读/隔离；未改生产源码/DB/profile；未启动 staging/host；未部署/重启。

### 53.1 EI-1 结果
- 目标 `92a763bfc096c490ba65878f7593961f982ea20a`；source blob `4f460b2b...`、tests `9f813b97...` 与任务一致。
- 新增测试 **14/14 pass**；全量 **317/317 pass**；exit 0。
- confidence 直接 API 已改为先检查 [0,1]，越界/NaN/Infinity → unknown；0→uncertain、1→active_candidate。
- sourceIds/codepoint/异常输入/架构边界无回归。
- **EI-1 IMPLEMENTATION REVIEW PASS（纯函数层）**；不代表 EI-2/EI-3/生产集成。

### 53.2 记忆冲突误判（代码待修，数据后修）
- pending #8：memory_a=185、memory_b=355，`sim=0.677 opposition`。
- #185 `status=active` 但 `superseded_by=320`、`valid_to` 有值；#355 是同一偏好“喜欢带语气词”。
- P4 邻居查询未过滤 status/superseded_by/valid_to，向量含旧记录；冲突极性按整段取负，把“不要冷冰冰”误当“喜欢语气词”的反义。
- 负责人决定：**先修代码，数据后修**。
  - GPT：P4 只选 active + 未 superseded + valid_to 空；极性按分句/对象；补回归测试。
  - 数据：待代码验证后由负责人单独授权修 #185/#8/#355。
- 本轮未写冲突队列/生产记忆。

### 53.3 交接
- 版本：`HANDOFF-0056`
- 基于旧 blob：`96e68ded1c1ccf0c586b340d3d022ed7a54b8b0f`
- REPORT-0013：`coordination/REPORT.md`
- 下一位更新者必须重新读取最新 blob SHA。


---

## 54. Memory P4 冲突误判代码修复（HANDOFF-0057，等待 DSH 隔离验证）

> 基于 HANDOFF-0056 / REPORT-0013。负责人决定先修代码、数据后修。
> 仓库：`ba-song/dsh-memory-core`
> 开发分支：`fix/p4-active-neighbors-semantic-opposition`
> 分支基于 `feat/m1-preference-memory`；未修改 main、生产源码或生产数据。

### 54.1 修复内容

1. **P4 邻居与向量过滤**
   - 向量匹配前，从 `memories` 读取有效候选 ID，仅允许 `status='active'`、`superseded_by IS NULL OR =0 OR =''`、`valid_to IS NULL`。
   - 对传入 vectors Map 只保留上述有效 ID，再运行 bestMatch，避免旧向量遮蔽真正的 active 邻居。
   - 最终按同一条件再次查询 neighbor，作为第二道防线。
2. **冲突极性分句/同对象**
   - `hasOpposition` 改为成对比较两边的分句。
   - 只有分句极性相反且共享至少一个非停用主题字，才可判 opposition。
   - 明确反义词也必须出现在这对共享主题的分句中。
   - 修正换行分句正则。
3. **回归测试**
   - 在 `tests/p4.test.mjs` 增加 stale/superseded 旧记忆仍带最高向量时，必须选 active 当前记忆的管线测试。
   - 增加“喜欢带有语气词的句子”与“希望汐说话带语气词，活泼些，不要冷冰冰”不构成 opposition、相似度高时 merge 的测试。

### 54.2 GitHub 交付

- 分支：`fix/p4-active-neighbors-semantic-opposition`
- 最新 commit：`d9d50ac087e40cef0de03f96e2a05248cfe4e5e2`
- `lib/ingest/p4.js` blob：`e05b9c30b31d9e8546d67eb256ebdfdbea6bfdb8`
- `lib/ingest/conflict.js` blob：`cb960430d163d1c40be60a778162af19b5904ce4`
- `tests/p4.test.mjs` blob：`4ed68ce0de11a7c3b89de21a6c723c6421ef4100`
- GPT 已重新 fetch 核对上述 blob。
- GPT 未运行 Node 测试；新增测试和全量测试均 NOT RUN。

### 54.3 下一步

- DSH 在隔离 worktree 拉取精确 commit，执行 P4/conflict 定向测试及 Memory 全量测试。
- 重点确认 active 过滤同时作用于 vectors Map 和最终 neighbor 查询；空字符串 superseded_by 也视为未 superseded。
- 重点确认既有真正冲突（喜欢海/讨厌海、爱吃辣/讨厌吃辣等）仍被识别。
- 测试通过前，不修 #185/#8/#355 数据。
- 数据修复必须等代码验证通过后，由负责人另行授权。

### 54.4 边界

- 只改开发分支 2 个源码文件和 1 个测试文件。
- 未改生产 DB、冲突队列、记忆状态、profile、main。
- 未运行生产数据修复、staging/host、部署或重启。
- EI-2/EI-3/生产集成仍 NOT RUN。


---

## 55. Memory 有效性复核、EI-2 设计裁决与 Android/Autonomy 状态保留（HANDOFF-0058）

> 完整报告：`coordination/REPORT.md`（REPORT-0015）
> REPORT commit：`0b4e1569435d3e2f60c97daf2a47ef1251b4ab5c`
> REPORT blob：`f1add923426b11b39a702e435597e184159800c9`
> 基于 HANDOFF-0057 所在文件 blob：`f8ffa40d4c27c04d23ff74b123bf2b7044821976`
> 本轮仅开发分支源码/设计文档和协调文档；生产 DB/profile/config、部署、重启、staging 均未触碰。

### 55.1 Memory：统一有效性谓词复核

- 仓库：`ba-song/dsh-memory-core`
- 分支：`feat/memory-validity-unified`
- Memory 智能体复核修正 commit：`4b4f92751b6c8cc41c0935fc2b4c267cd9cbd4c9`
- Memory 专项报告：`MEMORY-REPORT-0005`，commit `9f04ed3ef9c5ab8073f6fc3f417617007de1ea65`，blob `949e2512893445db778443b3988acc5927668c73`
- Memory 智能体报告的隔离测试：5/5 新测试、46/46 受影响测试、297/297 全量、0 fail/0 skip；负向对照 FTS 回退 1 fail、时间窗移除 2 fail。
- GPT 后续复核发现：普通关键词候选可能仅因 top-N 截断未返回，不应被标记为 `unknown-validity`；graph 的 `unknownHop` 则仍需保留保守诊断。
- GPT 已在同一隔离分支提交：
  - `697de1ee11ec12fb41d2d5a701851635c9192827`：`unknown-validity` 限定为 graph `unknownHop` 来源；`superseded-without-end` 仍检查全部相关候选。
  - `b4606e1c66f1afb94cb154b7ec96423103477029`：新增 top-N 误报回归测试。
- 最新两个文件 blob：
  - `lib/recall/recall.js`：`75b4fb7f184e1c614d8056ce7ab39f6d650a6f28`
  - `tests/asof-graph-uncertain.test.mjs`：`28425c24c1f516305dd69bc9dc5ab4b63da13edb`
- **状态：待 Memory 专项本地复验**。GPT 提交后尚未复跑，不能标 PASS。已提供给 Memory 智能体的验证提示词 WritingBlock ID `62041`；要求定向/全量测试及两组负向对照，完成后更新 MEMORY-REPORT-0006。
- 未合并主开发分支；未写生产 DB；未部署/重启/staging。

### 55.2 EI：EI-1 收口与 EI-2A 前置审查

- 仓库：`ba-song/dsh-persona-core`
- EI-1 代码目标：`3a1376184491d94b02d4c3ad4990a957e85acb48`
- EI-1 source/tests blob：`cf033ec8400ea38e717481a46a5bfe834276a4a5` / `eb17cb0f2c67450a145f38d1a582bef6d90b07c8`
- EI-REPORT-0004 记录定向 21/21、全量 324/324、0 fail/0 skip；结论为**代码隔离验收 PASS**，DSHA/设备复验 NOT RUN。
- GPT 更新 `EI-2-PERSISTENCE-DESIGN-01.md`：
  - commit：`8ccb8a922a789d8d15157b9d99f9de0c20c8807b`
  - blob：`670e5a34a1916a8b104ebfd1004b525236677d4c`
- B1 confidence_kind/source、B2 `legacy:event:<event_id>`、D3 最早截止规则已写入设计；D2 third_party 会话内临时 ID、D4 旧 348 条先 unknown/shadow、D5 阈值未校准、D6 legacyFallback、D7 outbox/inbox 留到 EI-2D 均已裁决。
- D1 owner ID 推荐跨受信任设备共享 opaque UUID，但最终由负责人确认；EI-2A 可先保留 unknown/空 ID。
- 新增 `EI-REPORT-0005.md`：Persona 分支 `ei/pre-ei2a-review-01`，commit `4992a313f72326caa4b5e84558005a53db239af0`，blob `e23d98c920f1a9979e1e83400123288e3ee8c88f`。
- **EI-2A 未获授权、未启动**；生产写入、迁移、staging、部署、重启均未执行。

### 55.3 Android 与 Autonomy：v4 设计对齐继续保留

- Android v4：commit `3dd5d321929b8f3e308663f48bc55292bce4de8a`，blob `76924c81f6b5b165e55dd797f3927408b84bfac9`。
- Autonomy v4：commit `1925037998a301550e96112e042ed6eb05df2440`，blob `26584df51148547baa357b109bf55aac43865ac0`。
- 两条线当前无任务运行，但必须保留在项目主线。v4 设计对齐不等于实机验收。
- 后续重点仍是 DSHA 真机 kill/reboot、双 worker、目录 watch、fsync、ENOSPC、f2fs 发布路径与 staging 验证；启动真机/staging/生产操作须由负责人另行安排/授权。

### 55.4 当前任务状态与边界

| 专题 | 当前状态 | 下一步 |
|---|---|---|
| Memory validity | 待 DSH/Memory 专项复验 | 完成 62041 提示词任务，更新 MEMORY-REPORT-0006 |
| EI | 无运行任务；EI-1 隔离 PASS，EI-2 设计已修 | 等待 D1 负责人确认；EI-2A 需单独授权 |
| Android | 无运行任务；v4 DESIGN ALIGNED | 后续安排实机验证前置工作，需授权 |
| Autonomy | 无运行任务；v4 DESIGN ALIGNED | 后续安排实机验证前置工作，需授权 |

- GPT 与 DSH 仍由负责人唯一中转；GPT 不直接联系 DSH。
- 本轮没有修改生产 DB、生产插件目录、profile/config；没有部署、重启、staging 或生产迁移。
- HANDOFF 与 REPORT 由 GitHub Contents 更新接口顺序提交为相邻 commits；接口未暴露可复用 tree SHA，故未能将两文件放入单一 commit。REPORT commit/blob 已在本节明确记录；后续如工具支持单 tree commit，再恢复同 commit 更新。
- 后续更新者必须重新读取最新 HANDOFF/REPORT blob SHA，按 SHA 并发保护更新，不得覆盖他人并发内容。


---

## 56. Memory 统一有效性 strict graph lane 复验通过（HANDOFF-0059）

> 专项报告：`coordination/Memory 智能体报告.md`（MEMORY-REPORT-0007）
> 专项报告 commit：`5109676ac15a06e830ea15df2a5cfe77b9b19506`
> 专项报告 blob：`1eca4afcaa8e5606b2193a0451b6c9d08d0c1da7`

### 56.1 Memory 隔离分支验收

- 仓库：`ba-song/dsh-memory-core`
- 分支：`feat/memory-validity-unified`
- 验收 HEAD：`c437c460d8378cbf6493a5e4e12d673c4334d50f`
- 提交链：`b4606e1c66f1afb94cb154b7ec96423103477029` → `d6521c10d8ff4c01cdaa0cd5712f3921b7ac43b4` → `1d0a163c3878208af8f9f523dd56575cc4b06687` → `c437c460d8378cbf6493a5e4e12d673c4334d50f`
- GPT 已通过 GitHub 独立核对分支 HEAD、三提交 compare（ahead 3、仅 3 文件变更）及三个文件 blob：
  - `lib/store/graph.js`：`94a196c27455a0a8601ef40889352eb46d2086ac`
  - `lib/recall/recall.js`：`6fda81efb6cc21ef5f9daf913ceea944e5bb2dbb`
  - `tests/asof-graph-uncertain.test.mjs`：`3a0d514661643fd34db804f9492620223b39c9f3`
- C 方案：普通 hop 继续 asOfHistory；独立 hopStrict 诊断通道允许与 hop 重叠；unknownHop 作为同一 Map 的兼容别名；recall 只将 strict lane 用作 unknown-validity 诊断，不混入正式召回结果。
- Memory 智能体在隔离 worktree 报告：定向测试 2/2、5/5、1/1、13/13；有效性集合 47/47；全量 `npm test` **298/298、0 fail、0 skip、exit 0**；三组负向对照全部按预期失败，恢复后全绿。
- **结论：C 方案隔离开发验证 PASS。** 测试由 Memory 智能体执行并报告，GPT 独立核对了 GitHub 提交与代码 blob；GPT 未亲自运行 Node 测试。

### 56.2 非阻塞残留风险

1. `recall.js` 的 `candidateIds` 仍通过兼容别名 `g.unknownHop.keys()` 取候选，而 `unknownIds` 使用 `(g.hopStrict ?? g.unknownHop)`；当前同一 Map，行为一致，后续应统一入口。
2. `hopStrict` 诊断查询仍硬编码 `status='active'`，与 asOfHistory 允许 archived/expired 的状态域不完全一致；需另行评估，不在本轮扩大范围。
3. preference / session-index / remembered / merge / daily / weekly / brief 等调用点尚未接入统一谓词，按既有授权边界暂不扩展。
4. 生产 as-of **NOT RUN**；生产插件仍为旧版。

### 56.3 边界与下一步

- 未写生产 DB、未改生产插件目录/profile/config；未部署、重启、启动 staging；未合并主开发分支；未修改 Persona/EI/Android/Autonomy。
- 下一步由 GPT 统一整合共享 HANDOFF/REPORT；Memory 后续调用点分批评估，生产验证、主线合并和部署均须另行安排/授权。
- Android 与 Autonomy v4 设计对齐仍保留项目主线；当前无任务运行，不得遗忘，真实设备验证仍待后续安排与授权。


---

## 57. Memory 剩余七调用点只读审查与分批建议（HANDOFF-0060）

> 基线：`feat/memory-validity-unified` @ `c437c460d8378cbf6493a5e4e12d673c4334d50f`
> 本节为 GPT 基于 GitHub 文件/blob 的只读代码审查；未改源码、测试或生产数据。

### 57.1 已核对文件与 blob

| 调用点 | 路径 | blob |
|---|---|---|
| preference 注入 | `lib/inject/preference.js` | `086b3e180050c1156af12b05affd89dbad69c8df` |
| session index | `lib/inject/session-index.js` | `355eb7a1bbc88d86e692b13f0bc511359cd0f33a` |
| remembered 注入 | `lib/inject/remembered.js` | `dc11425f2cdcc78ff5b9b86418b2fb44b5666ad5` |
| preference merge | `lib/pref/merge.js` | `2a801eefb4647b8ce3d1e31e2c1c0ad43e92cdf9` |
| daily consolidate | `lib/consolidate/daily.js` | `643d8026bf482dc0a5c76db9be8243f7ef77059a` |
| weekly consolidate | `lib/consolidate/weekly.js` | `a2d1178196f89dfd46d64f79f6e4136b76e6436f` |
| handoff brief | `lib/handoff/brief.js` | `0a111c003f2e0ac8cad746d5f16f2b412381555a` |
| validity helper | `lib/store/validity.js` | `00c4d948ccb2973d48d95aebb07d230c8f44854c` |

### 57.2 语义分类与风险

1. **低风险只读注入：preference / remembered**
   - 两者当前均筛 `status='active'`、`valid_to IS NULL OR valid_to>now`，但没有统一检查 `valid_from` 与 `superseded_by`。
   - 可优先评估接入 `validitySql({preset:'current',at:now})`；保留 scope、kind、meta persist、预算、排序和跳过原因。
   - remembered 当前使用内部 `Date.now()`，应考虑增加可注入 `now` 参数以便确定性测试，不改变默认行为。

2. **混合兼容语义只读注入：session-index / handoff brief**
   - session-index episode 当前 status active；todo 当前允许 `status IN ('active','')`，不能直接替换成 helper 的 current（其状态域严格为 active）而丢失旧数据兼容。
   - handoff brief 的 project todo 允许 NULL/空/active，且按 project_id 限定；owner 标签统计只筛 active。需保留 project、owner 隔离和遗留 status 规则，先设计是否扩展 helper 状态域或拆分查询，不宜机械套用 current。
   - handoff brief 的 decisions 表不是 memories，不接入 memory validity helper。

3. **事务写路径：preference merge**
   - incoming candidate 允许 active/pending；不能对 candidate 直接套 current preset，否则会拒绝合法 pending 激活流程。
   - 对比旧 preference rows 的查询可以考虑 current preset，但需保留同 scope、kind、long_term meta、quarantine、冲突队列、时间和事务内 revision/CAS 语义。
   - 属事务写路径，应单独实施和验证，不与只读注入混合。

4. **日结候选去重：daily**
   - existing 候选目前为最近 90 天 active，未统一检查 valid_from/valid_to/superseded_by。
   - 纯 SELECT 候选可评估 current helper；但后续 exact-text duplicate guard 当前跨状态全表查重，语义与「当前有效候选去重」不同，不得顺手改为同一谓词。
   - daily 还有 LLM、style 文件、profile、短期记忆及写库副作用；仅做候选筛选变更时必须严格保持其余流程不变。

5. **周结聚类与 supersede：weekly**
   - 候选当前为 active + layer=auto + lookback + kind 白名单；未统一检查时间起点/终点/接班指针。
   - apply 路径会写 revision、更新 status/superseded_by/valid_to/importance，且有旧 schema fallback；必须将候选查询与事务内 UPDATE 的条件一起设计，避免 stale candidate 或失败时退回不完整的时间语义。
   - 风险最高，必须单独批次，不能只改 SELECT 后就宣称完成。

### 57.3 建议批次（待负责人授权）

- **Batch A：preference + remembered**（只读注入，优先推进；可复用 current helper）。
- **Batch B：session-index + handoff brief**（先明确 legacy todo status 的兼容规则，再实施）。
- **Batch C：preference merge**（独立事务语义审查与实现）。
- **Batch D：daily consolidate**（先只处理候选查询，不碰其他副作用）。
- **Batch E：weekly consolidate**（最后单独处理读写事务、CAS 与 legacy fallback）。

每批均要求隔离分支、定向测试、全量测试、负向对照、实际 blob/HEAD 核验；由 Memory 智能体执行本地测试，GPT 负责代码审查和共享 HANDOFF/REPORT 整合。

### 57.4 当前门禁

- 本轮仅只读审查；没有获得上述新调用点的代码修改授权。
- 不得把此前 helper + P4/recall/graph/event-chain 的授权解释为自动涵盖这七个调用点。
- 下一步建议先启动 Batch A；需负责人明确授权后，GPT 才在隔离分支修改源码，并交由 Memory 智能体本地验证。


---

## 58. Memory Batch A：preference + remembered 统一 current 有效性接入（HANDOFF-0061）

> 代码分支：`feat/memory-validity-unified` @ `5797324175f345ff82337f409d8406e5256ddfc3`
> 专项报告：`MEMORY-REPORT-0008`，报告 commit `08835ca19fbeca1823be4b72b32adc7fac128b14`，blob `06515f1fd05ed54483a98c1cf67025caff3e9749`
> GPT 已重新读取报告、compare 和五个代码文件；测试由 Memory 智能体执行，GPT 未亲自运行 Node 测试。

### 58.1 代码与范围核验

- 基线 `c437c460d8378cbf6493a5e4e12d673c4334d50f` → 验证 HEAD `5797324175f345ff82337f409d8406e5256ddfc3`，GitHub compare：ahead 4、behind 0，恰好四个提交。
- 提交链：`9546471391117c40668049f32bf8800d4aae8b90` → `0edc81ae0c375305ca885ac7027d2ae6c407788f` → `4bd4644653ffa80dd136c192c9335213352ff81b` → `5797324175f345ff82337f409d8406e5256ddfc3`。
- 仅修改四个预期文件：`lib/inject/preference.js`、`lib/inject/remembered.js`、`tests/preference-inject.test.mjs`、`tests/remembered.test.mjs`。
- 四个 blob 与任务预期完全一致；`lib/store/validity.js` blob 仍为 `00c4d948ccb2973d48d95aebb07d230c8f44854c`，未改。
- preference 两路查询复用同一 current validity 对象与时点；remembered 接入 current helper，新增 `now = Date.now()` 默认参数。scope、kind、meta persist、排序、预算、跳过原因和异常返回结构均经报告及代码核对保持。
- 负向对照：恢复旧过滤后，preference 与 remembered 均出现 future / superseded 泄漏并触发测试失败；恢复后定向测试通过。

### 58.2 验证结果

| 项目 | Memory 智能体报告结果 |
|---|---|
| 定向测试 | 2/2，exit 0 |
| 回归测试 | 16/16，exit 0 |
| 全量 `npm test` | **298/298，0 fail，0 skip，exit 0** |
| 负向对照 | 两组均按预期失败；恢复后全绿 |
| `git diff --check` | exit 0 |
| 工作区 | 仅 `?? node_modules` 符号链接；diff为空 |

### 58.3 GPT 复核裁决与残留

- **Batch A：隔离开发验证 PASS。** 这不代表生产验证、主线合并或部署通过。
- 非阻塞 P3：显式传入非法 `now`（如 0/null）时，`validitySql` 的时间戳校验错误被调用方 try/catch 捕获，返回空块/空结构；现有已知调用路径传入 `Date.now()` 或使用默认值。暂不扩大本批次，后续可单独评估入口防御策略。
- 其余 session-index / handoff brief、preference merge、daily、weekly 尚未接入；生产 as-of 仍 NOT RUN。

### 58.4 边界与下一步

- 未写生产 DB、未改生产插件/profile/config；未部署、重启或启动 staging；未合并主开发分支。
- 未修改 EI/Persona、Android、Autonomy 或共享协调文件（本次由 GPT 统一更新）。
- 下一建议批次为 **Batch B：session-index + handoff brief**，但当前尚未获得负责人对 Batch B 的明确授权；继续等待决定。生产验证、主线合并与部署均需独立授权。


---

## 59. Memory Batch B：session-index + handoff brief 统一 current 有效性接入（HANDOFF-0062）

> 代码分支：`feat/memory-validity-batch-b` @ `2a93031db3dfa1a1c7c34b7376aebe395493c57f`
> 基线：Batch A `5797324175f345ff82337f409d8406e5256ddfc3`
> 专项报告：`MEMORY-REPORT-0011`，报告 commit `a8454b87bc3fdd45bbc755dfff532056120599c7`，blob `f04a7ea62df8bed4d8829c20bf29800bf514ef22`
> GPT 复核时间：2026-11-21；本节由 GPT 统一整合。

### 59.1 代码范围与独立核对

- GitHub compare：基线 `5797324175f345ff82337f409d8406e5256ddfc3` → HEAD `2a93031db3dfa1a1c7c34b7376aebe395493c57f`，ahead **11** / behind **0**。
- Tree：`3d5e305ecf53f70b6f6090e4514346b8ce54ef91`。
- 恰好六个文件变更：
  - `lib/store/validity.js` blob `e2be1294e52e33724e1cd8c815dd418b8a883f2b`
  - `lib/inject/session-index.js` blob `e155f1ce1ab147828c381d05532323e2cce0cebc`
  - `lib/handoff/brief.js` blob `e8938ffc924f374d553017263d506472a5cacca0`
  - `tests/validity.test.mjs` blob `f19e124edf6f93b298ab707469ba3e446bab0492`
  - `tests/session-index.test.mjs` blob `3f51f279815337b56e36c3b1605118327ae295e2`
  - `tests/handoff-brief.test.mjs` blob `98b6891a9d5cb8a2c7028e4e7c812598b0dfd452`
- GPT 已实际读取专项报告、上述六个文件及 compare；报告 blob 与指定一致。三业务文件与首验逐字节相同；两项修复测试 blob 与报告一致。
- 独立代码审查确认：
  - session-index episode 使用 `current`；todo 使用 `currentTodoActiveEmpty`，保留 active/空字符串状态域；两者均增加 valid_from、valid_to、superseded_by 过滤。
  - handoff 项目 todo 使用 `currentTodoLegacy`，保留 active/空字符串/NULL 兼容状态域，并保留 project_id 约束；owner 标签统计使用严格 `current`。
  - decisions 表仍独立查询，没有错误接入 memories helper。
  - 原有 owner scope、排序、LIMIT、文本截断、只读行为及 handoff 项目隔离仍保留。
  - validity 测试 fixture 通过 try/finally 清理；session-index 新增 future/superseded todo 的排除断言。
- 三个测试文件均无 SQL `status=NULL` fixture；NULL兼容只由纯 JS 镜像验证，符合 NOT NULL schema。

### 59.2 Memory 智能体隔离测试证据

以下测试由 Memory 智能体在独立 worktree 执行并报告，GPT 未亲自运行 Node 测试：

| 项目 | 结果 |
|---|---|
| session-index 定向 | 1/1，exit 0 |
| handoff brief 定向 | 1/1，exit 0 |
| validity 定向 | 23/23，exit 0 |
| validity 连续三次 | 23/23 × 3，0 fail / 0 skip |
| 七文件相关回归 | 19/19，exit 0 |
| 全量 `npm test` | **300/300 × 3，0 fail / 0 skip，exit 0** |
| 负向对照 | **8/8** 全部按预期失败；恢复后逐字节一致 |
| `git diff --check` | exit 0 |

第三轮复验已覆盖前两轮发现的两个问题：共享 DB fixture 污染通过 finally 清理修复；session-index 对 future/superseded todo 的测试覆盖已补齐。删除 finally 可复现污染；旧过滤会触发新增 todo 断言失败。此前 `doctor.test.mjs` 环境 flake 本轮三次全量均未复现，且该文件不在本批 diff 内。

### 59.3 GPT 裁决与边界

- **Batch B：隔离代码验收 PASS。** 报告证据与 GitHub HEAD/tree/blob/compare 一致，业务实现与兼容状态域通过独立代码审查。
- 这不是生产设备验证，也不代表生产 as-of、集成、主线合并或部署通过。
- 本批没有写生产 DB、修改生产插件/profile/config、部署/重启/staging，也没有合并主线。
- 未接入调用点仍包括 preference merge、daily、weekly；按风险继续分批处理。
- **下一批建议 Batch C：preference merge**，需负责人另行明确授权；Batch B 的授权不自动涵盖 Batch C。
- Android / Autonomy v4 仍为 DESIGN ALIGNED、真实设备验证 NOT RUN；继续保留主线计划，需独立安排与授权。


---

## 60. Memory Batch C：preference merge 统一有效性接入（HANDOFF-0063 · 验证中）

> 代码分支：`feat/memory-validity-batch-c`
> 基线：Batch B PASS @ `2a93031db3dfa1a1c7c34b7376aebe395493c57f`
> 当前代码 HEAD：`906fca93ad92a19dcfe871caf3583596fb72fe2b`
> tree：`3da58899395587f8a37f999a63d4f5945412bdc9`
> 状态：GPT 已完成隔离分支代码修改与只读审查；等待 Memory 智能体独立测试。尚不能标记 PASS。

### 60.1 本批代码范围

GitHub compare：基线 `2a93031db3dfa1a1c7c34b7376aebe395493c57f` → HEAD `906fca93ad92a19dcfe871caf3583596fb72fe2b`，ahead 6 / behind 0；仅四个文件：

- `lib/pref/merge.js` blob `d6d36773a44314030aa8bc65336768c6063e8f6e`
- `lib/store/validity.js` blob `7aabea0efff2b9d5fe40acea19fcc4609f5e87e6`
- `tests/preference-merge.test.mjs` blob `54fc93520937d86c3cfa8d865edc8e0a8923d333`
- `tests/validity.test.mjs` blob `fd00ecff76614f17544e5ac2e244692be38c6089`

### 60.2 当前实现意图

- 新增 `currentPreferenceCandidate` 预设：候选状态允许 active/pending，但必须满足当前 valid_from / valid_to 时间窗并且未被 superseded。
- 候选原有严格约束保留：任何非 NULL `valid_to`（包括未来时间）仍拒绝。
- 旧偏好比较集合改用严格 `current` helper：active + 当前时间窗 + 未被替代。
- 保留 scope_type/scope_id、同极性证据合并、反极性 supersede、pending 激活、冲突队列、revision/CAS、writeTx 事务结构。
- 新测试覆盖 future/expired/superseded 旧偏好、future/superseded/未来 valid_to 候选，以及 pending 候选兼容。

### 60.3 当前验证门禁

- GPT 已核对四个文件 blob、compare 和关键 SQL 参数传递；尚未执行 Node 测试。
- 已交由 Memory 智能体执行 `MEM-VALIDITY-BATCH-C-VERIFY-01`，要求定向/相关回归/全量测试、连续三轮稳定性、八组负向对照、事务与 CAS 核查。
- 等待 Memory 智能体提交 `MEMORY-REPORT-0012`。
- 本批不触碰生产 DB / 插件 / profile / config，不部署、不重启、不启动 staging、不合并主线。
- Batch D（daily）和 Batch E（weekly）不在本轮授权范围；必须另行评估和授权。


---

## 61. Memory Batch C：preference merge 统一有效性接入（HANDOFF-0064 · 隔离代码验收 PASS）

> 代码仓库：`ba-song/dsh-memory-core`
> 分支：`feat/memory-validity-batch-c`
> 基线：Batch B PASS @ `2a93031db3dfa1a1c7c34b7376aebe395493c57f`
> 验证 HEAD：`fecbd09eaa5b5745ef02263b1bd506712c256150`
> Tree：`b770e0b19ce6170c331129dc7f9a731dfcee88f1`
> 专项报告：`MEMORY-REPORT-0013`；报告 commit `6acfdeb6607c0f0c202b917048af3090adfb5429`；blob `79bb4eb19c7d9a646fae1d7b1723478d94e6dca6`
> GPT 复核：2026-11-21；本节由 GPT 统一整合。

### 61.1 代码与提交核对

- 修复前 HEAD：`906fca93ad92a19dcfe871caf3583596fb72fe2b`。
- GitHub compare：ahead **1** / behind **0**，仅 `tests/preference-merge.test.mjs` 一文件，1 insertion / 1 deletion。
- 修复提交：`fecbd09eaa5b5745ef02263b1bd506712c256150`，仅将 expired-valid_to fixture 主题由「咖啡」改为「椰子」，避免与前置 fixture 碰撞。
- 四个文件 blob：
  - `lib/pref/merge.js`：`d6d36773a44314030aa8bc65336768c6063e8f6e`
  - `lib/store/validity.js`：`7aabea0efff2b9d5fe40acea19fcc4609f5e87e6`
  - `tests/preference-merge.test.mjs`：`3907e7d948a743987e14c563a98b1195c43ac3c4`
  - `tests/validity.test.mjs`：`fd00ecff76614f17544e5ac2e244692be38c6089`
- GPT 实际读取报告、四个文件、修复 commit diff 和 compare；核对结果与报告一致。修复 commit 未修改业务代码，前三个未变文件（merge.js、validity.js、validity.test.mjs）与修复前保持一致。

### 61.2 独立隔离测试证据

以下测试由 Memory 智能体在独立 worktree 执行并报告，GPT 未亲自运行 Node 测试：

| 项目 | 结果 |
|---|---|
| 定向 merge + validity | 25/25 × 3，0 fail / 0 skip |
| preference-merge 单文件 | 1/1 |
| 8 文件相关回归 | 42/42 |
| 全量 `npm test` | **301/301 × 3，0 fail / 0 skip** |
| 事务 / CAS / 回滚 | P1–P5 本轮重跑，全部符合预期 |
| 负向对照 | 8 组全部按预期失败，恢复后逐字节一致 |
| `git diff --check` | exit 0 |

如实保留一次受污染运行：E2 负向对照期间 scratch 文件及变异态代码导致一次全量运行 302 项中 1 项失败；scratch 清理并恢复后，连续三次干净全量运行均为 301/301。该污染运行不计入干净 PASS 次数。

### 61.3 GPT 独立代码审查与裁决

- 候选预设 `currentPreferenceCandidate` 允许 active/pending，但要求当前 valid_from/valid_to 时间窗及未 superseded。
- 候选侧继续保留旧契约：任何非 NULL valid_to（包括未来时间）均拒绝。
- 旧偏好比较查询使用严格 current helper。
- scope、同极性证据合并、反极性 supersede、pending 激活、冲突队列、revision/CAS 与 writeTx 事务结构均保留；修复提交本身只改测试 fixture。
- **裁决：Batch C 隔离代码验证 PASS。** 测试证据来自 Memory 智能体报告；GPT 完成 GitHub 报告/代码/提交/compare 的独立核对，未亲自运行 Node 测试。

### 61.4 未执行事项与后续门禁

- 生产 DB / 生产插件 / profile / config 未触碰；生产 as-of 未运行。
- 未部署、未重启、未启动 staging；未合并主开发分支。
- Batch D（daily）与 Batch E（weekly）尚未启动，必须分别评估并取得负责人明确授权。
- EI/Persona、Android、Autonomy 未被本批触碰。Android / Autonomy v4 设计对齐继续保留项目主线，真实设备验证仍 NOT RUN，需另行安排与授权。
- 本 PASS 仅代表 Batch C 隔离代码验收，不代表生产验证、集成、主线合并或部署通过。


---

## 62. Memory Batch D：daily 日结去重候选接入 current validity（HANDOFF-0065 · IMPLEMENTED / VERIFYING）

> 仓库：`ba-song/dsh-memory-core`
> 分支：`feat/memory-validity-batch-d`
> 基线：Batch C PASS @ `fecbd09eaa5b5745ef02263b1bd506712c256150`
> 当前 HEAD：`5500d04e0e49ebb8168e7356de3c082a9e0e722e`
> 代码提交：`7684b1fef57202d9dc44ec8fcafd571779f94265`（daily 接入）
> 测试说明提交：`5500d04e0e49ebb8168e7356de3c082a9e0e722e`（仅澄清测试标题）
> GPT 复核：2026-11-21；测试尚待 Memory 智能体执行。

### 62.1 范围与文件

- compare 基线 `fecbd09eaa5b5745ef02263b1bd506712c256150` → HEAD `5500d04e0e49ebb8168e7356de3c082a9e0e722e`：ahead 2 / behind 0；仅两个预期文件。
- `lib/consolidate/daily.js` blob `394138a185d176e87b789ca23c51f5d1ae16fa13`
- `tests/consolidate.test.mjs` blob `2ce8f5227f896a84261657982111603eea9ba064`
- 新增导出 `loadDailyDedupCandidates(db, at)`，内部调用 `validitySql({at:Number(at),preset:'current'})`。
- daily 相似去重候选仍保留原有 90 天 created_at_epoch 下限、id DESC、LIMIT 500 和选择列；额外要求 current 状态、valid_from、valid_to、superseded_by 均符合 helper。
- 正式写入阶段的 exact-text duplicate guard、LLM、style 文件、dryRun 报告、facts/lessons/shortterm/profile/meta 写入路径均未修改。
- 新测试使用独立临时 DB 覆盖有效记录、valid_from NULL 旧记录、future valid_from、expired valid_to、superseded、archived、90 天窗口外记录，并验证倒序。

### 62.2 GPT 静态复核

- GitHub compare：ahead 2 / behind 0，恰好 `daily.js` 与 `consolidate.test.mjs` 两个文件。
- HEAD 与两个 blob 已从 GitHub 回读核对；未修改 helper、weekly 或其他调用点。
- 仓库树未发现根目录 AGENTS.md。
- GPT 未运行 Node 测试；当前状态 **IMPLEMENTED / VERIFYING，不是 PASS**。

### 62.3 验证要求与边界

- 由 Memory 智能体在隔离 worktree 验证：`tests/consolidate.test.mjs`、`tests/validity.test.mjs` 定向测试；相关回归；全量 `npm test`；负向对照验证 future/expired/superseded 均会被旧 status-only 查询重新放入候选集；恢复后逐字节一致。
- 不得修改代码或测试；不得修改共享 HANDOFF/REPORT（由 GPT 统一维护）。
- 不写生产 DB，不修改生产插件/profile/config；不部署、重启、启动 staging；不合并主线；不处理 weekly / EI / Persona / Android / Autonomy。
- Batch E（weekly）仍需独立评估和授权。Android / Autonomy v4 设计对齐及真机验证计划继续保留，不因 Memory 批次而搁置。


---

## 2026-11-21 16:13 · GPT 统筹复核 · HANDOFF-0066（Batch D PASS）

### Memory Batch D：daily 日结去重候选接入统一 current validity

- 仓库：`ba-song/dsh-memory-core`
- 分支：`feat/memory-validity-batch-d`
- Batch C PASS 基线：`fecbd09eaa5b5745ef02263b1bd506712c256150`
- 验证 HEAD：`5500d04e0e49ebb8168e7356de3c082a9e0e722e`
- tree：`836b260faeed0f5e0540f7d735542a4c491eb455`
- compare：ahead 2 / behind 0；仅 `lib/consolidate/daily.js`、`tests/consolidate.test.mjs` 两个文件变化。
- daily.js blob：`394138a185d176e87b789ca23c51f5d1ae16fa13`
- consolidate.test.mjs blob：`2ce8f5227f896a84261657982111603eea9ba064`
- validity.js blob：`7aabea0efff2b9d5fe40acea19fcc4609f5e87e6`（未改）
- Memory 专项报告：`MEMORY-REPORT-0014`；报告 commit `2f4246f4105ae92777adacfcb5ffc94331c448ef`；blob `ec1bb3309eda3e4f545ed85801c01ed05eee48cd`。

GPT 实际读取专项报告、daily.js、测试文件、validity.js、最终提交 diff 与 compare。独立复核确认：

1. `loadDailyDedupCandidates(db, at)` 使用 `validitySql({at:Number(at),preset:'current'})`；调用方传入的 `until` 与该查询使用同一时间基准。
2. SQL 绑定顺序为先 90 天下限、再 helper 的两个时间参数；未错位。
3. SELECT 投影、`ORDER BY id DESC`、`LIMIT 500` 和原 90 天窗口保留。
4. helper 只作用于相似度去重候选；正式写入阶段 exact-text duplicate guard 仍独立存在。
5. LLM、style、dryRun、facts/lessons/shortterm/profile/meta 后续路径没有在本批次 diff 中改动。
6. 新测试使用独立临时 DB，覆盖 current、legacy NULL valid_from、future、expired、superseded、archived、90天窗口和倒序。

Memory 智能体报告的隔离测试证据（GPT未亲自运行 Node 测试）：

- 定向 consolidate + validity：28/28 × 3。
- consolidate 单文件：4/4。
- 五文件相关回归：47/47。
- 全量 `npm test`：302/302 × 3，0 fail、0 skip、exit 0。
- 四组负向对照全部按预期失败；恢复后逐字节一致。D2/D3 首次整段删除变异触发占位符/参数数量错误，随后采用保留占位符的语义变异，确认对应 future/expired 断言失败。

**GPT 裁决：Batch D 隔离代码验证 PASS。**

### 状态边界与下一步

- PASS 仅代表 Batch D 隔离代码验证，不代表生产验证、设备验证、集成、主线合并或部署。
- 未写生产 DB，未修改生产插件/profile/config；未部署、重启或启动 staging；未合并主线。
- Batch E（weekly）尚未开始，必须单独审查并等待负责人明确授权；本次 Batch D 授权不延伸至 Batch E。
- 生产 as-of、生产验证、主线合并和部署仍需独立评估与授权。
- EI/Persona、Android、Autonomy 未触碰；Android/Autonomy v4 设计对齐及后续真实设备后台恢复验证继续保留在整体计划中，不因 Memory 主线推进而搁置。


---

## 2026-11-21 16:25 · GPT 统筹实施 · HANDOFF-0067（Batch E IMPLEMENTED / VERIFYING）

### Memory Batch E：weekly 周结候选统一有效性与事务/CAS 加固

- 仓库：`ba-song/dsh-memory-core`
- 分支：`feat/memory-validity-batch-e`
- 基线：Batch D PASS @ `5500d04e0e49ebb8168e7356de3c082a9e0e722e`
- 当前实现 HEAD：`e3976101a14356819a15d09b69ee4328f194887b`
- compare：ahead 4 / behind 0；仅 `lib/consolidate/weekly.js`、`tests/weekly.test.mjs` 两个文件变化。
- 实现提交：`1bcd2f3f3dbbdcb09a109e81a6d86fec29ca87fb`
- 测试提交：`4cefcaba79fc5f6e8dc121545fbf10aa569ab60c`
- weekly.js blob：`61083aaaaff3fbc6927490045a92246ee9b1d05f`
- weekly.test.mjs blob：`42f0234bb5475c740dcdc6c451de7c498659f2b0`

实施内容：

1. 新增 `loadWeeklyCandidates(db,{at,since})`，使用统一 `validitySql({at,preset:'current'})`；保留原 lookbackDays、auto layer、fact/preference/relation kind 域及 ID ASC 顺序。
2. dry-run 与 apply 使用同一有效候选集；排除 future valid_from、expired valid_to、superseded、archived 等非 current 记录，同时兼容 valid_from NULL 的旧记录。
3. apply 在 `BEGIN IMMEDIATE` 后重新读取 keeper/member，复核 current validity、layer、kind、lookback 和扫描时 revision；过期/被替代/修订变化的候选不会沿用事务外旧快照执行。
4. 每个 member 先写 revision snapshot，再通过带 revision 与统一 current predicate 的 UPDATE CAS 改为 superseded、写 superseded_by、revision+1、updated_at、valid_to、temporal_kind。
5. 移除原有 catch 后退回 status-only 的静默降级路径。缺少 revision 表、写入失败或 CAS 未命中时整体 rollback 并返回失败，不允许留下无历史快照的部分状态迁移。
6. keeper importance 更新也带 revision/current 条件；只有本簇确实有 member 成功 supersede 时才提升 keeper importance。
7. 新增测试覆盖 current/future/expired/superseded/archived/lookback/layer/kind 候选边界、revision 表缺失失败关闭、CAS 未命中整体回滚，以及 future valid_to 被收敛到实际 supersede 时刻且快照保留旧值。

GPT 已从 GitHub 回读两个目标文件、最终提交 diff 和 compare。当前为 **IMPLEMENTED / VERIFYING**；GPT未运行 Node 测试，尚未授予 PASS。

下一步等待 Memory 智能体独立复验：核对 HEAD/tree/blob/工作区；weekly 定向测试与 validity 测试连续运行；周结 apply、缺表 rollback、CAS rollback；相关回归与全量 npm test；对 validity 谓词、SQL 参数顺序、事务边界、snapshot/revision/valid_to、失败路径做代码审查和负向对照。

边界：仅隔离开发分支。未写生产 DB、未修改生产插件/profile/config；未部署、重启、启动 staging；未合并主线。Batch E 验证通过前不进入 A–E 统一集成。
