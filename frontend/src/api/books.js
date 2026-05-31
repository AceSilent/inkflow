export function bookResourcePath(bookId) {
  return `/api/v1/books/${encodeURIComponent(bookId)}`
}
