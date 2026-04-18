/**
 * Session state — tracks recent read-tool results and active skill for cold-compact
 * rendering.
 *
 * Maintains a FIFO buffer of the last 5 read-tool calls (capped excerpts) plus the
 * currently active skill body. Populated via `updateSessionStateAfterToolCall`, which
 * is invoked from the tool-call hook chain in the agent loop.
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

const READ_TOOLS = new Set(['read_file', 'read_outline', 'read_graph', 'search_lore'])

export function createSessionState(): SessionState {
  return {
    recentReads: [],
    activeSkill: null,
    decayedMessageIds: new Set(),
  }
}

export function updateSessionStateAfterToolCall(
  state: SessionState,
  toolName: string,
  args: any,
  result: string,
): void {
  if (READ_TOOLS.has(toolName)) {
    state.recentReads.push({
      tool: toolName,
      args,
      excerpt: result.slice(0, 500),
      timestamp: Date.now(),
    })
    while (state.recentReads.length > 5) state.recentReads.shift()
  }
  if (toolName === 'load_skill') {
    state.activeSkill = { name: args?.name ?? 'unknown', body: result.slice(0, 2000) }
  }
}
