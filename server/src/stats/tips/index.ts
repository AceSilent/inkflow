/**
 * Tip hooks — composed bundle of UI-facing reminder rules.
 *
 * Architecture: each rule is a small ToolHooks-returning factory under
 * stats/tips/. They share a RuleContext that tracks per-stream tool calls
 * (so rules can ask "did the agent X earlier in this turn?") and a dedup
 * set (so each rule fires at most once per stream per key).
 *
 * Adding a new rule: drop a file under stats/tips/, export a (ctx) =>
 * ToolHooks function, and register it in the composeHooks call below.
 */
import { composeHooks, type ToolHooks } from '../../tools/base-tool.js'
import { type RuleContext, type TipEmit } from './types.js'
import { exemplarBeforeDraft } from './exemplar-before-draft.js'
import { readOutlineBeforeSave } from './read-outline-before-save.js'
import { reviewPrevChapter } from './review-prev-chapter.js'

export type { TipEvent, TipEmit, TipSeverity } from './types.js'

export function createTipHooks(dataDir: string, bookId: string, emit: TipEmit): ToolHooks {
  const ctx: RuleContext = {
    dataDir,
    bookId,
    callsThisStream: new Map(),
    lastArgs: new Map(),
    emitted: new Set(),
    emit,
  }

  // Session tracker — keeps callsThisStream / lastArgs current so rules can
  // reason about ordering within the current stream. Runs first in the chain.
  const sessionTracker: ToolHooks = {
    afterToolCall(name, args) {
      ctx.callsThisStream.set(name, (ctx.callsThisStream.get(name) ?? 0) + 1)
      ctx.lastArgs.set(name, args)
    },
  }

  return composeHooks(
    sessionTracker,
    exemplarBeforeDraft(ctx),
    readOutlineBeforeSave(ctx),
    reviewPrevChapter(ctx),
  )
}
