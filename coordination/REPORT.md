# REPORT-0008 · EI-0 PASS 后的 EI-1 纯函数层首轮实现与源码审查
## 2026-11-21 · GPT 开发分支工作记录

> 依据：HANDOFF-0050 / REPORT-0007；EI-0 REVIEW PASS（有条件）。
> Persona 基线：ba-song/dsh-persona-core@a84c7badd1e6c971a66b6c39dd4f7ab795df4b90。
> 实施分支：feat/ei1-emotion-composition；当前 HEAD：5813a769974972a112d3dd8df5f32773746f01e0。
> 本轮仅在 Persona GitHub 开发分支新增纯函数模块与测试，并更新协调文档；未改 main、未改生产/DSHA 文件、DB、profile/config，未部署/重启。

## 1. DSH HANDOFF-0050 反馈裁定
- EI-0 REVIEW PASS（有条件）接受；允许开始 EI-1 纯函数层，不代表 EI-2/EI-3 契约完成。
- 345 条旧 episode 的默认 confidence=0.5 是真实兼容风险。新阈值不能回溯套用；未来集成必须显式识别 legacy 并 grandfather，或仅对新 appraisal 应用阈值。禁止静默改变旧 episode 激活状态。
- `emotion_appraisal_items`、Persona outbox / Memory inbox、target namespace、`emotion_contract_version`、Link FK/失效规则均列为 EI-2/EI-3 前置条件；本轮不实现。
- API schema 字段采用 `emotion_contract_version` 而非复用 DB `schema_version`；本轮纯函数模块尚不暴露服务 API。

## 2. 基线源码复核
- `lib/emotion.js` 的 `activeEpisodes()` 当前按 `expires_at > now` 读取，按 `half_life_s` 衰减，强度低于 0.15 排除，并按强度降序。
- 现有 `composeEmotionView()` 仍只选择第一个（最强）episode，最终输出单一 label/intensity/episode；本轮没有改写或接入它。
- `lib/appraisal.js` 当前 prompt/parser 仍以单 `emotion` / `intensity` / `target` 为主；本轮不修改 appraisal LLM schema。
- `lib/db.js` 当前 `emotion_episodes` 保留 `appraisal_id INTEGER NOT NULL DEFAULT 0`；`emotion_appraisal` 仍是单 emotion 行。无数据库结构变更。
- `package.json` 的测试脚本为 `node --test tests/*.test.mjs`；新增测试文件会被 glob 收集，无需改 package.json。

## 3. EI-1 首轮代码
新增文件：
- `lib/emotion-compose.js`（blob `2f6bf2d2aa2298ddad4270c6c58680974eb28233`）：
  - `classifyEmotionConfidence()`：active_candidate / appraisal_only / uncertain / unknown；缺失 confidence 不伪造为 1。
  - `composeEmotionEpisodes()`：纯函数、无 DB/IO；按 experiencer + target + label 合并；强度取最大衰减值，不求和；正负情绪不抵消；过期/低于强度地板的 episode 不进入 active projection。
  - 新数据按可配置阈值分类；只有显式 `legacy: true` / `isLegacy: true` 才 grandfather，不会自动把 confidence=0.5 当新数据激活。
  - primary 按 intensity×confidence 排序，随后强度、置信度、时间和稳定字符串键 tie-break。
  - sourceIds 保留并排序，保证来源顺序确定；展示默认最多8项，但 `allEmotions` 保留完整集合并提供 total/hasMore。
- `tests/emotion-compose.test.mjs`（blob `bc20446fa07df22e2cbea5b1c85125297eff4710`）：覆盖 confidence 分类、重复标签 max merge、target 隔离、正负并存、过期/衰减、legacy grandfather、确定性排序/分页元数据、非法参数。

## 4. 变更边界
- 仅新增 `lib/emotion-compose.js` 和 `tests/emotion-compose.test.mjs`；没有改动 `lib/emotion.js`、`lib/appraisal.js`、`lib/db.js`、`lib/service.js`、注入或现有 API。
- 不会改变现有 composeEmotionView / state / emotionLine / emotionActHint 的运行行为；未接生产路径。
- 本轮代码是 EI-1 纯函数首稿，仍需 DSH 在 DSHA 环境运行新增测试和完整 Persona 测试套件，再反馈边界问题。

## 5. 测试与验证状态
- GitHub 文件创建/更新：完成；已重新 fetch 两个文件并核对 blob SHA。
- 本轮尝试在当前执行容器运行 Node 测试，但运行环境无法解析 `raw.githubusercontent.com`（网络 DNS 不可用），未能取回代码执行。
- EI-1 新增测试：NOT RUN（未声称通过）。
- Persona 全量测试：NOT RUN。
- DSHA 本地/运行时测试：NOT RUN。
- CI：尚未触发/未验证。
- EI-2/EI-3、DB migration、P0 staging、生产写入/部署：NOT RUN。

## 6. 下一步
1. DSH 从 `feat/ei1-emotion-composition` 拉取精确 HEAD `5813a769974972a112d3dd8df5f32773746f01e0`，先运行新增测试，再运行完整 Persona test suite。
2. 重点复核：legacy 显式标记的接入契约、confidence 缺失行为、target/experiencer 命名、同标签来源保留、确定性排序、过期处理和全量分页。
3. DSH 只报告实测证据；不得把模块接入生产 `composeEmotionView`，不得修改 DB/appraisal/API/profile，不得部署/重启。
4. GPT 根据反馈修复开发分支；测试通过后再考虑把纯函数层接入隔离测试路径。

## 7. 副作用
- GitHub 仅创建开发分支并新增/更新两个文件；main 未变。
- Persona 生产源码/DB/profile/config：未变。
- Memory 源码/DB：未变。
- staging/host/deploy/restart：未执行。