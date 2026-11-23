# 第二阶段证据日志对应命令（2026-11-23, Asia/Shanghai）

环境：Node v24.19.0 / pnpm 11.28.5 / vitest 4.1.11；基线 `98f0b832`。

| 日志 | 命令 | 结果 |
|---|---|---|
| `tests-phase2.log` | `vitest run packages/core/tools/tests packages/core/agent-loop/tests <9 个兼容套件> --maxWorkers=2` | 48 files / 1435 passed / 0 failed，exit 0 |
| `full-typecheck-2.log` | `tsc -b tsconfig.host.json` | exit 0 |
| `catalog-gen-2.log` | `tsx scripts/gen-cordis-catalog.ts` | 125 artifacts computed，0 written（已是最新） |
| `catalog-verify-2.log` | `tsx scripts/gen-cordis-catalog.ts --check` | 125 files/regions up to date，exit 0 |
| `diffstat-phase2.txt` | `git diff --stat 98f0b832..dcc32a13` | 28 files, +873/−393 |

兼容套件清单：`fs/tool-fs`、`mcp/mcp-client`、`schedule/tool-schedule`、`shell/tool-bash-persistent`、`shell/tool-pwsh-persistent`、`subagent/tool-subagent`（depth + spec）、`fs/tool-fs-search`、`skill/tool-skill`、`guard/timeout-policy`。
原生前置：`tsx native/system/scripts/build.ts --host-addon-only`。
