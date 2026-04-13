/**
 * Tip hooks — fire UI-facing reminders based on tool-call patterns.
 *
 * Currently a single rule: when the agent is about to write chapter content
 * (`save_draft`) but the agent_stats for this book show `load_skill` was
 * never called with `exemplar_study`, push an SSE tip nudging the human to
 * have the agent study exemplars before drafting.
 *
 * Tips are emitted at most once per stream (deduped via closure Set), and
 * the hook is observation-only — it never blocks the tool call.
 */
import { type ToolHooks } from '../tools/base-tool.js'
import { loadStats } from './tool-stats.js'

export type TipSeverity = 'info' | 'warning'
export interface TipEvent {
  type: 'tip'
  rule: string
  severity: TipSeverity
  title: string
  message: string
}
export type TipEmit = (evt: TipEvent) => void

export function createTipHooks(dataDir: string, bookId: string, emit: TipEmit): ToolHooks {
  const sent = new Set<string>()

  const fireOnce = (rule: string, evt: Omit<TipEvent, 'type' | 'rule'>) => {
    if (sent.has(rule)) return
    sent.add(rule)
    emit({ type: 'tip', rule, ...evt })
  }

  return {
    beforeToolCall(name, _args, _ctx) {
      if (name !== 'save_draft') return
      const stats = loadStats(dataDir, bookId)
      const exemplarLoaded = ((stats['load_skill']?.by_arg ?? {})['exemplar_study'] ?? 0) > 0
      if (exemplarLoaded) return
      fireOnce('exemplar_before_draft', {
        severity: 'warning',
        title: '建议先研读范文',
        message: '正在写正文，但本书还没有调用过 load_skill(exemplar_study)。先研读优秀范文，再下笔会更稳。',
      })
    },
  }
}
