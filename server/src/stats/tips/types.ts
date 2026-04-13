/**
 * Shared types + helpers for tip rules.
 *
 * Each rule is a function (RuleContext) => ToolHooks. The context carries
 * book identity, per-stream tool-call tracking (so rules can ask "did the
 * agent call X earlier in this turn?"), a dedup set so each rule fires at
 * most once per stream per key, and the SSE emitter.
 */
import { type ToolHooks } from '../../tools/base-tool.js'

export type TipSeverity = 'info' | 'warning'

export interface TipEvent {
  type: 'tip'
  rule: string
  severity: TipSeverity
  title: string
  message: string
}

export type TipEmit = (e: TipEvent) => void

export interface RuleContext {
  dataDir: string
  bookId: string
  /** name → number of completed calls in THIS stream */
  callsThisStream: Map<string, number>
  /** name → most recent args of the last completed call in this stream */
  lastArgs: Map<string, any>
  /** rule keys already fired in this stream */
  emitted: Set<string>
  emit: TipEmit
}

export type TipRule = (ctx: RuleContext) => ToolHooks

/** Emit a tip at most once per stream for a given key. */
export function fireOnce(
  ctx: RuleContext,
  rule: string,
  payload: Omit<TipEvent, 'type' | 'rule'>,
): void {
  if (ctx.emitted.has(rule)) return
  ctx.emitted.add(rule)
  ctx.emit({ type: 'tip', rule, ...payload })
}
