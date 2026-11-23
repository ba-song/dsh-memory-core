# 取证报告 · 普通 DSH 插件能否取得或伪造 Host 工具执行上下文

- 任务：一次性安全工程取证（只读）
- 执行者：recon-reachability（子智能体）
- 时间：2026-11-23 12:30–12:50 (+08:00)
- 环境：DSHA Android proot Ubuntu / root / Node v24.19.0 / DSH 0.2.1-rc.2
- 工作目录：`/tmp/recon-reachability`
- 生产侧基线（只读核对）：
  - Host 安装：`/usr/local/lib/node_modules/@deepseek-ai/dsh`，版本 `0.2.1-rc.2`（`dsh/package.json`）
  - 上游源码：`/tmp/harness-probe`，HEAD `687f282e8625c6b8d11ff58211a90524be2e4317`，tag `dsh-v0.2.1-rc.2`，`git status --porcelain` 为空
  - 正在运行的 web 进程端口 38105：**全程未触碰**

---

## 0. 结论摘要（先看这段）

**PASS（成立）：普通 DSH 插件可以取得 Host 的工具执行上下文——而且不是"伪造"，是"合法拿到"。**

三条互相独立的通道都已实测打通：

1. **模块通道**：插件文件位置 bare import `@deepseek-ai/dsh-tools` **可以解析**，并且解析到与 Host **同一个 realpath、同一个模块实例、同一个 `TOOL_RUNTIME_SCHEDULER` symbol**（证据 #3、#4、#5）。
   - 原因：DSHA 安装器在 `/root/.dsh/node_modules` 建了一个**托管软链场**（`.runtime-links-cache.json` 里 `managedAssetId` 可查），把整棵 `@deepseek-ai/*` 链回 host 安装目录。ESM 解析 bare specifier 时会向上走到 `/root/.dsh/node_modules`，Node 默认对结果做 realpath，于是拿到 host 的同一实例。
2. **符号通道**：`TOOL_RUNTIME_SCHEDULER` 是**公开导出**（`export { …, TOOL_RUNTIME_SCHEDULER, … }`）。插件只要 `import { TOOL_RUNTIME_SCHEDULER } from '@deepseek-ai/dsh-tools'`，再 `ctx.tools[TOOL_RUNTIME_SCHEDULER]`，就得到 `prepare/dispatch/finalize/finish` 四个内部入口（证据 #6、#9）。
   - 甚至不需要知道这个 symbol：`Object.getOwnPropertySymbols(ctx.tools)` 直接把它列出来（证据 #7）。
3. **执行通道**：`prepare()` → `dispatch()` 实测**调用了工具 handler**（证据 #6）；`exec.token` 对 handler 可见（证据 #6、#10）。

**对任务前提的两处纠正（重要）**

- ❌ 前提"插件没有 `@deepseek-ai/*` 依赖（只有本地相对导入…）"与**运行中的生产事实不符**：
  - `/root/.dsh/plugin-src/dsh-memory-core/lib/index.js:59`、`dsh-persona-core/lib/index.js:41`、`dsh-autonomy`、`dsh-channel-bridge`、`dsh-douyin` 都在 `import z from '@deepseek-ai/schemastery'`；
  - DSHA 自己的 `/root/dsha-computer-use-android`、`/root/dsha-device-shell-guide`、`/root/dsha-tool-vscreen` 还在 import `@deepseek-ai/dsh-mcp-client`、`dsh-computer-use/brand`、`dsh-llm`。
  - 也就是说：**插件 bare import host 包不是假设，是已经在生产里跑着的既有事实。**
- ❌ **运行中的 `dsh-tools` 不是上游 tag 的原样构建**：安装版 `lib/index.js` 第 1 行就 `import { attachPolicy, captureExecution, prepareOperation, verifyGlobalConsent, verifyDispatch } from "dsha-destructive-policy"`，并在 4 处挂钩（详见 §9 静态引用）。所以"源码里有"≠"运行时就是那份源码"。本报告所有运行时结论都基于**安装版**（sha256 `249ccaf3…9041`）。

**但也要说清边界**：DSHA 给安装版加的强制审批策略是**真实生效**的，它会在每次派发前做本机 bridge 一致性校验；不过该策略文件首行自己写明：
> `/** Mandatory Agent tool approval. Same-UID plugins and native terminals remain outside this policy. */`
> —— `dsha-destructive-policy/index.js:1`

即：**这条策略从设计上就不防同 UID 插件**。它还只挂在"管线"上，插件用 `ctx.tools.get(name).execute(...)` 直接调 handler 可以整条绕过（证据 #11）。

---

## 1. 方法与边界（可复现性说明）

所有 probe 都是 `/tmp/recon-reachability` 下**独立 Node 进程**，用**同一份安装版 lib**构造一个**全新的 `cordis Context`**，只注册一个惰性 dummy 工具（返回 `{ok:true}`），不启动 web、不写业务数据、不发外部网络。

之所以不在 38105 进程内注入：任务红线明确"绝对不要碰它"。独立进程 + 同版本 lib + 同构 ctx 是**等价的 API 可达性证据**，但不能替代"真进程内注入"——这点在 §10 未验证项里明确列出。

**副作用声明（如实）**：每次走完整 `dispatch` 时，安装版的强制策略会做一次 **localhost 只读** `GET http://127.0.0.1:3090/app/native-policy`（`native-consent.cjs` 的 `bridgeFetch`，只允许 `/device/consent`、`/app/native-policy` 两个只读路由）。这是 shipping 运行时的固有行为，不是绕过；除此之外无任何网络/QQ/DB/生产文件写入。

---

## 2. Q1 —— 插件位置的 bare import / 绝对路径 import

### Q1-a：bare import 解析（真实插件文件作为 parent）

```
$ cd /tmp/recon-reachability && node q1-bare.mjs
RESOLVED file:///usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js
EXIT=0
```

> 说明：`q1-bare.mjs` 用 `import.meta.resolve(specifier, parentURL)`，`parentURL` 就是真实插件入口
> `file:///root/.dsh/plugin-src/dsh-memory-core/lib/index.js`。这正是 Node 处理该文件里
> `import '@deepseek-ai/dsh-tools'` 时使用的**同一套 ESM 解析算法**。之所以不直接写一个 probe 文件进
> `/root/.dsh`，是因为任务禁止修改 `/root/.dsh/**`。

交叉验证（CJS 解析器，同一查找链）：

```
$ node q1-require.mjs
CJS_RESOLVED /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js
EXIT=0
```

解析来源定位（read-only）：

```
$ for d in .../dsh-memory-core/node_modules /root/.dsh/plugin-src/node_modules /root/.dsh/node_modules /root/node_modules /node_modules; do ...
-- /root/.dsh/plugin-src/dsh-memory-core/node_modules : no-@deepseek-ai (dir exists)
-- /root/.dsh/plugin-src/node_modules                 : no-@deepseek-ai (dir missing)
-- /root/.dsh/node_modules                            : HAS_@deepseek-ai (dir exists)
-- /root/node_modules                                  : no-@deepseek-ai (dir missing)
-- /node_modules                                       : no-@deepseek-ai (dir missing)

$ ls -la /root/.dsh/node_modules/@deepseek-ai/dsh-tools
lrwxrwxrwx ... dsh-tools -> ../../../../usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools
```

`/root/.dsh/node_modules` 由 DSHA 托管（`/root/.dsh/.runtime-links-cache.json`：`{"version":2,"managedAssetId":"88825e…c209e1","stamp":[…]}`）。

**结论**：**能解析**，且落到 host 同一份文件。任务前提里"插件位置只有本地相对导入"的假设不成立。

### Q1-b：绝对路径 import

```
$ node --input-type=module -e "const m = await import('/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js'); console.log('OK exports:', Object.keys(m).length, '| TOOL_RUNTIME_SCHEDULER:', typeof m.TOOL_RUNTIME_SCHEDULER)"
OK exports: 23 | TOOL_RUNTIME_SCHEDULER: symbol
EXIT=0
```

（同一段也出现在 `logs/probe-all.log` 的 `Q1b` 段，`EXIT=0`）

**结论**：**能成功**（root 可读该文件；插件进程与 host 同 UID）。

---

## 3. Q2 / Q3 —— 导出、symbol 同一性、类方法

### 3.1 Q2：`TOOL_RUNTIME_SCHEDULER` 是否存在、是否同一 symbol

```
$ node q2-identity2.mjs
bareUrl                 : file:///usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js
namespace a === b       : true
namespace a === c(sym)  : true
TOOL_RUNTIME_SCHEDULER identity a===b: true
TOOL_RUNTIME_SCHEDULER identity a===c: true
symbol toString         : Symbol(@deepseek-ai/dsh-tools.scheduler)
exported names count    : 23 | has TOOL_RUNTIME_SCHEDULER: true
EXIT=0
```

其中：
- `a` = 按插件位置解析出的 bare URL 动态 import；
- `b` = 绝对路径 import；
- `c` = 经软链路径 `/root/.dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js` import。

**结论**：
- 命名空间 `a === b === c`（同一模块实例）；
- `TOOL_RUNTIME_SCHEDULER` 是**同一个 symbol 实例**。
- 依据：`packages/core/tools/src/index.ts:481` `export const TOOL_RUNTIME_SCHEDULER: unique symbol = Symbol('@deepseek-ai/dsh-tools.scheduler')`；安装版 `dsh-tools/lib/index.js:2624` 同名定义、`:3817` 出现在 export 列表。
- 补充：symbol 同一性依赖 Node 默认的 realpath 解析。若将来用 `--preserve-symlinks` 或插件自带一份 `dsh-tools` 副本，符号会分裂、`ctx.tools[SYMBOL]` 拿不到入口——**这是当前唯一能挡住符号通道的条件，而它现在不成立**。

### 3.2 Q3：TS-private 方法在运行时是不是函数

`node probe-all.mjs`（`logs/probe-all.log`，`EXIT=0`）：

```
  rt.prepareScheduledExecution typeof = function
  rt.createExecution typeof = function
  rt.prepareExecution typeof = function
  rt.dispatchScheduledExecution typeof = function
  rt.finalizeScheduledExecution typeof = function
  rt.finishScheduledExecution typeof = function
hasOwn(rt, TOOL_RUNTIME_SCHEDULER): true
ctx.tools[TOOL_RUNTIME_SCHEDULER] keys: prepare,dispatch,finalize,finish
```

**结论**：全部是**原型上的普通函数**（TS 的 `private` 只是编译期），实例上还存在 **own symbol 属性** `Symbol(@deepseek-ai/dsh-tools.scheduler)`，其值就是 `{prepare,dispatch,finalize,finish}`（安装版 `:2768`）。
→ 不需要 `getPrototypeOf` 反射、不需要 `#private` 破解：**公开服务句柄上就有**。

---

## 4. Q4 —— 最小 cordis 应用证明 `prepareScheduledExecution` 会调用 handler

**没有起 web、没有写任何业务数据。** 最小应用 = `new Context()` + `new SystemPrompt(ctx, …)` + `new ToolRuntime(ctx,{mode:'native'})` + 一个 dummy 工具。

```
$ node probe-all.mjs > logs/probe-all.log 2>&1 ; echo EXIT=$?
EXIT=0

===== Q4 scheduler prepare->dispatch->finish triggers the handler =====
prepare().kind = dispatch
dispatch().kind = post-result
final isError/value          : false {"ok":true}
handler invoked by scheduler : true (calls=1)
token seen by handler        : Symbol(dsh.tool.execution)
```

第一次跑通的最小版（`probe-min-app.mjs`，`EXIT=0`）还额外打印了：

```
ctx.tools === rt          : false          # ctx.tools 是 cordis 的 traceable 代理
typeof ctx.agents         : undefined      # 这个最小应用没装 agents 服务
own symbols on instance   : Symbol(cordis.tracker),Symbol(@deepseek-ai/dsh-tools.scheduler)
  symbol Symbol(@deepseek-ai/dsh-tools.scheduler) -> typeof=object keys=prepare|dispatch|finalize|finish
execute() result isError : false value= {"ok":true}
handler observed token   : true Symbol(dsh.tool.execution)
scheduler path isError   : false value= {"ok":true}
handler invoked via sched: true
```

**结论**：插件等价代码 `ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare({callId,name,arguments,agent,signal})` 可以拿到 `{kind:'dispatch', exec}`，再 `dispatch(exec)` 即执行 handler。**成立。**

> `ctx.tools` 与 `new ToolRuntime` 的 `rt` 不是 `===`（`ctx.get('tools') === rt` 也是 false），因为 cordis 返回 traceable 代理；
> 用 `Symbol.for('cordis.original')` 解包后 `=== rt` 为 true：
> ```
> ctx.get(tools) === rt: false
> Symbol.for(cordis.original) present: true
> unwrapped === rt: true
> ```
> DSHA 策略自己也这么做（`serviceIdentity`）。

---

## 5. Q5 —— `toOwnerAgent` 与"拿真实 agent 对象当 `agent` 传入"

### 5.1 `toOwnerAgent` 在这个版本里**不存在**

```
$ grep -rn "toOwnerAgent" /tmp/harness-probe/packages          # 无输出，EXIT=1（grep 无匹配）
$ grep -rl "OwnerAgent" /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/   # 无输出
```

**结论**：`toOwnerAgent` 不是 0.2.1-rc.2 的 API（上游源码与安装版都没有）。这一条**无法执行**——不存在的东西不能证明它能/不能。

### 5.2 但底层能力成立：`ctx.agents.list()` 给真实 Agent，`agent` 字段选中其 scope

- 静态：`AgentRegistry.list(): Agent[]`（`packages/core/agent/src/index.ts:588`），`get(id)`（`:568`）；插件的 `agent` 是 `ScopeKey = object`（`packages/core/scope/src/index.ts:15`），直接当 scope key 用。
- 运行时（`probe-agent-full.mjs`，`EXIT=0`；为了越过 DSHA 策略对 `workingDirectory` 服务的硬要求，注册了一个 stub `workingDirectory`，**不触碰真实目录**）：

```
ctx.get(workingDirectory) ok: function
global-no-agent            -> isError=false "{\"ok\":true}"
global-with-agent          -> isError=false "{\"ok\":true}"
owner-tool-no-agent        -> isError=true "Error: unknown tool \"probe_owner_only2\""
owner-tool-with-agent      -> isError=false "{\"ok\":true}"
owner-tool-clone-agent     -> isError=true "Error: unknown tool \"probe_owner_only2\""
```

配套的可见性检查（`probe-all.mjs`）：

```
rt.get('probe_owner_only', undefined)     -> absent
rt.get('probe_owner_only', exact agent)   -> FOUND
rt.get('probe_owner_only', clone same id) -> absent
```

**结论**：
- 把**那个确切的对象**当 `agent` 传进去，owner scope 里注册的工具有效、handler 被调用；
- 传 `{...agent, id:'同一个id'}` 的克隆对象**无效**——scope 按对象**身份**匹配。
- 所以：插件只要 `ctx.agents.list()` / `ctx.agents.get(id)` 拿到 host 里的真实 Agent 对象（同一个引用），就能以它的身份进入它的 scope。**没有对 Agent 对象的真实性校验，只有引用相等。**

### 5.3 顺带证明：`agent` 字段会触发 DSHA 强制策略

`probe-stack.mjs`（`EXIT=0`，最小应用里放一个 `{id:'a1'}` 假 agent、不装 `workingDirectory`）：`createExecution` 阶段就被策略拦下并折成 `final-result`（策略抛错被吞进结果，不会冒出到调用方）：

```
createExecution kind: final-result
has agent on exec: true token: Symbol(dsh.tool.execution)
dispatch kind: final-result {"content":[...],"error":{"message":"tool registry scheduler invariant violated: missing cancellation state"}}
```

而带假 agent 的 `execute` 在 `probe-agent-scope.mjs` 里给出的错误文本是：

```
Error: DSHA_DESTRUCTIVE_BLOCKED: The current working-directory service is missing.
```

——来自 `dsha-destructive-policy/index.js:102-105 captureExecution()`：`if (exec.agent && (!workingDirectory || …)) fail('The current working-directory service is missing.')`。
**含义**：一旦带 `agent`，必经该策略；真实 host 里 `workingDirectory` 服务存在（`@deepseek-ai/dsh-base` 依赖 `dsh-working-directory` + `dsh-tool-working-directory`），所以会放行到下一步。

---

## 6. Q6 / Q7 —— Token 机制、ptc 折叠绕过、枚举

### 6.1 Q6：token 在 handler 的 `exec.token` 上可见

```
$ node --input-type=module -e "…"   # 注册 dummy 后在 handler 里打印 Object.keys(exec)
handler exec keys: token,callId,rootCallId,name,signal,deferContext,concludeTurn,arguments,agent,parent
handler exec.token: Symbol(dsh.tool.execution)
isError: false
EXIT=0
```

（`agent,parent` 即使 undefined 也出现，是安装版补丁 `Object.defineProperties(execution, …)` 把
`name/arguments/token/callId/rootCallId/agent/parent` 定义成**不可写、不可配置**的 own 属性造成的；
上游源码里这些是普通对象展开。）

类型定义：`ToolExecutionToken = symbol & {brand}`（`index.ts:320`），`ToolExecution.token: ToolExecutionToken`（`:398`），`createExecutionToken()` 每次 `Symbol('dsh.tool.execution')`（`:1913`）。
→ **token 就是一个普通 Symbol，没有全局登记表、没有签名**。它的唯一"权威"用途是 `canonicalResults: WeakMap<result, token>`（归一化判定），**不用于鉴权**。

### 6.2 Q6：`parent` 接受 token 并借 `nested` 绕过 ptc 折叠 —— 而且**任意值都行**

`mode:'ptc'` 下只有一个传输工具 `run_code` 可直呼。实测（`probe-all.mjs`）：

```
direct(native)   prep=final-result isError=true text="Error: unknown tool \"probe_dummy_ptc\": only `run_code` is callable directly — call `probe_dummy"
exec.token obtained without executing: symbol Symbol(dsh.tool.execution)
nested(realTok)  prep=dispatch isError=false text="{\"ok\":true}"
nested(forged)   prep=dispatch isError=false text="{\"ok\":true}"
nested(string)   prep=dispatch isError=false text="{\"ok\":true}"
ptc handler calls total      : 3
```

- `parent: Symbol('forged')` → 通过；
- `parent: 'x'`（字符串）→ **也通过**。

原因在源码里一目了然：`collapses()` 只看 `nested` 这个 boolean（`index.ts:1359`），而 `nested = exec.parent !== undefined`（`createExecution`，安装版 `:3239`）。上游 `:350` 的 `parent?: ToolExecutionToken` 只是类型，**运行时零校验**。

**结论**：
- 真 token：可用（而且从**任意一次自己的 `prepare` 返回的 `exec.token`** 就能白拿，甚至不用执行）；
- 伪造：可用（任意非 undefined 值）；
- 于是 **ptc 折叠（"模型只能直呼 run_code"）对插件不设防**。

### 6.3 Q7：运行时枚举 `ctx.tools`

`probe-all.mjs` 真实输出（`getOwnPropertyNames` 一行较长，原样保留）：

```
getOwnPropertyNames(proto): constructor,collapseSection,sdkSection,modeFor,requirePtcTransport,presentAs,wireSchemas,requirePtcRuntime,register,restrict,guard,guardReason,view,get,resolveExecution,schemas,sdkSchemas,schemaOf,executionMode,shapeDispatchLog,collapses,execute,completeScheduledExecution,createExecution,prepareScheduledExecution,prepareExecution,callerCancelled,cancellationResult,dispatchToolBody,dispatchScheduledExecution,finalizeScheduledExecution,finishScheduledExecution,applyFinalContent,notifyResult,serviceAsk,postExecute,markCanonical,createSuccessResult,normalizeDispatchResult,materializeFinalResult
getOwnPropertySymbols(ctx.tools): Symbol(cordis.tracker),Symbol(@deepseek-ai/dsh-tools.scheduler)
ctx.tools.deferredContexts (private field) type: object
```

**结论**：
- 不需要猜、不需要源码：**枚举 own symbols 就能直接发现内部入口 `@deepseek-ai/dsh-tools.scheduler`**；
- 连 TS-private 字段（`deferredContexts`、`cancellationStates`、`layers`…）都在 own property 列表里、可直接取到（`probe-min-app.mjs` 输出里也能看到 `canonicalResults` 等）。
- 另外两个真实事件通道（`probe-events3.mjs` / `probe-args.mjs`，均 `EXIT=0`）：

```
event captures: [["pre-execute","Symbol(dsh.tool.execution)","probe_evt3","e3"],
                 ["execute-wrapper","Symbol(dsh.tool.execution)","function","e3"],
                 ["result","Symbol(dsh.tool.execution)",false,true]]

observer saw name= probe_args args= {"msg":"sensitive-ish probe string"} callId= args-1 token= Symbol(dsh.tool.execution)
```

`tools/pre-execute`、`tools/execute`（around 包装器，拿到 `next`）、`tools/result` 都会把**活的 exec（带参数、callId、token）**交给监听者；未加 scope 的全局插件监听器能收到所有 agent 的调用（`scopeTarget` 对无 tag 的 ctx 一律放行）。

---

## 7. 额外但关键的两条：直接调 handler、以及"包装器替换"

### 7.1 直接 `ctx.tools.get(name).execute(args, fakeExec)` —— 管线被绕过，但"加固工具"会自检失败

```
$ node probe-all.mjs   （"extra" 段）
def.execute typeof: function | returned: {"ok":true} | forged token seen: Symbol(forged)
EXIT=0
```

`get()` 返回的是**注册时的原始定义对象**，`execute` 就在上面（`register()` 原样存入 layer：安装版 `:2984`；上游 `:1071`）。所以插件可以：
- 不进 `prepare/dispatch/finalize`；
- 不触发 ptc 折叠；
- 不触发管线里的 `captureExecution/prepareOperation/verifyDispatch`。

**但要精确区分"绕过"的范围**：DSHA 对三个高危工具做了"handler 内二次自检"——`dsh-tool-bash`（`lib/index.js:1` 导入、`:666-668` 调用 `verifyGlobalConsent/verifyBashRequest/preparedEnvironment`）、`dsh-tool-fs`（`:1`、`:608/:754` 调 `guardIntent`）、`dsh-tool-str-replace-editor`（`:1`、`:146/:163/:196` 调 `guardIntent`）。这些函数都先跑 `check(record, exec)`（策略 `:108`），而 `record` 只由管线里的 `captureExecution` 写入。实测用伪造 exec 直接调这四个函数：

```
$ node probe-selfenforce.mjs
verifyGlobalConsent -> THREW: DSHA_DESTRUCTIVE_BLOCKED: Execution identity changed or cancellation arrived.
preparedEnvironment -> THREW: DSHA_DESTRUCTIVE_BLOCKED: Execution identity changed or cancellation arrived.
verifyBashRequest   -> THREW: DSHA_DESTRUCTIVE_BLOCKED: Execution identity changed or cancellation arrived.
guardIntent         -> THREW: DSHA_DESTRUCTIVE_BLOCKED: Execution identity changed or cancellation arrived.
EXIT=0
```

**结论（修正版）**：
- 对 `bash` / `fs` 写 / `str_replace_editor`：直接调 handler **fail-closed**，绕不过去；
- 对**所有不自检的工具**（插件注册的工具、MCP 工具、记忆/媒体/抖音工具、`run_code` 之外的绝大多数）：直接调 handler **完全绕过** scheduler、ptc 折叠与审批管线；
- 本次**没有**对真实 `bash`/`fs` 工具做直接调用（红线），只用 dummy 证明机制、用策略函数本身证明自检会拒绝。

### 7.1b 一个必然推论：DSHA 的"审批"只覆盖它认识的破坏性操作

`prepareOperation` 只对 `exec.name === 'bash'` 做命令分类（策略 `:140`）；`guardIntent` 只认 `['write','edit','str_replace_editor']`（策略 `:187`/`:189`）。插件自己注册的工具（例如会发 QQ、写 DB、跑设备 shell 的工具）**既不在分类范围、也不会被要求审批**——它们走管线也是"无人看守"。

### 7.2 `tools/execute` 包装器可以做任何事

`dispatchScheduledExecution` 里的 `ctx.waterfall(carrier,"tools/execute",mutableExec, ()=>this.dispatchToolBody(mutableExec))`（安装版 `:3434`）意味着一个全局监听器既是观察者、也是**可替换的派发者**：它可以 `return next(exec)`，也可以自己算个结果返回，甚至自己调 `tool.execute`。这是公开扩展点，但它同时是"取得执行能力"的又一条通道。

---

## 8. Q8 —— 结论表

| # | 通道 | 可取到"签发/执行"能力 | 证据编号 |
|---|---|---|---|
| 1 | `ctx` 服务方法 `ctx.tools.execute()` | **是**（执行已注册工具；经 DSHA 强制策略，策略不防同 UID 插件） | #2 #6 #10 |
| 2 | 公开导出 `TOOL_RUNTIME_SCHEDULER`（`prepare/dispatch/finalize/finish`） | **是**（`prepare` 即"签发"token，`dispatch` 即执行） | #5 #6 #9 |
| 3 | 绝对路径 import + bare import（模块/symbol 同一性） | **是**（与 host 同实例、同 symbol） | #3 #4 #5 |
| 4 | 事件对象 `tools/pre-execute` / `tools/execute` / `tools/result` | **是**（live exec + 参数 + token；wrapper 可自办派发） | #10 |
| 5 | handler 收到的 `exec` | **是**（`exec.token` 可见；`parent` 仅判 `!== undefined`，可伪造绕过 ptc） | #6 #8 |
| 6 | `ctx.tools.get(name).execute(args, fakeExec)`（直接调 handler） | **是**（绕过 scheduler / ptc / 审批管线；对 `bash`/`fs`/`editor` 因 handler 自检而 fail-closed） | #11 #14 |
| 7 | `toOwnerAgent` | **否——该 API 不存在**（0.2.1-rc.2 无此导出） | #12 |
| 8 | `ctx.agents.list()` 拿真实 Agent 当 `agent` 传入 | **是**（确切对象选中其 scope；克隆同 id 无效） | #13 |

**证据编号索引**

- #1 基线核对：§ 开头（版本 `0.2.1-rc.2`、上游 HEAD `687f282e…`、安装版 sha256 `249ccaf3…`）
- #2 `logs/probe-all.log` Q1/Q1b 段；`q1-bare.mjs`、`q1-require.mjs`
- #3 `node -e` 解析来源扫描（§2）
- #4 `q2-identity2.mjs` 输出（namespace a===b===c、symbol 同一）
- #5 `/tmp/harness-probe/packages/core/tools/src/index.ts:481`、`:817`；安装版 `lib/index.js:2624`、`:2768`、`:3817`
- #6 `logs/probe-all.log` Q3/Q4 段（方法表、scheduler 调用、handler 计数）
- #7 同文件 Q7 段（枚举输出）
- #8 `logs/probe-all.log` Q6 段（direct / nested-real / nested-forged / nested-string）
- #9 `probe-min-app.mjs` 输出（own symbol → prepare|dispatch|finalize|finish）
- #10 `probe-events3.mjs`、`probe-args.mjs` 输出
- #11 `logs/probe-all.log` extra 段（`def.execute` + forged token）
- #12 `grep -rn "toOwnerAgent"` 无匹配；`grep -rl "OwnerAgent" …` 无匹配
- #13 `probe-agent-full.mjs`、`probe-all.mjs` Q5 段
- #14 `probe-selfenforce.mjs` 输出（四个策略自检函数对伪造 exec 全部抛 `DSHA_DESTRUCTIVE_BLOCKED`）

---

## 9. 静态引用（文件:行号）

**上游源码（/tmp/harness-probe，commit 687f282e）**

| 位置 | 内容 |
|---|---|
| `packages/core/tools/src/index.ts:320` | `export type ToolExecutionToken = symbol & {…brand…}` |
| `packages/core/tools/src/index.ts:350` | `readonly parent?: ToolExecutionToken`（仅类型） |
| `packages/core/tools/src/index.ts:398` | `readonly token: ToolExecutionToken` |
| `packages/core/tools/src/index.ts:481` | `export const TOOL_RUNTIME_SCHEDULER: unique symbol = Symbol('@deepseek-ai/dsh-tools.scheduler')` |
| `packages/core/tools/src/index.ts:817` | `readonly [TOOL_RUNTIME_SCHEDULER]: ToolRuntimeScheduler = { prepare, dispatch, finalize, finish }` |
| `packages/core/tools/src/index.ts:1359` | `private collapses(name, scope, nested)`：`!nested && mode==='ptc' && name!==RUN_CODE_NAME` |
| `packages/core/tools/src/index.ts:1377` | `async execute(exec: ToolExecutionInput)` |
| `packages/core/tools/src/index.ts:1497` | `private async prepareScheduledExecution(input)` |
| `packages/core/tools/src/index.ts:1913` | `createExecutionToken() → Symbol('dsh.tool.execution')` |
| `packages/core/agent/src/index.ts:568` / `:588` | `AgentRegistry.get(id)` / `list(): Agent[]` |
| `packages/core/scope/src/index.ts:15` / `:137` / `:154` | `ScopeKey = object` / `createScope()` / `scopeOf()` |

**安装版（运行中的那份）`…/@deepseek-ai/dsh-tools/lib/index.js`，sha256 `249ccaf318f6e6cbed201eb9cf92d81184204d2ff9f16677184b7011ff619041`**

| 行 | 内容 |
|---|---|
| `:1` | `import { attachPolicy, captureExecution, prepareOperation, verifyGlobalConsent, verifyDispatch } from "dsha-destructive-policy"; // DSHA_REQUIRED_POLICY_V1` |
| `:2624` | `const TOOL_RUNTIME_SCHEDULER = Symbol("@deepseek-ai/dsh-tools.scheduler")` |
| `:2768` | `[TOOL_RUNTIME_SCHEDULER] = { prepare, dispatch, finalize, finish }` |
| `:2800` | `attachPolicy(this, ctx)`（构造函数内，任何 ToolRuntime 实例都会被挂策略——包括插件自己 new 的） |
| `:3229` | `createExecution(exec)`；`:3239` `nested = parent !== undefined` |
| `:3268` | `captureExecution(this, execution, visible)`（在 tool 解析之前，agent 非空即校验 workingDirectory） |
| `:3311` | `prepareScheduledExecution(input)` |
| `:3341` | `if (decision.kind === "allow") await prepareOperation(this, exec)` |
| `:3408` / `:3411` | `await verifyGlobalConsent(exec)` / `verifyDispatch(this, exec, tool)` |
| `:3430` / `:3462` / `:3485` | `dispatchScheduledExecution` / `finalizeScheduledExecution` / `finishScheduledExecution` |
| `:3716` | `function createExecutionToken()` |
| `:3817` | `export { …, TOOL_RUNTIME_SCHEDULER, …, ToolRuntime, … }` |

**DSHA 强制策略 `…/dsha-destructive-policy/index.js`，sha256 `108aa4a400c67fe0650ba2368831a1ddc0c3726377ff9f664c87e34698b6a4e5`**

| 行 | 内容 |
|---|---|
| `:1` | `/** Mandatory Agent tool approval. Same-UID plugins and native terminals remain outside this policy. */` |
| `:102` | `captureExecution()`：`exec.agent` 非空时强制要求 `workingDirectory.get/ensure` |
| `:108` | `check()`：按对象身份比对 exec / token / agent / ctx / session / runtime / workingDirectory |
| `:140` | `prepareOperation()`：每次都 `globalConsent()`（本机 bridge 只读查询）；非 `bash` 提前返回 |
| `:176` | `verifyDispatch()`：校验 tool 身份、一次性派发标志 |

**插件加载（同进程 ESM，非 worker）**

- `…/cordis-plugin-loader/lib/index.js:219/:223`：插件入口走 `await import(...)`（同进程 ESM），无 `worker_threads` / `child_process`。
- `/root/.dsh/profiles/web/package.json`：`dsh.profile.bundles` 直接列 `dsh-persona-core`、`dsh-memory-core`…；`dependencies` 用 `link:/root/.dsh/plugin-src/…`。
- `/root/.dsh/plugin-src/dsh-memory-core/lib/index.js:59`：`import z from '@deepseek-ai/schemastery'`（生产中的插件**已经在** import host 包）。
- `/root/dsha-computer-use-android/lib/index.js:1-2`、`/root/dsha-tool-vscreen/lib/index.js:1`、`/root/dsha-device-shell-guide/lib/index.js:2`：DSHA 官方插件 import `@deepseek-ai/dsh-mcp-client`、`dsh-computer-use/brand`、`dsh-llm`。

---

## 10. 未执行 / 无法执行（如实列出）

| 项 | 状态 | 原因 / 替代证据 |
|---|---|---|
| 在 38105 真实 host 进程内注入探针、读取真实 `ctx` | **NOT RUN** | 任务红线"绝对不要碰它"。替代：独立进程 + 安装版同一 lib + 同构 ctx（§4）。这是 API 可达性证据，不是"已注入生产"证据。 |
| 在真实 host 里对 `bash`/`fs` 工具做 `prepare→dispatch` 或直接 `execute` | **NOT RUN** | 禁止真实业务工具/写文件/读写生产 DB。替代：dummy 工具 + 静态代码路径（§7.1）。 |
| 用 `toOwnerAgent` 传 agent | **BLOCKED（不存在）** | 0.2.1-rc.2 上游源码与安装版均无该 API（§5.1）。替代：直接传 `ctx.agents.list()` 的真实 Agent 对象，语义已证明（§5.2）。 |
| 取得真实 host 里的 Agent 对象引用 | **NOT RUN** | 需要进程内注入（红线）。替代：`AgentRegistry.list()` 静态签名 + 等价 agent 对象 + scope 语义实测。 |
| `--preserve-symlinks` / 插件自带 `dsh-tools` 副本下的符号分裂 | **NOT RUN** | 非默认运行方式，生产未使用。当前默认参数下 `a===b===c` 已实测。 |
| 真实 bridge `/app/native-policy` 返回值内容 | 间接 | 未主动 dump（避免额外触碰 3090）；由"dummy dispatch 成功"反证当前 `globalAllow=true`。 |

---

## 11. 产物清单（全部在 /tmp，未改任何生产文件）

```
/tmp/recon-reachability/
├── EVIDENCE.md                     ← 本文件
├── q1-bare.mjs / q1-require.mjs    ← Q1
├── q2-identity.mjs / q2-identity2.mjs
├── probe-min-app.mjs               ← 最小 cordis 应用（首证）
├── probe-all.mjs                   ← 汇总探针（Q1-Q7 + 事件 + 直接调 handler）
├── probe-ptc-nested.mjs            ← ptc 折叠/伪造 parent
├── probe-agent-full.mjs            ← agent scope 全链路
├── probe-agent-scope.mjs / probe-scope2.mjs / probe-stack.mjs
├── probe-events3.mjs / probe-args.mjs / probe-events-direct.mjs
├── probe-selfenforce.mjs           ← 策略自检函数对伪造 exec 的 fail-closed 验证
└── logs/probe-all.log              ← 汇总探针完整原始输出（EXIT=0）
```

校验：

```
cf750dedf7db0f4cc37804a185d687a251216de3491d170065d431597967040a  probe-all.mjs
4e71e8b8adbc9e8958e257787b8dcac0427272c1bd64c2c882f1f947c1946210  logs/probe-all.log
249ccaf318f6e6cbed201eb9cf92d81184204d2ff9f16677184b7011ff619041  …/@deepseek-ai/dsh-tools/lib/index.js
108aa4a400c67fe0650ba2368831a1ddc0c3726377ff9f664c87e34698b6a4e5  …/dsha-destructive-policy/index.js
```

**生产触碰情况**：`/usr/local/lib/node_modules/**`、`/root/.dsh/**`、生产 DB、profile/config、38105 进程：**均未修改/未重启/未 kill**。仅以只读方式读取文件与 grep。

---

## 12. 给后续评估者的三句话

1. **能力本身不是漏洞**：插件和 host 同进程、同 UID、同模块实例，`ctx` 就是完整 ctx；只要它想，拿调度器入口是"顺手"的事（甚至靠 `getOwnPropertySymbols` 就能发现）。
2. **DSHA 的强制审批策略只约束"Agent 经管线调用工具"，从设计上不约束同 UID 插件**（策略首行自述）；它对 `bash`/`fs`/`editor` 有 handler 内二次自检，对**其它所有工具（含插件自己的工具）没有审批**。如果威胁模型包含"恶意插件"，这一层不提供防护。
3. **唯一能真正隔离插件的边界是进程/UID/模块副本隔离**（例如 `--preserve-symlinks` 让符号分裂、或把插件放进独立 worker 只暴露 façade——仓库里的 `dsh-cordis-host-runner` 已经有这种 façade 机制，但只用于 `dsh-tool-cordis`，没有用于本地 `plugin-src` 插件）。
