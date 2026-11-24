# PERSONA-READINESS-AUDIT-2026-11-24

> 归档：GitHub `ba-song/dsh-memory-core` → `docs/audit/`
> 来源：Persona 第一轮实机测试准备只读检查（2026-11-24 13:30 Asia/Shanghai）
> 原审查报告：`coordination/agent-reviews/persona/first-device-test-readiness/REVIEW-REPORT.md`
> 性质：只读准备审计；未修改人格/身份/价值观/参数；未部署/重启；未写真实成长记录。

---

# Persona 第一轮实机测试准备 · 只读检查报告

> 任务：DSHA「汐」第一轮实机测试准备（Persona）
> 时间：2026-11-24 13:30 (Asia/Shanghai)
> 性质：只读检查；未修改人格文件/身份/价值观/人格参数；未触发成长/迁移/重置；未写真实成长记录；未部署/重启；未触碰生产写。
> 结论：**READY WITH CONDITIONS**（只读身份/人格观察可做；带对话/注入/情绪写入的实机测试 **BLOCKED**，需隔离 dataDir/profile）
> 代码基线：Persona main `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；实机安装 `dsh-persona-core@0.2.0`

---

## 1. 当前版本与部署状态

| 项 | 证据 |
|---|---|
| GitHub Persona main | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`；`package.json` version `0.2.0` |
| 实机安装路径 | `/root/.dsh/plugin-src/dsh-persona-core`（非 git 目录） |
| 实机版本 | `package.json` version `0.2.0` |
| 实机源码与 main 对比 | `diff -rq`（排除 node_modules/.git）**无差异**；安装与 main 同源同内容 |
| 宿主进程 | `/usr/local/bin/node .../dsh/lib/bin.js web --host 127.0.0.1 --port 38105`，PID `30172` |
| 宿主已打开 Persona DB | `/proc/30172/fd` 指向 `/sdcard/DSHA/人格/数据/persona.db`、`-wal`、`-shm` |
| Profile | `/root/.dsh/profiles/web/cordis.patch.yml`：`id: persona-core`、`name: dsh-persona-core`，`dataDir: /sdcard/DSHA/人格/数据` |
| 插件配置关键项 | `inject.mode: full`；`sessionDirs`: home、`/sdcard/DSHA/渠道`、douyin；`emotion.ingestEnabled: true`；`threshold: 0.25` |
| 实机 Persona DB | `/sdcard/DSHA/人格/数据/persona.db`（876,544 bytes；WAL 4,140,632 bytes） |
| 实机 Persona 文件 | `/sdcard/DSHA/人格/数据/persona.md`（1,464 bytes） |

**实际运行状态**：宿主进程运行、DB 被打开、profile 引用插件；**未通过一次实际 agent/created 注入验证**，因此“已加载并注入”目前是**推断（PARTIAL）**，不是实机注入证据。

---

## 2. 人格文件、身份与注入路径

### 2.1 人格文件

- `persona.md` 自检：`ok:true`，无 issues；节：`我是谁`、`性格`、`说话方式`、`价值观`、`边界`、`对外`、`我想记住的`。
- SHA256：`bfab5f7767b68d67d215f5e68e9218ba864e6796b703a6d24fcbdff54780c1a6`。
- 实机 `persona_versions` 最新 `v8`，`content_hash` 与当前 `persona.md` **一致**；`self.persona_version=8`。
- 结论：当前没有待同步的人格文件变更；启动 `syncPersonaVersion` 不会因同 hash 写新快照。

### 2.2 注入与宿主接入路径

```text
host agent/created
  → lib/index.js apply()
      ensureSelf / syncPersonaVersion（启动时）
      createInjector
      injector.mount(agent)
          classify(header) → subagent 拒 / group 默认拒或 brief / private
          private：writeBinding（cwd 命中 bind 前缀时写 session_bindings）
          personaBindingOf / resolveScope
          ctx.systemPrompt.context:
            dy-persona (order 900)
            dy-emotion (910)
            dy-voice (920)
            dy-emotion-act (强情绪；群不挂)
            dy-style / dy-grievance / dy-relationship / dy-axes / dy-world（按配置）
```

- **注入文本**：`personaBlock` 读 `persona.md`，`{{display_name}}` 渲染；full 全量，brief 摘要；`interpolate:false` 防止人格文件被宿主变量解析。
- **重复注入防护**：`mounted` Map 按 `session_id`；`mount` 若已挂返回 already-mounted；`agent/disposed` 调 unmount；context 注册重复会捕获 `already registered`。
- **群聊**：profile 未配置 `groupMode`，默认 `off` → 群聊不注入；即使 brief，也只挂 brief+情绪，不挂 full。
- **子智能体**：`origin=subagent`/`delegationDepth>0` 拒；fork 按普通会话。

---

## 3. 第一轮测试可能影响的人格/情绪状态

### 3.1 不会改变（代码/数据证据）

| 项 | 原因 |
|---|---|
| `persona.md` 文本 | 测试消息不编辑文件；`syncPersonaVersion` 只在启动时读，且 hash 相同不写 |
| `persona_versions` | 当前 v8 hash 与文件一致；同 hash 不新增快照 |
| `self.id` / display_name / name_version | 除非调用 `dy_persona_rename`；正常对话不改 |
| `name_history` | 仅 rename 写 |
| 人格核心/价值观/参数 | 文件未改；无成长/迁移触发 |

### 3.2 会改变（如果测试走生产 profile 的允许目录）

**A. `session_bindings`（身份轴）**

- `inject.mount` 对 private 会话、cwd 命中 `bind.cwdPrefixes`（默认跟随 sessionDirs）时调用 `writeBinding`。
- 测试 agent 的 session_id 会新增/刷新行；现有实机 37 行（persona 26 / work 11）。
- 这不是“人格成长”，但会改真实身份轴；测试会话应隔离。

**B. 情绪/成长记录（profile `emotion.ingestEnabled=true`）**

- `session/event` 对 private + `resolveScope` 允许的会话执行 `ingestEmotion` / `recordRuleEpisode`。
- 会写：`emotion_state`、`emotion_timeline`、`emotion_points`、`emotion_episodes`、`emotion_event`、`emotion_appraisal`、`meta.last_emotion_*`。
- 实机现有：state 1、timeline 770、episodes/event/appraisal 357；测试会追加真实记录。
- 群聊不 ingest（classify !== private）。

**C. 工具调用风险**

- `dy_persona_rename` 无 owner 门禁（README 工具表；只拒子智能体/fork），测试模型若被诱导可改 display_name/name_version/name_history。
- `dy_persona_get/whoami/history/mode` 只读；`dy_emotion_state/timeline/points` 只读；`dy_emotion_why` 严格 owner 门禁。
- 第一轮必须禁止 rename 或不在测试 prompt 中触发。

**D. 实机 DB 文件**

- 任何允许目录的测试对话都会写 `persona.db` + WAL；当前 WAL 4.1MB，备份/恢复需停宿主并包含 wal/shm。

---

## 4. 测试隔离建议

### 4.1 推荐（完整人格/注入测试）

1. **独立 test profile + 独立 dataDir**（如 `/tmp/dsha-persona-test` 或 `/sdcard/DSHA/测试/persona-<date>`）：
   - 复制 `persona.md`；使用测试 DB（空库或复制后只读校验，不回写生产）。
   - 配置 `emotion.ingestEnabled=false`（测试人格注入本身不需要情绪写入）或接受测试库写入但绝不写生产。
   - 独立宿主/profile/端口；不覆盖生产 profile；需 Owner 单独授权部署/重启。
2. 若不能切 profile：只做**只读**工具检查（whoami/get/mode/emotion_state/timeline），不发对话、不调用 rename。
3. 若必须在生产宿主做对话测试：先将测试会话 cwd 放到 `sessionDirs`/`bind.cwdPrefixes` **之外**（如 `/tmp/dsha-persona-smoke`）→ `resolveScope` 拒绝、无注入、无 ingest；但这不能验证 persona 注入。
4. 任何允许目录的生产对话测试：先备份 `persona.db`+wal+shm，明确 Owner 授权；测试后按宿主停止/恢复流程回滚；不得边跑边覆盖。
5. 测试 prompt/工具白名单：禁用 `dy_persona_rename`；不让模型调用身份/名字写工具；只读工具优先。
6. 记录测试会话 ID、cwd、开始/结束时间、DB 前后 counts、persona.md hash、persona_versions max、name_history count。

### 4.2 当前环境结论

- 当前 profile `emotion.ingestEnabled=true`、`inject.mode=full`、`sessionDirs` 含 home/渠道/douyin；**生产对话测试会写真实情绪/绑定**。
- 因此：**完整第一轮对话测试 = BLOCKED**，直到隔离 profile/dataDir 获授权；只读检查 = READY。

---

## 5. 跨会话重置、重复注入、上下文污染

### 5.1 重复注入

- `mounted` Map 以 `session_id` 为键；`agent/created` 同一 session 第二次 mount 返回 already-mounted；`agent/disposed` unmount；context 重复注册会捕获 `already registered`。
- 进程重启 → mounted 清空 → 重建注入；这是预期，不是重复叠加。
- 未发现同一 session 同时注册两套上下文的代码路径；实机未做重复 created 探针，标 **待实机验证**。

### 5.2 跨会话重置

- 重启宿主：`mounted` 清空、注入重建；`self`/persona_versions 从 DB 读；不会因重启重置 self。
- `persona_version` 只在 hash 变化时变；重启同 hash 不变。
- `session_bindings` 持久；重启后按 session_id 复用。
- 未执行重启验证；**NOT_RUN**。

### 5.3 上下文污染

- **全局情绪状态**：`emotion_state` 按 `self_id` 单行，不是按 conversation；一个测试会话的情绪写入会影响所有会话的 `dy-emotion`/`dy-emotion-act` 注入。这是 P0-1 相关的跨会话污染风险。
- `dy-style` 来自 Memory 全局 style；不是按 conversation。
- `recentBySession` 仅进程内、按 session 保留最近 6 条用于 appraisal，不跨 session；但 `emotion_state` 全局。
- `session_bindings` 身份轴按 session；`roleOf/bindingOf` 的既有风险（异 persona/work）需另审。
- 结论：**注入文本本身按 session 挂载**；**情绪状态/风格/人格版本是全局**。第一轮要明确“测试会话的情绪会影响全局当前情绪”。

---

## 6. 与 Memory / Host / Android 的接口依赖

| 模块 | 依赖 | 风险/说明 |
|---|---|---|
| Host/DSH | `agent/created`、`agent/disposed`、`session/event`、systemPrompt context、profile 加载 | 注入以 host 事件为入口；测试会话 cwd/session id 决定是否 allowlist/bind/ingest |
| Memory | `roleOf`/`bindingOf` 判身份；`emotionAt/emotionTimeline`；`style.json` 经 Memory 日结 | Persona 不写 memory.db；但测试对话可能同时触发 Memory 写入，需另行隔离 |
| Channel Bridge | 渠道目录/会话 ID/消息事件 | 测试走 QQ/渠道时，Channel/Memory 写入不在本报告范围；必须同时隔离 |
| Android/proot | `/sdcard` FUSE、proot node、WAL、宿主进程 | 备份/恢复需停宿主；不能只拷 db 不带 wal/shm；未做设备测试 |
| 插件加载 | `/root/.dsh/plugin-src` + web profile | 当前 profile 引用插件；运行注入未实机验证 |

---

## 7. 第一轮应保持不变与可观察指标

### 7.1 不变量

- `self.id = self:1d21547c-9973-4060-aca8-11bb891ea4e7`。
- `display_name` 不变；`name_version` 不变。
- `persona_version=8`；`persona_versions` 最多仍 8 条；最新 hash 仍 `bfab5f...c1a6`。
- `persona.md` bytes/hash 不变。
- `name_history` 仍 1 条。
- 无新 self 行；无新 persona_versions。
- 群聊不注入（当前 groupMode off）；子智能体不注入。
- 每 session 只挂一套 context；`mountedCount` 与 active sessions 一致。

### 7.2 可观察指标

- `dy_persona_whoami`：self_id/display_name/persona_version/name_version。
- `dy_persona_mode`：mode、allowlisted、block_len。
- `dy_persona_get`：实际人格节文本（只读）。
- `persona.md` SHA256；`persona_versions` count/max/hash；`name_history` count。
- DB counts：session_bindings、emotion_state/timeline/points/episodes/event/appraisal。
- `mountedCount`/host log `[persona] 注入已挂载`；无重复 context/error。
- 全局情绪 `emotion_state` 前后快照（若允许写入，明确预期 delta）。
- 测试会话 cwd/session id/时间；确认不在 sessionDirs/bind 前缀（只读测试）或隔离 profile。

---

## 8. 测试阻断项

1. **生产 profile 无隔离**：home/渠道/douyin 测试会写真实 emotion/bindings；对话测试 blocked。
2. `emotion.ingestEnabled=true` 且无法无重启关闭；测试即写。
3. `inject.mount` 即使只测注入也会写 `session_bindings`。
4. `dy_persona_rename` 无 owner 门禁，测试模型可能触发身份/名字变更；必须禁用。
5. 宿主运行中不能安全覆盖/恢复 persona.db（需停宿主 + wal/shm）；未授权。
6. 未验证宿主已实际注入；只读检查可做，实机注入/重启 **NOT_RUN**。
7. 群聊默认 off，第一轮群聊测不到人格注入；若开 groupMode 需改 profile/重启，未授权。

---

## 9. 结论

**READY WITH CONDITIONS.**

- **READY**：只读身份/人格文件/注入配置检查、`dy_persona_whoami/get/mode`、DB 只读统计。
- **BLOCKED**：在生产 profile 的 home/渠道/douyin 进行真实对话/注入/情绪测试；会写真实 `session_bindings` 与 emotion 记录。
- **条件**：先建立独立 test profile/dataDir（或仅用非 allowlist cwd 做无注入 smoke）；禁用 rename；备份 DB+WAL+SHM；Owner 明确授权后才可做写入型实机测试。
- 未修改人格文件/身份/价值观/参数；未触发成长/迁移/重置；未写真实成长记录；未部署/重启。

---

## 10. 证据分类

### 代码证据

- 安装版本/源码与 main 一致；profile/进程/DB fd 只读检查。
- `lib/index.js:101` ensureSelf；`:121-125` syncPersonaVersion；`:208-432` ingest；`:435-438` 就绪日志。
- `lib/self.js:74-97` persona version hash/同 hash 不写。
- `lib/inject.js:86-99` writeBinding；`:105-143` mount；`:145-292` contexts；`:295-305` unmount。
- `lib/persona.js:102-113` personaBlock（只读）。
- `lib/service.js:64-69` selfId sentinel（身份风险，另审）。

### 测试证据

- 隔离临时 DB probe：`syncPersonaVersion` 第一次 changed=true、第二次同 hash changed=false；`personaBlock` 只读；`ingestEmotion` 在临时库写入 state/event/appraisal/episode（**不碰生产**）。
- 现有 303/303 仅 main 回归基线；不是第一轮实机 PASS。

### 实机证据

- 宿主进程 PID 30172，端口 38105，DB 文件被打开。
- 生产 DB 只读统计：self 1 active；persona_version 8；persona_versions 8；persona.md hash 匹配 v8；name_history 1；session_bindings 37（persona 26/work 11）；emotion_state 1；timeline 770；episodes/event/appraisal 357。
- **未**发送实机测试消息；未观察实际注入；未重启；**实机注入/对话 NOT_RUN**。
