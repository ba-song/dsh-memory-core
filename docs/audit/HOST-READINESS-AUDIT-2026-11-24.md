# HOST-READINESS-AUDIT-2026-11-24 · DSHA「汐」第一轮实机测试准备（Host）

- 归档路径：`ba-song/dsh-memory-core` → `docs/audit/HOST-READINESS-AUDIT-2026-11-24.md`
- 基线：`coordination/project-handoff` `317717615aadfb7edba2ad862997aad3032afd73`（归档时远端 HEAD）
- 归档要求：不覆盖之前轮次；本文件为 2026-11-24 这一轮的新文件
- 同源会话报告：`coordination/Host Runtime Provenance报告.md`，分支 `report/host-first-live-test-prep`，commit `bf88f9339845f441afe6022c1daf9d376b167755`，blob `7923ea73a2d730359d6bbfb5a0ed04e08f3b6906`
- 任务：第一轮实机测试准备任务（Host）
- 执行角色：DSH 本地验证与交接（一次性只读审计）
- 时间：2026-11-24 13:23–14:00 Asia/Shanghai
- 生产 Host：PID 30172，**未停止、未重启、未修改配置/插件/profile**
- 结论：**READY WITH CONDITIONS**（Host 可支撑隔离的第一轮实机测试；但"可信会话身份 / 可信用户授权 / 插件隔离"三项在当前 Host **不存在或不可信**，相关验证子项标 **BLOCKED**，见 §9）
- 结论标签：PASS / FAIL / BLOCKED / NOT RUN / INCONCLUSIVE 按 AGENTS.md §6.1

---

## 0. 一句话结论

Host（`@deepseek-ai/dsh` **0.2.1-rc.2** + 41 个 DSHA 补丁包）在 proot Ubuntu 内以 **root（Android uid 10328）** 同进程运行，插件通过原生 ESM `import` 挂载，**没有 per-plugin 沙箱**；`session id`、`cwd`、`header` 都是**调用方可构造的普通数据**，Host 不签发可信会话身份；`owner` 只是 Memory 插件的配置概念；用户审批在 `DSH_PERMISSION_MODE=danger-full-access` 下是 `never`，且审批 waterfall 可被任意插件应答；工具超时是协作式且多数工具未声明；插件未捕获异步异常会让整个 Host `exit(1)`。

**第一轮实机测试可以在隔离 Host（临时 `DSH_HOME` + 临时 profile + 独立端口/进程）中进行，但不能把 session/owner/authorization 当可信身份使用，也不能让测试插件写生产数据。**

---

## 0.1 证据分级与来源（强制区分）

| 标签 | 含义 | 本轮范围 |
|---|---|---|
| **[S] 源码证实** | 安装版 `lib/index.js` 的实际代码（行号 + 短引用）；DSHA 本地补丁以已 materialize 的 `DSHA_*` marker 为准 | `@deepseek-ai/dsh` 0.2.1-rc.2 安装目录、`/root/.dsh/plugin-src` |
| **[T] 隔离测试证实** | 独立 node 进程、临时 `DSH_HOME`/临时 profile、无生产 profile/端口/数据；可复现命令与原始输出 | `/tmp/host-audit`、`/tmp/audit-session`、`/tmp/audit-runtime` |
| **[D] 设备/生产只读证实** | `/proc`、端口探测、安装包元数据、生产会话**事件类型统计**（不读正文） | PID 30172、38105/3081/3090、166 sessions |
| **[I] 推断** | 由 [S]/[T]/[D] 外推、尚未独立验证 | 见 §9.4 |

### 0.1.1 结论 → 证据等级

| # | 结论 | 等级 | 关键证据 |
|---|---|---|---|
| 1 | 安装版 0.2.1-rc.2、无 gitHead、48 个 DSHA patch asset | [D] | `package.json`；`/root/.dsh/runtime-patches.json` |
| 2 | PID 30172、38105/3081/3090、`danger-full-access` | [D] | `/proc/30172/*`；`/dev/tcp`；401 |
| 3 | profile 组合 = bundle patch → profile → home → `--patch`；`cordis.yml` 恒空 | [S] | `dsh-app-boot`/`profile-boot` 行号（§2/§10） |
| 4 | 启动并发挂载、无先后语义 | [S] + [T] | loader `Promise.all`；独立进程 3 插件 2/9/10ms |
| 5 | 非 required 插件失败只告警，兄弟不受影响 | [S] + [T] | 抛错插件 358ms 失败、364ms 回滚，兄弟 state=2 |
| 6 | 插件未捕获异步异常 → 整 Host exit(1) | [S] | `installFailLoud` |
| 7 | session id 可由调用方指定（已有 id 不可覆盖） | [S] + [T] | API `sessionId` 裸 string；隔离插件自造 id |
| 8 | cwd 由调用方指定，仅校验绝对路径 | [S] + [T] | `dsh-session:1047-1049`；插件建 `/root` cwd |
| 9 | header 9 字段仅 version/id 由宿主约束，其余调用方构造 | [S] + [T] | `dsh-session:1819-1827`；header 冻结 |
| 10 | Host 无 owner/用户；只有单租户 principal；真主人判定在 Memory/Autonomy | [S] | `dsh-api-remote-access`；`dsh-memory-core/owner.js`；`dsh-autonomy/tools.js` |
| 11 | 无独立 conversation ID | [S] | 全仓 host 包无 `conversationId` |
| 12 | 插件可读全部 session 事件、可写别人 live session | [S] + [T] | `dsh-scope:327-338`；A 收到 B、B append A seq=3 |
| 13 | 审批 policy=never；生产 166 会话 asked=0/ask=0 | [S] + [D] | `dsh-base:259-262`；事件类型统计 |
| 14 | 插件自批的四条机制 | [S]（机制存在） / [I]（实际绕过未跑） | waterfall/cordis:310-326；client.browser:904-919；append |
| 15 | 不存在签名 grant/capability/attestation | [S] | 审批/授权包无签名结构；lease 仅内存 |
| 16 | `dsh-authorization` 是凭据获取流程，不是执行授权 | [S] | README + `registerFlow/begin/commit` |
| 17 | 工具超时协作式、默认不存在；bash 60s 转后台 job | [S] | `timeout-policy:5-6,123-130`；`tool-bash:183` |
| 18 | 工具层无自动重试；DSHA 禁止自动重放 | [S] | `llm-retry` README；`agent-loop:509-510` |
| 19 | 插件与 Host 同进程/同权限、无 per-plugin ACL | [S] + [D] | loader ESM；324 包无 ACL；插件用 node:fs/net |
| 20 | 破坏性策略 full-access 下 `exempt()` 恒真；native consent `globalAllow=true` | [S] + [D] | `dsha-destructive-policy:82,85-100`；`/app/native-policy` |
| 21 | `!!js` 配置走 `new Function+eval`；HMR 可 recompose | [S] | `loader:233-237`；`dsh-hmr` README |
| 22 | 隔离 Host 可启动、加载测试插件、创建/观测临时 session、正常 dispose | [T] | `/tmp/host-audit/probe-*.log`；`/tmp/audit-session/probe-boot3.out` |
| 23 | 生产未被触碰 | [D] | PID 30172 cmdline/存活；profile mtime；无 audit-* 生产写入 |

> 阅读规则：`[I]` 不得当作已验证；`[T]` 只证明隔离环境，不外推到生产 profile；`[D]` 的 166 会话统计只含事件类型，不含正文。

---

## 1. Host 版本、运行状态与部署信息

### 1.1 版本

| 项 | 值 | 证据 |
|---|---|---|
| 安装包 | `@deepseek-ai/dsh` **0.2.1-rc.2** | `/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json` |
| gitHead | **不存在**（npm 包未带 gitHead） | `node -e "require(pkg).gitHead"` → `undefined` |
| 上游 tag | `dsh-v0.2.1-rc.2` = `687f282e8625c6b8d11ff58211a90524be2e4317`（源码参照） | `/tmp/build-infra/harness` |
| DSHA 本地补丁 | `runtime-patches.json` **48 个 active asset**，41 个安装包带 `DSHA_*` 标记 | `/root/.dsh/runtime-patches.json`；`grep -rl DSHA_` |
| 补丁资产本体 | 设备与 harness repo 均**未找到** `*-patch.json` 文件，判断由 APK 安装期 materialize | 见 §10；运行时以已 materialize 的 `DSHA_*` marker 为证据 |

> DSHA 补丁不是 npm 包的一部分，而是安装期的本地改写；因此"安装版行为"必须看 `/usr/local/lib/.../lib/*.js` 的实际代码，不能只看上游源码。

### 1.2 运行状态

| 项 | 值 | 证据 |
|---|---|---|
| 进程 | **PID 30172**，`/usr/local/bin/node .../dsh/lib/bin.js web --no-open --host 127.0.0.1 --port 38105` | `/proc/30172/cmdline` |
| 启动时间 | **2026-11-22 09:06**（`.dsha-web.pid` 写入时间；进程仍存活） | `stat /root/.dsha-web.pid`；PID 文件内容 `30172` |
| 身份 | proot 内 `uid=0(root)`；Android 内核层 real uid **10328**（`dsh.android.client`） | `id`；`/proc/30172/status` |
| 内存 | RSS ≈ **822 MB** | `/proc/30172/status` |
| 工作目录 | `/root` | `/proc/30172/cwd` |
| 监听 | `127.0.0.1:38105`（web，**无 token 返回 401**） | `curl http://127.0.0.1:38105/` → 401 |
| 局域网网关 | **`0.0.0.0:3081`**（`dsh-lan-link` 0.3.1，Basic Auth + 私网 CIDR 白名单，**shell 等价访问**） | `/sdcard/DSHA/lan-link.txt`；profile patch `lan-link` 段 |
| 设备桥 | `127.0.0.1:3090`（Android 能力桥，独立 node 进程） | `/proc`；`/app/help` |
| 运行环境 | `DSH_HOME=/root/.dsh`、`DSH_PERMISSION_MODE=danger-full-access`、`DSH_CONFIRM=1`、`DSHA_PLUGIN_UNLOCKED=1`、`DSHA_STARTUP_PROFILE=web`、`NODE_OPTIONS=--import=/root/.dsh/startup-observer.cjs`；**`DSH_CONFIRM=1` 在安装版/lib/DSHA 插件源码中 0 个消费者，不是 Host 审批开关** | `/proc/30172/environ`；全库 grep |
| 启动观察器 | DSHA 自定义 preload，只读插件元数据并输出 `[DSHA_STARTUP]`；会恢复子进程的 `NODE_OPTIONS` | `/root/.dsh/startup-observer.cjs`；`/root/dsh-web.log` |

### 1.3 部署结构

- profile：`/root/.dsh/profiles/web/`，`package.json` 的 `dsh.profile.bundles` 是 **24 项有序字符串数组**（base + web-app + 22 个 DSHA/自研 bundle）。
- 插件来源：
  - 8 个自研：`/root/.dsh/plugin-src/{dsh-autonomy,dsh-channel-bridge,dsh-douyin,dsh-hud,dsh-media,dsh-memory-core,dsh-persona-core,dsh-selfhost-boot}`（`link:` 进 profile）；
  - 8 个官方/本地包：`dsh-device-shell-guide`、`dsh-task-notifier`、`dsh-status-overlay`、`dsh-web-mobile`、`dsh-computer-use-android`、`dsh-auto-review`、`dsh-tool-vscreen`、`dsh-app-integration`（`builtin-plugins.json` 登记，用于原生插件页）。
- `plugin-activations.json` 只记录 1 个 `dsh-qq-onebot`（status=loaded），由 DSHA Python 写，JS Loader 不读取它；它不是"当前加载清单"。
- `cordis.yml` 恒为空数组，每次启动被重写；真实组合 = bundle patch 层 + profile `cordis.patch.yml` + `$DSH_HOME/cordis.patch.yml`（不存在）+ `--patch`。

---

## 2. 插件注册、初始化、生命周期与卸载

### 2.1 加载机制（PASS）

1. `dsh.profile.bundles` 列出 bundle 名；每个 bundle 的 `package.json` 声明 `dsh.bundle.patch`（单文件或有序数组）；Loader 按顺序拼接 patch 层。
2. `cordis.yml` 是空数组根，被 `profile-boot` 无条件重写（**不要把它当配置源**）。
3. bundle 解析"安装锚点优先"（`@deepseek-ai/dsh/package.json`），profile 目录次之；单个 bundle 解析/兼容失败进 `skippedBundles`，只告警，其余继续。
4. 插件 `name` 可以是包名、绝对路径或 `file:` URL；`insert:` 行会把绝对路径转成 `file:` URL。
5. 启动是 **并发挂载**：`Promise.all` + 服务可用性驱动，**bundle/用户插件之间没有先后语义**；这一点对"加载顺序保证"类测试是致命的。

### 2.2 生命周期（PASS）

- cordis fiber 6 态（0/1/2/3/4/5）；`ctx.plugin` 返回 fiber；`ctx.effect` 在卸载时**并行 await**，单条清理失败不扩散。
- `Entry.update` 支持 volatile-only 就地更新；HMR/Plugin Manager 的 reload 走同一队列。
- **失败隔离**：非 required 插件 import/apply 失败只告警，兄弟插件不受影响（实测：抛错插件 358ms 失败、364ms 自身 effect 回滚，兄弟保持 state=2）。
- **required 启动项**（8 个）：agent-loop、webserver、web-runtime、modules、connection、headless-runner、acp、sdk-jsonrpc-server；它们失败才致命。
- **缺口（FAIL）**：插件内**未捕获的异步异常** → `installFailLoud` → 整个 Host `exit(1)`。测试插件必须自己兜住所有 timer/async 错误。

### 2.3 卸载 / 动态重载

- `ctx.effect` 清理、fiber dispose 正常；实测隔离 Host 在 `timeout` 终止时输出了 `[AUDIT_PROBE] dispose`。
- HMR 启用（base bundle 在 `profileContext` 存在时 `root: []`）；`root: []` **保留显式配置 watch**：**profile patch 文件变更会触发 recompose**；`cordis.patch.yml` 里的 `!!js` 会被重新求值。
- 因此：**测试期间禁止写 `/root/.dsh/profiles/web/cordis.patch.yml`**（会热重载 + 代码执行）。

---

## 3. 可信 session ID / conversation ID / cwd / owner：真实来源

### 3.1 结论表

| 字段 | 真实来源 | 是否调用方可构造 | 可信性 | 证据 |
|---|---|---|---|---|
| **session ID** | API `session/create` 的 `sessionId`（裸 `z.string()`，无格式校验）/ 插件 `agents.create({sessionId})`；不指定时 API mint `session-${randomUUID()}` | **是**（任意新 id；已有 id 不可覆盖） | **不可信** | `dsh-api-session-controller/lib/index.js:508-525,755-787`；`lib/typert.host.js:1522-1550`；隔离实测 `audit-probe-session-2/3/4` |
| **conversation ID** | **Host 不存在独立 conversation ID**；对话 = session | — | — | 在 `dsh-session`/`dsh-agent`/`dsh-api-session-controller`/`dsh-api-gateway`/`dsh-web-app` 的 lib 中未找到 `conversationId`/`conversation_id` |
| **cwd** | API：`workspace.path ?? request.cwd ?? process.cwd()`，随后 `mkdir(cwd,{recursive:true})`；插件：`meta.cwd` | **是**（绝对路径字符串；插件路径不 mkdir、不校验存在/归属/可写） | **不可信** | `dsh-api-session-controller/lib/index.js:513,762`；`dsh-session:1047-1049`；实测插件创建 `cwd=/root` 的 session |
| **header** | `{version:4, id, createdAt, cwd?, parentSession?, isSeeded, origin?, delegationDepth?, agentPreset?}`，深冻结 | id/cwd/lineage 由调用方给 | **数据可信（未被篡改），但不是身份凭证** | `dsh-session:1819-1827`；`:1039` 冻结；实测 header |
| **owner** | Host 只有单租户 `principal.kind === 'owner'`（launch token/cookie 浏览器都是 owner）；真正"主人"在 `dsh-memory-core` 的 `classifyOwner(cwd)` / `dsh-autonomy` 的 `isOwnerContext(cwd)` | 由 cwd + 插件配置决定 | **不可信（cwd 可构造）** | `dsh-api-remote-access` principal；`/root/.dsh/plugin-src/dsh-memory-core/lib/owner.js:86-115`；`dsh-autonomy/lib/tools.js:22-40` |
| **agent runtime owner** | `parentAgent`（父子运行时归属） | 调用方可给 parent | 仅运行时归属，不是用户身份 | `dsh-agent` `CreateAgentOptions.parentAgent` |

### 3.2 实测（隔离 Host，临时 `DSH_HOME`，非生产）

探针插件在独立 Host（PID 16138/17044，`DSH_HOME=/tmp/host-audit/home`，端口 39119/39120）中执行：

```
[AUDIT_PROBE] session {"header":{"version":4,"id":"audit-probe-session-2","createdAt":1795498373736,"isSeeded":false},"list":["audit-probe-session-2"]}
[AUDIT_PROBE] cwd-session {"header":{"version":4,"id":"audit-probe-session-3","createdAt":1795498457574,"cwd":"/tmp/host-audit/fake-owner","isSeeded":false}}
[AUDIT_PROBE] cwd2-session {"header":{"version":4,"id":"audit-probe-session-4","createdAt":1795498457715,"cwd":"/root","isSeeded":false}}
[AUDIT_PROBE] list [{"id":"audit-probe-session-3",...},{"id":"audit-probe-session-4",...}]
```

- 插件用**任意 id**、**任意 cwd（含 `/root`）**创建 session；session 落盘到 `$DSH_HOME/sessions/--root--/audit-probe-session-4/`。
- `ctx.agents.list()` 返回**所有活着的** agent，插件可读取每个 `agent.session.header`（跨 session）。
- 另一个隔离探针（`/tmp/audit-session`，headless profile，禁用 headless-runner）实测：插件 A 的 `session/created`/`session/event` 监听器**收到了插件 B 的会话**；插件 B 用 `sessions.list()` 读到 A 的 header，并向 A 的 live session **append 成功（seq=3）**。普通插件 ctx **没有 scope tag**，`scopeTarget` 对 untagged listener 全局放行（`dsh-scope/lib/index.js:327-338`）。
- API `claim` 复用规则：同名 live 且空白、cwd 完全一致时可**复用**该 session；持久化中同名空白 session 可 resume；cwd 不一致则 `ApiSessionCwdConflict`；已开始 turn 则 mint 新 id。

### 3.3 结论

- Host **没有**提供"宿主观察产生的、不可伪造的 session/conversation/cwd/owner 身份"。
- session ID/cwd 是**调用方构造的普通数据**；header 的**完整性**（深冻结、校验类型）不等于**可信性**（来源不可验证）。
- **API `claim` 复用**：同名 live 且空白、cwd 完全一致时可复用该 session；持久化同名空白 session 可 resume；cwd 不一致 `ApiSessionCwdConflict`；已开始 turn 则 mint 新 id。即"知道一个空白会话 id + 精确 cwd"的调用方可以接管它（不是任意覆盖）。
- 任何以 `header.cwd` 判"主人/权限"的插件逻辑，都把安全边界降级为"谁能创建 session（或指定 cwd）"；而插件**能读全部 session 事件、能写别人 live session**，这在第一轮测试中是必须显式承认的隔离缺口。
- 如果第一轮测试的插件需要"可信会话识别"，**当前 Host 不能提供**；只能由测试框架在**进程内**注入显式身份（例如测试配置、环境变量、单独的 owner 映射），并明确这不属于 Host 安全边界。相关子项标 **BLOCKED**。

---

## 4. 用户授权事件/API：存在性与可信程度

### 4.1 存在哪些"授权"

| 机制 | 是什么 | 对插件执行的授权？ | 可信度 |
|---|---|---|---|
| `ctx.approval`（`dsh-user-approval`） | 工具调用的一次性审批 seam；`approval/request` **waterfall**；outcome 只有 `allowed-once/rejected/cancelled/unavailable` | 仅"工具 ask"；**不是**"用户授权插件执行" | **低**：waterfall 可被任意插件应答；当前 policy=`never`，且生产 166 个会话 `approval/asked=0`、`ask=0` |
| `ctx.authorization`（`dsh-authorization`） | **凭据获取 seam**：插件通过"与人的对话"获得 credential（账号/OAuth 类流程） | **不是**执行授权 | 取决于 flow；不是通用授权事件 |
| `dsh-settings` / `dsh-credentials-local` | 设置/凭据存储（`$DSH_HOME/.env`、`.credentials.yaml`） | 否 | 插件可经服务访问的部分取决于注入 |
| `dsh-permission-presets` | 把 sandbox mode + approval policy 打包成 Permissions 选项 | 否 | 产品层配置 |
| DSHA `dsha-destructive-policy` | 工具级破坏性操作审批 + 原生 consent 回查 | 仅 4 个工具入口；**同 UID 插件不在其内** | 当前 full-access 下 `exempt()` 为真 → 不弹审批 |

### 4.2 关键事实（实测 + 代码）

1. **当前审批策略 = never**：`dsh-base/cordis.patch.yml:259-262` 用 `DSH_PERMISSION_MODE === 'danger-full-access' ? 'never' : 'ask'`；当前 env 正是 `danger-full-access`。`ApprovalService.decide()` 顺序是 aborted→`cancelled`、policy=`never`→**直接 `rejected`（在 waterfall 之前，:175）**、否则才派发 waterfall。**生产 166 个会话全部 `policy=never`，`approval/asked=0`、`ask=0`**（只统计事件类型，未读正文）——面板从未出现。
2. **插件可自批（四条独立路径，policy=ask 时成立）**：
   - Host 侧 answerer：`ctx.on('approval/request', () => 'allowed-once', { prepend: true })`；cordis waterfall "不调 next 即否决链"（`cordis/lib/index.js:310-326`）；
   - 浏览器端 answerer：客户端插件与官方面板共用 eventKey，返回结果即终止链（`dsh-api-gateway/lib/client.browser.js:904-919`）；
   - 改策略/预设：`approval.setPolicy(agent,'never')`、`permissionPresets.set(...)`、`settings.update('permission', defaultPreset)`；
   - 伪造审计：`session.append('approval/asked'/'approval/decided')` 合法且无签名（`dsh-session/lib/index.js:1517`）。
3. **不存在可信"已授权"凭证**：没有签名 grant / capability / attestation；一次性 lease 仅内存（`dsha-destructive-policy/index.js:138`）；持久只有可伪造的审计事件。Host 外唯一不可伪造的是 Android launcher 的 native consent（`/app/native-policy`，当前 `globalAllow=true, revision=3`），但它只起**豁免**作用，不是逐次授权。
4. **`dsh-authorization` 不是"用户授权插件执行"**：它是"与人对话获取凭据"的 flow registry（OAuth/设备码/粘贴 code），成功只写 credentials record，结局 `authorized/cancelled`，与 approval 零调用交叉。
5. **DSHA 补丁影响**：`permission-full-access-patch` 让 GUI 选"完全访问"时双写当前会话 + 新会话默认并 read-back（`dsh-client-ui-permission-presets/lib/client.js:782-885`，marker `DSHA_PERMISSION_FULL_CURRENT_DEFAULT_V1`）→ 生产被永久钉在无审批；`retire-guarded-preset` 让 `guarded-full-access` 只读不可选（`dsh-permission-presets:239,248`）；`guard-*` 四补丁把 `dsha-destructive-policy` 焊进 tools/bash/fs/editor，但 `exempt = globalAllow || fullAccess` 当前恒真（`:82,85-100`）→ **破坏性逐次审批实际失效**；auto-review 已禁用（它是工具层唯一 `{kind:'ask'}` 来源）。
6. **未找到**：Host 中不存在"插件执行授权"的持久事件/API（如 `plugin/authorized`、`user/consent`）；只有工具级 approval 与 credential authorization。

### 4.3 结论

- **不存在可信的"用户授权插件执行"事件/API**；当前的 approval 是工具级、可被插件应答、且已被 full-access 旁路。
- 第一轮测试若需要"用户明确授权"这一层，必须在 **Host 之外**实现（测试负责人手动确认 / 独立 UI / 外部 gating），或明确将其标为 **BLOCKED**，不能用 `ctx.approval` 冒充。
- **不得创建真实用户授权**：本审计未创建任何 approval/credential/consent，未写入 settings/credentials。

---

## 5. 工具调用、事件、超时、重试与错误隔离

### 5.1 流水线（PASS）

```
execute → pre-execute (ask/deny) → guard（单调拒绝）→ (DSHA prepareOperation)
        → around tools/execute → body → post-execute → finalize/notify
```

各阶段抛错都收敛为 `isError` 结果；未知工具 `UNKNOWN_TOOL`；post-execute 不能把失败改成功。

### 5.2 取消（PASS）

- `callerSignal` 存在 registry 的 `WeakMap`，不放在可变 `exec` 上，wrapper 不能改写取消。
- 未进入 body → `ABORTED_BEFORE_DISPATCH`；已进入 body → drain 后 `ABORTED`（不抛弃已启动的 promise）。
- PTC `run_code` 调度器：未启动调用 `abandon`，结果不丢；单 lane 有序、body 可并行（默认 10）。

### 5.3 超时（FAIL，作为"硬超时"）

- `timeout-policy` 是**协作式**：只有 `ToolDefinition.timeoutMs` 声明才计时；到期只 abort signal，`await next()` 仍等 body 结束。
- **默认不存在**；`bash`/`fs`/`editor` 未声明 definition 级 `timeoutMs` → 不介入。
- bash 的 60s 来自 `bash-sandbox`，且超时后**转后台 job**，不是失败。
- 测试框架若需要超时，必须自建 `Promise.race` + `AbortController`，不能依赖 Host。

### 5.4 重试（PASS，无隐藏重试）

- 工具层**没有**自动重试；只有 `dsh-llm-retry` 在模型请求层（agent step 边界）。
- DSHA `DSHA_TOOL_DISPATCH_IDENTITY_RC2_V1` 明确 "No automatic replay"（`dsh-agent-loop/lib/index.js:509-510`）。
- `repeat-tool-reminder` 只是 3/5/8 次重复调用的提示注入，不是重试器。

### 5.5 错误隔离

- 工具 body / 各阶段监听器抛错 → `isError`，流水线继续。
- **插件自身**未捕获异步异常 → 整 Host `exit(1)`（见 §2.2）。
- 测试插件必须包住所有 timer/async 回调；Host 不会替插件兜底。

---

## 5.6 测试与实验记录（本轮实际执行）

| # | 实验 | 环境 | 命令/产物 | 退出码/结果 | 等级 |
|---|---|---|---|---|---|
| E1 | 版本/包元数据 | 生产只读 | `node -e require(pkg)` | 0；0.2.1-rc.2；gitHead 缺失 | [D] |
| E2 | 进程/端口/环境 | 生产只读 | `/proc/30172/*`；`/dev/tcp` | 38105/3081/3090 OPEN；38105 无 token 401 | [D] |
| E3 | profile 组合 | 临时 HOME | `dsh --profile probe --dump-config` | 0；含 `file:///tmp/host-audit/test-plugin/index.mjs` | [T] |
| E4 | 隔离 web Host 启动 | 临时 HOME/profile，端口 39117 | `env -i ... node bin.js --profile probe --no-open --host 127.0.0.1 --port 39117` | 启动成功；`[AUDIT_PROBE] active`；插件 dispose；超时终止 124 | [T] |
| E5 | 指定 session id / cwd | 同上，端口 39119/39120 | 探针 `agents.create({sessionId, meta:{cwd}})` | 任意 id/cwd（含 `/root`）成功；header 冻结；落盘临时 HOME | [T] |
| E6 | 跨插件会话可见/可写 | 临时 HOME，headless | `/tmp/audit-session` 两插件 | 退出 0；A 收到 B 的 created/event；B append A seq=3 | [T] |
| E7 | 审批事件统计 | 生产只读 | 会话日志**只统计事件类型** | 166 sessions：policy never×166、asked=0、ask=0 | [D] |
| E8 | native consent | 设备桥只读 | `/app/native-policy` | `globalAllow=true, revision=3` | [D] |
| E9 | 生产未受影响 | 生产只读 | `/proc/30172/cmdline`；profile mtime | 进程存活；profile mtime 未变 | [D] |
| E10 | 插件危险能力静态核实 | 生产只读 | `grep node:*` plugin-src/lib | fs/net/child_process/sqlite 均被使用 | [S]+[D] |

未执行（见 §9.4）：GUI 审批面板真实点击、OAuth 流程、headless 调模型、向生产加载测试插件、局域网第二设备访问 3081、隔离实例中实际跑"插件自批"。

---

## 6. 插件权限、文件系统、网络、进程隔离

### 6.1 事实（FAIL，无隔离）

| 维度 | 事实 |
|---|---|
| 进程 | 插件与 Host **同进程**；Loader 用 Node 原生 ESM `import`，无 vm/包装/权限模型 |
| 身份 | proot 内 root（Android real uid 10328）；插件可读写的文件范围 = Host 可读写的范围 |
| FS | 插件直接 `import node:fs`，可读写任意路径（实测：memory-core 17×node:fs、autonomy 15×node:fs；含 `spawn/execFile`） |
| 网络 | 插件直接 `node:net`/`node:http`；无拦截器 |
| 子进程 | 插件直接 `node:child_process`（实测 autonomy/douyin/media 使用 spawn） |
| per-plugin ACL / sandbox | **不存在**；324 个包中没有按插件隔离的机制 |
| `cordis-host-runner` | 只覆盖"动态包"（browser/agent 现场定义），README 自述 **"not a security boundary"**；不能隔离 profile 插件 |
| `sandbox / sandboxPolicy / bash-sandbox / pwsh-sandbox / fs-sandbox` | **工具级**，只约束 Agent 调工具，不约束插件自身 Node 调用 |
| `dsha-destructive-policy` | 只挂 `dsh-tools`/`dsh-tool-bash`/`dsh-tool-fs`/`dsh-tool-str-replace-editor`；自述 "Same-UID plugins and native terminals remain outside this policy" |
| `!!js` 配置 | Loader 用 `new Function(...) + eval` 在 Host 内执行；配合 HMR **写配置 = 任意代码执行 + 立即生效** |

### 6.2 结论

- 插件权限 = Host 权限，**没有** per-plugin 隔离；"隔离测试"只能是**进程/数据/端口层面**的隔离，不是安全沙箱。
- 第一轮测试的插件必须按"可完全信任的 Host 代码"对待；不能把"插件权限"当实验变量。

---

## 7. 测试隔离能力（已验证）

### 7.1 三层隔离

| 层 | 手段 | 状态 |
|---|---|---|
| 数据/配置 | `DSH_HOME=/tmp/...`（profile、sessions、storages、credentials 全部落临时目录） | ✅ 实测：隔离 Host 在 `/tmp/host-audit/home` 创建 sessions/storages，未写 `/root/.dsh` |
| profile/插件 | 临时 profile（`base` + `web-app` + 被测插件 `insert:`），不加载生产 profile | ✅ 实测：`--dump-config` 组合 + 真实 boot；插件 `apply` 收到 `agents/sessions/tools/systemPrompt/approval/llm` |
| 进程/端口 | 独立 node 进程，`--host 127.0.0.1 --port 39117/39119/39120`，不碰 PID 30172 | ✅ 实测：boot 成功、`[AUDIT_PROBE] active`、监听 39117、`dispose` 正常 |

### 7.2 已验证的隔离命令（可复现）

```bash
# 1) 临时 home + 临时 profile（base + web-app + 被测插件）
export DSH_HOME=/tmp/host-audit/home
mkdir -p "$DSH_HOME/profiles/probe"
cat > "$DSH_HOME/profiles/probe/package.json" <<'EOF'
{ "name":"dsh-profile-probe","private":true,
  "dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]}} }
EOF
cat > "$DSH_HOME/profiles/probe/cordis.patch.yml" <<'EOF'
- insert:
    - id: host-audit-probe
      name: /tmp/host-audit/test-plugin/index.mjs
EOF

# 2) 隔离 boot（不碰生产 profile/端口/数据）
env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/root DSH_HOME="$DSH_HOME" \
  node /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile probe --no-open --host 127.0.0.1 --port 39120
```

实测输出：

```
[AUDIT_PROBE] active {"pid":17044,"uid":0,"cwd":"/tmp/host-audit",
  "services":{"agents":true,"sessions":true,"tools":true,"systemPrompt":true,"approval":true,"llm":true}}
```

- 端口 `39117` 打开；无 token 时 401（与生产一致）。
- 终止后 `[AUDIT_PROBE] dispose`，端口关闭。

**更轻量的 headless 变体（已实测，不调模型/不联网）**：临时 profile 用 `base + headless`，在 `cordis.patch.yml` 里 `- id: headless-runner / disabled: true`，插入本地探针插件；`node .../bin.js --profile headless` 直接启动，退出码 0。产物仅 `/tmp/audit-session/home`（4 sessions，90KB），**不调用 LLM**。适合只验证"插件能看到哪些 session/header、能否跨插件写事件"。

### 7.3 隔离的边界（必须逐条确认）

| ID | 风险 | 说明 |
|---|---|---|
| R1 | **插件源共享** | 临时 profile 若 `link:/root/.dsh/plugin-src/...`，插件运行时的写入（DB/日志/`/sdcard/DSHA/**`）会命中**生产数据**。测试插件必须用独立数据目录，或只测不写 |
| R2 | **`--dump-config` 不是只读** | 会无条件重写 profile 的 `cordis.yml`；只在临时 `DSH_HOME` 用，禁止对生产 profile 跑 |
| R3 | **凭据/设备桥不随 HOME 隔离** | `.credentials.yaml`、`.bridge_token`、`/run/dsha-launcher/`、`127.0.0.1:3090` 是全局路径/单例；测试 Host 可能真的调 LLM / 操作设备 |
| R4 | **LAN 网关** | 生产 `0.0.0.0:3081` 已开（Basic Auth + 私网白名单，shell 等价）；测试 Host 不要开同类网关，测试期建议只走 loopback |
| R5 | **HMR** | profile patch 变更会 recompose + 重求值 `!!js`；测试期不要写生产 patch |
| R6 | **未捕获异步异常** | 插件 bug → 整 Host `exit(1)`；测试 Host 崩溃可接受，但不要在生产进程上做 |
| R7 | **`/sdcard` FUSE** | 原子写会 `EINVAL`；测试产物落 `/tmp` |
| R8 | **端口冲突** | 不要用 38105/3081/3090；用 39xxx |

---

## 8. 第一轮实机测试前置条件（Host 侧）

1. **隔离 Host**：临时 `DSH_HOME` + 临时 profile（base + web-app + 被测插件）+ 独立端口（39xxx），不加载生产 profile。
2. **不写生产**：禁止写 `/root/.dsh/profiles/web/cordis.patch.yml`（HMR + `!!js`）、禁止写生产 sessions/storages/`/sdcard/DSHA`；测试插件数据目录显式指向 `/tmp`。
3. **可信身份不由 Host 提供**：测试不要依赖 session id/cwd/owner 作为身份；若需要"主人/测试者"身份，由测试框架**显式注入**（配置/环境变量/独立映射），并在报告中注明"非 Host 安全边界"。
4. **授权层外置**：不要用 `ctx.approval` 冒充用户授权；需要用户确认的操作，由测试负责人手动确认或在 Host 之外实现。禁止创建真实用户授权。
   - 若要验证 approval 路由，用隔离实例（`DSH_HOME` 临时 + `DSH_PERMISSION_MODE=workspace-write` + 新端口），先放"只记录、返回 `next()`"的 stub answerer 验证得到 `unavailable`（零授权），再 `prepend` 返回 `allowed-once` 证伪"可自批"；**不要点生产面板、不要向生产加载测试插件**。
5. **权限假设**：测试插件 = 完全可信 Host 代码；不能把"插件能做什么"当隔离效果。工具层 full-access 下不会弹确认，测试脚本自己拦截危险操作。
6. **超时/错误自兜**：测试框架自建 `Promise.race` + `AbortController`；插件包住所有 timer/async 错误，避免整 Host 退出。
7. **网络边界**：测试期只用 loopback；生产 LAN 网关 3081 建议关闭/限制（需负责人授权，本轮未操作）。
8. **只读优先**：第一轮优先"加载 + 生命周期 + 只读会话观察"；写操作（记忆/会话/文件）放到临时目录，并逐项列出预期副作用。

---

## 9. 结论与未解决问题

### 9.1 总判定：READY WITH CONDITIONS

Host 侧**具备**进行第一轮隔离实机测试的条件：版本/进程/加载链清楚；隔离 Host 已实测可启动、可加载测试插件、可创建临时 session、可正常卸载；生产 PID 30172 未受影响。

### 9.2 子项判定

| 子项 | 判定 | 说明 |
|---|---|---|
| 版本/运行/部署信息 | **PASS** | 0.2.1-rc.2 + 48 DSHA patches；PID 30172 |
| 插件加载/生命周期/卸载 | **PASS** | 并发挂载、fiber/effect、非 required 失败隔离 |
| 失败隔离（未捕获异步异常） | **FAIL** | 插件 bug → 整 Host exit(1) |
| 可信 session ID | **BLOCKED** | 调用方可构造；Host 不签发 |
| 可信 cwd | **BLOCKED** | `meta.cwd` 仅校验绝对路径；可设 `/root` |
| conversation ID | **不存在** | 只有 session |
| 可信 owner | **BLOCKED** | Host 无 owner；Memory 插件配置决定 |
| 可信用户授权事件/API | **BLOCKED** | 只有工具级 approval；policy=never；waterfall 可被插件应答 |
| 工具审批是否可被插件绕过 | **FAIL** | 四条自批路径；无签名 grant/attestation |
| 工具取消 | **PASS** | callerSignal WeakMap + drain |
| 工具超时 | **FAIL**（作为硬超时） | 协作式、默认无、多数工具未声明 |
| 工具重试 | **PASS**（无隐藏重试） | 仅 LLM 层；DSHA 禁止自动重放 |
| 插件 FS/网络/进程隔离 | **FAIL** | 同进程同权限、无 ACL |
| 插件间会话隔离 | **FAIL** | untagged 监听器收到全部 session 事件；可向别人 live session append |
| 测试隔离能力 | **PASS（加载层）/ PARTIAL（全 Host）** | 临时 HOME/profile/端口已实测；数据面共享需逐条处理 R1–R8 |
| 生产未被触碰 | **PASS** | 只读；未重启/未改配置/未写生产数据 |

### 9.3 未执行 / 未找到

- **未执行**：生产 Host 重启/停止、profile/config 修改、真实用户授权创建、真实 session 写、部署。
- **未找到**：`runtime-patches.json` 引用的 `*-patch.json` 资产本体（设备与 harness repo 均无）；判断由 APK 安装期应用。
- **未验证**：生产 GUI 的实际 approval 交互（避免触发）；`dsh-authorization` 的具体 OAuth 流程（未创建真实授权）。

---

## 9.4 阻断项与未验证项（逐条）

### 阻断项（BLOCKED / FAIL）

| ID | 事项 | 判定 | 原因/影响 |
|---|---|---|---|
| B1 | 验证"Host 签发的可信 session/conversation/cwd/owner" | **BLOCKED** | Host 不提供不可伪造身份；session id/cwd 调用方构造；owner 仅插件配置/cwd 判定 |
| B2 | 验证"可信用户授权事件/API" | **BLOCKED** | 无签名 grant/attestation；只有工具级 approval；policy=never；waterfall 可被插件应答 |
| B3 | 依赖 Host 做 per-plugin 权限隔离 | **FAIL** | 同进程同权限、无 ACL；`dsha-destructive-policy` 同 UID 插件除外且 full-access 豁免 |
| B4 | 依赖 Host 超时兜底 | **FAIL** | 协作式、默认无、多数工具未声明；bash 超时转后台 job |
| B5 | 依赖插件失败不影响 Host | **FAIL** | 未捕获异步异常 → `exit(1)` |

### 未验证项（NOT RUN，本轮未执行）

1. 生产 GUI 审批面板的真实点击/拒绝（为避免触发生产 approval，未做）。
2. `dsh-authorization` 的 OAuth/设备码真实流程（未创建真实授权）。
3. `dsh --profile headless "task"` 的模型调用（会联网/计费，未做）。
4. 在**生产 profile** 下加载测试插件（禁止；只在临时 profile 验证）。
5. 从**第二台设备**访问生产 `0.0.0.0:3081` 网关（只做 loopback 401 探测）。
6. 在隔离实例中实际让插件 `prepend` 返回 `allowed-once` 证伪自批（只有源码机制 + 代码路径，标 [I]）。
7. DSHA patch asset 本体（`*-patch.json`）在设备/harness repo 均未找到；判定由 APK 安装期应用（[I]）。

---

## 10. 证据索引（命令 / 时间 / 退出码 / 路径）

| 证据 | 命令/路径 | 结果 |
|---|---|---|
| 版本 | `node -e "require('/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json')"` | 0.2.1-rc.2，gitHead 缺失 |
| 进程 | `/proc/30172/{cmdline,environ,status,cwd}` | PID 30172，web 38105，danger-full-access |
| 端口 | `/dev/tcp` 探测 | 38105/3081/3090 OPEN；38105 无 token 401 |
| profile | `/root/.dsh/profiles/web/{package.json,cordis.patch.yml}` | 24 bundles；10 个用户 patch 行 |
| 启动观察 | `grep DSHA_STARTUP /root/dsh-web.log` | 32 loading/loaded，0 issue |
| 补丁 | `/root/.dsh/runtime-patches.json` | 48 active |
| 隔离 boot | `/tmp/host-audit/probe-*.log` | `[AUDIT_PROBE] active`；39117/39119/39120；dispose |
| 会话伪造 | `/tmp/host-audit/probe-cwd.log` | 任意 id/cwd（含 `/root`），跨 session header 可读 |
| 运行时深挖 | `/tmp/audit-runtime/RUNTIME-AUDIT.md` | 794 行，含 loader/tools/permissions 行号 |
| 会话代码 | `dsh-session/lib/index.js:1039,1047-1049,1819-1827`；`dsh-api-session-controller/lib/index.js:508-525,755-787`；`dsh-scope/lib/index.js:327-338` | header 冻结；cwd 仅绝对路径；API 可指定 id/cwd；untagged 事件全局 |
| 审批代码 | `dsh-user-approval/lib/index.js:128-190`；`dsh-base/cordis.patch.yml:259-262` | policy never；waterfall 可应答；166 会话 asked=0 |
| 权限代码 | `dsha-destructive-policy/index.js:1,82,85-100` | 同 UID 插件不在策略内；full-access exempt |

## 11. 边界声明与副作用

未修改 `/root/.dsh`、`/usr/local/lib/node_modules`、生产 profile/插件/配置；未重启/停止 PID 30172；未向生产 web 发有副作用的请求；未写生产 sessions/记忆/设备数据；未创建真实用户授权；未改 HANDOFF/REPORT/PROJECT.md。测试写入仅 `/tmp/host-audit`、`/tmp/audit-*`，隔离 Host 为独立进程（已终止）。本归档提交只新增 `docs/audit/HOST-READINESS-AUDIT-2026-11-24.md`，不覆盖任何既有审计文件。
