# REPORT-0001 · P0 staging plan v5 只读复核
## 2026-11-20 23:00 · 只读 · HANDOFF-0044

> 任务：P0 staging plan v5 最终只读复核（基于 HANDOFF-0042/0043）
> 开发 HEAD：`7548e49ed0b8d8673818464325d8e72ec7704b27`
> 本轮未解包、未 npm ci、未运行测试、未创建 staging/profile、未执行 dsh plugin add、未启动 host、未连生产 DB、未部署。

## 1. 结论

**PLAN V5 REVIEW PASS（仅设计/静态复核）。**

只代表可以进入下一阶段 staging；不代表 staging 已通过，更不代表生产部署授权。

前一轮三处阻塞已修正：
1. `dsh.profile.bundles` 已按字符串数组断言；
2. web 默认 bind host 已改为 `127.0.0.1`；
3. 候选源码 commit 已固定为 `7548e49...`。

## 2. 环境与版本

- H/HANDOFF 基线：HANDOFF-0043（实际读取 commit `ac19190...`，blob `b2fee5cc...`）；其中 §41 是 GPT plan v5，§42 是 REPORT 协议。
- 开发 HEAD：`7548e49ed0b8d8673818464325d8e72ec7704b27`。
- Node v24.19.0；node:sqlite SQLite 3.53.3。
- CI #90：run `44751203163`，head `7548e49`，success（GitHub API 核实）。

## 3. profile bundle 事实

- 实际 profile `/root/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 是**字符串数组**。
- `@deepseek-ai/dsh-base` 0.2.1-rc.2：`dsh.bundle.patch: ./cordis.patch.yml`。
- `@deepseek-ai/dsh-web-app` 0.2.1-rc.2：`dsh.bundle.patch: [ ...5 patch... ]`。
- 候选 `dsh-memory-core` 0.1.0：`dsh.bundle.patch: ./cordis.patch.yml`。
- 三个包 manifest 都**没有** `dsh.profile.bundles`；该字段只在 profile manifest。
- loader 按 bundle 名称解析 package，再读包内 `dsh.bundle.patch`。

## 4. profile 初始化流程

源码：`@deepseek-ai/dsh/lib/plugin-BiveYA7h.js`、`@deepseek-ai/dsh-plugin-manager/lib/types/operations.js`。

- `dsh plugin --profile p0-staging add @deepseek-ai/dsh-web-app`：profile 缺失时初始化 base，再 pnpm add web，`reconcile` 把 web 加入 bundles。
- 再 `add "link:$PLUGIN"`：保留 base/web，把候选加入 dependencies/bundles，预期创建 node_modules symlink。
- 两条命令都在 `HOME`/`DSH_HOME` staging 下运行；源码未硬编码生产 profile。
- 任一步失败会留下已初始化 profile；plan 要求停止/保留现场，正确。
- 精确断言：`dsh.profile.bundles` 长度3、去重后3、精确名称 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-memory-core`，无旧版/额外 bundle；候选 symlink realpath=`$PLUGIN`。
- 注意：`dsh plugin add @deepseek-ai/dsh-web-app` 可能走 pnpm registry；若 DSHA 离线/registry 不可用，staging 应 BLOCKED，不应改生产配置。

## 5. host / 端口

- 精确命令：`env HOME=$STAGE_HOME DSH_HOME=$STAGE_DSH_HOME /root/dsh-bin/dsh --profile p0-staging --port 31873 --no-open`。
- `--profile` 顶层；`--port`/`--no-open` 由 web app 接收；不需要 `web` 子命令。
- 默认 bind host `127.0.0.1`（`dsh-web-app/cordis.patch.yml:183`）；Node 预检 `127.0.0.1:31873` 一致。
- 预检只证明瞬间可 bind；启动后仍需 PID/日志/TCP connect/监听地址/Cordis 注册次数/strace 审计。

## 6. 候选包

- 固定 commit `7548e49...`。
- `git clone --filter=blob:none --no-checkout` + `git fetch origin $COMMIT` + `FETCH_HEAD` 校验 + `git archive` 静态可行；只归档 tracked 文件，不含 node_modules/DB/config。
- 根目录 `dsh-memory-core/`，`--strip-components=1` 后结构正确。
- 应记录完整成员清单、tar SHA256、解包后 package name/version；本轮未生成/未解包（NOT RUN）。

## 7. schema 测试

- `tests/fixtures/schema-v4-ddl.mjs` 为冻结 schema4 DDL；
- `7548e49` 的 snapshotColumns 测试：先 DROP valid_to，再建 `snapshot(id,memory_id)`，让 `idx_ers_memory(memory_id,id)` 成功，随后进入 `snapshotColumns` 显式缺列分支，报 `E_SCHEMA_MIGRATION_INCOMPLETE: ... missing revision...`；
- 断言 version=4、snapshot 2列、valid_to 回滚、三个索引无、integrity=ok；
- ALTER/FTS5/version>code/非法 version 测试均存在；
- CI #90 success；DSHA SQLite 3.53.3 实跑仍 NOT RUN。
- 小缺口：ALTER 本身失败等变体未覆盖；不阻塞 plan v5，但 staging 应实跑。

## 8. 快照/隔离

- 快照前停写、关连接、`PRAGMA wal_checkpoint(TRUNCATE)`、busy=0、`VACUUM INTO`、SHA256、恢复后 schema_version=4/ID/行数/integrity：设计正确。
- 隔离配置、关闭 memoryRecord/memoryInject/permanentArchive/m3_2b/维护调度、owner 置空、strace 审计：plan v3/v4 已覆盖，v5 保留；NOT RUN。
- 无生产副作用。

## 9. 状态

| 项目 | 状态 |
|---|---|
| profile bundle 字符串/精确名称 | PASS（静态/设备 manifest） |
| web→link 初始化顺序 | PASS（源码静态） |
| 候选 symlink/realpath | 计划 PASS；NOT RUN |
| host CLI | PASS |
| 127.0.0.1 预检 | PASS（静态） |
| 候选 commit 固定/归档 | PASS（静态）；NOT RUN |
| snapshotColumns 测试 | PASS（CI #90） |
| DSHA SQLite/ONNX/exporter/WAL/host | **NOT RUN** |
| 生产部署 | 未授权/禁止 |

## 10. 副作用

未解包、未 npm ci、未运行测试、未创建 staging/profile、未执行 dsh plugin add、未启动 host、未连生产 DB、未改生产 profile/config、未部署/重启。
