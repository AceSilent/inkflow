import { describe, expect, it } from 'vitest'
import {
  editableUserMessageContent,
  persistDraftInput,
  restoreDraftInput,
  truncateMessagesBeforeCheckpoint,
  visibleUserMessageContent,
} from './messageUtils'

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

  it('uses a bounded preview for long pasted user documents', () => {
    const longDocument = `开头\n${'正文段落。'.repeat(3000)}\n结尾`
    const visible = visibleUserMessageContent({ role: 'user', content: longDocument })

    expect(visible.length).toBeLessThan(longDocument.length)
    expect(visible).toContain('开头')
    expect(visible).toContain('已省略')
    expect(visible).not.toContain('结尾')
  })

  it('does not throw when draft persistence storage is unavailable', () => {
    const brokenStore = {
      getItem: () => { throw new Error('storage blocked') },
      setItem: () => { throw new Error('quota exceeded') },
      removeItem: () => { throw new Error('storage blocked') },
    }

    expect(() => persistDraftInput(brokenStore, 'draft-key', 'x'.repeat(100))).not.toThrow()
    expect(() => persistDraftInput(brokenStore, 'draft-key', '')).not.toThrow()
    expect(restoreDraftInput(brokenStore, 'draft-key')).toBe('')
  })
})
