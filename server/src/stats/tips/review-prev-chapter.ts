/**
 * Rule: drafting chapter N requires chapter N-1 to be explicitly approved by
 * the human user in the workbench.
 *
 * Trigger: beforeToolCall + interceptToolCall save_draft, where the file_path
 *          basename matches /^ch(\d+)$/i.
 * Block:   when chapter_status_ch{N-1}.json is missing OR user_decision !== approved.
 *
 * The rule emits a tip for UI visibility AND blocks the actual save_draft —
 * the agent receives a "[BLOCKED] ..." message as the tool result and is
 * expected to ask the user for a pre/post-review decision before retrying.
 *
 * Each prev-chapter check uses its own rule key (review_prev_ch{N-1}) so the
 * tip re-arms when the agent moves on to a new chapter.
 */
import fs from 'fs'
import path from 'path'
import { type ToolHooks, type BlockedToolCall } from '../../tools/base-tool.js'
import { type RuleContext, fireOnce } from './types.js'

interface PrevCheck {
  prevId: string
  reviewPath: string
  reviewExists: boolean
  passed: boolean
  /** Human approval via chapter_status_{prevId}.json is now the only chapter-advance gate. */
  userDecision: 'approved' | 'rejected' | null
}

function checkPrevChapter(ctx: RuleContext, args: any): PrevCheck | null {
  const filePath = args?.file_path
  if (typeof filePath !== 'string') return null
  const baseName = filePath.replace(/^.*[\/\\]/, '').replace(/\.(md|txt|markdown)$/i, '')
  const m = baseName.match(/^ch(\d+)$/i)
  if (!m) return null
  const num = parseInt(m[1], 10)
  if (!Number.isFinite(num) || num <= 1) return null

  const padded = String(num - 1).padStart(m[1].length, '0')
  const prevId = `ch${padded}`
  const bookDir = path.join(ctx.dataDir, ctx.bookId)

  // User manual override wins over review file.
  let userDecision: 'approved' | 'rejected' | null = null
  const statusFile = path.join(bookDir, '04_Drafts', `chapter_status_${prevId}.json`)
  if (fs.existsSync(statusFile)) {
    try {
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'))
      if (status?.user_decision === 'approved' || status?.user_decision === 'rejected') {
        userDecision = status.user_decision
      }
    } catch {
      // bad JSON — fall through to blocked state
    }
  }

  const reviewPath = path.join(bookDir, '04_Drafts', `review_${prevId}.json`)
  if (!fs.existsSync(reviewPath)) {
    return { prevId, reviewPath, reviewExists: false, passed: false, userDecision }
  }
  try {
    const json = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'))
    return {
      prevId,
      reviewPath,
      reviewExists: true,
      passed: json?.overall_pass === true,
      userDecision,
    }
  } catch {
    return { prevId, reviewPath, reviewExists: true, passed: false, userDecision }
  }
}

export function reviewPrevChapter(ctx: RuleContext): ToolHooks {
  return {
    beforeToolCall(name, args) {
      if (name !== 'save_draft') return
      const check = checkPrevChapter(ctx, args)
      if (!check) return
      // Human approval is the only way to advance to the next chapter.
      if (check.userDecision === 'approved') return
      if (check.userDecision === 'rejected') {
        fireOnce(ctx, `review_prev_${check.prevId}`, {
          severity: 'warning',
          title: `${check.prevId} 被用户手动拒绝，已拦截`,
          message: `前一章 ${check.prevId} 被用户手动拒绝。请修订后重新提交审核或取得用户通过，再写下一章。`,
        })
        return
      }
      // Tip is informational — the actual block happens in interceptToolCall.
      const why = !check.reviewExists
        ? `${check.prevId} 没有 review 文件`
        : check.passed
          ? `${check.prevId} 机器慢审已通过，但仍未取得人类通过`
          : `${check.prevId} 机器慢审未通过`
      fireOnce(ctx, `review_prev_${check.prevId}`, {
        severity: 'warning',
        title: `${check.prevId} 未获人类通过，已拦截`,
        message: `${why}。请在工作台由人类直接通过，或慢审后终审通过，再写下一章。`,
      })
    },
    interceptToolCall(name, args): BlockedToolCall | undefined {
      if (name !== 'save_draft') return
      const check = checkPrevChapter(ctx, args)
      if (!check) return
      // Human approval is the only way to advance to the next chapter.
      if (check.userDecision === 'approved') return
      if (check.userDecision === 'rejected') {
        return {
          block: true,
          message: `[BLOCKED] 前一章 ${check.prevId} 被用户手动拒绝，请修订后重新提交审核或取得用户通过。`,
        }
      }
      const why = !check.reviewExists
        ? `${check.prevId} 尚未取得人类通过`
        : check.passed
          ? `${check.prevId} 机器慢审已通过，但仍未取得人类终审通过`
          : `${check.prevId} 机器慢审未通过，且未取得人类通过`
      return {
        block: true,
        message: [
          `不允许写本章：${why}。`,
          `请让人类在工作台直接通过 ${check.prevId}，或先走设定/逻辑慢审后由人类终审通过。`,
        ].join('\n'),
      }
    },
  }
}
