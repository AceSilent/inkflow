# Context Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `chat-history.ts:17` 的 `.slice(-20)` 硬切，构建精细化上下文管理：token-weighted 3-tier 分层 + tool-result 衰减（主要机制）+ cold-segment compact（兜底）+ PTL fallback + 熔断器。

**Architecture:** 消息按尾部累计 token 划分 Hot/Warm/Cold 三区。Hot (尾 20k tok) 永不动；Warm (接下来 40k tok) 的大 tool-result payload 被占位符替换（10k 阈值保护整章阅读不误伤）；Cold (剩余) 在预算超 60% 时走 fork-LLM summary compact。触发按 `usage.total_tokens / getModelContextWindow(model)` 比例分四档（green 30% / yellow 60% / orange 80% / red 100%）。

**Tech Stack:** TypeScript + Fastify + Vercel AI SDK（generateText + createProvider）+ Memory v2 markdown 接口（session_summaries）。无新依赖。

Spec reference: `docs/superpowers/specs/2026-04-18-context-manager.md`

**Testing approach:** 核心逻辑用 vitest 单测（zone 分层 / decay 替换 / budget tier / PTL 剥洋葱 / 熔断器）。author-chat 集成用 mock LLM 回传 usage 做端到端。前端 UI 做浏览器 smoke。

**Dependency:** Memory v2 plan 必须先走完（本 plan 依赖 Memory v2 的 `writeMemory` 接口保存 session_summaries）。

---

## Phase A · Backend

## Task 1: Model window detection + budget tiers

**Files:**
- Create: `server/src/context/model-window.ts`
- Create: `server/tests/model-window.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/model-window.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getModelContextWindow, BUDGET_TIERS, evaluateBudgetTier } from '../src/context/model-window.js'

describe('getModelContextWindow', () => {
  it('detects 1M from [1m] suffix', () => {
    expect(getModelContextWindow('claude-opus-4-7[1m]')).toBe(1_000_000)
  })
  it('detects GLM-5 as 1M', () => {
    expect(getModelContextWindow('glm-5.5-flash')).toBe(1_000_000)
  })
  it('detects DeepSeek V3 as 200K', () => {
    expect(getModelContextWindow('deepseek-v3.2-chat')).toBe(200_000)
  })
  it('defaults to 200K for unknown', () => {
    expect(getModelContextWindow('unknown-model')).toBe(200_000)
  })
})

describe('evaluateBudgetTier', () => {
  it('returns green for 20% usage', () => {
    const t = evaluateBudgetTier(40000, 200000)
    expect(t.name).toBe('green')
    expect(t.action).toBe('none')
  })
  it('returns yellow for 45% usage', () => {
    const t = evaluateBudgetTier(90000, 200000)
    expect(t.name).toBe('yellow')
    expect(t.action).toBe('decay_tool_results')
  })
  it('returns orange for 70% usage', () => {
    const t = evaluateBudgetTier(140000, 200000)
    expect(t.name).toBe('orange')
    expect(t.action).toBe('decay_and_cold_compact')
  })
  it('returns red for 95% usage', () => {
    const t = evaluateBudgetTier(190000, 200000)
    expect(t.name).toBe('red')
    expect(t.action).toBe('force_compact_and_warn')
  })
  it('ratio is computed correctly', () => {
    const t = evaluateBudgetTier(50000, 200000)
    expect(t.ratio).toBeCloseTo(0.25, 2)
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

Create `server/src/context/model-window.ts`:

```typescript
export function getModelContextWindow(model: string): number {
  if (/\[1m\]/i.test(model)) return 1_000_000
  if (/claude-opus-4\.\d.*1m/i.test(model)) return 1_000_000
  if (/glm-5\.\d/i.test(model)) return 1_000_000
  if (/deepseek-v3\.\d/i.test(model)) return 200_000
  if (/claude-opus|claude-sonnet/i.test(model)) return 200_000
  return 200_000
}

export type BudgetTierName = 'green' | 'yellow' | 'orange' | 'red'
export type BudgetAction = 'none' | 'decay_tool_results' | 'decay_and_cold_compact' | 'force_compact_and_warn'

export interface BudgetTier {
  name: BudgetTierName
  ratio: number
  action: BudgetAction
}

export const BUDGET_TIERS: BudgetTier[] = [
  { name: 'green',  ratio: 0.30, action: 'none' },
  { name: 'yellow', ratio: 0.60, action: 'decay_tool_results' },
  { name: 'orange', ratio: 0.80, action: 'decay_and_cold_compact' },
  { name: 'red',    ratio: 1.00, action: 'force_compact_and_warn' },
]

export interface BudgetTierResult {
  name: BudgetTierName
  action: BudgetAction
  ratio: number
  tokensUsed: number
  windowSize: number
}

export function evaluateBudgetTier(tokensUsed: number, windowSize: number): BudgetTierResult {
  const ratio = tokensUsed / windowSize
  let match = BUDGET_TIERS[0]
  for (const tier of BUDGET_TIERS) {
    if (ratio <= tier.ratio) { match = tier; break }
    match = tier  // fall through to highest matching
  }
  return { name: match.name, action: match.action, ratio, tokensUsed, windowSize }
}
```

- [ ] **Step 4: Run — pass**

```bash
cd server && npx vitest run tests/model-window.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/context/model-window.ts server/tests/model-window.test.ts
git commit -m "$(cat <<'EOF'
feat(context): model window detection + 4-tier budget ladder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Zone-by-tokens — Hot/Warm/Cold classification

**Files:**
- Create: `server/src/context/zones.ts`
- Create: `server/tests/zones.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/zones.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { zoneByTokens, estimateMessageTokens, DEFAULT_ZONE_BOUNDARIES } from '../src/context/zones.js'
import type { ModelMessage } from 'ai'

const short: ModelMessage = { role: 'user', content: '好' }
const medium: ModelMessage = { role: 'assistant', content: 'A'.repeat(2500) }  // ~1000 tokens
const huge: ModelMessage = { role: 'assistant', content: 'X'.repeat(60000) }   // ~24000 tokens

describe('estimateMessageTokens', () => {
  it('estimates token count from char length / 2.5', () => {
    expect(estimateMessageTokens({ role: 'user', content: 'X'.repeat(100) })).toBe(40)
  })
  it('handles object content (serialized)', () => {
    const m: ModelMessage = { role: 'assistant', content: [{ type: 'text', text: 'hello' }] as any }
    expect(estimateMessageTokens(m)).toBeGreaterThan(0)
  })
})

describe('zoneByTokens', () => {
  it('all short messages in Hot', () => {
    const msgs = Array.from({ length: 30 }, () => short)
    const { hot, warm, cold } = zoneByTokens(msgs)
    expect(hot.length).toBe(30)
    expect(warm.length).toBe(0)
    expect(cold.length).toBe(0)
  })

  it('long context split into 3 zones', () => {
    // 40 medium messages (~40k tokens total) + 10 short
    const msgs: ModelMessage[] = [
      ...Array.from({ length: 5 }, () => short),      // oldest
      ...Array.from({ length: 40 }, () => medium),    // ~40k tok middle
      ...Array.from({ length: 10 }, () => short),     // newest
    ]
    const { hot, warm, cold } = zoneByTokens(msgs)
    expect(hot.length + warm.length + cold.length).toBe(msgs.length)
    // Hot should contain mostly short (newest), bounded by hotTokens
    expect(hot[hot.length - 1]).toBe(short)
    // Cold should include the oldest short messages
    expect(cold[0]).toBe(short)
  })

  it('a single huge message alone can fill Hot+Warm', () => {
    const msgs = [huge, short, short]  // huge oldest, then 2 short newest
    const { hot, warm, cold } = zoneByTokens(msgs)
    // 2 short in hot, huge overflows to warm
    expect(hot).toEqual([short, short])
    expect(warm).toEqual([huge])
  })

  it('respects custom boundaries', () => {
    const msgs = Array.from({ length: 5 }, () => medium)  // ~5000 tokens
    const { hot, warm } = zoneByTokens(msgs, { hotTokens: 2000, warmTokens: 2000 })
    expect(hot.length).toBeLessThan(msgs.length)
    expect(warm.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

Create `server/src/context/zones.ts`:

```typescript
import type { ModelMessage } from 'ai'

export interface ZoneBoundaries {
  hotTokens: number
  warmTokens: number
}

export const DEFAULT_ZONE_BOUNDARIES: ZoneBoundaries = {
  hotTokens: 20000,
  warmTokens: 40000,
}

export interface MessageZones {
  hot: ModelMessage[]
  warm: ModelMessage[]
  cold: ModelMessage[]
}

export function estimateMessageTokens(m: ModelMessage): number {
  const s = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  return Math.ceil(s.length / 2.5)
}

export function zoneByTokens(
  messages: ModelMessage[],
  boundaries: ZoneBoundaries = DEFAULT_ZONE_BOUNDARIES,
): MessageZones {
  const hot: ModelMessage[] = []
  const warm: ModelMessage[] = []
  const cold: ModelMessage[] = []
  let hotTok = 0
  let warmTok = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const tok = estimateMessageTokens(m)
    if (hotTok + tok <= boundaries.hotTokens) {
      hot.unshift(m)
      hotTok += tok
    } else if (warmTok + tok <= boundaries.warmTokens) {
      warm.unshift(m)
      warmTok += tok
    } else {
      cold.unshift(m)
    }
  }
  return { hot, warm, cold }
}
```

- [ ] **Step 4: Run — pass**

```bash
cd server && npx vitest run tests/zones.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/context/zones.ts server/tests/zones.test.ts
git commit -m "$(cat <<'EOF'
feat(context): token-weighted Hot/Warm/Cold zone classification

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tool-result decay

**Files:**
- Create: `server/src/context/decay.ts`
- Create: `server/tests/decay.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/decay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decayToolResults, LARGE_RESULT_TOOLS, PRESERVE_ALWAYS } from '../src/context/decay.js'
import type { ModelMessage } from 'ai'

function toolResultMsg(toolName: string, content: string): ModelMessage {
  return {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: `call_${toolName}`,
      toolName,
      output: { type: 'text', value: content },
    }] as any,
  }
}

describe('decayToolResults', () => {
  it('replaces long read_file result in warm zone', () => {
    const original = toolResultMsg('read_file', 'X'.repeat(12000))
    const zones = {
      hot: [],
      warm: [original],
      cold: [],
    }
    const messages = [original]
    const result = decayToolResults(messages, zones)
    const warmMsg = result[0]
    const content = JSON.stringify(warmMsg.content)
    expect(content).toContain('[read_file')
    expect(content).not.toContain('X'.repeat(100))
  })

  it('does NOT decay short read_file (below minChars)', () => {
    const original = toolResultMsg('read_file', 'short content')
    const zones = { hot: [], warm: [original], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('short content')
  })

  it('does NOT decay read_file of ~5000 chars (typical chapter read)', () => {
    const original = toolResultMsg('read_file', 'ch05 content'.padEnd(5000, '.'))
    const zones = { hot: [], warm: [original], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('ch05 content')
  })

  it('does NOT decay messages in Hot zone', () => {
    const original = toolResultMsg('read_file', 'X'.repeat(12000))
    const zones = { hot: [original], warm: [], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('X'.repeat(100))
  })

  it('preserves submit_to_editorial result always', () => {
    const original = toolResultMsg('submit_to_editorial', 'long review'.padEnd(20000, '.'))
    const zones = { hot: [], warm: [original], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('long review')
  })

  it('preserves short save_draft result', () => {
    const original = toolResultMsg('save_draft', 'Draft saved to 04_Drafts/ch01.md (3200 chars)')
    const zones = { hot: [], warm: [original], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('Draft saved')
  })

  it('does not re-decay already decayed message', () => {
    const decayed = toolResultMsg('read_file', '[read_file: 12000 chars, re-fetch via read_file() if needed]')
    const zones = { hot: [], warm: [decayed], cold: [] }
    const result = decayToolResults([decayed], zones)
    expect(result[0]).toBe(decayed)  // unchanged
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

Create `server/src/context/decay.ts`:

```typescript
import type { ModelMessage } from 'ai'
import type { MessageZones } from './zones.js'

export interface DecayRule {
  minChars: number
  placeholder: (args: any, length: number) => string
}

export const LARGE_RESULT_TOOLS: Record<string, DecayRule> = {
  read_file: {
    minChars: 10000,
    placeholder: (args, len) => `[read_file('${args?.path ?? '?'}'): ${len} chars, re-fetch via read_file() if needed]`,
  },
  read_outline: {
    minChars: 5000,
    placeholder: (_args, len) => `[read_outline: ${len} chars snapshot, re-fetch via read_outline()]`,
  },
  read_graph: {
    minChars: 8000,
    placeholder: (_args, len) => `[read_graph: ${len} chars DAG snapshot, re-fetch via read_graph()]`,
  },
  search_lore: {
    minChars: 4000,
    placeholder: (args, len) => `[search_lore('${args?.query ?? '?'}'): ${len} chars of matches, re-query if needed]`,
  },
}

export const PRESERVE_ALWAYS = new Set<string>([
  'submit_to_editorial',
  'save_draft',
  'save_outline',
  'save_lore',
  'confirm_path',
  'prune_branch',
  'query_unresolved_setups',
  'list_skills',
  'load_skill',
])

function isDecayed(text: string): boolean {
  return /^\[(?:read_file|read_outline|read_graph|search_lore)[^\]]*\]$/.test(text.trim())
}

function extractResultText(part: any): string {
  if (!part || part.type !== 'tool-result') return ''
  const output = part.output
  if (typeof output === 'string') return output
  if (output?.type === 'text') return typeof output.value === 'string' ? output.value : ''
  return typeof part.result === 'string' ? part.result : JSON.stringify(output ?? '')
}

function replaceResultText(part: any, newText: string): any {
  return {
    ...part,
    output: { type: 'text', value: newText },
  }
}

export function decayToolResults(
  messages: ModelMessage[],
  zones: MessageZones,
): ModelMessage[] {
  const warmSet = new Set(zones.warm)
  return messages.map(m => {
    if (!warmSet.has(m)) return m
    if (m.role !== 'tool' || !Array.isArray(m.content)) return m
    const newContent = m.content.map((part: any) => {
      if (part?.type !== 'tool-result') return part
      const toolName = part.toolName
      if (PRESERVE_ALWAYS.has(toolName)) return part
      const rule = LARGE_RESULT_TOOLS[toolName]
      if (!rule) return part
      const text = extractResultText(part)
      if (text.length < rule.minChars) return part
      if (isDecayed(text)) return part
      // Retrieve args from the corresponding tool_use part (same message's adjacent assistant message not accessible here — use call id lookup if needed)
      // Simplification: rule.placeholder uses args from the part if available, else '?'
      const placeholder = rule.placeholder(part.args ?? {}, text.length)
      return replaceResultText(part, placeholder)
    })
    return { ...m, content: newContent }
  })
}
```

- [ ] **Step 4: Run — pass**

```bash
cd server && npx vitest run tests/decay.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/context/decay.ts server/tests/decay.test.ts
git commit -m "$(cat <<'EOF'
feat(context): tool-result decay for warm zone large payloads

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: PTL fallback (Prompt Too Long with head-strip retry)

**Files:**
- Create: `server/src/context/ptl-fallback.ts`
- Create: `server/tests/ptl-fallback.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/ptl-fallback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateWithPtlRetry, isPromptTooLongError, truncateHead20Percent } from '../src/context/ptl-fallback.js'

describe('isPromptTooLongError', () => {
  it('detects common "prompt too long" error messages', () => {
    expect(isPromptTooLongError(new Error('prompt is too long'))).toBe(true)
    expect(isPromptTooLongError(new Error('context_length_exceeded'))).toBe(true)
    expect(isPromptTooLongError(new Error('random other error'))).toBe(false)
  })
})

describe('truncateHead20Percent', () => {
  it('strips 20% from the start', () => {
    const input = 'A'.repeat(100)
    const out = truncateHead20Percent(input)
    expect(out.length).toBeLessThan(input.length)
    expect(out.length).toBeGreaterThanOrEqual(80)
    expect(out.length).toBeLessThanOrEqual(82)
  })
})

// generateWithPtlRetry test lives in a higher-level integration test because
// it depends on Vercel AI SDK's generateText. Skip here — unit tested via the
// helpers above + covered by cold-compact integration test.
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

Create `server/src/context/ptl-fallback.ts`:

```typescript
import { generateText } from 'ai'
import { type LLMConfig, createProvider } from '../llm/provider.js'

export function isPromptTooLongError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const msg = e.message.toLowerCase()
  return msg.includes('prompt') && (msg.includes('too long') || msg.includes('exceeded'))
    || msg.includes('context_length_exceeded')
    || msg.includes('context length')
}

export function truncateHead20Percent(text: string): string {
  const cut = Math.floor(text.length * 0.2)
  return text.slice(cut)
}

export const MAX_PTL_RETRIES = 3

export async function generateWithPtlRetry(
  prompt: string,
  llmConfig: LLMConfig,
  maxOutputTokens: number = 4000,
  maxRetries: number = MAX_PTL_RETRIES,
): Promise<{ text: string; retries: number }> {
  let current = prompt
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await generateText({
        model: createProvider(llmConfig),
        prompt: current,
        temperature: 0.3,
      })
      return { text: r.text, retries: attempt }
    } catch (e) {
      if (!isPromptTooLongError(e) || attempt >= maxRetries) throw e
      current = truncateHead20Percent(current)
    }
  }
  throw new Error('unreachable: loop bounds violated')
}
```

- [ ] **Step 4: Run — pass**

```bash
cd server && npx vitest run tests/ptl-fallback.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/context/ptl-fallback.ts server/tests/ptl-fallback.test.ts
git commit -m "$(cat <<'EOF'
feat(context): PTL fallback — head-strip retry up to 3 times

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Cold-segment compaction pipeline

**Files:**
- Create: `server/src/context/cold-compact.ts`
- Create: `prompts/compact_summary.j2`
- Create: `server/tests/cold-compact.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/cold-compact.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { compactColdSegment } from '../src/context/cold-compact.js'
import { createSessionState } from '../src/context/session-state.js'
import type { ModelMessage } from 'ai'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'))
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
  vi.doMock('../src/context/ptl-fallback.js', () => ({
    generateWithPtlRetry: vi.fn().mockResolvedValue({ text: '[MOCK SUMMARY]', retries: 0 }),
    isPromptTooLongError: () => false,
    truncateHead20Percent: (s: string) => s,
    MAX_PTL_RETRIES: 3,
  }))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('compactColdSegment', () => {
  it('produces summary + session summary file', async () => {
    const cold: ModelMessage[] = [
      { role: 'user', content: 'earliest question' },
      { role: 'assistant', content: 'earliest answer' },
      { role: 'user', content: 'follow-up' },
    ]
    const warm: ModelMessage[] = [{ role: 'user', content: 'recent' }]
    const hot: ModelMessage[] = [{ role: 'assistant', content: 'latest' }]
    const result = await compactColdSegment({
      cold, warm, hot,
      sessionState: createSessionState(),
      llmConfig: { apiKey: 'test', model: 'test-model' },
      bookDir: path.join(tmpDir, 'book1'),
    })
    expect(result.summaryText).toContain('[MOCK SUMMARY]')
    expect(result.newMessages.length).toBe(1 + warm.length + hot.length)
    expect(result.stats.compacted).toBe(cold.length)

    const sessDir = path.join(tmpDir, 'book1', 'session_summaries')
    expect(fs.existsSync(sessDir)).toBe(true)
    const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.md'))
    expect(files.length).toBe(1)
  })

  it('returns messages unchanged when cold is empty', async () => {
    const warm: ModelMessage[] = [{ role: 'user', content: 'x' }]
    const hot: ModelMessage[] = [{ role: 'assistant', content: 'y' }]
    const result = await compactColdSegment({
      cold: [], warm, hot,
      sessionState: createSessionState(),
      llmConfig: { apiKey: 'test', model: 'test-model' },
      bookDir: path.join(tmpDir, 'book1'),
    })
    expect(result.stats.compacted).toBe(0)
    expect(result.newMessages).toEqual([...warm, ...hot])
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

Create `server/src/context/cold-compact.ts`:

```typescript
import fs from 'fs'
import path from 'path'
import type { ModelMessage } from 'ai'
import { type LLMConfig } from '../llm/provider.js'
import { generateWithPtlRetry } from './ptl-fallback.js'
import type { SessionState } from './session-state.js'
import { writeMemory } from '../memory/memory-service.js'
import { nanoId } from '../memory/markdown-io.js'

const PROMPTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
  '../../../prompts',
)

function stripImages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map(m => {
    if (typeof m.content === 'string') return m
    if (!Array.isArray(m.content)) return m
    const filtered = m.content.filter((p: any) => p?.type !== 'image' && p?.type !== 'document')
    return { ...m, content: filtered }
  })
}

function renderMessages(messages: ModelMessage[]): string {
  return messages.map(m => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content).slice(0, 1000)
    return `[${m.role}] ${content}`
  }).join('\n\n')
}

function renderSessionState(state: SessionState): string {
  const parts: string[] = []
  if (state.recentReads.length > 0) {
    parts.push('## 刚读过的文件')
    for (const r of state.recentReads) {
      parts.push(`- ${r.tool}(${JSON.stringify(r.args)}) → "${r.excerpt.slice(0, 200)}..."`)
    }
  }
  if (state.activeSkill) {
    parts.push('## 激活的 skill')
    parts.push(`${state.activeSkill.name}:\n${state.activeSkill.body.slice(0, 1000)}`)
  }
  return parts.join('\n\n')
}

export interface CompactInput {
  cold: ModelMessage[]
  warm: ModelMessage[]
  hot: ModelMessage[]
  sessionState: SessionState
  llmConfig: LLMConfig
  bookDir: string
}

export interface CompactOutput {
  newMessages: ModelMessage[]
  summaryText: string
  stats: { compacted: number; kept: number }
}

export async function compactColdSegment(input: CompactInput): Promise<CompactOutput> {
  if (input.cold.length === 0) {
    return {
      newMessages: [...input.warm, ...input.hot],
      summaryText: '',
      stats: { compacted: 0, kept: input.warm.length + input.hot.length },
    }
  }

  const stripped = stripImages(input.cold)
  const coldText = renderMessages(stripped)
  const stateText = renderSessionState(input.sessionState)

  const tmplPath = path.join(PROMPTS_DIR, 'compact_summary.j2')
  let tmpl = fs.readFileSync(tmplPath, 'utf8')
  tmpl = tmpl
    .replace(/\{\{\s*coldMessages\s*\}\}/g, coldText)
    .replace(/\{\{\s*sessionState\s*\}\}/g, stateText)

  const { text: summaryText } = await generateWithPtlRetry(tmpl, input.llmConfig, 4000)

  const summaryMessage: ModelMessage = {
    role: 'system',
    content: [
      '# 会话摘要（自动压缩，覆盖前 ' + input.cold.length + ' 条消息）',
      '',
      summaryText,
      '',
      '# 最近工作台状态',
      stateText || '(空)',
    ].join('\n'),
  } as any

  // Persist to Memory v2 session_summaries
  const bookId = path.basename(input.bookDir)
  const dataDir = path.dirname(input.bookDir)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  writeMemory(dataDir, {
    id: `sess_${nanoId()}`,
    scope: 'session',
    type: 'compact_summary',
    confidence: 0.7,
    tags: ['auto-compact', `book-${bookId}`],
    source: 'context_compact',
    source_event: `compact_${ts}`,
    status: 'active',
    created_at: new Date().toISOString(),
    book_id: bookId,
  }, summaryText)

  return {
    newMessages: [summaryMessage, ...input.warm, ...input.hot],
    summaryText,
    stats: { compacted: input.cold.length, kept: input.warm.length + input.hot.length },
  }
}
```

- [ ] **Step 4: Create prompt template**

Create `prompts/compact_summary.j2`:

```
你是会话压缩器。读下面的早期对话记录，提取**关键信息**浓缩为一段摘要。
保留：角色决策 / 用户偏好 / 重要伏笔 / 剧情走向结论 / 编辑部教训。
丢弃：闲聊 / 已被后续覆盖的讨论 / 具体 tool call 细节（但保留"Agent 读过什么章、写过什么章"这类骨架）。

## 早期对话（将被压缩）
{{coldMessages}}

## 当前工作台状态（参考，不要重复在摘要里）
{{sessionState}}

## 任务
生成一段中文摘要，结构：

**核心决策**：（3-5 条）
**用户偏好**：（0-5 条）
**未决事项**：（讨论过但没结论的）
**进展快照**：（已完成/进行中的章节、正在追的伏笔）

字数控制 500-1500 字内。

输出纯文本（不要 JSON、不要代码块）。
```

- [ ] **Step 5: Run — pass**

```bash
cd server && npx vitest run tests/cold-compact.test.ts
```

Expected: 2 tests pass (with mocked PTL).

- [ ] **Step 6: Commit**

```bash
git add server/src/context/cold-compact.ts prompts/compact_summary.j2 server/tests/cold-compact.test.ts
git commit -m "$(cat <<'EOF'
feat(context): cold-segment compaction pipeline + session_summary write

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Session state + tool-call hook

**Files:**
- Create: `server/src/context/session-state.ts`
- Create: `server/tests/session-state.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/session-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createSessionState, updateSessionStateAfterToolCall } from '../src/context/session-state.js'

describe('session-state', () => {
  it('empty state has no reads + no skill', () => {
    const s = createSessionState()
    expect(s.recentReads).toEqual([])
    expect(s.activeSkill).toBeNull()
  })

  it('read_file call appends to recentReads', () => {
    const s = createSessionState()
    updateSessionStateAfterToolCall(s, 'read_file', { path: 'ch05.md' }, 'content here')
    expect(s.recentReads.length).toBe(1)
    expect(s.recentReads[0].tool).toBe('read_file')
    expect(s.recentReads[0].args.path).toBe('ch05.md')
  })

  it('recentReads cap at 5 (FIFO)', () => {
    const s = createSessionState()
    for (let i = 0; i < 7; i++) {
      updateSessionStateAfterToolCall(s, 'read_file', { path: `f${i}` }, `c${i}`)
    }
    expect(s.recentReads.length).toBe(5)
    expect(s.recentReads[0].args.path).toBe('f2')
    expect(s.recentReads[4].args.path).toBe('f6')
  })

  it('load_skill sets activeSkill', () => {
    const s = createSessionState()
    updateSessionStateAfterToolCall(s, 'load_skill', { name: 'iceberg' }, 'skill body here')
    expect(s.activeSkill?.name).toBe('iceberg')
    expect(s.activeSkill?.body).toBe('skill body here')
  })

  it('ignores non-read non-skill tools', () => {
    const s = createSessionState()
    updateSessionStateAfterToolCall(s, 'save_draft', { file_path: 'ch01.md' }, 'saved')
    expect(s.recentReads).toEqual([])
    expect(s.activeSkill).toBeNull()
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

Create `server/src/context/session-state.ts`:

```typescript
export interface RecentRead {
  tool: string
  args: any
  excerpt: string
  timestamp: number
}

export interface SessionState {
  recentReads: RecentRead[]
  activeSkill: { name: string; body: string } | null
  decayedMessageIds: Set<string>
}

const READ_TOOLS = new Set(['read_file', 'read_outline', 'read_graph', 'search_lore'])

export function createSessionState(): SessionState {
  return {
    recentReads: [],
    activeSkill: null,
    decayedMessageIds: new Set(),
  }
}

export function updateSessionStateAfterToolCall(
  state: SessionState,
  toolName: string,
  args: any,
  result: string,
): void {
  if (READ_TOOLS.has(toolName)) {
    state.recentReads.push({
      tool: toolName,
      args,
      excerpt: result.slice(0, 500),
      timestamp: Date.now(),
    })
    while (state.recentReads.length > 5) state.recentReads.shift()
  }
  if (toolName === 'load_skill') {
    state.activeSkill = { name: args?.name ?? 'unknown', body: result.slice(0, 2000) }
  }
}
```

- [ ] **Step 4: Run — pass**

```bash
cd server && npx vitest run tests/session-state.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/context/session-state.ts server/tests/session-state.test.ts
git commit -m "$(cat <<'EOF'
feat(context): session state tracker (recent reads + active skill)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Circuit breaker

**Files:**
- Create: `server/src/context/circuit-breaker.ts`
- Create: `server/tests/circuit-breaker.test.ts`

- [ ] **Step 1: Tests**

Create `server/tests/circuit-breaker.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadBreakerState, recordFailure, recordSuccess, resetBreaker, isTripped, MAX_FAILS } from '../src/context/circuit-breaker.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'))
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('circuit-breaker', () => {
  it('fresh state is not tripped', () => {
    const state = loadBreakerState(path.join(tmpDir, 'book1'))
    expect(state.consecutiveFailures).toBe(0)
    expect(state.tripped).toBe(false)
    expect(isTripped(state)).toBe(false)
  })

  it('trips after MAX_FAILS consecutive failures', () => {
    const bookDir = path.join(tmpDir, 'book1')
    for (let i = 0; i < MAX_FAILS; i++) recordFailure(bookDir)
    const state = loadBreakerState(bookDir)
    expect(state.tripped).toBe(true)
    expect(isTripped(state)).toBe(true)
  })

  it('success resets counter', () => {
    const bookDir = path.join(tmpDir, 'book1')
    recordFailure(bookDir)
    recordFailure(bookDir)
    recordSuccess(bookDir)
    const state = loadBreakerState(bookDir)
    expect(state.consecutiveFailures).toBe(0)
    expect(state.tripped).toBe(false)
  })

  it('reset clears tripped', () => {
    const bookDir = path.join(tmpDir, 'book1')
    for (let i = 0; i < MAX_FAILS; i++) recordFailure(bookDir)
    resetBreaker(bookDir)
    const state = loadBreakerState(bookDir)
    expect(state.tripped).toBe(false)
  })
})
```

- [ ] **Step 2: Implement**

Create `server/src/context/circuit-breaker.ts`:

```typescript
import fs from 'fs'
import path from 'path'

export interface BreakerState {
  consecutiveFailures: number
  tripped: boolean
  lastFailureAt?: string
}

export const MAX_FAILS = 3

function breakerFile(bookDir: string): string {
  return path.join(bookDir, 'compact_breaker.json')
}

export function loadBreakerState(bookDir: string): BreakerState {
  const f = breakerFile(bookDir)
  if (!fs.existsSync(f)) return { consecutiveFailures: 0, tripped: false }
  try {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'))
    return {
      consecutiveFailures: Number(raw.consecutiveFailures ?? 0),
      tripped: Boolean(raw.tripped ?? false),
      lastFailureAt: raw.lastFailureAt,
    }
  } catch {
    return { consecutiveFailures: 0, tripped: false }
  }
}

function saveBreakerState(bookDir: string, state: BreakerState): void {
  fs.writeFileSync(breakerFile(bookDir), JSON.stringify(state, null, 2), 'utf8')
}

export function recordFailure(bookDir: string): BreakerState {
  const state = loadBreakerState(bookDir)
  state.consecutiveFailures += 1
  state.lastFailureAt = new Date().toISOString()
  if (state.consecutiveFailures >= MAX_FAILS) state.tripped = true
  saveBreakerState(bookDir, state)
  return state
}

export function recordSuccess(bookDir: string): BreakerState {
  const state: BreakerState = { consecutiveFailures: 0, tripped: false }
  saveBreakerState(bookDir, state)
  return state
}

export function resetBreaker(bookDir: string): BreakerState {
  return recordSuccess(bookDir)
}

export function isTripped(state: BreakerState): boolean {
  return state.tripped
}
```

- [ ] **Step 3: Run + commit**

```bash
cd server && npx vitest run tests/circuit-breaker.test.ts
git add server/src/context/circuit-breaker.ts server/tests/circuit-breaker.test.ts
git commit -m "$(cat <<'EOF'
feat(context): circuit breaker — stops auto-compact after 3 failures

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: chat-history refactor — remove .slice(-20)

**Files:**
- Modify: `server/src/routes/chat-history.ts` — expose loadHistoryFull
- Create: `server/tests/chat-history.test.ts` (regression)

- [ ] **Step 1: Regression test first**

Create `server/tests/chat-history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadHistoryFull, saveHistory } from '../src/routes/chat-history.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-'))
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('chat-history', () => {
  it('loadHistoryFull returns all saved messages (no slice)', () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }))
    saveHistory(tmpDir, 'book1', msgs)
    const loaded = loadHistoryFull(tmpDir, 'book1')
    // saveHistory still caps at 50 for disk bloat protection; should return up to 50
    expect(loaded.length).toBe(40)
  })
})
```

- [ ] **Step 2: Modify chat-history.ts**

Replace the current `loadHistory` with a new `loadHistoryFull` (keep `loadHistory` as deprecated alias if something else in the codebase calls it):

```typescript
export function loadHistoryFull(dataDir: string, bookId: string): ModelMessage[] {
  const raw = safeReadJson<Array<{ role: string }>>(historyPath(dataDir, bookId))
  if (!raw) return []
  return raw.filter(m => m.role === 'user' || m.role === 'assistant') as ModelMessage[]
}

// Legacy — delete callers progressively
export const loadHistory = loadHistoryFull
```

`saveHistory` keeps the `.slice(-50)` disk cap.

- [ ] **Step 3: Update call sites**

```bash
cd server && grep -rn "loadHistory" src/ | grep -v 'chat-history.ts'
```

Replace `loadHistory` callers with `loadHistoryFull`. The SSE author-chat route is the main one.

- [ ] **Step 4: Run tests + commit**

```bash
cd server && npm test
git add server/src/routes/chat-history.ts server/tests/chat-history.test.ts
git commit -m "$(cat <<'EOF'
refactor(context): remove .slice(-20) hard cut in loadHistory

Full history is now loaded into context and trimmed by ContextManager
per token-based zones. saveHistory still caps at 50 on disk for bloat
protection (old content retained via session_summaries markdown files).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: author-chat route integration

**Files:**
- Modify: `server/src/routes/author-chat.ts` — pre-stream context decision + post-stream usage persist
- Create: `server/src/context/decision.ts` — top-level "evaluate + act" function

- [ ] **Step 1: Create decision module**

Create `server/src/context/decision.ts`:

```typescript
import type { ModelMessage } from 'ai'
import type { LLMConfig } from '../llm/provider.js'
import { evaluateBudgetTier, getModelContextWindow } from './model-window.js'
import { zoneByTokens, type ZoneBoundaries } from './zones.js'
import { decayToolResults } from './decay.js'
import { compactColdSegment } from './cold-compact.js'
import { loadBreakerState, recordFailure, recordSuccess } from './circuit-breaker.js'
import type { SessionState } from './session-state.js'

export type ContextMode = 'auto' | 'decay_only' | 'disabled'

export interface ContextDecision {
  tier: 'green' | 'yellow' | 'orange' | 'red'
  tokensUsed: number
  windowSize: number
  ratio: number
  action: 'none' | 'decay_tool_results' | 'decay_and_cold_compact' | 'force_compact_and_warn'
  decayedCount: number
  compactedCount: number
  breakerTripped: boolean
}

export interface ProcessContextInput {
  messages: ModelMessage[]
  model: string
  lastUsage: { total_tokens?: number } | undefined
  sessionState: SessionState
  bookDir: string
  llmConfig: LLMConfig
  mode: ContextMode
  boundaries?: ZoneBoundaries
}

export async function processContext(
  input: ProcessContextInput,
): Promise<{ newMessages: ModelMessage[]; decision: ContextDecision }> {
  const windowSize = getModelContextWindow(input.model)
  const tokens = input.lastUsage?.total_tokens ?? 0
  const tier = evaluateBudgetTier(tokens, windowSize)

  const decision: ContextDecision = {
    tier: tier.name,
    tokensUsed: tokens,
    windowSize,
    ratio: tier.ratio,
    action: input.mode === 'disabled' ? 'none' : tier.action,
    decayedCount: 0,
    compactedCount: 0,
    breakerTripped: false,
  }

  if (input.mode === 'disabled' || decision.action === 'none') {
    return { newMessages: input.messages, decision }
  }

  const breakerState = loadBreakerState(input.bookDir)
  decision.breakerTripped = breakerState.tripped

  let messages = input.messages

  if (decision.action === 'decay_tool_results'
      || decision.action === 'decay_and_cold_compact'
      || decision.action === 'force_compact_and_warn') {
    const zones = zoneByTokens(messages, input.boundaries)
    const before = messages
    messages = decayToolResults(messages, zones)
    // Count decays
    decision.decayedCount = messages.filter((m, i) => m !== before[i]).length
  }

  const allowCompact = input.mode === 'auto' && !breakerState.tripped
  if (allowCompact && (decision.action === 'decay_and_cold_compact' || decision.action === 'force_compact_and_warn')) {
    try {
      const zones = zoneByTokens(messages, input.boundaries)
      if (zones.cold.length > 0) {
        const result = await compactColdSegment({
          cold: zones.cold, warm: zones.warm, hot: zones.hot,
          sessionState: input.sessionState, llmConfig: input.llmConfig,
          bookDir: input.bookDir,
        })
        messages = result.newMessages
        decision.compactedCount = result.stats.compacted
        recordSuccess(input.bookDir)
      }
    } catch (e) {
      recordFailure(input.bookDir)
      decision.breakerTripped = loadBreakerState(input.bookDir).tripped
      console.warn('[context] cold compact failed:', e)
    }
  }

  return { newMessages: messages, decision }
}
```

- [ ] **Step 2: Integrate in author-chat route**

Modify `server/src/routes/author-chat.ts` inside the `POST /api/v1/author-chat/:bookId/send` handler:

```typescript
import { processContext, type ContextMode } from '../context/decision.js'
import { createSessionState, updateSessionStateAfterToolCall } from '../context/session-state.js'
import { loadHistoryFull } from './chat-history.js'
import path from 'path'
import fs from 'fs'

// Inside handler:
const rawMessages = loadHistoryFull(dataDir, bookId)
const sessionState = createSessionState()
const bookDir = path.join(dataDir, bookId)

// Read lastUsage (persisted from previous turn)
const usageFile = path.join(bookDir, 'last_usage.json')
const lastUsage = fs.existsSync(usageFile)
  ? JSON.parse(fs.readFileSync(usageFile, 'utf8'))
  : undefined

// Read user setting for contextManager mode
const settings = getSettings(dataDir)
const mode: ContextMode = (settings.contextManager ?? 'auto') as ContextMode

// Evaluate + process
const { newMessages, decision } = await processContext({
  messages: rawMessages,
  model: llmConfig.model,
  lastUsage,
  sessionState,
  bookDir,
  llmConfig,
  mode,
})

// Append this turn's user message
const processedMessages = [...newMessages, { role: 'user' as const, content: userMessage }]

// Log decision (append to context_log.jsonl)
fs.appendFileSync(path.join(bookDir, 'context_log.jsonl'),
  JSON.stringify({ ts: new Date().toISOString(), ...decision }) + '\n', 'utf8')

// Augment the existing hook chain with session-state tracking
const sessionStateHook = {
  async afterToolCall(name: string, args: any, result: string) {
    updateSessionStateAfterToolCall(sessionState, name, args, result)
  },
}
// composedHooks already in agent-loop.ts; pass sessionStateHook via the existing hooks arg

// runAgentStream(options with { messages: processedMessages, hooks: composedHooks })
```

- [ ] **Step 3: Persist usage after stream ends**

After the SSE stream finishes (where `event: done` is emitted), read `usage` from the stream result and write it:

```typescript
// After stream completes:
const usage = await streamResult.usage
if (usage?.totalTokens) {
  fs.writeFileSync(
    path.join(bookDir, 'last_usage.json'),
    JSON.stringify({ total_tokens: usage.totalTokens }),
    'utf8',
  )
}
```

- [ ] **Step 4: Smoke (integration)**

```bash
cd server && npm test  # regression
```

- [ ] **Step 5: Commit**

```bash
git add server/src/context/decision.ts server/src/routes/author-chat.ts
git commit -m "$(cat <<'EOF'
feat(context): wire decision pipeline into author-chat route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Settings extension — contextManager field

**Files:**
- Modify: `server/src/routes/settings.ts` — add `contextManager` to schema + persist

- [ ] **Step 1: Extend settings schema**

Find the settings Zod schema in `settings.ts`. Add:

```typescript
contextManager: z.enum(['auto', 'decay_only', 'disabled']).optional().default('auto'),
contextBudgetCustom: z.object({
  green: z.number().min(0).max(1).optional(),
  yellow: z.number().min(0).max(1).optional(),
  orange: z.number().min(0).max(1).optional(),
}).optional(),
```

- [ ] **Step 2: Test defaults preserved**

Existing settings tests should still pass. Run:

```bash
cd server && npm test
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/settings.ts
git commit -m "$(cat <<'EOF'
feat(settings): add contextManager mode + budget override fields

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B · Frontend

## Task 11: Context status bar + tier indicator

**Files:**
- Create: `frontend/src/components/ContextStatusBar.jsx`
- Modify: `frontend/src/components/AuthorChatPanel.jsx` — mount status bar at top

- [ ] **Step 1: Create component**

Create `frontend/src/components/ContextStatusBar.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useI18n } from '../hooks/useI18n'

const TIER_STYLE = {
  green:  { color: 'var(--success)', icon: '🟢' },
  yellow: { color: 'var(--warning)', icon: '🟡' },
  orange: { color: '#d07020',        icon: '🟠' },
  red:    { color: 'var(--danger)',  icon: '🚨' },
}

export function ContextStatusBar({ bookId }) {
  const { t } = useI18n()
  const [state, setState] = useState(null)

  useEffect(() => {
    if (!bookId) return
    let timer
    async function poll() {
      try {
        const r = await fetch(`/api/v1/books/${bookId}/debug/context-state`)
        if (r.ok) setState(await r.json())
      } catch {}
      timer = setTimeout(poll, 5000)  // every 5s
    }
    poll()
    return () => clearTimeout(timer)
  }, [bookId])

  if (!state?.current_tier) return null

  const tier = state.current_tier
  const style = TIER_STYLE[tier] ?? TIER_STYLE.green
  const pct = ((state.current_ratio ?? 0) * 100).toFixed(0)

  return (
    <div className="context-status-bar" style={{ color: style.color }}>
      <span>{style.icon} Context · {pct}% used · {state.tokens_used}/{state.window_size} tokens</span>
      {tier === 'red' && (
        <span className="context-red-banner">
          Context 已达 100%。下一轮将强制 compact。
          {state.breaker_tripped && ' 熔断已触发——请前往 Settings 手动重置。'}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add debug endpoint**

In `server/src/routes/author-chat.ts` (or a new `context-debug.ts`), add:

```typescript
import { loadBreakerState } from '../context/circuit-breaker.js'
// ...
app.get<{ Params: { bookId: string } }>('/api/v1/books/:bookId/debug/context-state', async (req) => {
  const safeBook = sanitizePathSegment(req.params.bookId, 'bookId')
  const bookDir = path.join(dataDir(), safeBook)
  const usageFile = path.join(bookDir, 'last_usage.json')
  const breakerState = loadBreakerState(bookDir)
  let tokensUsed = 0
  if (fs.existsSync(usageFile)) {
    tokensUsed = JSON.parse(fs.readFileSync(usageFile, 'utf8')).total_tokens ?? 0
  }
  const settings = getSettings(dataDir())
  const model = settings.authorModel ?? ''
  const { getModelContextWindow, evaluateBudgetTier } = await import('../context/model-window.js')
  const windowSize = getModelContextWindow(model)
  const tier = evaluateBudgetTier(tokensUsed, windowSize)

  // Read last decision from context_log.jsonl
  const logFile = path.join(bookDir, 'context_log.jsonl')
  let lastDecision = null
  if (fs.existsSync(logFile)) {
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)
    if (lines.length > 0) lastDecision = JSON.parse(lines[lines.length - 1])
  }

  return {
    current_tier: tier.name,
    current_ratio: tier.ratio,
    tokens_used: tokensUsed,
    window_size: windowSize,
    breaker_tripped: breakerState.tripped,
    last_decision: lastDecision,
  }
})
```

- [ ] **Step 3: Mount in AuthorChatPanel**

In `AuthorChatPanel.jsx`, add at the top of the panel render:

```jsx
import { ContextStatusBar } from './ContextStatusBar'
// ...
<ContextStatusBar bookId={currentBook?.book_id} />
```

- [ ] **Step 4: CSS**

Append to `frontend/src/index.css`:

```css
.context-status-bar {
  padding: 4px 12px;
  font-family: var(--font-label);
  font-size: 10px;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-subtle);
  display: flex; gap: 12px; align-items: center;
}
.context-red-banner {
  color: var(--danger);
  font-weight: 600;
}
```

- [ ] **Step 5: Smoke + commit**

```bash
cd frontend && npm run build && npm run lint
git add frontend/src/components/ContextStatusBar.jsx frontend/src/components/AuthorChatPanel.jsx frontend/src/index.css server/src/routes/author-chat.ts
git commit -m "$(cat <<'EOF'
feat(context): status bar + debug endpoint for tier observability

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Compact event notifications

**Files:**
- Modify: `frontend/src/components/AuthorChatPanel.jsx` — consume decision from SSE, show inline notice

- [ ] **Step 1: Backend — emit decision as SSE event**

Modify `server/src/routes/author-chat.ts` to emit a custom SSE event right after the stream starts:

```typescript
// After processContext returns:
reply.raw.write(`event: context\ndata: ${JSON.stringify(decision)}\n\n`)
```

- [ ] **Step 2: Frontend — listen for `context` event**

In `AuthorChatPanel.jsx`'s SSE event handler (the one parsing `event: status`, `event: content`, etc.), add:

```jsx
if (eventName === 'context') {
  const d = JSON.parse(data)
  if (d.decayedCount > 0) {
    setMessages(prev => [...prev, {
      id: `ctx_${Date.now()}`,
      role: 'system_notice',
      content: `本轮衰减了 ${d.decayedCount} 条工具结果（节省 token）`,
    }])
  }
  if (d.compactedCount > 0) {
    setMessages(prev => [...prev, {
      id: `ctx_${Date.now()}`,
      role: 'system_notice',
      content: `📚 已压缩 ${d.compactedCount} 条早期消息到会话摘要`,
    }])
  }
}
```

Also add a render branch in the messages map for `role === 'system_notice'`:

```jsx
if (m.role === 'system_notice') {
  return (
    <div key={m.id} className="context-notice">
      {m.content}
    </div>
  )
}
```

- [ ] **Step 3: CSS**

```css
.context-notice {
  text-align: center;
  padding: 6px 12px;
  margin: 8px 0;
  background: var(--accent-soft);
  color: var(--ink-secondary);
  font-family: var(--font-label);
  font-size: 10px;
  border: 1px dashed var(--border-subtle);
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AuthorChatPanel.jsx frontend/src/index.css server/src/routes/author-chat.ts
git commit -m "$(cat <<'EOF'
feat(context): inline notices for decay + compact events

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: SettingsPanel — contextManager dropdown + breaker reset

**Files:**
- Modify: `frontend/src/components/SettingsPanel.jsx` — new section for context
- Create: `POST /api/v1/books/:bookId/context/reset-breaker` endpoint

- [ ] **Step 1: Backend reset endpoint**

In `server/src/routes/author-chat.ts` (or a new route file):

```typescript
import { resetBreaker } from '../context/circuit-breaker.js'
// ...
app.post<{ Params: { bookId: string } }>('/api/v1/books/:bookId/context/reset-breaker', async (req) => {
  const safeBook = sanitizePathSegment(req.params.bookId, 'bookId')
  const bookDir = path.join(dataDir(), safeBook)
  resetBreaker(bookDir)
  return { ok: true }
})
```

- [ ] **Step 2: Frontend — SettingsPanel section**

In `frontend/src/components/SettingsPanel.jsx`, add a new section below existing settings:

```jsx
<Section title={t('settings.context') /* 新增 i18n key */}>
  <div className="field">
    <label className="field-label">Context Manager Mode</label>
    <select
      value={settings.contextManager ?? 'auto'}
      onChange={e => updateSettings({ ...settings, contextManager: e.target.value })}
    >
      <option value="auto">Auto (推荐) — 自动衰减 + 自动 compact</option>
      <option value="decay_only">Decay only — 只衰减 tool payloads，不 compact</option>
      <option value="disabled">Disabled — 完全不处理</option>
    </select>
  </div>
  <div style={{ marginTop: 12 }}>
    <button className="btn" onClick={async () => {
      if (!currentBook) return
      await fetch(`/api/v1/books/${currentBook.book_id}/context/reset-breaker`, { method: 'POST' })
      addToast?.('熔断已重置', 'success')
    }}>重置压缩熔断</button>
  </div>
</Section>
```

i18n keys:
```js
// zh
'settings.context': '上下文管理',
// en
'settings.context': 'Context Management',
```

- [ ] **Step 3: Smoke**

Open Settings, change mode dropdown, trigger reset. Verify persistence + toast.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SettingsPanel.jsx frontend/src/i18n/locales.js server/src/routes/author-chat.ts
git commit -m "$(cat <<'EOF'
feat(settings): contextManager mode dropdown + breaker reset button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Final smoke + CLAUDE.md + acceptance

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full sanity**

- `cd frontend && npm run build` — success
- `cd frontend && npm run lint` — 0 errors
- `cd server && npm test` — all tests pass (expect ~350+)

- [ ] **Step 2: End-to-end smoke test**

1. Start servers
2. Open a book with substantial history (or manually pad `author_chat_history.json` with 40+ messages)
3. Send a new message. Status bar shows token usage + tier
4. Manually edit `last_usage.json` to simulate high token count; next turn triggers decay — `context_log.jsonl` gets new entry
5. Force orange tier (`usage.total_tokens = 150000` for 200k window) — cold compact fires, `session_summaries/*.md` appears
6. Force repeated failure (mock provider error) — after 3 failures, breaker trips; banner shows red
7. Settings → "重置压缩熔断" → banner clears
8. Switch to `decay_only` mode — verify orange/red no longer triggers cold compact
9. Verify Memory Library shows session_summaries under active Session section

- [ ] **Step 3: cacheReadInputTokens observation (optional)**

If provider metadata exposes `cacheReadInputTokens`, log it per turn. After decay event, next turn should still have `cacheReadInputTokens > 0`; after cold compact, next turn = 0. Not a blocking check — document observed behavior.

- [ ] **Step 4: Update CLAUDE.md**

In "Architecture" section, add:

```markdown
### Context Manager (`server/src/context/*.ts`)

Fine-grained 3-tier retention replacing the old `.slice(-20)` hard cut in `chat-history.ts`:

- **Budget tiers** (green 0-30% / yellow 30-60% / orange 60-80% / red 80%+) computed from `usage.total_tokens / getModelContextWindow(model)`. Window auto-detected for GLM-5 (1M), DeepSeek V3 (200K), Claude [1m] suffix, etc.
- **Token-weighted zones**: Hot (last 20k tok, never touched) / Warm (next 40k tok, large tool-result payloads decayed) / Cold (rest, eligible for summary compact)
- **Tool-result decay** (primary mechanism, cheap, cache-friendly): `read_file` > 10k chars / `read_outline` > 5k / `read_graph` > 8k / `search_lore` > 4k in warm zone → replaced with `[tool: ..., re-fetch if needed]`. `submit_to_editorial`, `save_*` results preserved always.
- **Cold-segment compact** (fallback): fork EDITORIAL_MODEL summary call with PTL fallback (head-strip retry up to 3 times) + circuit breaker (stops after 3 consecutive failures; reset via Settings). Summary persists to Memory v2 `session_summaries/*.md`.
- **Modes**: `auto` / `decay_only` / `disabled` via Settings.
- **Observability**: frontend status bar + `context_log.jsonl` per book + debug endpoint `/api/v1/books/:bookId/debug/context-state`.
```

In "API Routes":

```markdown
**context (in author-chat.ts)** — Context manager endpoints:
- `GET /api/v1/books/:bookId/debug/context-state` — current tier + last decision
- `POST /api/v1/books/:bookId/context/reset-breaker` — manual breaker reset
```

In "Critical Rules":

```markdown
- **chat-history full-load**: `loadHistoryFull` (replacing `.slice(-20)` `loadHistory`) is the source of truth. Trimming is done by ContextManager's zone-based logic, not by history load.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: context manager architecture + routes + rules in CLAUDE.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification Checklist

- [ ] `getModelContextWindow` detects 1M models (GLM-5 / Claude [1m]) and falls back to 200K
- [ ] `evaluateBudgetTier` returns correct tier at boundary ratios
- [ ] `zoneByTokens` classifies short conversations entirely as Hot
- [ ] `zoneByTokens` handles a single huge message correctly (fills hot + overflow to warm)
- [ ] `decayToolResults` replaces long `read_file` in warm zone; preserves submit_to_editorial; skips hot zone; no double-decay
- [ ] `generateWithPtlRetry` head-strips prompt on PTL errors, up to 3 retries
- [ ] Cold-compact produces summary + persists to `session_summaries/*.md`
- [ ] Session state tracks recent 5 reads + active skill; FIFO cap works
- [ ] Circuit breaker trips after 3 failures; reset clears
- [ ] `chat-history.ts` no longer uses `.slice(-20)`; `loadHistoryFull` exposed
- [ ] author-chat route runs `processContext` pre-stream; emits `event: context` SSE
- [ ] Settings extended with `contextManager` + budget override (UI dropdown)
- [ ] Frontend status bar polls debug endpoint; tier color reflects
- [ ] Compact event notices render inline in AuthorChat
- [ ] Breaker reset endpoint works; UI button triggers it
- [ ] Total server test count ≥ 350 (Memory v2 + Context Manager combined)

## Known Limitations (Out of Scope)

- **Tiktoken precise counting**: char/2.5 estimate is enough; `usage.total_tokens` from SDK is the authoritative source
- **Prompt cache active management**: SDK default behavior
- **Chapter-aware decay** (decay previous chapter's tool calls when Agent switches chapter): Phase 3+
- **User-editable tier boundaries in UI**: schema supports `contextBudgetCustom`; UI only exposes mode dropdown for Phase 2
- **Cross-session summary consolidation**: each compact writes an independent `session_summary.md`, no merging
- **Tool-call args-level caching** (redis cache for read_file): out of Context Manager scope

## Dependency

- **Memory v2 plan MUST be completed first** — this plan's cold-compact writes to `session_summaries/*.md` via Memory v2's `writeMemory`. Do not execute this plan before Memory v2 plan's Task 2 (memory-service.ts).

