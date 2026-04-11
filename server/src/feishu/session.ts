/**
 * Feishu session mapping — maps Feishu user/group to a bookId.
 * Persists to books/feishu_sessions.json.
 */
import fs from 'fs'
import path from 'path'
import { type FeishuSession } from './types.js'

const SESSION_FILE = 'feishu_sessions.json'

function sessionPath(dataDir: string): string {
  return path.join(dataDir, SESSION_FILE)
}

function ensureDataDir(dataDir: string): void {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
}

export function loadSessions(dataDir: string): Record<string, FeishuSession> {
  const p = sessionPath(dataDir)
  if (!fs.existsSync(p)) return {}
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return {}
  }
}

function saveSessions(dataDir: string, sessions: Record<string, FeishuSession>): void {
  ensureDataDir(dataDir)
  fs.writeFileSync(sessionPath(dataDir), JSON.stringify(sessions, null, 2), 'utf-8')
}

export function getSession(dataDir: string, key: string): FeishuSession | null {
  const sessions = loadSessions(dataDir)
  return sessions[key] || null
}

export function setSession(dataDir: string, key: string, session: FeishuSession): void {
  const sessions = loadSessions(dataDir)
  sessions[key] = { ...session, lastActiveAt: new Date().toISOString() }
  saveSessions(dataDir, sessions)
}

export function resolveBookId(dataDir: string, key: string): string | null {
  const session = getSession(dataDir, key)
  return session?.currentBookId || null
}

/**
 * Determine session key from a Feishu message event.
 * Group chats use chat_id, personal chats use open_id.
 */
export function resolveSessionKey(event: {
  message: { chat_type: string; chat_id: string }
  sender: { sender_id: { open_id: string } }
}): { key: string; type: 'user' | 'group' } {
  if (event.message.chat_type === 'group') {
    return { key: `group:${event.message.chat_id}`, type: 'group' }
  }
  return { key: `user:${event.sender.sender_id.open_id}`, type: 'user' }
}
