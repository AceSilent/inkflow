export const DATA_MUTATING_TOOLS = new Set([
  'save_lore',
  'save_outline',
  'save_draft',
  'analyze_style_profile',
  'add_plot_node',
  'add_edge',
  'remove_edge',
  'confirm_path',
  'prune_branch',
  'merge_branches',
  'submit_to_editorial',
])

export function restoreChatMessages(rawMessages = []) {
  return rawMessages.map((message, index) => {
    const id = message.id || Date.now() + index
    const restored = { ...message, id }
    if (message.role === 'user' && message.content?.includes('\n\n--- 附件:')) {
      const parts = message.content.split('\n\n--- 附件:')
      const names = parts.slice(1).map(part => {
        const match = part.match(/^([^\n(]+)/)
        return match ? match[1].trim() : 'file'
      })
      restored.hasAttachments = true
      restored.attachmentNames = names
    }

    if (message.role === 'assistant') {
      let segments = message.segments
      if (!segments) {
        segments = []
        if (message.tool_calls?.length > 0) {
          message.tool_calls.forEach(toolCall => {
            const toolName = typeof toolCall === 'string' ? toolCall : toolCall.name
            segments.push({ type: 'tool_call', name: toolName, status: 'done' })
          })
        }
        if (message.content) segments.push({ type: 'content', text: message.content })
      }
      if (message.thinking && !segments.some(segment => segment.type === 'thinking')) {
        segments = [{ type: 'thinking', text: message.thinking }, ...segments]
      }
      restored.segments = segments
    }

    return restored
  })
}

export function sentHistoryFromMessages(messages) {
  return messages
    .filter(message => message.role === 'user' && message.content)
    .map(message => message.hasAttachments
      ? (message.content.split('\n\n--- 附件:')[0] || '')
      : message.content)
}

export function buildAttachmentMessage(baseInput, attachments, attachmentLabel) {
  const fileParts = attachments.map(attachment =>
    `\n\n--- ${attachmentLabel}: ${attachment.name} (${(attachment.size / 1024).toFixed(1)}KB) ---\n${attachment.content}`
  ).join('')
  return baseInput + fileParts
}
