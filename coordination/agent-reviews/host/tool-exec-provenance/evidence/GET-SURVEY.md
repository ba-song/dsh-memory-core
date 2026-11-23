# GET-SURVEY — `ctx.tools.get(name).execute(...)` handler 旁路 · 全仓只读取证

- 任务：为「关闭 `ctx.tools.get(name).execute(fakeArgs, fakeExec)` handler 旁路」提供全仓调用点与字段使用清单。
- 基线：`/tmp/build-infra/harness`，repo `deepseek-harness`，tag `dsh-v0.2.1-rc.2`，branch `fix/host-tool-exec-provenance`，HEAD `98f0b832e8a09c277ee4d9f4b36a3706780f786d`。
- 方式：只读。源码事实一律取自 **HEAD blob**（`git show HEAD:<path>` 导出到 `/tmp/recon-get/baseline/` 后读取），避免工作树并发修改污染行号。仅写 `/tmp/recon-get/`，未修改仓库任何文件，未启动服务。
- 结论标签：**PASS（取证完成）/ NOT RUN（未做任何代码修改）**。

> ⚠ 并发事实：取证期间（20:00–20:33 +08:00）工作树出现且持续增长一份**未提交实现**（非本智能体所为）：最初 4 个文件，20:33 已 22 个已跟踪修改 + 1 个未跟踪 `src/internal.ts`（`git diff` SHA-256 `2e74e27c…`），包含 `ToolDescriptor`/`isVisible`/`#rawGet`/`beginToolBatch`/`markHostActive`/`rawDefinitionOf` 等。本报告第 1–7 节以 HEAD 为准，第 8 节单独对照该工作树快照列出仍缺口。**最终请以 lead 的最终 diff 复核**。

---

## 0. 一句话结论

`ToolRuntime.get()` 在 HEAD 返回**注册时那个原始 `ToolDefinition` 引用本身**（含 `execute`）；`register()` 只把引用塞进 `NamedEntries` 的 `Map`，不复制、不包装、不冻结。因此任何拿到 `ctx.tools` 的插件都能 `get(name).execute(forgedArgs, forgedExec)` 直接调用 handler，绕过 pre-execute、guard、approval、timeout、around-dispatch、post-execute、`tools/result`、输出校验、取消与日志；PTC 模式下 `get('run_code').execute(...)` 还是通往全部工具的嵌套 dispatch 网关。`schemas()` 不泄漏 handler，`view()`/`resolveExecution()` 是 TS-private 但**运行时可达**且返回原始定义。

---

## 1. `ToolDefinition` 完整字段清单与可执行性

声明：`packages/core/tools/src/index.ts:224-300`，继承 `ToolSchema`（`packages/llm/llm/src/types.ts:491-502`）。

| 字段 | 位置 | 类型 | 可执行代码？ | 说明 |
|---|---|---|---|---|
| `deferLoading?` | llm/types.ts:497 | `true` | 否 | 纯数据，模型侧延迟加载 |
| `name` | llm/types.ts:498 | `string` | 否 | |
| `description` | llm/types.ts:499 | `string` | 否（但 `run_code` 上是 **getter**，见下） | |
| `parameters` | llm/types.ts:501 | `Record<string, unknown>` | 否（`run_code` 上是 getter） | |
| `output` | core/tools/index.ts:226 | `ToolOutputDefinition`（214-221） | **是（部分）** | 见下一行 |
| `output.schema` | 216 | `JsonSchemaNode` | 否 | 输出校验用 JSON Schema |
| `output.render` | 218 | `(args, value) => ContentBlock[]` | **是** | 每次成功结果都会被 registry 调用（`createSuccessResult`，index.ts:2030） |
| `output.presentationMeta?` | 220 | `(args, value) => JsonValue` | **是** | index.ts:2039 |
| `execute` | 237 | `(args, exec) => Promise<unknown>` | **是；唯一 dispatch handler** | 直接调用即绕过整条 pipeline |
| `projectContent?` | 247 | `(exec, result) => ContentBlock[] \| undefined` | **是** | 在 post-execute 前调用（index.ts:1828-1830） |
| `finalizeContent?` | 259 | `(exec, result) => ContentBlock[] \| undefined` | **是** | 每次结果最终化时调用（index.ts:1878-1883） |
| `timeoutMs?` | 267 | `number` | 否 | 由 timeout-policy 读取 |
| `isConcurrencySafe?` | 281 | `(args) => boolean` | **是** | `executionMode` 会调用（index.ts:1381） |
| `presentCall?` | 291 | `(args) => ToolCallView \| undefined` | **是** | 纯展示回调 |
| `presentResult?` | 299 | `(args, result) => ToolResultView \| undefined` | **是** | 纯展示回调 |

补充：

1. `defineTool` 返回的 `execute` 不是用户函数原样：`packages/core/tools/src/schema.ts:597-601` 包了一层参数校验，再调用闭包捕获的 `userExecute`；`presentCall`/`presentResult`/`isConcurrencySafe` 也都包了软校验（schema.ts:613-630）。**包装不改变“可直接调用”这件事**，只多了参数校验。
2. `run_code` 的 `description`/`parameters` 是 `Object.defineProperty` 安装的 **getter**（`packages/core/tools/src/ptc.ts:773-793`），读取时会访问 `ctx.ptcRuntime`；语言非法时会抛错（ptc.spec.ts:544-561 依赖这一行为）。这两个 getter 本身是代码，但不是 handler。
3. `output.render`/`presentationMeta` 被 registry 在**结果**阶段调用，且 `defineTool` 不做参数校验；直接调用可执行插件闭包，但不产生 dispatch。`presentCall`/`presentResult` 在 `defineTool` 下会先软校验参数。
4. `finalizeContent`/`projectContent`/`isConcurrencySafe` 都是插件闭包；调用它们不会走 pipeline，但也不会执行工具主体。

**可执行字段集合**：`execute`、`output.render`、`output.presentationMeta`、`projectContent`、`finalizeContent`、`isConcurrencySafe`、`presentCall`、`presentResult`。其中只有 `execute` 是“工具主体/能力”，其余是展示或结果变换；本任务要关的是 `execute`（以及 PTC 下 `run_code.execute` 的嵌套 dispatch 能力）。

`testing.ts`（HEAD 42 行）：`defineContentToolFixture`（27-41）把 `options` 合并后调用 `defineTool`，返回的仍是带 `execute` 的 `ToolDefinition`（38-40 再包一层），仅测试使用。

---

## 2. `register(definition)` 的完整路径

### 2.1 数据落在哪

```ts
// packages/core/tools/src/index.ts:780-795
class ToolLayer implements ScopeLayer {
  readonly tools: NamedEntries<ToolDefinition>
  readonly restrictions = new AnonymousEntries<CompiledToolRestriction>()
  readonly guards = new AnonymousEntries<ToolGuard>()
  mode: ToolPresentationMode | undefined
}
```

```ts
// packages/core/tools/src/index.ts:1137-1162
register(definition: ToolDefinition): () => void {
  const name = definition.name
  // 只校验 output/render/presentationMeta、schema、timeoutMs、保留名 run_code
  ...
  return this.layers.effect(
    this.ctx,
    layer => layer.tools.insert(name, definition),   // 1159
    { label: 'tools.register()' },
  )
}
```

- `NamedEntries.insert`（`packages/core/scope/src/store.ts:43-54`）：`data.set(name, value)`，注释明确 **“Values are borrowed.”**（store.ts:26）。没有 `clone`/`Object.freeze`/`Object.assign`/包装。
- 存的是 `Map<string, ToolDefinition>`（store.ts:31）；`ScopedLayers.global` 是 `undefined` scope 的层（store.ts:169），其余 scope 在 `Map<ScopeKey, ToolLayer>`（store.ts:163）；`layers.effect` 用 `scopeOf(ctx)` 选择层（store.ts:231-247、226-267）。
- `register` 的校验缺口：**没有检查 `typeof definition.execute === 'function'`**（1137-1156）。一个没有 `execute` 的 view/descriptor 若被 `register()`（例如 `register({ ...get(name) })`）会被接受，直到 dispatch 才以 `tool.execute is not a function` 失败。建议补上此校验。

### 2.2 `defineTool` 返回对象 vs 注册后对象

同一引用。`defineTool`（schema.ts:554-632）新建 `const tool: ToolDefinition`（580）并 `return tool`（631）；`register` 直接 `insert(name, definition)`。没有复制、没有包装、没有冻结。

但注意：`defineTool(options)` 返回的**不是** `options` 对象（新建了 `parameters`/`output.schema` 编译结果和新方法），而是这个新建对象；**注册后 `get()` 返回的正是它**（HEAD 语义）。

`run_code` transport 是例外路径：不 `register()`，由 `requirePtcTransport()`（index.ts:1011-1038）惰性调用 `createRunCodeTool` 生成，直接塞进可见 Map（1289-1291），并缓存在 `this.ptcTransport`。

---

## 3. `get` / `view` / `schemas` / `resolveExecution` / `ptcTransport` 的返回语义

### 3.1 `get(name, scope)` — HEAD

```ts
// packages/core/tools/src/index.ts:1304-1306
get(name: string, scope?: ScopeKey): ToolDefinition | undefined {
  return this.view(scope).visible.get(name)
}
```

- 返回 `visible` Map 中的**原始对象引用**；每次调用重建 Map 但 value 不变，所以同一注册的两次 `get` 是同一对象。
- 会应用：scope 链遮蔽（近者胜）、restriction（`layers.every(admits)`）、PTC 模式下额外插入 `run_code`。
- 不做复制/冻结/投影。**暴露 `execute`。**

### 3.2 `view(scope)` — 不是公开 API

```ts
// packages/core/tools/src/index.ts:1252-1293
private view(scope?: ScopeKey): ToolView {
  ...
  const visible = new Map<string, ToolDefinition>()
  ...
  if (this.modeFor(scope) !== 'native') {
    visible.set(RUN_CODE_NAME, this.requirePtcTransport())   // 1289-1291
  }
  return { visible, knownNames, restrictableNames }
}
```

- `ToolView` 是文件内 interface（760-767）：`visible: ReadonlyMap<string, ToolDefinition>`、`knownNames`、`restrictableNames`。
- HEAD **没有公开 `view`**（TS `private`）；但它是**原型方法**，通过 `Symbol.for('cordis.original')` 拿到 raw target 后可调用（见 §5）。
- `visible` 的 value 是原始定义（含 `execute`），`ReadonlyMap` 只是 TS 类型。

### 3.3 `schemas(scope)` — 安全的 schema 投影

```ts
// packages/core/tools/src/index.ts:1334-1336
schemas(scope?: ScopeKey): ToolSchema[] {
  return [...this.view(scope).visible.values()].map(definition => this.schemaOf(definition, true))
}
```

`schemaOf`（1356-1368）只取 `name/description/parameters/deferLoading`；`detachParameters===true` 时 `snapshotJsonValue(parameters)` 深拷贝。返回新数组、新对象，**不含 `execute`、`output`、presenters**。README 也承诺 “without the `execute` functions”（`packages/core/tools/README.md:85`）。

### 3.4 `resolveExecution(name, scope, nested)` — 内部 dispatch 的唯一解析

```ts
// packages/core/tools/src/index.ts:1321-1326
private resolveExecution(name, scope, nested): ToolDefinition | undefined {
  const tool = this.get(name, scope)
  if (tool === undefined) return undefined
  if (this.collapses(name, scope, nested)) return undefined
  return tool
}
```

- 返回 `get` 的同一原始引用；`collapses`（1425-1427）规定 PTC 下“模型直呼”只能 `run_code`，嵌套 sub-dispatch（`parent` token 存在）可调用任意可见工具。
- 内部使用点：`executionMode`（1377-1386）、`#createExecution`（1576）、`#dispatchToolBody`（1752-1755，`tool.execute(...)`）、`postExecute` 的 value 替换（1998-2000）、`normalizeDispatchResult`（2067-2069）。**改为 descriptor 后这些必须全部改走 raw 访问器。**

### 3.5 `ptcTransport` 如何进入 get/resolve

1. `view()` 在 `modeFor(scope) !== 'native'` 时把 `RUN_CODE_NAME` 插入 `visible`（1289-1291），value 为 `requirePtcTransport()` 的单例。
2. `requirePtcTransport()`（1011-1038）首次调用时 `createRunCodeTool(this, {... scheduler: self.#scheduler, ...}, this.ptcContext)` 并缓存 `this.ptcTransport`。`#scheduler` 是 **ECMAScript #private**（907-912），只能作为闭包传给 transport。
3. `get('run_code', scope)` 在 PTC scope 下返回该定义；`resolveExecution` 同样返回它；`schemas`/`wireSchemas` 也会投影它。
4. `run_code` 的 `execute` 内部：绑定函数来自 `registry.schemas(exec.agent)`（ptc.ts:694-697），每个绑定调用 `scheduler.prepare/dispatch/finalize/finish`（ptc.ts:627-643），不是 definition handler。**程序拿不到任何 handler。**
5. **但** `get('run_code').execute(codeArgs, forgedExec)` 会以 `forgedExec.agent`/`token`/`callId` 启动整个 PTC 程序，嵌套调用走 `scheduler`（内部 stage），从而绕过 batch/authority。PTC 部署下这是最强的旁路，关闭 `execute` 时必须覆盖 transport。

---

## 4. 全仓 `ctx.tools.get(` / `tools.get(` 调用点

统计（HEAD，`git grep -n "tools\.get(" HEAD -- '*.ts'`）：**326 行**；其中 **src 20 行**（2 行是本地 Map 同名假阳性），**tests 306 行 / 56 个测试文件**。README/文档另有提及（不计）。

### 4.1 生产源码（完整 20 行，含 2 个假阳性）

| # | 位置 | 读取字段 | 身份比较 | 可能 `.execute` | 备注 |
|---|---|---|---|---|---|
| 1 | `packages/context/file-reference-local/src/index.ts:74` | 仅存在性（`=== undefined`） | 否 | 否 | 控制 prompt 文本 |
| 2 | `packages/experimental/browser-use-runtime/src/mcp.ts:143` | 无字段 | **是：两次 `get` 结果 `!==`** | 否 | 判断“同一注册是否跨 scope 可见”；**依赖“同一 raw definition → 同一 descriptor”记忆化**，否则会误判为“另一个 Session”并抛错 |
| 3 | `packages/fs/tool-fs-search/src/direct-call.ts:26` | `tool.name`（参数） | **是：`get(exec.name, exec.agent) !== tool`（vs 原始注册对象）** | 否 | 唯一用途是“该工具的 spill 是否仍拥有直呼”；descriptor 后必坏，改用 `isVisible(tool, exec.agent)` |
| 4 | `packages/fs/tool-fs-search/src/glob.ts:300` | 存在性 | 否 | 否 | prompt 段落 |
| 5 | `packages/fs/tool-fs-search/src/grep.ts:278` | 存在性 | 否 | 否 | |
| 6 | `packages/fs/tool-fs-search/src/grep.ts:281` | 存在性 | 否 | 否 | |
| 7 | `packages/fs/tool-fs/src/edit.ts:80` | 存在性 | 否 | 否 | |
| 8 | `packages/fs/tool-fs/src/read.ts:72` | 存在性 | 否 | 否 | |
| 9 | `packages/fs/tool-fs/src/write.ts:66` | 存在性 | 否 | 否 | |
| 10 | `packages/fs/tool-fs/src/write.ts:69` | 存在性 | 否 | 否 | |
| 11 | `packages/guard/timeout-policy/src/index.ts:57` | `?.timeoutMs` | 否 | 否 | `tools/execute` wrapper 读预算；descriptor 保留 `timeoutMs` 即可 |
| 12 | `packages/session/session-format-v3-to-v4/src/relationships.ts:167` | 本地 `Map` 的 `pending` | — | 否 | **假阳性**：`this.tools` 是格式迁移的 `Map<string, …>`，非 ToolRuntime |
| 13 | `packages/skill/tool-skill/src/index.ts:222` | 无字段（`skillTool.name`） | **是：`=== skillTool`（原始注册对象）** | 否 | 决定是否发布 skill catalog；descriptor 后必坏，改用 `isVisible(skillTool, agent)` |
| 14 | `packages/subagent/tool-subagent/src/index.ts:374` | `tool.name` | **是：`=== tool`（`delegationTools` 原始对象）** | 否 | prompt 里列可用委派工具 |
| 15 | `packages/subagent/tool-subagent/src/index.ts:387` | `toolName` | **是：`!== mounted.definition`（原始对象）** | 否 | delegation depth context |
| 16 | `packages/web/tool-web/src/fetch.ts:451` | 存在性 | 否 | 否 | |
| 17 | `packages/web/tool-web/src/search.ts:318` | 存在性 | 否 | 否 | |
| 18 | `packages/web/tool-web/src/search.ts:320` | 存在性 | 否 | 否 | |
| 19 | `packages/client/ui-trajectory/src/client/layout.ts:699` | 本地 `Map` 计数 | — | 否 | **假阳性** |
| 20 | `packages/client/ui-trajectory/src/client/layout.ts:829` | 本地 `Map` 计数 | — | 否 | **假阳性** |

另有两处**间接** `ctx.get('tools')?.get(...)`（`tools.get` 字面量 grep 不会命中）：

| 位置 | 用途 | 身份比较 | `.execute` |
|---|---|---|---|
| `packages/experimental/claude-code-mods/src/index.ts:425-431` | 读 `definition.output.schema` 做 `validateJsonSchemaValue`，并调用 `definition.output.render(exec.arguments, value)` | 否 | 否（调用 render，不是 execute）。descriptor 保留 `output` 即可 |
| `packages/subagent/subagent/src/manager.ts:461` | `isAdjacentAgentSendMessageTool(get('send_message', child))` | **是：symbol marker**（`Object.defineProperty(definition, adjacentAgentSendMessageTool, { value: true })`，`packages/subagent/subagent/src/internal.ts:15,23,32-35`；默认 **non-enumerable**） | 否 | 决定是否给子 agent 附 `withContinuableReturnGuidance`。descriptor 若用 `{...definition}` 会丢 marker → 静默行为回退；若用 `Reflect.ownKeys` 复制则运行时可保留，但 `ToolDescriptor` 传给 `ToolDefinition` 参数会类型报错 |

`packages/experimental/claude-code-mods/src/host-ops.ts:338/359/381` 只是 `ctx.get('tools')` 取 service 后 `register`/`execute`/`schemas`，不走 `get`。

### 4.2 测试汇总（306 行 / 56 文件）

按文件 top（HEAD，`git grep -n "tools\.get(" ... | awk`）：

- 31 `packages/mcp/mcp-client/tests/reconnect.spec.ts`
- 22 `packages/shell/tool-bash/tests/tools.spec.ts`
- 20 `packages/mcp/mcp-client/tests/apply.spec.ts`
- 19 `packages/mcp/mcp-client/tests/mcp-client.spec.ts`
- 14 `packages/shell/tool-pwsh/tests/tools.spec.ts`
- 14 `packages/core/tools/tests/ptc.spec.ts`
- 13 `packages/fs/tool-fs/tests/tools.spec.ts`
- 11 `packages/experimental/tool-terminal/tests/tools.spec.ts`
- 10 `packages/goal/tool-goal/tests/tool-goal.spec.ts`
- 10 `packages/extensions/cordis-host-runner/tests/composition.spec.ts`
- 10 `packages/experimental/tool-session-query/tests/tool-session-query.spec.ts`
- 9 `packages/fs/tool-str-replace-editor/tests/tools.spec.ts`
- 7 `packages/workflow/tool-workflow/tests/tool-workflow.spec.ts`
- 7 `packages/schedule/tool-schedule/tests/tool-schedule.spec.ts`
- 6 `packages/web/tool-web/tests/tool-web.spec.ts`
- 6 `packages/core/tools/tests/tools.spec.ts`
- 其余 ≤5（lsp/plugin-market/mcp-client.e2e/model-selection/structured/schedule/plugin/plan-mode/tool-jobs/read-image/…）。

绝大多数测试只用：存在性、`timeoutMs`、`description`、`parameters`、`output.schema`、`presentCall/presentResult/output.render/presentationMeta`、`isConcurrencySafe` —— **改 descriptor 后仍可用**（前提：保留 accessor 与 output/presenters，见 §7）。真正会坏的是 §6/§7 列出的“当定义用/直接 execute/身份比较”测试。

---

## 5. 插件还能从哪里拿到 ToolDefinition / handler

### 5.1 HEAD 的公开渠道（按可利用性排序）

1. **`ctx.tools.get(name, scope)`**：直接原始定义，含 `execute`（index.ts:1304-1306）。**这是正门。**
2. **`ctx.tools` 的 TS-private 成员（运行时可达，且不被 T07 覆盖）**：
   - `rawService(ctx.tools).layers`（index.ts:885 `private readonly layers`，普通 own property）→ `.global.tools.entries()` / `.peek(scope)` / `.chainLayers(scope)` → **原始定义 Map**。
   - `rawService(ctx.tools).view(scope)`（index.ts:1252，原型上的 `private` 方法）→ `.visible` → 原始定义 Map（含 `run_code`）。
   - `rawService(ctx.tools).resolveExecution(name, scope, nested)`（index.ts:1321）→ 原始定义。
   - `rawService(ctx.tools).ptcTransport`（index.ts:898，首次使用后）→ `run_code` 原始定义，含可嵌套 dispatch 的 `execute`。
   - `rawService(ctx.tools).ptcContext`（index.ts:899）→ 注册表持有的 Cordis Context（比 handler 更宽的逃逸面）。
   - `rawService` 入口：`Symbol.for('cordis.original')`（index.ts:2128-2135；安全套件 T07 已用同一入口，见 `packages/core/tools/tests/exec-provenance.spec.ts:270-288`）。
   - **T07 只检查了 `prepareScheduledExecution`/`scheduler` 等名字，未检查 `layers`/`view`/`ptcTransport`/`ptcContext`。**
3. **`register(definition)` 的返回值**：只有 disposer（index.ts:1157-1161），**不返回定义**。
4. **`tools/change` 事件**：无参数（index.ts:209 `'tools/change'(): void`），拿不到定义。
5. **`tools/pre-execute` / `tools/execute` / `tools/post-execute` / `tools/ptc-dispatch-log` / `tools/result` 事件**：payload 是 `exec`/`result`/`PtcDispatchLog`，不含定义；listener 的 `this` 是 `scopeTarget(...)` 生成的 **routing-only carrier**（`packages/core/scope/src/index.ts:170-188`，只带 filter symbol），不暴露 service 属性。无法从这里拿 handler。
6. **`run_code` 的 SDK/bindings**：程序只拿到 `schemas()` 生成的 `functions`（name/description/parameters → 闭包），闭包内部走 `scheduler`（ptc.ts:543-697）。**不暴露 definition/handler。**
7. **`ctx.tools.schemas(scope)`**：新对象、深拷贝 parameters，无 `execute`/`output`/presenters。
8. **`ToolRuntime.execute(input)`**：HEAD 在 host 未 claim authority 时可用（`#rejectUntrustedInput`，1493-1507）；一旦 claim，插件伪造 input 会被 `E_TOOL_EXEC_UNTRUSTED` 拒绝。它不返回定义，但可代 dispatch（bare registry 场景）。
9. **`claimDispatchAuthority()`**（1470-1490）：HEAD 公开可调用；先到先得，第二次抛错。安全套件 T06b 证明“插件先 claim → agent loop 起不来”，属 fail-closed，但仍属 dispatch 级能力。
10. **包导出**：
    - `packages/core/tools/src/index.ts:67-108`：`defineTool`、schema 编译器/校验器、`ToolArgsError`/`JsonSchemaError`、`RUN_CODE_NAME`、`CodeRunFailedError`、`renderToolsSdk*`、`defineContentToolFixture`、`ToolRuntime` default；类型导出 `ToolDefinition` 等。
    - `package.json` `exports`：`.`、`./types`、`./presentation`、**`./src/*`**、`./package.json`。`./src/*` 允许深导入 `@deepseek-ai/dsh-tools/src/ptc.ts` 的 `createRunCodeTool`（334，需自备 scheduler）和 `src/schema.ts` 等；**不能**从别的注册表取 handler。
    - 其它包：`@deepseek-ai/dsh-mcp-client` 导出 `createMcpToolDefinition`（工厂，返回新定义）；`@deepseek-ai/dsh-subagent/internal` 导出 marker 函数；这些只产生/标记“自己的”定义。
11. **插件间对象传递**：若某插件把 `defineTool` 返回对象导出/交给另一个插件，对方就拿到 handler。仓库内没有 `export const X = defineTool(...)` 的注册定义（已查，`defineContentToolFixture` 除外，且测试专用）；但这不属于注册表渠道，无法由 `get` 修复关闭，只能在进程隔离层面解决。

### 5.2 已有的“只读 view”先例

`packages/extensions/cordis-host-runner/src/guard.ts:636-654` 的 sandbox façade：

```ts
/** ... The tool-registry façade: `register` (marker-guarded) plus READ-ONLY
 * metadata (`schemas`, and `get` returning a schema view, never the live
 * `ToolDefinition`). Exposing the raw definition would hand package code the
 * tool's `execute` function, letting it call another tool directly and bypass
 * `ToolRuntime.execute` ... */
function sandboxTools(ctx: Context): Record<string, unknown> {
  return {
    register: tool => sandboxRegisterTool(ctx, tool),
    schemas: () => ctx.tools.schemas(scopeOf(ctx)),
    get: name => ctx.tools.schemas(scopeOf(ctx)).find(schema => schema.name === name),
  }
}
```

对应测试 `packages/extensions/cordis-host-runner/tests/sandbox-context.spec.ts:225-243` 明确断言 `hasExecute === false`、`hasPresentCall === false`、`keys` 只有 `description/name/parameters`。**这正是 host 侧 `get` 可复用的契约模板**（host 侧需要保留 presenters/output，但同样不应有 `execute`）。

### 5.3 并发工作树新增的 `rawDefinitionOf` —— 当前最直接的泄漏（重要）

20:29 快照里出现了一个**未跟踪**文件 `packages/core/tools/src/internal.ts`（不在 HEAD）：

```ts
// packages/core/tools/src/internal.ts（工作树，untracked）
/**
 * Monorepo test-only access to the live definition behind a registration.
 * ... This binding is NOT part of the package namespace and the published
 * tarball ships only `lib/**`, so an installed host cannot import
 * `@deepseek-ai/dsh-tools/src/internal.ts`.
 */
export const rawDefinitionOf: WeakMap<object, (name, scope?) => ToolDefinition | undefined>
  = new WeakMap()
```

`packages/core/tools/src/index.ts:17` 导入，构造函数 `index.ts:939` 安装：

```ts
rawDefinitionOf.set(this, (name, scope) => this.#rawGet(name, scope))
```

测试已经这样用（工作树）：
`packages/schedule/tool-schedule/tests/tool-schedule.spec.ts:6,32`、`packages/shell/tool-bash-persistent/tests/tools.spec.ts:1,558`、`packages/shell/tool-pwsh-persistent/tests/tools.spec.ts:1,644`、`packages/fs/tool-fs/tests/tools.spec.ts:14,1102`、`packages/mcp/mcp-client/tests/mcp-client.spec.ts:724`、`packages/subagent/tool-subagent/tests/depth-context.spec.ts:1,91`：

```ts
const raw = (ctx.tools as ...)[Symbol.for('cordis.original')]
const definition = rawDefinitionOf.get(raw)!('write')   // 原始定义，含 execute
```

问题：
- `packages/core/tools/package.json` 的 `exports` 有 `"./src/*": "./src/*"`，所以 **在 workspace/源码部署里 `@deepseek-ai/dsh-tools/src/internal.ts` 是真实的包内子路径**，与其注释“NOT part of the package namespace”矛盾；任何 in-repo/源码插件都能 `import { rawDefinitionOf }`，再用 raw target 取到 handler，等于把刚关上的旁路重新打开。
- 发布 tarball 的 `files` 确实不含 `src/`（package.json files: `lib/index.js`、`lib/types/**`），所以 **npm 安装形态**可能解析失败；但 DSH 的源码/工作区形态、以及任何把 `src` 一起打包的插件渠道仍可达。作为“安全边界”不能依赖发布白名单的偶然性。
- 它还把 `#rawGet` 能力从实例内部搬进了一个模块级 WeakMap；即使 `get()` 再安全，这条路径就是 `getRawDefinition(name)`。

建议：**不要**把这种访问器放进可发布子路径。测试应改为在 mount 前拦截 `ctx.tools.register` 捕获 raw definition（测试专用、不产出模块导出），或使用 vitest alias/相对路径引用一个仅测试目录的 helper；若必须保留，至少让 `exports` 不暴露 `./src/internal.ts`（或整体移除 `./src/*`，仅保留测试需要的相对路径），并在安全套件里断言该子路径不可达。

---

## 6. 全仓测试里“直接调用 `definition.execute(...)`”与“把 `get()` 当定义用”

### 6.1 直接调用 handler

| 位置 | 形式 | 调用点 |
|---|---|---|
| `packages/schedule/tool-schedule/tests/tool-schedule.spec.ts:29-36` | `const definition = test.ctx.tools.get(name, test.agent); return await definition.execute(args, { ... forged exec ... })` | 409、431、568（`executeBody(...)`） |
| `packages/shell/tool-bash-persistent/tests/tools.spec.ts:557` | `vi.spyOn(ctx.tools.get('bash', owner)!, 'execute')` | 557 |
| `packages/shell/tool-pwsh-persistent/tests/tools.spec.ts:643` | `vi.spyOn(ctx.tools.get('pwsh', owner)!, 'execute')` | 643 |

`git grep -n -E "(definition|def|tool|descriptor)\.execute\(" HEAD -- 'packages'` 仅命中 `schema.ts` 之外的这两处测试 + registry 内部 `index.ts:1755`。

### 6.2 把 `get()` 结果当完整定义重新注册（descriptor 后 TS + 运行时都会坏）

| 位置 | 代码 | 后果 |
|---|---|---|
| `packages/subagent/tool-subagent/tests/depth-context.spec.ts:89` | `root.ctx.tools.register({ ...ctx.tools.get('subagent')!, description: 'Scoped replacement' })` | spread 丢 `execute`；该 override 若被 dispatch → `tool.execute is not a function`；TS 报缺少 `execute` |
| `packages/mcp/mcp-client/tests/mcp-client.spec.ts:723-733` | `const definition = rich.ctx.tools.get('mcp__srv__img')!; ... register({ ...definition, output: {...} })` 然后**立即 dispatch 该工具** | 同上，dispatch 必然失败 |
| `packages/fs/tool-fs/tests/tools.spec.ts:1101/1108` | `const write = ctx.tools.get('write')!; ... scope.ctx.tools.register(write)` | 注册无 `execute` 的 view；TS 报错，后续若 dispatch 失败 |

### 6.3 只读字段 / 身份比较（descriptor 后预期仍过）

- get vs get 身份：`packages/core/tools/tests/ptc.spec.ts:392`（run_code 跨 scope 同一 transport）、`packages/subagent/tool-subagent/tests/model-selection.spec.ts:129-131`（adapter 替换后同一 view）、`packages/skill/tool-skill/tests/tool-skill.spec.ts:785`（两个不同 scope 注册，必须不等）、`packages/core/tools/tests/scoped.spec.ts:95`（描述相等）。**这些是“必须记忆化 descriptor”的回归测试。**
- 只读字段：`ptc.spec.ts:468/544/559/1650/1678/1697/1711`、`tools.spec.ts:2572-2583`、`tool-terminal/tests/tools.spec.ts:209/307`、`tool-ralph:386`、`plugin-manager:279`、`plugin-market:137`、`fs/tool-fs/tests/tools.spec.ts:386/515/520/679/694/1101`、`read-image:882`、`lsp:89/232`、`session-query:269-296`、`tool-agent-team:167-168`、`bash/pwsh tests` 等。descriptor 保留 `output`/presenters/accessors 即可。

---

## 7. 改成“`get()` 返回不含 `execute` 的只读 view（稳定身份、按 raw definition 记忆化）”的改动清单

### 7.1 生产源码必须改

| 位置 | 现状 | 建议 |
|---|---|---|
| `packages/core/tools/src/index.ts:1304-1306` | `get` 返回原始定义 | 返回 `ToolDescriptor = Omit<ToolDefinition,'execute'>`；`WeakMap<ToolDefinition, ToolDescriptor>` 记忆化；冻结；保留 accessor（`run_code`）与 symbol marker |
| `packages/core/tools/src/index.ts:1321-1326` | `resolveExecution` 调 `get` | 改用 `#rawGet` |
| `packages/core/tools/src/index.ts:1576` | `#createExecution` 用 `get` 取 finalizer/projector | 改用 `#rawGet` |
| `packages/core/tools/src/index.ts:1998-2000` | `postExecute` value 替换经 `resolveExecution` | 随 `resolveExecution` 改 |
| `packages/core/tools/src/index.ts:2067-2069` | `normalizeDispatchResult` 经 `resolveExecution` | 随上 |
| `packages/core/tools/src/index.ts:1377-1386` | `executionMode` 经 `resolveExecution` | 随上；descriptor 也保留 `isConcurrencySafe`，但内部应读 raw |
| 新增 | 无 `isVisible` | 增加 `isVisible(definition: Pick<ToolDefinition,'name'>, scope?): boolean`，用 `#rawGet(definition.name, scope) === definition` |
| `packages/core/tools/src/index.ts:1137-1156` | `register` 不校验 execute | 增加 `typeof definition.execute !== 'function' → TypeError`，防止 descriptor/半定义被注册 |
| `packages/fs/tool-fs-search/src/direct-call.ts:26` | `get !== tool` | `!ctx.tools.isVisible(tool, exec.agent)` |
| `packages/skill/tool-skill/src/index.ts:222` | `get === skillTool` | `ctx.tools.isVisible(skillTool, agent)` |
| `packages/subagent/tool-subagent/src/index.ts:374` | `get === tool` | `ctx.tools.isVisible(tool, context.scope)` |
| `packages/subagent/tool-subagent/src/index.ts:387` | `get !== mounted.definition` | `!ctx.tools.isVisible(mounted.definition, context.scope)` |
| `packages/subagent/subagent/src/manager.ts:461` | `isAdjacentAgentSendMessageTool(get(...))` | **类型必须改**：`isAdjacentAgentSendMessageTool` 参数收窄为 `Pick<ToolDefinition,'name'> & { [marker]?: true }`（或 `ToolDescriptor`）。运行时要求 descriptor 复制 **non-enumerable symbol**；若 descriptor 用 spread 会丢 marker → 静默丢 `withContinuableReturnGuidance` |
| `packages/core/tools/src/index.ts:885/898/899/1252/1321` | `layers`/`ptcTransport`/`ptcContext`/`view`/`resolveExecution` 是 TS-private | 若要“安全边界”而不只是 API 整洁：改为 `#layers`/`#ptcTransport`/`#ptcContext`/`#view`/`#resolveExecution`。否则 raw target 仍能取到全部原始定义 |

### 7.2 descriptor 实现的四个坑（当前工作树快照已踩到/部分规避）

1. **`run_code` accessor**：`description`/`parameters` 是 getter（ptc.ts:773-793）。若用 `{ ...definition }` 快照，会把语言 flavor 固化、并让 `ptc.spec.ts:544-561` 的 `expect(() => def.description).toThrow(...)` 变成 `get()` 当场抛错。必须 `Reflect.ownKeys` + `Object.getOwnPropertyDescriptor` 保留 accessor（当前工作树已这样）。
2. **symbol marker**：`adjacentAgentSendMessageTool` 是 non-enumerable own symbol（internal.ts:23），spread 不复制；必须保留 symbols（当前工作树已这样）。
3. **嵌套对象可变**：`view.parameters`（普通工具）与 `view.output`/`output.schema` 仍是 raw 定义里的同一对象；`Object.freeze(view)` 只冻结顶层。拿到 descriptor 的插件可改 `parameters.properties`（影响下一次 `schemas()`/prompt）或 `output.schema`（影响 `createSuccessResult` 的输出校验，index.ts:2025）。**必须在 `register` 时深冻结/深拷贝 `parameters` 与 `output.schema`，或在 descriptor 中 `snapshotJsonValue` 克隆。**
4. **`register` 缺 execute 校验**：见 §2.1；否则 spread-register 的测试/插件会“注册成功、dispatch 才炸”。

### 7.3 类型收窄影响（`get(): ToolDescriptor | undefined` 后）

- `packages/subagent/subagent/src/manager.ts:461`：`ToolDescriptor` 不能赋给 `ToolDefinition` 参数 → 编译错误（这是好事，暴露 marker 契约）。改签名。
- `packages/schedule/tool-schedule/tests/tool-schedule.spec.ts:30-36`：`definition.execute` 不存在 → 编译错误。
- `packages/shell/tool-bash-persistent/tests/tools.spec.ts:557`、`tool-pwsh-persistent/tests/tools.spec.ts:643`：`spyOn(descriptor, 'execute')` → 编译错误。
- `packages/subagent/tool-subagent/tests/depth-context.spec.ts:89`、`packages/mcp/mcp-client/tests/mcp-client.spec.ts:726`、`packages/fs/tool-fs/tests/tools.spec.ts:1108`：`register(descriptor)`/`register({...descriptor})` → 编译错误（缺 execute）。
- 安全：`claude-code-mods/src/index.ts:425` 只用 `output`，`timeout-policy` 只用 `timeoutMs`，`tool-session-query` 只用 `isConcurrencySafe/output`，均不受影响。
- `ToolDescriptor` 需在 `packages/core/tools/src/index.ts` 导出；cordis API catalog 需 `pnpm run gen-cordis-api` 重新生成（`packages/extensions/tool-cordis/src/api-catalog.ts` 头注释，20:29 的并发 diff 已在改 `scripts/gen-cordis-catalog.ts`，但 catalog 本体的刷新仍需确认）。

### 7.4 测试改动清单

| 测试 | 建议 |
|---|---|
| `tool-schedule.spec.ts:29-36` + 409/431/568 | 无法再从 `get()` 拿 handler。测试目的是“body 收到已 abort 的 signal 时不碰 service”。**不要用 `rawDefinitionOf`（§5.3）**；在 test harness 里于 mount 前拦截 `ctx.tools.register` 捕获 raw definition（测试专用），或新增插件导出的 test-only body seam |
| `tool-bash-persistent:557` / `tool-pwsh-persistent:643` | 改成 `ctx.on('tools/execute', ...)` 计数，或 `vi.spyOn(ctx.tools, 'execute')`（若测试走公共入口）；**不要**用 `rawDefinitionOf` |
| `depth-context.spec.ts:89` | 用 `defineTool` 造一个同名 stub（或 harness 捕获的 raw 定义）做 scoped override；该测试只验证可见性/context；**不要**用 `rawDefinitionOf` |
| `mcp-client.spec.ts:723-733` | 让 `syncTools`/测试在注册时捕获 raw definition，再基于它重注册；或从 `createMcpToolDefinition` 重新构造；**不要**用 `rawDefinitionOf` |
| `fs/tool-fs/tests/tools.spec.ts:1101/1108` | 同上：注册时捕获 raw 定义再注册；该测试只验证 deny/own-scope 豁免；**不要**用 `rawDefinitionOf` |
| `core/tools/tests/tools.spec.ts:2560-2576` | 标题/断言改为 descriptor（工作树已改），并加 `Object.isFrozen`、`'execute' in view === false`、`get` 记忆化 |
| 新增安全回归 | ① `get(name).execute === undefined`；② `raw.layers`/`raw.view`/`raw.ptcTransport`/`raw.ptcContext` 不可达（若目标为真边界）；③ **`@deepseek-ai/dsh-tools/src/internal.ts` 不可导入或不存在**；④ descriptor 的 `parameters`/`output.schema` 变更不影响注册表（深冻结/克隆）；⑤ `register(descriptor)` 抛 TypeError；⑥ `get(RUN_CODE_NAME)` 无 execute |
| 保留 | `exec-provenance.spec.ts` T15-T18（工作树新增）方向正确，但 T15 只查 `raw.get`，需补 raw 内部通道与 `rawDefinitionOf` 子路径 |

---

## 8. 与当前工作树未提交实现的对照（截至 2026-11-23 20:33 +08:00）

- 观察：`git status --porcelain` 23 项（22 M + 1 untracked `packages/core/tools/src/internal.ts`）；`git diff | sha256sum` = `2e74e27cb91199086fce6f93d1b470b54a6fd08eb12521c2d3f8d22362b0616c`。工作树仍在变化（20:04 4 文件 → 20:29 15 → 20:33 22+1）。**不是本智能体修改**；本报告未触碰工作树。
- 已实现且与本报告一致：`ToolDescriptor` + `get` 返回冻结/记忆化 view；`isVisible`；`#rawGet`；`resolveExecution`/`#createExecution` 改 internal raw；`beginToolBatch`/`markHostActive` 取代全局 authority；direct-call/skill/subagent 改用 `isVisible`；新增 T15-T18；`get` 的测试改为 descriptor；schedule/persistent/depth/mcp/fs 测试已改为“取 raw 定义”。
- 仍缺（按本报告 §7）：
  1. **`rawDefinitionOf`（`src/internal.ts` + `exports["./src/*"]`）是可导入的原始定义访问器，直接重开旁路**（§5.3，最高优先级）。
  2. `layers`/`view`/`ptcTransport`/`ptcContext`/`resolveExecution` 仍是 TS-private，raw target 可取原始定义；T07/T15 未覆盖。
  3. `view.parameters` / `view.output` / `view.output.schema` 与 raw 共享可变对象（§7.2-3）。
  4. `register` 未拒绝无 `execute` 的 descriptor（§7.2-4）。
  5. `manager.ts:461` 的 `ToolDescriptor → ToolDefinition` 类型未收窄；runtime 依赖 symbol 复制，当前实现可保留 marker，但一旦实现改成 spread 就静默坏。
  6. 测试已改，但**依赖 `rawDefinitionOf`**，等于以测试为名保留 handler 旁路；应改为注册时捕获。
  7. `get` 文档（`packages/core/tools/README.md:85`、`ToolDefinition` 注释 223）与 cordis API catalog 需同步。
- 并发树里 `get`/`isVisible` 已用 `rawService(this)` 调 `#rawGet`/`#descriptorOf`，规避了 cordis 代理的 #private brand 检查；这点正确，勿改成直接 `this.#...`。

---

## 9. 残余风险与建议

1. **“关 get().execute”只关闭受支持 API 的旁路，不是进程边界。** 同进程插件本就执行任意 JS；若 `layers`/`view`/`ptcTransport`/`ptcContext` 不做 `#`-private，任何插件仍可 `rawService(ctx.tools).layers...` 拿原始定义。若威胁模型是 `exec-provenance.spec.ts` 顶部写的“ordinary cordis plugin shares this process”，则必须同时 `#`-privatize 这些成员（并扩 T07/T15 断言）。**尤其不能把 `rawDefinitionOf` 作为包内子路径发布/保留**——它把“取原始定义”做成了正式 API。
2. **PTC 下优先关 `run_code`**：`get('run_code').execute` 可以以伪造 `exec.agent` 启动完整程序，嵌套 dispatch 走内部 scheduler，绕过 batch proof；descriptor 化后必须确认 `get(RUN_CODE_NAME)` 无 execute，且 transport 不通过任何 raw 字段暴露。
3. **输出校验完整性**：`createSuccessResult` 读 `tool.output.schema`（index.ts:2025）。descriptor 共享该对象会让旁路从“执行 handler”降级为“篡改 schema/参数”；深冻结/克隆即可关闭。
4. **保留 presenters 是权衡**：host UI/测试依赖 `presentCall/presentResult/output.render`；它们可执行但不是 dispatch 能力。若未来要求“get 返回纯数据”，需另做 UI 侧解耦，不建议在本任务扩大范围。
5. **测试专用 seam**：不要为测试新增 `getDefinitionForTest` 之类的公开通道；用“注册时捕获 raw definition”的 test harness 方案，既保持 body-level 测试意图，又不重开旁路。

---

## 10. 证据与方法附录（命令、行号、哈希）

### 10.1 基线与并发快照

```bash
cd /tmp/build-infra/harness
git rev-parse HEAD                     # 98f0b832e8a09c277ee4d9f4b36a3706780f786d
git branch --show-current              # fix/host-tool-exec-provenance
git log --oneline -8                   # 98f0b832 test(provenance)…; 2b96ab8b base: dsh-v0.2.1-rc.2
git status --porcelain                 # 20:04 首次发现 4 个 M；20:29 15 个 M；20:33 22 M + 1 untracked
git diff | sha256sum                   # 20:33 = 2e74e27cb91199086fce6f93d1b470b54a6fd08eb12521c2d3f8d22362b0616c
```

### 10.2 基线导出（本报告引用的行号均来自这些 HEAD blob）

```bash
mkdir -p /tmp/recon-get/baseline
for f in \
  packages/core/tools/src/index.ts packages/core/tools/src/schema.ts \
  packages/core/tools/src/testing.ts packages/core/tools/src/ptc.ts \
  packages/fs/tool-fs-search/src/direct-call.ts \
  packages/skill/tool-skill/src/index.ts \
  packages/subagent/tool-subagent/src/index.ts \
  packages/guard/timeout-policy/src/index.ts \
  packages/experimental/browser-use-runtime/src/mcp.ts \
  packages/context/agent-instructions/src/index.ts ; do
  mkdir -p "/tmp/recon-get/baseline/$(dirname "$f")"
  git show "HEAD:$f" > "/tmp/recon-get/baseline/$f"
done
```

### 10.3 关键检索命令

```bash
# 全仓 tools.get（HEAD；326 行 .ts，src 20 / tests 306）
git grep -n "tools\.get(" HEAD -- '*.ts'

# src-only（含 2 个本地 Map 假阳性）
git grep -n "tools\.get(" HEAD -- '*.ts' | grep -v "/tests/\|\.spec\.ts\|\.e2e\.ts"

# 间接 registry
git grep -n "get('tools')\|get(\"tools\")" HEAD -- '*.ts'

# 身份比较
git grep -n -E "tools\.get\([^)]*\) *(===|!==)|(===|!==) *[A-Za-z0-9_.]*\.tools\.get\(" HEAD -- 'packages'
git grep -n -E "(toBe|not\.toBe)\([^)]*tools\.get\(" HEAD -- 'packages'

# 直接 handler 调用
git grep -n -E "(definition|def|tool|descriptor)\.execute\(" HEAD -- 'packages'
git grep -n -E "spyOn\([^)]*tools\.get\(" HEAD -- 'packages'

# 定义标记
git grep -n "defineProperty(definition\|defineProperty(tool" HEAD -- 'packages'
```

### 10.4 复核用行号索引（HEAD）

- `ToolDefinition`：`packages/core/tools/src/index.ts:224-300`；`ToolOutputDefinition:214-221`。
- `ToolSchema`：`packages/llm/llm/src/types.ts:491-502`。
- `register`：`index.ts:1137-1162`（insert 在 1159）。
- `NameEntries`：`packages/core/scope/src/store.ts:30-54`；`ScopedLayers:159-217`、`effect:226-267`。
- `view`：`index.ts:1252-1293`；run_code 插入 `1289-1291`；`ToolView:760-767`。
- `get`：`1304-1306`；`resolveExecution:1321-1326`；`collapses:1425-1427`；`schemas:1334-1336`；`schemaOf:1356-1368`。
- `execute` 公共入口：`1450-1455`；`#rejectUntrustedInput:1493-1507`；`claimDispatchAuthority:1470-1490`。
- `#createExecution` finalizer/projector：`1605-1606`、`1576`；`#dispatchToolBody` 的 `tool.execute`：`1755`；`postExecute` value：`1998-2000`；`normalizeDispatchResult`：`2067-2069`；`executionMode:1377-1386`。
- `requirePtcTransport`：`1011-1038`；PTC 绑定：`packages/core/tools/src/ptc.ts:543-560`、`627-643`、`689-697`；`run_code` accessors：`773-793`。
- `defineTool`：`packages/core/tools/src/schema.ts:554-632`；`execute` 包装 `597-601`；presenter 包装 `603-630`。
- `testing.ts`：`27-41`。
- sandbox 先例：`packages/extensions/cordis-host-runner/src/guard.ts:636-654`；测试 `packages/extensions/cordis-host-runner/tests/sandbox-context.spec.ts:225-243`。
- marker：`packages/subagent/subagent/src/internal.ts:15,23,32-35`；使用 `packages/subagent/subagent/src/manager.ts:461`。
- 安全套件：`packages/core/tools/tests/exec-provenance.spec.ts:1-23`（威胁模型）、`261-288`（T07）、`403-433`（T13）。
- 会坏的测试：`packages/schedule/tool-schedule/tests/tool-schedule.spec.ts:29-36,409,431,568`；`packages/shell/tool-bash-persistent/tests/tools.spec.ts:557`；`packages/shell/tool-pwsh-persistent/tests/tools.spec.ts:643`；`packages/subagent/tool-subagent/tests/depth-context.spec.ts:89`；`packages/mcp/mcp-client/tests/mcp-client.spec.ts:723-733`；`packages/fs/tool-fs/tests/tools.spec.ts:1101,1108`。
- 身份回归：`packages/core/tools/tests/ptc.spec.ts:392`；`packages/subagent/tool-subagent/tests/model-selection.spec.ts:129-131`；`packages/skill/tool-skill/tests/tool-skill.spec.ts:785`；`packages/core/tools/tests/scoped.spec.ts:95`。

### 10.5 边界声明

- 只读 `/tmp/build-infra/harness`；只写 `/tmp/recon-get/`。
- 未运行生产服务、未联网、未改源码/测试/配置、未产生仓库副作用。
- 工作树中的 22 个已跟踪修改 + 1 个未跟踪 `src/internal.ts` 不属于本智能体；本报告的行号事实全部来自 HEAD blob（§5.3/§8 的并发描述除外，已明确标注“工作树”）。
