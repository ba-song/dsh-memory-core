# Persona Core 专项独立审查 · P0-1 身份与会话边界

> 任务：P0-1 Persona Core 身份与会话边界独立审查
> 仓库：`ba-song/dsh-persona-core`
> 实际审查 HEAD：`a84c7badd1e6c971a66b6c39dd4f7ab795df4b90`（main，2026-11-17 18:54:52 +0800）
> tree：`ec05b3dec856f976881b6e6365188b9d92377ce9`
> 性质：只读；未修改代码/配置/DB/合同；未部署/重启；未触碰生产。
> 时间：2026-11-22 23:05 (Asia/Shanghai)
> 结论：**P0-1 兼容性 REJECT**。Persona 当前 `roleOf`/`bindingOf` 不能作为 Conversation 隔离或“会话属于汐”的可信依据；群成员身份不在 Persona 职责内，且服务层会返回其他 persona/work 的绑定为 `bound:true`。

---

## 1. 基线与实际源码

| 项 | 值 |
|---|---|
| 仓库 | `ba-song/dsh-persona-core` |
| 分支 | `main` |
| HEAD | `a84c7badd1e6c971a66b6c39dd4f7ab795df4b90` |
| tree | `ec05b3dec856f976881b6e6365188b9d92377ce9` |
| 工作区 | 审查使用只读 clone/worktree；未修改 |
| README | `README.md` 版本 `0.2.0`，文档核对日期 2026-11-07 |
| 测试 | 现有 303/303 pass（历史基线，不代表 P0-1 通过） |

README 明确定位：

- 身份：稳定 `self_id`、显示名、名字版本/人格版本；改名不改 `self_id`。
- 注入：按会话身份/目录决定是否注入；子智能体/群聊/白名单外默认不注入。
- 不负责：QQ 消息收发（Channel Bridge）、记忆检索（Memory）。
- 服务接口：`bindingOf(sessionId)` 返回身份绑定行（含 `bound:true`）；`roleOf(header)` 返回 `{session_id,persona_id,role,bound}`；Memory/autonomy 用它们判身份。

**关键源码：**

- `lib/service.js:64-69`：`selfId()` 返回 `row()?.id ?? 'self:unknown'`。
- `lib/service.js:126-135`：`bindingOf()`。
- `lib/service.js:141-153`：`roleOf()`。
- `lib/bindings.js:14-15`：role 常量只有 `persona`/`work`。
- `lib/bindings.js:22-29`：`session_bindings` schema。
- `lib/bindings.js:54-73`：`getBinding()`、`personaBindingOf()`。
- `lib/bindings.js:80-93`：`bindSession()`。
- `lib/inject.js:86-99`：`writeBinding()`。
- `lib/inject.js:105-143`：`mount()` 的 private/group 分支。
- `lib/scope.js:14-19`：`headerOf()`；`lib/scope.js:64-70`：`classify()`。
- 测试：`tests/b3-refresh-service.test.mjs:75-113`；`tests/d-persona-bindings.test.mjs:52-132`。

---

## 2. `dyPersona.roleOf(header)` 追踪

### 2.1 流程

```text
roleOf(header):
  h = headerOf(header)                  // null/agent/header → {}
  sid = String(h?.id ?? '')             // 只认 header.id
  if !sid: return {session_id:null, persona_id:null, role:null, bound:false}
  c = conn()                            // DB 不可用 → null
  b = c ? getBinding(c, sid) : null
  if !b: return {session_id:sid, persona_id:null, role:null, bound:false}
  return {session_id:sid, persona_id:b.persona_id, role:b.role, bound:true}
  catch: return {session_id:null,persona_id:null,role:null,bound:false}
```

### 2.2 `role` 如何判断

- 不是“判断”，只是把 `session_bindings.role` **原样返回**（`lib/service.js:149`）。
- role 常量只有 `persona`/`work`（`lib/bindings.js:14-15`）；没有 `owner`/`third_party`/`group` 主体类型。
- `roleOf` 不校验 role 枚举；任何写入的字符串都会返回。
- `roleOf` 不校验 `persona_id === 当前 selfId`；指向别的 persona 的行也返回 `bound:true`。
- `roleOf` 不看 `classify()`/private/group/subagent；只看 session_id 是否存在 binding。

### 2.3 `bound` 如何判断

- `bound:true` 仅表示 `session_bindings` **存在该 session_id 的行**（`getBinding` 非空）。
- 不表示：绑定指向当前 self、role=persona、binding 新鲜、conversation 匹配、证据可信、未过期/撤销。
- 缺表/DB 不可用/查询异常 → `bound:false`；`roleOf` 不抛。
- 测试只覆盖“命中 persona/未绑定/缺表”（`tests/b3-refresh-service.test.mjs:75-113`）；未覆盖 other persona/work/group 旧行。

### 2.4 缺少或不可信 header

- `headerOf(null)` → `{}`；`sid=''` → `{session_id:null,persona_id:null,role:null,bound:false}`。
- 缺 `header.id` → 同上；不抛，也不产生错误码。
- header 的 `cwd`/`role`/chat type 不参与 `roleOf`；只认 `id`。
- 这是“安全空值”，不是“fail closed 错误”；调用方必须自己把 `bound:false` 当 unknown，不能当已授权。

---

## 3. `bindingOf(sessionId)` 追踪

### 3.1 数据来源与流程

```text
bindingOf(sessionId):
  c = conn(); sid = String(sessionId ?? '')
  if !c || !sid: return null
  b = getBinding(c, sid)
  return b ? {...b, bound:true} : null
  catch: return null
```

- 数据来源：Persona DB 的 `session_bindings`（单表；`lib/bindings.js:22-29`）。
- 字段：`session_id/persona_id/role/cwd/source/created_at`；无 conversation/evidence/status/expiry/version。
- `bindingOf` **不校验** `role`、`persona_id===selfId()`、conversation、status/expiry、evidence。
- 只要行存在就 `bound:true`；与 `roleOf` 一样，other persona/work 行也返回。
- `bindingOf` 与 `roleOf` 都只读、无权限门；README 明确供 Memory/autonomy 判身份。

### 3.2 不同 Conversation 是否可能绑到同一身份上下文

- 表主键是 `session_id`；不同 session 可各自绑定同一 `persona_id`（同一汐的多个运行会话），这在“self 身份”上可接受，但**不代表 Conversation 隔离**。
- `session_id` 是运行时 ID，不是 conversation_id；Persona 不存 conversation_id，无法证明两个 session 属于同一/不同 Conversation。
- `bindSession` 对同 session 不同 persona **不覆盖旧行**（`lib/bindings.js:80-93`）；旧 persona 行保留，`bindingOf` 会返回旧行 `bound:true`，`roleOf` 也返回旧 persona。
- 仅 `personaBindingOf` 会拒绝 other persona/work（`lib/bindings.js:67-72`），但它只在 `inject.mount` 使用，`bindingOf/roleOf` 不使用它。
- 若 session_id 被宿主复用/轮换/导入旧数据，旧绑定会被直接继承；Persona 没有 conversation 维度可阻止。

**结论**：`bindingOf` 不能区分 Conversation；同一 session_id 的旧/异 persona 绑定会被服务层当作 `bound:true`。这是 P0-1 的直接风险。

---

## 4. 私聊、群聊、Home 的身份区分

### 4.1 `classify`

`lib/scope.js:64-70`：

- 真子智能体（origin/delegationDepth）→ `subagent`。
- 无 cwd → `unknown`。
- cwd 是群目录（`qq-群`/`群_`）→ `group`。
- 其他 → `private`。

Home 没有独立分类；只要 cwd 不是群目录就归 `private`。

### 4.2 `inject.mount`

- `subagent` 直接拒（`lib/inject.js:113`）。
- `group`：默认 `groupMode!='brief'` 直接拒；即使 brief，也在 group 分支，**不写 binding**（`lib/inject.js:117-124`）。
- 其他（private/home）：`writeBinding` 只在 `cwdBindable` 命中时写；然后 `personaBindingOf` 校验 role/persona；不命中再走 cwd 白名单（`lib/inject.js:126-142`）。
- `writeBinding` 的 role 固定 `persona`；source `default`；不写 conversation/evidence。
- `bind.enabled=false`：不写/不读绑定，完全走 cwd 白名单（test D7）。

### 4.3 结论

- 注入层对 group/subagent 有拒绝，private/home 可注入；但这是**注入可见性**，不是 `roleOf` 身份判定。
- `roleOf(header)`/`bindingOf(sessionId)` **不调用 `classify`**；它们不知道 private/group/home。若 group session 存在旧 binding（历史/手工/旧版本），服务层仍返回 `bound:true`。
- Home 与普通 private 在 Persona 身份层**无区分**；没有 owner 主体。
- 群聊不写新 binding（test D6），但服务层没有“group 不返回 binding”的防御。

---

## 5. 未知成员/未知会话/缺少身份时是否 fail-closed

| 场景 | 当前行为 | 评价 |
|---|---|---|
| header 缺失/无 id | `roleOf` 返回 null 字段/bound false；`bindingOf` null | 安全空值，但不是错误/fail-closed 语义；调用方可能当“未知”继续 |
| DB 不可用 | 两者 null/false，不抛 | 降级，不是 fail-closed 错误 |
| binding 缺失 | `bound:false`/null | 可接受，但无 reason |
| binding 指向 other persona | `roleOf`/`bindingOf` **bound:true** | **不安全**：`personaBindingOf` 的校验未用于服务层 |
| binding role=work | `roleOf` 返回 work/bound true；`bindingOf` 同 | **不安全**：work 会话可被当“绑定” |
| group session 有旧 binding | 服务层 bound true；inject group 分支不使用 | **不安全**：服务消费者可能误用 |
| 群成员无 ID | Persona 根本不接收 member ID | **无法判断**；不能保证不冒认 |
| Home/owner | 无 owner 身份；private | **无法判断 owner** |

**结论**：`roleOf`/`bindingOf` 在“缺失”时是安全空值，但在“存在异 persona/work/旧行”时不是 fail-closed；群成员/Home 身份没有模型。

---

## 6. 对照 P0-1 原则

| P0-1 原则 | 当前 Persona | 结论 |
|---|---|---|
| 私聊与群聊分离 | 注入层 classify/group 拒绝；服务层 roleOf/bindingOf 无 classify/conversation | **PARTIAL** |
| 群聊成员身份必须用真实成员 ID | Persona 无 member ID 输入/输出；只按 session binding | **REJECT**（不在 Persona 能力内） |
| 无可靠成员 ID 不得冒认主人 | Persona 无 owner 映射；但 roleOf 可返回 work/异 persona bound；无 member 检查 | **PARTIAL/REJECT**（不能保证） |
| 不允许把其他会话身份绑定继承到当前会话 | 按 session_id 查；无 conversation 维度；旧/异 persona 行仍 bound:true；无过期/撤销 | **REJECT** |
| **总体 P0-1 兼容性** | 服务层身份判定不能作为 Conversation 隔离依据 | **REJECT** |

**说明**：Persona 的注入层（`inject.mount`）有 group/subagent 拒绝，这是部分正面证据；但 P0-1 要求的是“身份/会话边界”，`roleOf`/`bindingOf` 是 README 明确给 Memory/autonomy 用的接口，二者未实现该边界。

---

## 7. 风险点与代码证据

### P0

1. `bindingOf`/`roleOf` 把 other persona/work 行返回 `bound:true`（`lib/service.js:126-135,141-153`）；`personaBindingOf` 的 role/persona 校验只在 inject（`lib/bindings.js:67-72`）。
2. 无 conversation_id；`session_bindings` 只有 session_id（`lib/bindings.js:22-29`）；session 复用/旧行会继承。
3. `bindSession` 同 session 不同 persona 不覆盖旧行（`lib/bindings.js:80-93`）；服务层仍可读到旧行。
4. group 旧 binding 服务层不防御；`classify` 只在 inject。
5. `selfId` 仍 sentinel（`lib/service.js:64-69`），P0-1 的身份根不可信。

### P1

- `roleOf`/`bindingOf` 缺 reason/error；DB 故障降级为 false/null，不是 fail-closed。
- 无 binding 过期/撤销/evidence/status；旧行无时间质量。
- `role` 任意字符串可写入（`bindSession` 不校验枚举）。
- `bindSession` 可从任何调用方写（导出函数），无权限门。
- `bindingOf` 无权限门（README 说只读元数据）；Memory/autonomy 可能把它当授权。

### P2

- Home 与 private 无区分。
- 群成员/群实体不在 Persona 模型。
- README 仍称 `bindingOf/roleOf` 供 Memory/autonomy 判身份；与 P0-1 冲突。

---

## 8. 与 Memory / Channel Bridge 的接口假设与潜在冲突

| 假设 | 证据 | 冲突/风险 |
|---|---|---|
| Memory 用 `roleOf`/`bindingOf` 判“是不是她的会话” | README 第 216 行；`lib/service.js` 注释“给 memory/autonomy 用” | `bound:true` 不等于 current self/role/persona；Memory 可能把 work/other persona 当汐 |
| Channel Bridge 提供 runtime session_id，Persona 按 session 绑定 | `roleOf` 只认 `header.id` | Persona 无 conversation_id；Channel 的 conversation 与 runtime session 映射未进 Persona；session 复用/轮换时无法隔离 |
| 群聊由 Channel/Memory 处理成员身份 | Persona 无 member 输入 | Persona 不能验证群成员；`roleOf` 对 group 无防护 |
| Home/Owner 是 private | Persona 只 private/group/subagent | 无 owner 身份；owner 会话与其他 private 在 Persona 身份层不可区分 |
| R4 D1 三层关系：runtime↔self 归 Persona | 当前旧 `session_bindings` 单表 | `roleOf/bindingOf` 把 conversation/subject/role 混在旧表；与 R4 分层冲突 |
| Memory 写 self episode 前验证 canonical self | `selfId` sentinel | P0-1 依赖的 self 根不可信；Memory 可能接受 sentinel |

**待其他模块确认（无源码证据，不替其承诺）：**

1. Channel Bridge 的 conversation_id 是否严格一 conversation 一 runtime session；轮换/旧 session 是否复用。
2. Memory 实际在哪些路径使用 `roleOf`/`bindingOf`，是否检查 role/persona。
3. Home 是否与其他 private 共享 runtime session；若共享，Persona 无法按 conversation 隔离。
4. 群成员 identity 是否由 Memory 从 Channel envelope 获取；Persona 不再补。

---

## 9. 建议（不实施）

1. **不要继续把 `roleOf`/`bindingOf` 当身份授权**；在 R4/Persona v3 前，Memory 应把 `bound:true` 视为弱提示，必须另验 canonical self/role/conversation。
2. `roleOf`/`bindingOf` 至少应：
   - 校验 `persona_id === selfId()`；
   - 校验 `role === 'persona'`；
   - 返回 `bound:false/reason` 对 other persona/work；
   - 识别 group/subagent，避免旧 group binding；
   - 增加 status/expiry/evidence/conversation 引用（物理 PROPOSAL）。
3. 拆 `session_bindings`：Persona 只保留 runtime_session↔canonical self；conversation↔runtime session 归 Channel；message↔speaker/experiencer 归 Memory（R4 D1）。
4. `selfId` 必须 canonical/null（P0-3）；否则 P0-1 无根。
5. 增加测试：
   - roleOf other persona/work；
   - group 旧 binding；
   - same session different persona；
   - missing header/DB down；
   - conversation/session reuse；
   - Memory consumer 不把 bound 当授权。

---

## 10. 结论与状态

- P0-1 Persona Core 兼容性：**REJECT**。
- 私聊/群聊注入层分离：**PARTIAL**。
- 群成员真实 ID：**REJECT / 不在 Persona 职责内**，需 Channel/Memory。
- 不继承其他会话 binding：**REJECT**（无 conversation；旧/异 persona 行仍 bound）。
- 未知/缺失身份 fail-closed：**PARTIAL**（空值但无错误；存在行时不校验）。
- 当前实现不能承接 P0-1 Conversation 隔离契约；需 Persona v3/接口修复，且 Memory/Channel 不能把 `roleOf`/`bindingOf` 当授权。
- 未修改任何代码/配置/DB；未部署/重启；未触碰生产；未改 R4.1 合同。
- 未执行：生产 Memory/Channel 联调、真实 QQ/群/Home 会话、conversation/session 复用实测、Persona v3/EI-2A——**NOT_RUN**。
