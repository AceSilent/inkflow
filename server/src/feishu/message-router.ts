/**
 * Message Router — receives Feishu events, deduplicates, parses, and dispatches.
 */
import { FeishuClient } from './client.js'
import { parseCommand, handleCommand } from './commands.js'
import { resolveBookId, resolveSessionKey, setSession } from './session.js'
import { handleAgentChat } from './agent-bridge.js'
import { type FeishuConfig } from './types.js'
import { getSettings } from '../routes/settings.js'
import { type LLMConfig } from '../llm/provider.js'

// Dedup incoming messages (Feishu may re-push within 3s)
const processedMessages = new Map<string, number>()
const DEDUP_TTL = 30_000 // 30s

// Active chats to prevent concurrent agent runs for the same chat
const activeChats = new Set<string>()

function cleanupDedup(): void {
  const now = Date.now()
  for (const [id, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL) processedMessages.delete(id)
  }
}

function loadLLMConfig(): { llmConfig: LLMConfig; dataDir: string } {
  const dataDir = process.env.AUTONOVEL_DATA_DIR || 'books'
  const settings = getSettings(dataDir)
  const modelSelector = settings.authorModel || ''

  if (modelSelector.includes('/')) {
    const [providerId, ...modelParts] = modelSelector.split('/')
    const model = modelParts.join('/')
    const provider = settings.providers.find(p => p.id === providerId)
    if (provider) {
      return { llmConfig: { apiKey: provider.apiKey, baseURL: provider.baseUrl, model }, dataDir }
    }
  }

  return {
    llmConfig: {
      apiKey: process.env.LLM_API_KEY || '',
      baseURL: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL || 'gpt-4o',
    },
    dataDir,
  }
}

export function createMessageHandler(feishuClient: FeishuClient) {
  return async (event: any): Promise<void> => {
    // Periodic dedup cleanup
    cleanupDedup()

    const msgId = event.message.message_id as string
    if (processedMessages.has(msgId)) return
    processedMessages.set(msgId, Date.now())

    // Ignore bot's own messages
    if (event.sender.sender_type === 'app') return

    const chatId = event.message.chat_id as string
    const openId = event.sender.sender_id.open_id as string
    const msgType = event.message.message_type as string

    // Only handle text messages
    if (msgType !== 'text') {
      await feishuClient.sendText(chatId, '目前仅支持文本消息。')
      return
    }

    // Extract text content
    let userText = ''
    try {
      const content = JSON.parse(event.message.content)
      userText = (content.text || '').trim()
    } catch {
      return
    }
    if (!userText) return

    const dataDir = process.env.AUTONOVEL_DATA_DIR || 'books'
    const { key: sessionKey, type: sessionType } = resolveSessionKey(event)

    // Check if command
    const parsed = parseCommand(userText)
    if (parsed) {
      const result = await handleCommand(parsed.command, parsed.args, {
        dataDir, chatId, openId, sessionKey,
      })
      switch (result.type) {
        case 'text':
          await feishuClient.sendText(chatId, result.content)
          break
        case 'card':
          await feishuClient.sendCard(chatId, result.cardJson)
          break
      }
      return
    }

    // Free text = chat with Agent
    const bookId = resolveBookId(dataDir, sessionKey)
    if (!bookId) {
      await feishuClient.sendText(chatId, '请先选择一个项目。发送 /list 查看项目列表，或 /create <标题> 创建项目。')
      return
    }

    // Prevent concurrent agent runs for the same chat
    if (activeChats.has(chatId)) {
      await feishuClient.sendText(chatId, 'Agent 正在处理上一条消息，请稍候...')
      return
    }

    activeChats.add(chatId)
    try {
      const { llmConfig } = loadLLMConfig()
      await handleAgentChat(feishuClient, chatId, userText, bookId, dataDir, llmConfig)
    } finally {
      activeChats.delete(chatId)
    }
  }
}
