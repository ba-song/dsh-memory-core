# REPORT-0002 · P0 staging v5 PASS + Persona Emotion Intelligence 源码审查与计划
## 2026-11-20 · GPT 静态源码审查 · 基于 HANDOFF-0044

> 本报告覆盖两项工作：记录 DSH 对 P0 staging plan v5 的最终复核结论；记录 dsh-persona-core 第一轮只读源码审查，并把 Emotion Intelligence 纳入长期计划。
> 本轮未修改 Persona 源码、未运行测试、未读取/修改 DSHA 本地生产文件或数据库、未创建 staging、未部署、未重启。

## 1. P0 staging plan v5 复核结论

**PLAN V5 REVIEW PASS（仅设计/静态复核）**，依据 DSH HANDOFF-0044 与 REPORT-0001。

- HANDOFF-0044 commit：`cd20bee1a627b420fe9af582c43e217229cb4310`
- HANDOFF blob：`600237b9e9c9abfe2767d6b1ebee92b36d40b747`
- REPORT-0001 blob：`b7e9b9804ce8bf3cf6875e9a4e2a020e1af986be`
- Memory 候选开发 HEAD：`7548e49ed0b8d8673818464325d8e72ec7704b27`
- CI #90 run：`44751203163`，success。

PASS 仅表示计划设计和静态复核通过，可进入下一阶段 staging；不代表 staging 实测通过，也不构成生产部署授权。

### 尚待隔离 staging 实测
- 在 staging HOME/DSH_HOME 中执行 web bundle add → 候选 link，并检查精确 bundles、symlink/realpath、loader 解析来源；
- npm ci / ONNX session；
- schema4 fixture 迁移、失败回滚、DSHA SQLite 3.53.3；
- WAL/checkpoint/VACUUM INTO/恢复；
- host/端口/Cordis 注册次数/strace 路径审计；
- exporter 行为。
  
DSH 报告指出 web bundle add 可能依赖 pnpm registry；离线或 registry 不可用则停止并标记 BLOCKED，不得修改生产配置。当前未获用户对 staging 实施的明确授权，本轮不启动 staging。生产 DB/profile/config、部署和重启仍未授权。

## 2. Persona 源码审查范围与基线

仓库：`ba-song/dsh-persona-core`  
默认分支：`main`  
最新提交（GitHub commit search）：`a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`  
package：`dsh-persona-core@0.2.0`  
README 文档核对日期：2026-11-07；README 记载当时测试基线 233/233。**本轮没有运行测试，不能把该历史测试数当成本轮验证结果。**

只读检查文件及 Blob：
- `README.md` — `306857032e0814b33bca3c028a7caab538f9ee03`
- `package.json` — `75a936702964e5efdc73b04b77f30b1f333ea6c6`
- `lib/index.js` — `46d81fa21b4026890e1bac393db9db4c57b98912`
- `lib/emotion.js` — `2bf885639dac5c2b243e0d4f9d3b09eb0ba7189f`
- `lib/db.js` — `238e9baeb6ca44176c5cb8c97b994bbe45c28617`
- `lib/appraisal.js` — `f0e8c04863fa81e1180714d5bccc1e818d689f7f`
- `lib/relationship.js` — `ea70a2cac4442153f3cc32cea4b6ff6ee67aa888`
- `lib/service.js` — `02cd961807099e26955f2b22eb17a44ff87842e1`
- `lib/config.js` — `6e7ff8e5deec9f52d2bfa081ac19bb46820fce20`
- `lib/axes.js` — `8c58e4b2cbcfffb9719b09c745381e6d4292ed4b`
- `tests/p1a-events.test.mjs` — `93565fc9a016b021b4e50581d46180d0df34cd20`
- `tests/p0-concern-energy.test.mjs` — `288e39925d87a96cce9325dee5e9f03a32434b99`

## 3. 现有能力（源码直接证据）

### 3.1 情绪不是空白模块，已有多层基础
- `emotion_state` 保存 valence、arousal、certainty、label、intensity、confidence、energy、social、dominance、mood_valence、mood_arousal、strategy_json 等。
- `emotion_timeline`、`emotion_points` 保存状态曲线与转折点。
- `emotion_event`、`emotion_appraisal`、`emotion_episodes` 已构成事件→评估→情绪 episode 的结构化记录。
- `emotion.js` 有词典打分、平滑、valence/arousal/mood/dominance 衰减、单条变化上限、episode 半衰期、活跃 episode 查询。
- `appraisal.js` 有结构化 LLM appraisal，字段包括 emotion、intensity、valence、arousal、target、cause、strategy 和 attunement；失败回退规则/不阻塞回复。
- `index.js` 在启用 ingest 时监听会话事件；LLM appraisal 异步运行，成功后记录 episode/appraisal 并写表达策略。
- `relationship.js` 按 peer 维护 trust/warmth/familiarity/tension 关系轴；`emotion_appraisal` 有 intent/user_cue/uncertainty/avoid_json。
- `service.js` 已暴露 `emotionAt(at, window)` 和 `emotionTimeline({from,to,limit})`，README 明确说明供 Memory 回填时间点附近的情绪。

### 3.2 与用户图示的关键差距
1. **复合情绪目前没有真正合成输出。** 数据库可以存多条活跃 episode，但 `composeEmotionView` 取强度排序后的第一条（最强一条）决定单一 label；其他同时活跃情绪不构成多维复合状态。
2. **LLM appraisal 当前每次输出一个 emotion 字段。** parser 的 emotion 是单值枚举，未定义并行 emotions[]、各情绪独立强度/置信度。
3. **六种基础情绪没有作为统一、版本化的基础情绪向量模型。** 当前有 PAD 风格连续维度、若干中文展示标签、内部 emotion code 与特殊情绪映射，但它们不是同一套正式 ontology。
4. **没有看到图示的安全区/消散区记忆粒子生命周期。** Persona 有 episode 衰减/过期；这不是 Memory 的记忆保留、摘要、检索优先级或归档策略。不可把情绪 episode 到期误当成原始记忆删除。
5. **Persona 提供时间点情绪回填接口，但本轮未确认 Memory 消费端完整实现。** 需在下一轮跨仓库审查 Memory 的调用方，确认写入/检索是否保留情绪多标签及其来源。
6. **关系轴已存在，但情绪 appraisal 与关系轴推进之间的粒度仍是每次事件的单一 emotion/intensity 输入。** 可评估是否把复合情绪摘要作为附加信号，而不是直接改变关系计算。

## 4. 对图示“情绪组合数量”的校正

图中组合分组按六种基础情绪的无序子集计算：
- 两两：C(6,2)=15
- 三三：C(6,3)=20
- 四四：C(6,4)=15
- 五五：C(6,5)=6
- 六种全有：C(6,6)=1

因此图中列出的复合组合合计 **57 种**，不是 56 种；若再把六种单独基础情绪计入，则是 63 种非空子集。

工程上不应把 57/63 当作汐的情绪上限或穷举 enum。它们只是组合数学上的离散子集，不代表所有组合都心理有效。推荐采用可扩展情绪向量/集合，六种基础情绪作为可解释的基础维度，同时允许新增情绪、混合情绪、连续强度、置信度和未知/不确定状态。

## 5. 新增长期专题：Emotion Intelligence（情绪智能系统）

目标：让汐能够识别、并存、表达、追踪和反思复杂情绪，并在记忆中建立可追溯关联；情绪可影响表达和关注方式，但不能替代事实判断，也不能用情绪操控用户。

### EI-0：契约与现状冻结（下一步）
- 定义基础情绪 ontology：六种基础情绪作为参考维度；保留现有内部 emotion codes 和中文 label 的兼容映射。
- 定义复合情绪表示：`emotions[]`，每项含 code、intensity、confidence、target、cause/source、valid_from、half_life/decay policy。
- 明确一个事件可同时产生多个情绪；允许正负情绪并存；不把组合枚举硬编码成上限。
- 分离 raw PAD/mood/dominance 状态、瞬时情绪 episode、复合情绪视图、表达策略。
- 保留旧 `label`、`intensity`、旧工具输出和 `dyPersona` 服务兼容字段；新字段以 additive 方式引入。
- 明确区分“汐自身情绪”“对主人/对象的关切”“对工具/任务的挫折”等 target，避免把用户情绪直接镜像成汐自己的情绪。

### EI-1：纯函数复合情绪引擎（不迁移 DB）
- 将多个活跃 episode 合成为排序稳定的多情绪视图，而不是只选最强一项。
- 输出 dominant emotion + coexisting emotions + intensity/confidence + target；对外注入仍按预算生成简短、自然语言摘要。
- 支持时间衰减、不同 emotion 独立半衰期、低置信过滤、冲突并存和相反情绪并存。
- 先以纯函数实现并做固定时钟单测，不改变现有写入和生产 schema。

### EI-2：Appraisal 多标签扩展
- 评估器从单一 emotion 扩展为可选 `emotions[]`，每项独立强度/置信度/目标/原因。
- 解析器对未知标签、缺字段、越界值、重复标签、冲突目标做严格归一化；LLM 失败继续回退旧规则。
- 先 shadow/dry-run 对照旧单标签结果，不立即影响注入或人格行为。
- 评估成本、延迟、超时、错误率和误判率；不能因多标签增加阻塞主回复。

### EI-3：情绪—记忆关联（跨仓库接口）
- 以稳定 event/source_ref/msg_ref 与 Memory raw/episode/memory id 建立可追溯关联。
- Memory 检索可使用情绪标签作为可选召回信号；关键词/语义仍是主检索，不让情绪相似性压过事实相关性。
- 回忆时返回当时情绪快照及来源，不把当前情绪覆盖成历史情绪。
- 情绪状态衰减与记忆保留严格分离：安全区/消散区只作为待验证的记忆重要度/摘要/检索策略概念；不得自动删除 raw 原话或永久档案。
- 明确用户撤回、记忆 tombstone、隐私和 source lineage 的兼容要求。

### EI-4：关系与人格成长
- 研究 peer-specific emotion、关系轴、grievance/attunement 的联动；情绪只能作为带置信度的输入，不直接单次改写长期性格。
- 将情绪反思转为 suggest-only 成长建议；多次证据、跨场景稳定性和主人批准后才可提出人格/技能调整。
- 不自动把一次强烈情绪固化成性格事实。

### EI-5：验证与渐进启用
- 纯函数单测、DB schema/迁移测试、兼容性测试、旧数据回归、模拟情绪冲突/混合情绪/时序边界/低置信/重复事件/重放测试。
- 性能与 token budget；服务降级、旧客户端兼容、回滚路径。
- 先开发分支 + 隔离 fixture + shadow mode；生产迁移/启用/重启必须另行授权。

## 6. 推荐的数据/接口草案（待进一步审查，不是最终 schema）

建议先设计逻辑契约，不立刻决定是否新增表：
```ts
type EmotionSignal = {
  code: string
  intensity: number       // 0..1
  confidence: number      // 0..1
  target: 'self' | 'owner' | 'peer' | 'tool' | 'task'
  cause?: string
  source: 'rule' | 'llm' | 'self_report' | 'event'
  at: number
  halfLifeMs?: number
}

type CompositeEmotion = {
  signals: EmotionSignal[]
  dominant: string | null
  valence: number
  arousal: number
  mood?: { valence: number; arousal: number }
  uncertainty: number
}
```

这是方案讨论用的逻辑类型，不代表已经实现。需先检查现有 emotion_appraisal/event/episode 字段是否足够承载，尽量增量兼容而非重复造表。

## 7. 第一轮审查结论与下一轮工作

**结论：现有 Persona 情绪子系统有可复用基础，不需要推翻重做；最大缺口是多情绪并存的表达/合成，以及与 Memory 的可追溯关联尚未在本轮端到端确认。**

GPT 下一步：
1. 完成 Persona 源码第二轮审查：检查 emotion.js 全部打分/状态转换、DB schema/migrations、appraisal/index 异步竞态、关系轴、注入预算、所有相关测试；
2. 审查 Memory 调用 `dyPersona.emotionAt/emotionTimeline` 的真实路径与 raw/episode 写入/recall 结构；
3. 形成正式 EI-0 契约和分阶段开发任务，之后才考虑改开发分支代码。

DSH 下一步只读核对：
1. 读取最新 HANDOFF 全文与本 REPORT-0002，核对 Blob SHA/commit；
2. 在 DSHA 本地只读核对已安装 `dsh-persona-core` 的实际版本、HEAD/同步 manifest 与 GitHub `a84c7ba...` 是否一致；若不一致列出差异；
3. 不运行迁移、不执行测试、不改生产 DB/profile/config、不重启、不进入 P0 staging；
4. 如能只读确认 Memory 侧消费 `emotionAt/emotionTimeline` 的实际调用点，提供路径、行号、原始代码片段；否则明确 NOT VERIFIED；
5. 更新 HANDOFF + REPORT，按当前协作协议执行 SHA/并发保护，并把完整结果交负责人转 GPT。

## 8. 本轮未执行清单与副作用

- Persona 源码修改：NOT RUN
- Persona 测试：NOT RUN（233/233 是 README 记载的历史基线）
- DSHA 本地版本/文件核对：NOT RUN
- Memory 调用端审查：NOT RUN
- EI 数据迁移：NOT RUN
- staging：NOT RUN
- 生产 DB/profile/config 修改：NOT RUN
- 部署/重启：NOT RUN

本轮仅 GitHub 只读读取源码；接下来文档同步只修改 `coordination/HANDOFF.md` 与 `coordination/REPORT.md`。
