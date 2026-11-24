# ANDROID-READINESS-AUDIT-2026-11-24

> 会话：Android 平台负责人（DSHA Android 平台专业智能体）
> 任务：`ANDROID-ROUND1-DEVICE-READINESS-01`（DSHA「汐」第一轮实机测试设备侧准备）
> 时间：2026-11-24 13:22–13:50 (Asia/Shanghai)
> 性质：**只读核查**。未安装/卸载/升级应用；未改系统权限；未清真实数据；未重启或停止 DSHA；未部署插件；未改生产 DB/profile/config。
> 归档说明：本轮报告按归档规则保存于 `docs/audit/`，与 `coordination/Android 平台负责人报告.md`（v5）内容同源；本文件补全证据分级与测试结果明细。

## 0. 结论

**`READY WITH CONDITIONS`**（无技术 BLOCKED）。设备、DSHA、Host、插件、数据目录、日志、网络、资源均已实测；隔离测试可行，但需满足 C1–C7（§11）。

三条最关键的结论：
1. **不需要新 APK、不需要改权限、不需要更新生产插件**即可做第一轮隔离测试。
2. **Host 会被杀/崩溃**：11-19 有一次 keepalive 线程 NPE 崩溃（设备证实），11-22 有一次无崩溃记录的重启（推断）；该缺陷在上游 main 与 v0.2.2 均未修复（源码证实）。
3. **日志能力不完整**：crash buffer 与插件/会话日志可用；main logcat 近乎为空、ANR/tombstone 内容不可读（设备证实）。测试前必须接受这个证据边界。

---

## 1. 证据分级与基线

### 1.1 分级定义（全文严格区分）
- **【源码证实】** 来自 `DSH-APP/DSHA` 源码或插件源码（给出文件/行号/commit）。
- **【测试证实】** 本轮在本机实际执行的最小验证（给出命令与结果）。
- **【设备证实】** 来自设备命令输出（`getprop`/`dumpsys`/`logcat`/`df` 等），附时间。
- **【推断】** 由证据推导、未经直接观测，必须标注。

### 1.2 基线
| 对象 | 值 | 方式 |
|---|---|---|
| DSHA 源码 | `DSH-APP/DSHA` main `36d89b72294348d0482d509109cf8e76d51fc1cb`（2026-11-14） | `git ls-remote` |
| 归档分支 | `ba-song/dsh-memory-core` `coordination/project-handoff` HEAD `1f1a176aaa118b8265e9f0a1fa151fb21e77fa84` | `git fetch` + `rev-parse` |
| 上一版会话报告 | `coordination/Android 平台负责人报告.md` blob `f1f89a1d54b2c0f6b9aa9816d4ca6346d5434713`（v5） | `git ls-tree` |
| 关联报告 | `coordination/Autonomy 自主系统负责人报告.md` v8（ROUND1-PREP-01） | 只读 |

---

## 2. 设备与系统【设备证实】

| 项 | 值 | 命令/时间 |
|---|---|---|
| 机型 | vivo V2154A（PD2154，SM8350，8 核） | `getprop ro.product.model` 13:23 |
| Android | 14（SDK 34）；OriginOS 14.1；指纹 `vivo/PD2154/PD2154:14/UP1A.231005.007` | `getprop` 13:23 |
| 屏幕 | 1080×2400、dpi 480、竖屏 | `dumpsys activity` Configuration |
| 开机时长 | Uptime 5.57 天 / Realtime 6.40 天 | `dumpsys meminfo` 13:31 |
| 电量 | 90%（13:23）→ 83%（13:32），未充电 | `/app/device` |
| 存储 | 223G 总 / **94.9G 可用** / inode 10% | `df -h` / `df -i` 13:26 |
| 内存 | 11.1G 总 / **可用 2.9–3.2G** / Swap 用 6.0G（共 8G） | `free -m` 13:26 |
| 网络 | Wi-Fi；DNS 8.8.8.8/223.5.5.5；`https://api.github.com` = 200（4.1s） | `curl` 13:32 |

【推断】可用存储 3 天内从 105G 降到 95G（约 −10G），方向与会话日志/raw/媒体增长一致，但本轮未做增量归因。

---

## 3. DSHA 运行状态【设备证实】

| 项 | 值 | 命令/时间 |
|---|---|---|
| 版本 | `0.2.1-rc.2-20261022.2100-dsh0.2.1-rc.2`，code 190，minSdk 30 / targetSdk 37 | `/app/version`、`dumpsys package` 13:23 |
| 安装/更新 | 2026-11-04 20:55:18（**未升级**） | `dumpsys package` |
| 进程 | pid **4466**，启动 **11-22 09:06**，已运行 2d4h22m | `dumpsys activity processes` 13:24 |
| 前台服务 | `HarnessService`、`DeviceBridgeService`、`DshaAccessibilityService`；`mHasForegroundServices=true` | 同上 |
| 优先级 | `oom adj cur=50`、`curProcState=4`、`cached=false`、`foregroundActivities=true` | 同上 |
| 前台 | `app_foreground=true`，当前页 `WebPreviewActivity`，屏幕亮 | `/app/device`、events 缓冲 |
| 无障碍 | 仅 `dsh.android.client/...DshaAccessibilityService`（11-21 时的 `com.example.oldman` 已移除） | `settings get secure` 13:24 |
| 通知监听 | `com.dsha.notifyforwarder` 仍启用 | 同上 |
| 可升级版本 | GitHub Release **v0.2.2（build357，2026-11-10）** | `gh release list` 13:34 |

---

## 4. Host 与插件部署【设备证实 + 源码证实】

| 层 | 值 | 证据 |
|---|---|---|
| PRoot | pid 30169（父 4466），`libproot.so --link2symlink -0 --rootfs=…/files/linux/ubuntu` | `ps` 13:23 |
| DSH Host | pid **30172**，`node …/dsh/lib/bin.js web --no-open --host 127.0.0.1 --port 38105`，RSS **790MB** | `ps` 13:23 |
| 版本 | DSH `0.2.1-rc.2` | `dsh --version` |
| 端口 | 3090（桥）· 38105（Web）· 9222（CDP）仅回环；3081（LAN网关）0.0.0.0；**3091 closed**；5037 closed | socket 实测 13:23 |
| profile | `/root/.dsh/profiles/web/`；`package.json` 的插件依赖用 `link:` 指向 `plugin-src` | 文件实测 13:25 |
| 插件安装 | `/root/.dsh/plugin-src/` 8 个目录 | `ls` 13:25 |
| 插件版本 | persona **0.2.0**、memory **0.1.0**、autonomy **0.4.0** | `package.json` |
| 会话日志 | `/root/.dsh/sessions/` **214MB**（`session.v4.jsonl.zstd`） | `du` 13:31 |

【源码证实】`/root/.dsh/profiles/web/package.json` 第 7/17/19 行为 `link:/root/.dsh/plugin-src/...`；生产安装与 GitHub main 存在差异（Autonomy 自报 10 个文件），本轮未全量比对。

---

## 5. 数据与隔离能力

### 5.1 生产数据（只读核对，未写）
| 域 | 路径 | 规模/结构【设备证实】 |
|---|---|---|
| Memory | `/sdcard/DSHA/记忆/数据/memory.db` | 95.7MB + WAL 5.6MB + shm；45 表；memories 262、raw_meta 64,047（13:26 只读查询） |
| Persona | `/sdcard/DSHA/人格/数据/persona.db` | 876KB + WAL 4.1MB |
| Autonomy | `/sdcard/DSHA/生活/数据/autonomy.db` | 2.47MB + WAL 4.1MB |
| 日志 | memory.log 507KB；autonomy.log 1.2MB(+.1)；device-trigger.log 18MB；notification-trigger.log 8.9MB |

查询方式：`node:sqlite` `{readOnly:true}`，仅 `PRAGMA user_version`、`sqlite_master`、`count(*)`；未执行写、未迁移、未清理。

### 5.2 隔离手段【测试证实】
| 测试 | 命令/方法 | 结果 |
|---|---|---|
| T1 目录与权限 | `mkdir -p /root/r1-isolation-probe-*/{db,logs,work}` | 建目录 700、文件 600 ✅ |
| T2 独立 SQLite | `node:sqlite` 建 `test.db`、建表/插入/查询 | `rows=1`、`journal=delete` ✅ |
| T3 生产库只读 | `readOnly:true` 打开 memory.db | `user_version=0`、45 表、memories 262 ✅（未写） |
| T4 Memory 覆盖 | `DY_MEMORY_DIR=/root/r1-test` 求值 `config.js` | `DATA_DIR=/root/r1-test` ✅ |
| T5 Persona 覆盖 | `DSH_PERSONA_DIR=/root/r1-test` | `DATA_DIR=/root/r1-test` ✅ |
| T6 Autonomy 覆盖 | `DSH_AUTONOMY_DIR=/root/r1-test` + `loadConfig` | `dataDir=/root/r1-test, dbPath=/root/r1-test/autonomy.db` ✅ |
| T7 共享存储 | `/sdcard/DSHA/测试/.probe-*` 建/删 | 成功 ✅ |
| T8 端口预留 | 连接 `127.0.0.1:31873` | free ✅ |
| T9 探测回收 | `rm -rf /root/r1-isolation-probe-*`；删 `.probe-*` | 已回收 ✅ |

【源码证实】覆盖变量位置：memory `lib/config.js:5`（`DY_MEMORY_DIR`）、persona `lib/config.js:44`（`DSH_PERSONA_DIR`）、autonomy `lib/config.js:288-298`（`DSH_AUTONOMY_DIR`/`dataDir`/`dbPath`）。

### 5.3 隔离缺口
1. Autonomy 的 `home.cwd/logPath/deliverLog/practiceDir/stickerDirs` 默认仍指向生产路径，需 profile 覆盖或测试期不加载 autonomy。
2. 测试 session cwd 不得落在 `渠道/`、`生活/数据/home`、`douyin/` 及其前缀（Autonomy v8 C1），否则注入/归档会命中。
3. `dy_say`/`bash` 全局注册，Android 侧无法拦截（Host 配置问题）。

---

## 6. 日志与故障回溯【测试证实】

| 通道 | 可用性 | 证据 |
|---|---|---|
| 插件日志 | **PASS** | memory.log / autonomy.log(+.1) / device-trigger.log / notification-trigger.log |
| Channel Bridge 日志 | **PASS** | 5.1MB（+ `.1` 5.0MB），含重连/投递统计 |
| DSH 会话日志 | **PASS** | 214MB，`session.v4.jsonl.zstd` |
| Android crash buffer | **PASS（关键）** | `logcat -d -b crash`：133 行，跨度 11-18→11-24 |
| Android events buffer | **部分** | 仅约 1 分钟窗口（13:22:11–13:23:20，1337 行） |
| Android main logcat | **FAIL** | `logcat -d -t 300` 仅 23 行；`-b main/system/all` 为空 |
| ANR 文件 | 列表可读、内容不可读 | `/data/anr` 可列（11-23 六连 ANR、11-24 00:44 955KB），文件 0600 system，`head` 被拒 |
| Tombstone | **FAIL** | `/data/tombstones` Permission denied |
| DSHA 自身诊断 | **FAIL（不存在）** | `files/diagnostic-events.txt` 未找到；`files/` 仅含 `linux/` |
| dmesg / bugreport / dropbox | **BLOCKED** | `[POLICY_BLOCKED]` 126 |

**测试期回溯方案**：crash buffer + 三插件日志 + DSH 会话 + bridge 日志；不承诺 Android 系统级（ANR/tombstone/main）证据。

---

## 7. 后台与可靠性

### 7.1 有利条件【设备证实】
- Doze 白名单含 uid **10328**；前台服务在跑；后台时 `adj=50`、`procState=4`、`cached=false`；`mWakefulness=Awake`。

### 7.2 已发生的两次进程中断
| 时间 | 事件 | 证据级别 |
|---|---|---|
| 11-19 10:56 | `FATAL EXCEPTION: dsha-keepalive`（pid 7633）：`DshAuthSession.attempt:145` NPE，调用链 `HttpProtocol.readHead → DshAuthSession.exchange → WebHealthProbe.probe → HarnessService.startKeepAlive:526` → 进程死亡 | 【设备证实】crash buffer 原始堆栈 |
| 11-22 09:06 | 新进程启动（pid 4466），该时刻**无 DSHA 崩溃记录** → 原因未知（OEM 清理 / 用户重开 / 系统重启服务） | 【设备证实】`.dsha-web.pid` + 进程 startTime；【推断】原因 |

### 7.3 缺陷状态【源码证实】
- `HttpProtocol.readHead` 在首行前 EOF 时 `if (first == null) return null;`（`HttpProtocol.java:102`）。
- `DshAuthSession.attempt` 直接取 `response.status`（`DshAuthSession.java:114-117`），**无判空**。
- 上游 main `36d89b7` 同样写法；**v0.2.2 tag 的同一文件同样未判空** → 升级 APK 不修复。

### 7.4 系统噪声与资源压力
- 11-23 14:05–14:07 连续 6 个 ANR；11-24 00:44 一个 955KB ANR（进程未知，内容不可读）。
- 11-24 13:06 `com.openai.chatgpt` OOM 崩溃（堆 256MB）→ 内存压力真实。
- 厂商自启动/后台管理开关应用不可读（DSHA 源码 `PermissionActions` 注释），只能实测。

---

## 8. 测试结果汇总（本轮实际执行）

| # | 测试 | 结论 |
|---|---|---|
| T1–T2 | 隔离目录 + 独立 DB | **PASS** |
| T3 | 生产库只读查询 | **PASS（只读）** |
| T4–T6 | 三插件目录覆盖 | **PASS** |
| T7 | 共享存储写入 | **PASS** |
| T8–T9 | 端口预留、探测回收 | **PASS** |
| T10 | 网络出网 | **PASS** |
| T11 | crash buffer 读取 | **PASS** |
| T12 | main logcat | **FAIL** |
| T13 | ANR 内容 / tombstone | **FAIL（权限）** |
| T14 | DSHA 诊断文件 | **FAIL（不存在）** |
| T15 | bugreport/dmesg/dropbox | **BLOCKED（策略）** |
| T16 | Host 启动/停止、kill/reboot | **NOT RUN**（禁止） |

---

## 9. 风险与阻断项

| # | 风险 | 级别 | 状态 |
|---|---|---|---|
| R1 | Host 可能崩溃（keepalive NPE，未修复）或被杀（11-22 未知原因） | **高** | 无技术阻断，但长跑结果需可续跑 |
| R2 | 内存压力（可用 2.9–3.2G、swap 6/8G、node 790MB） | 中高 | 需控制并发 |
| R3 | main logcat 近乎为空 | 中 | 证据边界，已给替代方案 |
| R4 | ANR/tombstone 内容不可读 | 中 | 同上 |
| R5 | Autonomy 默认路径仍指生产，隔离需配置覆盖 | 中 | 条件 C1/C2 覆盖 |
| R6 | `dy_say`/`bash` 全局可用 | 高（外部副作用） | 属 Host 配置，Autonomy C3 |
| R7 | 存储 3 天减少约 10G | 低 | 需持续观察 |
| R8 | OEM 自启动/后台策略不可读 | 中 | 只能实测 |
| R9 | 3091 通知端点关闭，触发空转并写日志 | 低 | 测试期可忽略 |
| R10 | 生产插件与上游存在差异 | 中 | 测试用隔离克隆 |

**阻断项**：无技术 BLOCKED；若 C1/C2 不满足则判 BLOCKED（数据污染风险）。

---

## 10. 未验证项（NOT RUN / INCONCLUSIVE）

- kill / reboot 实验（本轮禁止）→ **NOT RUN**
- 后台启动 FGS 是否被 vivo 拒绝 → **INCONCLUSIVE**
- OEM 是否拦截 BOOT_COMPLETED / 冻结应用 → **INCONCLUSIVE**
- 双 Host 并发（生产 + 测试） → **NOT RUN**
- 隔离 Host 实际启动与端口占用 → **NOT RUN**
- f2fs 上 hardlink/fsync 实测表现 → **NOT RUN**
- 11-22 重启的直接原因 → **INCONCLUSIVE（推断）**
- ANR 归属进程 → **INCONCLUSIVE（内容不可读）**
- `MANAGE_EXTERNAL_STORAGE` 未授却可全盘读写的 appops 级解释 → **INCONCLUSIVE**

---

## 11. 第一轮测试设备侧前置条件（C1–C7）

| # | 条件 | 性质 |
|---|---|---|
| C1 | 独立数据目录（`DY_MEMORY_DIR`/`DSH_PERSONA_DIR`/`DSH_AUTONOMY_DIR` → `/root/dsha-r1/…` 或 `/sdcard/DSHA/测试/r1/…`），不使用生产路径 | 必需 |
| C2 | 独立 Host：独立 `DSH_HOME`、独立 profile、端口 **31873**；不覆盖生产 profile | 必需 |
| C3 | 测试 session cwd 放 `/sdcard/DSHA/测试/...`，避开 `渠道/`、`生活/数据/home`、`douyin/` 前缀 | 必需 |
| C4 | 接受 Host 可能中断；测试可断点续跑；重启需在授权范围 | 必需 |
| C5 | 日志按 §6 采集，不依赖 main logcat / ANR 内容 / tombstone | 必需 |
| C6 | 控制并发（≤2 subagent + ≤1 Chromium）；`MemAvailable<1.5GB` 降级 | 建议 |
| C7 | 不装新 APK、不改系统权限、不更新生产插件；新代码克隆到隔离目录 | 硬约束 |

---

## 12. 设备变更方案（均未执行）

| 变更 | 必需 | 方案 | 风险 | 建议 |
|---|---|---|---|---|
| 升级 DSHA APK | 否 | v0.2.2 build357 | 覆盖安装可能重置运行时；**不修复 keepalive NPE**；需授权 | 暂不升级 |
| 新增权限 | 否 | — | — | 不做 |
| 更新/部署插件 | 否 | 隔离目录克隆 + 独立 profile | 改生产会污染基线 | 隔离目录 |
| 建测试目录 | 是（隔离） | `/root/dsha-r1/…` 或 `/sdcard/DSHA/测试/r1/…` | 可逆 | 授权后由 DSH 创建 |
| 新建 profile/端口 | 是（隔离） | profile `r1-test` + 31873 | 不得改 `web` profile | 授权后做 |

---

## 13. 证据索引

- 设备命令：`getprop`、`dumpsys package/activity/power/battery/meminfo`、`df/free`、socket 探测（13:23–13:35）
- 日志：`logcat -d -b crash`（133 行）、`-b events`（1337 行）、`-t 300`（23 行）
- 文件：`/root/.dsh/profiles/web/package.json`、`plugin-src/*/package.json`、`/root/.dsha-web.pid`、`/data/anr` 列表、`/sdcard/DSHA/生活/数据/logs/`
- 源码：`HttpProtocol.java:102`、`DshAuthSession.java:114-117`、`HarnessService.java:526`、`plugin config.js:5/44/288-298`
- 跨报告：`coordination/Autonomy 自主系统负责人报告.md` v8 §20（C1–C3）；其 §20.7「Android 无前台服务」与本报告 §3 冲突，以设备实测为准

## 14. 边界声明

只读核查：未安装/卸载/升级应用；未改权限；未清数据；未重启/停止 DSHA；未部署插件；未改生产 DB/profile/config；未改共享 `HANDOFF.md`/`REPORT.md`。仅创建并回收探测文件：`/root/r1-isolation-probe-*`、`/sdcard/DSHA/测试/.probe-*`。
