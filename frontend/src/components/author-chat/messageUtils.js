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

const USER_MESSAGE_PREVIEW_CHARS = 6000

export function restoreChatMessages(rawMessages = []) {
  return rawMessages.map((message, index) => {
    const id = message.id || Date.now() + index
    const restored = { ...message, id }
    if (message.role === 'user') {
      const normalizedAttachments = normalizeMessageAttachments(message.attachments)
      if (normalizedAttachments.length > 0) {
        restored.attachments = normalizedAttachments
      }
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
    .map(message => String(message.content ?? ''))
}

export function editableUserMessageContent(message) {
  if (!message?.content) return ''
  return String(message.content ?? '')
}

export function visibleUserMessageContent(message) {
  if (!message?.content) return ''
  const raw = String(message.content ?? '')
  if (raw.length <= USER_MESSAGE_PREVIEW_CHARS) return raw

  const omitted = raw.length - USER_MESSAGE_PREVIEW_CHARS
  return `${raw.slice(0, USER_MESSAGE_PREVIEW_CHARS).trimEnd()}\n\n…已省略 ${omitted} 字，完整内容已发送给 Agent。`
}

export function messageDisplayParts(message = {}) {
  return {
    text: String(message?.content ?? ''),
    attachments: normalizeMessageAttachments(message?.attachments),
  }
}

export function normalizeMessageAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return []
  return attachments
    .filter(attachment => attachment && typeof attachment === 'object')
    .map((attachment, index) => {
      const name = String(attachment.name || `file-${index + 1}`).trim() || `file-${index + 1}`
      const content = String(attachment.content ?? '')
      const size = Number.isFinite(Number(attachment.size)) ? Math.max(0, Number(attachment.size)) : content.length
      return {
        name,
        content,
        size,
        type: String(attachment.type || ''),
        sizeLabel: formatAttachmentSize(size),
        language: languageForAttachmentName(name),
        lineCount: content ? content.split(/\r?\n/).length : 0,
      }
    })
}

export function formatAttachmentSize(size = 0) {
  const bytes = Math.max(0, Number(size) || 0)
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function languageForAttachmentName(name = '') {
  const ext = String(name).split('.').pop()?.toLowerCase() || ''
  const map = {
    md: 'markdown',
    markdown: 'markdown',
    txt: 'text',
    text: 'text',
    log: 'text',
    py: 'python',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    jsonl: 'json',
    csv: 'csv',
    html: 'html',
    htm: 'html',
    css: 'css',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    toml: 'toml',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
  }
  return map[ext] || 'text'
}

export function persistDraftInput(store, key, value) {
  if (!store || !key) return false
  try {
    if (value) store.setItem(key, value)
    else store.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function restoreDraftInput(store, key) {
  if (!store || !key) return ''
  try {
    return store.getItem(key) || ''
  } catch {
    return ''
  }
}

export function truncateMessagesBeforeCheckpoint(messages, messageId) {
  const index = messages.findIndex(message => message.id === messageId)
  if (index < 0) return messages
  return messages.slice(0, index)
}

export function isCheckpointEditorActiveForMessage(checkpointEditor, message) {
  return Boolean(checkpointEditor?.messageId && message?.id && checkpointEditor.messageId === message.id)
}
