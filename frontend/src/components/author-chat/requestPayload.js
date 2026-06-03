import { normalizeChatMode } from './chatModes'

export function buildAuthorChatRequestBody({ message, attachments = [], mode, replaceMessageId }) {
  return {
    message,
    mode: normalizeChatMode(mode),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(replaceMessageId ? { replace_message_id: replaceMessageId } : {}),
  }
}
