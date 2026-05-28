/**
 * Shared chat history functions — used by both SSE route and Feishu bot.
 * Persists to books/{bookId}/author_chat_history.json (max 50 messages).
 */
import path from 'path'
import { randomUUID } from 'crypto'
import { type ModelMessage } from 'ai'
import { safeReadJson, ensureDir, writeJson } from '../utils/file-io.js'

export type ChatHistoryMessage = ModelMessage & {
  id?: string
  checkpoint_id?: string
  status?: string
}

export function historyPath(dataDir: string, bookId: string): string {
  return path.join(ensureDir(path.join(dataDir, bookId)), 'author_chat_history.json')
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')
}

export function createMessageId(date = new Date()): string {
  return `msg_${compactTimestamp(date)}_${randomUUID()}`
}

export function loadHistoryFull(dataDir: string, bookId: string): ChatHistoryMessage[] {
  const raw = safeReadJson<Array<{ role: string }>>(historyPath(dataDir, bookId))
  if (!raw) return []
  // Preserve every field on each message — UI metadata (thinking, segments,
  // status, attachments) is needed by the history endpoint for replay
  // rendering. The author-chat send route does its own stripping before
  // feeding messages back to the LLM, so we don't strip here.
  //
  // No slice here: full history is returned and the ContextManager (token-
  // based zones) is responsible for trimming. saveHistory still caps at 50
  // for disk bloat protection.
  return raw.filter(m => m.role === 'system' || m.role === 'user' || m.role === 'assistant') as ChatHistoryMessage[]
}

// Legacy alias — delete callers progressively
export const loadHistory = loadHistoryFull

export function saveHistory(dataDir: string, bookId: string, messages: ChatHistoryMessage[]): void {
  writeJson(historyPath(dataDir, bookId), messages.slice(-50))
}

export function truncateHistoryAtMessage(
  messages: ChatHistoryMessage[],
  messageId: string,
  replacementContent?: string,
): ChatHistoryMessage[] {
  const index = messages.findIndex(message => message.id === messageId)
  if (index < 0) return messages
  const target = messages[index]
  if (target.role !== 'user') throw new Error(`Message '${messageId}' is not a user message`)

  const truncated = messages.slice(0, index + 1)
  if (replacementContent === undefined) return truncated

  return [
    ...truncated.slice(0, -1),
    { ...target, content: replacementContent },
  ]
}
