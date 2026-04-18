# Context Manager — Fine-Grained 3-Tier Retention

**Spec Date**: 2026-04-18 (v2, 重写自 v1 的 turns/chars dual-threshold 方案)
**Scope**: 精细化上下文管理：按消息**位置分层**（Hot/Warm/Cold）+ **tool-result 衰减**（便宜）+ **token-accurate 预算**追踪 + **cold-segment compaction**（兜底）。取代现有 `chat-history.ts:17` 的 `.slice(-20)` 硬切。
**Parent**: `docs/superpowers/specs/2026-04-18-agent-harness-diagnostic.md` Phase 2
**Paired spec**: `2026-04-18-memory-v2.md`（复用 session_summaries 存储格式）

## 为什么重写

v1 用"回合数 / 字符数双阈值"触发 single-shot compact。以下三个认知让它变粗糙：

1. **1M 模型普及**：GLM-5.5 / DeepSeek V3.2 / Claude Opus 4.6 都上了 200K-1M window。按 30 轮 / 40k 字触发 compact 太激进，无故损失细节
2. **上下文成本大头不在消息本身，而在 tool-call 返回**：Agent 20 轮前 `read_file('ch05.md')` 8000 字，这 8000 字从此每轮都吃 token 费。写到 ch30 时光 `read_file` 历史能堆 50k+ 字废料
3. **prompt cache 友好度**：compact 是整段 rewriting → 破坏 cache prefix；tool-result 衰减是尾向头单点替换 → cache 失效只一次

**所以 v2 的核心口号**：
> 老内容不是消息变老，是它们的 tool-call payload 变无用。衰减 payload，保留消息骨架；非到火烧眉毛不做 compact。

## 核心决策

| # | 决策 | 选择 |
|---|---|---|
| 1 | 上下文追踪信号 | `response.usage.total_tokens`（AI SDK 回传，精准；不用 tiktoken） |
| 2 | 触发模型 | 3-tier 预算阶梯 × 模型感知 ceiling（200K / 1M） |
| 3 | 主要机制 | **Tool-result 衰减**（便宜，无 LLM call，cache 友好） |
| 4 | 兜底机制 | Cold-segment summary compact（贵，仅 > 80% 预算时） |
| 5 | 分层依据 | 消息**相对位置**（Hot 尾 10 条 / Warm 11-30 / Cold 31+）；**非绝对时间** |
| 6 | 用户消息 | Importance-preserved：任何阶段不做 payload 衰减，只在 Cold 阶段可被 block summary 吸收 |
| 7 | 会话摘要落盘 | 写 `books/{id}/session_summaries/*.md`（Memory v2 格式） |
| 8 | 禁用开关 | 新增 settings `contextManager: 'auto' | 'decay_only' | 'disabled'` |

## 上下文预算阶梯

### 模型感知 ceiling

新文件 `server/src/context/model-window.ts`：

```typescript
// 识别 1M 上下文模型（参考 Claude Code has1mContext）
export function getModelContextWindow(model: string): number {
  if (/\[1m\]/i.test(model)) return 1_000_000
  if (/claude-opus-4\.\d.*1m/i.test(model)) return 1_000_000
  if (/glm-5\.\d/i.test(model)) return 1_000_000      // GLM-5 系都是 1M
  if (/deepseek-v3\.\d/i.test(model)) return 200_000   // DeepSeek V3 128-200K
  if (/claude-opus|claude-sonnet/i.test(model)) return 200_000
  return 200_000  // 保守默认
}
```

### 预算阶梯

```typescript
export interface ContextBudgetTier {
  name: 'green' | 'yellow' | 'orange' | 'red'
  ratio: number   // of getModelContextWindow(model)
  action: 'none' | 'decay_tool_results' | 'decay_and_cold_compact' | 'force_compact_and_warn'
}

export const BUDGET_TIERS: ContextBudgetTier[] = [
  { name: 'green',  ratio: 0.30, action: 'none' },
  { name: 'yellow', ratio: 0.60, action: 'decay_tool_results' },
  { name: 'orange', ratio: 0.80, action: 'decay_and_cold_compact' },
  { name: 'red',    ratio: 1.00, action: 'force_compact_and_warn' },
]
```

**决策流程**（每轮 assistant message 结束后运行）：
1. 读 `lastResponseUsage.total_tokens`
2. 算 `ratio = tokens / getModelContextWindow(model)`
3. 匹配最高命中的 tier，执行对应 action
4. 如果 `contextManager === 'decay_only'`，则 orange/red 阶段退化为只 decay，不做 cold compact
5. 如果 `contextManager === 'disabled'`，什么都不做（但 UI 仍显示 ratio 提示）

## 3-Tier 消息分层

每次处理 messages 前，按**尾部相对位置**划分：

```typescript
export interface MessageZones {
  hot: ModelMessage[]    // 最后 10 条 — 完整保留
  warm: ModelMessage[]   // 11-30 — tool-result payload 可衰减
  cold: ModelMessage[]   // 31+ — 可进入 summary compact
}

export function zoneMessages(messages: ModelMessage[]): MessageZones {
  const n = messages.length
  return {
    hot: messages.slice(Math.max(0, n - 10)),
    warm: messages.slice(Math.max(0, n - 30), Math.max(0, n - 10)),
    cold: messages.slice(0, Math.max(0, n - 30)),
  }
}
```

**注意**：分层是**计算出的视图**，不是持久化状态。每轮重新计算——消息位置随新消息推进自然迁移。

## Tool-Result 衰减（主要机制）

### 规则

`server/src/context/decay.ts`：

```typescript
const LARGE_RESULT_TOOLS = {
  read_file: { minChars: 2000, placeholder: (args, len) => `[read_file('${args.path}'): ${len} chars, see session summary if needed]` },
  read_outline: { minChars: 2000, placeholder: (args, len) => `[read_outline: ${len} chars snapshot, available via read_outline()]` },
  read_graph: { minChars: 3000, placeholder: (args, len) => `[read_graph: ${len} chars DAG snapshot, available via read_graph()]` },
  search_lore: { minChars: 1500, placeholder: (args, len) => `[search_lore('${args.query}'): ${len} chars of matches]` },
}

const PRESERVE_ALWAYS = new Set([
  'submit_to_editorial',  // 审稿反馈影响后续决策
  'save_draft',            // 短返回，无需衰减
  'save_outline',
  'save_lore',
  'confirm_path',
  'prune_branch',
  'query_unresolved_setups',  // 返回值直接指导下一章创作
])

export function decayToolResults(messages: ModelMessage[], zones: MessageZones): ModelMessage[] {
  // 只对 warm 段里的 tool-result 消息做衰减
  // hot 段永不动；cold 段走 compact（见下节）
  // ...
}
```

### 衰减行为

- 匹配到的 tool-result 消息 content 被替换为占位符字符串
- **保留 tool_use id / tool_name / args**——LLM 仍知道"我以前调过这个工具"
- 衰减**一次性**：衰减过的消息不会再被衰减（标记 `_decayed: true`，避免重复替换）
- 衰减是**破坏性的**：原内容不可恢复（若 Agent 真需要，再调一次工具即可）

### 对 Editorial 结果的特殊处理

`submit_to_editorial` 的返回可能上万字（5 审稿人 × 详细 issues）。但它是 Agent 决策的核心依据，不能衰减。**退化策略**：仅在消息进入 Cold 段时才会被 summary 吸收——之前永远保留。

## Cold-Segment Compaction（兜底机制）

仅在 `action === 'decay_and_cold_compact'` 或 `'force_compact_and_warn'` 时触发。

### 流程

`server/src/context/cold-compact.ts`：

```typescript
export async function compactColdSegment(
  cold: ModelMessage[],
  warm: ModelMessage[],
  hot: ModelMessage[],
  sessionState: SessionState,
  llmConfig: LLMConfig,
): Promise<{
  newMessages: ModelMessage[]
  summaryText: string
  stats: { compacted: number; kept: number }
}> {
  // 1. stripImages(cold) 剔除 image payloads
  // 2. 保留 cold 里的 user message 不压缩（importance-preserved），
  //    把每条 user message 作为锚点，其他压缩
  // 3. renderTemplate('cold_summary.j2', { coldMessages: cold }) → prompt
  // 4. generateWithPtlRetry(prompt, llmConfig) → summaryText
  // 5. 生成一条 summary ModelMessage:
  //      role: 'system',
  //      content: `# 会话摘要（已压缩 ${cold.length} 条早期消息）\n\n${summaryText}`
  // 6. newMessages = [summaryMessage, ...warm, ...hot]
  //    但 warm 仍保留（它的 tool-result 已经衰减过）——不再压缩
  // 7. saveSessionSummary(bookId, summaryText) → Memory v2 markdown
  // 8. return
}
```

### PTL Fallback 和熔断器

保留 v1 的设计（简化版）：

- `generateWithPtlRetry`：summary prompt 超 token → 剥洋葱（删开头 20%）重试，≤ 3 次
- Circuit breaker: 连续 3 次失败 → 停止自动 cold compact，UI 红 banner + 手动重置

## Prompt Cache 考量

### 原则

- **系统提示永远稳定**（memory + plot ledger 是动态但每轮重算；可接受缓存未命中）
- **消息列表的头部**（`[summaryMessage, ...warm[0..5]]`）**尽量稳定**
- **衰减是尾→头单点替换**：只第一次衰减时 cache 从该点失效；之后稳定
- **Cold compact 是大事件**：会导致 cache prefix 整个重建——可接受（每 50+ 轮才发生一次）

### 验证

实现后用 `providerMetadata.anthropic.cacheReadInputTokens`（Vercel AI SDK 暴露）观察命中率。衰减后的下一轮应 `cacheReadInputTokens > 0`；cold compact 后的下一轮应等于 0（重建）。

## 数据结构

### SessionState（不变，v1 保留）

```typescript
export interface RecentRead {
  tool: string
  args: any
  excerpt: string  // 工具返回前 500 字
  timestamp: number
}

export interface SessionState {
  recentReads: RecentRead[]      // cap 5, FIFO
  activeSkill: { name: string; body: string } | null
  /** decay bookkeeping — message.id → decayed: true */
  decayedMessageIds: Set<string>
}
```

### ContextManagerDecision

每轮产出：

```typescript
export interface ContextDecision {
  tier: 'green' | 'yellow' | 'orange' | 'red'
  tokensUsed: number
  windowSize: number
  ratio: number
  action: 'none' | 'decay_tool_results' | 'decay_and_cold_compact' | 'force_compact_and_warn'
  decayedCount?: number          // 本轮衰减了几条
  compactedCount?: number         // 本轮 cold compact 了几条
  newMessagesCount?: number       // compact 后 messages 总数
}
```

落盘到 `books/{bookId}/context_log.jsonl`，每行一个 decision。可观测性 gold。

## 集成

### author-chat SSE route 改造

```typescript
// server/src/routes/author-chat.ts (pseudo)
const rawMessages = loadHistoryFull(bookId)   // 不再 .slice(-20)
const sessionState = createSessionState()

// 上一轮的 usage 从 lastMessage.metadata 或单独的 books/{id}/usage_track.json 读
const lastUsage = readLastUsage(bookId)
const decision = evaluateContextDecision(rawMessages, model, lastUsage, settings.contextManager)

let processedMessages = rawMessages

if (decision.action === 'decay_tool_results' || decision.action === 'decay_and_cold_compact') {
  const zones = zoneMessages(processedMessages)
  processedMessages = decayToolResults(processedMessages, zones)
  decision.decayedCount = countDecayed(processedMessages, rawMessages)
}

if (decision.action === 'decay_and_cold_compact' || decision.action === 'force_compact_and_warn') {
  const zones = zoneMessages(processedMessages)
  if (zones.cold.length > 0) {
    const { newMessages, summaryText, stats } = await compactColdSegment(...)
    processedMessages = newMessages
    decision.compactedCount = stats.compacted
  }
}

// Run agent
const stream = runAgentStream({ messages: processedMessages, sessionState, ... })

// Stream post-hook: update SessionState (via afterToolCall) + record usage + write decision log
```

### chat-history.ts 改造

- 删除 `loadHistory` 的 `.slice(-20)`，改成 `loadHistoryFull`
- `saveHistory` 仍保留 `.slice(-50)` 落盘上限（避免 history 文件无限增长；配合 cold compact 就够了——old 内容已在 session_summaries 留存）

### prompt-builder 不变

memory section（含 session_summaries 来自 Memory v2）继续动态注入。

## UI / 可观测性

### 用户可见信号

**AuthorChat 顶部状态条**（非侵入式小条）：
```
🟢 Context · 8% used · 2k/120k tokens
```
颜色随 tier：green / yellow(⚠️) / orange(⚠️⚠️) / red(🚨) 。鼠标 hover 显示 decision 详情。

**Compaction 事件提示**（单次）：
- Tool decay：当轮 footer 小字："本轮衰减了 3 条工具结果（节省 ~8k token）"
- Cold compact：插入分隔条 "📚 已压缩 N 条早期消息到会话摘要"（Memory Library 可见）

**Red tier banner**：
> "Context 已达 100%。下一轮将强制 compact，可能影响最近上下文。如需精确控制，请切换到上下文更大的模型或点击手动 compact。"

### 用户设置

新增 `GET/PUT /api/v1/settings`（现有）的字段：
```json
{
  "contextManager": "auto" | "decay_only" | "disabled",
  "contextBudgetCustom": {
    "green": 0.30, "yellow": 0.60, "orange": 0.80
  }
}
```

默认 `auto`。对 1M 模型用户，`decay_only` 是理想选择（保留所有消息骨架，只省 tool payload 钱）。

### 调试端点

`GET /api/v1/books/:bookId/debug/context-state` 返回当前 decision + 最近 5 条 context_log 条目。

## 和 Memory v2 的接口

不变（v1 同步）：
- Cold compact 产出写 `books/{id}/session_summaries/*.md`，Memory v2 格式
- Memory v2 recall 扫 session_summaries 时按 mtime 降序取最近 3 个
- `withFileLock` 和 `EDITORIAL_MODEL` 两处共享

## 验收标准

1. 设置 `contextManager: 'auto'`、1M 模型、连续 50 轮后：
   - tier 从 green 升到 yellow 后，warm 段的 `read_file` 结果内容被占位符替换
   - tokens ratio 不再单调增长（衰减生效）
2. 达到 orange（> 60% window）后：触发 cold compact，session_summaries 下出新 `.md`
3. `disabled` 模式下：任何 tier 都不改 messages，只 UI 显示 warning
4. `decay_only` 模式下：orange/red 不触发 cold compact，只衰减
5. 衰减消息保留 tool_use / tool_name / args，LLM 可通过新调一次同工具恢复内容
6. `cacheReadInputTokens` 观察：衰减后一轮 > 0；cold compact 后一轮 = 0
7. PTL 场景（单条 user 30k 字）：剥洋葱 retry 正常；3 次失败后熔断器 tripped
8. 用户消息永不 payload 衰减（even in warm）
9. 测试覆盖：zoneMessages / decay rules / tier evaluation / PTL / circuit breaker / session state，≥ 15 个新测试

## 不在范围

- **Tiktoken 精确估算**：靠 `usage.total_tokens` 已够
- **Prompt cache 主动管理**（Anthropic cache control 显式设置）：SDK 默认策略够用
- **Chapter-aware 衰减**（切章主动衰减前章 tool calls）：Phase 3+
- **用户自定义 tier 阈值比例**：spec 里预留 `contextBudgetCustom` 字段但 UI 不暴露
- **Cold compact 增量**（把多次 cold compact 的 summary 再合并）：Phase 3+ — 每次独立一个 `.md` 文件够
- **Tool-call args 级缓存**（用 redis 缓存 read_file 返回，同 args 免再调）：和 Agent harness 无关，走独立优化

## 依赖 / 接口

- 依赖 Memory v2 的 markdown + YAML frontmatter
- 依赖 Phase 1 housekeeping 的 `withFileLock`
- 提供给 Phase 3 (subagent runtime)：subagent 可复用相同 budget tier 机制
- 需要 Vercel AI SDK 回传 `usage.total_tokens`（已有；`providerMetadata` 是可选增强）
