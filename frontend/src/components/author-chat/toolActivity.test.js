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
        kind: 'read',
        segments: [
          { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"agent-loop.ts"}' },
          { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"package.json"}' },
        ],
      },
      { type: 'content', text: '看完了。' },
      {
        type: 'tool_group',
        kind: 'edit',
        segments: [
          { type: 'tool_call', name: 'save_draft', argsPreview: '{"file_path":"04_Drafts/ch01.md"}' },
        ],
      },
    ])
  })

  it('splits consecutive tool groups by activity kind', () => {
    const grouped = groupAssistantSegments([
      { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"outline.md"}' },
      { type: 'tool_call', name: 'save_outline', argsPreview: '{"file_path":"outline.md"}' },
      { type: 'tool_call', name: 'save_draft', argsPreview: '{"file_path":"ch01.md"}' },
      { type: 'tool_call', name: 'terminal', argsPreview: '{}' },
    ])

    expect(grouped.map(group => group.kind)).toEqual(['read', 'edit', 'call'])
    expect(grouped[1].segments).toHaveLength(2)
  })

  it('hides internal skill orchestration from the user-visible activity feed', () => {
    const grouped = groupAssistantSegments([
      { type: 'tool_call', name: 'list_skills', argsPreview: '{}' },
      { type: 'tool_call', name: 'load_skill', argsPreview: '{"skill_name":"chapter_edit"}' },
      { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"ch01.md"}' },
      { type: 'content', text: '改好了。' },
    ])

    expect(grouped).toEqual([
      {
        type: 'tool_group',
        kind: 'read',
        segments: [
          { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"ch01.md"}' },
        ],
      },
      { type: 'content', text: '改好了。' },
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

  it('names a single chapter read instead of reporting an anonymous file count', () => {
    const t = key => key === 'authorChat.toolReadDocument' ? '已阅读《{name}》' : key
    expect(toolActivitySummary([
      { type: 'tool_call', name: 'read_file', argsPreview: '{"relative_path":"04_Drafts/第十七章 · 低吟.md"}' },
    ], t)).toBe('已阅读《第十七章 · 低吟》')
  })

  it('distinguishes browsing the catalog from reading an exemplar chapter', () => {
    const t = key => key === 'authorChat.toolStudiedExemplar' ? '已研读范文《{name}》' : key
    expect(toolActivitySummary([
      {
        type: 'tool_call',
        name: 'read_exemplar_chapter',
        argsPreview: '{"id":"seventy-two-transformations-134"}',
      },
    ], t)).toBe('已研读范文《seventy-two-transformations-134》')

    expect(toolActivityLine({
      name: 'browse_examples',
      argsPreview: '{"query":"办公室 等待 疲惫"}',
    })).toBe('Browse 办公室 等待 疲惫')

    expect(toolActivityLine({
      name: 'browse_examples',
      argsPreview: '{"scope":"library","genre":"仙侠"}',
    })).toBe('Browse 仙侠')
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
