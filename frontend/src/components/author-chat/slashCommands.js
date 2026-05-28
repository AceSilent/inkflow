export function parseSlashCommand(input) {
  const text = String(input || '').trim()
  if (text === '/compact') return { type: 'compact' }
  if (text === '/clear') return { type: 'clear' }
  if (text.startsWith('/remember ')) {
    return { type: 'remember', text: text.slice('/remember '.length).trim() }
  }
  return null
}
