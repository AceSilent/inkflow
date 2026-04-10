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
import { streamText, type CoreMessage } from 'ai'
import { type ToolRegistry, type ToolContext } from '../tools/base-tool.js'
import { buildAuthorPrompt, buildBrainstormPrompt } from './prompt-builder.js'
import { type LLMConfig, createProvider } from '../llm/provider.js'

export interface AgentRunOptions {
  bookId: string
  dataDir: string
  userMessage: string
  history: CoreMessage[]
  llmConfig: LLMConfig
  toolRegistry: ToolRegistry
  memoryContext?: string
  maxSteps?: number
  mode?: string
  /** AbortSignal for cancelling the stream */
  abortSignal?: AbortSignal
}

export interface AgentRunResult {
  fullStream: AsyncIterable<any>
  text: Promise<string>
  usage: Promise<{ promptTokens: number; completionTokens: number }>
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
export function runAgentStream(options: AgentRunOptions): Promise<AgentRunResult> {
  const {
    bookId, dataDir, userMessage, history,
    llmConfig, toolRegistry, memoryContext,
    maxSteps = 20,
    mode,
    abortSignal,
  } = options

  const toolSummary = toolRegistry.getToolSummary()
  const systemPrompt = selectPrompt(mode, memoryContext, toolSummary)
  const model = createProvider(llmConfig)
  const ctx: ToolContext = { bookId, dataDir, mode }

  const messages: CoreMessage[] = [
    ...history,
    { role: 'user' as const, content: userMessage },
  ]

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    tools: toolRegistry.toVercelTools(ctx),
    maxSteps,
    temperature: 0.7,
    abortSignal,
  })

  return result
}
