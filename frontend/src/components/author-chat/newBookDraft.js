const TITLE_PATTERNS = [
  /《([^》]{1,40})》/,
  /"([^"]{1,40})"/,
  /'([^']{1,40})'/,
  /(?:书名|标题)(?:叫|是|为)?[：:\s]*([^\s，。,.!?！？]{1,40})/,
]

function compactTitle(text) {
  return text
    .replace(/[《》"'“”‘’]/g, '')
    .replace(/^(我想|想要|帮我|请你|写一本|写个|创建|新建|一本)/, '')
    .trim()
}

export function deriveNewBookDraftFromPrompt(prompt) {
  const concept = String(prompt || '').trim()
  if (!concept) return { title: '', concept: '' }

  for (const pattern of TITLE_PATTERNS) {
    const match = concept.match(pattern)
    if (match?.[1]) {
      return { title: match[1].trim().slice(0, 40), concept }
    }
  }

  return {
    title: compactTitle(concept).slice(0, 10),
    concept,
  }
}
