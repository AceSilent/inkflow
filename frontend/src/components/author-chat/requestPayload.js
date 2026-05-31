import { normalizeChatMode } from './chatModes'

export function buildAuthorChatRequestBody({ message, mode, replaceMessageId }) {
  return {
    message,
    mode: normalizeChatMode(mode),
    ...(replaceMessageId ? { replace_message_id: replaceMessageId } : {}),
  }
}

