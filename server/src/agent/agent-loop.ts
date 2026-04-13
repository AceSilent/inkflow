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
import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { type ToolRegistry, type ToolContext, type ToolHooks } from '../tools/base-tool.js'
import { buildAuthorPrompt, buildBrainstormPrompt } from './prompt-builder.js'
import { type LLMConfig, type ProviderProgressCallback, createProvider } from '../llm/provider.js'

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
}

/**
 * Build the appropriate system prompt based on mode.
 */
function selectPrompt(mode: string | undefined, memoryContext?: string, toolSummary?: string): string {
  const ctx = { memory: memoryContext, toolSummary }
  return mode === 'brainstorm'
    ? buildBrainstormPrompt(ctx)
    : buildAuthorPrompt(ctx)
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
  } = options

  const toolSummary = toolRegistry.getToolSummary()
  const systemPrompt = selectPrompt(mode, memoryContext, toolSummary)
  const model = createProvider(llmConfig, onProgress)
  const ctx: ToolContext = { bookId, dataDir, mode }

  const messages: ModelMessage[] = [
    ...history,
    { role: 'user' as const, content: userMessage },
  ]

  return streamText({
    model,
    system: systemPrompt,
    messages,
    tools: toolRegistry.toVercelTools(ctx, hooks),
    stopWhen: stepCountIs(maxSteps),
    temperature: 0.7,
    abortSignal,
    // Retry is owned by our fetch wrapper (provider.ts) so we can surface
    // backoff events to the UI; disable AI SDK's own retry to avoid stacking.
    maxRetries: 0,
  })
}
