import { describe, it, expect } from 'vitest'
import { parseMarkdownMemory, serializeMarkdownMemory, type MemoryFrontmatter } from '../src/memory/markdown-io.js'

describe('parseMarkdownMemory', () => {
  it('parses frontmatter + body', () => {
    const raw = `---
id: mem_abc
scope: user
type: preference
confidence: 0.85
tags: [prose-style, avoid]
source: auto_extract
status: pending
created_at: 2026-04-18T12:34:56Z
---

# 反感 AI 套语

用户说过讨厌"狂风暴雨"这类套句。`
    const { frontmatter, body } = parseMarkdownMemory(raw)
    expect(frontmatter.id).toBe('mem_abc')
    expect(frontmatter.scope).toBe('user')
    expect(frontmatter.confidence).toBe(0.85)
    expect(frontmatter.tags).toEqual(['prose-style', 'avoid'])
    expect(body).toContain('反感 AI 套语')
  })

  it('returns null frontmatter for missing frontmatter block', () => {
    expect(parseMarkdownMemory('no frontmatter').frontmatter).toBeNull()
  })

  it('serializes frontmatter + body round-trip', () => {
    const fm: MemoryFrontmatter = {
      id: 'mem_x', scope: 'book', type: 'plot_note',
      confidence: 0.9, tags: ['plot-rule'],
      source: 'user_remember', status: 'active',
      created_at: '2026-04-18T12:00:00Z',
      book_id: 'book1',
    }
    const out = serializeMarkdownMemory(fm, '# Title\n\nbody text')
    const { frontmatter: parsed, body } = parseMarkdownMemory(out)
    expect(parsed).toEqual(fm)
    expect(body).toContain('body text')
  })

  it('handles missing optional fields gracefully', () => {
    const raw = `---
id: mem_y
scope: session
type: compact_summary
confidence: 0.7
tags: []
source: context_compact
status: active
created_at: 2026-04-18T00:00:00Z
---
body`
    const { frontmatter } = parseMarkdownMemory(raw)
    expect(frontmatter?.book_id).toBeUndefined()
    expect(frontmatter?.approved_at).toBeUndefined()
  })
})
