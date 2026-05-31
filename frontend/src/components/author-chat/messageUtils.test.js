import { describe, expect, it } from 'vitest'
import {
  editableUserMessageContent,
  hasAssistantReplyAfterUser,
  isCheckpointEditorActiveForMessage,
  languageForAttachmentName,
  messageDisplayParts,
  persistDraftInput,
  restoreDraftInput,
  truncateMessagesBeforeCheckpoint,
  visibleUserMessageContent,
} from './messageUtils'

describe('author chat message utils', () => {
  it('extracts the editable prompt without attachment payloads', () => {
    expect(editableUserMessageContent({
      role: 'user',
      content: '改写第一章',
      attachments: [{ name: 'notes.md', content: 'notes', size: 1024 }],
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

  it('detects when a failed stream can be recovered from persisted history', () => {
    const messages = [
      { role: 'user', content: '只回复两个字：可用' },
      { role: 'assistant', content: '可用' },
    ]

    expect(hasAssistantReplyAfterUser(messages, '只回复两个字：可用')).toBe(true)
    expect(hasAssistantReplyAfterUser(messages, '另一条消息')).toBe(false)
    expect(hasAssistantReplyAfterUser(null, '只回复两个字：可用')).toBe(false)
  })

  it('does not treat an unsaved optimistic message as checkpoint editing', () => {
    expect(isCheckpointEditorActiveForMessage(null, { role: 'user', content: '刚发送' })).toBe(false)
    expect(isCheckpointEditorActiveForMessage({ messageId: 'm1' }, { role: 'user', id: undefined, content: '刚发送' })).toBe(false)
    expect(isCheckpointEditorActiveForMessage({ messageId: 'm1' }, { role: 'user', id: 'm1', content: '历史消息' })).toBe(true)
  })

  it('uses a bounded preview for long pasted user documents', () => {
    const longDocument = `开头\n${'正文段落。'.repeat(3000)}\n结尾`
    const visible = visibleUserMessageContent({ role: 'user', content: longDocument })

    expect(visible.length).toBeLessThan(longDocument.length)
    expect(visible).toContain('开头')
    expect(visible).toContain('已省略')
    expect(visible).not.toContain('结尾')
  })

  it('normalizes multiple uploaded documents as separate attachment blocks', () => {
    const parsed = messageDisplayParts({
      role: 'user',
      content: '请阅读这些资料',
      attachments: [
        { name: 'outline.md', size: 1280, content: '# 第一章\n主角进入雾港。', type: 'text/markdown' },
        { name: 'tools.py', size: 410, content: 'def hello():\n    return "world"', type: 'text/x-python' },
      ],
    })

    expect(parsed.text).toBe('请阅读这些资料')
    expect(parsed.attachments).toHaveLength(2)
    expect(parsed.attachments[0]).toMatchObject({
      name: 'outline.md',
      sizeLabel: '1.3KB',
      language: 'markdown',
      content: '# 第一章\n主角进入雾港。',
    })
    expect(parsed.attachments[1]).toMatchObject({
      name: 'tools.py',
      sizeLabel: '0.4KB',
      language: 'python',
      content: 'def hello():\n    return "world"',
    })
  })

  it('maps common document extensions to code block languages', () => {
    expect(languageForAttachmentName('chapter.md')).toBe('markdown')
    expect(languageForAttachmentName('notes.txt')).toBe('text')
    expect(languageForAttachmentName('script.py')).toBe('python')
    expect(languageForAttachmentName('data.json')).toBe('json')
    expect(languageForAttachmentName('ui.jsx')).toBe('javascript')
    expect(languageForAttachmentName('unknown.asset')).toBe('text')
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
