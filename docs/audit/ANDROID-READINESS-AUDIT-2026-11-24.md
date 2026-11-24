<!-- Archived from coordination/Android 平台负责人报告.md at commit 1f1a176aaa118b8265e9f0a1fa151fb21e77fa84; source blob f1f89a1d54b2c0f6b9aa9816d4ca6346d5434713. Original source retained. -->

# ANDROID-REPORT-0005 · Android 平台负责人报告（第一轮实机测试设备侧准备）

> 会话：Android 平台负责人（DSHA Android 平台专业智能体）
> 覆盖任务：`ANDROID-ARCH-AUDIT-01`、`ANDROID-BACKGROUND-RECOVERY-DESIGN-01/02/03`、`ANDROID-ROUND1-DEVICE-READINESS-01`
> 迭代规则：本文件覆盖式更新、版本号递增（ANDROID-REPORT-0006…），不新增同类文件。
> 最近更新：2026-11-24 13:40 (Asia/Shanghai) · v5 第一轮实机测试设备侧准备
> 性质：只读核查。未安装/卸载/升级应用；未改权限；未清数据；未重启/停止 DSHA；未部署插件；未改共享 HANDOFF/REPORT。

## 版本历史

| 版本 | 时间 | 变更摘要 |
|---|---|---|
| 0001 | 11-21 02:45 | 平台基线、19 项能力矩阵、恢复设计初稿 |
| 0002 | 11-21 09:55 | 12 项裁决：recover、文件所有权、消费 8 问、回执/nextWake、四段状态机 |
| 0003 | 11-21 10:05 | inbox/outbox/ack 队列、ack 清理、轮询语义、nextWake 六字段、f2fs 持久性 |
| 0004 | 11-21 10:50 | 与 Autonomy v3 收口 8 项（A–H） |
| 0005 | 11-24 13:40 | **第一轮实机测试设备侧准备**：环境/宿主/部署/隔离/日志/后台/前置条件 → `READY WITH CONDITIONS` |

---

## 0. 阅读导航

**结论：`READY WITH CONDITIONS`**（7 项条件，见 §7；不满足 C1/C2 则改判 BLOCKED）

- 设备、DSHA、Host、插件、数据目录、日志、网络、资源全部完成实测；无 BLOCKED 项。
- 最大风险不是"没装好"，而是 **Host 会被杀/崩溃**：11-19 有一次 keepalive 线程 NPE 崩溃（crash buffer 实证），11-22 有一次无崩溃记录的重启（原因未知，OEM 或人工）。
- 数据隔离**可行**：三插件都支持环境变量改数据目录（已只读求值验证），可完全避开生产 DB。
- 日志采集**部分可用**：crash buffer 可读、插件日志齐全、DSH 会话日志完整；但 main logcat 几乎为空、ANR/tombstone 内容不可读、DSHA 自身诊断文件不存在。
- **不需要新 APK、不需要改权限、不需要更新插件**即可做第一轮隔离测试；若要用新版插件代码，应克隆到隔离目录，不要动生产安装。
- 设备变更：**0 项必需**；可选（不建议现在做）升级 DSHA 到 v0.2.2，但它**不修复**上述崩溃缺陷（已核对 v0.2.2 源码）。

**跨报告冲突（需 GPT 裁决）**：Autonomy v8 §20.7 写"Android：proot/共享存储/后台；**无前台服务**"——与设备实测不符：DSHA 有 `HarnessService`（`mHasForegroundServices=true`）。请以本报告 §6 为准。

---

## 1. 设备与系统版本（设备实测）

| 项 | 值 | 来源 |
|---|---|---|
| 机型 | vivo V2154A（PD2154，SM8350，8 核） | `getprop` / `dumpsys` |
| Android | 14（SDK 34）· OriginOS 14.1 · 指纹 `vivo/PD2154/PD2154:14/UP1A.231005.007` | `getprop` 13:23 |
| 屏幕 | 1080×2400 · dpi 480 · 竖屏 | `dumpsys activity` Configuration |
| 运行时长 | Uptime 5.57 天 / Realtime 6.40 天（约 11-18 03:40 开机） | `dumpsys meminfo` |
| 电量/充电 | 90%→83%（13:23→13:32），未充电 | `/app/device` |
| 存储 | 223G 总 / **94.9G 可用** / inode 用 10% | `df` |
| 内存 | 11.1G 总 / **2.9–3.2G 可用** / Swap 6.0G/8G 已用 | `free` |
| 网络 | Wi-Fi；DNS 8.8.8.8；HTTPS 出网 200（4.1s） | `curl` / `getent` |

> 推断：3 天内可用存储从 105G 降到 95G（约 −10G），与 214MB 会话日志、raw/媒体增长方向一致，但本轮未做增量归因。

## 2. DSHA 实际运行状态（设备实测）

| 项 | 值 | 证据 |
|---|---|---|
| 安装版本 | `0.2.1-rc.2-20261022.2100-dsh0.2.1-rc.2` · code 190 · minSdk 30 / targetSdk 37 | `/app/version`、`dumpsys package` |
| 安装/更新时间 | 2026-11-04 20:55:18（**未升级**） | 同上 |
| 进程 | pid **4466**，启动于 **11-22 09:06**，已运行 2d4h22m | `dumpsys activity processes` |
| 前台服务 | `HarnessService`、`DeviceBridgeService`、`DshaAccessibilityService`；`mHasForegroundServices=true` | 同上 |
| 优先级 | `oom adj cur=50`、`curProcState=4`、`cached=false`、`foregroundActivities=true` | 同上 |
| 前台状态 | `app_foreground=true`，当前页 `WebPreviewActivity`，屏幕亮 | `/app/device`、events 缓冲 |
| 无障碍 | 仅 `dsh.android.client/...DshaAccessibilityService`（11-21 时的 `com.example.oldman` 已移除） | `settings get secure` |
| 通知监听 | `com.dsha.notifyforwarder` 仍启用 | 同上 |
| 旧版本可用 | GitHub Release **v0.2.2（build357，2026-11-10）** 存在 | `gh release list` |
| 崩溃历史 | **11-19 10:56 `dsha-keepalive` 线程 NPE → 进程被杀**（详见 §6.2） | `logcat -b crash` |

## 3. Host 与插件部署位置（设备实测）

| 层 | 位置/PID | 说明 |
|---|---|---|
| PRoot | pid 30169（父 4466）`libproot.so --link2symlink -0 --rootfs=…/files/linux/ubuntu` | 伪 root uid 10328 |
| DSH Host | pid **30172** `node …/dsh/lib/bin.js web --no-open --host 127.0.0.1 --port 38105`，RSS **790MB** | DSH `0.2.1-rc.2` |
| 端口 | 3090（桥，loopback）· 38105（Web，loopback）· 9222（CDP）· 3081（LAN 网关，0.0.0.0）· 5037 关闭 | socket 实测 |
| 3091 | **closed**（通知触发端点）→ 通知触发空转 | socket 实测 |
| profile | `/root/.dsh/profiles/web/`；`package.json` 用 `link:` 指向 `plugin-src` | 文件实测 |
| 插件安装 | `/root/.dsh/plugin-src/` 8 个目录（persona/memory/autonomy/channel-bridge/douyin/media/hud/selfhost-boot） | 文件实测 |
| 插件版本 | persona **0.2.0** · memory **0.1.0** · autonomy **0.4.0** | `package.json` |
| 会话日志 | `/root/.dsh/sessions/` **214MB**（`session.v4.jsonl.zstd` 压缩） | `du` / `find` |

> 推断：生产安装树 = 部署镜像（前几轮核对为 `b47fcc2`），不是上游 main；Autonomy 自报与 GitHub HEAD 有 10 个文件差异。本轮未重新比对全部文件。

## 4. 数据隔离能力（实测 + 求值验证）

### 4.1 生产数据位置（只读核对，未写）

| 域 | 路径 | 规模 |
|---|---|---|
| Memory | `/sdcard/DSHA/记忆/数据/memory.db` | 95.7MB + WAL 5.6MB + shm；45 表；memories 262、raw_meta 64,047 |
| Persona | `/sdcard/DSHA/人格/数据/persona.db` | 876KB + WAL 4.1MB |
| Autonomy | `/sdcard/DSHA/生活/数据/autonomy.db` | 2.47MB + WAL 4.1MB |
| 日志 | memory.log 507KB；autonomy.log 1.2MB(+.1)；device-trigger.log 18MB；notification-trigger.log 8.9MB | — |

> 只读查询用 `node:sqlite` `readOnly:true`，未执行任何写、未做迁移、未清理。

### 4.2 隔离手段（已只读求值验证）

| 插件 | 覆盖变量 | 验证结果 |
|---|---|---|
| Memory | `DY_MEMORY_DIR`（`lib/config.js:5`） | `DY_MEMORY_DIR=/root/r1-test` → `DATA_DIR=/root/r1-test` ✅ |
| Persona | `DSH_PERSONA_DIR`（`lib/config.js:44`） | 同上 ✅ |
| Autonomy | `DSH_AUTONOMY_DIR` / `raw.dataDir` / `raw.dbPath`（`lib/config.js:288-298`） | `dataDir=/root/r1-test, dbPath=/root/r1-test/autonomy.db` ✅ |

- 探测：`/root/r1-isolation-probe-*` 建目录（700）+ 独立 SQLite（600）→ 建表/插入/查询成功；**已删除探测目录**。
- 共享存储：`/sdcard/DSHA/测试/` 可写（建/删探测文件成功）。
- 端口：31873 空闲，可作隔离 Host 端口。
- 合并结论：**可在独立目录 + 独立 DSH_HOME/profile + 独立端口下跑测试，全程不碰生产 DB**。

### 4.3 隔离的已知缺口

1. Autonomy 的 `home.cwd/logPath/deliverLog/practiceDir/stickerDirs` 默认仍指向生产路径，需 profile 配置覆盖或测试期不加载 autonomy。
2. 测试 session 的 cwd 不得放在 `渠道/`、`生活/数据/home`、`douyin/` 及其前缀（Autonomy v8 C1），否则注入/归档会命中。
3. `dy_say`/`bash` 全局可用（Autonomy v8 C3），Android 侧无法拦截，属 Host 配置问题。

## 5. 日志采集与故障回溯能力（实测）

| 通道 | 可用性 | 证据/限制 |
|---|---|---|
| 插件日志 | **PASS** | memory.log / autonomy.log(+.1) / device-trigger.log / notification-trigger.log 均可读 |
| Channel Bridge 日志 | **PASS** | 5.1MB（+5.0MB `.1`），含重连/投递统计 |
| DSH 会话日志 | **PASS** | 214MB，`session.v4.jsonl.zstd`（需 zstd 解） |
| Android crash buffer | **PASS（关键）** | `logcat -d -b crash` 可读，133 行，跨度 11-18→11-24 |
| Android events buffer | 部分 | 仅约 1 分钟窗口（13:22:11–13:23:20） |
| Android main logcat | **FAIL（近乎不可用）** | `logcat -d -t 300` 仅 23 行；`-b main/system/all` 为空 |
| ANR 文件 | 列表可读、**内容不可读** | `/data/anr` 目录可列（11-23 六连 ANR、11-24 00:44 955KB），文件 0600 system，`head` 拒绝 |
| Tombstone | **不可读** | `/data/tombstones` Permission denied |
| DSHA 自身诊断 | **不存在** | `diagnostic-events.txt` 在 app `files/` 下未找到（`files/` 仅 `linux/`） |
| dmesg/bugreport/dropbox | 被设备策略拦截 | `POLICY_BLOCKED`（126） |

> 结论：测试期回溯以 **crash buffer + 三插件日志 + DSH 会话 + bridge 日志** 为主；Android 系统级（ANR/tombstone/main log）不可用，必须提前接受这个证据边界。

## 6. 后台运行限制（实测 + 系统配置）

### 6.1 有利条件
- Doze 白名单含 **uid 10328**（`mDeviceIdleWhitelist`）。
- 前台服务在跑；后台时 `adj=50`、`procState=4`、`cached=false`。
- 电池优化未限制；设备未进入省电（`mWakefulness=Awake`）。

### 6.2 已发生的两次进程中断（关键）
| 时间 | 事件 | 证据 |
|---|---|---|
| 11-19 10:56 | `FATAL EXCEPTION: dsha-keepalive`，pid 7633，`DshAuthSession.attempt:145` NPE（`HttpProtocol.readHead` 返回 null 后未判空）→ 进程死亡 | crash buffer 原始堆栈 |
| 11-22 09:06 | 新进程启动（pid 4466），**该时间点无 DSHA 崩溃记录** → 原因未知（OEM 清理 / 用户重开 / 系统重启服务） | `.dsha-web.pid` 11-22 09:06；进程 startTime |

- 缺陷状态：**上游 main `36d89b7` 仍未判空**；**v0.2.2（11-10）源码同样未判空** → 升级 APK 不会修复。
- 影响：长跑测试若 keepalive 探测遇到"连接被关闭且无响应"，进程会整体崩溃，Host 与测试同时中断。

### 6.3 系统限制与噪声
- 11-23 14:05–14:07 连续 6 个 ANR、11-24 00:44 一个 955KB ANR（进程未知，内容不可读）。
- 11-24 13:06 `com.openai.chatgpt` OOM 崩溃（`OutOfMemoryError`，堆 256MB）→ 设备内存压力真实存在。
- 厂商自启动/后台管理开关应用无法读取（`PermissionActions` 注释），只能实测。

## 7. 第一轮实机测试的设备侧前置条件

| # | 条件 | 性质 | 不满足的后果 |
|---|---|---|---|
| C1 | 测试使用**独立数据目录**：`DY_MEMORY_DIR`/`DSH_PERSONA_DIR`/`DSH_AUTONOMY_DIR` 指向 `/root/dsha-r1/…` 或 `/sdcard/DSHA/测试/r1/…`（**不要**用生产路径） | 必需 | 可能写生产记忆/人格 → 应判 BLOCKED |
| C2 | 测试使用**独立 Host**：独立 `DSH_HOME`、独立 profile、端口 **31873**；不覆盖生产 profile | 必需 | 与生产 Host 互相污染 |
| C3 | 测试 session cwd 放在 `/sdcard/DSHA/测试/...`，避开 `渠道/`、`生活/数据/home`、`douyin/` 前缀 | 必需（Autonomy C1） | 测试事件进汐的记忆/情绪 |
| C4 | 测试期接受 **Host 可能被杀**：由 DSH 侧监控并允许在授权范围内重启；测试用例需可断点续跑 | 必需 | 长跑结果不可信 |
| C5 | 日志采集按 §5 执行；**不依赖** main logcat / ANR 内容 / tombstone | 必需 | 故障无法回溯 |
| C6 | 测试期间避免并发重任务（≤2 subagent + ≤1 Chromium）；`MemAvailable<1.5GB` 时降级 | 建议 | OOM 风险 |
| C7 | 不安装新 APK、不改系统权限、不更新生产插件；如需新代码，克隆到隔离目录 | 硬约束 | 违反本轮边界 |

## 8. 是否需要设备变更（方案 + 风险，均不执行）

| 变更 | 是否必需 | 方案 | 风险 | 建议 |
|---|---|---|---|---|
| 安装/升级 DSHA APK | **否** | 升级到 v0.2.2（build357） | APK 更新需重装/覆盖，可能重置运行时；且**不修复** keepalive NPE；需负责人授权 | 暂不升级 |
| 新增 Android 权限 | **否** | — | — | 不做 |
| 更新/部署插件 | **否** | 如需新版代码，克隆到隔离目录并用独立 profile 加载 | 改生产安装会污染基线 | 只在隔离目录 |
| 建立测试数据目录 | 是（隔离必需） | `/root/dsha-r1/…`（f2fs，快）或 `/sdcard/DSHA/测试/r1/…`（FUSE，可读性好） | 目录创建属可逆操作 | 由 DSH 在获授权后创建 |
| 修改 profile / 端口 | 是（隔离必需） | 新建 profile `r1-test` + 31873 | 需 DSH 操作；不得改 `web` profile | 授权后做 |

## 9. 证据索引

- 设备：`/app/version`、`/app/device`、`getprop`、`dumpsys package/activity/power/battery/meminfo`（13:23–13:35）
- 日志：`logcat -d -b crash`（133 行）、`-b events`（1337 行，1 分钟窗口）、`logcat -d -t 300`（23 行）
- 文件：`/root/.dsh/profiles/web/package.json`、`plugin-src/*/package.json`、`/root/.dsha-web.pid`、`/data/anr` 列表
- 隔离：`DY_MEMORY_DIR`/`DSH_PERSONA_DIR`/`DSH_AUTONOMY_DIR` 求值；`/root` 与 `/sdcard/DSHA/测试` 写探测（已回收）
- 源码：`DSH-APP/DSHA@36d89b7` `HttpProtocol.readHead:102`（可返回 null）、`DshAuthSession.attempt:114-117`（未判空）；`v0.2.2` tag 同文件同写法
- 跨报告：`coordination/Autonomy 自主系统负责人报告.md` v8 §20（READY WITH CONDITIONS，C1–C3）、§20.7（"Android 无前台服务" — **与实测冲突**）

## 10. 边界声明

本轮只读：未安装/卸载/升级应用；未改权限；未清数据；未重启/停止 DSHA；未部署插件；未改生产 DB/profile；未改共享 HANDOFF/REPORT。仅创建并回收了两个探测文件（`/root/r1-isolation-probe-*`、`/sdcard/DSHA/测试/.probe-*`）。
