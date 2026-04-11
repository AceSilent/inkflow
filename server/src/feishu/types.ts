/**
 * Feishu module shared types.
 */

export interface FeishuConfig {
  appId: string
  appSecret: string
  encryptKey?: string
  verificationToken?: string
  domain: 'feishu' | 'lark'
  mode: 'ws' | 'webhook'
}

export interface FeishuSession {
  type: 'user' | 'group'
  openId?: string
  chatId?: string
  currentBookId: string | null
  lastActiveAt: string
}

export interface CommandContext {
  dataDir: string
  chatId: string
  openId: string
  sessionKey: string
}

export type CommandResult =
  | { type: 'text'; content: string }
  | { type: 'card'; cardJson: Record<string, unknown> }
  | { type: 'none' }
