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
