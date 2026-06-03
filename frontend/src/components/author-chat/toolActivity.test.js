import { describe, expect, it } from 'vitest'
import {
  groupAssistantSegments,
  toolActivityLine,
  toolActivitySummary,
} from './toolActivity'

describe('tool activity presentation', () => {
  it('groups consecutive tool calls while preserving message order', () => {
    const grouped = groupAssistantSegments([
      { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"agent-loop.ts"}' },
      { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"package.json"}' },
      { type: 'content', text: '看完了。' },
      { type: 'tool_call', name: 'save_draft', argsPreview: '{"file_path":"04_Drafts/ch01.md"}' },
    ])

    expect(grouped).toEqual([
      {
        type: 'tool_group',
        segments: [
          { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"agent-loop.ts"}' },
          { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"package.json"}' },
        ],
      },
      { type: 'content', text: '看完了。' },
      {
        type: 'tool_group',
        segments: [
          { type: 'tool_call', name: 'save_draft', argsPreview: '{"file_path":"04_Drafts/ch01.md"}' },
        ],
      },
    ])
  })

  it('summarizes read and edit groups in a compact Chinese label', () => {
    expect(toolActivitySummary([
      { type: 'tool_call', name: 'read_file' },
      { type: 'tool_call', name: 'list_files' },
      { type: 'tool_call', name: 'read_outline' },
    ])).toBe('已探索 3 个文件')

    expect(toolActivitySummary([
      { type: 'tool_call', name: 'save_draft' },
      { type: 'tool_call', name: 'create_book' },
    ])).toBe('已编辑 2 个文件')

    expect(toolActivitySummary([
      { type: 'tool_call', name: 'read_file' },
      { type: 'tool_call', name: 'save_draft' },
    ])).toBe('已调用 2 个工具')
  })

  it('extracts readable activity lines from tool arguments', () => {
    expect(toolActivityLine({
      name: 'read_file',
      argsPreview: '{"relative_path":"server/src/agent-loop.ts"}',
    })).toBe('Read agent-loop.ts')

    expect(toolActivityLine({
      name: 'save_draft',
      argsPreview: '{"file_path":"04_Drafts/ch01.md"}',
    })).toBe('Edited ch01.md')
  })
})
