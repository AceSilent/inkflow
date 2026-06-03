const DEFAULT_MAX_FRAME_CHARS = 12

function normalizeText(value) {
  return typeof value === 'string' ? value : ''
}

export function nextTypewriterFrame(currentText, targetText, maxFrameChars = DEFAULT_MAX_FRAME_CHARS) {
  const current = normalizeText(currentText)
  const target = normalizeText(targetText)

  if (current === target) return target
  if (!target.startsWith(current)) return target

  const remaining = target.length - current.length
  const frame = Math.max(1, Math.min(maxFrameChars, Math.ceil(remaining * 0.22)))
  return target.slice(0, current.length + frame)
}

export function latestStreamingContentTarget(segments = []) {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]
    if (segment?.type === 'content' && segment.streaming) {
      return normalizeText(segment.text)
    }
  }
  return ''
}

export function applyStreamingPreview(segments = [], previewText = '') {
  let activeIndex = -1
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]
    if (segment?.type === 'content' && segment.streaming) {
      activeIndex = i
      break
    }
  }

  if (activeIndex < 0) return segments

  return segments.map((segment, index) => (
    index === activeIndex
      ? { ...segment, text: normalizeText(previewText) }
      : segment
  ))
}
