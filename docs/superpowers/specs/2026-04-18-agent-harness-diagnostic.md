# Agent Harness 诊断与演进 Roadmap

**Spec Date**: 2026-04-18
**Scope**: AutoNovel-Studio Agent 运行时（harness）的跨子系统诊断：对照 Claude Code 源码实现，识别 gap、排优先级、给出分阶段演进路径。
**Status**: Diagnostic only — no implementation; produces sub-specs downstream.
**Reference**: `D:\AI\claude-code-analysis\analysis\04*-*.md`（9 章系统分析，约 5300 行）

## 目的

AutoNovel 的 Agent harness 从 Python 单文件 while-loop 迁移到 TypeScript + Vercel AI SDK 的单 `streamText()` 调用，代码从数千行压到 127 行。这个精简换来了可维护性，但也把很多 state-of-the-art 的 Agent runtime 能力丢在门外。本文档的作用是：

1. **对照诊断** — 9 个子系统（tool call / skill / prompt / memory / context / multi-agent / session / hooks / MCP-sandbox）逐个拿我们的实现和 Claude Code 的对比
2. **识别高价值 gap** — 哪些 gap 对"AI 长篇小说写作"这个具体产品真正重要，哪些只是"技术酷点"
3. **排演进 roadmap** — 按产品价值 × 实施代价划分 3 个阶段，给出后续具体 spec 的写作顺序

**本文档不是实施方案**——不写具体代码改造 refactor。每个"建议路径"产出的应当是一个独立的 spec/plan，由 writing-plans 技能单独展开。

## 当前架构总览

```
┌───────────────────────── AutoNovel Agent Harness (~1500 loc) ─────────────────────────┐
│                                                                                       │
│  [ route: author-chat.ts ]                                                            │
│         │                                                                             │
│         ▼                                                                             │
│   runAgentStream(options) ──→  streamText({                                           │
│         │                          model, system, messages, tools,                    │
│         │                          stopWhen: stepCountIs(20),                         │
│         │                          abortSignal                                        │
│         │                       })                                                    │
│         │                                                                             │
│   ┌─────┴────────────────────────┬──────────────────────────┐                         │
│   ▼                              ▼                          ▼                         │
│ buildAuthorPrompt(ctx)    ToolRegistry                  composeHooks                  │
│ - 身份                    ├─ 20 tools (5 categories)    - review-prev-chapter        │
│ - 铁律                    ├─ Zod schema validation      - block-while-user-editing   │
│ - 工具箱                  ├─ permissionLevel tag         - session-tracker            │
│ - 剧情账本                └─ getToolSummary (prompt str) └─ 4 hook points:           │
│ - 记忆                                                      before/intercept/after   │
│                                                             /error                    │
│                                                                                       │
│  [ chat-history.ts ] — persist last 50 msgs, inject last 20 into context              │
│  [ memory/* ]       — core (cross-book) + project (per-book) 2 层，JSON 文件          │
│  [ prompts/skill_*.md ] × 9 — YAML frontmatter + markdown body，动态发现              │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**关键特征：**
- **Vercel AI SDK 接管**：所有 tool_call cycling、streaming、retry 底层由 SDK 完成
- **Section-based 系统提示**：`PromptSection[]` 有序装配，静态 + 动态混合
- **Hooks 是拦截器，不是观察者**：`interceptToolCall` 可返回 `{block: true, message}` 直接替换 tool 执行结果
- **Editorial 是硬编码并发**：`Promise.all` 并行 5 个审稿人，但不是通用 subagent 机制
- **History 硬切 20 条**：`chat-history.ts:17` `.slice(-20)` —— 长篇无记忆

---

## 子系统 1 · Tool Call 执行引擎 🟡（更正自 🔴）

> **2026-04-18 诊断更正**：本节最初评级 🔴 并估工期 1 周（基于"需要写 `toolOrchestration.ts`"）。**实际验证 Vercel AI SDK 6.0.142 源码**（`server/node_modules/ai/dist/index.mjs:6261-6290`）发现并发是 **fire-and-forget** 的，在 streaming 过程中一遇到 tool-call chunk 就立即启动 execute，比 `Promise.all` 还激进。我们的 `toVercelTools` + `composeHooks` 没有阻塞。所以：
>
> - 严重度降到 🟡
> - Phase 1 工作量从 5-8 天 → **1.5-2 天**
> - 不单独写 spec/plan，作为 Phase 2 前置 housekeeping 处理
> - 真实工作项：① 验证 provider 是否 emit 多 tool_use（DeepSeek/GLM 可能需显式 `parallel_tool_calls: true`）；② prompt-engineer Agent 批量调 read；③ **审 write-tool 并发安全**（`.bak` + audit log 在多 save 并发时的 race）；④ 前端 SSE 并发 tool_start/done 渲染稳定性



### 现状

- 所有 tool call **严格串行**：Vercel AI SDK 按 LLM 输出顺序逐个 await
- 单层 Zod schema 校验（由 SDK 做），无语义层 `validateInput`
- Permission: `permissionLevel: 'read' | 'write' | 'destructive'` 仅作 tag，**不触发 UI 询问**
- Hooks 通过 `composeHooks(...)` 组合，`interceptToolCall` 可 block（硬拦截）
- 拦截失败靠 `first-block-wins`（`base-tool.ts:82-88`）

关键代码：`server/src/tools/base-tool.ts:139-180`（`toVercelTools` 里 before→intercept→execute→after 四段）

### Claude Code 对照

参考 `04b-tool-call-implementation.md`：

```
模型输出 assistant message
  ↓ 含一个或多个 tool_use blocks
query.ts 收集 tool_use
  ↓
选择 streaming executor 或 runTools()
  ↓
toolOrchestration.ts 按并发安全性分批           ← 我们没这层
  ↓
toolExecution.ts 逐个执行
  ├─ schema 校验
  ├─ validateInput（语义层，独立于 schema）  ← 我们没这层
  ├─ pre-tool hooks                          ✅ 有
  ├─ permission / ask / deny                  ← 只 tag，没 ask
  ├─ tool.call()                              ✅ 有
  └─ tool_result / attachment / progress      ← result 是 string，不带 attachment
```

**三个我们缺的机制：**

1. **并发安全分批** (`toolOrchestration.ts`)：模型一轮若吐出 `[read_outline, search_lore, read_graph]` 三个 read tool，CC 并发跑完 → 一并回传给模型。我们串行。
2. **`validateInput` 语义校验**：schema 只验结构，`validateInput` 验"数据是否合理"（例：file_path 指向的文件是否存在）。我们靠 tool.execute 里 if-return 兜底。
3. **Permission UI**：destructive 操作弹框询问。我们没有 UI 层 prompt（本地单人工具可以理解，但 editorial 有成本关时可能需要）。

### Gap 严重度

- **性能**：Agent 一轮写章典型调用链 `read_outline → search_lore → read_graph → list_skills → load_skill('iceberg') → save_draft`，6 次串行。其中前 5 个全是 read，并发后能压缩到 2 次 round-trip（5 并行 read + 1 write）。**时延降 50-70%**，成本不变。
- **用户体验**：延迟降到"Agent 写一章感觉像一个完整思考过程"，而不是"看它一个工具一个工具磨"。
- **代码复杂度**：增加 `toolOrchestration` 模块约 200 行 + 改造 agent-loop 约 50 行。

### 建议路径

**Phase 1 Spec: "Concurrent tool-call orchestration"**

方案（递进三档）：

- **档位 A - 极简**：agent-loop 里拦截 LLM 的 multi-tool-call 输出，按 `permissionLevel === 'read'` 分组 `Promise.all`；write/destructive 仍串行。不改 SDK，属于后处理
- **档位 B - 正经**：抛弃 Vercel AI SDK 的 tool cycling，自己写 while-loop 驱动 `generateText({tools, toolChoice: 'none'})`，拿到 tool_calls 后手动分批。失掉 SDK 的 retry/streaming 好处，但完全控制
- **档位 C - 激进**：整体迁移到 Anthropic SDK 原生 + 手写 orchestration。最灵活，工程量最大

**推荐档位 A** —— 投入 2-3 天，时延砍半，不动 SDK 根基。

### 粗略工期：3 天 spec + 5 天实现

---

## 子系统 2 · Context 管理 / Auto-Compact 🔴🔴

### 现状

**`server/src/routes/chat-history.ts`（27 行，整个文件）：**

```typescript
export function loadHistory(...): ModelMessage[] {
  // ...
  return raw.slice(-20)  // ← 就这一行决定我们多久失忆
}
```

就这么硬切。Agent 写到 ch20 时，ch01-ch10 的讨论、决策、iteration 历史全丢了。

**Memory 层稍微好一点**（`server/src/memory/project-memory.ts`）——4 个 JSON 文件：
- `decided_facts.json`
- `plot_progress.json`
- `world_state.json`
- `character_states.json`

但要 Agent 主动调 tool 写入；而且没有"关键事件优先保留"的重要性打分。

### Claude Code 对照

参考 `04f-context-management.md`（全章）：

```
200k 总窗口
  ├─ 20k 预留给 Summary API（MAX_OUTPUT_TOKENS_FOR_SUMMARY）
  ├─ 剩余为 Effective Context
  │
  ├─ shouldAutoCompact(messages, model) 实时监测
  │    ↓ 阈值到达
  ├─ compactConversation()
  │    ├─ stripImagesFromMessages() 剔除图片 [image]
  │    ├─ stripReinjectedAttachments() 剔除会重注的附件
  │    ├─ Forked Agent 生成 summary（借用主路径 prompt cache）
  │    ├─ PTL Fallback: 超 token → 剥洋葱删 20% 再试（≤ MAX_PTL_RETRIES 次）
  │    └─ 熔断器: 连续 3 次失败 → 停止该会话 autocompact
  │
  └─ 状态重启点补偿 (State Re-injection)
       ├─ 刚读过的 file attachments
       ├─ 正在做的 Plan
       ├─ 仍激活的 Skill
       └─ 未完成的 Deferred Delta tools
```

**核心创新**：压缩不是"失忆"，而是"把长文本历史换成精简摘要 + 重新注入当前工作台状态"。Agent 压缩完仍然知道它"刚读过什么、正在做什么"。

### Gap 严重度

**这是我们最大的 gap。** 对 AI 写长篇小说（50-200 章）这个产品场景：

- 写 ch30 时 Agent 早就忘了 ch03-15 用户说过"主角不能哭"这类偏好
- 改写 ch10 后 Agent 再写 ch11 时，ch10 的改动细节丢了（history 只剩最后 20 条消息，改写讨论早漂走）
- 审稿意见滚动 2-3 轮后，最早那轮的 issue fingerprint 失效

Memory 层能救一部分（character_states 滚动），但"用户在聊天里的零散偏好 + 中期讨论结论"这类**非结构化关键信号**没地方落。

### 建议路径

**Phase 2 Spec: "Context manager + rolling summary"**

核心组件：

1. **`ContextManager`** 新模块：
   - 维护当前 token 估算（用 `gpt-tokenizer` 或 `js-tiktoken`）
   - 达阈值（比如 80% 模型上限）触发 compact
2. **Compact pipeline**：
   - Fork 一个低成本 LLM call（用 EDITORIAL_MODEL）生成 summary
   - Summary 拼到 system prompt 的 `[会话摘要]` section
   - 保留最后 N 条原始消息
3. **状态重注入**：
   - 保留最后一个被 Agent 读过的 `read_outline` 结果（若有）
   - 保留 active `load_skill` 产生的 skill 片段
4. **PTL fallback**：防御 summary 本身超长
5. **熔断器**：连续失败停止自动压缩

### 粗略工期：5 天 spec + 10-14 天实现

**注意**：这是 3 个 RED gap 里**最解决长篇痛点**的一个，建议排 Phase 2 第一或第二位。

---

## 子系统 3 · Multi-Agent / Task 工具化 🔴

### 现状

**一个硬编码的"多 agent"**：Editorial pipeline 的 5 审稿人通过 `Promise.all` 并发（`server/src/editorial/pipeline.ts`）。但它：
- 不是通用 Task 工具——Author 不能"派个子 Agent 去研究某角色在前 10 章的表现"
- 5 个审稿人 context 是临时构造的 `EditorialContext`，不是 fresh subagent fork
- 结果是结构化 JSON 返回给 Author，不是 subagent → parent 消息流

**主 Agent 独自干所有事**：写正文、查 lore、补伏笔、审自己——在同一个 context 窗口里全做。

### Claude Code 对照

参考 `04h-multi-agent.md`（922 行，最长的一章）：

Claude Code 有**三层 multi-agent**：

1. **普通 `AgentTool`**：主 Agent 派一个 subagent，subagent 跑完回收 final result。支持同步/后台/fork
2. **Coordinator Mode**：主线程变 coordinator，用 AgentTool 持续派多个 workers，workers 通过 `task-notification` 回流
3. **Swarm / Teammates**：创建 team，有 lead + teammates，支持 in-process / tmux / iTerm2 后端，有 mailbox / 权限桥 / 共享 task list

**关键设计要点：**
- subagent 有**独立 context 窗口**（fresh，只看到 task prompt + 被允许的 tools）
- subagent **工具权限可收敛**（主 Agent 有 20 个工具，subagent 可能只给 read 类 5 个）
- 结果回传是**一条 assistant message**，把 subagent 内部的多轮 tool call 压扁成一句话结论
- **permission bridge**：subagent 的权限请求可以回到 leader 决策

### Gap 严重度

**实际上 editorial 已经证明了"派并行 subagent 干细分任务"对质量有巨大加成**（5 视角并行找 bug）。但目前 Author 无法自己发起这种"我让副手去查一下"模式：

- 写某章前想让一个 subagent 专门梳理前 10 章主角心理变化 → 现在做不到
- 让一个 subagent 专门核对"世界观设定在本章有没有违背" → 现在做不到（editorial 只在写完后审，且 context 是整章传入）
- 让一个 subagent 专门跑"备选剧情探索"看 3 条不同走向 → 完全缺失

对产品的价值：写作质量（尤其长篇一致性 + 世界观深度）大幅提升；但消耗 token 增多。

### 建议路径

**Phase 3 Spec: "Task tool + subagent runtime"**

MVP 范围（等价 Claude Code 第一层，不做 swarm）：

1. 新工具 `spawn_subagent(task_prompt, tools?, budget?)`
2. `SubagentRunner` 类（内部用一个简化版 `runAgentStream`）：
   - 独立 system prompt（"你是副手 Agent，完成 task 后用一句话汇报"）
   - 允许工具子集（默认只给 read 类）
   - 独立 history（不共享主对话）
   - 结果回传一条 assistant message
3. 消息流集成：subagent 的 tool call 不影响主 Agent 的 stopWhen 计数
4. 并发保护：主 Agent 一轮最多派 N 个 subagent（避免发散）

**把 Editorial 顺势重构**：5 审稿人改成"5 个 `spawn_subagent` 调用"，不是硬编码 `Promise.all`。这样后续加/减审稿人不改代码。

### 粗略工期：4 天 spec + 7-10 天实现（含 editorial 重构）

---

## 子系统 4 · Skills 系统 🟡

### 现状

`server/src/tools/skills.ts` (107 行) + `prompts/skill_*.md` × 9：

- YAML frontmatter: `name` / `category` / `description` / `when_to_use`
- body 是 markdown 纯文本
- 通过两个 tool 暴露: `list_skills()`（列名 + when_to_use）和 `load_skill(name)`（返回整个 body 塞回 LLM context）
- Agent 在"铁律"里被告知 `写正文前先 load_skill('iceberg_writing')`

### Claude Code 对照

参考 `04c-skills-implementation.md`：

- 3 种 skill 来源：
  - **File-based**：`~/.claude/skills/`、project `.claude/skills/`、policy-managed dirs、`--add-dir` 传入的额外目录（并行加载 + inode 去重防软链重复）
  - **Bundled**：源码硬编码，构建打包
  - **MCP Skills**：来自 MCP server 的能力映射成 skill
- Skill 可以**内嵌 shell** (`prompt-shell-execution.ts`)：markdown 里写 `{{shell: git status}}` 运行时执行并把输出拼到 skill body
- Skill 可自带**独立 agent 配置**（不同于主 Agent 的 prompt / tool 子集 / model）
- Skill 可以作为 `/slash-command` 被用户直接触发，不只是 Agent 自己调

### Gap 严重度

对我们的产品：
- **3 来源合并 + 项目级覆盖**：用户能自定义"我这本书特有的写作风格 skill"覆盖全局 —— 中价值
- **内嵌 shell**：对"AI 写小说"场景意义不大（不需要跑 bash） —— 低价值
- **Skill = slash command**：让用户可在 chat 里 `/skill_iceberg_writing` 直接请求 —— 中价值
- **Skill = 独立 agent 配置**：让 skill 带它自己的 system prompt 片段或禁用某些 tool —— 中高价值（比如"写对白"skill 只给 save_draft + search_lore，禁用 plot-graph）

### 建议路径

**Phase 3+ Spec: "Skill system v2"**

MVP 增量：

1. **三来源合并**：
   - Global: `global/skills/` （cross-book）
   - Project: `books/{bookId}/skills/` （per-book override）
   - Bundled: `prompts/skill_*.md` （现有）
2. **优先级覆盖**：project > global > bundled（同名 skill 后者被前者遮蔽）
3. **Skill metadata 扩展**：YAML 支持 `allowed_tools: [tool1, tool2]`（可选），`injected_prompt_suffix: "..."`
4. **User-invokable via slash command**：frontend `/skill_name` 命令 → 构造一条"请用 skill_name 技能协助我"消息
5. **暂不做**：内嵌 shell、MCP skills（等 MCP 子系统推进再说）

### 粗略工期：3 天 spec + 5-7 天实现

---

## 子系统 5 · Memory 系统 🟡

### 现状

两层 JSON 文件（`server/src/memory/`）：

- **Core memory**（跨书，`global/core_memory/*.json`）：
  - `writing_principles.json`（带 confidence 打分）
  - `user_preferences.json`
  - `craft_skills.json`
  - `anti_patterns.json`
- **Project memory**（per book，`books/{id}/memory/*.json`）：
  - `decided_facts.json`
  - `plot_progress.json`
  - `world_state.json`
  - `character_states.json`
- `context-builder.ts` 把两层拼成 `[核心记忆·写作原则]` / `[项目记忆·...]` 注入系统提示

写入路径：Agent 主动调 tool（`save_lore` 等）+ editorial 审稿 pass 后自动触发 `chapter-summarizer` 写入 `character_states` 滚动。

### Claude Code 对照

参考 `04-agent-memory.md`（878 行，最长的章之一）：

```
会话 transcript / 当前 query
  ├─> Auto Memory 提取
  │     ├─> MEMORY.md 索引
  │     ├─> topic memories/*.md
  │     └─> relevant recall 选出少量文件回灌本轮上下文
  │
  ├─> Session Memory (当前会话摘要 markdown)
  │
  ├─> Agent Memory
  │     ├─> user scope
  │     ├─> project scope
  │     └─> local scope (注入 agent system prompt)
  │
  └─> Team Memory (团队同步共享)
```

**关键机制：**

1. **Auto memory extraction**：每轮对话结束后 LLM 自动分析 "这轮是否有值得记住的事实"，打分 → 写 topic memories
2. **Relevant recall**：新 query 来了，用 embedding/fuzzy 匹配 pick 相关的老 memories 回灌 context（不是全部）
3. **多 scope**：user / project / local / team，范围显式
4. **Markdown 文件**：每个 memory 是一条独立 `.md`，用户可手动编辑

### Gap 严重度

我们的 memory 系统的问题：

1. **没有"相关性召回"**：`buildMemoryContext` 把全部 core + project 拼进去，没做 query-relevant filter。等 memory 多了 prompt 会臃肿
2. **没有自动提取**：user 在 chat 里说"我不喜欢 AI 腔"——没有机制把这条变成 `user_preferences` 条目。要 Agent 自觉主动调 tool，不可靠
3. **JSON 不好手编**：user 很难打开 `character_states.json` 手改一条
4. **没有 session memory 层**：当前对话的上下文摘要没地方存（chat_history 是生料 + 20 条硬切）

### 建议路径

**Phase 2-3 Spec: "Memory v2 — markdown + auto-extract + relevant recall"**

MVP 改造：

1. **存储格式从 JSON → Markdown**：每条 memory 是一个 `.md` 文件 with YAML frontmatter (`scope` / `confidence` / `tags` / `created_at`)。用户可手动开 Typora 编辑
2. **MEMORY.md 索引文件**：每层目录一个，列出该层所有 memory 文件的 title + 文件名
3. **Auto-extract**：每轮对话结束后，一个低成本 LLM call 判断"这轮有值得记的吗？"，如有则生成新 memory 文件（草稿状态，需用户 approve 才晋升）
4. **Relevant recall**：system prompt 注入前，用 tag/keyword 匹配或轻量 embedding 挑出相关 memory（限总字数预算，比如 2000 字）
5. **Session memory**：把当前 author-chat 的摘要写入 `books/{id}/session_memory_{date}.md`，和 context-manager（子系统 2）的 compact summary 复用同一个 pipeline

与子系统 2（Context 管理）高度耦合 —— 建议 spec 同时写或相邻写。

### 粗略工期：5 天 spec + 7-10 天实现（若和子系统 2 合写可以共摊 pipeline，省 3 天）

---

## 子系统 6 · Hooks 系统 🟡

### 现状

4 个 hook point（`server/src/tools/base-tool.ts`）：
- `beforeToolCall`（观察者，fire-and-forget）
- `interceptToolCall`（拦截器，可 block）
- `afterToolCall`（观察者）
- `onToolError`（观察者）

通过 `composeHooks(...)` 链式组合。已实现 3 个：

1. `review-prev-chapter`（在 `stats/tips/index.ts` 注册）— 硬门禁
2. `block-while-user-editing`（在 `agent-loop.ts` 硬编码进 hook 链）— 硬门禁
3. `sessionTracker`（在 `stats/tips/index.ts`）— 统计观察

关键代码：`base-tool.ts:64-96` 定义 + 组合；`agent-loop.ts:113` 固定组合 workbench lock 到 hook 链

### Claude Code 对照

参考 `04b-tool-call-implementation.md` 第 3 节：

- Pre-tool hooks 是**第一等公民**，由用户的 `settings.json` 声明：
  ```json
  {
    "hooks": {
      "PreToolUse": [{ "matcher": "Write", "hooks": [{ "type": "command", "command": "/bin/my-gate.sh" }] }]
    }
  }
  ```
- Hook 匹配支持 `matcher: "Write|Edit"` 正则
- 返回 non-zero exit 则 block
- Hook 可以是 shell command 或内置 TS hook

**区别：** CC 的 hooks 是**用户可声明 + shell 执行**，极灵活。我们的 hooks 是**TS 代码硬编码**，改 hook 要改代码 + 重启服务。

### Gap 严重度

- **让用户能写自己的 hook**：对个人工具没太大价值（用户不写代码）
- **Hook 能跑 shell / http**：对"通知企业微信""备份到网盘"这类事有用，但产品不是必需
- **更细的 matcher / 优先级**：当前 3 个 hook，够用；若将来到 10+ 个再考虑

### 建议路径

**暂不做 Phase spec。** 先完成子系统 1-3 再回头看。

唯一建议的小改动（不值得单独 spec）：

- 把 `block-while-user-editing` 在 `agent-loop.ts:113` 的硬编码组合挪到 `stats/tips/index.ts` 和 `review-prev-chapter` 并列，让 hooks 注册集中在一处。5 分钟活。

---

## 子系统 7 · Prompt 管理 🟢

### 现状

`server/src/agent/prompt-builder.ts`（175 行）：

- `PromptSection[]` 有序装配（`title` + `content` 或 `contentFn(ctx)` + 可选 `condition(ctx)`）
- 两套 sections: `AUTHOR_SECTIONS`（5 段：身份/铁律/工具箱/剧情账本/记忆）和 `BRAINSTORM_SECTIONS`（3 段）
- `buildAuthorPrompt(ctx)` / `buildBrainstormPrompt(ctx)` 是入口
- `selectPrompt(mode, ...)` 根据 `mode` 切换

### Claude Code 对照

参考 `04g-prompt-management.md`（789 行）：

CC 把 prompt 拆 6 层：

```
1. 默认主系统提示 (prompts.ts)
2. 有效 system prompt 组装器 (systemPrompt.ts)
   ├─ override
   ├─ coordinator
   ├─ agent
   ├─ custom
   └─ append
3. 运行时上下文注入 (context.ts)
   ├─ CLAUDE.md
   ├─ git status
   ├─ working dir
   └─ env info
4. 专项 prompt（compact / session summary / memory extract 各自独立）
5. Agent / subagent prompt 分层
6. Dump 工具 (dumpPrompts.ts) — 用户可看完整 prompt
```

**关键设计要点：**

- **Override vs Append**：`--system-prompt` 完全覆盖，`--append-system-prompt` 追加
- **上下文注入独立于 prompt 装配**：`CLAUDE.md` 等由 `context.ts` 在每轮 query 开始时 inject，不进 prompt 常量
- **Dump prompts 工具**：debug 时可 `/dump-prompts` 看完整 rendered prompt —— 对 prompt engineering 巨大帮助

### Gap 严重度

- **CLAUDE.md 注入**：我们已经有（project-memory + core-memory 注入）—— 等价物存在
- **Override / Append**：我们没有，但产品不需要（用户不自定义 prompt）
- **Dump prompts 工具**：**这个对我们 debug 有用**——前端加个"查看本轮实际 system prompt"按钮
- **分 mode**：我们有（author / brainstorm）—— 等价物存在

**总体判断：** 我们的 Prompt 管理已经接近 CC 的实际产品需要水平。继续优化边际回报低。

### 建议路径

**暂不做 Phase spec。** 唯一值得做的小改动：

1. 加一个 GET endpoint `/api/v1/books/:bookId/debug/system-prompt?mode=author` 返回当前书的 rendered system prompt。1-2 天活
2. 前端 Settings 或开发者面板放一个"查看当前 prompt"按钮

不值得单独 spec，做 context-manager 时顺手加。

---

## 子系统 8 · Session 存储 / 恢复 🟢

### 现状

`books/{bookId}/author_chat_history.json` 存最后 50 条消息。刷新页面 GET history 重放 UI 段（`thinking` / `segments` / `status` / `attachments`）。

已经支持：跨浏览器 / 跨设备看历史（只要挂同一个 `books/` 目录）。

### Claude Code 对照

参考 `04i-session-storage-resume.md`（757 行）：

CC 的 session 存储包含：

- 消息 stream（含 tool_use / tool_result 完整流）
- 工具调用运行时状态（还未 resolve 的 deferred tools）
- 当前 Plan / Skill / 文件读取状态（和 context compact 的 state-reinjection 是同源的）
- 支持 `--resume <session-id>` 从 CLI 断点续跑

### Gap 严重度

- **消息 stream 保真**：我们基本够用（存完整 message）
- **工具运行时状态**：我们写 `save_draft` 是同步完成，没有 deferred tool（编辑部异步算半个，但它在页面重进时自然 re-fetch `review_*.json` 不丢）
- **CLI resume**：产品是 web，不需要

**判断：** 对这个产品的 session 需求，我们的实现够用。

### 建议路径

**不做 Phase spec。** 未来若引入异步长任务（例如"让 Agent 花 20 分钟写完一卷"后台跑）再考虑。

---

## 子系统 9 · MCP + Sandbox 🟢

### 现状

**都没做。**

- MCP: 无。所有 tool 是 TS 代码硬写。
- Sandbox: 无。所有 write tool 直接写文件，靠 `sanitizePathSegment` 防目录穿越。

### Claude Code 对照

参考 `04d-mcp-implementation.md`（297 行）和 `04e-sandbox-implementation.md`（826 行）：

- **MCP**：完整支持 MCP servers 当作 tool source。用户在 settings 里配 `mcpServers`，runtime 把 MCP 的工具注入 `ToolRegistry`
- **Sandbox**：复杂的 permission 模型：path allowlist/denylist、policy inheritance、bash 白名单命令、shell-exec 权限

### Gap 严重度

- **MCP**：对"AI 写小说"这个垂直场景，社区没有特别相关的 MCP server。未来若要接"Notion → lore"或"GitHub → 版本"可以考虑，但不紧急
- **Sandbox**：我们是本地单机单用户，write tool 的 target 目录已固定在 `books/`，风险可控

**判断：** 两个都可以无限期推迟。

### 建议路径

**不做。** 若将来接入 MCP，`ToolRegistry` 已经是抽象接口，扩展不难（加个 `registerMcpServers(servers)` 方法加载远端工具即可）。

---

## Roadmap

基于产品价值 × 实施代价，分 3 个 Phase：

### ~~Phase 1 — 立竿见影性能提升（1.5 周）~~ → 降级为 Phase 2 前置 housekeeping（1.5-2 天）

**见子系统 1 的更正框**。原计划 spec 取消；改为 Phase 2 开跑前做 1 个 commit 的验证清单：

1. 验证 LLM provider 发多 tool_use（检查是否需要显式传 `parallel_tool_calls`）
2. 审 `server/src/tools/safety.ts` 的 `createBackup` + `appendAuditLog` 并发安全性
3. 在 Agent 铁律加一条"独立的 read 工具可一轮里一起调用"的 hint
4. 前端 `AuthorChatPanel.jsx` 的 SSE segment 合并逻辑做 stress check

### Phase 2 — 长篇小说核心能力（4-5 周）

**合写一个 Spec 覆盖两个耦合子系统**: "Context manager + Memory v2"

- 子系统 2（auto-compact）+ 子系统 5（memory markdown + auto-extract + relevant recall）
- 共享 forked-LLM-call summary pipeline
- 共享 state-reinjection 机制
- 解决 AI 长篇写作的最大痛点：失忆 / 偏好流失 / 中期讨论丢失
- 预期产出：
  - `docs/superpowers/specs/2026-0X-context-memory-v2.md`（合并规划）
  - 或拆 2 个 spec，顺序实施

### Phase 3 — SOTA Agent 范式对齐（4-5 周）

**单 spec: "Task tool + subagent runtime"**

- 子系统 3
- 重构 editorial 为通用 subagent 的第一个用例
- Author 可调 `spawn_subagent(...)` 派副手研究
- 预期产出：`docs/superpowers/specs/2026-0X-subagent-runtime.md`

### Phase 4+（按需，不着急）

- 子系统 4 Skills v2（3 来源 + slash command + per-skill tool-subset）
- 小 hooks 收敛清理
- Prompt dump debug 端点

### 不纳入路线

- 子系统 8 Session 恢复（已够用）
- 子系统 9 MCP + Sandbox（产品不需要）
- 子系统 6 Hooks 完全用户可配置（个人工具价值低）
- 子系统 7 Prompt 完整 6 层体系（Section 装配已接近实际需要）

---

## 成功标准（诊断文档本身）

本诊断成功的标志不是"所有 gap 都实现"，而是：

1. ✅ 清楚知道**每个子系统我们在哪里、SOTA 在哪里**
2. ✅ 对每个 gap 做出**产品价值评估**（而不是"所有都 SOTA 化"这种幼稚结论）
3. ✅ 产出**分阶段 roadmap** 指导后续 3 个具体 spec 的写作顺序和耦合关系
4. ✅ 显式声明**什么不做 + 理由**，避免范围蔓延

## 不在本诊断范围

- LLM provider 层（`server/src/llm/provider.ts`）的诊断——那是模型选择、API 策略问题，不是 Agent runtime 问题
- 前端 UI/UX 诊断——已有独立 spec（design-system / workbench / outline / plot-graph）
- 具体的 refactor 代码草图——那是各 Phase 下级 spec 的事
- 成本/延迟 profiling——需要真实使用数据才能谈，不在静态诊断能力内

## 后续行动

用户批准本诊断后，依次进入：

1. **Phase 1 spec** (`writing-plans` 展开 → implementation)
2. **Phase 2 spec**（建议合写 context + memory）
3. **Phase 3 spec**（subagent runtime）

每个 Phase 的 spec 产出独立 plan，再由 subagent-driven 执行（复用当前 4 个 plan 的成熟模式）。

## 附录 A · Claude Code 分析索引

引用自 `D:\AI\claude-code-analysis\analysis\`：

| 章节 | 文件 | 行数 | 本诊断对应子系统 |
|---|---|---|---|
| 04 | agent-memory | 878 | 5 |
| 04b | tool-call-implementation | 393 | 1 |
| 04c | skills-implementation | 261 | 4 |
| 04d | mcp-implementation | 297 | 9 |
| 04e | sandbox-implementation | 826 | 9 |
| 04f | context-management | 195 | 2 |
| 04g | prompt-management | 789 | 7 |
| 04h | multi-agent | 922 | 3 |
| 04i | session-storage-resume | 757 | 8 |

## 附录 B · 对照速查卡

| 子系统 | 我们的核心文件 | CC 对照 | RED/YELLOW/GREEN | Phase |
|---|---|---|---|---|
| 1 Tool call | `tools/base-tool.ts:139-180` | `toolOrchestration.ts` | 🟡 (更正自🔴) | Housekeeping (Phase 2 前置) |
| 2 Context | `routes/chat-history.ts:17` (slice -20) | `services/compact/*` | 🔴🔴 | Phase 2 |
| 3 Multi-agent | `editorial/pipeline.ts` (Promise.all) | `tools/AgentTool/*` | 🔴 | Phase 3 |
| 4 Skills | `tools/skills.ts` (107 lines) | `skills/loadSkillsDir.ts` | 🟡 | Phase 4+ |
| 5 Memory | `memory/project-memory.ts` | `memdir/*` | 🟡 | Phase 2 (合并) |
| 6 Hooks | `tools/base-tool.ts:64-96` | `settings.json.hooks` | 🟡 | 不单独做 |
| 7 Prompt | `agent/prompt-builder.ts` | `constants/prompts.ts` | 🟢 | 不做（+debug 端点） |
| 8 Session | `routes/chat-history.ts` | `session/*` resume | 🟢 | 不做 |
| 9 MCP+Sandbox | 无 | `mcp/*` + `sandbox/*` | 🟢 | 不做 |

