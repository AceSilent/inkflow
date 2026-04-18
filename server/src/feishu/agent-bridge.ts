/**
 * Agent Bridge — connects runAgentStream() to Feishu card streaming.
 * Accumulates text from the Agent and updates a card entity at throttled intervals.
 */
import { runAgentStream } from '../agent/agent-loop.js'
import { createAllTools } from '../tools/index.js'
import { type LLMConfig } from '../llm/provider.js'
import { loadHistoryFull, saveHistory } from '../routes/chat-history.js'
import { FeishuClient } from './client.js'
import { buildAgentStreamingElements } from './card-builder.js'

const THROTTLE_MS = 500

export async function handleAgentChat(
  feishuClient: FeishuClient,
  chatId: string,
  userMessage: string,
  bookId: string,
  dataDir: string,
  llmConfig: LLMConfig,
  mode?: string,
): Promise<void> {
  // 1. Create streaming card
  const elements = buildAgentStreamingElements('正在思考...', [])
  const cardId = await feishuClient.createCardEntity(elements)
  if (!cardId) {
    await feishuClient.sendText(chatId, '创建消息卡片失败，直接回复:')
    // Fallback: accumulate and send as text
    await handleAgentFallback(feishuClient, chatId, userMessage, bookId, dataDir, llmConfig, mode)
    return
  }

  // 2. Send card as message
  await feishuClient.sendCardMessage(chatId, cardId)

  // 3. Run agent
  try {
    const history = loadHistoryFull(dataDir, bookId)
    const toolRegistry = createAllTools()
    const result = runAgentStream({
      bookId, dataDir, userMessage, history, llmConfig, toolRegistry, mode,
    })

    let fullText = ''
    const toolsUsed: string[] = []
    let lastUpdate = 0

    for await (const part of (await result).fullStream) {
      if (part.type === 'text-delta') {
        fullText += part.text
        const now = Date.now()
        if (now - lastUpdate >= THROTTLE_MS) {
          const els = buildAgentStreamingElements(fullText, toolsUsed)
          await feishuClient.updateCardEntity(cardId, els)
          lastUpdate = now
        }
      }
      if (part.type === 'tool-call') {
        toolsUsed.push(part.toolName)
      }
    }

    // 4. Final update
    const finalElements = buildAgentStreamingElements(fullText, toolsUsed)
    await feishuClient.updateCardEntity(cardId, finalElements)

    // 5. Save to shared history
    const updatedHistory = [
      ...history,
      { role: 'user' as const, content: userMessage },
      { role: 'assistant' as const, content: fullText || '(Agent 未生成回复)' },
    ]
    saveHistory(dataDir, bookId, updatedHistory)
  } catch (e: any) {
    console.error('[feishu] agent bridge error:', e.message)
    await feishuClient.updateCardEntity(cardId, buildAgentStreamingElements(
      `Agent 运行出错: ${e.message}`, [],
    ))
  }
}

/** Fallback: accumulate full response and send as text message */
async function handleAgentFallback(
  feishuClient: FeishuClient,
  chatId: string,
  userMessage: string,
  bookId: string,
  dataDir: string,
  llmConfig: LLMConfig,
  mode?: string,
): Promise<void> {
  const history = loadHistoryFull(dataDir, bookId)
  const toolRegistry = createAllTools()
  const result = runAgentStream({
    bookId, dataDir, userMessage, history, llmConfig, toolRegistry, mode,
  })

  let fullText = ''
  for await (const part of (await result).fullStream) {
    if (part.type === 'text-delta') {
      fullText += part.text
    }
  }

  if (fullText) {
    // Split long messages (Feishu limit ~4000 chars per message)
    const chunks = splitMessage(fullText, 3500)
    for (const chunk of chunks) {
      await feishuClient.sendText(chatId, chunk)
    }
  } else {
    await feishuClient.sendText(chatId, '(Agent 未生成回复)')
  }

  const updatedHistory = [
    ...history,
    { role: 'user' as const, content: userMessage },
    { role: 'assistant' as const, content: fullText || '(Agent 未生成回复)' },
  ]
  saveHistory(dataDir, bookId, updatedHistory)
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen))
  }
  return chunks
}
