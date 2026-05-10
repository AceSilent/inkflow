import {
  DEFAULT_MACHINE_REVIEWERS,
  EDITORIAL_REVIEWERS,
  buildMergedSummary,
  buildRevisionStrategy,
  computeOverallPass,
  reviewerEffectivePass,
  type EditorialFeedback,
  type EditorialResult,
  type EditorialReviewerName,
  type ReviewScope,
} from './pipeline.js'

export const ALL_REVIEWER_NAMES = EDITORIAL_REVIEWERS.map(r => r.name)
export const DEFAULT_REVIEWER_NAMES = DEFAULT_MACHINE_REVIEWERS

function isReviewerName(value: unknown): value is EditorialReviewerName {
  return typeof value === 'string' && ALL_REVIEWER_NAMES.includes(value as EditorialReviewerName)
}

function isDefaultReviewerName(value: unknown): value is EditorialReviewerName {
  return typeof value === 'string' && DEFAULT_REVIEWER_NAMES.includes(value as EditorialReviewerName)
}

function failedReviewersFromPrevious(previous: { feedbacks?: EditorialFeedback[] } | undefined): EditorialReviewerName[] {
  if (!previous?.feedbacks) return []
  return previous.feedbacks
    .filter(fb => isDefaultReviewerName(fb.reviewer) && !reviewerEffectivePass(fb))
    .map(fb => fb.reviewer as EditorialReviewerName)
}

export function resolveReviewers(
  scope: ReviewScope,
  requestedReviewers: EditorialReviewerName[] | undefined,
  previous: { feedbacks?: EditorialFeedback[] } | undefined,
): { scope: ReviewScope; reviewers: EditorialReviewerName[] } {
  if (scope === 'targeted') {
    const reviewers = requestedReviewers?.length ? requestedReviewers : []
    return reviewers.length > 0
      ? { scope, reviewers }
      : { scope: 'full', reviewers: DEFAULT_REVIEWER_NAMES }
  }

  if (scope === 'failed_only') {
    const reviewers = failedReviewersFromPrevious(previous)
    return reviewers.length > 0
      ? { scope, reviewers }
      : { scope: 'full', reviewers: DEFAULT_REVIEWER_NAMES }
  }

  return { scope: 'full', reviewers: DEFAULT_REVIEWER_NAMES }
}

export function mergeTargetedReview(
  previous: { feedbacks?: EditorialFeedback[] } | undefined,
  current: EditorialResult,
  reviewedReviewers: EditorialReviewerName[],
  scope: ReviewScope,
): EditorialResult {
  if (scope === 'full') {
    return {
      ...current,
      overall_pass: computeOverallPass(current.feedbacks) && current.feedbacks.length === DEFAULT_REVIEWER_NAMES.length,
      review_scope: 'full',
      reviewed_reviewers: reviewedReviewers,
      carried_forward_reviewers: [],
    }
  }

  const byReviewer = new Map<EditorialReviewerName, EditorialFeedback>()
  for (const fb of previous?.feedbacks ?? []) {
    if (isReviewerName(fb.reviewer)) byReviewer.set(fb.reviewer, fb)
  }
  for (const fb of current.feedbacks) {
    if (isReviewerName(fb.reviewer)) byReviewer.set(fb.reviewer, fb)
  }

  const expectedReviewers = scope === 'targeted' ? ALL_REVIEWER_NAMES : DEFAULT_REVIEWER_NAMES
  const feedbacks = expectedReviewers
    .map(name => byReviewer.get(name))
    .filter((fb): fb is EditorialFeedback => Boolean(fb))

  const complete = feedbacks.length === expectedReviewers.length
  const carried = expectedReviewers.filter(name => !reviewedReviewers.includes(name) && byReviewer.has(name))

  return {
    overall_pass: complete && computeOverallPass(feedbacks),
    feedbacks,
    merged_summary: buildMergedSummary(feedbacks),
    revision_strategy: buildRevisionStrategy(feedbacks),
    review_scope: scope,
    reviewed_reviewers: reviewedReviewers,
    carried_forward_reviewers: carried,
  }
}
