/**
 * Session state — tracks recent read-tool results and active skill for cold-compact
 * rendering.
 *
 * NOTE: This is a minimal stub introduced by Task 5 (cold-compact) so cold-compact
 * can import the type + factory without pulling the full T6 implementation.
 * Task 6 expands this file with `updateSessionStateAfterToolCall` and related
 * integration points.
 */

export interface RecentRead {
  tool: string
  args: any
  excerpt: string
  timestamp: number
}

export interface SessionState {
  recentReads: RecentRead[]
  activeSkill: { name: string; body: string } | null
  decayedMessageIds: Set<string>
}

export function createSessionState(): SessionState {
  return {
    recentReads: [],
    activeSkill: null,
    decayedMessageIds: new Set(),
  }
}
