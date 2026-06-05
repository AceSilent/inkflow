import { type ModelMessage } from 'ai'
import { type AssistantSegment } from './stream-segments.js'
import { saveHistory, type ChatHistoryMessage } from './chat-history.js'
import { type ChatAttachment } from './chat-attachments.js'

export type AuthorChatTurnStatus = 'incomplete' | 'aborted'
export const TRANSIENT_WORKBENCH_STATE_HEADING = '# 最近工作台状态'

const RECENT_OBSERVATION_TOOLS = new Set([
  'read_file',
  'read_outline',
  'read_graph',
  'search_lore',
  'query_unresolved_setups',
  'browse_examples',
  'list_files',
  'load_skill',
])

export interface PersistAuthorChatTurnInput {
  dataDir: string
  bookId: string
  history: ChatHistoryMessage[]
  message: string
  attachments?: ChatAttachment[]
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
  if (input.attachments && input.attachments.length > 0) {
    userMsg.attachments = input.attachments
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

function observationLabel(segment: Extract<AssistantSegment, { type: 'tool_call' }>): string {
  const raw = segment.argsPreview ?? ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const value = parsed.relative_path
      ?? parsed.file_path
      ?? parsed.path
      ?? parsed.chapter_id
      ?? parsed.chapterId
      ?? parsed.name
      ?? parsed.query
    if (typeof value === 'string' && value.trim()) return value.trim()
  } catch {
    // Fall through to the raw preview.
  }
  return raw.slice(0, 120)
}

export function renderRecentToolObservationsForPrompt(
  history: ChatHistoryMessage[],
  limit = 5,
): string {
  const observations: string[] = []

  for (let i = history.length - 1; i >= 0 && observations.length < limit; i--) {
    const message = history[i] as ChatHistoryMessage & { segments?: AssistantSegment[] }
    if (message.role !== 'assistant' || !Array.isArray(message.segments)) continue

    for (let j = message.segments.length - 1; j >= 0 && observations.length < limit; j--) {
      const segment = message.segments[j]
      if (segment.type !== 'tool_call') continue
      if (!RECENT_OBSERVATION_TOOLS.has(segment.name)) continue
      if (segment.status !== 'done') continue

      const label = observationLabel(segment)
      const result = (segment.result ?? '').replace(/\s+/g, ' ').slice(0, 700)
      observations.push(`- ${segment.name}${label ? `(${label})` : ''}${result ? `：${result}` : ''}`)
    }
  }

  if (observations.length === 0) return ''
  return [
    '以下是对话历史中已有的近期工具观察摘要，不是新的长期记忆。若用户继续围绕这些材料讨论，可先结合这些摘要和当前上下文；需要逐字核对、文件可能变化或用户明确要求时，再读取原文。',
    '',
    ...observations.reverse(),
  ].join('\n')
}

export function buildTransientWorkbenchStateMessages(recentObservations: string): ModelMessage[] {
  const trimmed = recentObservations.trim()
  if (!trimmed) return []
  return [{ role: 'system', content: `${TRANSIENT_WORKBENCH_STATE_HEADING}\n${trimmed}` }]
}

export function stripTransientWorkbenchStateMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.filter((message) => {
    if (message.role !== 'system') return true
    if (typeof message.content !== 'string') return true
    return !message.content.startsWith(TRANSIENT_WORKBENCH_STATE_HEADING)
  })
}
