/**
 * Agent Loop — Single-agent runtime using Vercel AI SDK.
 *
 * This replaces the entire Python while-loop + _dispatch_tool chain.
 * Vercel AI SDK's `maxSteps` handles the tool cycling automatically:
 *   User message → LLM → tool_call → execute → inject result → LLM → ... → final text
 *
 * Architecture inspired by Claude Code's query.ts:
 *   - Generator-based streaming for real-time response
 *   - AbortSignal support for user cancellation
 *   - Mode-aware prompt selection
 *   - Rich ToolContext propagation
 */
import path from 'path'
import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { composeHooks, type ToolRegistry, type ToolContext, type ToolHooks, type BlockedToolCall, type ToolProgressEvent } from '../tools/base-tool.js'
import { buildAuthorPrompt, buildBrainstormPrompt, buildGameScriptPrompt, buildPlotGraphStatus, buildStyleProfileStatus } from './prompt-builder.js'
import { buildCreativeStagePrompt } from './creative-stage.js'
import { type LLMConfig, type ProviderProgressCallback, createProvider } from '../llm/provider.js'
import { blockWhileUserEditing } from '../stats/tips/block-while-user-editing.js'

/**
 * Adapter: wraps the plan-shaped `blockWhileUserEditing` hook
 * ({ interceptToolCall({toolName, args}) => Promise<string | null> })
 * into our ToolHooks composition (interceptToolCall(name, args, ctx) =>
 * BlockedToolCall | null). Registered alongside reviewPrevChapter (which
 * lives in stats/tips/index.ts and is composed at the route level).
 */
function blockWhileUserEditingHook(bookId: string, dataDir: string): ToolHooks {
  const inner = blockWhileUserEditing(path.join(dataDir, bookId))
  return {
    async interceptToolCall(name, args): Promise<BlockedToolCall | null> {
      const msg = await inner.interceptToolCall?.({ toolName: name, args })
      if (msg) return { block: true, message: msg }
      return null
    },
  }
}

/** Minimal shape of the streamText result used by callers (SSE route + Feishu bridge). */
export interface AgentStreamResult {
  fullStream: AsyncIterable<any>
  text: PromiseLike<string>
  usage: PromiseLike<any>
}

export interface AgentRunOptions {
  bookId: string
  dataDir: string
  userMessage: string
  history: ModelMessage[]
  llmConfig: LLMConfig
  toolRegistry: ToolRegistry
  memoryContext?: string
  maxSteps?: number
  mode?: string
  /** AbortSignal for cancelling the stream */
  abortSignal?: AbortSignal
  /** Observation hooks fired around each tool call (stats, audit, etc.) */
  hooks?: ToolHooks
  /** Provider-level progress callback (currently used for retry-with-backoff events). */
  onProgress?: ProviderProgressCallback
  /** Long-running tool internals can report progress here. */
  onToolProgress?: (event: ToolProgressEvent) => void | Promise<void>
}

/**
 * Build the appropriate system prompt based on mode.
 */
function selectPrompt(
  mode: string | undefined,
  memoryContext?: string,
  toolSummary?: string,
  plotLedger?: string,
  styleProfile?: string,
  creativeStage?: string,
): string {
  const ctx = { memory: memoryContext, toolSummary, plotLedger, styleProfile, creativeStage }
  if (mode === 'brainstorm') return buildBrainstormPrompt(ctx)
  if (mode === 'game_script') return buildGameScriptPrompt(ctx)
  return buildAuthorPrompt(ctx)
}

/**
 * Run the Author Agent loop.
 *
 * Returns a Vercel AI SDK StreamTextResult with fullStream, text, etc.
 * Supports AbortSignal for user cancellation.
 */
export function runAgentStream(options: AgentRunOptions): AgentStreamResult {
  const {
    bookId, dataDir, userMessage, history,
    llmConfig, toolRegistry, memoryContext,
    maxSteps = 20,
    mode,
    abortSignal,
    hooks,
    onProgress,
    onToolProgress,
  } = options

  const toolSummary = toolRegistry.getToolSummary()
  // Plot ledger: read once per turn so Author sees outstanding setups in the
  // system prompt. `currentChapter` is not tracked at this layer — the ledger
  // still renders; only the "距今 N 章" span is elided.
  const bookDir = path.join(dataDir, bookId)
  const plotLedger = buildPlotGraphStatus(bookDir)
  const styleProfile = buildStyleProfileStatus(bookDir)
  const creativeStage = buildCreativeStagePrompt(bookDir)
  const systemPrompt = selectPrompt(mode, memoryContext, toolSummary, plotLedger, styleProfile, creativeStage)
  const model = createProvider(llmConfig, onProgress)
  const ctx: ToolContext = { bookId, dataDir, mode, emitProgress: onToolProgress }

  const messages: ModelMessage[] = [
    ...history,
    { role: 'user' as const, content: userMessage },
  ]

  // Always compose in block-while-user-editing so Agent save_draft is gated
  // on the workbench lock regardless of which route invokes the agent loop.
  const composedHooks = composeHooks(blockWhileUserEditingHook(bookId, dataDir), hooks)

  return streamText({
    model,
    system: systemPrompt,
    messages,
    tools: toolRegistry.toVercelTools(ctx, composedHooks),
    stopWhen: stepCountIs(maxSteps),
    temperature: 0.7,
    abortSignal,
    // Retry is owned by our fetch wrapper (provider.ts) so we can surface
    // backoff events to the UI; disable AI SDK's own retry to avoid stacking.
    maxRetries: 0,
    // Explicitly request parallel tool calls at the provider level. OpenAI
    // defaults parallel_tool_calls=true, but OpenAI-compatible providers
    // (DeepSeek, DashScope, ZhipuAI GLM etc.) have varied defaults — passing
    // true keeps the behavior uniform. Vercel AI SDK v6 then executes the
    // emitted tool_use blocks concurrently within a single step.
    providerOptions: { openai: { parallelToolCalls: true } },
  })
}
