export function normalizeChapterContent(value) {
  return typeof value === 'string' ? value : ''
}

export function isDraftDirty(original, next) {
  return normalizeChapterContent(original) !== normalizeChapterContent(next)
}

export function countCjkAwareWords(text) {
  const source = normalizeChapterContent(text)
  const cjk = source.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const latin = source
    .replace(/[\u3400-\u9fff]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return cjk + latin
}

function normalizeKeyPart(value) {
  return value == null ? '' : String(value)
}

export function chapterWorkspaceKey(bookId, chapterId) {
  return `${normalizeKeyPart(bookId)}:${normalizeKeyPart(chapterId)}`
}

export function shouldPreserveDirtyDraft(previousKey, nextKey, original, draft) {
  return Boolean(previousKey) && previousKey === nextKey && isDraftDirty(original, draft)
}

export function shouldApplyChapterResult(requestKey, currentKey) {
  return Boolean(requestKey) && requestKey === currentKey
}

export function shouldReplaceDraftAfterSave(savedContent, currentDraft) {
  return normalizeChapterContent(savedContent) === normalizeChapterContent(currentDraft)
}

export function canEditLoadedChapter(hasLoaded, loadError) {
  return Boolean(hasLoaded) && !loadError
}
