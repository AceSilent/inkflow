export function normalizeReviewPayload(review) {
  if (!review) return null
  const feedbacks = review.feedbacks ?? []
  const hasPersistedReviewSignal =
    typeof review.overall_pass === 'boolean' ||
    review.merged_summary ||
    review.revision_strategy ||
    review.revision_round ||
    feedbacks.length > 0
  return hasPersistedReviewSignal ? review : null
}
