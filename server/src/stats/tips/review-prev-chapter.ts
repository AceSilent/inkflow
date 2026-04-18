/**
 * Rule: drafting chapter N requires chapter N-1 to have been submitted to
 * editorial AND passed (overall_pass === true).
 *
 * Trigger: beforeToolCall + interceptToolCall save_draft, where the file_path
 *          basename matches /^ch(\d+)$/i.
 * Block:   when 04_Drafts/review_ch{N-1}.json is missing OR overall_pass !== true.
 *
 * The rule emits a tip for UI visibility AND blocks the actual save_draft —
 * the agent receives a "[BLOCKED] ..." message as the tool result and is
 * expected to call submit_to_editorial on ch{N-1} before retrying.
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
  /** User manual override via chapter_status_{prevId}.json; takes priority over review file. */
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
      // bad JSON — fall through to review-file logic
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
      // User override: approved → allow (no tip); rejected → emit rejection tip.
      if (check.userDecision === 'approved') return
      if (check.userDecision === 'rejected') {
        fireOnce(ctx, `review_prev_${check.prevId}`, {
          severity: 'warning',
          title: `${check.prevId} 被用户手动拒绝，已拦截`,
          message: `前一章 ${check.prevId} 被用户手动拒绝。请修订后重新提交审核或取得用户通过，再写下一章。`,
        })
        return
      }
      if (check.passed) return
      // Tip is informational — the actual block happens in interceptToolCall.
      const why = !check.reviewExists
        ? `${check.prevId} 没有 review 文件`
        : `${check.prevId} 审稿未通过 (overall_pass=false)`
      fireOnce(ctx, `review_prev_${check.prevId}`, {
        severity: 'warning',
        title: `${check.prevId} 未通过审稿，已拦截`,
        message: `${why}。先 submit_to_editorial 给 ${check.prevId} 走一轮审稿并通过，再写下一章。`,
      })
    },
    interceptToolCall(name, args): BlockedToolCall | undefined {
      if (name !== 'save_draft') return
      const check = checkPrevChapter(ctx, args)
      if (!check) return
      // User manual override wins over the review file.
      if (check.userDecision === 'approved') return
      if (check.userDecision === 'rejected') {
        return {
          block: true,
          message: `[BLOCKED] 前一章 ${check.prevId} 被用户手动拒绝，请修订后重新提交审核或取得用户通过。`,
        }
      }
      if (check.passed) return
      const why = !check.reviewExists
        ? `${check.prevId} 还没有 review 文件（尚未审稿）`
        : `${check.prevId} 审稿未通过（overall_pass=false）`
      return {
        block: true,
        message: [
          `不允许写本章：${why}。`,
          `请先调用 submit_to_editorial({ chapter_id: '${check.prevId}', draft_text: <ch01 内容> })`,
          `走一轮审稿。等 ${check.prevId} 的 review_${check.prevId}.json 中 overall_pass=true 之后再来 save_draft。`,
        ].join('\n'),
      }
    },
  }
}
