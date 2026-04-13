/**
 * Rule: drafting chapter N when chapter N-1 has no review on file.
 *
 * Trigger: beforeToolCall save_draft with chapter_id matching /^ch(\d+)$/i
 * Check  : 04_Drafts/review_ch{N-1}.json doesn't exist
 *
 * Each prev-chapter check fires under its own rule key
 * (`review_prev_ch{N-1}`) so the rule re-arms when the agent moves on
 * to the next chapter — writing ch02 can fire once for ch01, then ch03
 * can fire once for ch02, etc.
 */
import fs from 'fs'
import path from 'path'
import { type ToolHooks } from '../../tools/base-tool.js'
import { type RuleContext, fireOnce } from './types.js'

export function reviewPrevChapter(ctx: RuleContext): ToolHooks {
  return {
    beforeToolCall(name, args) {
      if (name !== 'save_draft') return
      const chapterId = args?.chapter_id
      if (typeof chapterId !== 'string') return
      const m = chapterId.match(/^ch(\d+)$/i)
      if (!m) return
      const num = parseInt(m[1], 10)
      if (!Number.isFinite(num) || num <= 1) return

      // Preserve zero-padding from the original ID (ch01 → prev ch00... wait, ch01 is base case).
      const padded = String(num - 1).padStart(m[1].length, '0')
      const prevId = `ch${padded}`
      const reviewPath = path.join(ctx.dataDir, ctx.bookId, '04_Drafts', `review_${prevId}.json`)
      if (fs.existsSync(reviewPath)) return

      fireOnce(ctx, `review_prev_${prevId}`, {
        severity: 'warning',
        title: `${prevId} 还未审稿`,
        message: `准备写 ${chapterId}，但 ${prevId} 没有 review 文件。建议先 submit_to_editorial 给 ${prevId} 走一轮审稿，确保上一章质量过关再继续。`,
      })
    },
  }
}
