/**
 * Shared chat history functions — used by both SSE route and Feishu bot.
 * Persists to books/{bookId}/author_chat_history.json (max 50 messages).
 */
import fs from 'fs'
import path from 'path'
import { type ModelMessage } from 'ai'

export function historyPath(dataDir: string, bookId: string): string {
  const dir = path.join(dataDir, bookId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'author_chat_history.json')
}

export function loadHistory(dataDir: string, bookId: string): ModelMessage[] {
  const p = historyPath(dataDir, bookId)
  if (!fs.existsSync(p)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    // Preserve every field on each message — UI metadata (thinking,
    // segments, status, attachments) is needed by the history endpoint for
    // replay rendering. The author-chat send route does its own stripping
    // before feeding messages back to the LLM, so we don't strip here.
    return raw
      .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
      .slice(-20) as ModelMessage[]
  } catch {
    return []
  }
}

export function saveHistory(dataDir: string, bookId: string, messages: ModelMessage[]): void {
  const p = historyPath(dataDir, bookId)
  const trimmed = messages.slice(-50)
  fs.writeFileSync(p, JSON.stringify(trimmed, null, 2), 'utf-8')
}
