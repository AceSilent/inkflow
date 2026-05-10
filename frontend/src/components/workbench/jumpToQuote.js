function normalized(value) {
  return value.replace(/\s+/g, '')
}

function clearRangeRings() {
  document.querySelectorAll('.workbench-range-ring').forEach(el => el.remove())
}

function buildTextMap(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('.annotation-popover')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const charMap = []
  let fullText = ''
  let node
  while ((node = walker.nextNode())) {
    const text = node.nodeValue || ''
    for (let i = 0; i < text.length; i += 1) {
      if (/\s/.test(text[i])) continue
      charMap.push({ node, offset: i })
      fullText += text[i]
    }
  }
  return { charMap, fullText }
}

function buildQuoteCandidates(quote) {
  return [
    quote,
    ...quote.split(/\.{3,}|…+/).map(s => s.trim()).filter(s => s.length >= 8),
  ]
    .map(normalized)
    .filter(Boolean)
}

function findQuoteRange(root, quote) {
  const { charMap, fullText } = buildTextMap(root)
  for (const candidate of buildQuoteCandidates(quote)) {
    const start = fullText.indexOf(candidate)
    if (start < 0) continue
    const first = charMap[start]
    const last = charMap[start + candidate.length - 1]
    if (!first || !last) return null
    const range = document.createRange()
    range.setStart(first.node, first.offset)
    range.setEnd(last.node, last.offset + 1)
    return range
  }
  return null
}

function attachRangeHighlight(range, cleanupRef) {
  const drawRings = () => {
    clearRangeRings()
    for (const rect of range.getClientRects()) {
      if (rect.width < 2 || rect.height < 2) continue
      const ring = document.createElement('div')
      ring.className = 'workbench-range-ring'
      ring.style.left = `${rect.left - 3}px`
      ring.style.top = `${rect.top - 3}px`
      ring.style.width = `${rect.width + 6}px`
      ring.style.height = `${rect.height + 6}px`
      document.body.appendChild(ring)
    }
  }

  requestAnimationFrame(() => requestAnimationFrame(drawRings))

  const clear = () => {
    clearRangeRings()
    window.removeEventListener('scroll', drawRings, true)
    window.removeEventListener('resize', drawRings)
  }
  window.addEventListener('scroll', drawRings, true)
  window.addEventListener('resize', drawRings)
  cleanupRef.current = clear
  window.setTimeout(clear, 5200)
}

function jumpToContainingParagraph(root, quote) {
  const quoteText = normalized(quote)
  const paragraphWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = paragraphWalker.nextNode())) {
    const text = node.nodeValue || ''
    if (!normalized(text).includes(quoteText)) continue
    const parent = node.parentElement
    if (!parent) break
    parent.scrollIntoView({ behavior: 'auto', block: 'center' })
    parent.classList.add('workbench-jump-highlight')
    window.setTimeout(() => parent.classList.remove('workbench-jump-highlight'), 2600)
    return true
  }
  return false
}

export function jumpToQuote(quote, { cleanupRef, addToast, rootSelector = '.workbench-editor' }) {
  if (!quote) return
  const root = document.querySelector(rootSelector)
  if (!root) return

  cleanupRef.current?.()
  cleanupRef.current = null
  root.querySelectorAll('.workbench-jump-highlight').forEach(el => {
    el.classList.remove('workbench-jump-highlight')
  })
  clearRangeRings()

  const range = findQuoteRange(root, quote)
  if (range) {
    const targetElement = range.commonAncestorContainer.parentElement
    targetElement?.scrollIntoView({ behavior: 'auto', block: 'center' })
    attachRangeHighlight(range, cleanupRef)
    addToast?.('已定位并高亮原文', 'success')
    return
  }

  if (jumpToContainingParagraph(root, quote)) {
    addToast?.('已定位到原文所在段落', 'success')
    return
  }

  try {
    if (window.find?.(quote)) return
  } catch {
    // window.find is browser-specific and may throw when unavailable.
  }
  addToast?.('没有精确定位到原文，可能是段落已被修改', 'warning')
}
