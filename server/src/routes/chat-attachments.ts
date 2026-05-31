export interface ChatAttachment {
  name: string
  size: number
  content: string
  type?: string
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderUserMessageForModel(message: string, attachments: ChatAttachment[] = []): string {
  const visibleMessage = String(message ?? '').trim()
  if (attachments.length === 0) return visibleMessage

  const renderedFiles = attachments.map((attachment, index) => {
    const name = escapeAttr(attachment.name)
    const type = escapeAttr(attachment.type ?? '')
    const size = Math.max(0, Math.trunc(Number(attachment.size) || 0))
    return [
      `<file index="${index + 1}" name="${name}" type="${type}" size_bytes="${size}">`,
      String(attachment.content ?? ''),
      '</file>',
    ].join('\n')
  }).join('\n\n')

  const fileBlock = [
    `<uploaded_files count="${attachments.length}">`,
    renderedFiles,
    '</uploaded_files>',
  ].join('\n')

  return visibleMessage
    ? `${visibleMessage}\n\n${fileBlock}`
    : fileBlock
}

export function summarizeAttachmentsForCheckpoint(message: string, attachments: ChatAttachment[] = []): string {
  const visibleMessage = String(message ?? '').trim()
  if (visibleMessage) return visibleMessage
  if (attachments.length === 0) return ''
  const names = attachments.slice(0, 5).map(attachment => attachment.name).join(', ')
  const suffix = attachments.length > 5 ? ` 等 ${attachments.length} 个文件` : ''
  return `上传了 ${attachments.length} 个文件：${names}${suffix}`
}
