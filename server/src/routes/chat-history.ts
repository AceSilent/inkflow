/**
 * Shared chat history functions — used by both SSE route and Feishu bot.
 * Persists to books/{bookId}/author_chat_history.json (max 50 messages).
 */
import path from 'path'
import { type ModelMessage } from 'ai'
import { safeReadJson, ensureDir, writeJson } from '../utils/file-io.js'

export function historyPath(dataDir: string, bookId: string): string {
  return path.join(ensureDir(path.join(dataDir, bookId)), 'author_chat_history.json')
}

export function loadHistory(dataDir: string, bookId: string): ModelMessage[] {
  const raw = safeReadJson<Array<{ role: string }>>(historyPath(dataDir, bookId))
  if (!raw) return []
  // Preserve every field on each message — UI metadata (thinking, segments,
  // status, attachments) is needed by the history endpoint for replay
  // rendering. The author-chat send route does its own stripping before
  // feeding messages back to the LLM, so we don't strip here.
  return raw
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20) as ModelMessage[]
}

export function saveHistory(dataDir: string, bookId: string, messages: ModelMessage[]): void {
  writeJson(historyPath(dataDir, bookId), messages.slice(-50))
}
