export function isChapterAskForBook(request, book) {
  const requestBookId = String(request?.bookId || '')
  const currentBookId = String(
    typeof book === 'string' ? book : (book?.book_id || book?.id || '')
  )
  return Boolean(requestBookId && currentBookId && requestBookId === currentBookId)
}

export function clearConsumedChapterAsk(currentRequest, consumedId) {
  return currentRequest?.id === consumedId ? null : currentRequest
}

export function shouldDeferChapterAsk(request, authorBusy) {
  return Boolean(authorBusy && request?.autoSend)
}

export function annotationStatusAfterChapterAsk(outcome) {
  return outcome?.toolsUsed?.includes('save_draft') ? 'resolved' : 'open'
}
