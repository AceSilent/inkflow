export function createBookId(title, now = Date.now()) {
  return `${title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'untitled'}_${now.toString(36)}`
}

export async function createBookFromDraft(draft) {
  const title = draft?.title?.trim()
  if (!title) throw new Error('missing title')

  const body = {
    book_id: createBookId(title),
    title,
    genre: 'unspecified',
    tone: 'unspecified',
    concept: draft?.concept?.trim() || '',
    target_words: draft?.targetWords || 500000,
  }

  const res = await fetch('/api/v1/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.detail || 'create book failed')
  return data
}
