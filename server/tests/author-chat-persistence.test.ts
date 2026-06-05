import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildTransientWorkbenchStateMessages, persistAuthorChatTurn, prepareHistoryForAuthorChatSend, renderRecentToolObservationsForPrompt, stripTransientWorkbenchStateMessages } from '../src/routes/author-chat-persistence.js'
import { loadHistoryFull } from '../src/routes/chat-history.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'author-chat-persist-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('author chat persistence', () => {
  it('persists an incomplete turn with the user message id and checkpoint id even without assistant output', () => {
    persistAuthorChatTurn({
      dataDir: tmpDir,
      bookId: 'book-1',
      history: [{ role: 'system', content: 'compacted summary' }],
      message: '写下一段',
      messageId: 'm1',
      checkpointId: 'snap_1',
      status: 'incomplete',
    })

    expect(loadHistoryFull(tmpDir, 'book-1')).toEqual([
      { role: 'system', content: 'compacted summary' },
      { role: 'user', content: '写下一段', id: 'm1', checkpoint_id: 'snap_1', status: 'incomplete' },
      { role: 'assistant', content: '(Author Agent 没有生成回复)', status: 'incomplete' },
    ])
  })

  it('persists assistant thinking and segments on normal completion', () => {
    persistAuthorChatTurn({
      dataDir: tmpDir,
      bookId: 'book-1',
      history: [],
      message: '继续',
      messageId: 'm2',
      checkpointId: 'snap_2',
      assistant: {
        content: '正文',
        thinking: '思考',
        segments: [{ type: 'content', text: '正文' }],
      },
    })

    expect(loadHistoryFull(tmpDir, 'book-1')).toEqual([
      { role: 'user', content: '继续', id: 'm2', checkpoint_id: 'snap_2' },
      { role: 'assistant', content: '正文', thinking: '思考', segments: [{ type: 'content', text: '正文' }] },
    ])
  })

  it('persists structured user attachments beside the visible message', () => {
    persistAuthorChatTurn({
      dataDir: tmpDir,
      bookId: 'book-1',
      history: [],
      message: '请读',
      messageId: 'm3',
      attachments: [{ name: 'outline.md', size: 128, type: 'text/markdown', content: '# 大纲' }],
      assistant: { content: '已读取' },
    })

    expect(loadHistoryFull(tmpDir, 'book-1')[0]).toEqual({
      role: 'user',
      content: '请读',
      id: 'm3',
      attachments: [{ name: 'outline.md', size: 128, type: 'text/markdown', content: '# 大纲' }],
    })
  })

  it('removes the restored user message before resending from an edited checkpoint', () => {
    const history = [
      { role: 'system' as const, content: 'compacted summary' },
      { role: 'user' as const, content: 'original', id: 'm1', checkpoint_id: 'snap_1' },
    ]

    expect(prepareHistoryForAuthorChatSend(history, 'm1')).toEqual([
      { role: 'system', content: 'compacted summary' },
    ])
  })

  it('rejects resend replacement ids unless the restored user message is last', () => {
    const history = [
      { role: 'user' as const, content: 'original', id: 'm1', checkpoint_id: 'snap_1' },
      { role: 'assistant' as const, content: 'reply' },
    ]

    expect(() => prepareHistoryForAuthorChatSend(history, 'm1')).toThrow('restored user message')
  })

  it('derives recent tool observations from persisted assistant segments', () => {
    const prompt = renderRecentToolObservationsForPrompt([
      {
        role: 'assistant',
        content: '我看过了。',
        segments: [
          {
            type: 'tool_call',
            name: 'read_file',
            status: 'done',
            argsPreview: '{"relative_path":"04_Drafts/ch01.md"}',
            result: '尸体倒在泥水里，双手交叠在胸前。',
          },
        ],
      } as any,
    ])

    expect(prompt).toContain('对话历史中已有')
    expect(prompt).toContain('不是新的长期记忆')
    expect(prompt).toContain('read_file(04_Drafts/ch01.md)')
    expect(prompt).toContain('尸体倒在泥水里')
  })

  it('keeps transient workbench state out of memory extraction history', () => {
    const workbench = buildTransientWorkbenchStateMessages('刚读过 04_Drafts/ch01.md')
    const messages = [
      { role: 'user' as const, content: '刚才那段不满意' },
      ...workbench,
      { role: 'assistant' as const, content: '我会按刚才读过的版本继续讨论。' },
    ]

    expect(stripTransientWorkbenchStateMessages(messages as any)).toEqual([
      { role: 'user', content: '刚才那段不满意' },
      { role: 'assistant', content: '我会按刚才读过的版本继续讨论。' },
    ])
  })
})
