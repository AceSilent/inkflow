export const DEFAULT_CHAPTER_ASK_COMMENT = '请看看这段文字，指出问题并给出修改建议。'

export function normalizeChapterAskComment(comment) {
  const trimmed = String(comment ?? '').trim()
  return trimmed || DEFAULT_CHAPTER_ASK_COMMENT
}

function quoteBlock(text) {
  return String(text ?? '')
    .trim()
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')
}

export function buildChapterAskMessage({
  chapterId,
  chapterTitle,
  selectedText,
  question,
}) {
  const title = String(chapterTitle || '未命名章节').trim()
  const id = String(chapterId || '').trim()
  const heading = id ? `${title}（${id}）` : title
  const normalizedQuestion = normalizeChapterAskComment(question)

  return [
    '我想和你讨论当前章节里选中的一段文字。',
    `章节：${heading}`,
    '',
    quoteBlock(selectedText),
    '',
    `我的问题：${normalizedQuestion}`,
    '',
    '先讨论，不要直接改稿或保存；除非我明确要求你落盘修改。',
  ].join('\n')
}
