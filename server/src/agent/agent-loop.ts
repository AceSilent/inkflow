/**
 * Agent Loop — Single-agent runtime using Vercel AI SDK.
 *
 * This replaces the entire Python while-loop + _dispatch_tool chain.
 * Vercel AI SDK's `maxSteps` handles the tool cycling automatically:
 *   User message → LLM → tool_call → execute → inject result → LLM → ... → final text
 */
import { streamText, type CoreMessage } from 'ai'
import { type ToolRegistry } from '../tools/base-tool.js'
import { buildAuthorPrompt } from './prompt-builder.js'
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
}

/**
 * Run the Author Agent loop.
 *
 * Returns a Vercel AI SDK StreamTextResult with fullStream, text, etc.
 */
export function runAgentStream(options: AgentRunOptions) {
  const {
    bookId, dataDir, userMessage, history,
    llmConfig, toolRegistry, memoryContext,
    maxSteps = 20,
  } = options

  const systemPrompt = buildAuthorPrompt({ memory: memoryContext })
  const model = createProvider(llmConfig)
  const ctx = { bookId, dataDir }

  const messages: CoreMessage[] = [
    ...history,
    { role: 'user' as const, content: userMessage },
  ]

  return streamText({
    model,
    system: systemPrompt,
    messages,
    tools: toolRegistry.toVercelTools(ctx),
    maxSteps,
    temperature: 0.7,
  })
}
