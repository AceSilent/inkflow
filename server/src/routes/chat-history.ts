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
    return raw
      .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content || '',
      }))
      .slice(-20)
  } catch {
    return []
  }
}

export function saveHistory(dataDir: string, bookId: string, messages: ModelMessage[]): void {
  const p = historyPath(dataDir, bookId)
  const trimmed = messages.slice(-50)
  fs.writeFileSync(p, JSON.stringify(trimmed, null, 2), 'utf-8')
}
