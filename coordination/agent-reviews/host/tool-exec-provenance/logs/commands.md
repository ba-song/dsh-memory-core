# 证据日志对应的命令（2026-11-23, Asia/Shanghai）

环境：Node v24.19.0 / pnpm 11.28.5 / vitest 4.1.11；上游 tag `dsh-v0.2.1-rc.2`（`687f282e`）。

| 日志 | 命令 | 结果 |
|---|---|---|
| `tests-tools-agentloop.log` | `NODE_OPTIONS=--max-old-space-size=3072 ./node_modules/.bin/vitest run packages/core/tools/tests packages/core/agent-loop/tests --maxWorkers=2` | 38 files / 891 passed / 0 failed，约 105s |
| `tsc.log` | `./node_modules/.bin/tsc -b packages/core/tools packages/core/agent-loop` | exit 0 |
| `full-typecheck.log` | `NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsc -b tsconfig.host.json` | exit 0（日志仅记录退出码） |
| `catalog-gen.log` | `./node_modules/.bin/tsx scripts/gen-cordis-catalog.ts` | 125 artifacts，3 written |
| `catalog-verify.log` | `./node_modules/.bin/tsx scripts/gen-cordis-catalog.ts --check` | 125 files/regions up to date，exit 0 |
| `diffstat.txt` | `git diff --stat 2b96ab8b..98f0b832` | 15 files, +951/-74 |

原生前置：`tsx native/system/scripts/build.ts --host-addon-only`（flock `system.node`；缺失时 agent-loop 挂 41 个与本次改动无关的用例）。
