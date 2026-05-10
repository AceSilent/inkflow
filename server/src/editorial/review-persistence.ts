import path from 'path'
import { ensureDir, safeReadJson, writeJson } from '../utils/file-io.js'
import {
  DEFAULT_MAX_AUTO_REVISION_ROUNDS,
  buildMergedSummary,
  buildRevisionStrategy,
  type EditorialResult,
} from './pipeline.js'

export const STUCK_ROUND_THRESHOLD = 3

export interface IssueHistoryEntry {
  first_seen_round: number
  count: number
}

export type IssueHistory = Record<string, IssueHistoryEntry>

export interface PersistResult {
  revision_round: number
  persistent_issues: Array<{ fingerprint: string; count: number; first_seen_round: number }>
}

export function reviewPathFor(bookDir: string, chapterId: string): string {
  return path.join(ensureDir(path.join(bookDir, '04_Drafts')), `review_${chapterId}.json`)
}

export function readPreviousReview<T = Partial<EditorialResult> & { feedbacks?: EditorialResult['feedbacks'] }>(
  bookDir: string,
  chapterId: string,
): T | undefined {
  return safeReadJson<T>(reviewPathFor(bookDir, chapterId)) ?? undefined
}

export function issueFingerprint(reviewer: string, issue: { type?: string; quote?: string; fix_instruction?: string }): string {
  const type = issue.type ?? 'unknown'
  const text = (issue.quote ?? issue.fix_instruction ?? '').trim().slice(0, 60)
  return `${reviewer}::${type}::${text}`
}

export function persistReview(
  dataDir: string,
  bookId: string,
  chapterId: string,
  result: EditorialResult,
): PersistResult {
  return persistReviewToDir(path.join(dataDir, bookId), chapterId, result)
}

export function persistReviewToDir(
  bookDir: string,
  chapterId: string,
  result: EditorialResult,
  opts: { resetAutoRevisionBudget?: boolean } = {},
): PersistResult {
  const reviewPath = reviewPathFor(bookDir, chapterId)
  const prev = safeReadJson<{ revision_round?: number; issue_history?: IssueHistory }>(reviewPath)
  const prevRound = !opts.resetAutoRevisionBudget && typeof prev?.revision_round === 'number' ? prev.revision_round : 0
  const prevHistory: IssueHistory = (!opts.resetAutoRevisionBudget && prev?.issue_history && typeof prev.issue_history === 'object')
    ? prev.issue_history
    : {}
  const revision_round = prevRound + 1

  const nextHistory: IssueHistory = {}
  const persistent_issues: PersistResult['persistent_issues'] = []
  for (const fb of result.feedbacks) {
    for (const issue of fb.issues) {
      const fp = issueFingerprint(fb.reviewer, issue)
      const prev = prevHistory[fp]
      const entry: IssueHistoryEntry = prev
        ? { first_seen_round: prev.first_seen_round, count: prev.count + 1 }
        : { first_seen_round: revision_round, count: 1 }
      nextHistory[fp] = entry
      if (entry.count >= STUCK_ROUND_THRESHOLD) {
        persistent_issues.push({ fingerprint: fp, count: entry.count, first_seen_round: entry.first_seen_round })
      }
    }
  }

  result.revision_strategy = buildRevisionStrategy(result.feedbacks, {
    currentRound: revision_round,
    maxAutoRounds: DEFAULT_MAX_AUTO_REVISION_ROUNDS,
    persistentIssues: persistent_issues,
  })
  result.merged_summary = buildMergedSummary(result.feedbacks)

  writeJson(reviewPath, {
    overall_pass: result.overall_pass,
    revision_round,
    revision_strategy: result.revision_strategy,
    review_scope: result.review_scope,
    reviewed_reviewers: result.reviewed_reviewers,
    carried_forward_reviewers: result.carried_forward_reviewers,
    feedbacks: result.feedbacks,
    merged_summary: result.merged_summary,
    issue_history: nextHistory,
    reviewed_at: new Date().toISOString(),
  })

  return { revision_round, persistent_issues }
}
