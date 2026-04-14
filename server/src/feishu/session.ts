/**
 * Feishu session mapping — maps Feishu user/group to a bookId.
 * Persists to books/feishu_sessions.json.
 */
import path from 'path'
import { type FeishuSession } from './types.js'
import { safeReadJson, writeJson } from '../utils/file-io.js'

const SESSION_FILE = 'feishu_sessions.json'

function sessionPath(dataDir: string): string {
  return path.join(dataDir, SESSION_FILE)
}

export function loadSessions(dataDir: string): Record<string, FeishuSession> {
  return safeReadJson<Record<string, FeishuSession>>(sessionPath(dataDir)) ?? {}
}

function saveSessions(dataDir: string, sessions: Record<string, FeishuSession>): void {
  writeJson(sessionPath(dataDir), sessions)
}

export function getSession(dataDir: string, key: string): FeishuSession | null {
  return loadSessions(dataDir)[key] ?? null
}

export function setSession(dataDir: string, key: string, session: FeishuSession): void {
  const sessions = loadSessions(dataDir)
  sessions[key] = { ...session, lastActiveAt: new Date().toISOString() }
  saveSessions(dataDir, sessions)
}

export function resolveBookId(dataDir: string, key: string): string | null {
  return getSession(dataDir, key)?.currentBookId ?? null
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
