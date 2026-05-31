import { describe, expect, it } from 'vitest'
import { renderUserMessageForModel, summarizeAttachmentsForCheckpoint } from '../src/routes/chat-attachments.js'

describe('chat attachment model rendering', () => {
  it('renders user text and each uploaded file with stable boundaries', () => {
    const rendered = renderUserMessageForModel('请读取这些资料', [
      { name: 'outline.md', size: 128, type: 'text/markdown', content: '# 大纲' },
      { name: 'script.py', size: 64, type: 'text/x-python', content: 'print("hi")' },
    ])

    expect(rendered).toContain('请读取这些资料')
    expect(rendered).toContain('<uploaded_files count="2">')
    expect(rendered).toContain('<file index="1" name="outline.md" type="text/markdown" size_bytes="128">')
    expect(rendered).toContain('# 大纲')
    expect(rendered).toContain('<file index="2" name="script.py" type="text/x-python" size_bytes="64">')
    expect(rendered).toContain('print("hi")')
  })

  it('supports attachment-only messages', () => {
    const rendered = renderUserMessageForModel('', [
      { name: 'notes.txt', size: 12, content: 'hello' },
    ])

    expect(rendered).not.toContain('用户消息：')
    expect(rendered).toContain('<uploaded_files count="1">')
    expect(rendered).toContain('hello')
  })

  it('summarizes attachments for checkpoints without inlining file bodies', () => {
    expect(summarizeAttachmentsForCheckpoint('', [
      { name: 'outline.md', size: 128, content: '# 大纲' },
      { name: 'script.py', size: 64, content: 'print("hi")' },
    ])).toBe('上传了 2 个文件：outline.md, script.py')
  })
})
