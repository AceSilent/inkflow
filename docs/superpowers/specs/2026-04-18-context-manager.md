# Context Manager — Auto-Compact + State Re-injection

**Spec Date**: 2026-04-18
**Scope**: Replace `chat-history.ts:17` 的 `.slice(-20)` 硬切，构建自动压缩的上下文管理系统。Agent 写到 ch30 时不再忘记 ch05-15 的讨论。
**Parent**: `docs/superpowers/specs/2026-04-18-agent-harness-diagnostic.md` Phase 2
**Paired spec**: `2026-04-18-memory-v2.md`（本 spec 的 session_summaries 输出格式依赖 Memory v2 的 markdown + frontmatter 定义）

## 目的

当前 `server/src/routes/chat-history.ts`：
```ts
export function loadHistory(...): ModelMessage[] {
  // ...
  return raw.slice(-20)
}
```

20 条消息硬切。写长篇小说到 ch30 时，ch01-ch15 的讨论、迭代、用户纠错全部沉底失踪。

本 spec 引入 Claude Code 风格的**回合数 + 字符数双阈值触发 + fork-LLM 摘要 + 状态重注入**——压缩后 Agent 仍能无缝续写，最近工作流不断。

## 核心决策一览

| # | 决策 | 选择 |
|---|---|---|
| 1 | 触发 | 双阈值：回合 > N **或** 字符 > M（`response.usage.total_tokens` 可做 bonus 校准） |
| 2 | 保留策略 | 最后 K 条原样 + 前面压成一条 `[会话摘要]` |
| 3 | 状态重注入 | 最近 read_file/read_outline 返回内容 + active skill + plot ledger（免重注 — 动态 section） |
| 4 | Compact LLM | 复用 `EDITORIAL_MODEL`（和 Memory v2 extract 同款） |
| 5 | PTL fallback | 剥洋葱：总结本身超 token → 删最旧 20% 重试（≤ 3 次） |
| 6 | 熔断器 | 连续 3 次失败停止该会话 autocompact |
| 7 | 会话摘要持久化 | 写 `books/{bookId}/session_summaries/{ts}.md`（Memory v2 格式，不走审批） |

## 架构

```
┌─── author-chat SSE route ─────────────────────────────────────┐
│                                                                 │
│  POST /api/v1/author-chat/:bookId/send                         │
│    1. loadHistory(bookId) → messages[]                          │
│    2. ► ContextManager.shouldCompact(messages, ledger)  [NEW]   │
│       ▼ if true:                                                │
│       3.1 compact(messages) → { summary, keptMessages }         │
│       3.2 saveSessionSummary(bookId, summary) → md file         │
│       3.3 messages = [summaryMsg, ...keptMessages]              │
│    4. SessionState := new (per-request)                         │
│    5. runAgentStream({ messages, sessionState, ... })           │
│       ▼ during stream:                                          │
│       6. afterToolCall hook 记录 read_file/read_outline 结果  │
│          → sessionState.recentReads.push({file, content})      │
│       7. beforeToolCall 查 load_skill 保存 active skill        │
│          → sessionState.activeSkill = ...                      │
│       ▼ when compact fires next time (next turn):              │
│       8. state re-injection: {summaryMsg} 还附带                │
│          {sessionState.recentReads / activeSkill}               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 触发逻辑

### 阈值配置

新文件 `server/src/context/thresholds.ts`：

```typescript
export interface CompactThresholds {
  maxTurns: number       // 一个 turn = user+assistant 往返。默认 30
  maxChars: number       // messages 序列化后的总字符数。默认 40000
  safetyMarginRatio: number  // 0.9：留 10% buffer 给当前回合的消息增长
  usageTokenThreshold?: number  // 可选：若 response.usage.total_tokens 超此值也触发
}

export const DEFAULT_THRESHOLDS: CompactThresholds = {
  maxTurns: 30,
  maxChars: 40000,
  safetyMarginRatio: 0.9,
  usageTokenThreshold: 120000,  // 保守估，200k 窗口的模型
}
```

### 触发函数

新文件 `server/src/context/compact-trigger.ts`：

```typescript
export function shouldCompact(
  messages: ModelMessage[],
  thresholds: CompactThresholds = DEFAULT_THRESHOLDS,
  lastUsage?: { total_tokens?: number },
): { should: boolean; reason?: string } {
  const turns = countTurns(messages)  // count pairs of user → assistant
  const chars = serializedChars(messages)  // JSON.stringify(messages).length
  const tokens = lastUsage?.total_tokens

  if (turns >= thresholds.maxTurns * thresholds.safetyMarginRatio)
    return { should: true, reason: `turns ${turns} >= ${thresholds.maxTurns}` }
  if (chars >= thresholds.maxChars * thresholds.safetyMarginRatio)
    return { should: true, reason: `chars ${chars} >= ${thresholds.maxChars}` }
  if (tokens && thresholds.usageTokenThreshold && tokens >= thresholds.usageTokenThreshold)
    return { should: true, reason: `tokens ${tokens} >= ${thresholds.usageTokenThreshold}` }

  return { should: false }
}
```

## Compact Pipeline

### 主流程

新文件 `server/src/context/compact-pipeline.ts`：

```typescript
export interface CompactResult {
  summaryMessage: ModelMessage   // 插入到 messages 头部的摘要消息
  keptMessages: ModelMessage[]   // 原样保留的最后 K 条
  summaryText: string            // 纯文本，可供 session_summary 落盘
  stats: { before: { turns: number; chars: number }, after: { turns: number; chars: number } }
}

export async function compactConversation(
  messages: ModelMessage[],
  llmConfig: LLMConfig,
  sessionState: SessionState,
  lastK: number = 12,
): Promise<CompactResult> {
  // 1. 拆分: keptMessages = 最后 lastK 条, toCompact = 前面的
  // 2. stripImages(toCompact) —— 把 image blocks 替换成 "[image]"
  // 3. renderTemplate('compact_summary.j2', { messages: toCompact }) → summaryPrompt
  // 4. 尝试 generateText({ model, prompt: summaryPrompt, maxTokens: 4000 })
  //    → ptl fallback 包裹，超 token 时剥洋葱重试
  // 5. 构造 summaryMessage (role: system or user-scoped 根据 AI SDK 支持):
  //      role: 'system',
  //      content: [
  //        '# 会话摘要（自动压缩，覆盖前 N 轮）',
  //        summaryText,
  //        '',
  //        '# 最近工作台状态',
  //        renderRecentReads(sessionState),
  //        renderActiveSkill(sessionState),
  //      ].join('\n')
  // 6. return { summaryMessage, keptMessages, summaryText, stats }
}
```

### PTL Fallback（Prompt Too Long 剥洋葱）

`server/src/context/ptl-fallback.ts`：

```typescript
export async function generateWithPtlRetry(
  prompt: string,
  llmConfig: LLMConfig,
  maxRetries: number = 3,
): Promise<{ text: string; retries: number }> {
  let current = prompt
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await generateText({ model: createProvider(llmConfig), prompt: current, maxOutputTokens: 4000 })
      return { text: r.text, retries: attempt }
    } catch (e: any) {
      const isPtl = isPromptTooLongError(e)
      if (!isPtl || attempt >= maxRetries) throw e
      // 剥洋葱：删掉 prompt 开头的 20%（但保护 "# 会话摘要" header）
      current = truncateHead20Percent(current)
    }
  }
  throw new Error('unreachable')
}
```

### 熔断器

新文件 `server/src/context/circuit-breaker.ts`：

```typescript
interface BreakerState {
  consecutiveFailures: number
  tripped: boolean
  lastFailureAt?: string
}

// 持久化到 books/{bookId}/compact_breaker.json（薄文件，恢复用）
// 每次 compact 失败 +1；成功归零；≥ 3 次 tripped=true 停止自动 compact 直到用户重置
```

前端在 Settings 或工具栏加一个"重置压缩熔断"按钮，tripped 时显示红点。

## State Re-injection

### SessionState 追踪

新文件 `server/src/context/session-state.ts`：

```typescript
export interface RecentRead {
  tool: string          // 'read_file' / 'read_outline' / 'read_graph' / 'search_lore' / 'read_tree'
  args: any
  excerpt: string       // 工具返回的前 500 字
  timestamp: number
}

export interface SessionState {
  recentReads: RecentRead[]      // cap 5 entries, FIFO
  activeSkill: {                 // 最近一次 load_skill
    name: string
    body: string                 // skill body，截断到 2000 字
  } | null
}

export function createSessionState(): SessionState {
  return { recentReads: [], activeSkill: null }
}

export function updateSessionStateAfterToolCall(
  state: SessionState,
  toolName: string,
  args: any,
  result: string,
): void {
  // Read tools → append to recentReads (cap 5)
  const READ_TOOLS = ['read_file', 'read_outline', 'read_graph', 'search_lore']
  if (READ_TOOLS.includes(toolName)) {
    state.recentReads.push({
      tool: toolName, args, excerpt: result.slice(0, 500), timestamp: Date.now(),
    })
    while (state.recentReads.length > 5) state.recentReads.shift()
  }
  // load_skill → update activeSkill
  if (toolName === 'load_skill') {
    state.activeSkill = { name: args.name, body: result.slice(0, 2000) }
  }
}
```

### 集成到 runAgentStream

`server/src/agent/agent-loop.ts` 修改：
- 在 `AgentRunOptions` 加 `sessionState?: SessionState`（可选，外层 route 构造）
- `composedHooks` 增加一个 hook 更新 sessionState：
  ```ts
  const sessionStateHook: ToolHooks = {
    async afterToolCall(name, args, result) {
      updateSessionStateAfterToolCall(sessionState, name, args, result)
    },
  }
  ```

### Re-inject 格式（注入到 summaryMessage）

```
# 最近工作台状态

## 刚读过的文件
- read_outline() @ 2 分钟前 → "..前 500 字.."
- read_file('04_Drafts/ch05.md') @ 5 分钟前 → "..前 500 字.."

## 激活的 skill
iceberg_writing:
  (2000 字内容)

(plot_ledger 由 prompt-builder 独立动态注入，不在此重复)
```

## 持久化会话摘要

Compact 完成后，除了放进当前 messages，还落盘到 Memory v2 格式：

```typescript
// In compact-pipeline.ts after compact completes:
const summaryFile = path.join(
  bookDir, 'session_summaries',
  `${new Date().toISOString().replace(/[:.]/g, '-')}.md`,
)
const frontmatter = {
  id: `sess_${nanoid()}`,
  scope: 'session',
  type: 'compact_summary',
  confidence: 0.7,
  tags: ['auto-compact', `book-${bookId}`],
  source: 'context_compact',
  source_event: `compact_${new Date().toISOString()}`,
  status: 'active',
  created_at: new Date().toISOString(),
  book_id: bookId,
}
fs.writeFileSync(summaryFile, `---\n${yamlStringify(frontmatter)}---\n\n${summaryText}`)
```

**复用 Memory v2 的 recall 机制**：Memory v2 的 `buildMarkdownMemoryContext` 会扫 `books/{id}/session_summaries/*.md`（按 mtime 降序取最近 3 个），自动进入 system prompt 的"记忆"section。这样压缩过的历史既在当前 messages 有摘要消息，**也在**system prompt 的记忆层被长期保留——双重保险。

## 数据模型

### 新文件

- `books/{bookId}/session_summaries/{ts}.md` —— 见上
- `books/{bookId}/compact_breaker.json` —— 熔断器状态
- `books/{bookId}/compact_log.jsonl` —— 每次 compact 的前后对比日志（stats + reason）

### 修改文件

- `server/src/routes/chat-history.ts` —— `loadHistory` 不再硬切 20，改成"读全部 + 把 compact 过的 summary message 混回去"
- `server/src/agent/agent-loop.ts` —— 接受 `sessionState`，注入 tool hook
- `server/src/routes/author-chat.ts` —— 调用 `shouldCompact` 前置检查

## UI / 可观测性

### 用户可见信号

- **Compact 时机**：AuthorChat 出一条淡色分隔条 "📚 已压缩前 N 轮对话（共 M 字）"
- **熔断触发**：红色 toast + 顶部 banner "自动压缩暂停，请检查熔断状态并重置"
- **Session summary 查看**：Memory Library 的"激活"tab 下面有一个"Session summaries"组，按时间排序

### 调试端点

`GET /api/v1/books/:bookId/debug/context-state`
返回：
```json
{
  "current_turns": 23,
  "current_chars": 28340,
  "breaker": { "consecutiveFailures": 0, "tripped": false },
  "last_compact_at": "2026-04-18T12:34:56Z",
  "last_compact_stats": { "before": { "turns": 30, "chars": 42000 }, "after": { "turns": 13, "chars": 5800 } }
}
```

## 整合与风险

### 和 Memory v2 的接口明细

| 共享点 | 提供方 | 消费方 |
|---|---|---|
| Markdown + YAML frontmatter 格式 | Memory v2 | Context session_summaries |
| `session_summaries/*.md` 路径 | Context（写）/ Memory v2（读） | Memory v2 recall 时扫入 |
| `withFileLock(path)` 并发保护 | Phase 1 housekeeping（已加） | 两者共享 |
| `EDITORIAL_MODEL` config | 已有 | 两者都复用 |
| Forked-LLM `generateText` pattern | 本 spec 的 `generateWithPtlRetry` | Memory v2 的 extractor 不需要 PTL（输入天然短），但模式可参考 |

### 性能影响

- **每轮增加检查**：`shouldCompact` 是纯 JS 计算，<1ms
- **Compact 本身**：仅在触发时才花一次 LLM call，成本 ~200-500 token in, ~2000 out
- **Storage**：每次 compact 加一个 ~3KB 的 markdown 文件。50 次 compact = 150KB，可忽略

### 风险

1. **Summary 质量**：压缩掉的细节可能 Agent 后续需要但回忆不起来。缓解：最后 K 条保留、session_summary 存盘后 recall 仍可读、PTL fallback 保证至少有东西
2. **压缩过度**：双阈值调得太紧 → 频繁 compact → 每次都花 LLM 钱。缓解：thresholds 默认保守（30 轮 / 40k 字），可按实际观察调
3. **熔断误杀**：连续 3 次失败全部停自动 compact——用户不知道。缓解：UI 红 banner + 调试端点
4. **State re-injection 失效场景**：Agent compact 之后正好需要某个没被 recentReads 追踪到的文件。缓解：Agent 发现缺信息会自己再 `read_file` 一次，Phase 2 不强解决
5. **非标 role 兼容**：`summaryMessage.role='system'` 插在 user/assistant 中间，部分 provider 可能拒。缓解：退化成 `role: 'user'` 并在 content 里明显标记 `# 会话摘要（系统自动）`

## 不在范围

- **Rewriting 旧的 `chat-history.ts:17` 的 -20 slice**：会彻底替换，但仍保留最后 50 条落盘上限（`saveHistory` 的 `.slice(-50)`）
- **Token 精确估算**：不引入 tiktoken；字符数 + usage 回传双通道已够
- **Cross-session summary consolidation**：session_summaries 不做合并压缩（Phase 3+）
- **预测式 compact**（根据当前消息增长率预测何时该 compact）——YAGNI
- **用户自定义 compact 阈值**：配置在代码常量里，日后再出 Settings UI

## 验收标准

1. 连续发送 40 轮消息后，第 31 轮开始自动触发 compact（默认 maxTurns=30）
2. Compact 完成后：前端 UI 显示分隔条 + session_summaries 下出现新 `.md`
3. Agent 在 compact 后的下一轮仍能引用 ch05 的某个讨论点（证明 state re-injection + session_summary 起作用）
4. 故意构造 PTL 场景（单条 user message 超 30k 字），熔断器不会立刻触发（先 PTL retry 3 次），最终优雅失败
5. 熔断器 tripped 后，自动 compact 停止；前端 banner 可见；用户点"重置"后恢复
6. `withFileLock` 保证两个并发 compact（理论不可能，但测试要覆盖）不会撕裂 session_summaries
7. 测试覆盖：shouldCompact / stripImages / PTL fallback / circuit breaker / session state updater，≥ 12 个新测试

## 依赖 / 接口

- 依赖 Memory v2 的 markdown 格式（session_summaries 复用）
- 依赖 Phase 1 housekeeping 的 `withFileLock`
- 被 Phase 3 (subagent runtime) 继承：subagent 的 context 也可用本 spec 的 compact
