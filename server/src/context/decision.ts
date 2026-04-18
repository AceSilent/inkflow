/**
 * Context Decision — top-level "evaluate + act" function for the context manager.
 *
 * Combines all T1–T7 primitives (model window detection, budget tiers, zone
 * partitioning, tool-result decay, cold-segment compaction, circuit breaker,
 * session state) into a single async entry point consumed by the author-chat
 * SSE route. Produces a structured ContextDecision record for logging + UI.
 *
 * Flow:
 *   1. Look up the model's context window and classify current token usage
 *      into a budget tier (green / yellow / orange / red).
 *   2. If mode=disabled or tier=green (action=none), return messages unchanged.
 *   3. For yellow+ tiers, run decayToolResults on the warm zone.
 *   4. For orange+ tiers, and only when mode=auto AND the breaker is not
 *      tripped, attempt cold-segment compaction. Success/failure is recorded
 *      against the circuit breaker so repeated compact LLM failures auto-disable
 *      the expensive path without user intervention.
 */
import type { ModelMessage } from 'ai'
import type { LLMConfig } from '../llm/provider.js'
import { evaluateBudgetTier, getModelContextWindow } from './model-window.js'
import { zoneByTokens, type ZoneBoundaries } from './zones.js'
import { decayToolResults } from './decay.js'
import { compactColdSegment } from './cold-compact.js'
import { loadBreakerState, recordFailure, recordSuccess } from './circuit-breaker.js'
import type { SessionState } from './session-state.js'

export type ContextMode = 'auto' | 'decay_only' | 'disabled'

export interface ContextDecision {
  tier: 'green' | 'yellow' | 'orange' | 'red'
  tokensUsed: number
  windowSize: number
  ratio: number
  action: 'none' | 'decay_tool_results' | 'decay_and_cold_compact' | 'force_compact_and_warn'
  decayedCount: number
  compactedCount: number
  breakerTripped: boolean
}

export interface ProcessContextInput {
  messages: ModelMessage[]
  model: string
  lastUsage: { total_tokens?: number } | undefined
  sessionState: SessionState
  bookDir: string
  llmConfig: LLMConfig
  mode: ContextMode
  boundaries?: ZoneBoundaries
}

export async function processContext(
  input: ProcessContextInput,
): Promise<{ newMessages: ModelMessage[]; decision: ContextDecision }> {
  const windowSize = getModelContextWindow(input.model)
  const tokens = input.lastUsage?.total_tokens ?? 0
  const tier = evaluateBudgetTier(tokens, windowSize)

  const decision: ContextDecision = {
    tier: tier.name,
    tokensUsed: tokens,
    windowSize,
    ratio: tier.ratio,
    action: input.mode === 'disabled' ? 'none' : tier.action,
    decayedCount: 0,
    compactedCount: 0,
    breakerTripped: false,
  }

  if (input.mode === 'disabled' || decision.action === 'none') {
    return { newMessages: input.messages, decision }
  }

  const breakerState = loadBreakerState(input.bookDir)
  decision.breakerTripped = breakerState.tripped

  let messages = input.messages

  if (decision.action === 'decay_tool_results'
      || decision.action === 'decay_and_cold_compact'
      || decision.action === 'force_compact_and_warn') {
    const zones = zoneByTokens(messages, input.boundaries)
    const before = messages
    messages = decayToolResults(messages, zones)
    // Count decays: any message that was mutated by decay is a new reference.
    decision.decayedCount = messages.filter((m, i) => m !== before[i]).length
  }

  const allowCompact = input.mode === 'auto' && !breakerState.tripped
  if (allowCompact && (decision.action === 'decay_and_cold_compact' || decision.action === 'force_compact_and_warn')) {
    try {
      const zones = zoneByTokens(messages, input.boundaries)
      if (zones.cold.length > 0) {
        const result = await compactColdSegment({
          cold: zones.cold,
          warm: zones.warm,
          hot: zones.hot,
          sessionState: input.sessionState,
          llmConfig: input.llmConfig,
          bookDir: input.bookDir,
        })
        messages = result.newMessages
        decision.compactedCount = result.stats.compacted
        recordSuccess(input.bookDir)
      }
    } catch (e) {
      recordFailure(input.bookDir)
      decision.breakerTripped = loadBreakerState(input.bookDir).tripped
      console.warn('[context] cold compact failed:', e)
    }
  }

  return { newMessages: messages, decision }
}
