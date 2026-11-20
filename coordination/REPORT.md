# REPORT-0003 · Persona 本地核对与 Memory 情绪数据流
## 2026-11-20 23:10 · 只读 · HANDOFF-0046

> 依据：HANDOFF-0045（commit `9837765...`，blob `d86db7e9...`）、REPORT-0002（blob `fd416895...`）
> Persona GitHub 基线：`a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`（0.2.0）
> Memory 开发 HEAD：`7548e49ed0b8d8673818464325d8e72ec7704b27`
> 本轮未修改 Persona/Memory 源码或生产 DB；未启动 staging；未部署/重启。

## 1. Persona 本地版本核对

| 项 | 结果 |
|---|---|
| 安装路径 | `/root/.dsh/plugin-src/dsh-persona-core` |
| package name/version | `dsh-persona-core` / `0.2.0` |
| Git HEAD | **无法读取（无 .git）** |
| 与 GitHub 基线文件数 | 本地 71 / GitHub 71 |
| 全文件 SHA256 对比 | **71/71 完全一致，diff exit 0** |
| 本地同步 manifest | `MANIFEST.legacy.md` 记录 0.2.0 / 71 文件；`.last-sync` 2026-11-20 22:01:08 CST |
| 本地未提交修改 | 无 Git 可判断；按文件哈希与 GitHub 基线一致，未发现差异 |

证据：
- `/root/.dsh/plugin-src/dsh-persona-core/package.json`
- `/tmp/audit/persona`（GitHub a84c7ba clone）
- `/tmp/persona-local.sha`、`/tmp/persona-gh.sha`
- 关键文件哈希一致，例如 `lib/emotion.js` = `0204aee9...`、`lib/service.js` = `6b127216...`。

结论：**本地安装与 GitHub a84c7ba 基线一致（文件级证据）**；没有 Git HEAD 证据，不能声称“git 完全干净”，只能声称“71 个文件逐一哈希一致”。

## 2. Memory 情绪接口真实调用链

### 2.1 写入/快照
- `lib/ingest/archive.js:244 snapshotEmotion(rawId, at)`：
  - 优先 `persona.emotionTimeline({from: at-24h, to: at, limit:1})`；
  - 否则 `persona.emotionAt(at,{windowMs:24h})`；
  - 写入 `raw_emotion_archive(raw_id, at, label, valence, arousal, certainty, intensity, source='live', created_at)`。
- 触发点：`lib/ingest/archive.js:494`，仅 `type === 'assistant/message' && this._firstSelfId` 时调用。
- `raw_emotion_archive` 建表：`lib/ingest/archive.js:183`。
- `lib/service.js addEpisode` 的 `meta`（约 `:311`）**不包含 emotion 字段**；episode 不保存情绪。

### 2.2 读取/展示
- `lib/inject/anchors.js:569 emotionAtTime()`：
  - `persona.emotionAt` 优先；
  - 否则 `persona.emotionTimeline`；
  - 最后退化到 memory 自己的 `emotion_timeline`。
- `lib/inject/context-blocks.js:70-81` 用 `emotionTimeline`/`emotionAt` 给命中上下文附“心情”。
- `lib/archive/tools.js:105-107`：展示 raw 命中时，先查 `raw_emotion_archive`，没有再用 `persona.emotionAt`。
- `lib/index.js:702/1390` 把 `dyPersona` 传给 `searchArchive/provenance`。

### 2.3 生产只读计数
- `raw_emotion_archive`：**1,957** 行；
- `memories` episode：**69** 条；
- episode meta 含 emotion：**0**；
- memory 遗留 `emotion_timeline`：**10** 行，`emotion_state` 1 行，`emotion_points` 1 行。

## 3. 结论与缺口

### 已确认
- Memory 确实消费 Persona 的 `emotionAt`/`emotionTimeline`，并持久化到 raw 级 `raw_emotion_archive`；
- 每条 raw 记录的“当时情绪”可按 `raw_id` 查回；
- 检索/上下文展示会带情绪（阈值 0.35），但**不作为召回主信号**；
- Persona 服务不可用时，`addEpisode` 会拒绝写入（`service.js`）。

### 缺口
1. **episode/memory 不保存情绪**：`addEpisode` meta 无 emotion，69 条 episode 的 meta 中 0 条含情绪；
2. **只对 assistant 消息快照**：用户消息、工具结果、自主行动结果不会触发 `snapshotEmotion`；
3. **当前/历史混淆风险**：`snapshotEmotion` 用 24h 窗口取“最近一条”，如果当时没有精确时间线，可能把较近/当前情绪挂到旧消息；`emotionAtTime` 也是窗口近似；
4. **无情绪召回信号**：recall 由 FTS/vector/entity/关键词驱动，情绪只用于展示；`maintain/factors.js` 的 `emotionFactorOf` 读 `meta.emotionIntensity`，但 episode 未写入该字段；
5. **多情绪未落地**：`composeEmotionView()` 仍只选一个 episode（`lib/emotion.js:774-812`），LLM appraisal 仍是单 `emotion`；
6. **Memory 自己的 emotion_timeline 只有 10 行**，主要是遗留/回退，不是完整历史。

## 4. Emotion Intelligence 计划确认

保留 EI-0 至 EI-5，不删减：
- EI-0 逻辑契约；EI-1 复合情绪引擎；EI-2 appraisal 多标签；EI-3 情绪—记忆关联；EI-4 关系/人格成长；EI-5 测试/渐进启用。
- 六基础 + 57 组合共 63 非空组合是参考维度，不是上限；允许扩展情绪类型、正负共存。
- 衰减/episode 过期不删除原始对话/永久档案/历史记忆；情绪只影响表达、关注、反思，不替代事实判断。

## 5. 状态

| 项 | 状态 |
|---|---|
| Persona 本地版本/文件哈希 | PASS（71/71 与 a84c7ba 一致） |
| Persona Git HEAD | BLOCKED（安装目录无 .git） |
| Memory 情绪写入 raw | PASS（代码+1,957 行） |
| Memory episode 情绪 | FAIL/缺口（0 条 meta） |
| Memory 召回使用情绪 | FAIL/缺口（仅展示） |
| 多情绪视图 | FAIL/缺口（compose 只选一个） |
| 运行时 end-to-end 情绪测试 | NOT RUN |
| 生产写入/部署 | NOT RUN（禁止） |

## 6. 副作用

只读文件/DB；未改 Persona/Memory 源码、profile/config、生产 DB；未启动 staging/host；未部署/重启。
