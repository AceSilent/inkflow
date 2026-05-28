import { describe, expect, it } from 'vitest'
import { editableUserMessageContent, truncateMessagesBeforeCheckpoint } from './messageUtils'

describe('author chat message utils', () => {
  it('extracts the editable prompt from attachment messages', () => {
    expect(editableUserMessageContent({
      role: 'user',
      content: '改写第一章\n\n--- 附件: notes.md (1.0KB) ---\nnotes',
      hasAttachments: true,
    })).toBe('改写第一章')
  })

  it('truncates visible messages before a checkpoint target before resending', () => {
    const messages = [
      { role: 'user', id: 'm1', content: 'first' },
      { role: 'assistant', id: 'a1', content: 'reply' },
      { role: 'user', id: 'm2', content: 'later' },
    ]

    expect(truncateMessagesBeforeCheckpoint(messages, 'm2')).toEqual([
      { role: 'user', id: 'm1', content: 'first' },
      { role: 'assistant', id: 'a1', content: 'reply' },
    ])
  })
})
