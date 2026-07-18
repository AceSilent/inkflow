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
