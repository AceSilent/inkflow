/**
 * Rule: overwriting the outline without first reading it in this turn.
 *
 * Trigger: beforeToolCall save_outline
 * Check  : read_outline (or list_skills/search_lore as proxies) wasn't called
 *          earlier in THIS stream — implies the agent is overwriting blind.
 *
 * Stream-scoped (not cross-session): the agent might have read it last turn,
 * but if it's about to overwrite without re-reading, that's risky enough
 * to nudge.
 */
import { type ToolHooks } from '../../tools/base-tool.js'
import { type RuleContext, fireOnce } from './types.js'

export function readOutlineBeforeSave(ctx: RuleContext): ToolHooks {
  return {
    beforeToolCall(name) {
      if (name !== 'save_outline') return
      const readCount = ctx.callsThisStream.get('read_outline') ?? 0
      if (readCount > 0) return
      fireOnce(ctx, 'read_outline_before_save', {
        severity: 'warning',
        title: '保存大纲前未读取',
        message: '本轮还没有调用 read_outline 就要 save_outline，可能会覆盖未察觉的最新内容。建议先 read_outline 确认现状。',
      })
    },
  }
}
