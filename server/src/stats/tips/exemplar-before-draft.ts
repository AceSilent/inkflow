/**
 * Rule: writing chapter content without ever having studied exemplars.
 *
 * Trigger: beforeToolCall save_script
 * Check  : agent_stats.json shows load_skill('exemplar_study') was never called
 *          for this book (cross-session — once you've studied once, the rule rests)
 */
import { type ToolHooks } from '../../tools/base-tool.js'
import { loadStats } from '../tool-stats.js'
import { type RuleContext, fireOnce } from './types.js'

export function exemplarBeforeDraft(ctx: RuleContext): ToolHooks {
  return {
    beforeToolCall(name) {
      if (name !== 'save_script') return
      const stats = loadStats(ctx.dataDir, ctx.bookId)
      const everLoaded = ((stats['load_skill']?.by_arg ?? {})['exemplar_study'] ?? 0) > 0
      if (everLoaded) return
      fireOnce(ctx, 'exemplar_before_draft', {
        severity: 'warning',
        title: '建议先研读范文',
        message: '正在写正文，但本书还没有调用过 load_skill(exemplar_study)。先研读优秀范文，再下笔会更稳。',
      })
    },
  }
}
