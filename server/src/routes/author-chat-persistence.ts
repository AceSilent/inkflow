import { type ModelMessage } from 'ai'
import { type AssistantSegment } from './stream-segments.js'
import { saveHistory, type ChatHistoryMessage } from './chat-history.js'

export type AuthorChatTurnStatus = 'incomplete' | 'aborted'

export interface PersistAuthorChatTurnInput {
  dataDir: string
  bookId: string
  history: ChatHistoryMessage[]
  message: string
  messageId: string
  checkpointId?: string
  status?: AuthorChatTurnStatus
  assistant?: {
    content?: string
    thinking?: string
    segments?: AssistantSegment[]
  }
}

export function prepareHistoryForAuthorChatSend(
  history: ChatHistoryMessage[],
  replaceMessageId?: string,
): ChatHistoryMessage[] {
  if (!replaceMessageId) return history
  const last = history[history.length - 1]
  if (!last || last.role !== 'user' || last.id !== replaceMessageId) {
    throw new Error(`Cannot resend from checkpoint: restored user message '${replaceMessageId}' is not the latest history entry`)
  }
  return history.slice(0, -1)
}

export function persistAuthorChatTurn(input: PersistAuthorChatTurnInput): void {
  const userMsg: ChatHistoryMessage = {
    role: 'user',
    content: input.message,
    id: input.messageId,
    checkpoint_id: input.checkpointId,
  }
  const assistantMsg: ModelMessage & { thinking?: string; segments?: AssistantSegment[]; status?: string } = {
    role: 'assistant',
    content: input.assistant?.content || '(Author Agent 没有生成回复)',
  }

  if (input.assistant?.thinking) assistantMsg.thinking = input.assistant.thinking
  if (input.assistant?.segments && input.assistant.segments.length > 0) {
    assistantMsg.segments = input.assistant.segments
  }
  if (input.status) {
    userMsg.status = input.status
    assistantMsg.status = input.status
  }

  saveHistory(input.dataDir, input.bookId, [...input.history, userMsg, assistantMsg])
}
